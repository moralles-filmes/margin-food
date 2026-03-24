import { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { subMonths, endOfMonth } from 'date-fns';
import { formatInBR, formatDateBR } from '@/lib/datetime';
import { FileDown, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import { exportDemonstrativoPDF, exportDemonstrativoExcel } from '@/lib/exportDemonstrativo';
import { useDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import DemonstrativoTree from './DemonstrativoTree';

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldAlert className="w-10 h-10" />
      <p className="font-medium">Acesso negado</p>
      <p className="text-sm">Você não tem permissão para visualizar o DRE.</p>
    </div>
  );
}

function SkeletonTree() {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: 8 }).map((_, i) => (
        <Skeleton key={i} className="h-8 w-full" />
      ))}
    </div>
  );
}

/** Convert RPC valores_por_categoria map into synthetic lancamentos for DemonstrativoTree */
function valoresMapToLancamentos(valoresMap: Record<string, number>) {
  return Object.entries(valoresMap).map(([catId, total]) => ({
    id: catId,
    categoria_id: catId,
    valor: total,
    tipo: 'VIRTUAL',
    status: 'REALIZADO',
  }));
}

export default function DRESection() {
  const [categorias, setCategorias] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesAtual, setMesAtual] = useState(formatInBR(new Date(), 'yyyy-MM'));

  const canView = useCan('financeiro:dre:view');
  const canExport = useCan('financeiro:dre:export');

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase.rpc('get_fin_dre_summary', { p_mes: mesAtual });

    if (error) {
      toast.error('Erro ao carregar DRE');
      console.error(error);
      setLoading(false);
      return;
    }

    const result = data as { categorias?: typeof categorias; valores_por_categoria?: Record<string, number> } | null;
    setCategorias(result?.categorias || []);
    setLancamentos(valoresMapToLancamentos(result?.valores_por_categoria || {}));
    setLoading(false);
  }, [mesAtual]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:cadastros', load);

  if (!canView) return <NoAccess />;

  const meses = Array.from({ length: 12 }, (_, i) => formatInBR(subMonths(new Date(), i), 'yyyy-MM'));

  const formatMonthLabel = (value: string) => {
    const d = new Date(value + '-01');
    return new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  };

  const exportOpts = {
    categorias,
    lancamentos,
    rateios: [] as { categoria_id: string; valor: number }[],
    titulo: 'DRE — Demonstrativo de Resultado',
    periodo: mesAtual,
    showPctReceita: true,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">DRE — Demonstrativo de Resultado do Exercício</h2>
          <p className="text-sm text-muted-foreground">Apuração por competência • Estrutura do Cadastro Base</p>
        </div>
        <div className="flex gap-2">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => exportDemonstrativoPDF(exportOpts)} disabled={loading}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={() => exportDemonstrativoExcel(exportOpts)} disabled={loading}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Select value={mesAtual} onValueChange={setMesAtual}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {meses.map(m => (
                <SelectItem key={m} value={m}>{formatMonthLabel(m)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {loading ? (
        <SkeletonTree />
      ) : (
        <DemonstrativoTree
          categorias={categorias}
          lancamentos={lancamentos}
          rateios={[]}
          loading={false}
          showPctReceita
        />
      )}
    </div>
  );
}

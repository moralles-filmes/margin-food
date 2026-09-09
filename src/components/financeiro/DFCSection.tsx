import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback } from 'react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Button } from '@/components/ui/button';
import { formatInBR } from '@/lib/formatters';
import { FileDown, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import { exportDemonstrativoPDF, exportDemonstrativoExcel } from '@/lib/exportDemonstrativo';
import { useDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import type { DfcSummary, DfcCategoria } from '@/types/financeiro';
import DemonstrativoTree from './DemonstrativoTree';
import MonthNavigator, { shiftMonth, monthBounds } from './MonthNavigator';

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldAlert className="w-10 h-10" />
      <p className="font-medium">Acesso negado</p>
      <p className="text-sm">Você não tem permissão para visualizar o DFC.</p>
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

// Parse "yyyy-MM" como data LOCAL (não UTC) — ver nota em DRESection/MonthNavigator.
function formatMonthLabelShort(value: string): string {
  const [y, m] = value.split('-').map(Number);
  return formatInBR(new Date(y, m - 1, 1), 'MMM/yy');
}

function valoresMapToLancamentos(valoresMap: Record<string, number>) {
  return Object.entries(valoresMap).map(([catId, total]) => ({
    id: catId,
    categoria_id: catId,
    valor: total,
    tipo: 'VIRTUAL',
    status: 'REALIZADO',
  }));
}

export default function DFCSection() {
  const supabase = useSupabase();
  const [mesAncora, setMesAncora] = useState(() => formatInBR(new Date(), 'yyyy-MM'));
  const [meses, setMeses] = useState('3');
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<DfcCategoria[]>([]);
  const [lancamentos, setLancamentos] = useState<{ id: string; categoria_id: string; valor: number; tipo: string; status: string }[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [periodo, setPeriodo] = useState('');

  const canView = useCan('financeiro:fluxo:view');
  const canExport = useCan('financeiro:fluxo:export');

  const load = useCallback(async () => {
    setLoading(true);
    const m = Number(meses);
    const mesInicio = shiftMonth(mesAncora, -(m - 1));
    const inicio = monthBounds(mesInicio).start;
    const fim = monthBounds(mesAncora).end;

    const startLabel = formatMonthLabelShort(mesInicio);
    const endLabel = formatMonthLabelShort(mesAncora);
    setPeriodo(m === 1 ? endLabel : `${startLabel} — ${endLabel}`);

    const { data, error } = await supabase.rpc('get_fin_dfc_summary', {
      p_inicio: inicio,
      p_fim: fim,
    });

    if (error) {
      toast.error('Erro ao carregar DFC');
      console.error(error);
      setLoading(false);
      return;
    }

    const result = (data as unknown) as DfcSummary | null;
    setCategorias(result?.categorias || []);
    setLancamentos(valoresMapToLancamentos(result?.valores_por_categoria || {}));
    setSaldoInicial(Number(result?.saldo_inicial || 0));
    setLoading(false);
  }, [mesAncora, meses, supabase]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:contas_pagar', load);
  useDataEvent('financeiro:contas_receber', load);
  useDataEvent('financeiro:contas', load);

  if (!canView) return <NoAccess />;

  const exportOpts = {
    categorias,
    lancamentos,
    rateios: [] as { id: string; categoria_id: string; valor: number }[],
    titulo: 'DFC — Demonstração de Fluxo de Caixa',
    periodo,
    isDFC: true,
    saldoInicial,
    showPctReceita: true,
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">DFC — Demonstração de Fluxo de Caixa</h2>
          <p className="text-sm text-muted-foreground">Apuração por caixa (data de pagamento) • {periodo}</p>
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
          <Select value={meses} onValueChange={setMeses}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="1">1 mês</SelectItem>
              <SelectItem value="3">3 meses</SelectItem>
              <SelectItem value="6">6 meses</SelectItem>
              <SelectItem value="12">12 meses</SelectItem>
            </SelectContent>
          </Select>
          <MonthNavigator value={mesAncora} onChange={setMesAncora} />
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
          isDFC
          saldoInicial={saldoInicial}
          showPctReceita
        />
      )}

      <p className="text-[10px] text-muted-foreground">
        * Valores apurados pela data de pagamento efetivo (regime de caixa). Saldo inicial calculado a partir das contas financeiras cadastradas.
      </p>
    </div>
  );
}

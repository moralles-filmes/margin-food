import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { Button } from '@/components/ui/button';
import { formatInBR } from '@/lib/formatters';
import { FileDown, FileSpreadsheet } from 'lucide-react';
import { exportDemonstrativoPDF, exportDemonstrativoExcel } from '@/lib/exportDemonstrativo';
import { useDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions';
import { useScopedToast } from '@/hooks/useScopedToast';
import AccessDenied from '@/components/ui/AccessDenied';
import ErrorState from '@/components/ui/ErrorState';
import DemonstrativoTree from './DemonstrativoTree';
import { shiftMonth, monthBounds } from './MonthNavigator';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { DemonstrativoFiltros } from './analisesParts';

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

// Parse "yyyy-MM" como data LOCAL (não UTC) — `new Date("2026-06-01")` é UTC e
// o Intl formata em BRT (UTC-3), recuando o rótulo um mês (junho vira "maio").
function formatMonthLabelShort(value: string): string {
  const [y, m] = value.split('-').map(Number);
  return formatInBR(new Date(y, m - 1, 1), 'MMM/yy');
}

export default function DRESection() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [categorias, setCategorias] = useState<any[]>([]);
  const [lancamentos, setLancamentos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [mesAncora, setMesAncora] = useState(() => formatInBR(new Date(), 'yyyy-MM'));
  const [meses, setMeses] = useState('1');
  const [periodo, setPeriodo] = useState('');
  // Estado só de apresentação: período dos valores exibidos (última carga bem-sucedida) e falha.
  const [periodoCarregado, setPeriodoCarregado] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const requisicao = useRef(0);

  const canView = useCan('financeiro:dre:view');
  const canExport = useCan('financeiro:dre:export');

  const load = useCallback(async () => {
    const atual = ++requisicao.current;
    setLoading(true);
    const m = Number(meses);
    const mesInicio = shiftMonth(mesAncora, -(m - 1));
    const inicio = monthBounds(mesInicio).start;
    const fim = monthBounds(mesAncora).end;

    const startLabel = formatMonthLabelShort(mesInicio);
    const endLabel = formatMonthLabelShort(mesAncora);
    const label = m === 1 ? endLabel : `${startLabel} — ${endLabel}`;
    setPeriodo(label);

    const { data, error } = await supabase.rpc('get_fin_dre_summary', { p_inicio: inicio, p_fim: fim });
    // Só a resposta mais recente entra na tela (troca rápida de mês ou de quantidade de meses).
    if (atual !== requisicao.current) return;

    if (error) {
      toast.error('Erro ao carregar DRE');
      console.error(error);
      setErro(true);
      setLoading(false);
      return;
    }

    const result = data as { categorias?: typeof categorias; valores_por_categoria?: Record<string, number> } | null;
    setCategorias(result?.categorias || []);
    setLancamentos(valoresMapToLancamentos(result?.valores_por_categoria || {}));
    setPeriodoCarregado(label);
    setErro(false);
    setLoading(false);
  }, [mesAncora, meses, supabase, toast]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:cadastros', load);

  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar o DRE." />;

  const exportOpts = {
    categorias,
    lancamentos,
    rateios: [] as { categoria_id: string; valor: number }[],
    titulo: 'DRE — Demonstrativo de Resultado',
    periodo,
    showPctReceita: true,
  };
  // Com a leitura em andamento ou em erro, o arquivo sairia com o período do filtro sobre outra carga (D43/D59).
  const exportIndisponivel = loading || erro;

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="DRE — Demonstrativo de Resultado do Exercício"
        description="Apuração por competência · estrutura do Cadastro Base"
        actions={canExport ? (
          <>
            <Button variant="outline" size="sm" onClick={() => exportDemonstrativoPDF(exportOpts)} disabled={exportIndisponivel}>
              <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
            </Button>
            <Button variant="outline" size="sm" onClick={() => exportDemonstrativoExcel(exportOpts)} disabled={exportIndisponivel}>
              <FileSpreadsheet aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
            </Button>
          </>
        ) : undefined}
      />

      <DemonstrativoFiltros meses={meses} onMesesChange={setMeses} mes={mesAncora} onMesChange={setMesAncora} />

      {erro ? (
        <ErrorState
          title="Não foi possível carregar o DRE"
          description={`Nenhum valor foi exibido para ${periodo}. Tente novamente.`}
          onRetry={() => { void load(); }}
          retrying={loading}
        />
      ) : (
        <FinSectionGroup
          id="dre-demonstrativo"
          title="Demonstrativo"
          caption={periodoCarregado
            ? `${periodoCarregado} · competência${loading ? ' · atualizando…' : ''}`
            : 'Carregando…'}
        >
          <DemonstrativoTree
            categorias={categorias}
            lancamentos={lancamentos}
            rateios={[]}
            loading={periodoCarregado === null}
            showPctReceita
          />
        </FinSectionGroup>
      )}
    </div>
  );
}

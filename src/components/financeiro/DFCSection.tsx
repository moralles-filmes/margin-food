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
import type { DfcSummary, DfcCategoria } from '@/types/financeiro';
import DemonstrativoTree from './DemonstrativoTree';
import { shiftMonth, monthBounds } from './MonthNavigator';
import { FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { DemonstrativoFiltros } from './analisesParts';

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
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [mesAncora, setMesAncora] = useState(() => formatInBR(new Date(), 'yyyy-MM'));
  const [meses, setMeses] = useState('1');
  const [loading, setLoading] = useState(true);
  const [categorias, setCategorias] = useState<DfcCategoria[]>([]);
  const [lancamentos, setLancamentos] = useState<{ id: string; categoria_id: string; valor: number; tipo: string; status: string }[]>([]);
  const [saldoInicial, setSaldoInicial] = useState(0);
  const [periodo, setPeriodo] = useState('');
  // Estado só de apresentação: período dos valores exibidos (última carga bem-sucedida) e falha.
  const [periodoCarregado, setPeriodoCarregado] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const requisicao = useRef(0);

  const canView = useCan('financeiro:fluxo:view');
  const canExport = useCan('financeiro:fluxo:export');

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

    const { data, error } = await supabase.rpc('get_fin_dfc_summary', {
      p_inicio: inicio,
      p_fim: fim,
    });
    // Só a resposta mais recente entra na tela (troca rápida de mês ou de quantidade de meses).
    if (atual !== requisicao.current) return;

    if (error) {
      toast.error('Erro ao carregar DFC');
      console.error(error);
      setErro(true);
      setLoading(false);
      return;
    }

    const result = (data as unknown) as DfcSummary | null;
    setCategorias(result?.categorias || []);
    setLancamentos(valoresMapToLancamentos(result?.valores_por_categoria || {}));
    setSaldoInicial(Number(result?.saldo_inicial || 0));
    setPeriodoCarregado(label);
    setErro(false);
    setLoading(false);
  }, [mesAncora, meses, supabase, toast]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:contas_pagar', load);
  useDataEvent('financeiro:contas_receber', load);
  useDataEvent('financeiro:contas', load);

  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar o DFC." />;

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
  // Com a leitura em andamento ou em erro, o arquivo sairia com o período do filtro sobre outra carga (D43/D59).
  const exportIndisponivel = loading || erro;

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="DFC — Demonstração de Fluxo de Caixa"
        description="Apuração por caixa (data de pagamento) · estrutura do Cadastro Base"
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
          title="Não foi possível carregar o DFC"
          description={`Nenhum valor foi exibido para ${periodo}. Tente novamente.`}
          onRetry={() => { void load(); }}
          retrying={loading}
        />
      ) : (
        <FinSectionGroup
          id="dfc-demonstrativo"
          title="Demonstrativo"
          caption={periodoCarregado
            ? `${periodoCarregado} · caixa${loading ? ' · atualizando…' : ''}`
            : 'Carregando…'}
        >
          <DemonstrativoTree
            categorias={categorias}
            lancamentos={lancamentos}
            rateios={[]}
            loading={periodoCarregado === null}
            isDFC
            saldoInicial={saldoInicial}
            showPctReceita
          />
          <FinNote>
            Valores apurados pela data de pagamento efetivo (regime de caixa). Saldo inicial calculado a partir das contas financeiras cadastradas.
          </FinNote>
        </FinSectionGroup>
      )}
    </div>
  );
}

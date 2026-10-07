import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
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
import CentroCustoFiltro from './CentroCustoFiltro';
import { useCentroCustoRecorte } from './useCentroCustoRecorte';
import { lerCentrosCusto, valoresDoCentroCusto, type ValoresPorCategoria, type ValoresPorCentroCusto } from '@/domain/financeiro/centroCusto';

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
  const [valores, setValores] = useState<ValoresPorCategoria>({});
  const [valoresPorCentro, setValoresPorCentro] = useState<ValoresPorCentroCusto>({});
  const recorte = useCentroCustoRecorte();
  const { registrarCentros } = recorte;
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
    setValores(result?.valores_por_categoria || {});
    setValoresPorCentro(result?.valores_por_centro_custo || {});
    registrarCentros(lerCentrosCusto(result?.centros_custo));
    setSaldoInicial(Number(result?.saldo_inicial || 0));
    setPeriodoCarregado(label);
    setErro(false);
    setLoading(false);
  }, [mesAncora, meses, supabase, toast, registrarCentros]);

  const valoresRecorte = useMemo(
    () => valoresDoCentroCusto(valores, valoresPorCentro, recorte.centros, recorte.selecao),
    [valores, valoresPorCentro, recorte.centros, recorte.selecao],
  );
  const lancamentos = useMemo(() => valoresMapToLancamentos(valoresRecorte), [valoresRecorte]);
  // % sobre a receita compara com o relatório inteiro; num recorte o denominador seria só a receita
  // do centro (muitas vezes zero) — a coluna sai da tela e do export, como o saldo do DFC.
  const mostrarPct = !recorte.filtrado;
  const semMovimento = recorte.filtrado && Object.keys(valoresRecorte).length === 0;
  // O saldo das contas é da empresa inteira: num recorte por centro de custo ele não se aplica.
  const mostrarSaldo = !recorte.filtrado;

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
    periodo: recorte.filtrado ? `${periodo} · Centro de custo: ${recorte.rotulo}` : periodo,
    isDFC: true,
    saldoInicial,
    mostrarSaldo,
    showPctReceita: mostrarPct,
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

      <DemonstrativoFiltros meses={meses} onMesesChange={setMeses} mes={mesAncora} onMesChange={setMesAncora}>
        <CentroCustoFiltro centros={recorte.centros} value={recorte.selecao} onChange={recorte.setSelecao} nomes={recorte.nomes} />
      </DemonstrativoFiltros>

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
            ? `${periodoCarregado} · caixa${recorte.filtrado ? ` · ${recorte.rotulo}` : ''}${loading ? ' · atualizando…' : ''}`
            : 'Carregando…'}
        >
          <DemonstrativoTree
            categorias={categorias}
            lancamentos={lancamentos}
            rateios={[]}
            loading={periodoCarregado === null}
            isDFC
            saldoInicial={saldoInicial}
            mostrarSaldo={mostrarSaldo}
            showPctReceita={mostrarPct}
          />
          {mostrarSaldo ? (
            <FinNote>
              Valores apurados pela data de pagamento efetivo (regime de caixa). Saldo inicial calculado a partir das contas financeiras cadastradas.
            </FinNote>
          ) : (
            <FinNote>
              {semMovimento && 'Este centro de custo não tem valores neste período. '}
              Recorte por centro de custo: lançamento com rateio entra pelo centro de cada linha; sem rateio, pelo centro do próprio lançamento. Saldo inicial, saldo acumulado e a coluna de % sobre os recebimentos são da empresa inteira e não aparecem neste recorte.
            </FinNote>
          )}
        </FinSectionGroup>
      )}
    </div>
  );
}

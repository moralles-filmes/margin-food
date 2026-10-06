import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef, type ReactNode } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine } from 'recharts';
import { subMonths, startOfMonth, endOfMonth, subDays } from 'date-fns';
import { formatDateISO, formatInBR, todayBR } from '@/lib/datetime';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import { useScopedToast } from '@/hooks/useScopedToast';
import { ReceiptText } from 'lucide-react';
import {
  axisProps,
  gridProps,
  tooltipProps,
  chartMargin,
  barProps,
  SEMANTIC_CHART_COLORS,
  chartValueFormatters,
  makeActiveDot,
} from '@/lib/chartTheme';
import { ChartCard } from '@/components/ui/ChartCard';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { ChartLegend } from '@/components/ui/ChartLegend';
import { buildCategoryRanking, historyWindow } from '@/components/financeiro/dashboardFinanceiroView';

import { useCan } from '@/permissions/hooks';
// ── Types ──

interface MonthlyItem {
  mes: string;
  mesLabel: string;
  receitas: number;
  despesas: number;
  resultado: number;
}

interface CategoriaItem {
  nome: string;
  valor: number;
}

interface ChartsData {
  evolucao_mensal: MonthlyItem[];
  despesas_por_categoria: CategoriaItem[];
}

interface DashboardChartsProps {
  /** Início do período selecionado no filtro do Dashboard Financeiro (yyyy-MM-dd, inclusivo) */
  periodStart: string;
  /** Fim exclusivo do período selecionado no filtro (yyyy-MM-dd) — mesma semântica de get_fin_dashboard_summary */
  periodEndExclusive: string;
  /** Rótulo do período do resumo (ex.: "Junho de 2026"), exibido em "Onde estão as despesas". */
  periodLabel?: string;
  /** Conteúdo ao lado do ranking de categorias (explicação de Despesas Provisionadas). */
  expenseAside?: ReactNode;
}

const LINE_COLOR = 'hsl(var(--primary))';

/** `despesas_por_categoria` de get_fin_dashboard_charts vem com `LIMIT 8`. */
const CATEGORY_LIMIT = 8;

/** Mesmas colunas no cabeçalho e nas linhas do ranking: nº, categoria, valor e (a partir de sm) participação. */
const RANKING_GRID = 'grid grid-cols-[1.75rem_minmax(0,1fr)_auto] gap-x-3 sm:grid-cols-[1.75rem_minmax(0,1fr)_auto_6rem]';

const EVOLUTION_LEGEND = [
  { value: 'Receitas', color: SEMANTIC_CHART_COLORS.positive, type: 'square', dataKey: 'receitas' },
  { value: 'Despesas', color: SEMANTIC_CHART_COLORS.negative, type: 'square', dataKey: 'despesas' },
];

/** Ponto do Resultado Mensal: mês negativo ganha contorno vermelho, além do sinal no tooltip e no eixo. */
function ResultadoDot({ cx, cy, value, index }: { cx?: number; cy?: number; value?: number; index?: number }) {
  if (cx == null || cy == null) return null;
  return (
    <circle
      data-index={index}
      cx={cx}
      cy={cy}
      r={4}
      strokeWidth={2}
      fill="hsl(var(--background))"
      stroke={typeof value === 'number' && value < 0 ? SEMANTIC_CHART_COLORS.negative : LINE_COLOR}
    />
  );
}

function SectionHeader({ id, title, description, aside }: { id: string; title: string; description?: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2">
      <div className="min-w-0 space-y-1">
        <h3 id={id} className="text-lg font-semibold leading-tight text-foreground">{title}</h3>
        {description && <p className="text-sm text-muted-foreground">{description}</p>}
      </div>
      {aside}
    </div>
  );
}

export default function DashboardCharts({ periodStart, periodEndExclusive, periodLabel, expenseAside }: DashboardChartsProps) {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canViewRbac = useCan('financeiro:dashboard:view');
  const [chartData, setChartData] = useState<ChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [meses, setMeses] = useState(6);

  const loadRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const inicio = formatDateISO(startOfMonth(subMonths(new Date(), meses - 1)));
    const fim = formatDateISO(endOfMonth(new Date()));
    // get_fin_dashboard_charts trata p_end como inclusivo; o filtro do topo usa fim exclusivo.
    const categoriaFimInclusivo = formatDateISO(subDays(new Date(periodEndExclusive + 'T12:00:00'), 1));

    const [evolucaoRes, categoriaRes] = await Promise.all([
      supabase.rpc('get_fin_dashboard_charts', { p_start: inicio, p_end: fim }),
      supabase.rpc('get_fin_dashboard_charts', { p_start: periodStart, p_end: categoriaFimInclusivo }),
    ]);

    if (evolucaoRes.error || categoriaRes.error) {
      console.error(evolucaoRes.error || categoriaRes.error);
      toast.error('Erro ao carregar gráficos do dashboard');
      setError(true);
      setLoading(false);
      return;
    }

    const evolucaoData = evolucaoRes.data as Record<string, unknown> | null;
    const categoriaData = categoriaRes.data as Record<string, unknown> | null;

    const evolucao = ((evolucaoData?.evolucao_mensal as Array<Record<string, unknown>>) || []).map((m) => {
      const [year, month] = String(m.mes).split('-');
      const date = new Date(Number(year), Number(month) - 1);
      return {
        mes: String(m.mes),
        mesLabel: formatInBR(date, 'MMM/yy'),
        receitas: Number(m.receitas) || 0,
        despesas: Number(m.despesas) || 0,
        resultado: Number(m.resultado) || 0,
      };
    });

    setChartData({
      evolucao_mensal: evolucao,
      despesas_por_categoria: ((categoriaData?.despesas_por_categoria as Array<Record<string, unknown>>) || []).map((c) => ({
        nome: String(c.nome),
        valor: Number(c.valor) || 0,
      })),
    });
    setLoading(false);
  }, [meses, periodEndExclusive, supabase, periodStart, toast]);

  loadRef.current = load;

  useEffect(() => { load(); }, [load]);

  // Auto-refresh via data events
  useDataEvent('financeiro:*', useCallback(() => loadRef.current(), []));

  if (!canViewRbac) return null;

  const fmt = (v: number) => fmtBRL(v);
  const failed = !loading && (error || !chartData);
  const janela = historyWindow(meses);
  // O mês atual está em andamento: o rótulo do eixo e o título do tooltip avisam que o valor é parcial.
  const currentMonth = todayBR().slice(0, 7);
  const evolucao = (chartData?.evolucao_mensal ?? []).map(m => (
    m.mes === currentMonth ? { ...m, mesLabel: `${m.mesLabel} · parcial` } : m
  ));
  const categorias = chartData?.despesas_por_categoria ?? [];
  const ranking = buildCategoryRanking(categorias);
  const topN = ranking.rows.length;
  // A RPC devolve no máximo 8 categorias (LIMIT 8): só nesse caso a lista é um recorte (Top 8).
  // Com menos, ela traz todas as categorias do período e os rótulos dizem isso.
  const isTopCut = topN >= CATEGORY_LIMIT;
  const rankingText = isTopCut
    ? {
        subtitle: `As maiores categorias do período do resumo (Top ${topN})`,
        sum: `Soma do Top ${topN}`,
        share: `Participação no Top ${topN}`,
        list: `Top ${topN} categorias de despesa`,
        footer: `Percentuais sobre a soma do Top ${topN}, não sobre toda a despesa realizada.`,
      }
    : {
        subtitle: `Todas as categorias do período do resumo (${topN})`,
        sum: topN === 1 ? 'Soma da categoria' : `Soma das ${topN} categorias`,
        share: 'Participação na soma',
        list: 'Categorias de despesa',
        footer: 'Percentuais sobre a soma das categorias listadas.',
      };
  const showMissingMonths = !loading && !failed && evolucao.length > 0 && evolucao.length < meses;
  const chartState = {
    loading,
    error: failed,
    errorTitle: 'Não foi possível carregar os gráficos',
    onRetry: load,
  };

  return (
    <div className="space-y-8">
      <section aria-labelledby="dash-fin-evolucao" className="space-y-4">
        <SectionHeader
          id="dash-fin-evolucao"
          title="Evolução financeira"
          description={<>Janela do histórico: últimos {meses} meses até o mês atual ({janela.label}) — não segue o período do resumo.</>}
          aside={(
            <div className="flex items-center gap-2">
              <span id="dash-fin-janela" className="text-sm text-muted-foreground">Janela do histórico</span>
              <Select value={String(meses)} onValueChange={v => setMeses(Number(v))} disabled={loading}>
                <SelectTrigger className="h-9 w-32" aria-labelledby="dash-fin-janela"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="3">3 meses</SelectItem>
                  <SelectItem value="6">6 meses</SelectItem>
                  <SelectItem value="12">12 meses</SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}
        />

        <div className="[container-type:inline-size]">
          <div className="grid grid-cols-1 gap-4 [@container(min-width:56rem)]:grid-cols-[3fr_2fr]">
            <ChartCard
              title="Receitas vs Despesas"
              subtitle="Realizadas por mês · regime de caixa"
              legend={<ChartLegend justify="start" payload={EVOLUTION_LEGEND} />}
              isEmpty={evolucao.length === 0}
              emptyTitle="Sem lançamentos realizados na janela"
              height="h-[280px]"
              className="min-w-0"
              {...chartState}
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={evolucao} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="mesLabel" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmt(Number(v))} />} />
                  <Bar dataKey="receitas" name="Receitas" fill={SEMANTIC_CHART_COLORS.positive} {...barProps} />
                  <Bar dataKey="despesas" name="Despesas" fill={SEMANTIC_CHART_COLORS.negative} {...barProps} />
                </BarChart>
              </ResponsiveContainer>
            </ChartCard>

            <ChartCard
              title="Resultado Mensal"
              subtitle="Receitas − despesas realizadas · regime de caixa"
              isEmpty={evolucao.length === 0}
              emptyTitle="Sem lançamentos realizados na janela"
              height="h-[280px]"
              className="min-w-0"
              {...chartState}
            >
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={evolucao} margin={chartMargin}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="mesLabel" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                  <ReferenceLine y={0} stroke="hsl(var(--chart-axis))" />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmt(Number(v))} />} />
                  <Line
                    type="monotone"
                    dataKey="resultado"
                    name="Resultado"
                    stroke={LINE_COLOR}
                    strokeWidth={2}
                    dot={(props: { cx?: number; cy?: number; value?: number; index?: number }) => <ResultadoDot key={`resultado-dot-${props.index}`} {...props} />}
                    activeDot={makeActiveDot(LINE_COLOR)}
                  />
                </LineChart>
              </ResponsiveContainer>
            </ChartCard>
          </div>
        </div>

        {showMissingMonths && (
          <p className="text-xs text-muted-foreground">
            Meses sem lançamento realizado não aparecem no gráfico ({evolucao.length} de {meses} meses com dados).
          </p>
        )}
      </section>

      <section aria-labelledby="dash-fin-despesas" className="space-y-4">
        <SectionHeader
          id="dash-fin-despesas"
          title="Onde estão as despesas"
          aside={periodLabel ? <p className="text-sm text-muted-foreground">Período do resumo: {periodLabel}</p> : undefined}
        />

        <div className="[container-type:inline-size]">
          <div className="grid grid-cols-1 items-start gap-4 [@container(min-width:56rem)]:grid-cols-[3fr_2fr]">
            <ChartCard
              title="Despesas por Categoria"
              subtitle={topN > 0 && !loading && !failed ? rankingText.subtitle : 'Maiores categorias do período do resumo'}
              isEmpty={categorias.length === 0}
              emptyIcon={ReceiptText}
              emptyTitle="Sem despesas categorizadas no período"
              height={loading ? 'h-[280px]' : 'h-auto'}
              className="min-w-0"
              footer={rankingText.footer}
              {...chartState}
            >
              <div className="space-y-4">
                <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 rounded-lg bg-muted px-4 py-3">
                  <span className="text-sm text-muted-foreground">{rankingText.sum}</span>
                  <span className="text-lg font-bold tabular-nums text-foreground">{fmt(ranking.total)}</span>
                </div>

                <div className={`${RANKING_GRID} items-end text-[11px] font-medium uppercase leading-tight tracking-wider text-muted-foreground`}>
                  <span className="col-span-2">Categoria</span>
                  <span className="text-right">
                    Valor<span className="block normal-case tracking-normal sm:hidden">{rankingText.share.toLowerCase()}</span>
                  </span>
                  <span className="hidden text-right sm:block">{rankingText.share}</span>
                </div>

                <ol aria-label={rankingText.list} className="m-0 list-none divide-y divide-border p-0">
                  {ranking.rows.map((row, i) => (
                    <li key={row.nome} className={`${RANKING_GRID} items-center gap-y-2 py-3`}>
                      <span className="row-span-2 self-center text-xs tabular-nums text-muted-foreground">{String(i + 1).padStart(2, '0')}</span>
                      <p className="col-start-2 min-w-0 break-words text-sm text-foreground">{row.nome}</p>
                      <span className="col-start-3 text-right text-sm font-semibold tabular-nums text-foreground">
                        {fmt(row.valor)}
                        <span className="block text-xs font-normal text-muted-foreground sm:hidden">
                          {row.share == null ? '—' : formatPercentBR(row.share, 1)}
                        </span>
                      </span>
                      <span className="col-start-4 hidden text-right text-xs tabular-nums text-muted-foreground sm:block">
                        {row.share == null ? '—' : formatPercentBR(row.share, 1)}
                      </span>
                      {/* Barra na 2ª linha, sob nome + valor: o trilho tem o mesmo comprimento em todas as linhas. */}
                      <div aria-hidden="true" className="col-span-2 col-start-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${row.barPercent}%` }} />
                      </div>
                    </li>
                  ))}
                </ol>
              </div>
            </ChartCard>

            {expenseAside}
          </div>
        </div>
      </section>
    </div>
  );
}

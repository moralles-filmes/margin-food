import { type ReactNode, useMemo, useState } from 'react';
import {
  Boxes,
  ChevronDown,
  ChevronRight,
  CircleDollarSign,
  Equal,
  Info,
  Landmark,
  Lightbulb,
  Loader2,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
  Users,
  WalletCards,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  axisProps,
  gridProps,
  tooltipProps,
  legendProps,
  SEMANTIC_CHART_COLORS,
  chartValueFormatters,
  makeActiveDot,
} from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';
import { ChartLegend } from '@/components/ui/ChartLegend';
import KpiCard, { type KpiCardDelta, type KpiVariant } from '@/components/ui/KpiCard';
import {
  buildPresentationDashboardInsights,
  calculatePresentationDeltas,
  calculatePresentationGroupMetric,
  filterPresentationCategoriesByGroups,
  formatMonthPeriodPtBR,
  type CategoryCompositionNode,
  type DataAvailability,
  type PresentationCategoryMetadataMap,
  type PresentationDashboardInsight,
  type PresentationMetricDeltas,
  type PresentationComparisonMode,
  type PresentationPlanCategory,
  type PresentationPlanData,
  type PresentationPeriodSnapshot,
  type PresentationRankingItem,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import {
  fmtBRL,
  fmtBRLCompact,
  formatDateBR,
  formatIntegerBR,
  formatPercentBR,
  parseLocalDate,
} from '@/lib/formatters';
import type {
  PresentationAnalyticsComparisonData,
  PresentationAnalyticsSnapshot,
  PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import PresentationFinancialTree from '@/components/financeiro/PresentationFinancialTree';
import PresentationPlanComparison from '@/components/financeiro/PresentationPlanComparison';
import type {
  PresentationDetailTarget,
  PresentationReturnAnchor,
} from '@/lib/presentationDetailNavigation';

interface PresentationAnalyticsProps {
  data: PresentationSociosData;
  categoryMetadata?: PresentationCategoryMetadataMap;
  categoryMetadataLoading?: boolean;
  onOpenDetail?: (request: PresentationDetailOpenRequest) => void;
  planAvailability?: DataAvailability<PresentationPlanData>;
  planCategories?: readonly PresentationPlanCategory[];
  comparisonMode?: PresentationComparisonMode;
  onComparisonModeChange?: (mode: PresentationComparisonMode) => void;
  planHasMore?: boolean;
  planLoadingMore?: boolean;
  onPlanLoadMore?: () => void;
  scenarioSection?: ReactNode;
}

export interface PresentationDetailOpenRequest {
  target: PresentationDetailTarget;
  categoryId?: string;
  returnAnchor: PresentationReturnAnchor;
}

type MetricKey = keyof PresentationMetricDeltas;
type AnalysisTarget =
  | 'overview'
  | 'revenue'
  | 'expense'
  | 'cmv'
  | 'personnel'
  | 'operations'
  | 'financial'
  | 'investments'
  | 'payables'
  | 'receivables';

interface MetricCardDefinition {
  key: MetricKey;
  label: string;
  value: number;
  format: (value: number) => string;
  icon: typeof TrendingUp;
  tone: 'positive' | 'negative' | 'result' | 'neutral';
  target: PresentationDetailTarget;
}

const QUICK_ANALYSES: Array<{ target: AnalysisTarget; label: string }> = [
  { target: 'overview', label: 'Análise' },
  { target: 'revenue', label: 'Receita' },
  { target: 'cmv', label: 'CMV' },
  { target: 'personnel', label: 'Folha' },
  { target: 'operations', label: 'Operacionais' },
  { target: 'financial', label: 'Financeiro' },
  { target: 'investments', label: 'Investimentos' },
  { target: 'payables', label: 'Contas em aberto' },
];

const ANALYSIS_GROUPS: Partial<Record<AnalysisTarget, readonly string[]>> = {
  cmv: ['cmv'],
  personnel: ['pessoal'],
  operations: ['ocupacao', 'utilidades', 'marketing', 'administrativa', 'manutencao'],
  financial: ['financeira', 'taxa'],
  investments: ['investimento'],
};

const ANALYSIS_TITLES: Record<AnalysisTarget, string> = {
  overview: 'Composição operacional',
  revenue: 'Composição das receitas',
  expense: 'Composição das despesas',
  cmv: 'Detalhamento do CMV',
  personnel: 'Detalhamento de folha e pessoal',
  operations: 'Detalhamento das despesas operacionais',
  financial: 'Detalhamento financeiro',
  investments: 'Detalhamento de investimentos',
  payables: 'Contas em aberto',
  receivables: 'Contas em aberto',
};

const NOOP_MODE_CHANGE = () => undefined;
const NOOP_LOAD_MORE = () => undefined;

function analysisTargetToDetail(target: AnalysisTarget): PresentationDetailTarget {
  if (target === 'overview') return 'result';
  if (target === 'personnel'
    || target === 'operations'
    || target === 'financial'
    || target === 'investments') return 'expense';
  return target;
}

function availabilityData<T>(availability: DataAvailability<T>): T | null {
  return availability.state === 'available' || availability.state === 'empty'
    ? availability.data
    : null;
}

function comparisonUnavailableLabel(comparison: PresentationAnalyticsComparisonData): string | null {
  if (comparison.snapshot.state === 'unavailable') return 'Fora do histórico';
  if (comparison.snapshot.state === 'error') return 'Indisponível';
  return null;
}

/** Builds the "vs. período anterior" comparison line for KpiCard's delta slot */
function buildExecutiveDelta(
  metricKey: MetricKey,
  current: PresentationAnalyticsSnapshot,
  comparison: PresentationAnalyticsComparisonData,
): KpiCardDelta {
  const label = 'vs. período anterior';
  const compared = availabilityData(comparison.snapshot);
  const unavailableLabel = comparisonUnavailableLabel(comparison);
  if (!compared) {
    return { label, formatted: unavailableLabel ?? 'Sem dados', direction: 'none', tone: 'neutral' };
  }

  const delta = calculatePresentationDeltas(
    current.metrics.managerialResult,
    compared.metrics.managerialResult,
  )[metricKey];
  if (delta.state === 'unavailable') {
    return { label, formatted: 'Base zero', direction: 'none', tone: 'neutral' };
  }

  const invertPositive = metricKey === 'expense';
  const positive = delta.value !== 0 && (invertPositive ? delta.value < 0 : delta.value > 0);
  const negative = delta.value !== 0 && (invertPositive ? delta.value > 0 : delta.value < 0);
  const formatted = delta.unit === 'percentage-points'
    ? `${delta.value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
    : formatPercentBR(delta.value, 1);
  return {
    label,
    formatted,
    direction: delta.value > 0 ? 'up' : delta.value < 0 ? 'down' : 'flat',
    tone: positive ? 'positive' : negative ? 'negative' : 'neutral',
  };
}

const EXECUTIVE_TONE_TO_VARIANT: Record<MetricCardDefinition['tone'], KpiVariant> = {
  positive: 'success',
  negative: 'danger',
  result: 'primary',
  neutral: 'default',
};

function ExecutiveMetricCard({
  definition,
  current,
  previousPeriod,
  onSelect,
}: {
  definition: MetricCardDefinition;
  current: PresentationAnalyticsSnapshot;
  previousPeriod: PresentationAnalyticsComparisonData;
  onSelect: (target: PresentationDetailTarget) => void;
}) {
  const variant = definition.tone === 'result'
    ? (definition.value >= 0 ? 'success' : 'danger')
    : EXECUTIVE_TONE_TO_VARIANT[definition.tone];

  return (
    <KpiCard
      label={definition.label}
      value={definition.format(definition.value)}
      icon={definition.icon}
      variant={variant}
      delta={buildExecutiveDelta(definition.key, current, previousPeriod)}
      onClick={() => onSelect(definition.target)}
      ariaLabel={`Ver detalhes de ${definition.label}`}
    />
  );
}

function CmvMetricCard({
  snapshot,
  metadata,
  loading,
  onSelect,
}: {
  snapshot: PresentationAnalyticsSnapshot;
  metadata?: PresentationCategoryMetadataMap;
  loading: boolean;
  onSelect: (target: PresentationDetailTarget) => void;
}) {
  const metric = metadata ? calculatePresentationGroupMetric(snapshot, metadata, 'cmv') : null;
  return (
    <KpiCard
      label="CMV"
      value={metric ? fmtBRL(metric.amount) : loading ? 'Calculando…' : 'Indisponível'}
      icon={Boxes}
      variant="primary"
      sub={metric?.revenueSharePercent !== null && metric
        ? `${formatPercentBR(metric.revenueSharePercent, 1)} da receita operacional`
        : loading
          ? 'Lendo classificação gerencial'
          : 'Classificação gerencial indisponível'}
      onClick={() => onSelect('cmv')}
      ariaLabel="Ver detalhes de CMV"
    />
  );
}

function formatSeriesLabel(key: string, granularity: TimeSeriesGranularity): string {
  if (granularity === 'year') return key;
  if (granularity === 'month') return formatMonthPeriodPtBR(key).replace(' de ', '/');
  return formatDateBR(parseLocalDate(key));
}

function TimeSeriesCard({ snapshot }: { snapshot: PresentationAnalyticsSnapshot }) {
  const chartData = snapshot.timeSeries.points.map(point => ({
    label: formatSeriesLabel(point.key, snapshot.timeSeries.granularity),
    Receita: point.metrics.revenue,
    Despesa: point.metrics.expense,
    Resultado: point.metrics.result,
  }));
  const granularityLabel = snapshot.timeSeries.granularity === 'day'
    ? 'diária'
    : snapshot.timeSeries.granularity === 'month' ? 'mensal' : 'anual';

  return (
    <Card className="min-w-0 border-border/80 shadow-sm">
      <CardHeader className="flex-row items-center justify-between space-y-0 pb-1">
        <div>
          <CardTitle className="text-sm">Evolução {granularityLabel}</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">Regime de competência</p>
        </div>
        <Badge variant="outline" className="text-[10px]">Receita − despesa = resultado</Badge>
      </CardHeader>
      <CardContent className="pt-2">
        <div className="h-[270px] w-full" role="img" aria-label="Gráfico da evolução de receitas, despesas e resultado no período">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={{ top: 12, right: 10, left: 0, bottom: 2 }}>
              <CartesianGrid {...gridProps} />
              <XAxis dataKey="label" {...axisProps} minTickGap={22} />
              <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} width={64} />
              <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={value => fmtBRL(Number(value))} />} />
              <Legend {...legendProps} content={<ChartLegend />} />
              <Line type="monotone" dataKey="Receita" stroke={SEMANTIC_CHART_COLORS.positive} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={makeActiveDot(SEMANTIC_CHART_COLORS.positive)} />
              <Line type="monotone" dataKey="Despesa" stroke={SEMANTIC_CHART_COLORS.negative} strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={makeActiveDot(SEMANTIC_CHART_COLORS.negative)} />
              <Line type="monotone" dataKey="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.25} dot={false} activeDot={makeActiveDot('hsl(var(--primary))')} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </CardContent>
    </Card>
  );
}

function InsightsPanel({
  insights,
  onSelect,
}: {
  insights: readonly PresentationDashboardInsight[];
  onSelect: (target: AnalysisTarget) => void;
}) {
  const iconByTone = {
    positive: TrendingUp,
    negative: TrendingDown,
    warning: Lightbulb,
    neutral: Info,
  } as const;
  const toneClass = {
    positive: 'text-success',
    negative: 'text-destructive',
    warning: 'text-primary-ink',
    neutral: 'text-info',
  } as const;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-sm">
          <Lightbulb className="h-4 w-4 text-primary-ink" aria-hidden="true" /> Insights do período
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-1 px-3 pb-3">
        {insights.map(insight => {
          const Icon = iconByTone[insight.tone];
          return (
            <button
              key={insight.id}
              type="button"
              onClick={() => onSelect(insight.target)}
              className="flex w-full items-start gap-3 rounded-lg px-2 py-2.5 text-left transition hover:bg-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon className={cn('mt-0.5 h-4 w-4 shrink-0', toneClass[insight.tone])} aria-hidden="true" />
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-foreground">{insight.title}</span>
                <span className="mt-0.5 block text-[11px] leading-relaxed text-muted-foreground">{insight.description}</span>
              </span>
            </button>
          );
        })}
      </CardContent>
    </Card>
  );
}

function OpenItemsPanel({
  snapshot,
  onSelect,
}: {
  snapshot: PresentationAnalyticsSnapshot;
  onSelect: (target: AnalysisTarget) => void;
}) {
  const payable = snapshot.metrics.openItems.accountsPayableOpen;
  const receivable = snapshot.metrics.openItems.accountsReceivableOpen;
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Contas em aberto</CardTitle></CardHeader>
      <CardContent className="grid gap-2 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <button
          type="button"
          onClick={() => onSelect('payables')}
          className="rounded-xl border border-warning-border bg-warning-soft p-3 text-left transition hover:border-warning focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center justify-between text-[11px] text-muted-foreground">Contas a pagar <ReceiptText className="h-4 w-4 text-warning" /></span>
          <span className="mt-1 block text-lg font-bold text-warning">{fmtBRL(payable.amount)}</span>
          <span className="text-[11px] text-muted-foreground">{formatIntegerBR(payable.count)} título(s)</span>
        </button>
        <button
          type="button"
          onClick={() => onSelect('receivables')}
          className="rounded-xl border border-success-border bg-success-soft p-3 text-left transition hover:border-success focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <span className="flex items-center justify-between text-[11px] text-muted-foreground">Contas a receber <Landmark className="h-4 w-4 text-success" /></span>
          <span className="mt-1 block text-lg font-bold text-success">{fmtBRL(receivable.amount)}</span>
          <span className="text-[11px] text-muted-foreground">{formatIntegerBR(receivable.count)} título(s)</span>
        </button>
      </CardContent>
    </Card>
  );
}

function RankingColumn({
  title,
  items,
  tone,
  onSelect,
}: {
  title: string;
  items: readonly PresentationRankingItem[];
  tone: 'revenue' | 'expense';
  onSelect: () => void;
}) {
  return (
    <button type="button" onClick={onSelect} className="min-w-0 rounded-lg p-1 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
      <span className={cn('mb-2 block text-xs font-semibold', tone === 'revenue' ? 'text-success' : 'text-destructive')}>{title}</span>
      {items.length === 0 ? <span className="text-[11px] text-muted-foreground">Sem categorias.</span> : (
        <ol className="space-y-2">
          {items.slice(0, 3).map(item => (
            <li key={`${item.rank}-${item.categoryId ?? item.label}`} className="flex items-center gap-2 text-[11px]">
              <span className="w-4 font-bold text-primary-ink">{item.rank}</span>
              <span className="min-w-0 flex-1 truncate text-foreground">{item.label}</span>
              <span className="whitespace-nowrap font-mono text-muted-foreground">{fmtBRLCompact(item.amount)}</span>
            </li>
          ))}
        </ol>
      )}
    </button>
  );
}

function RankingsPanel({ snapshot, onSelect }: { snapshot: PresentationAnalyticsSnapshot; onSelect: (target: AnalysisTarget) => void }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2"><CardTitle className="text-sm">Rankings do período</CardTitle></CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2">
        <RankingColumn title="Top receitas" items={snapshot.rankings.topRevenueCategories} tone="revenue" onSelect={() => onSelect('revenue')} />
        <RankingColumn title="Top despesas" items={snapshot.rankings.topExpenseCategories} tone="expense" onSelect={() => onSelect('expense')} />
      </CardContent>
    </Card>
  );
}

function NonOperationalSection({ snapshot }: { snapshot: PresentationAnalyticsSnapshot }) {
  const [open, setOpen] = useState(false);
  const totals = snapshot.nonOperationalTotals;
  const hasValues = totals.revenue !== 0 || totals.expense !== 0 || totals.result !== 0;
  return (
    <section aria-labelledby="non-operational-title" className="rounded-xl border border-warning/25 bg-warning/[0.035] p-3">
      <button
        type="button"
        onClick={() => setOpen(value => !value)}
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 rounded-md text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex items-start gap-2">
          <Info className="mt-0.5 h-4 w-4 text-warning" aria-hidden="true" />
          <span>
            <span id="non-operational-title" className="block text-sm font-semibold text-foreground">Informativo não operacional</span>
            <span className="block text-xs text-muted-foreground">Estes valores não compõem receita, despesa, resultado ou margem operacional.</span>
          </span>
        </span>
        <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {fmtBRL(totals.result)} {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
        </span>
      </button>
      {open ? (
        <div className="mt-3 grid gap-3 border-t border-warning/20 pt-3 sm:grid-cols-3">
          {[
            ['Receitas não operacionais', totals.revenue],
            ['Despesas não operacionais', totals.expense],
            ['Saldo informativo', totals.result],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-lg border border-warning/15 bg-card/70 p-3">
              <p className="text-[11px] text-muted-foreground">{label}</p>
              <p className="mt-1 text-sm font-semibold text-foreground">{fmtBRL(Number(value))}</p>
            </div>
          ))}
          {hasValues ? (
            <div className="sm:col-span-3 grid gap-4 lg:grid-cols-2">
              <PresentationFinancialTree title="Receitas não operacionais" nodes={snapshot.categoryComposition.nonOperational.revenue} tone="revenue" />
              <PresentationFinancialTree title="Despesas não operacionais" nodes={snapshot.categoryComposition.nonOperational.expense} tone="expense" />
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

function CurrentSnapshotState({ availability }: { availability: DataAvailability<PresentationPeriodSnapshot> }) {
  if (availability.state === 'unavailable') {
    return (
      <Alert><Info className="h-4 w-4" /><AlertTitle>Período indisponível</AlertTitle><AlertDescription>O intervalo selecionado está fora do histórico disponível.</AlertDescription></Alert>
    );
  }
  if (availability.state === 'error') return <Alert variant="destructive"><AlertDescription>{availability.message}</AlertDescription></Alert>;
  return null;
}

function AnalysisContent({
  target,
  snapshot,
  metadata,
  onSelectCategory,
}: {
  target: AnalysisTarget;
  snapshot: PresentationAnalyticsSnapshot;
  metadata?: PresentationCategoryMetadataMap;
  onSelectCategory: (target: 'revenue' | 'expense' | 'cmv', node: CategoryCompositionNode) => void;
}) {
  if (target === 'payables' || target === 'receivables') {
    return (
      <div className="rounded-xl border border-border/80 bg-card p-4">
        <h2 className="text-sm font-semibold text-foreground">{ANALYSIS_TITLES[target]}</h2>
        <p className="mt-1 text-xs text-muted-foreground">Indicadores gerenciais separados do resultado operacional.</p>
        <div className="mt-3"><OpenItemsPanel snapshot={snapshot} onSelect={() => {}} /></div>
      </div>
    );
  }

  if (target === 'overview') {
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Composição operacional</CardTitle>
          <p className="text-xs text-muted-foreground">Hierarquia expansível; os valores acumulados já vêm prontos sem dupla contagem.</p>
        </CardHeader>
        <CardContent className="grid gap-5 lg:grid-cols-2">
          <PresentationFinancialTree
            title="Receitas"
            nodes={snapshot.categoryComposition.operational.revenue}
            tone="revenue"
            onSelectNode={node => onSelectCategory('revenue', node)}
          />
          <PresentationFinancialTree
            title="Despesas"
            nodes={snapshot.categoryComposition.operational.expense}
            tone="expense"
            onSelectNode={node => onSelectCategory('expense', node)}
          />
        </CardContent>
      </Card>
    );
  }

  if (target === 'revenue' || target === 'expense') {
    const revenue = target === 'revenue';
    return (
      <Card className="border-border/80 shadow-sm">
        <CardHeader className="pb-3"><CardTitle className="text-sm">{ANALYSIS_TITLES[target]}</CardTitle></CardHeader>
        <CardContent>
          <PresentationFinancialTree
            title={revenue ? 'Receitas' : 'Despesas'}
            nodes={revenue ? snapshot.categoryComposition.operational.revenue : snapshot.categoryComposition.operational.expense}
            tone={revenue ? 'revenue' : 'expense'}
            onSelectNode={node => onSelectCategory(revenue ? 'revenue' : 'expense', node)}
          />
        </CardContent>
      </Card>
    );
  }

  const groups = ANALYSIS_GROUPS[target] ?? [];
  const nodes = metadata
    ? filterPresentationCategoriesByGroups(snapshot.categoryComposition.operational.expense, metadata, groups)
    : [];
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-3">
        <CardTitle className="text-sm">{ANALYSIS_TITLES[target]}</CardTitle>
        <p className="text-xs text-muted-foreground">Classificação baseada no grupo configurado em Categorias Financeiras.</p>
      </CardHeader>
      <CardContent>
        {metadata ? (
          <PresentationFinancialTree
            title={ANALYSIS_TITLES[target]}
            nodes={nodes}
            tone="expense"
            onSelectNode={node => onSelectCategory(target === 'cmv' ? 'cmv' : 'expense', node)}
          />
        ) : (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Metadados gerenciais indisponíveis. Os totais operacionais continuam preservados.</p>
        )}
      </CardContent>
    </Card>
  );
}

export default function PresentationAnalytics({
  data,
  categoryMetadata,
  categoryMetadataLoading = false,
  onOpenDetail,
  planAvailability,
  planCategories = [],
  comparisonMode = 'actual',
  onComparisonModeChange = NOOP_MODE_CHANGE,
  planHasMore = false,
  planLoadingMore = false,
  onPlanLoadMore = NOOP_LOAD_MORE,
  scenarioSection,
}: PresentationAnalyticsProps) {
  const [activeAnalysis, setActiveAnalysis] = useState<AnalysisTarget>('overview');
  const snapshot = availabilityData(data.current);
  const cmvMetric = useMemo(
    () => snapshot && categoryMetadata
      ? calculatePresentationGroupMetric(snapshot, categoryMetadata, 'cmv')
      : null,
    [snapshot, categoryMetadata],
  );
  const insights = useMemo(
    () => snapshot ? buildPresentationDashboardInsights(snapshot, cmvMetric) : [],
    [snapshot, cmvMetric],
  );
  const openDetail = (request: PresentationDetailOpenRequest) => {
    if (onOpenDetail) {
      onOpenDetail(request);
      return;
    }
    if (request.target === 'ranking-revenue') setActiveAnalysis('revenue');
    else if (request.target === 'ranking-expense' || request.target === 'expenses') setActiveAnalysis('expense');
    else if (request.target === 'result' || request.target === 'margin') setActiveAnalysis('overview');
    else setActiveAnalysis(request.target);
  };

  if (!snapshot) return <CurrentSnapshotState availability={data.current} />;

  const result = snapshot.metrics.managerialResult;
  const cards: MetricCardDefinition[] = [
    { key: 'revenue', label: 'Receita operacional', value: result.revenue, format: fmtBRL, icon: TrendingUp, tone: 'positive', target: 'revenue' },
    { key: 'expense', label: 'Despesa operacional', value: result.expense, format: fmtBRL, icon: TrendingDown, tone: 'negative', target: 'expense' },
    { key: 'result', label: 'Resultado operacional', value: result.result, format: fmtBRL, icon: CircleDollarSign, tone: 'result', target: 'result' },
    { key: 'margin', label: 'Margem operacional', value: result.marginPercent, format: value => formatPercentBR(value, 1), icon: Scale, tone: 'neutral', target: 'margin' },
  ];

  return (
    <div className="space-y-4">
      {data.current.state === 'empty' ? (
        <Card>
          <CardContent className="flex flex-col items-center justify-center gap-2 p-8 text-center">
            <Equal className="h-9 w-9 text-muted-foreground/40" aria-hidden="true" />
            <h3 className="font-semibold text-foreground">Nenhum realizado no período</h3>
            <p className="max-w-lg text-sm text-muted-foreground">O orçamento configurado continua visível; contas em aberto permanecem separadas do resultado.</p>
          </CardContent>
        </Card>
      ) : null}
      <section id="presentation-executive-summary" aria-labelledby="executive-summary-title" className="scroll-mt-6 space-y-3">
        <div className="flex flex-wrap items-end justify-between gap-2">
          <div>
            <h2 id="executive-summary-title" className="text-sm font-semibold text-foreground">Resumo executivo</h2>
            <p className="text-xs text-muted-foreground">{data.periodLabel} • regime de competência</p>
          </div>
          <Badge variant="outline" className="border-primary/30 text-[10px] text-foreground">Transferências excluídas</Badge>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map(definition => (
            <ExecutiveMetricCard
              key={definition.key}
              definition={definition}
              current={snapshot}
              previousPeriod={data.comparisons.previousPeriod}
              onSelect={target => openDetail({ target, returnAnchor: 'executive-summary' })}
            />
          ))}
          <CmvMetricCard
            snapshot={snapshot}
            metadata={categoryMetadata}
            loading={categoryMetadataLoading}
            onSelect={target => openDetail({ target, returnAnchor: 'executive-summary' })}
          />
        </div>
      </section>

      {!planAvailability ? null : planAvailability.state === 'available' ? (
        <PresentationPlanComparison
          plan={planAvailability.data}
          categories={planCategories}
          mode={comparisonMode}
          onModeChange={onComparisonModeChange}
          expectedActual={result}
          hasMore={planHasMore}
          loadingMore={planLoadingMore}
          onLoadMore={onPlanLoadMore}
        />
      ) : planAvailability.state === 'loading' || planAvailability.state === 'idle' ? (
        <Card id="presentation-plan" aria-busy="true">
          <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando metas, orçamento e projeção...
          </CardContent>
        </Card>
      ) : planAvailability.state === 'error' ? (
        <Alert variant="destructive" id="presentation-plan">
          <AlertTitle>Planejamento indisponível</AlertTitle>
          <AlertDescription>{planAvailability.message} O realizado canônico permanece disponível.</AlertDescription>
        </Alert>
      ) : (
        <Alert id="presentation-plan">
          <AlertTitle>Planejamento sem acesso</AlertTitle>
          <AlertDescription>Metas e orçamento não puderam ser consultados com a permissão atual.</AlertDescription>
        </Alert>
      )}

      {scenarioSection}

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(280px,1fr)]">
        <TimeSeriesCard snapshot={snapshot} />
        <InsightsPanel
          insights={insights}
          onSelect={target => openDetail({
            target: analysisTargetToDetail(target),
            returnAnchor: 'executive-summary',
          })}
        />
      </div>

      <nav aria-label="Análise rápida" className="flex flex-wrap items-center gap-2 rounded-xl border border-border/80 bg-card/65 p-2">
        {QUICK_ANALYSES.map(item => (
          <Button
            key={item.target}
            type="button"
            size="sm"
            variant={activeAnalysis === item.target ? 'secondary' : 'ghost'}
            aria-pressed={activeAnalysis === item.target}
            onClick={() => setActiveAnalysis(item.target)}
            className={cn('h-8 rounded-full px-4 text-xs', activeAnalysis === item.target && 'border border-primary/25 bg-primary/10 text-foreground')}
          >
            {item.target === 'personnel' ? <Users className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : null}
            {item.target === 'financial' ? <WalletCards className="mr-1.5 h-3.5 w-3.5" aria-hidden="true" /> : null}
            {item.label}
          </Button>
        ))}
      </nav>

      <div id="presentation-financial-tree" className="scroll-mt-6 grid gap-4 xl:grid-cols-[minmax(0,2.2fr)_minmax(300px,0.8fr)]">
        <AnalysisContent
          key={`${data.period.start}-${activeAnalysis}`}
          target={activeAnalysis}
          snapshot={snapshot}
          metadata={categoryMetadata}
          onSelectCategory={(target, node) => {
            if (!node.categoryId) return;
            openDetail({ target, categoryId: node.categoryId, returnAnchor: 'financial-tree' });
          }}
        />
        <aside className="space-y-4">
          <div id="presentation-open-items" className="scroll-mt-6">
            <OpenItemsPanel
              snapshot={snapshot}
              onSelect={target => openDetail({ target: analysisTargetToDetail(target), returnAnchor: 'open-items' })}
            />
          </div>
          <div id="presentation-rankings" className="scroll-mt-6">
            <RankingsPanel
              snapshot={snapshot}
              onSelect={target => openDetail({
                target: target === 'revenue' ? 'ranking-revenue' : 'ranking-expense',
                returnAnchor: 'rankings',
              })}
            />
          </div>
        </aside>
      </div>

      <NonOperationalSection snapshot={snapshot} />
    </div>
  );
}

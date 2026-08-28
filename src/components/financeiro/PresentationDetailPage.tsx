import { useMemo } from 'react';
import {
  ArrowLeft,
  Boxes,
  ChevronRight,
  CircleDollarSign,
  Equal,
  Landmark,
  Loader2,
  ReceiptText,
  Scale,
  TrendingDown,
  TrendingUp,
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
import { ChartTooltip, type ChartTooltipPayloadItem } from '@/components/ui/ChartTooltip';
import { ChartLegend } from '@/components/ui/ChartLegend';
import {
  calculatePresentationGroupMetric,
  filterPresentationCategoriesByGroup,
  formatMonthPeriodPtBR,
  type CategoryCompositionNode,
  type DataAvailability,
  type PresentationCategoryMetadataMap,
  type PresentationComparisonMode,
  type PresentationPlanCategory,
  type PresentationPlanData,
  type PresentationPeriodSnapshot,
  type PresentationRankingItem,
} from '@/domain/financeiro/presentation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PresentationFinancialTree from '@/components/financeiro/PresentationFinancialTree';
import PresentationPlanComparison from '@/components/financeiro/PresentationPlanComparison';
import {
  isPresentationDetailPermissionError,
  usePresentationDetailRows,
  usePresentationDetailSeries,
  type PresentationDetailFilters,
  type PresentationDetailRow,
  type PresentationDetailSeriesPoint,
} from '@/hooks/usePresentationDetail';
import type { PresentationSociosData } from '@/lib/financeiroPresentationAdapter';
import type { PresentationDetailTarget } from '@/lib/presentationDetailNavigation';
import {
  fmtBRL,
  formatDateBR,
  formatPercentBR,
  parseLocalDate,
} from '@/lib/formatters';
import { cn } from '@/lib/utils';

interface PresentationDetailPageProps {
  companyId: string | null | undefined;
  target: PresentationDetailTarget;
  data: PresentationSociosData;
  categoryMetadata?: PresentationCategoryMetadataMap;
  categoryId?: string;
  rankingLimit: number;
  unitName?: string | null;
  onBack: () => void;
  onSelectCategory: (categoryId?: string, targetOverride?: PresentationDetailTarget) => void;
  planAvailability?: DataAvailability<PresentationPlanData>;
  planCategories?: readonly PresentationPlanCategory[];
  comparisonMode?: PresentationComparisonMode;
  onComparisonModeChange?: (mode: PresentationComparisonMode) => void;
  planHasMore?: boolean;
  planLoadingMore?: boolean;
  onPlanLoadMore?: () => void;
}

interface DetailDefinition {
  title: string;
  description: string;
  icon: typeof TrendingUp;
  nature?: 'RECEITA' | 'DESPESA';
  group?: string;
  rowsKind: PresentationDetailFilters['kind'];
  tone: 'revenue' | 'expense' | 'result' | 'neutral';
}

const DETAIL_DEFINITIONS: Record<PresentationDetailTarget, DetailDefinition> = {
  revenue: {
    title: 'Receita operacional',
    description: 'Evolução, composição, participação, ranking e lançamentos relacionados.',
    icon: TrendingUp,
    nature: 'RECEITA',
    rowsKind: 'ledger',
    tone: 'revenue',
  },
  expense: {
    title: 'Despesa operacional',
    description: 'Grupos, subcategorias, participação e itens que pressionam o resultado.',
    icon: TrendingDown,
    nature: 'DESPESA',
    rowsKind: 'ledger',
    tone: 'expense',
  },
  result: {
    title: 'Resultado operacional',
    description: 'Receita menos despesa, com os principais fatores favoráveis e de pressão.',
    icon: CircleDollarSign,
    rowsKind: 'ledger',
    tone: 'result',
  },
  margin: {
    title: 'Margem operacional',
    description: 'Resultado dividido pela receita, preservando a fonte canônica da apresentação.',
    icon: Scale,
    rowsKind: 'ledger',
    tone: 'neutral',
  },
  cmv: {
    title: 'CMV',
    description: 'Classificação semântica herdada exclusivamente de grupo = cmv.',
    icon: Boxes,
    nature: 'DESPESA',
    group: 'cmv',
    rowsKind: 'ledger',
    tone: 'expense',
  },
  payables: {
    title: 'Contas a pagar em aberto',
    description: 'Indicador gerencial separado do resultado operacional.',
    icon: ReceiptText,
    rowsKind: 'payables',
    tone: 'expense',
  },
  receivables: {
    title: 'Contas a receber em aberto',
    description: 'Indicador gerencial separado do resultado operacional.',
    icon: Landmark,
    rowsKind: 'receivables',
    tone: 'revenue',
  },
  'ranking-revenue': {
    title: 'Ranking de receitas',
    description: 'Categorias de receita ordenadas pela participação no período.',
    icon: TrendingUp,
    nature: 'RECEITA',
    rowsKind: 'ledger',
    tone: 'revenue',
  },
  'ranking-expense': {
    title: 'Ranking de despesas',
    description: 'Categorias de despesa ordenadas pela participação no período.',
    icon: TrendingDown,
    nature: 'DESPESA',
    rowsKind: 'ledger',
    tone: 'expense',
  },
};

const NOOP_MODE_CHANGE = () => undefined;
const NOOP_LOAD_MORE = () => undefined;

function availableData<T>(availability: DataAvailability<T>): T | null {
  return availability.state === 'available' || availability.state === 'empty'
    ? availability.data
    : null;
}

function findCategoryPath(
  nodes: readonly CategoryCompositionNode[],
  categoryId: string,
  ancestors: readonly CategoryCompositionNode[] = [],
): readonly CategoryCompositionNode[] | null {
  for (const node of nodes) {
    const path = [...ancestors, node];
    if (node.categoryId === categoryId) return path;
    const nested = findCategoryPath(node.children, categoryId, path);
    if (nested) return nested;
  }
  return null;
}

function detailNodes(
  snapshot: PresentationPeriodSnapshot,
  definition: DetailDefinition,
  metadata?: PresentationCategoryMetadataMap,
): readonly CategoryCompositionNode[] {
  const nodes = definition.nature === 'RECEITA'
    ? snapshot.categoryComposition.operational.revenue
    : snapshot.categoryComposition.operational.expense;
  return definition.group && metadata
    ? filterPresentationCategoriesByGroup(nodes, metadata, definition.group)
    : nodes;
}

function selectedValue(
  snapshot: PresentationPeriodSnapshot,
  definition: DetailDefinition,
  metadata: PresentationCategoryMetadataMap | undefined,
  categoryId: string | undefined,
): number {
  if (categoryId) {
    const path = findCategoryPath(detailNodes(snapshot, definition, metadata), categoryId);
    return path?.at(-1)?.amount ?? 0;
  }
  if (definition.group && metadata) {
    return calculatePresentationGroupMetric(snapshot, metadata, definition.group).amount;
  }
  if (definition.nature === 'RECEITA') return snapshot.metrics.managerialResult.revenue;
  if (definition.nature === 'DESPESA') return snapshot.metrics.managerialResult.expense;
  return 0;
}

function percentChange(current: number, previous: number): number | null {
  if (previous === 0) return null;
  const value = ((current - previous) / Math.abs(previous)) * 100;
  return Number.isFinite(value) ? value : null;
}

function comparisonSnapshot(data: PresentationSociosData, kind: 'previousPeriod' | 'previousYear') {
  return availableData(data.comparisons[kind].snapshot);
}

function formatSeriesLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return key;
  if (/^\d{4}-\d{2}$/.test(key)) return formatMonthPeriodPtBR(key).replace(' de ', '/');
  return formatDateBR(parseLocalDate(key));
}

function DetailKpis({
  target,
  definition,
  data,
  snapshot,
  metadata,
  categoryId,
}: {
  target: PresentationDetailTarget;
  definition: DetailDefinition;
  data: PresentationSociosData;
  snapshot: PresentationPeriodSnapshot;
  metadata?: PresentationCategoryMetadataMap;
  categoryId?: string;
}) {
  const previous = comparisonSnapshot(data, 'previousPeriod');
  const previousYear = comparisonSnapshot(data, 'previousYear');
  const metrics = snapshot.metrics.managerialResult;
  const semanticMetadataUnavailable = Boolean(definition.group && !metadata);

  let currentValue = selectedValue(snapshot, definition, metadata, categoryId);
  let previousValue = previous ? selectedValue(previous, definition, metadata, categoryId) : null;
  let previousYearValue = previousYear ? selectedValue(previousYear, definition, metadata, categoryId) : null;
  let primaryLabel = 'Total no período';
  let formatter = fmtBRL;
  let previousDelta = semanticMetadataUnavailable || previousValue === null
    ? null
    : percentChange(currentValue, previousValue);
  let annualDelta = semanticMetadataUnavailable || previousYearValue === null
    ? null
    : percentChange(currentValue, previousYearValue);

  if (target === 'result') {
    currentValue = metrics.result;
    previousValue = previous?.metrics.managerialResult.result ?? null;
    previousYearValue = previousYear?.metrics.managerialResult.result ?? null;
    previousDelta = previousValue === null ? null : percentChange(currentValue, previousValue);
    annualDelta = previousYearValue === null ? null : percentChange(currentValue, previousYearValue);
    primaryLabel = 'Resultado operacional';
  }
  if (target === 'margin') {
    currentValue = metrics.marginPercent;
    previousValue = previous?.metrics.managerialResult.marginPercent ?? null;
    previousYearValue = previousYear?.metrics.managerialResult.marginPercent ?? null;
    previousDelta = previousValue === null ? null : currentValue - previousValue;
    annualDelta = previousYearValue === null ? null : currentValue - previousYearValue;
    formatter = value => formatPercentBR(value, 1);
    primaryLabel = 'Margem operacional';
  }
  if (target === 'payables' || target === 'receivables') {
    const indicatorKey = target === 'payables' ? 'accountsPayableOpen' : 'accountsReceivableOpen';
    currentValue = snapshot.metrics.openItems[indicatorKey].amount;
    previousValue = previous?.metrics.openItems[indicatorKey].amount ?? null;
    previousYearValue = previousYear?.metrics.openItems[indicatorKey].amount ?? null;
    previousDelta = previousValue === null ? null : percentChange(currentValue, previousValue);
    annualDelta = previousYearValue === null ? null : percentChange(currentValue, previousYearValue);
    primaryLabel = target === 'payables' ? 'Total a pagar' : 'Total a receber';
  }

  const expenseShare = metrics.expense === 0 || definition.nature !== 'DESPESA'
    ? null
    : (selectedValue(snapshot, definition, metadata, categoryId) / metrics.expense) * 100;
  const revenueShare = metrics.revenue === 0
    ? null
    : (selectedValue(snapshot, definition, metadata, categoryId) / metrics.revenue) * 100;

  const comparisonFormat = target === 'margin'
    ? (value: number) => `${value.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`
    : (value: number) => formatPercentBR(value, 1);

  return (
    <section aria-label="Indicadores do detalhe" className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">{primaryLabel}</p><p className="mt-2 text-2xl font-bold text-foreground">{semanticMetadataUnavailable ? 'Indisponível' : formatter(currentValue)}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">vs. período anterior</p><p className="mt-2 text-xl font-bold text-foreground">{previousDelta === null ? 'Base indisponível' : comparisonFormat(previousDelta)}</p></CardContent></Card>
      <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">vs. ano anterior</p><p className="mt-2 text-xl font-bold text-foreground">{annualDelta === null ? 'Comparação indisponível' : comparisonFormat(annualDelta)}</p></CardContent></Card>
      <Card>
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Participação</p>
          <p className="mt-2 text-xl font-bold text-foreground">
            {semanticMetadataUnavailable
              ? 'Classificação indisponível'
              : target === 'payables' || target === 'receivables'
                ? 'Fora do resultado operacional'
                : target === 'result'
                  ? `${formatPercentBR(metrics.marginPercent, 1)} da receita`
              : target === 'margin'
                ? 'Resultado / receita'
              : definition.nature === 'DESPESA'
                ? revenueShare === null ? 'Sem receita base' : `${formatPercentBR(revenueShare, 1)} da receita`
                : revenueShare === null ? 'Sem receita base' : `${formatPercentBR(revenueShare, 1)} da receita`}
          </p>
          {expenseShare !== null ? <p className="mt-1 text-xs text-muted-foreground">{formatPercentBR(expenseShare, 1)} da despesa operacional</p> : null}
        </CardContent>
      </Card>
    </section>
  );
}

function FormulaPanel({ target, snapshot }: { target: 'result' | 'margin'; snapshot: PresentationPeriodSnapshot }) {
  const metrics = snapshot.metrics.managerialResult;
  if (target === 'result') {
    return (
      <Card>
        <CardContent className="grid items-center gap-3 p-5 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
          <div><p className="text-xs text-muted-foreground">Receita</p><p className="text-xl font-bold text-success">{fmtBRL(metrics.revenue)}</p></div>
          <span className="text-2xl text-muted-foreground" aria-label="menos">−</span>
          <div><p className="text-xs text-muted-foreground">Despesa</p><p className="text-xl font-bold text-destructive">{fmtBRL(metrics.expense)}</p></div>
          <span className="text-2xl text-muted-foreground" aria-label="igual">=</span>
          <div><p className="text-xs text-muted-foreground">Resultado</p><p className="text-xl font-bold text-foreground">{fmtBRL(metrics.result)}</p></div>
        </CardContent>
      </Card>
    );
  }
  return (
    <Card>
      <CardContent className="grid items-center gap-3 p-5 text-center sm:grid-cols-[1fr_auto_1fr_auto_1fr]">
        <div><p className="text-xs text-muted-foreground">Resultado</p><p className="text-xl font-bold text-foreground">{fmtBRL(metrics.result)}</p></div>
        <span className="text-2xl text-muted-foreground" aria-label="dividido por">÷</span>
        <div><p className="text-xs text-muted-foreground">Receita</p><p className="text-xl font-bold text-success">{fmtBRL(metrics.revenue)}</p></div>
        <span className="text-2xl text-muted-foreground" aria-label="igual">=</span>
        <div><p className="text-xs text-muted-foreground">Margem</p><p className="text-xl font-bold text-foreground">{formatPercentBR(metrics.marginPercent, 1)}</p></div>
      </CardContent>
    </Card>
  );
}

function DetailTrend({
  target,
  snapshot,
  series,
  isLoading,
  error,
}: {
  target: PresentationDetailTarget;
  snapshot: PresentationPeriodSnapshot;
  series?: readonly PresentationDetailSeriesPoint[];
  isLoading: boolean;
  error: unknown;
}) {
  if (isLoading) return <Skeleton className="h-72 w-full" />;
  if (error) return <Alert variant="destructive"><AlertTitle>Erro na evolução</AlertTitle><AlertDescription>Não foi possível carregar a série detalhada.</AlertDescription></Alert>;

  const formulaTarget = target === 'result' || target === 'margin';
  const chartData = formulaTarget
    ? snapshot.timeSeries.points.map(point => ({
        label: formatSeriesLabel(point.key),
        value: target === 'margin' ? point.metrics.marginPercent : point.metrics.result,
      }))
    : (series ?? []).map(point => ({
        label: formatSeriesLabel(point.key),
        value: point.amount,
        percent: point.revenueSharePercent,
      }));

  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">Evolução no período</CardTitle></CardHeader>
      <CardContent>
        {chartData.length === 0 ? <p className="py-16 text-center text-sm text-muted-foreground">Sem evolução disponível.</p> : (
          <div className="h-64" role="img" aria-label="Gráfico de evolução do detalhe">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 2 }}>
                <CartesianGrid {...gridProps} />
                <XAxis dataKey="label" {...axisProps} minTickGap={20} />
                <YAxis yAxisId="amount" {...axisProps} tickFormatter={target === 'margin' ? value => `${value}%` : chartValueFormatters.moneyCompact} width={64} />
                {target === 'cmv' ? <YAxis yAxisId="percent" orientation="right" {...axisProps} tickFormatter={value => `${value}%`} width={48} /> : null}
                <Tooltip
                  {...tooltipProps}
                  content={(
                    <ChartTooltip
                      valueFormatter={(value: number | string, item: ChartTooltipPayloadItem) => (
                        item.name === '% da receita' || target === 'margin'
                          ? formatPercentBR(Number(value), 1)
                          : fmtBRL(Number(value))
                      )}
                    />
                  )}
                />
                <Legend {...legendProps} content={<ChartLegend />} />
                <Line yAxisId="amount" type="monotone" dataKey="value" name={target === 'margin' ? 'Margem' : 'Valor'} stroke="hsl(var(--primary))" strokeWidth={2.5} dot={{ r: 2.5 }} activeDot={makeActiveDot('hsl(var(--primary))')} />
                {target === 'cmv' ? <Line yAxisId="percent" type="monotone" dataKey="percent" name="% da receita" stroke={SEMANTIC_CHART_COLORS.negative} strokeWidth={2} dot={false} activeDot={makeActiveDot(SEMANTIC_CHART_COLORS.negative)} /> : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function flattenDirectRanking(nodes: readonly CategoryCompositionNode[]): PresentationRankingItem[] {
  const items: Array<Omit<PresentationRankingItem, 'rank' | 'sharePercent'>> = [];
  const visit = (list: readonly CategoryCompositionNode[]) => {
    for (const node of list) {
      if (node.directAmount !== 0) {
        items.push({ categoryId: node.categoryId, label: node.name, amount: node.directAmount });
      }
      visit(node.children);
    }
  };
  visit(nodes);
  const total = items.reduce((sum, item) => sum + item.amount, 0);
  return [...items]
    .sort((left, right) => right.amount - left.amount || left.label.localeCompare(right.label, 'pt-BR'))
    .map((item, index) => ({
      ...item,
      rank: index + 1,
      sharePercent: total === 0 ? 0 : (item.amount / total) * 100,
    }));
}

function RankingTable({
  title,
  items,
  onSelectCategory,
}: {
  title: string;
  items: readonly PresentationRankingItem[];
  onSelectCategory: (categoryId?: string) => void;
}) {
  return (
    <Card>
      <CardHeader><CardTitle className="text-sm">{title}</CardTitle></CardHeader>
      <CardContent>
        {items.length === 0 ? <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria no ranking.</p> : (
          <ol className="space-y-2">
            {items.map(item => (
              <li key={`${item.rank}-${item.categoryId ?? item.label}`} className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-center gap-2 rounded-lg border border-border/70 p-3">
                <span className="font-bold text-primary-ink">{item.rank}</span>
                {item.categoryId ? (
                  <button type="button" onClick={() => onSelectCategory(item.categoryId ?? undefined)} className="truncate rounded-sm text-left text-sm font-medium text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                    {item.label}
                  </button>
                ) : <span className="truncate text-sm font-medium">{item.label}</span>}
                <span className="text-right"><span className="block font-mono text-sm font-semibold">{fmtBRL(item.amount)}</span><span className="text-[11px] text-muted-foreground">{formatPercentBR(item.sharePercent, 1)}</span></span>
              </li>
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function detailRowDate(row: PresentationDetailRow): string {
  return row.kind === 'ledger' ? row.effectiveDate : row.dueDate;
}

function DetailRows({
  filters,
  companyId,
}: {
  filters: PresentationDetailFilters;
  companyId: string | null | undefined;
}) {
  const query = usePresentationDetailRows(filters, true, companyId);
  const items = query.data?.pages.flatMap(page => page.items) ?? [];
  const permissionDenied = isPresentationDetailPermissionError(query.error);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between space-y-0">
        <div><CardTitle className="text-sm">{filters.kind === 'ledger' ? 'Lançamentos relacionados' : 'Títulos em aberto'}</CardTitle><p className="mt-1 text-xs text-muted-foreground">Consulta paginada e ordenação estável.</p></div>
        <Badge variant="outline">{items.length} carregado(s)</Badge>
      </CardHeader>
      <CardContent>
        {query.isPending ? <div className="flex items-center justify-center py-12 text-sm text-muted-foreground" role="status"><Loader2 className="mr-2 h-4 w-4 animate-spin" /> Carregando detalhes...</div> : null}
        {permissionDenied ? <Alert variant="destructive"><AlertTitle>Acesso restrito</AlertTitle><AlertDescription>A categoria não pertence à unidade atual ou a permissão financeira foi removida.</AlertDescription></Alert> : null}
        {query.error && !permissionDenied ? <Alert variant="destructive"><AlertTitle>Erro ao carregar linhas</AlertTitle><AlertDescription>Não foi possível consultar os registros relacionados.</AlertDescription></Alert> : null}
        {!query.isPending && !query.error && items.length === 0 ? <div className="flex flex-col items-center justify-center py-12 text-center"><Equal className="mb-2 h-8 w-8 text-muted-foreground/40" /><p className="text-sm font-medium">Nenhum registro relacionado</p><p className="text-xs text-muted-foreground">O período e a classificação selecionados não retornaram linhas.</p></div> : null}
        {items.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border/80">
            <Table>
              <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
              <TableBody>
                {items.map(row => (
                  <TableRow key={row.id}>
                    <TableCell className="whitespace-nowrap text-xs">{formatDateBR(parseLocalDate(detailRowDate(row)))}</TableCell>
                    <TableCell className="min-w-56"><p className="text-sm font-medium">{row.description}</p>{row.kind !== 'ledger' && row.counterparty ? <p className="text-xs text-muted-foreground">{row.counterparty}</p> : null}{row.kind !== 'ledger' && row.daysOverdue > 0 ? <p className="text-xs font-medium text-destructive">{row.daysOverdue} dia(s) em atraso</p> : null}{row.kind !== 'ledger' && row.daysOverdue === 0 ? <p className="text-xs text-muted-foreground">Vence em {row.dueInDays} dia(s)</p> : null}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{row.categoryName ?? 'Sem categoria'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px]">{row.status}</Badge></TableCell>
                    <TableCell className={cn('whitespace-nowrap text-right font-mono text-sm font-semibold', row.kind === 'ledger' && row.nature === 'DESPESA' ? 'text-destructive' : row.kind === 'ledger' ? 'text-success' : '')}>{fmtBRL(row.kind === 'ledger' ? row.classifiedAmount : row.amount)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        ) : null}
        {query.hasNextPage ? <Button type="button" variant="outline" className="mt-4 w-full" disabled={query.isFetchingNextPage} onClick={() => { void query.fetchNextPage(); }}>{query.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}Carregar mais</Button> : null}
      </CardContent>
    </Card>
  );
}

export default function PresentationDetailPage({
  companyId,
  target,
  data,
  categoryMetadata,
  categoryId,
  rankingLimit,
  unitName,
  onBack,
  onSelectCategory,
  planAvailability,
  planCategories = [],
  comparisonMode = 'actual',
  onComparisonModeChange = NOOP_MODE_CHANGE,
  planHasMore = false,
  planLoadingMore = false,
  onPlanLoadMore = NOOP_LOAD_MORE,
}: PresentationDetailPageProps) {
  const definition = DETAIL_DEFINITIONS[target];
  const snapshot = availableData(data.current);
  const nodes = useMemo(
    () => snapshot ? detailNodes(snapshot, definition, categoryMetadata) : [],
    [categoryMetadata, definition, snapshot],
  );
  const categoryPath = categoryId ? findCategoryPath(nodes, categoryId) : null;
  const filters: PresentationDetailFilters = {
    range: data.period,
    kind: definition.rowsKind,
    nature: definition.nature,
    categoryId,
    group: definition.group,
  };
  const seriesQuery = usePresentationDetailSeries(
    {
      range: data.period,
      nature: definition.nature,
      categoryId,
      group: definition.group,
    },
    snapshot?.timeSeries.granularity ?? 'month',
    Boolean(snapshot && definition.rowsKind === 'ledger' && target !== 'result' && target !== 'margin'),
    companyId,
  );
  const rankings = useMemo(() => {
    if (!snapshot) return [];
    if (target === 'cmv') return flattenDirectRanking(nodes);
    if (definition.nature === 'RECEITA') return snapshot.rankings.topRevenueCategories;
    if (definition.nature === 'DESPESA') return snapshot.rankings.topExpenseCategories;
    return [];
  }, [definition.nature, nodes, snapshot, target]);
  const Icon = definition.icon;

  if (!snapshot) {
    return <Alert variant="destructive"><AlertTitle>Detalhe indisponível</AlertTitle><AlertDescription>O período atual não possui um retrato financeiro disponível.</AlertDescription></Alert>;
  }

  const planScopedValue = selectedValue(snapshot, definition, categoryMetadata, categoryId);
  const planExpectedActual = definition.nature === 'RECEITA'
    ? { revenue: planScopedValue, expense: 0, result: planScopedValue }
    : definition.nature === 'DESPESA' && target !== 'cmv'
      ? { revenue: 0, expense: planScopedValue, result: -planScopedValue }
      : snapshot.metrics.managerialResult;

  return (
    <article className="space-y-4" aria-labelledby="presentation-detail-title">
      <nav aria-label="Navegação estrutural do detalhe" className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
        <button type="button" onClick={onBack} className="rounded px-1 py-0.5 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Apresentação Sócios</button>
        <ChevronRight className="h-3 w-3" aria-hidden="true" />
        <button type="button" onClick={() => onSelectCategory(undefined)} className="rounded px-1 py-0.5 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{definition.title}</button>
        {categoryPath?.map(node => node.categoryId ? (
          <span key={node.categoryId} className="inline-flex items-center gap-1"><ChevronRight className="h-3 w-3" aria-hidden="true" /><button type="button" onClick={() => onSelectCategory(node.categoryId ?? undefined)} className="rounded px-1 py-0.5 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">{node.name}</button></span>
        ) : null)}
      </nav>

      <header className="flex flex-wrap items-start justify-between gap-3 rounded-xl border border-border/80 bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="rounded-lg bg-primary/10 p-2.5"><Icon className="h-5 w-5 text-primary-ink" aria-hidden="true" /></span>
          <div><h2 id="presentation-detail-title" className="text-xl font-bold text-foreground">{categoryPath?.at(-1)?.name ?? definition.title}</h2><p className="mt-1 text-sm text-muted-foreground">{definition.description}</p><p className="mt-2 text-xs text-muted-foreground">{data.periodLabel} • {unitName ?? 'Unidade atual'} • {snapshot.timeSeries.granularity}</p></div>
        </div>
        <Button type="button" variant="outline" onClick={onBack} aria-label="Voltar para a Apresentação Sócios"><ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Voltar</Button>
      </header>

      {target === 'cmv' && !categoryMetadata ? <Alert><AlertTitle>Classificação gerencial indisponível</AlertTitle><AlertDescription>O CMV não é inferido pelo nome. O detalhe ficará vazio até os metadados tenant-scoped estarem disponíveis.</AlertDescription></Alert> : null}

      <DetailKpis target={target} definition={definition} data={data} snapshot={snapshot} metadata={categoryMetadata} categoryId={categoryId} />

      {definition.rowsKind === 'ledger' && planAvailability?.state === 'available' ? (
        <PresentationPlanComparison
          plan={planAvailability.data}
          categories={planCategories}
          mode={comparisonMode}
          onModeChange={onComparisonModeChange}
          expectedActual={planExpectedActual}
          focusTarget={target}
          hasMore={planHasMore}
          loadingMore={planLoadingMore}
          onLoadMore={onPlanLoadMore}
          compact
        />
      ) : definition.rowsKind === 'ledger' && (planAvailability?.state === 'loading' || planAvailability?.state === 'idle') ? (
        <Card id="presentation-plan" aria-busy="true">
          <CardContent className="flex items-center gap-2 p-5 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando comparação com o plano...
          </CardContent>
        </Card>
      ) : definition.rowsKind === 'ledger' && planAvailability?.state === 'error' ? (
        <Alert variant="destructive" id="presentation-plan">
          <AlertTitle>Planejamento indisponível</AlertTitle>
          <AlertDescription>{planAvailability.message} O detalhe realizado permanece disponível.</AlertDescription>
        </Alert>
      ) : null}

      {target === 'result' || target === 'margin' ? <FormulaPanel target={target} snapshot={snapshot} /> : null}

      {definition.rowsKind === 'ledger' ? <DetailTrend target={target} snapshot={snapshot} series={seriesQuery.data} isLoading={seriesQuery.isPending && seriesQuery.fetchStatus !== 'idle'} error={seriesQuery.error} /> : null}

      {target === 'result' || target === 'margin' ? (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Composição do resultado">
          <PresentationFinancialTree title="Receitas que favorecem o resultado" nodes={snapshot.categoryComposition.operational.revenue} tone="revenue" onSelectNode={node => node.categoryId && onSelectCategory(node.categoryId, 'revenue')} />
          <PresentationFinancialTree title="Despesas que pressionam o resultado" nodes={snapshot.categoryComposition.operational.expense} tone="expense" onSelectNode={node => node.categoryId && onSelectCategory(node.categoryId, 'expense')} />
        </section>
      ) : definition.rowsKind === 'ledger' ? (
        <PresentationFinancialTree title={`Composição — ${definition.title}`} nodes={categoryPath ? categoryPath.at(-1)?.children ?? [] : nodes} tone={definition.tone === 'revenue' ? 'revenue' : 'expense'} onSelectNode={node => node.categoryId && onSelectCategory(node.categoryId)} />
      ) : null}

      {target === 'result' || target === 'margin' ? (
        <section className="grid gap-4 lg:grid-cols-2" aria-label="Categorias que influenciam o resultado">
          <RankingTable title="Categorias que mais favorecem" items={snapshot.rankings.topRevenueCategories.slice(0, rankingLimit)} onSelectCategory={category => onSelectCategory(category, 'revenue')} />
          <RankingTable title="Categorias que mais pressionam" items={snapshot.rankings.topExpenseCategories.slice(0, rankingLimit)} onSelectCategory={category => onSelectCategory(category, 'expense')} />
        </section>
      ) : null}

      {rankings.length > 0 || target.startsWith('ranking-') || target === 'cmv' ? <RankingTable title={target === 'cmv' ? 'Maiores pressões do CMV' : definition.nature === 'RECEITA' ? 'Maiores receitas' : 'Maiores despesas'} items={rankings.slice(0, rankingLimit)} onSelectCategory={onSelectCategory} /> : null}

      <DetailRows filters={filters} companyId={companyId} />
    </article>
  );
}

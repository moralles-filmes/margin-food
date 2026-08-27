import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Equal,
  Info,
  Loader2,
  Target,
} from 'lucide-react';
import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import {
  buildPresentationPlanIndicators,
  presentationPlanActualMatches,
  presentationPlanHasConfiguredTarget,
  selectedPresentationPlanValue,
  type PresentationComparisonMode,
  type PresentationPlanCategory,
  type PresentationPlanData,
  type PresentationPlanIndicator,
  type PresentationPlanMetricKey,
  type PresentationPlanStatus,
} from '@/domain/financeiro/presentation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  fmtBRL,
  fmtBRLCompact,
  formatDateBR,
  formatPercentBR,
  parseLocalDate,
} from '@/lib/formatters';
import { cn } from '@/lib/utils';

const MODE_LABELS: Record<PresentationComparisonMode, string> = {
  actual: 'Realizado',
  budget: 'Orçado',
  projection: 'Projeção',
};

const STATUS_STYLE: Record<PresentationPlanStatus, string> = {
  favorable: 'border-success/30 bg-success/10 text-success',
  unfavorable: 'border-destructive/30 bg-destructive/10 text-destructive',
  'on-target': 'border-info/30 bg-info/10 text-foreground',
  'not-configured': 'border-border bg-muted/50 text-muted-foreground',
  partial: 'border-warning/30 bg-warning/10 text-warning',
  unavailable: 'border-border bg-muted/50 text-muted-foreground',
};

function indicatorForTarget(
  target: string | undefined,
): PresentationPlanMetricKey | null {
  if (target === 'revenue' || target === 'ranking-revenue') return 'revenue';
  if (target === 'expense' || target === 'ranking-expense') return 'expense';
  if (target === 'result') return 'result';
  if (target === 'margin') return 'margin';
  if (target === 'cmv') return 'cmv';
  return null;
}

function formatIndicatorValue(indicator: PresentationPlanIndicator, value: number | null): string {
  if (value === null) return indicator.key === 'margin' ? 'Indisponível' : 'Meta não configurada';
  return indicator.unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 1);
}

function formatDeviation(indicator: PresentationPlanIndicator): string {
  if (indicator.deviation === null) return indicator.statusLabel;
  if (indicator.deviationUnit === 'percentage-points') {
    return `${indicator.deviation.toLocaleString('pt-BR', {
      minimumFractionDigits: 1,
      maximumFractionDigits: 1,
    })} p.p.`;
  }
  const relative = indicator.deviationPercent === null
    ? ''
    : ` (${formatPercentBR(indicator.deviationPercent, 1)})`;
  return `${fmtBRL(indicator.deviation)}${relative}`;
}

export function PresentationPlanModeToggle({
  mode,
  onChange,
}: {
  mode: PresentationComparisonMode;
  onChange: (mode: PresentationComparisonMode) => void;
}) {
  return (
    <div className="inline-flex rounded-lg border border-border bg-muted/40 p-1" role="group" aria-label="Modo de comparação executiva">
      {(Object.keys(MODE_LABELS) as PresentationComparisonMode[]).map(item => (
        <Button
          key={item}
          type="button"
          size="sm"
          variant={mode === item ? 'secondary' : 'ghost'}
          aria-pressed={mode === item}
          onClick={() => onChange(item)}
          className="h-8 px-3 text-xs"
        >
          {MODE_LABELS[item]}
        </Button>
      ))}
    </div>
  );
}

function StatusBadge({ status, label }: { status: PresentationPlanStatus; label: string }) {
  const Icon = status === 'favorable'
    ? CheckCircle2
    : status === 'unfavorable'
      ? AlertTriangle
      : status === 'on-target'
        ? Equal
        : CircleHelp;
  return (
    <Badge variant="outline" className={cn('gap-1 text-[10px]', STATUS_STYLE[status])}>
      <Icon className="h-3 w-3" aria-hidden="true" /> {label}
    </Badge>
  );
}

function IndicatorCard({
  indicator,
  mode,
}: {
  indicator: PresentationPlanIndicator;
  mode: PresentationComparisonMode;
}) {
  const selected = selectedPresentationPlanValue(indicator, mode);
  const DeltaIcon = indicator.deviation === null || indicator.deviation === 0
    ? Equal
    : indicator.deviation > 0 ? ArrowUpRight : ArrowDownRight;
  return (
    <Card className="border-border/80 shadow-sm">
      <CardContent className="space-y-3 p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-xs text-muted-foreground">{indicator.label}</p>
            <p className="mt-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{MODE_LABELS[mode]}</p>
          </div>
          <Target className="h-4 w-4 text-gold-dark dark:text-primary" aria-hidden="true" />
        </div>
        <p className="text-xl font-bold text-foreground">{formatIndicatorValue(indicator, selected)}</p>
        <StatusBadge status={indicator.status} label={indicator.statusLabel} />
        <div className="space-y-1 border-t border-border/70 pt-2 text-[11px]">
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Realizado</span><strong>{formatIndicatorValue(indicator, indicator.actual)}</strong></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Orçado</span><strong>{formatIndicatorValue(indicator, indicator.budget)}</strong></p>
          <p className="flex justify-between gap-2"><span className="text-muted-foreground">Projeção</span><strong>{formatIndicatorValue(indicator, indicator.projection)}</strong></p>
          <p className="flex items-center justify-between gap-2 pt-1">
            <span className="text-muted-foreground">Desvio</span>
            <strong className="inline-flex items-center gap-1"><DeltaIcon className="h-3 w-3" aria-hidden="true" />{formatDeviation(indicator)}</strong>
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function formatSeriesLabel(key: string): string {
  if (/^\d{4}$/.test(key)) return key;
  if (/^\d{4}-\d{2}$/.test(key)) {
    const [year, month] = key.split('-').map(Number);
    return new Intl.DateTimeFormat('pt-BR', { month: 'short', year: '2-digit' })
      .format(new Date(year, month - 1, 1));
  }
  return formatDateBR(parseLocalDate(key));
}

function ComparativeCharts({ plan }: { plan: PresentationPlanData }) {
  const chartData = plan.series.map(point => ({
    label: formatSeriesLabel(point.key),
    receitaRealizada: point.actual.revenue,
    receitaOrcada: point.budget.revenue,
    despesaRealizada: point.actual.expense,
    despesaOrcada: point.budget.expense,
    cmvPercent: point.actual.cmvPercent,
  }));
  const hasCmvTarget = plan.budget.cmvTargetState === 'available'
    && plan.budget.cmvTargetPercent !== null;

  return (
    <div className="grid gap-4 xl:grid-cols-[minmax(0,2fr)_minmax(280px,1fr)]">
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">Realizado x orçamento no período</CardTitle>
          <p className="text-xs text-muted-foreground">Linhas tracejadas representam o orçamento proporcional aos dias de cada intervalo.</p>
        </CardHeader>
        <CardContent>
          <div className="h-72" role="img" aria-label="Gráfico comparativo de receitas e despesas realizadas e orçadas">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={fmtBRLCompact} tick={{ fontSize: 10 }} width={64} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => fmtBRL(value)} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="receitaRealizada" name="Receita realizada" stroke="hsl(var(--success))" strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="receitaOrcada" name="Receita orçada" stroke="hsl(var(--success))" strokeDasharray="6 4" strokeWidth={2} dot={false} connectNulls={false} />
                <Line type="monotone" dataKey="despesaRealizada" name="Despesa realizada" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
                <Line type="monotone" dataKey="despesaOrcada" name="Despesa orçada" stroke="hsl(var(--destructive))" strokeDasharray="6 4" strokeWidth={2} dot={false} connectNulls={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm">CMV sobre receita</CardTitle>
          <p className="text-xs text-muted-foreground">A meta só aparece quando `metas_cmv` está configurada de forma consistente no período.</p>
        </CardHeader>
        <CardContent>
          <div className="h-72" role="img" aria-label="Gráfico de participação do CMV na receita com linha de meta configurada">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 10, right: 14, left: 0, bottom: 2 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} minTickGap={20} axisLine={false} tickLine={false} />
                <YAxis tickFormatter={value => `${value}%`} tick={{ fontSize: 10 }} width={46} axisLine={false} tickLine={false} />
                <Tooltip formatter={(value: number) => formatPercentBR(value, 1)} />
                <Legend iconType="circle" iconSize={7} wrapperStyle={{ fontSize: 11 }} />
                <Line type="monotone" dataKey="cmvPercent" name="CMV realizado" stroke="hsl(var(--destructive))" strokeWidth={2.5} dot={{ r: 2 }} connectNulls={false} />
                {hasCmvTarget ? (
                  <ReferenceLine
                    y={plan.budget.cmvTargetPercent ?? undefined}
                    stroke="hsl(var(--primary))"
                    strokeDasharray="6 4"
                    label={{ value: `Meta ${formatPercentBR(plan.budget.cmvTargetPercent ?? 0, 1)}`, fill: 'hsl(var(--foreground))', fontSize: 11 }}
                  />
                ) : null}
              </LineChart>
            </ResponsiveContainer>
          </div>
          {!hasCmvTarget ? <p className="text-center text-xs text-muted-foreground">Meta de CMV não configurada ou inconsistente no período.</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function categoryStatus(category: PresentationPlanCategory): Pick<PresentationPlanIndicator, 'status' | 'statusLabel'> {
  if (!category.budgetConfigured || category.budgetAmount === null) {
    return { status: 'not-configured', statusLabel: 'Meta não configurada' };
  }
  if (!category.coverageComplete || category.varianceAmount === null) {
    return { status: 'partial', statusLabel: 'Orçamento parcial' };
  }
  if (Math.abs(category.varianceAmount) < 0.005) {
    return { status: 'on-target', statusLabel: 'Em linha com a meta' };
  }
  const favorable = category.nature === 'RECEITA'
    ? category.varianceAmount > 0
    : category.varianceAmount < 0;
  return favorable
    ? { status: 'favorable', statusLabel: 'Variação favorável' }
    : { status: 'unfavorable', statusLabel: 'Variação desfavorável' };
}

function CategoriesTable({
  categories,
  hasMore,
  loadingMore,
  onLoadMore,
}: {
  categories: readonly PresentationPlanCategory[];
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore?: () => void;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm">Categorias: realizado, orçamento e desvio</CardTitle>
        <p className="text-xs text-muted-foreground">O acumulado do pai é informativo; os totais usam apenas orçamentos efetivos, sem somar pais e filhos novamente.</p>
      </CardHeader>
      <CardContent>
        {categories.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma categoria com realizado ou orçamento neste recorte.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead>Natureza</TableHead>
                  <TableHead className="text-right">Realizado</TableHead>
                  <TableHead className="text-right">Orçado</TableHead>
                  <TableHead className="text-right">Desvio</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Participação</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map(category => {
                  const status = categoryStatus(category);
                  return (
                    <TableRow key={category.categoryId}>
                      <TableCell>
                        <span className="block font-medium" style={{ paddingLeft: `${Math.min(category.depth, 4) * 0.75}rem` }}>
                          {category.depth > 0 ? '↳ ' : ''}{category.name}
                        </span>
                        {category.effectiveGroup === 'cmv' ? <span className="text-[10px] text-muted-foreground">Grupo semântico: CMV</span> : null}
                      </TableCell>
                      <TableCell>{category.nature === 'RECEITA' ? 'Receita' : 'Despesa'}</TableCell>
                      <TableCell className="text-right font-mono">{fmtBRL(category.actualAmount)}</TableCell>
                      <TableCell className="text-right font-mono">{category.budgetAmount === null ? 'Meta não configurada' : fmtBRL(category.budgetAmount)}</TableCell>
                      <TableCell className="text-right font-mono">
                        {category.varianceAmount === null ? 'Indisponível' : (
                          <span>{fmtBRL(category.varianceAmount)}{category.variancePercent === null ? '' : ` (${formatPercentBR(category.variancePercent, 1)})`}</span>
                        )}
                      </TableCell>
                      <TableCell><StatusBadge status={status.status} label={status.statusLabel} /></TableCell>
                      <TableCell className="text-right">{category.revenueSharePercent === null ? 'Sem receita base' : formatPercentBR(category.revenueSharePercent, 1)}</TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        {hasMore && onLoadMore ? (
          <div className="mt-4 text-center">
            <Button type="button" variant="outline" size="sm" onClick={onLoadMore} disabled={loadingMore}>
              {loadingMore ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Carregar mais categorias
            </Button>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Variations({ plan }: { plan: PresentationPlanData }) {
  const sections = [
    { key: 'favorable' as const, title: 'Maiores variações favoráveis', icon: CheckCircle2, className: 'text-success' },
    { key: 'unfavorable' as const, title: 'Maiores variações desfavoráveis', icon: AlertTriangle, className: 'text-destructive' },
  ];
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {sections.map(section => {
        const Icon = section.icon;
        const items = plan.variations[section.key];
        return (
          <Card key={section.key}>
            <CardHeader className="pb-2"><CardTitle className={cn('flex items-center gap-2 text-sm', section.className)}><Icon className="h-4 w-4" aria-hidden="true" />{section.title}</CardTitle></CardHeader>
            <CardContent>
              {items.length === 0 ? <p className="text-xs text-muted-foreground">Sem variações comparáveis.</p> : (
                <ol className="space-y-2">
                  {items.map(item => (
                    <li key={item.categoryId} className="flex items-center justify-between gap-3 border-b border-border/60 pb-2 text-sm">
                      <span className="min-w-0 truncate">{item.name}</span>
                      <span className="whitespace-nowrap font-mono font-semibold">{fmtBRL(item.varianceAmount)}</span>
                    </li>
                  ))}
                </ol>
              )}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

export interface PresentationPlanComparisonProps {
  plan: PresentationPlanData;
  categories?: readonly PresentationPlanCategory[];
  mode: PresentationComparisonMode;
  onModeChange: (mode: PresentationComparisonMode) => void;
  expectedActual: { revenue: number; expense: number; result: number };
  focusTarget?: string;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  compact?: boolean;
}

export default function PresentationPlanComparison({
  plan,
  categories = plan.categories.items,
  mode,
  onModeChange,
  expectedActual,
  focusTarget,
  hasMore = false,
  loadingMore = false,
  onLoadMore,
  compact = false,
}: PresentationPlanComparisonProps) {
  const canonicalMatches = presentationPlanActualMatches(plan, expectedActual);
  const focusKey = indicatorForTarget(focusTarget);
  const indicators = buildPresentationPlanIndicators(plan)
    .filter(indicator => focusKey === null || indicator.key === focusKey);
  const hasTargets = presentationPlanHasConfiguredTarget(plan);

  if (!canonicalMatches) {
    return (
      <Alert variant="destructive">
        <AlertTriangle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Comparação executiva indisponível</AlertTitle>
        <AlertDescription>O realizado retornado pelo orçamento divergiu da fonte canônica da apresentação. Nenhum desvio foi exibido.</AlertDescription>
      </Alert>
    );
  }

  return (
    <section id="presentation-plan" aria-labelledby="presentation-plan-title" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 id="presentation-plan-title" className="text-sm font-semibold text-foreground">Metas, orçamento e projeção</h2>
          <p className="text-xs text-muted-foreground">Comparação por competência, sem contas em aberto e sem valores presumidos.</p>
        </div>
        <PresentationPlanModeToggle mode={mode} onChange={onModeChange} />
      </div>

      {!hasTargets ? (
        <Alert>
          <Info className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Meta não configurada</AlertTitle>
          <AlertDescription>Não há orçamento monetário nem meta percentual confiável para o período. O realizado continua disponível sem assumir zero como meta.</AlertDescription>
        </Alert>
      ) : null}

      {plan.hierarchyConflictCount > 0 ? (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Conflito hierárquico no orçamento</AlertTitle>
          <AlertDescription>{plan.hierarchyConflictCount} orçamento(s) de pai foram ignorados porque há valores mais específicos nos filhos para o mesmo mês.</AlertDescription>
        </Alert>
      ) : null}

      <div className={cn('grid gap-3 sm:grid-cols-2', compact ? 'xl:grid-cols-1' : 'xl:grid-cols-5')}>
        {indicators.map(indicator => <IndicatorCard key={indicator.key} indicator={indicator} mode={mode} />)}
      </div>

      {!compact ? <ComparativeCharts plan={plan} /> : null}

      <Alert>
        <Info className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Fórmulas e hipóteses auditáveis</AlertTitle>
        <AlertDescription className="space-y-1">
          <p>Orçamento: {plan.rules.budgetProration}. Precedência: {plan.rules.hierarchyPrecedence}.</p>
          <p>Projeção: {plan.rules.projectionFormula}; amostra de {plan.projection.sampleDays} de {plan.projection.totalDays} dias, corte em {formatDateBR(parseLocalDate(plan.projection.cutoffDate))}.</p>
          <p>Margem = resultado / receita. Receita zero e amostra inferior a 7 dias retornam indisponível. Contas em aberto não entram no resultado nem na projeção.</p>
        </AlertDescription>
      </Alert>

      <CategoriesTable categories={categories} hasMore={hasMore} loadingMore={loadingMore} onLoadMore={onLoadMore} />
      {!compact ? <Variations plan={plan} /> : null}
    </section>
  );
}

import { useMemo } from 'react';
import type {
  CategoryCompositionSection,
  PresentationPlanData,
  PresentationRankingItem,
  PresentationSlide,
  PresentationScenarioResult,
  PresentationDecisionDetail,
  PresentationDecisionComparison,
  PresentationRevenueData,
  PresentationRevenuePeriodSummary,
  PresentationRevenueBrandPoint,
  PresentationRevenueGrossToNetPeriod,
  PresentationExpensesData,
  PresentationExpensesPeriodSummary,
  PresentationExpenseNode,
  PresentationResultsData,
  PresentationResultBridgeStep,
  PresentationInsight,
  PresentationTimeSeries,
} from '@/domain/financeiro/presentation';
import { buildPresentationPlanIndicators } from '@/domain/financeiro/presentation';
import { cn } from '@/lib/utils';
import {
  PRESENTATION_REGIME_LABEL,
  PRESENTATION_SOURCE_LABEL,
  availabilityMessage,
  buildExecutiveMetricDisplays,
  formatMetricDelta,
  flattenPresentationCategories,
  formatPresentationSeriesLabel,
  presentationGeneratedLabel,
  presentationActionStatusLabel,
  presentationDecisionStatusLabel,
} from '@/lib/presentationFormatting';
import { fmtBRL, fmtBRLCompact, formatIntegerBR, formatPercentBR } from '@/lib/formatters';
import {
  presentationInsightEvidenceLabel,
  presentationInsightRegimeLabel,
} from '@/lib/presentationInsightsFormatting';

interface PresentationSlideCanvasProps {
  slide: PresentationSlide;
  generatedAt: string;
  slideNumber: number;
  totalSlides: number;
  className?: string;
  onOpenExpenseCategory?: (categoryId: string) => void;
  onOpenResultDetail?: (target: 'revenue' | 'expense' | 'result' | 'margin') => void;
}

const TONE_CLASSES = {
  positive: 'text-success',
  negative: 'text-destructive',
  result: 'text-foreground',
  neutral: 'text-foreground',
} as const;

const REVENUE_SOURCE_FOOTER = 'Faturamento bruto — Fechamento de Caixa · Data local do fechamento';
const EXPENSES_SOURCE_FOOTER = 'Despesas financeiras — DFC · Regime de caixa';
const RESULTS_SOURCE_FOOTER = 'Resultado operacional — mesmo regime de caixa do Dashboard · Fonte: get_fin_presentation_socios';
const INSIGHTS_SOURCE_FOOTER = 'Insights determinísticos · fonte canônica identificada em cada insight';

function formatYearMonthLabel(month: string): string {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1;
  return new Date(year, monthIndex, 1).toLocaleDateString('pt-BR', {
    month: 'long',
    year: 'numeric',
  });
}

function revenuePeriodValue(period: PresentationRevenuePeriodSummary): string {
  if (period.state === 'available') return fmtBRL(period.total);
  if (period.state === 'empty') return 'Sem fechamentos';
  return 'Sem cobertura';
}

function revenueDeltaValue(
  delta: PresentationRevenueData['delta']['absolute'],
  percentage = false,
): string {
  if (delta.state === 'available') {
    return percentage ? formatPercentBR(delta.value, 1) : fmtBRL(delta.value);
  }
  if (delta.reason === 'zero-baseline') return 'Base anterior zero';
  if (delta.reason === 'previous-period-absent') return 'Mês anterior ausente';
  return 'Mês selecionado ausente';
}

function RevenueSummaryLayout({ revenue }: { revenue: PresentationRevenueData }) {
  const periods = [
    { label: 'Mês selecionado', period: revenue.current, strong: true },
    { label: 'Mês anterior', period: revenue.previous, strong: false },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
      <div className="grid grid-cols-2 gap-10">
        {periods.map(({ label, period, strong }) => (
          <section key={period.month} className="border-l-2 border-primary pl-5">
            <p className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 capitalize text-[clamp(0.82rem,1.2cqw,1.2rem)] text-ink-secondary">{formatYearMonthLabel(period.month)}</p>
            <p className={cn(
              'mt-4 break-words text-[clamp(1.6rem,3.2cqw,3.1rem)] font-bold tracking-tight',
              strong ? 'text-foreground' : 'text-ink-secondary',
            )}>
              {revenuePeriodValue(period)}
            </p>
            <p className="mt-3 text-[clamp(0.68rem,0.9cqw,0.9rem)] text-muted-foreground">
              {period.closingCount === 0
                ? '0 ocorrências · ausência não convertida em faturamento zero'
                : `${formatIntegerBR(period.closingCount)} fechamento(s)`}
            </p>
          </section>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-8 border-t border-border pt-5">
        <div>
          <p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Variação absoluta</p>
          <p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{revenueDeltaValue(revenue.delta.absolute)}</p>
        </div>
        <div>
          <p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Variação percentual</p>
          <p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{revenueDeltaValue(revenue.delta.percentage, true)}</p>
        </div>
      </div>
    </div>
  );
}

function grossToNetDifferenceText(period: PresentationRevenueGrossToNetPeriod, percentage = false): string {
  if (percentage) {
    return period.differencePercent.state === 'available'
      ? formatPercentBR(period.differencePercent.value, 1)
      : 'Bruto zero ou negativo';
  }
  return fmtBRL(period.difference);
}

function RevenueGrossNetLayout({ revenue }: { revenue: PresentationRevenueData }) {
  const rows = [
    { label: 'Mês selecionado', gross: revenue.current, net: revenue.netRevenue.current, diff: revenue.grossToNet.current, strong: true },
    { label: 'Mês anterior', gross: revenue.previous, net: revenue.netRevenue.previous, diff: revenue.grossToNet.previous, strong: false },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
      <div className="grid grid-cols-2 gap-10">
        {rows.map(({ label, gross, net, diff, strong }) => (
          <section key={gross.month} className="border-l-2 border-primary pl-5">
            <p className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold uppercase tracking-wide text-muted-foreground">{label}</p>
            <p className="mt-2 capitalize text-[clamp(0.82rem,1.2cqw,1.2rem)] text-ink-secondary">{formatYearMonthLabel(gross.month)}</p>
            <div className="mt-4 grid grid-cols-2 gap-4">
              <div>
                <p className="text-[clamp(0.6rem,0.78cqw,0.78rem)] text-muted-foreground">Bruto (Fechamento de Caixa)</p>
                <p className={cn('mt-1 break-words text-[clamp(1.1rem,2cqw,2rem)] font-bold tracking-tight', strong ? 'text-foreground' : 'text-ink-secondary')}>{fmtBRL(diff.gross)}</p>
              </div>
              <div>
                <p className="text-[clamp(0.6rem,0.78cqw,0.78rem)] text-muted-foreground">Líquido (Livro Razão)</p>
                <p className={cn('mt-1 break-words text-[clamp(1.1rem,2cqw,2rem)] font-bold tracking-tight', strong ? 'text-foreground' : 'text-ink-secondary')}>{fmtBRL(net.total)}</p>
              </div>
            </div>
          </section>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-8 border-t border-border pt-5">
        <div>
          <p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Diferença (mês selecionado)</p>
          <p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{grossToNetDifferenceText(revenue.grossToNet.current)}</p>
        </div>
        <div>
          <p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">% da diferença sobre o bruto</p>
          <p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{grossToNetDifferenceText(revenue.grossToNet.current, true)}</p>
        </div>
      </div>
      <p className="text-[clamp(0.58rem,0.75cqw,0.75rem)] text-muted-foreground">Bruto: financeiro_fechamento_caixa.faturamento_bruto · Líquido: receita operacional do livro razão (regime de caixa, exclui não operacionais e excluídos de relatório) — mesma base do KPI &quot;Receita operacional&quot; de Resultados.</p>
    </div>
  );
}

function RevenueByBrandLayout({ revenue }: { revenue: PresentationRevenueData }) {
  const total = revenue.current.total;
  const items = [...revenue.byBrand].sort((left, right) => right.total - left.total);
  if (items.length === 0) return <EmptyState message="Sem faturamento no mês selecionado." />;
  return (
    <div className="min-h-0 flex-1">
      <ol className="space-y-2.5">
        {items.map((item: PresentationRevenueBrandPoint, index) => (
          <li key={item.marcaId ?? 'sem-marca'} className="grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border pb-2.5">
            <span className="text-center text-[clamp(1rem,1.5cqw,1.45rem)] font-bold text-primary-ink">{index + 1}</span>
            <div className="min-w-0">
              <p className="break-words text-[clamp(0.78rem,1.15cqw,1.1rem)] font-medium leading-tight text-foreground">{item.nome}</p>
              <p className="text-[clamp(0.65rem,0.8cqw,0.82rem)] text-muted-foreground">
                {total > 0 ? formatPercentBR((item.total / total) * 100, 1) : '—'} do bruto do mês · {formatIntegerBR(item.closingCount)} fechamento(s)
              </p>
            </div>
            <strong className="whitespace-nowrap font-mono text-[clamp(0.76rem,1.05cqw,1rem)] text-success">{fmtBRL(item.total)}</strong>
          </li>
        ))}
      </ol>
    </div>
  );
}

function RevenueWeekdaysLayout({ revenue }: { revenue: PresentationRevenueData }) {
  return (
    <div className="grid min-h-0 flex-1 grid-cols-7 items-stretch gap-3">
      {revenue.weekdays.map(day => (
        <section key={day.isoWeekday} className="flex min-w-0 flex-col border-t-2 border-primary pt-3">
          <h3 className="min-h-9 text-[clamp(0.62rem,0.86cqw,0.86rem)] font-semibold leading-tight text-foreground">{day.label}</h3>
          <p className="mt-3 text-[clamp(0.54rem,0.68cqw,0.68rem)] uppercase tracking-wide text-muted-foreground">Total</p>
          <p className="mt-1 break-words text-[clamp(0.7rem,1cqw,1rem)] font-bold text-foreground">
            {day.state === 'available' ? fmtBRL(day.total) : 'Sem fechamento'}
          </p>
          <p className="mt-4 text-[clamp(0.54rem,0.68cqw,0.68rem)] uppercase tracking-wide text-muted-foreground">Ocorrências</p>
          <p className="mt-1 text-[clamp(0.72rem,1cqw,1rem)] font-semibold text-ink-secondary">{formatIntegerBR(day.occurrences)}</p>
          <p className="mt-4 text-[clamp(0.54rem,0.68cqw,0.68rem)] uppercase tracking-wide text-muted-foreground">Média</p>
          <p className="mt-1 break-words text-[clamp(0.66rem,0.92cqw,0.92rem)] font-semibold text-ink-secondary">
            {day.average.state === 'available' ? fmtBRL(day.average.value) : 'Não aplicável'}
          </p>
        </section>
      ))}
    </div>
  );
}

function RevenueHistoryLayout({ revenue }: { revenue: PresentationRevenueData }) {
  const pointsByYear = new Map(revenue.requestedYears.map(year => [
    year,
    revenue.history.filter(point => point.year === year),
  ]));
  const monthLabels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div className="grid grid-cols-[3.5rem_repeat(12,minmax(0,1fr))] gap-x-1 gap-y-3 text-center">
        <span aria-hidden="true" />
        {monthLabels.map(label => <span key={label} className="text-[clamp(0.54rem,0.7cqw,0.7rem)] font-semibold text-muted-foreground">{label}</span>)}
        {revenue.requestedYears.flatMap(year => [
          <strong key={`${year}-label`} className="self-center text-left text-[clamp(0.68rem,0.9cqw,0.9rem)] text-foreground">{year}</strong>,
          ...(pointsByYear.get(year) ?? []).map(point => (
            <div
              key={point.yearMonth}
              className={cn(
                'flex min-h-12 flex-col items-center justify-center rounded border px-0.5',
                point.state === 'available'
                  ? 'border-primary-border bg-primary-soft text-primary-soft-foreground'
                  : 'border-border bg-background-subtle text-muted-foreground',
              )}
              title={`${formatYearMonthLabel(point.yearMonth)}: ${point.state === 'available' ? `${fmtBRL(point.total)} em ${point.closingCount} fechamento(s)` : point.state === 'empty' ? 'sem fechamentos' : 'sem cobertura'}`}
            >
              <span className="text-[clamp(0.5rem,0.62cqw,0.62rem)] font-semibold leading-tight">
                {point.state === 'available' ? fmtBRLCompact(point.total) : '—'}
              </span>
              <span className="mt-1 text-[clamp(0.43rem,0.52cqw,0.52rem)] text-muted-foreground">
                {point.state === 'available' ? `${point.closingCount} fecha.` : point.state === 'empty' ? 'vazio' : 's/ cobertura'}
              </span>
            </div>
          )),
        ])}
      </div>
    </div>
  );
}

function expensePeriodValue(period: PresentationExpensesPeriodSummary): string {
  if (period.state === 'available') return fmtBRL(period.total);
  if (period.state === 'empty') return 'Sem despesas';
  return 'Sem cobertura';
}

function expenseDeltaValue(
  delta: PresentationExpensesData['delta']['absolute'],
  percentage = false,
): string {
  if (delta.state === 'available') return percentage ? formatPercentBR(delta.value, 1) : fmtBRL(delta.value);
  if (delta.reason === 'zero-baseline') return 'Base anterior zero';
  return delta.reason === 'previous-period-absent' ? 'Mês anterior ausente' : 'Mês selecionado ausente';
}

/**
 * Soma o `amount` (já acumulado) dos nós de topo da árvore de despesas do mês
 * selecionado, separando operacional × não operacional. `excluir_dos_totais`
 * é herdado por toda a subárvore, então uma categoria não operacional nunca
 * tem pai operacional — somar só os nós de topo evita contar a mesma despesa
 * duas vezes (o `amount` do nó de topo já inclui os filhos).
 */
function operationalExpenseSplit(
  tree: readonly PresentationExpenseNode[],
): { operational: number; nonOperational: number } {
  return tree.reduce((totals, node) => (
    node.operationalClass === 'non-operational'
      ? { ...totals, nonOperational: totals.nonOperational + node.amount }
      : { ...totals, operational: totals.operational + node.amount }
  ), { operational: 0, nonOperational: 0 });
}

function ExpensesSummaryLayout({ expenses }: { expenses: PresentationExpensesData }) {
  const semantic = expenses.delta.meaning === 'increase'
    ? { label: 'Aumento de despesas', tone: 'text-destructive' }
    : expenses.delta.meaning === 'reduction'
      ? { label: 'Redução de despesas', tone: 'text-success' }
      : expenses.delta.meaning === 'unchanged'
        ? { label: 'Despesas estáveis', tone: 'text-foreground' }
        : { label: 'Comparação indisponível', tone: 'text-muted-foreground' };
  const split = expenses.current.state === 'available'
    ? operationalExpenseSplit(expenses.tree)
    : null;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
      <div className="grid grid-cols-2 gap-10">
        {[expenses.current, expenses.previous].map((period, index) => (
          <section key={period.month} className="border-l-2 border-destructive pl-5">
            <p className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold uppercase tracking-wide text-muted-foreground">{index === 0 ? 'Mês selecionado' : 'Mês anterior'}</p>
            <p className="mt-2 capitalize text-[clamp(0.82rem,1.2cqw,1.2rem)] text-ink-secondary">{formatYearMonthLabel(period.month)}</p>
            <p className={cn('mt-4 break-words text-[clamp(1.6rem,3.2cqw,3.1rem)] font-bold tracking-tight', index === 0 ? 'text-foreground' : 'text-ink-secondary')}>{expensePeriodValue(period)}</p>
            <p className="mt-3 text-[clamp(0.68rem,0.9cqw,0.9rem)] text-muted-foreground">{formatIntegerBR(period.quantity)} lançamento(s) do razão</p>
          </section>
        ))}
      </div>
      {split ? (
        <div className="grid grid-cols-2 gap-10 border-t border-border pt-5">
          <div>
            <p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Despesas operacionais (mês selecionado)</p>
            <p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{fmtBRL(split.operational)}</p>
          </div>
          <div>
            <p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-warning">Despesas não operacionais (mês selecionado)</p>
            <p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-warning">{fmtBRL(split.nonOperational)}</p>
            <p className="mt-1 text-[clamp(0.58rem,0.75cqw,0.75rem)] text-muted-foreground">Incluídas no total acima; fora do resultado operacional.</p>
          </div>
        </div>
      ) : null}
      <div className="grid grid-cols-[1fr_1fr_1.2fr] gap-8 border-t border-border pt-5">
        <div><p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Variação absoluta</p><p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{expenseDeltaValue(expenses.delta.absolute)}</p></div>
        <div><p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Variação percentual</p><p className="mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-semibold text-foreground">{expenseDeltaValue(expenses.delta.percentage, true)}</p></div>
        <div><p className="text-[clamp(0.65rem,0.85cqw,0.85rem)] text-muted-foreground">Leitura executiva</p><p className={cn('mt-1 text-[clamp(1rem,1.55cqw,1.5rem)] font-bold', semantic.tone)}>{semantic.label}</p></div>
      </div>
    </div>
  );
}

function flattenExpenseNodes(nodes: readonly PresentationExpenseNode[], depth = 0): Array<{ node: PresentationExpenseNode; depth: number }> {
  return nodes.flatMap(node => [{ node, depth }, ...flattenExpenseNodes(node.children, depth + 1)]);
}

/** % que `amount` representa da receita operacional líquida do período; `null`/negativa/zero → sem base para dividir. */
function expenseShareOfNetRevenue(amount: number, netRevenue: number | null): string {
  if (netRevenue === null || netRevenue <= 0) return '—';
  return formatPercentBR((amount / netRevenue) * 100, 1);
}

function ExpensesTreeLayout({
  nodes,
  netRevenue,
  onOpenExpenseCategory,
}: {
  nodes: readonly PresentationExpenseNode[];
  netRevenue: number | null;
  onOpenExpenseCategory?: (categoryId: string) => void;
}) {
  const rows = flattenExpenseNodes(nodes);
  if (rows.length === 0) return <EmptyState message="Sem despesas no mês selecionado." />;
  return (
    <div className="min-h-0 flex-1">
      <div className="mb-2 grid grid-cols-[minmax(0,1fr)_auto_auto_auto] gap-6 border-b border-border pb-2 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-muted-foreground">
        <span>Categoria</span><span>Valor próprio</span><span>Acumulado</span><span>% da receita líquida</span>
      </div>
      <div className="space-y-1">
        {rows.map(({ node, depth }, index) => {
          const label = <>{depth > 0 ? '↳ ' : ''}{node.name}</>;
          return (
            <div key={`${node.categoryId ?? node.name}-${index}`} className="grid grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-6 border-b border-border py-2">
              <div className="min-w-0" style={{ paddingLeft: `${depth * 1.1}rem` }}>
                {node.categoryId && onOpenExpenseCategory ? (
                  <button type="button" className="max-w-full break-words text-left text-[clamp(0.72rem,1cqw,1rem)] font-semibold leading-tight text-foreground underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" onClick={() => onOpenExpenseCategory(node.categoryId!)}>{label}</button>
                ) : <p className="break-words text-[clamp(0.72rem,1cqw,1rem)] font-semibold leading-tight text-foreground">{label}</p>}
                <p className={cn('mt-0.5 text-[clamp(0.52rem,0.68cqw,0.68rem)]', node.operationalClass === 'non-operational' ? 'text-warning' : 'text-muted-foreground')}>{node.operationalClass === 'non-operational' ? 'Não operacional · fora do resultado' : 'Operacional'}</p>
              </div>
              <span className="whitespace-nowrap font-mono text-[clamp(0.68rem,0.9cqw,0.9rem)] text-ink-secondary">{fmtBRL(node.directAmount)}</span>
              <strong className="whitespace-nowrap font-mono text-[clamp(0.72rem,1cqw,1rem)] text-foreground">{fmtBRL(node.amount)}</strong>
              <span className="whitespace-nowrap font-mono text-[clamp(0.68rem,0.9cqw,0.9rem)] text-ink-secondary">{expenseShareOfNetRevenue(node.amount, netRevenue)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ExpensesRollingLayout({ expenses }: { expenses: PresentationExpensesData }) {
  const max = Math.max(1, ...expenses.rollingThreeMonths.map(point => point.total));
  return (
    <div className="grid min-h-0 flex-1 grid-cols-3 items-end gap-10 px-10 pb-6 pt-4">
      {expenses.rollingThreeMonths.map(point => (
        <section key={point.yearMonth} className="flex h-full flex-col justify-end text-center">
          <p className="mb-3 text-[clamp(0.8rem,1.25cqw,1.2rem)] font-bold text-foreground">{point.state === 'available' ? fmtBRL(point.total) : point.state === 'empty' ? 'Sem despesas' : 'Sem cobertura'}</p>
          <div className="mx-auto w-24 border border-destructive-border bg-destructive-soft" style={{ height: `${Math.max(point.state === 'available' ? (point.total / max) * 68 : 4, 4)}%` }} aria-hidden="true" />
          <p className="mt-4 capitalize text-[clamp(0.72rem,1cqw,1rem)] font-semibold text-ink-secondary">{formatYearMonthLabel(point.yearMonth)}</p>
          <p className="mt-1 text-[clamp(0.58rem,0.75cqw,0.75rem)] text-muted-foreground">{formatIntegerBR(point.quantity)} lançamento(s)</p>
        </section>
      ))}
    </div>
  );
}

function ExpensesHistoryLayout({ expenses }: { expenses: PresentationExpensesData }) {
  const pointsByYear = new Map(expenses.requestedYears.map(year => [year, expenses.history.filter(point => point.year === year)]));
  const labels = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div className="grid grid-cols-[3.5rem_repeat(12,minmax(0,1fr))] gap-x-1 gap-y-3 text-center">
        <span aria-hidden="true" />
        {labels.map(label => <span key={label} className="text-[clamp(0.54rem,0.7cqw,0.7rem)] font-semibold text-muted-foreground">{label}</span>)}
        {expenses.requestedYears.flatMap(year => [
          <strong key={`${year}-label`} className="self-center text-left text-[clamp(0.68rem,0.9cqw,0.9rem)] text-foreground">{year}</strong>,
          ...(pointsByYear.get(year) ?? []).map(point => (
            <div key={point.yearMonth} className={cn('flex min-h-12 flex-col items-center justify-center rounded border px-0.5', point.state === 'available' ? 'border-destructive-border bg-destructive-soft text-destructive' : 'border-border bg-background-subtle text-muted-foreground')} title={`${formatYearMonthLabel(point.yearMonth)}: ${point.state === 'available' ? fmtBRL(point.total) : 'sem valor disponível'}`}>
              <span className="text-[clamp(0.5rem,0.62cqw,0.62rem)] font-semibold leading-tight">{point.state === 'available' ? fmtBRLCompact(point.total) : '—'}</span>
              <span className="mt-1 text-[clamp(0.43rem,0.52cqw,0.52rem)] text-muted-foreground">{point.state === 'available' ? `${point.quantity} lanç.` : point.state === 'empty' ? 'vazio' : 's/ cobertura'}</span>
            </div>
          )),
        ])}
      </div>
    </div>
  );
}

function InsightsLayout({
  items,
  rulesetVersion,
  onOpenExpenseCategory,
}: {
  items: readonly PresentationInsight[];
  rulesetVersion: string;
  onOpenExpenseCategory?: (categoryId: string) => void;
}) {
  if (items.length === 0) {
    return (
      <EmptyState message="Nenhum insight atingiu os limiares mínimos de relevância e cobertura. Nenhuma leitura foi fabricada." />
    );
  }
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <p className="text-[clamp(0.54rem,0.7cqw,0.7rem)] text-muted-foreground">
        Regras {rulesetVersion} · ordenação por relevância, domínio, prioridade da regra e ID.
      </p>
      <ol className={cn(
        'grid min-h-0 flex-1 gap-4',
        items.length === 1 ? 'grid-cols-1' : items.length === 2 ? 'grid-cols-2' : 'grid-cols-3',
      )}>
        {items.map(insight => {
          const toneClass = TONE_CLASSES[insight.tone];
          const regimeLabel = presentationInsightRegimeLabel(insight);
          const expenseCategoryId = insight.drillDown?.target === 'expenses'
            ? insight.drillDown.categoryId
            : undefined;
          return (
            <li key={insight.id} className="flex min-w-0 flex-col rounded-lg border border-border bg-background-subtle p-4">
              <div className="flex flex-wrap items-center justify-between gap-2 text-[clamp(0.48rem,0.62cqw,0.62rem)] uppercase tracking-wide">
                <span className={cn('font-bold', toneClass)}>
                  {insight.domain === 'revenue' ? 'Faturamento' : 'Despesas'}
                </span>
                <span className="text-muted-foreground">Regra {insight.ruleVersion} · score {insight.relevance.score}</span>
              </div>
              <h3 className="mt-3 break-words text-[clamp(0.8rem,1.12cqw,1.08rem)] font-bold leading-snug text-foreground">{insight.title}</h3>
              <p className="mt-2 break-words text-[clamp(0.6rem,0.78cqw,0.76rem)] leading-relaxed text-ink-secondary">{insight.description}</p>
              <div className="mt-3 border-l-2 border-primary pl-3">
                <p className="text-[clamp(0.48rem,0.6cqw,0.6rem)] uppercase tracking-wide text-muted-foreground">Evidência</p>
                <p className="mt-1 break-words text-[clamp(0.6rem,0.78cqw,0.76rem)] font-semibold leading-snug text-foreground">{presentationInsightEvidenceLabel(insight)}</p>
              </div>
              <dl className="mt-auto space-y-1 pt-3 text-[clamp(0.48rem,0.6cqw,0.6rem)] leading-snug text-muted-foreground">
                <div><dt className="inline font-semibold text-ink-secondary">Período: </dt><dd className="inline">{insight.period.label}</dd></div>
                <div><dt className="inline font-semibold text-ink-secondary">Fonte: </dt><dd className="inline">{insight.source.label}</dd></div>
                <div><dt className="inline font-semibold text-ink-secondary">Regime: </dt><dd className="inline">{regimeLabel}</dd></div>
              </dl>
              {expenseCategoryId && onOpenExpenseCategory ? (
                <button
                  type="button"
                  className="mt-3 self-start text-[clamp(0.54rem,0.68cqw,0.68rem)] font-semibold text-primary-ink underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  onClick={() => onOpenExpenseCategory(expenseCategoryId)}
                  aria-label={`Abrir detalhe de ${insight.title}`}
                >
                  Abrir detalhe DFC
                </button>
              ) : null}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function ResultsSummaryLayout({
  results,
  onOpenResultDetail,
}: {
  results: PresentationResultsData;
  onOpenResultDetail?: (target: 'revenue' | 'expense' | 'result' | 'margin') => void;
}) {
  const metrics = [
    { key: 'revenue' as const, label: 'Receita operacional', value: results.current.revenue, formatted: fmtBRL(results.current.revenue), tone: 'text-success' },
    { key: 'expense' as const, label: 'Despesa operacional', value: results.current.expense, formatted: fmtBRL(results.current.expense), tone: 'text-destructive' },
    { key: 'result' as const, label: 'Resultado operacional', value: results.current.result, formatted: fmtBRL(results.current.result), tone: results.current.result < 0 ? 'text-destructive' : 'text-foreground' },
    { key: 'margin' as const, label: 'Margem operacional', value: results.current.marginPercent, formatted: formatPercentBR(results.current.marginPercent, 1), tone: 'text-foreground' },
  ];
  return (
    <div className="grid flex-1 content-center gap-8 sm:grid-cols-2 xl:grid-cols-4">
      {metrics.map((metric) => {
        const content = (
          <>
            <p className="text-[clamp(0.78rem,1.05cqw,1rem)] font-medium text-ink-secondary">{metric.label}</p>
            <p className={cn('mt-3 break-words text-[clamp(1.45rem,2.5cqw,2.45rem)] font-bold tracking-tight', metric.tone)}>{metric.formatted}</p>
            <p className="mt-4 text-[clamp(0.66rem,0.86cqw,0.86rem)] text-muted-foreground">
              {metric.key === 'margin' ? 'Resultado ÷ receita' : metric.key === 'result' ? 'Receita − despesa' : 'Base operacional do período'}
            </p>
          </>
        );
        return onOpenResultDetail ? (
          <button
            key={metric.key}
            type="button"
            className="min-w-0 border-l-2 border-primary pl-5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenResultDetail(metric.key)}
            aria-label={`Abrir detalhe de ${metric.label}`}
          >
            {content}
          </button>
        ) : (
          <section key={metric.key} className="min-w-0 border-l-2 border-primary pl-5">{content}</section>
        );
      })}
    </div>
  );
}

function ResultsComparisonLayout({ results }: { results: PresentationResultsData }) {
  if (results.comparison.state === 'unavailable') {
    return <EmptyState message={results.comparison.reason === 'outside-available-period' ? 'Período anterior fora do histórico disponível.' : 'Comparação com o período anterior indisponível.'} />;
  }
  const { previous, deltas } = results.comparison;
  const rows = [
    { key: 'revenue' as const, label: 'Receita', current: results.current.revenue, previous: previous.revenue, currency: true },
    { key: 'expense' as const, label: 'Despesa', current: results.current.expense, previous: previous.expense, currency: true },
    { key: 'result' as const, label: 'Resultado', current: results.current.result, previous: previous.result, currency: true },
    { key: 'margin' as const, label: 'Margem', current: results.current.marginPercent, previous: previous.marginPercent, currency: false },
  ];
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center">
      <div className="grid grid-cols-[1.1fr_repeat(4,1fr)] border-y border-border text-[clamp(0.68rem,0.92cqw,0.92rem)]">
        {['Métrica', 'Período atual', 'Período anterior', 'Variação absoluta', 'Variação relativa'].map((label, index) => (
          <div key={label} className={cn('p-3 font-semibold text-ink-secondary', index > 0 && 'text-right')}>{label}</div>
        ))}
        {rows.map((row) => {
          const delta = deltas[row.key];
          const format = (value: number) => row.currency ? fmtBRL(value) : formatPercentBR(value, 1);
          const absolute = delta.absoluteChange === null
            ? 'Indisponível'
            : row.currency ? fmtBRL(delta.absoluteChange) : `${delta.absoluteChange.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
          return (
            <div key={row.key} className="contents">
              <div className="border-t border-border p-3 font-semibold text-foreground">{row.label}</div>
              <div className="border-t border-border p-3 text-right text-foreground">{format(row.current)}</div>
              <div className="border-t border-border p-3 text-right text-ink-secondary">{format(row.previous)}</div>
              <div className="border-t border-border p-3 text-right text-foreground">{absolute}</div>
              <div className="border-t border-border p-3 text-right font-semibold text-foreground">{formatMetricDelta(delta)}</div>
            </div>
          );
        })}
      </div>
      <p className="mt-4 text-[clamp(0.62rem,0.82cqw,0.82rem)] text-muted-foreground">Base zero mantém a mudança absoluta sem gerar valores inválidos.</p>
    </div>
  );
}

function bridgeTone(step: PresentationResultBridgeStep): string {
  if (step.favorability === 'favorable') return 'text-success';
  if (step.favorability === 'unfavorable') return 'text-destructive';
  return 'text-foreground';
}

function formatSignedCurrency(value: number): string {
  if (value > 0) return `+${fmtBRL(value)}`;
  if (value < 0) return `-${fmtBRL(Math.abs(value))}`;
  return fmtBRL(value);
}

function ResultsBridgeLayout({ results }: { results: PresentationResultsData }) {
  if (results.bridge.state === 'unavailable') {
    return <EmptyState message={results.bridge.reason === 'outside-available-period' ? 'Ponte indisponível: período anterior fora do histórico.' : 'Ponte indisponível sem comparação equivalente.'} />;
  }
  const bridge = results.bridge;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8" role="img" aria-label="Ponte entre resultado anterior e atual pelos efeitos de receita e despesa">
      <div className="grid grid-cols-4 gap-6">
        {bridge.steps.map((step, index) => (
          <section key={step.key} className="relative border-t-2 border-primary pt-5 text-center">
            {index > 0 ? <span className="absolute -left-5 top-8 text-2xl text-muted-foreground" aria-hidden="true">+</span> : null}
            <p className="min-h-10 text-[clamp(0.68rem,0.94cqw,0.94rem)] font-semibold text-ink-secondary">{step.label}</p>
            <p className={cn('mt-4 text-[clamp(1.2rem,2.1cqw,2rem)] font-bold', bridgeTone(step))}>
              {step.key === 'previous-result' || step.key === 'current-result' ? fmtBRL(step.value) : formatSignedCurrency(step.value)}
            </p>
            {step.key === 'expense-effect' ? <p className="mt-3 text-[clamp(0.58rem,0.76cqw,0.76rem)] text-muted-foreground">Despesa maior gera efeito negativo; menor, positivo.</p> : null}
          </section>
        ))}
      </div>
      <div className="flex items-center justify-between border-t border-border pt-5 text-[clamp(0.72rem,1cqw,1rem)]">
        <span className="text-muted-foreground">Variação total do resultado</span>
        <strong className={bridge.totalChange < 0 ? 'text-destructive' : bridge.totalChange > 0 ? 'text-success' : 'text-foreground'}>{formatSignedCurrency(bridge.totalChange)}</strong>
        <span className="text-muted-foreground">Ponte fechada exatamente no resultado atual</span>
      </div>
    </div>
  );
}

function ResultsNonOperationalLayout({
  results,
  composition,
}: {
  results: PresentationResultsData;
  composition: CategoryCompositionSection;
}) {
  const totals = results.nonOperational.totals;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="grid grid-cols-3 gap-6">
        {[
          ['Receitas não operacionais', totals.revenue],
          ['Despesas não operacionais', totals.expense],
          ['Saldo não operacional', totals.result],
        ].map(([label, value]) => (
          <section key={String(label)} className="border-l-2 border-warning-border pl-4">
            <p className="text-[clamp(0.58rem,0.76cqw,0.76rem)] text-muted-foreground">{label}</p>
            <p className="mt-1 text-[clamp(0.9rem,1.4cqw,1.35rem)] font-bold text-warning">{fmtBRL(value as number)}</p>
          </section>
        ))}
      </div>
      <div className="min-h-0 flex-1 border-t border-border pt-3"><CompositionLayout section={composition} /></div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-strong bg-background-subtle px-8 text-center text-[clamp(0.85rem,1.4cqw,1.35rem)] text-ink-secondary">
      {message}
    </div>
  );
}

function PlanComparisonLayout({ plan }: { plan: PresentationPlanData }) {
  const indicators = buildPresentationPlanIndicators(plan);
  const formatValue = (unit: 'currency' | 'percent', value: number | null) => {
    if (value === null) return 'Não configurado';
    return unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 1);
  };
  const statusColor = {
    favorable: 'text-success',
    unfavorable: 'text-destructive',
    'on-target': 'text-foreground',
    'not-configured': 'text-muted-foreground',
    partial: 'text-warning',
    unavailable: 'text-muted-foreground',
  } as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
      <div className="grid grid-cols-5 gap-6">
        {indicators.map(indicator => (
          <section key={indicator.key} className="min-w-0 border-l-2 border-primary-border pl-4">
            <h3 className="min-h-12 text-[clamp(0.72rem,1cqw,1rem)] font-semibold leading-tight text-ink-secondary">{indicator.label}</h3>
            <p className="mt-3 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-muted-foreground">Realizado</p>
            <p className="mt-1 break-words text-[clamp(0.9rem,1.45cqw,1.4rem)] font-bold text-foreground">{formatValue(indicator.unit, indicator.actual)}</p>
            <p className="mt-3 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-muted-foreground">Orçado</p>
            <p className="mt-1 break-words text-[clamp(0.82rem,1.2cqw,1.15rem)] font-semibold text-primary-ink">{formatValue(indicator.unit, indicator.budget)}</p>
            <p className="mt-3 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-muted-foreground">Projeção</p>
            <p className="mt-1 break-words text-[clamp(0.78rem,1.05cqw,1rem)] text-ink-secondary">{formatValue(indicator.unit, indicator.projection)}</p>
            <p className={cn('mt-4 text-[clamp(0.62rem,0.82cqw,0.82rem)] font-semibold', statusColor[indicator.status])}>{indicator.statusLabel}</p>
          </section>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-8 border-t border-border pt-5">
        <p className="text-[clamp(0.66rem,0.9cqw,0.9rem)] leading-relaxed text-ink-secondary">
          Projeção determinística: realizado acumulado / {plan.projection.sampleDays} dias transcorridos × {plan.projection.totalDays} dias totais. Orçamento mensal proporcional aos dias do intervalo; contas em aberto não entram.
        </p>
        <div className="text-right">
          <p className="text-[clamp(0.6rem,0.78cqw,0.78rem)] text-muted-foreground">Meta percentual de CMV</p>
          <p className="mt-1 text-[clamp(0.9rem,1.3cqw,1.25rem)] font-bold text-primary-ink">
            {plan.budget.cmvTargetPercent === null ? 'Não configurada' : formatPercentBR(plan.budget.cmvTargetPercent, 1)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScenarioImpactLayout({ scenario }: { scenario: PresentationScenarioResult }) {
  const metrics = [
    { label: 'Receita', baseline: scenario.baseline.revenue, value: scenario.scenario.revenue, impact: scenario.impact.revenue.absolute },
    { label: 'Despesas', baseline: scenario.baseline.expense, value: scenario.scenario.expense, impact: scenario.impact.expense.absolute },
    { label: 'Resultado', baseline: scenario.baseline.result, value: scenario.scenario.result, impact: scenario.impact.result.absolute },
    { label: 'Margem', baseline: scenario.baseline.marginPercent, value: scenario.scenario.marginPercent, impact: scenario.impact.margin.absolute, percent: true },
    { label: 'CMV', baseline: scenario.baseline.cmv, value: scenario.scenario.cmv, impact: scenario.impact.cmv.absolute },
  ];
  const ranking = [...scenario.activeLevers]
    .sort((left, right) => Math.abs(right.resultImpact) - Math.abs(left.resultImpact) || left.id.localeCompare(right.id))
    .slice(0, 5);
  const format = (value: number | null, percent = false) => value === null
    ? 'Indisponível'
    : percent ? formatPercentBR(value, 1) : fmtBRL(value);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-7">
      <div className="flex items-center justify-between gap-5">
        <span className="border border-primary-border bg-primary-soft px-4 py-2 text-[clamp(0.7rem,0.95cqw,0.95rem)] font-bold tracking-[0.18em] text-primary-soft-foreground">SIMULAÇÃO</span>
        <p className="text-right text-[clamp(0.62rem,0.82cqw,0.82rem)] text-ink-secondary">Base: {scenario.baselineMode === 'actual' ? 'Realizado' : scenario.baselineMode === 'budget' ? 'Orçado' : 'Projeção'} · corte {scenario.cutoffDate}</p>
      </div>
      <div className="grid grid-cols-5 gap-5">
        {metrics.map(metric => (
          <section key={metric.label} className="min-w-0 border-l-2 border-primary-border pl-3">
            <h3 className="text-[clamp(0.68rem,0.9cqw,0.9rem)] font-semibold text-ink-secondary">{metric.label}</h3>
            <p className="mt-2 text-[clamp(0.56rem,0.7cqw,0.7rem)] uppercase tracking-wide text-muted-foreground">Base</p>
            <p className="mt-1 break-words text-[clamp(0.82rem,1.15cqw,1.1rem)] font-semibold text-ink-secondary">{format(metric.baseline, metric.percent)}</p>
            <p className="mt-2 text-[clamp(0.56rem,0.7cqw,0.7rem)] uppercase tracking-wide text-muted-foreground">Cenário</p>
            <p className="mt-1 break-words text-[clamp(0.9rem,1.35cqw,1.3rem)] font-bold text-foreground">{format(metric.value, metric.percent)}</p>
            <p className={cn('mt-2 text-[clamp(0.58rem,0.76cqw,0.76rem)] font-semibold', (metric.impact ?? 0) >= 0 ? 'text-success' : 'text-destructive')}>
              Impacto {metric.impact === null ? 'indisponível' : metric.percent ? `${metric.impact.toFixed(1)} p.p.` : fmtBRL(metric.impact)}
            </p>
          </section>
        ))}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-8 border-t border-border pt-5">
        <div>
          <h3 className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold text-foreground">Premissas explícitas</h3>
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
            {scenario.activeLevers.slice(0, 6).map(lever => (
              <div key={lever.id} className="flex items-center justify-between gap-3 border-b border-border pb-1.5 text-[clamp(0.58rem,0.75cqw,0.75rem)]">
                <span className="break-words text-ink-secondary">{lever.label}</span>
                <strong className={lever.resultImpact >= 0 ? 'text-success' : 'text-destructive'}>{fmtBRL(lever.resultImpact)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold text-foreground">Ranking por impacto no resultado</h3>
          <ol className="mt-3 space-y-2">
            {ranking.map((lever, index) => (
              <li key={lever.id} className="grid grid-cols-[1.3rem_minmax(0,1fr)_auto] gap-2 text-[clamp(0.58rem,0.75cqw,0.75rem)]">
                <span className="font-bold text-primary-ink">{index + 1}</span>
                <span className="break-words text-ink-secondary">{lever.label}</span>
                <strong className="text-foreground">{fmtBRL(lever.resultImpact)}</strong>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function ScenarioSensitivityLayout({ scenario }: { scenario: PresentationScenarioResult }) {
  if (scenario.sensitivity.state !== 'available') return <EmptyState message="Sensibilidade não configurada." />;
  const sensitivity = scenario.sensitivity;
  const values = sensitivity.points.map(point => point.result);
  const minX = Math.min(...sensitivity.points.map(point => point.inputValue));
  const maxX = Math.max(...sensitivity.points.map(point => point.inputValue));
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);
  const x = (value: number) => 80 + ((value - minX) / xRange) * 850;
  const y = (value: number) => 320 - ((value - minY) / yRange) * 250;
  const path = sensitivity.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.inputValue)} ${y(point.result)}`).join(' ');
  const basePoint = sensitivity.points.find(point => point.isBase);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="border border-primary-border bg-primary-soft px-4 py-2 text-[clamp(0.7rem,0.95cqw,0.95rem)] font-bold tracking-[0.18em] text-primary-soft-foreground">SIMULAÇÃO</span>
        <p className="text-[clamp(0.62rem,0.82cqw,0.82rem)] text-ink-secondary">Demais alavancas mantidas fixas</p>
      </div>
      <div className="min-h-0 flex-1" role="img" aria-label={`Curva de sensibilidade de ${sensitivity.leverLabel} com ${sensitivity.points.length} pontos.`}>
        <svg viewBox="0 0 1000 360" className="h-full w-full" aria-hidden="true">
          {[0, 1, 2, 3].map(index => {
            const value = maxY - ((maxY - minY) * index) / 3;
            return <g key={index}><line x1="72" x2="950" y1={y(value)} y2={y(value)} stroke="hsl(var(--chart-grid))" /><text x="65" y={y(value) + 5} textAnchor="end" fill="hsl(var(--chart-label))" fontSize="13">{fmtBRLCompact(value)}</text></g>;
          })}
          <line x1="72" x2="950" y1={y(0)} y2={y(0)} stroke="hsl(var(--chart-axis))" strokeWidth="1.5" />
          {basePoint ? <line x1={x(basePoint.inputValue)} x2={x(basePoint.inputValue)} y1="45" y2="325" stroke="hsl(var(--primary))" strokeDasharray="6 5" /> : null}
          <path d={path} fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinejoin="round" />
          {sensitivity.points.map(point => (
            <circle key={point.inputValue} cx={x(point.inputValue)} cy={y(point.result)} r={point.isBase ? 7 : 3.5} fill={point.isBase ? 'hsl(var(--card))' : 'hsl(var(--primary))'} stroke="hsl(var(--primary))" strokeWidth="2" />
          ))}
          <text x="500" y="350" textAnchor="middle" fill="hsl(var(--chart-label))" fontSize="14">{sensitivity.leverLabel} ({sensitivity.unit === 'currency' ? 'R$' : '%'})</text>
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-5 border-t border-border pt-3 text-[clamp(0.62rem,0.82cqw,0.82rem)]">
        <p className="text-ink-secondary">Faixa: <strong className="text-foreground">{sensitivity.unit === 'currency' ? `${fmtBRL(minX)} a ${fmtBRL(maxX)}` : `${formatPercentBR(minX, 2)} a ${formatPercentBR(maxX, 2)}`}</strong></p>
        <p className="text-ink-secondary">Configuração atual: <strong className="text-foreground">{basePoint ? sensitivity.unit === 'currency' ? fmtBRL(basePoint.inputValue) : formatPercentBR(basePoint.inputValue, 2) : 'Indisponível'}</strong></p>
        <p className="text-ink-secondary">Ponto de equilíbrio: <strong className="text-foreground">{sensitivity.breakEven.state === 'available' ? sensitivity.unit === 'currency' ? fmtBRL(sensitivity.breakEven.inputValue) : formatPercentBR(sensitivity.breakEven.inputValue, 2) : 'Indisponível com as informações atuais'}</strong></p>
      </div>
    </div>
  );
}

function TimeSeriesChart({ timeSeries }: { timeSeries: PresentationTimeSeries }) {
  const chart = useMemo(() => {
    const values = timeSeries.points.flatMap(point => [
      point.metrics.revenue,
      point.metrics.expense,
      point.metrics.result,
    ]);
    const rawMax = Math.max(0, ...values);
    const rawMin = Math.min(0, ...values);
    const padding = Math.max((rawMax - rawMin) * 0.08, 1);
    const max = rawMax + padding;
    const min = rawMin - (rawMin < 0 ? padding : 0);
    const range = Math.max(max - min, 1);
    const y = (value: number) => 320 - ((value - min) / range) * 270;
    const step = 880 / Math.max(timeSeries.points.length, 1);
    const resultPoints = timeSeries.points.map((point, index) => ({
      x: 80 + step * index + step / 2,
      y: y(point.metrics.result),
    }));
    return { y, step, resultPoints, min, max };
  }, [timeSeries]);

  if (timeSeries.points.length === 0) return <EmptyState message="Sem pontos na série temporal." />;

  const zeroY = chart.y(0);
  const linePath = chart.resultPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return (
    <div className="min-h-0 flex-1" role="img" aria-label="Série temporal de receitas, despesas e resultado operacional">
      <svg viewBox="0 0 1000 380" className="h-full w-full" aria-hidden="true">
        {[0, 1, 2, 3].map(index => {
          const value = chart.max - ((chart.max - chart.min) * index) / 3;
          const y = chart.y(value);
          return (
            <g key={index}>
              <line x1="72" x2="970" y1={y} y2={y} stroke="hsl(var(--chart-grid))" strokeWidth="1" />
              <text x="64" y={y + 5} textAnchor="end" fill="hsl(var(--chart-label))" fontSize="14">{fmtBRLCompact(value)}</text>
            </g>
          );
        })}
        <line x1="72" x2="970" y1={zeroY} y2={zeroY} stroke="hsl(var(--chart-axis))" strokeWidth="1.5" />
        {timeSeries.points.map((point, index) => {
          const center = 80 + chart.step * index + chart.step / 2;
          const barWidth = Math.min(chart.step * 0.22, 22);
          const revenueY = chart.y(point.metrics.revenue);
          const expenseY = chart.y(point.metrics.expense);
          return (
            <g key={point.key}>
              <rect
                x={center - barWidth - 2}
                y={Math.min(revenueY, zeroY)}
                width={barWidth}
                height={Math.max(Math.abs(zeroY - revenueY), 1)}
                rx="2"
                fill="hsl(var(--success))"
              />
              <rect
                x={center + 2}
                y={Math.min(expenseY, zeroY)}
                width={barWidth}
                height={Math.max(Math.abs(zeroY - expenseY), 1)}
                rx="2"
                fill="hsl(var(--destructive))"
              />
              <text x={center} y="353" textAnchor="middle" fill="hsl(var(--chart-label))" fontSize="13">
                {formatPresentationSeriesLabel(point.key, timeSeries.granularity)}
              </text>
            </g>
          );
        })}
        <path d={linePath} fill="none" stroke="hsl(var(--primary))" strokeWidth="4" strokeLinejoin="round" />
        {chart.resultPoints.map((point, index) => (
          <circle key={timeSeries.points[index].key} cx={point.x} cy={point.y} r="5" fill="hsl(var(--primary))" />
        ))}
        <g transform="translate(720 18)" fontSize="14">
          <rect width="12" height="12" fill="hsl(var(--success))" /><text x="18" y="11" fill="hsl(var(--foreground))">Receita</text>
          <rect x="92" width="12" height="12" fill="hsl(var(--destructive))" /><text x="110" y="11" fill="hsl(var(--foreground))">Despesa</text>
          <line x1="194" x2="210" y1="6" y2="6" stroke="hsl(var(--primary))" strokeWidth="4" /><text x="216" y="11" fill="hsl(var(--foreground))">Resultado</text>
        </g>
      </svg>
    </div>
  );
}

function CompositionColumn({
  title,
  nodes,
  tone,
}: {
  title: string;
  nodes: CategoryCompositionSection['revenue'];
  tone: 'revenue' | 'expense';
}) {
  const rows = flattenPresentationCategories(nodes);
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between border-b border-border pb-2">
        <h3 className={cn('text-[clamp(0.9rem,1.35cqw,1.3rem)] font-semibold', tone === 'revenue' ? 'text-success' : 'text-destructive')}>{title}</h3>
        <span className="text-[clamp(0.65rem,0.8cqw,0.8rem)] text-muted-foreground">Direto / Acumulado</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[clamp(0.75rem,1cqw,1rem)] text-muted-foreground">Sem valores nesta composição.</p>
      ) : (
        <div className="space-y-1">
          {rows.map(({ node, depth }, index) => (
            <div
              key={`${node.categoryId ?? node.name}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border py-1.5"
            >
              <div className="min-w-0" style={{ paddingLeft: `${depth * 0.8}rem` }}>
                <p className={cn(
                  'break-words text-[clamp(0.72rem,1cqw,0.98rem)] leading-tight text-foreground',
                  depth === 0 && 'font-semibold',
                )}>
                  {depth > 0 ? '↳ ' : ''}{node.name}
                </p>
                <p className="text-[clamp(0.58rem,0.7cqw,0.72rem)] text-muted-foreground">{formatPercentBR(node.sharePercent, 1)} da composição</p>
              </div>
              <p className="whitespace-nowrap text-right font-mono text-[clamp(0.65rem,0.82cqw,0.82rem)] text-ink-secondary">
                {fmtBRL(node.directAmount)} <span className="text-muted-foreground">/</span> <strong className="text-foreground">{fmtBRL(node.amount)}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompositionLayout({ section }: { section: CategoryCompositionSection }) {
  return (
    <div className="grid min-h-0 flex-1 gap-8 md:grid-cols-2">
      <CompositionColumn title="Receitas" nodes={section.revenue} tone="revenue" />
      <CompositionColumn title="Despesas" nodes={section.expense} tone="expense" />
    </div>
  );
}

function RankingColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly PresentationRankingItem[];
  tone: 'revenue' | 'expense';
}) {
  return (
    <section className="min-w-0">
      <h3 className={cn('mb-4 text-[clamp(1rem,1.5cqw,1.45rem)] font-semibold', tone === 'revenue' ? 'text-success' : 'text-destructive')}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-muted-foreground">Nenhuma categoria no período.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map(item => (
            <li key={`${item.rank}-${item.categoryId ?? item.label}`} className="grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-border pb-2.5">
              <span className="text-center text-[clamp(1rem,1.5cqw,1.45rem)] font-bold text-primary-ink">{item.rank}</span>
              <div className="min-w-0">
                <p className="break-words text-[clamp(0.78rem,1.15cqw,1.1rem)] font-medium leading-tight text-foreground">{item.label}</p>
                <p className="text-[clamp(0.65rem,0.8cqw,0.82rem)] text-muted-foreground">{formatPercentBR(item.sharePercent, 1)} da composição</p>
              </div>
              <strong className={cn('whitespace-nowrap font-mono text-[clamp(0.76rem,1.05cqw,1rem)]', tone === 'revenue' ? 'text-success' : 'text-destructive')}>{fmtBRL(item.amount)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DecisionCommitmentsLayout({ decision }: { decision: PresentationDecisionDetail }) {
  const currentRevision = decision.revisions.find(revision => revision.id === decision.decision.currentRevisionId);
  if (!currentRevision) return <EmptyState message="Revisão aprovada indisponível." />;
  const statusLabel = presentationDecisionStatusLabel(decision.decision.status);
  const metrics = [
    ['Receita', currentRevision.snapshot.metrics.revenue],
    ['Despesa', currentRevision.snapshot.metrics.expense],
    ['Resultado', currentRevision.snapshot.metrics.result],
    ['Margem', currentRevision.snapshot.metrics.marginPercent],
  ] as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-8">
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <span className="border border-primary-border bg-primary-soft px-3 py-1 text-[clamp(0.62rem,0.8cqw,0.8rem)] font-bold text-primary-soft-foreground">{statusLabel}</span>
            {decision.decision.referenceType === 'SCENARIO' ? <span className="text-[clamp(0.62rem,0.8cqw,0.8rem)] font-bold tracking-wider text-warning">SIMULAÇÃO</span> : null}
          </div>
          <p className="mt-4 break-words text-[clamp(0.78rem,1.05cqw,1rem)] leading-relaxed text-ink-secondary">{decision.decision.context}</p>
          <div className="mt-4 space-y-1 text-[clamp(0.62rem,0.78cqw,0.78rem)] text-muted-foreground">
            <p>Responsável executivo: {decision.decision.executiveResponsibleName ?? 'Não informado'}</p>
            <p>Aprovador: {currentRevision.approvedByName ?? 'Usuário removido'}</p>
            <p>Revisão {currentRevision.revisionNumber} · corte {currentRevision.snapshot.cutoffDate}</p>
          </div>
        </section>
        <section className="grid grid-cols-2 content-start gap-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="border-l-2 border-primary-border pl-3">
              <p className="text-[clamp(0.58rem,0.72cqw,0.72rem)] text-muted-foreground">{label} esperado</p>
              <p className="mt-1 text-[clamp(0.9rem,1.3cqw,1.25rem)] font-bold text-foreground">{value === null ? 'Indisponível' : label === 'Margem' ? formatPercentBR(value, 1) : fmtBRL(value)}</p>
            </div>
          ))}
          <div className="col-span-2 border-t border-border pt-3 text-[clamp(0.6rem,0.75cqw,0.75rem)] text-muted-foreground">
            {currentRevision.snapshot.assumptions.length === 0
              ? 'Referência canônica sem premissas de simulação.'
              : currentRevision.snapshot.assumptions.slice(0, 3).map(item => `${item.label}: ${item.exactValue || item.calculatedInputValue}`).join(' · ')}
            {currentRevision.snapshot.assumptions.length > 3 ? ` · +${currentRevision.snapshot.assumptions.length - 3} premissa(s) no snapshot` : ''}
          </div>
        </section>
      </div>
      <div className="min-h-0 border-t border-border pt-4">
        <h3 className="mb-2 text-[clamp(0.72rem,0.95cqw,0.95rem)] font-semibold text-primary-ink">Compromissos</h3>
        {decision.actions.length === 0 ? <p className="text-[clamp(0.68rem,0.85cqw,0.85rem)] text-muted-foreground">Nenhuma ação registrada.</p> : (
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {decision.actions.map(action => (
              <div key={action.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-border pb-2">
                <div>
                  <p className="break-words text-[clamp(0.64rem,0.8cqw,0.8rem)] leading-snug text-foreground">{action.description}</p>
                  <p className="mt-1 text-[clamp(0.55rem,0.66cqw,0.66rem)] text-muted-foreground">{action.responsibleName} · {action.dueDate ?? 'sem prazo'}</p>
                </div>
                <span className="text-[clamp(0.54rem,0.66cqw,0.66rem)] font-semibold text-primary-ink">{presentationActionStatusLabel(action.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionFollowUpLayout({
  decision,
  comparison,
}: {
  decision: PresentationDecisionDetail;
  comparison: Extract<PresentationDecisionComparison, { state: 'available' }>;
}) {
  const labels = { revenue: 'Receita', expense: 'Despesa', result: 'Resultado', marginPercent: 'Margem', cmv: 'CMV' } as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
      <div className="flex items-center justify-between gap-5 text-[clamp(0.62rem,0.8cqw,0.8rem)] text-muted-foreground">
        <span>{decision.decision.title}</span>
        <span>Snapshot {new Date(comparison.snapshotCapturedAt).toLocaleString('pt-BR')} · Base atual {new Date(comparison.currentGeneratedAt).toLocaleString('pt-BR')}</span>
      </div>
      <div className="grid grid-cols-[1.1fr_repeat(4,1fr)] border-y border-border text-[clamp(0.68rem,0.9cqw,0.9rem)]">
        <div className="p-3 font-semibold text-ink-secondary">Métrica</div><div className="p-3 text-right font-semibold text-ink-secondary">Snapshot aprovado</div><div className="p-3 text-right font-semibold text-ink-secondary">Base atual</div><div className="p-3 text-right font-semibold text-ink-secondary">Variação</div><div className="p-3 font-semibold text-ink-secondary">Leitura</div>
        {comparison.metrics.map(metric => {
          const percent = metric.key === 'marginPercent';
          const format = (value: number | null) => value === null ? 'Indisponível' : percent ? formatPercentBR(value, 1) : fmtBRL(value);
          return (
            <div key={metric.key} className="contents">
              <div className="border-t border-border p-3 text-foreground">{labels[metric.key]}</div>
              <div className="border-t border-border p-3 text-right text-ink-secondary">{format(metric.snapshot)}</div>
              <div className="border-t border-border p-3 text-right text-ink-secondary">{format(metric.current)}</div>
              <div className="border-t border-border p-3 text-right text-ink-secondary">{format(metric.absoluteChange)}</div>
              <div className="border-t border-border p-3 text-ink-secondary">{metric.favorability === 'favorable' ? 'Favorável' : metric.favorability === 'unfavorable' ? 'Desfavorável' : metric.favorability === 'neutral' ? 'Neutra' : 'Indisponível'}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[clamp(0.62rem,0.78cqw,0.78rem)] text-muted-foreground">Comparação informativa entre métricas equivalentes. Não atribui causalidade às ações nem classifica a decisão como sucesso ou falha.</p>
    </div>
  );
}

function SlideContent({
  slide,
  onOpenExpenseCategory,
  onOpenResultDetail,
}: {
  slide: PresentationSlide;
  onOpenExpenseCategory?: (categoryId: string) => void;
  onOpenResultDetail?: (target: 'revenue' | 'expense' | 'result' | 'margin') => void;
}) {
  if (slide.availability.state !== 'available' && slide.availability.state !== 'empty') {
    return <EmptyState message={availabilityMessage(slide.availability)} />;
  }

  const payload = slide.availability.data;
  if (
    slide.availability.state === 'empty'
    && payload.type !== 'cover'
    && !payload.type.startsWith('expenses-')
    && !payload.type.startsWith('results-')
    && payload.type !== 'insights'
  ) {
    return <EmptyState message={availabilityMessage(slide.availability)} />;
  }

  switch (payload.type) {
    case 'chapter-foundation':
      return <EmptyState message="Conteúdo não solicitado nesta fase." />;
    case 'revenue-summary':
      return <RevenueSummaryLayout revenue={payload.revenue} />;
    case 'revenue-gross-net':
      return <RevenueGrossNetLayout revenue={payload.revenue} />;
    case 'revenue-by-brand':
      return <RevenueByBrandLayout revenue={payload.revenue} />;
    case 'revenue-weekdays':
      return <RevenueWeekdaysLayout revenue={payload.revenue} />;
    case 'revenue-history':
      return <RevenueHistoryLayout revenue={payload.revenue} />;
    case 'expenses-summary':
      return <ExpensesSummaryLayout expenses={payload.expenses} />;
    case 'expenses-tree':
      return <ExpensesTreeLayout nodes={payload.nodes} netRevenue={payload.netRevenue} onOpenExpenseCategory={onOpenExpenseCategory} />;
    case 'expenses-rolling':
      return <ExpensesRollingLayout expenses={payload.expenses} />;
    case 'expenses-history':
      return <ExpensesHistoryLayout expenses={payload.expenses} />;
    case 'results-summary':
      return <ResultsSummaryLayout results={payload.results} onOpenResultDetail={onOpenResultDetail} />;
    case 'results-comparison':
      return <ResultsComparisonLayout results={payload.results} />;
    case 'results-evolution':
      return <TimeSeriesChart timeSeries={payload.timeSeries} />;
    case 'results-bridge':
      return <ResultsBridgeLayout results={payload.results} />;
    case 'results-non-operational':
      return <ResultsNonOperationalLayout results={payload.results} composition={payload.composition} />;
    case 'insights':
      return (
        <InsightsLayout
          items={payload.items}
          rulesetVersion={payload.insights.rulesetVersion}
          onOpenExpenseCategory={onOpenExpenseCategory}
        />
      );
    case 'cover':
      return (
        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-8 h-1.5 w-24 rounded-full bg-primary-strong" />
          <p className="mb-3 text-[clamp(0.8rem,1.25cqw,1.2rem)] font-semibold uppercase tracking-[0.24em] text-ink-secondary">Visão executiva financeira</p>
          <h1 className="max-w-4xl text-[clamp(2.4rem,6cqw,5.8rem)] font-bold leading-[0.96] tracking-tight text-foreground">Apresentação<br /><span className="text-primary-ink">Sócios</span></h1>
          <p className="mt-8 text-[clamp(1.1rem,2cqw,1.9rem)] text-ink-secondary">{payload.periodLabel}</p>
          <p className="mt-2 text-[clamp(0.75rem,1cqw,1rem)] text-muted-foreground">Resultado operacional no regime de caixa do Dashboard. Transferências excluídas.</p>
        </div>
      );
    case 'executive-summary': {
      const metrics = buildExecutiveMetricDisplays(payload.metrics.managerialResult, payload.deltas);
      return (
        <div className="grid flex-1 content-center gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => (
            <div key={metric.key} className="border-l-2 border-primary-border pl-5">
              <p className="text-[clamp(0.78rem,1.05cqw,1rem)] font-medium text-ink-secondary">{metric.label}</p>
              <p className={cn('mt-3 break-words text-[clamp(1.45rem,2.5cqw,2.45rem)] font-bold tracking-tight', TONE_CLASSES[metric.tone], metric.tone === 'result' && metric.value < 0 && 'text-destructive')}>{metric.formattedValue}</p>
              <p className="mt-4 text-[clamp(0.68rem,0.9cqw,0.9rem)] text-muted-foreground">vs. período anterior</p>
              <p className="mt-1 text-[clamp(0.74rem,1cqw,1rem)] font-semibold text-foreground">{metric.comparison}</p>
            </div>
          ))}
        </div>
      );
    }
    case 'plan-comparison':
      return <PlanComparisonLayout plan={payload.plan} />;
    case 'scenario-impact':
      return <ScenarioImpactLayout scenario={payload.scenario} />;
    case 'scenario-sensitivity':
      return <ScenarioSensitivityLayout scenario={payload.scenario} />;
    case 'decision-commitments':
      return <DecisionCommitmentsLayout decision={payload.decision} />;
    case 'decision-follow-up':
      return <DecisionFollowUpLayout decision={payload.decision} comparison={payload.comparison} />;
    case 'time-series':
      return <TimeSeriesChart timeSeries={payload.timeSeries} />;
    case 'category-composition':
      return <CompositionLayout section={payload.composition} />;
    case 'rankings':
      return (
        <div className="grid min-h-0 flex-1 gap-10 md:grid-cols-2">
          <RankingColumn title="Principais receitas" items={payload.rankings.topRevenueCategories} tone="revenue" />
          <RankingColumn title="Principais despesas" items={payload.rankings.topExpenseCategories} tone="expense" />
        </div>
      );
    case 'open-items': {
      const payable = payload.indicators.accountsPayableOpen;
      const receivable = payload.indicators.accountsReceivableOpen;
      return (
        <div className="grid flex-1 content-center gap-12 md:grid-cols-2">
          {[
            { label: 'Contas a pagar em aberto', item: payable, tone: 'text-warning' },
            { label: 'Contas a receber em aberto', item: receivable, tone: 'text-foreground' },
          ].map(({ label, item, tone }) => (
            <div key={label} className="border-t-4 border-primary pt-7">
              <p className="text-[clamp(1rem,1.5cqw,1.45rem)] font-semibold text-ink-secondary">{label}</p>
              <p className={cn('mt-5 text-[clamp(2rem,4cqw,4rem)] font-bold tracking-tight', tone)}>{fmtBRL(item.amount)}</p>
              <p className="mt-4 text-[clamp(0.9rem,1.2cqw,1.2rem)] text-ink-secondary">{formatIntegerBR(item.count)} título(s)</p>
              <p className="mt-2 text-[clamp(0.7rem,0.9cqw,0.9rem)] text-muted-foreground">Indicador em aberto - fora do resultado gerencial</p>
            </div>
          ))}
        </div>
      );
    }
    case 'non-operational':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="self-start border border-warning-border bg-warning-soft px-4 py-2 text-[clamp(0.72rem,0.95cqw,0.95rem)] font-semibold text-warning">Fora do resultado operacional</div>
          <CompositionLayout section={payload.composition} />
        </div>
      );
    case 'highlights':
      return <EmptyState message="Destaques não solicitados nesta apresentação." />;
  }
}

export default function PresentationSlideCanvas({
  slide,
  generatedAt,
  slideNumber,
  totalSlides,
  className,
  onOpenExpenseCategory,
  onOpenResultDetail,
}: PresentationSlideCanvasProps) {
  return (
    <article
      className={cn(
        'presentation-slide flex aspect-video w-full flex-col overflow-hidden bg-card px-[5%] py-[4%] text-card-foreground shadow-2xl ring-1 ring-border [container-type:inline-size]',
        'motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none',
        className,
      )}
      aria-label={`Slide ${slideNumber} de ${totalSlides}: ${slide.title}`}
      data-slide-id={slide.id}
      data-slide-kind={slide.kind}
    >
      {slide.kind !== 'cover' ? (
        <header className="mb-[3%] shrink-0">
          <div className="mb-3 h-1 w-14 rounded-full bg-primary-strong" />
          <h2 className="break-words text-[clamp(1.45rem,3cqw,3rem)] font-bold leading-tight tracking-tight text-foreground">{slide.title}</h2>
          {slide.subtitle ? <p className="mt-2 max-w-5xl break-words text-[clamp(0.7rem,1.05cqw,1rem)] text-ink-secondary">{slide.subtitle}</p> : null}
        </header>
      ) : null}

      <SlideContent
        slide={slide}
        onOpenExpenseCategory={onOpenExpenseCategory}
        onOpenResultDetail={onOpenResultDetail}
      />

      <footer className="mt-[2.5%] flex shrink-0 items-end justify-between gap-5 border-t border-border pt-2 text-[clamp(0.55rem,0.72cqw,0.72rem)] text-muted-foreground">
        <span>
          {slide.kind === 'chapter-foundation'
            ? 'Estrutura da apresentação · Dados não solicitados nesta fase'
            : slide.chapter === 'revenue'
              ? `${REVENUE_SOURCE_FOOTER} · ${presentationGeneratedLabel(generatedAt)}`
              : slide.chapter === 'expenses'
                ? `${EXPENSES_SOURCE_FOOTER} · ${presentationGeneratedLabel(generatedAt)}`
                : slide.chapter === 'results'
                  ? `${RESULTS_SOURCE_FOOTER} · ${presentationGeneratedLabel(generatedAt)}`
                  : slide.chapter === 'insights'
                    ? `${INSIGHTS_SOURCE_FOOTER} · ${presentationGeneratedLabel(generatedAt)}`
            : `${PRESENTATION_SOURCE_LABEL} · ${PRESENTATION_REGIME_LABEL} · ${presentationGeneratedLabel(generatedAt)}`}
        </span>
        <span className="whitespace-nowrap">{slideNumber} / {totalSlides}</span>
      </footer>
    </article>
  );
}

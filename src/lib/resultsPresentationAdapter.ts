import {
  PRESENTATION_RESULTS_CONTRACT_VERSION,
  PRESENTATION_RESULTS_SOURCE,
  calculateManagerialMetrics,
  calculatePresentationDeltas,
  roundMoney,
  type CategoryCompositionSection,
  type DataAvailability,
  type ManagerialResultMetrics,
  type PresentationCategoryComposition,
  type PresentationResultBridge,
  type PresentationResultEffectFavorability,
  type PresentationResultsComparisonUnavailableReason,
  type PresentationResultsData,
  type PresentationTimeSeries,
} from '@/domain/financeiro/presentation';

interface ResultsSourceSnapshot {
  metrics: { managerialResult: ManagerialResultMetrics };
  timeSeries: PresentationTimeSeries;
  categoryComposition: PresentationCategoryComposition;
  nonOperationalTotals: {
    revenue: number;
    expense: number;
    result: number;
  };
}

export interface PresentationResultsSource {
  generatedAt: string;
  periodLabel: string;
  current: DataAvailability<ResultsSourceSnapshot>;
  previousPeriod: DataAvailability<ResultsSourceSnapshot>;
}

function copyUnavailable<T>(availability: DataAvailability<unknown>): DataAvailability<T> {
  switch (availability.state) {
    case 'idle':
      return { state: 'idle' };
    case 'loading':
      return { state: 'loading' };
    case 'unavailable':
      return { state: 'unavailable', reason: availability.reason };
    case 'error':
      return { state: 'error', message: availability.message };
    default:
      throw new TypeError('A disponibilidade possui dados e não pode ser copiada como indisponível.');
  }
}

function readAvailableSnapshot(
  availability: DataAvailability<ResultsSourceSnapshot>,
): ResultsSourceSnapshot | undefined {
  return availability.state === 'available' || availability.state === 'empty'
    ? availability.data
    : undefined;
}

function assertCanonicalMetrics(metrics: ManagerialResultMetrics, label: string): void {
  const values = Object.values(metrics);
  if (values.some(value => !Number.isFinite(value))) {
    throw new RangeError(`${label} contém métrica não finita.`);
  }
  const calculated = calculateManagerialMetrics(metrics.revenue, metrics.expense);
  if (
    calculated.result !== metrics.result
    || Math.abs(calculated.marginPercent - metrics.marginPercent) > 0.0001
  ) {
    throw new RangeError(`${label} diverge das fórmulas canônicas de resultado ou margem.`);
  }
}

function favorability(value: number): PresentationResultEffectFavorability {
  if (value > 0) return 'favorable';
  if (value < 0) return 'unfavorable';
  return 'neutral';
}

function comparisonUnavailableReason(
  availability: DataAvailability<ResultsSourceSnapshot>,
): PresentationResultsComparisonUnavailableReason {
  return availability.state === 'unavailable' && availability.reason === 'outside-available-period'
    ? 'outside-available-period'
    : 'comparison-unavailable';
}

export function buildPresentationResultBridge(
  current: ManagerialResultMetrics,
  previous: ManagerialResultMetrics,
): PresentationResultBridge {
  assertCanonicalMetrics(current, 'Resultado atual');
  assertCanonicalMetrics(previous, 'Resultado anterior');

  const revenueEffect = roundMoney(current.revenue - previous.revenue);
  // Sinal econômico: aumento de despesa reduz o resultado.
  const expenseEffect = roundMoney(previous.expense - current.expense);
  const totalChange = roundMoney(current.result - previous.result);
  const bridgedResult = roundMoney(previous.result + revenueEffect + expenseEffect);
  if (bridgedResult !== current.result || roundMoney(revenueEffect + expenseEffect) !== totalChange) {
    throw new RangeError('A ponte não fecha na variação canônica do resultado.');
  }

  return {
    state: 'available',
    previousResult: previous.result,
    revenueEffect,
    expenseEffect,
    totalChange,
    currentResult: current.result,
    steps: [
      {
        key: 'previous-result',
        label: 'Resultado anterior',
        value: previous.result,
        favorability: 'neutral',
      },
      {
        key: 'revenue-effect',
        label: 'Efeito de receita',
        value: revenueEffect,
        favorability: favorability(revenueEffect),
      },
      {
        key: 'expense-effect',
        label: 'Efeito de despesa',
        value: expenseEffect,
        favorability: favorability(expenseEffect),
      },
      {
        key: 'current-result',
        label: 'Resultado atual',
        value: current.result,
        favorability: 'neutral',
      },
    ],
  };
}

function nonOperationalMetrics(snapshot: ResultsSourceSnapshot): ManagerialResultMetrics {
  const totals = snapshot.nonOperationalTotals;
  if (Object.values(totals).some(value => !Number.isFinite(value))) {
    throw new RangeError('Totais não operacionais contêm valor não finito.');
  }
  const calculated = calculateManagerialMetrics(totals.revenue, totals.expense);
  if (calculated.result !== totals.result) {
    throw new RangeError('O resultado não operacional diverge de receita menos despesa.');
  }
  return calculated;
}

export function hasPresentationNonOperationalValues(
  totals: ManagerialResultMetrics,
  composition: CategoryCompositionSection,
): boolean {
  return totals.revenue !== 0
    || totals.expense !== 0
    || totals.result !== 0
    || composition.revenue.length > 0
    || composition.expense.length > 0;
}

export function derivePresentationResultsAvailability(
  source: PresentationResultsSource,
): DataAvailability<PresentationResultsData> {
  const currentSnapshot = readAvailableSnapshot(source.current);
  if (!currentSnapshot) return copyUnavailable(source.current);
  assertCanonicalMetrics(currentSnapshot.metrics.managerialResult, 'Resultado atual');

  const previousSnapshot = readAvailableSnapshot(source.previousPeriod);
  const reason = previousSnapshot ? undefined : comparisonUnavailableReason(source.previousPeriod);
  if (previousSnapshot) assertCanonicalMetrics(previousSnapshot.metrics.managerialResult, 'Resultado anterior');

  const comparison = previousSnapshot
    ? {
        state: 'available' as const,
        previous: previousSnapshot.metrics.managerialResult,
        deltas: calculatePresentationDeltas(
          currentSnapshot.metrics.managerialResult,
          previousSnapshot.metrics.managerialResult,
        ),
      }
    : { state: 'unavailable' as const, reason: reason! };
  const bridge = previousSnapshot
    ? buildPresentationResultBridge(
        currentSnapshot.metrics.managerialResult,
        previousSnapshot.metrics.managerialResult,
      )
    : { state: 'unavailable' as const, reason: reason! };

  const data: PresentationResultsData = {
    contractVersion: PRESENTATION_RESULTS_CONTRACT_VERSION,
    source: PRESENTATION_RESULTS_SOURCE,
    generatedAt: source.generatedAt,
    periodLabel: source.periodLabel,
    current: currentSnapshot.metrics.managerialResult,
    comparison,
    evolution: currentSnapshot.timeSeries,
    bridge,
    nonOperational: {
      totals: nonOperationalMetrics(currentSnapshot),
      composition: currentSnapshot.categoryComposition.nonOperational,
    },
  };

  return source.current.state === 'empty'
    ? { state: 'empty', data, fetchedAt: 'fetchedAt' in source.current ? source.current.fetchedAt : undefined }
    : { state: 'available', data, fetchedAt: 'fetchedAt' in source.current ? source.current.fetchedAt : undefined };
}

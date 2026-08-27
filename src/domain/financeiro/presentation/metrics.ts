import type {
  ManagerialLedgerEntry,
  ManagerialResultMetrics,
  MetricDelta,
  NormalizedDateRange,
  PresentationMetricDeltas,
} from './contracts';

const INCLUDED_STATUSES = new Set(['REALIZADO', 'CONCILIADO']);

function normalizeNegativeZero(value: number): number {
  return Object.is(value, -0) ? 0 : value;
}

export function roundMoney(value: number): number {
  if (!Number.isFinite(value)) {
    throw new RangeError('Financial values must be finite');
  }

  const rounded = Math.sign(value) * Math.round((Math.abs(value) + Number.EPSILON) * 100) / 100;
  return normalizeNegativeZero(rounded);
}

export function isManagerialResultEntry(
  entry: ManagerialLedgerEntry,
  range?: NormalizedDateRange,
): boolean {
  if (!INCLUDED_STATUSES.has(entry.status)) return false;
  if (entry.type !== 'RECEITA' && entry.type !== 'DESPESA') return false;
  if (entry.excludedFromReports) return false;
  if (entry.origin === 'conciliacao' && entry.reconciled !== true) return false;
  if (range && (entry.competenceDate < range.start || entry.competenceDate >= range.endExclusive)) return false;
  return true;
}

export function calculateManagerialMetrics(
  revenue: number,
  expense: number,
): ManagerialResultMetrics {
  const normalizedRevenue = roundMoney(revenue);
  const normalizedExpense = roundMoney(expense);
  const result = roundMoney(normalizedRevenue - normalizedExpense);
  const marginPercent = normalizedRevenue === 0
    ? 0
    : normalizeNegativeZero((result / normalizedRevenue) * 100);

  if (!Number.isFinite(marginPercent)) {
    throw new RangeError('Managerial margin must be finite');
  }

  return {
    revenue: normalizedRevenue,
    expense: normalizedExpense,
    result,
    marginPercent,
  };
}

export function aggregateManagerialResult(
  entries: readonly ManagerialLedgerEntry[],
  range?: NormalizedDateRange,
): ManagerialResultMetrics {
  let revenue = 0;
  let expense = 0;

  for (const entry of entries) {
    if (!isManagerialResultEntry(entry, range)) continue;
    if (!Number.isFinite(entry.amount)) {
      throw new RangeError(`Entry ${entry.id} has a non-finite amount`);
    }
    if (entry.type === 'RECEITA') revenue += entry.amount;
    if (entry.type === 'DESPESA') expense += entry.amount;
  }

  return calculateManagerialMetrics(revenue, expense);
}

export function calculateRelativeDelta(current: number, previous: number): MetricDelta {
  if (!Number.isFinite(current) || !Number.isFinite(previous)) {
    throw new RangeError('Delta values must be finite');
  }

  const absoluteChange = roundMoney(current - previous);
  if (previous === 0) {
    return {
      state: 'unavailable',
      current,
      previous,
      absoluteChange,
      value: null,
      unit: 'percent',
      reason: 'zero-baseline',
    };
  }

  return {
    state: 'available',
    current,
    previous,
    absoluteChange,
    value: normalizeNegativeZero(((current - previous) / Math.abs(previous)) * 100),
    unit: 'percent',
  };
}

export function calculateMarginDelta(
  current: ManagerialResultMetrics,
  previous: ManagerialResultMetrics,
): MetricDelta {
  if (
    !Number.isFinite(current.marginPercent)
    || !Number.isFinite(previous.marginPercent)
    || !Number.isFinite(current.revenue)
    || !Number.isFinite(previous.revenue)
  ) {
    throw new RangeError('Margin delta values must be finite');
  }

  const absoluteChange = roundMoney(current.marginPercent - previous.marginPercent);
  if (previous.revenue === 0) {
    return {
      state: 'unavailable',
      current: current.marginPercent,
      previous: previous.marginPercent,
      absoluteChange,
      value: null,
      unit: 'percentage-points',
      reason: 'zero-baseline',
    };
  }

  return {
    state: 'available',
    current: current.marginPercent,
    previous: previous.marginPercent,
    absoluteChange,
    value: normalizeNegativeZero(current.marginPercent - previous.marginPercent),
    unit: 'percentage-points',
  };
}

export function calculatePresentationDeltas(
  current: ManagerialResultMetrics,
  previous: ManagerialResultMetrics,
): PresentationMetricDeltas {
  return {
    revenue: calculateRelativeDelta(current.revenue, previous.revenue),
    expense: calculateRelativeDelta(current.expense, previous.expense),
    result: calculateRelativeDelta(current.result, previous.result),
    margin: calculateMarginDelta(current, previous),
  };
}

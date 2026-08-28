import type { DataAvailability, YearMonth } from './contracts';
import {
  PRESENTATION_EXPENSES_SOURCE,
  type PresentationExpenseNode,
  type PresentationExpensesData,
} from './expenses';
import {
  PRESENTATION_REVENUE_SOURCE,
  type PresentationRevenueData,
} from './revenue';

export const PRESENTATION_INSIGHTS_CONTRACT_VERSION = '1.0' as const;
export const PRESENTATION_INSIGHTS_RULESET_VERSION = '1.0' as const;

/**
 * Limiares de relevância visual. Eles selecionam leituras já calculadas pelos
 * contratos canônicos e não alteram nenhuma fórmula financeira.
 */
export const PRESENTATION_INSIGHT_RULES = {
  revenueMonthChange: {
    id: 'revenue-month-change',
    version: PRESENTATION_INSIGHTS_RULESET_VERSION,
    priority: 10,
    minimumAbsoluteChange: 1_000,
    minimumPercentageChange: 5,
  },
  revenueWeekdayConcentration: {
    id: 'revenue-weekday-concentration',
    version: PRESENTATION_INSIGHTS_RULESET_VERSION,
    priority: 20,
    minimumOccurrences: 3,
    minimumAmount: 1_000,
    minimumSharePercent: 25,
  },
  revenueHistoryTrend: {
    id: 'revenue-history-trend',
    version: PRESENTATION_INSIGHTS_RULESET_VERSION,
    priority: 30,
    minimumComparableMonths: 4,
    maximumComparableMonths: 6,
    minimumAbsoluteChange: 1_000,
    minimumPercentageChange: 5,
  },
  expensesMonthChange: {
    id: 'expenses-month-change',
    version: PRESENTATION_INSIGHTS_RULESET_VERSION,
    priority: 10,
    minimumAbsoluteChange: 1_000,
    minimumPercentageChange: 5,
  },
  expensesCategoryConcentration: {
    id: 'expenses-category-concentration',
    version: PRESENTATION_INSIGHTS_RULESET_VERSION,
    priority: 20,
    minimumAmount: 1_000,
    minimumSharePercent: 25,
  },
  expensesRollingTrend: {
    id: 'expenses-rolling-trend',
    version: PRESENTATION_INSIGHTS_RULESET_VERSION,
    priority: 30,
    minimumComparableMonths: 3,
    minimumAbsoluteChange: 1_000,
    minimumPercentageChange: 5,
  },
  selection: {
    preferredMinimum: 3,
    maximum: 5,
    maximumPerSlide: 3,
  },
} as const;

export const PRESENTATION_INSIGHT_SOURCES = {
  revenue: {
    ...PRESENTATION_REVENUE_SOURCE,
    regime: 'fechamento-caixa',
  },
  expenses: PRESENTATION_EXPENSES_SOURCE,
} as const;

export type PresentationInsightDomain = 'revenue' | 'expenses';
export type PresentationInsightTone = 'positive' | 'negative' | 'neutral';
type PresentationInsightRuleKey = Exclude<keyof typeof PRESENTATION_INSIGHT_RULES, 'selection'>;
export type PresentationInsightRuleId =
  (typeof PRESENTATION_INSIGHT_RULES)[PresentationInsightRuleKey]['id'];

export type PresentationInsightPercentage =
  | { state: 'available'; value: number }
  | { state: 'unavailable'; reason: 'zero-baseline' };

export type PresentationInsightEvidence =
  | {
      type: 'period-change';
      current: number;
      baseline: number;
      absoluteChange: number;
      percentageChange: PresentationInsightPercentage;
    }
  | {
      type: 'weekday-concentration';
      isoWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
      weekdayLabel: string;
      amount: number;
      periodTotal: number;
      sharePercent: number;
      occurrences: number;
      average: number;
    }
  | {
      type: 'history-window' | 'rolling-window';
      firstValue: number;
      lastValue: number;
      absoluteChange: number;
      percentageChange: PresentationInsightPercentage;
      comparableMonths: number;
    }
  | {
      type: 'expense-category-concentration';
      categoryId: string;
      categoryName: string;
      amount: number;
      periodTotal: number;
      sharePercent: number;
    };

export type PresentationInsightPeriod =
  | {
      type: 'month-comparison';
      label: string;
      currentMonth: YearMonth;
      baselineMonth: YearMonth;
    }
  | {
      type: 'month-weekday';
      label: string;
      month: YearMonth;
      isoWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
    }
  | {
      type: 'month-window';
      label: string;
      startMonth: YearMonth;
      endMonth: YearMonth;
      comparableMonths: number;
    }
  | {
      type: 'month-category';
      label: string;
      month: YearMonth;
    };

export type PresentationInsightSource =
  | typeof PRESENTATION_INSIGHT_SOURCES.revenue
  | typeof PRESENTATION_INSIGHT_SOURCES.expenses;

export interface PresentationInsight {
  id: string;
  ruleId: PresentationInsightRuleId;
  ruleVersion: typeof PRESENTATION_INSIGHTS_RULESET_VERSION;
  domain: PresentationInsightDomain;
  title: string;
  description: string;
  evidence: PresentationInsightEvidence;
  period: PresentationInsightPeriod;
  relevance: {
    score: number;
    rulePriority: number;
  };
  tone: PresentationInsightTone;
  drillDown?: {
    target: 'expenses';
    categoryId: string;
  };
  source: PresentationInsightSource;
  regime: 'fechamento-caixa' | 'caixa';
}

export interface PresentationInsightsData {
  contractVersion: typeof PRESENTATION_INSIGHTS_CONTRACT_VERSION;
  rulesetVersion: typeof PRESENTATION_INSIGHTS_RULESET_VERSION;
  generatedAt: string;
  candidateCount: number;
  preferredMinimum: number;
  maximum: number;
  insights: readonly PresentationInsight[];
}

const DOMAIN_PRIORITY: Readonly<Record<PresentationInsightDomain, number>> = {
  revenue: 0,
  expenses: 1,
};

function round(value: number, decimals = 2): number {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isFiniteNumber(value: number): boolean {
  return Number.isFinite(value);
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function latestTimestamp(left: string, right: string): string {
  const leftTime = Date.parse(left);
  const rightTime = Date.parse(right);
  if (Number.isFinite(leftTime) && Number.isFinite(rightTime) && leftTime !== rightTime) {
    return leftTime > rightTime ? left : right;
  }
  return compareText(left, right) >= 0 ? left : right;
}

function percentageChange(current: number, baseline: number): PresentationInsightPercentage {
  if (baseline === 0) return { state: 'unavailable', reason: 'zero-baseline' };
  return { state: 'available', value: round(((current - baseline) / baseline) * 100, 4) };
}

function isMaterialChange(
  absoluteChange: number,
  percentage: PresentationInsightPercentage,
  minimumAbsoluteChange: number,
  minimumPercentageChange: number,
): boolean {
  if (!isFiniteNumber(absoluteChange) || absoluteChange === 0) return false;
  if (Math.abs(absoluteChange) < minimumAbsoluteChange) return false;
  return percentage.state === 'unavailable'
    || Math.abs(percentage.value) >= minimumPercentageChange;
}

function changeScore(
  absoluteChange: number,
  percentage: PresentationInsightPercentage,
  minimumAbsoluteChange: number,
  minimumPercentageChange: number,
): number {
  const absoluteFactor = Math.min(Math.abs(absoluteChange) / minimumAbsoluteChange, 3);
  const percentageFactor = percentage.state === 'available'
    ? Math.min(Math.abs(percentage.value) / minimumPercentageChange, 3)
    : 1.5;
  return round(Math.min(100, 40 + absoluteFactor * 8 + percentageFactor * 8));
}

function concentrationScore(
  amount: number,
  sharePercent: number,
  minimumAmount: number,
  minimumSharePercent: number,
): number {
  const amountFactor = Math.min(amount / minimumAmount, 3);
  const shareFactor = Math.min(sharePercent / minimumSharePercent, 3);
  return round(Math.min(100, 40 + amountFactor * 6 + shareFactor * 12));
}

function yearMonthIndex(value: YearMonth): number {
  return Number(value.slice(0, 4)) * 12 + Number(value.slice(5, 7)) - 1;
}

function areConsecutiveMonths(values: readonly YearMonth[]): boolean {
  return values.every((value, index) => (
    index === 0 || yearMonthIndex(value) === yearMonthIndex(values[index - 1]) + 1
  ));
}

function latestConsecutiveRevenueWindow(revenue: PresentationRevenueData) {
  const points = [...revenue.history]
    .filter(point => (
      point.state === 'available'
      && point.closingCount > 0
      && isFiniteNumber(point.total)
      && point.yearMonth <= revenue.selectedMonth
    ))
    .sort((left, right) => compareText(left.yearMonth, right.yearMonth));
  if (points.length === 0 || points.at(-1)?.yearMonth !== revenue.selectedMonth) return [];

  let start = points.length - 1;
  while (
    start > 0
    && yearMonthIndex(points[start].yearMonth) === yearMonthIndex(points[start - 1].yearMonth) + 1
  ) start -= 1;
  return points.slice(start).slice(-PRESENTATION_INSIGHT_RULES.revenueHistoryTrend.maximumComparableMonths);
}

function revenueMonthChangeCandidate(revenue: PresentationRevenueData): PresentationInsight | null {
  const rule = PRESENTATION_INSIGHT_RULES.revenueMonthChange;
  if (revenue.current.state !== 'available' || revenue.previous.state !== 'available') return null;
  const current = revenue.current.total;
  const baseline = revenue.previous.total;
  if (!isFiniteNumber(current) || !isFiniteNumber(baseline)) return null;
  const absoluteChange = round(current - baseline);
  const percentage = percentageChange(current, baseline);
  if (!isMaterialChange(
    absoluteChange,
    percentage,
    rule.minimumAbsoluteChange,
    rule.minimumPercentageChange,
  )) return null;
  const increased = absoluteChange > 0;
  return {
    id: `insight-revenue-month-change-${revenue.selectedMonth}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: 'revenue',
    title: increased ? 'Faturamento avançou no mês' : 'Faturamento recuou no mês',
    description: `O faturamento bruto do Fechamento de Caixa ficou ${increased ? 'acima' : 'abaixo'} do mês imediatamente anterior.`,
    evidence: { type: 'period-change', current, baseline, absoluteChange, percentageChange: percentage },
    period: {
      type: 'month-comparison',
      label: `${revenue.selectedMonth} × ${revenue.previousMonth}`,
      currentMonth: revenue.selectedMonth,
      baselineMonth: revenue.previousMonth,
    },
    relevance: {
      score: changeScore(absoluteChange, percentage, rule.minimumAbsoluteChange, rule.minimumPercentageChange),
      rulePriority: rule.priority,
    },
    tone: increased ? 'positive' : 'negative',
    source: PRESENTATION_INSIGHT_SOURCES.revenue,
    regime: 'fechamento-caixa',
  };
}

function revenueWeekdayCandidate(revenue: PresentationRevenueData): PresentationInsight | null {
  const rule = PRESENTATION_INSIGHT_RULES.revenueWeekdayConcentration;
  if (
    revenue.current.state !== 'available'
    || revenue.current.total <= 0
    || !isFiniteNumber(revenue.current.total)
  ) return null;
  const eligible = [...revenue.weekdays]
    .filter(day => (
      day.state === 'available'
      && day.occurrences >= rule.minimumOccurrences
      && day.average.state === 'available'
      && isFiniteNumber(day.total)
      && isFiniteNumber(day.average.value)
    ))
    .sort((left, right) => right.total - left.total || left.isoWeekday - right.isoWeekday);
  const weekday = eligible[0];
  if (!weekday || weekday.average.state !== 'available') return null;
  const sharePercent = round((weekday.total / revenue.current.total) * 100, 4);
  if (weekday.total < rule.minimumAmount || sharePercent < rule.minimumSharePercent) return null;
  return {
    id: `insight-revenue-weekday-${revenue.selectedMonth}-${weekday.isoWeekday}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: 'revenue',
    title: `${weekday.label} concentrou faturamento relevante`,
    description: 'O dia reuniu ocorrências suficientes e a maior participação no faturamento bruto do mês.',
    evidence: {
      type: 'weekday-concentration',
      isoWeekday: weekday.isoWeekday,
      weekdayLabel: weekday.label,
      amount: weekday.total,
      periodTotal: revenue.current.total,
      sharePercent,
      occurrences: weekday.occurrences,
      average: weekday.average.value,
    },
    period: {
      type: 'month-weekday',
      label: `${weekday.label} em ${revenue.selectedMonth}`,
      month: revenue.selectedMonth,
      isoWeekday: weekday.isoWeekday,
    },
    relevance: {
      score: concentrationScore(
        weekday.total,
        sharePercent,
        rule.minimumAmount,
        rule.minimumSharePercent,
      ),
      rulePriority: rule.priority,
    },
    tone: 'neutral',
    source: PRESENTATION_INSIGHT_SOURCES.revenue,
    regime: 'fechamento-caixa',
  };
}

function revenueHistoryCandidate(revenue: PresentationRevenueData): PresentationInsight | null {
  const rule = PRESENTATION_INSIGHT_RULES.revenueHistoryTrend;
  const window = latestConsecutiveRevenueWindow(revenue);
  if (
    window.length < rule.minimumComparableMonths
    || !areConsecutiveMonths(window.map(point => point.yearMonth))
  ) return null;
  const first = window[0];
  const last = window.at(-1)!;
  const absoluteChange = round(last.total - first.total);
  const percentage = percentageChange(last.total, first.total);
  if (!isMaterialChange(
    absoluteChange,
    percentage,
    rule.minimumAbsoluteChange,
    rule.minimumPercentageChange,
  )) return null;
  const increased = absoluteChange > 0;
  return {
    id: `insight-revenue-history-${first.yearMonth}-${last.yearMonth}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: 'revenue',
    title: increased
      ? 'Faturamento encerrou a janela histórica acima do início'
      : 'Faturamento encerrou a janela histórica abaixo do início',
    description: `O último de ${window.length} meses consecutivos com fechamento ficou ${increased ? 'acima' : 'abaixo'} do primeiro.`,
    evidence: {
      type: 'history-window',
      firstValue: first.total,
      lastValue: last.total,
      absoluteChange,
      percentageChange: percentage,
      comparableMonths: window.length,
    },
    period: {
      type: 'month-window',
      label: `${first.yearMonth} a ${last.yearMonth}`,
      startMonth: first.yearMonth,
      endMonth: last.yearMonth,
      comparableMonths: window.length,
    },
    relevance: {
      score: changeScore(absoluteChange, percentage, rule.minimumAbsoluteChange, rule.minimumPercentageChange),
      rulePriority: rule.priority,
    },
    tone: increased ? 'positive' : 'negative',
    source: PRESENTATION_INSIGHT_SOURCES.revenue,
    regime: 'fechamento-caixa',
  };
}

function expensesMonthChangeCandidate(expenses: PresentationExpensesData): PresentationInsight | null {
  const rule = PRESENTATION_INSIGHT_RULES.expensesMonthChange;
  if (expenses.current.state !== 'available' || expenses.previous.state !== 'available') return null;
  const current = expenses.current.total;
  const baseline = expenses.previous.total;
  if (!isFiniteNumber(current) || !isFiniteNumber(baseline)) return null;
  const absoluteChange = round(current - baseline);
  const percentage = percentageChange(current, baseline);
  if (!isMaterialChange(
    absoluteChange,
    percentage,
    rule.minimumAbsoluteChange,
    rule.minimumPercentageChange,
  )) return null;
  const increased = absoluteChange > 0;
  return {
    id: `insight-expenses-month-change-${expenses.selectedMonth}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: 'expenses',
    title: increased ? 'Despesas aumentaram no mês' : 'Despesas recuaram no mês',
    description: `As despesas realizadas no caixa do DFC ficaram ${increased ? 'acima' : 'abaixo'} do mês imediatamente anterior.`,
    evidence: { type: 'period-change', current, baseline, absoluteChange, percentageChange: percentage },
    period: {
      type: 'month-comparison',
      label: `${expenses.selectedMonth} × ${expenses.previousMonth}`,
      currentMonth: expenses.selectedMonth,
      baselineMonth: expenses.previousMonth,
    },
    relevance: {
      score: changeScore(absoluteChange, percentage, rule.minimumAbsoluteChange, rule.minimumPercentageChange),
      rulePriority: rule.priority,
    },
    // Semântica inversa: despesa maior é desfavorável; menor é favorável.
    tone: increased ? 'negative' : 'positive',
    source: PRESENTATION_INSIGHT_SOURCES.expenses,
    regime: 'caixa',
  };
}

function expensesCategoryCandidate(expenses: PresentationExpensesData): PresentationInsight | null {
  const rule = PRESENTATION_INSIGHT_RULES.expensesCategoryConcentration;
  if (
    expenses.current.state !== 'available'
    || expenses.current.total <= 0
    || !isFiniteNumber(expenses.current.total)
  ) return null;
  // As raízes são buckets não sobrepostos. O valor acumulado corresponde ao
  // drill-down tenant-scoped da própria categoria, incluindo descendentes.
  const categories = [...expenses.tree]
    .filter((node): node is PresentationExpenseNode & { categoryId: string } => (
      node.categoryId !== null && node.amount > 0 && isFiniteNumber(node.amount)
    ))
    .sort((left, right) => (
      right.amount - left.amount
      || left.order - right.order
      || compareText(left.name, right.name)
      || compareText(left.categoryId, right.categoryId)
    ));
  const category = categories[0];
  if (!category) return null;
  const sharePercent = round((category.amount / expenses.current.total) * 100, 4);
  if (category.amount < rule.minimumAmount || sharePercent < rule.minimumSharePercent) return null;
  return {
    id: `insight-expenses-category-${expenses.selectedMonth}-${category.categoryId}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: 'expenses',
    title: `${category.name} concentrou despesas no mês`,
    description: 'A categoria e seus descendentes responderam por uma parcela material das despesas de caixa do DFC.',
    evidence: {
      type: 'expense-category-concentration',
      categoryId: category.categoryId,
      categoryName: category.name,
      amount: category.amount,
      periodTotal: expenses.current.total,
      sharePercent,
    },
    period: {
      type: 'month-category',
      label: expenses.selectedMonth,
      month: expenses.selectedMonth,
    },
    relevance: {
      score: concentrationScore(
        category.amount,
        sharePercent,
        rule.minimumAmount,
        rule.minimumSharePercent,
      ),
      rulePriority: rule.priority,
    },
    tone: 'neutral',
    drillDown: { target: 'expenses', categoryId: category.categoryId },
    source: PRESENTATION_INSIGHT_SOURCES.expenses,
    regime: 'caixa',
  };
}

function expensesRollingCandidate(expenses: PresentationExpensesData): PresentationInsight | null {
  const rule = PRESENTATION_INSIGHT_RULES.expensesRollingTrend;
  const window = [...expenses.rollingThreeMonths]
    .sort((left, right) => compareText(left.yearMonth, right.yearMonth));
  if (
    window.length !== rule.minimumComparableMonths
    || window.some(point => point.state !== 'available' || !isFiniteNumber(point.total))
    || window.at(-1)?.yearMonth !== expenses.selectedMonth
    || !areConsecutiveMonths(window.map(point => point.yearMonth))
  ) return null;
  const first = window[0];
  const last = window.at(-1)!;
  const absoluteChange = round(last.total - first.total);
  const percentage = percentageChange(last.total, first.total);
  if (!isMaterialChange(
    absoluteChange,
    percentage,
    rule.minimumAbsoluteChange,
    rule.minimumPercentageChange,
  )) return null;
  const increased = absoluteChange > 0;
  return {
    id: `insight-expenses-rolling-${first.yearMonth}-${last.yearMonth}`,
    ruleId: rule.id,
    ruleVersion: rule.version,
    domain: 'expenses',
    title: increased
      ? 'Despesas subiram na janela de três meses'
      : 'Despesas caíram na janela de três meses',
    description: `O último mês da janela móvel ficou ${increased ? 'acima' : 'abaixo'} do primeiro no caixa do DFC.`,
    evidence: {
      type: 'rolling-window',
      firstValue: first.total,
      lastValue: last.total,
      absoluteChange,
      percentageChange: percentage,
      comparableMonths: window.length,
    },
    period: {
      type: 'month-window',
      label: `${first.yearMonth} a ${last.yearMonth}`,
      startMonth: first.yearMonth,
      endMonth: last.yearMonth,
      comparableMonths: window.length,
    },
    relevance: {
      score: changeScore(absoluteChange, percentage, rule.minimumAbsoluteChange, rule.minimumPercentageChange),
      rulePriority: rule.priority,
    },
    tone: increased ? 'negative' : 'positive',
    source: PRESENTATION_INSIGHT_SOURCES.expenses,
    regime: 'caixa',
  };
}

/**
 * Ordenação estável: relevância decrescente, domínio, prioridade da regra e ID.
 */
export function comparePresentationInsights(
  left: PresentationInsight,
  right: PresentationInsight,
): number {
  return right.relevance.score - left.relevance.score
    || DOMAIN_PRIORITY[left.domain] - DOMAIN_PRIORITY[right.domain]
    || left.relevance.rulePriority - right.relevance.rulePriority
    || compareText(left.id, right.id);
}

export function generatePresentationInsights(
  revenue: PresentationRevenueData,
  expenses: PresentationExpensesData,
): PresentationInsightsData {
  const candidates = [
    revenueMonthChangeCandidate(revenue),
    revenueWeekdayCandidate(revenue),
    revenueHistoryCandidate(revenue),
    expensesMonthChangeCandidate(expenses),
    expensesCategoryCandidate(expenses),
    expensesRollingCandidate(expenses),
  ].filter((candidate): candidate is PresentationInsight => candidate !== null)
    .sort(comparePresentationInsights);
  const insights = candidates.slice(0, PRESENTATION_INSIGHT_RULES.selection.maximum);
  return {
    contractVersion: PRESENTATION_INSIGHTS_CONTRACT_VERSION,
    rulesetVersion: PRESENTATION_INSIGHTS_RULESET_VERSION,
    generatedAt: latestTimestamp(revenue.generatedAt, expenses.generatedAt),
    candidateCount: candidates.length,
    preferredMinimum: PRESENTATION_INSIGHT_RULES.selection.preferredMinimum,
    maximum: PRESENTATION_INSIGHT_RULES.selection.maximum,
    insights,
  };
}

function readMaterialized<T>(availability: DataAvailability<T>): T | undefined {
  return availability.state === 'available' || availability.state === 'empty'
    ? availability.data
    : undefined;
}

export function derivePresentationInsightsAvailability(
  revenue: DataAvailability<PresentationRevenueData>,
  expenses: DataAvailability<PresentationExpensesData>,
): DataAvailability<PresentationInsightsData> {
  const inputs = [revenue, expenses] as const;
  if (inputs.some(input => input.state === 'error')) {
    return { state: 'error', message: 'Não foi possível gerar Insights porque um contrato canônico falhou.' };
  }
  if (inputs.some(input => input.state === 'loading')) return { state: 'loading' };
  if (inputs.some(input => input.state === 'idle')) return { state: 'idle' };
  const unavailable = inputs.find(input => input.state === 'unavailable');
  if (unavailable?.state === 'unavailable') {
    return { state: 'unavailable', reason: unavailable.reason };
  }

  const revenueData = readMaterialized(revenue);
  const expensesData = readMaterialized(expenses);
  if (!revenueData || !expensesData) {
    return { state: 'unavailable', reason: 'missing-canonical-source' };
  }
  const data = generatePresentationInsights(revenueData, expensesData);
  return data.insights.length > 0
    ? { state: 'available', data, fetchedAt: data.generatedAt }
    : { state: 'empty', data, fetchedAt: data.generatedAt };
}

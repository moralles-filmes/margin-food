import type { NormalizedDateRange } from './contracts';
import { roundMoney } from './metrics';

export const PRESENTATION_COMPARISON_MODES = ['actual', 'budget', 'projection'] as const;
export type PresentationComparisonMode = typeof PRESENTATION_COMPARISON_MODES[number];

export type PresentationPlanMetricKey = 'revenue' | 'expense' | 'result' | 'margin' | 'cmv';

export interface PresentationPlanMetricSet {
  revenue: number | null;
  expense: number | null;
  result: number | null;
  marginPercent: number | null;
  cmv: number | null;
  cmvPercent: number | null;
}

export interface PresentationPlanCoverage {
  configured: boolean;
  complete: boolean;
  actualCovered: number;
  actualTotal: number;
}

export interface PresentationPlanRules {
  /** 'competencia' é o valor legado gravado antes do realizado passar a ser por caixa. */
  regime: 'caixa' | 'competencia';
  budgetProration: string;
  hierarchyPrecedence: string;
  projectionFormula: string;
  openItemsIncluded: false;
}

export type PresentationProjectionState =
  | 'available'
  | 'insufficient-sample'
  | 'period-complete'
  | 'period-not-started';

export interface PresentationProjection {
  state: PresentationProjectionState;
  cutoffDate: string;
  sampleDays: number;
  totalDays: number;
  factor: number | null;
  metrics: PresentationPlanMetricSet | null;
}

export interface PresentationPlanSeriesPoint extends NormalizedDateRange {
  key: string;
  actual: PresentationPlanMetricSet;
  budget: PresentationPlanMetricSet;
}

export interface PresentationPlanCategory {
  categoryId: string;
  parentCategoryId: string | null;
  name: string;
  nature: 'RECEITA' | 'DESPESA';
  effectiveGroup: string | null;
  depth: number;
  directActual: number;
  actualAmount: number;
  directBudget: number | null;
  budgetAmount: number | null;
  actualCoveredAmount: number;
  budgetConfigured: boolean;
  coverageComplete: boolean;
  varianceAmount: number | null;
  variancePercent: number | null;
  revenueSharePercent: number | null;
  resultSharePercent: number | null;
}

export interface PresentationPlanCategoryPage {
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  items: readonly PresentationPlanCategory[];
}

export interface PresentationPlanVariation {
  categoryId: string;
  name: string;
  nature: 'RECEITA' | 'DESPESA';
  actualAmount: number;
  budgetAmount: number;
  varianceAmount: number;
  variancePercent: number | null;
}

export interface PresentationPlanData {
  contractVersion: '1.0';
  generatedAt: string;
  range: NormalizedDateRange;
  sources: {
    actual: 'fin_lancamentos';
    budget: 'fin_orcamentos';
    cmvTarget: 'metas_cmv.meta_cmv_total';
  };
  rules: PresentationPlanRules;
  actual: PresentationPlanMetricSet;
  budget: PresentationPlanMetricSet & {
    cmvTargetPercent: number | null;
    cmvTargetState: 'available' | 'not-configured' | 'partial' | 'mixed-values';
  };
  coverage: {
    revenue: PresentationPlanCoverage;
    expense: PresentationPlanCoverage;
    cmv: PresentationPlanCoverage;
  };
  projection: PresentationProjection;
  series: readonly PresentationPlanSeriesPoint[];
  categories: PresentationPlanCategoryPage;
  variations: {
    favorable: readonly PresentationPlanVariation[];
    unfavorable: readonly PresentationPlanVariation[];
  };
  hierarchyConflictCount: number;
}

export type PresentationPlanStatus =
  | 'favorable'
  | 'unfavorable'
  | 'on-target'
  | 'not-configured'
  | 'partial'
  | 'unavailable';

export interface PresentationPlanIndicator {
  key: PresentationPlanMetricKey;
  label: string;
  unit: 'currency' | 'percent';
  actual: number | null;
  budget: number | null;
  projection: number | null;
  deviation: number | null;
  deviationPercent: number | null;
  deviationUnit: 'currency' | 'percentage-points';
  status: PresentationPlanStatus;
  statusLabel: string;
  favorableWhenHigher: boolean;
  participationPercent: number | null;
}

function metricCoverage(
  key: PresentationPlanMetricKey,
  plan: PresentationPlanData,
): PresentationPlanCoverage | null {
  if (key === 'revenue') return plan.coverage.revenue;
  if (key === 'expense') return plan.coverage.expense;
  if (key === 'cmv') {
    if (plan.budget.cmvTargetState === 'available') {
      return {
        configured: true,
        complete: true,
        actualCovered: plan.actual.cmv ?? 0,
        actualTotal: plan.actual.cmv ?? 0,
      };
    }
    if (plan.budget.cmvTargetState === 'partial' || plan.budget.cmvTargetState === 'mixed-values') {
      return {
        configured: true,
        complete: false,
        actualCovered: 0,
        actualTotal: plan.actual.cmv ?? 0,
      };
    }
    return plan.coverage.cmv;
  }
  if (key === 'result' || key === 'margin') {
    const revenue = plan.coverage.revenue;
    const expense = plan.coverage.expense;
    return {
      configured: revenue.configured && expense.configured,
      complete: revenue.complete && expense.complete,
      actualCovered: roundMoney(revenue.actualCovered - expense.actualCovered),
      actualTotal: roundMoney(revenue.actualTotal - expense.actualTotal),
    };
  }
  return null;
}

function metricValue(
  metrics: PresentationPlanMetricSet,
  key: PresentationPlanMetricKey,
): number | null {
  if (key === 'margin') return metrics.marginPercent;
  return metrics[key];
}

function statusForDeviation(
  actual: number | null,
  budget: number | null,
  coverage: PresentationPlanCoverage | null,
  favorableWhenHigher: boolean,
): Pick<PresentationPlanIndicator, 'status' | 'statusLabel'> {
  if (coverage?.configured && !coverage.complete) {
    return { status: 'partial', statusLabel: 'Meta/orçamento parcial' };
  }
  if (budget === null || !coverage?.configured) {
    return { status: 'not-configured', statusLabel: 'Meta não configurada' };
  }
  if (actual === null) {
    return { status: 'unavailable', statusLabel: 'Indicador indisponível' };
  }

  const difference = actual - budget;
  if (Math.abs(difference) < 0.005) return { status: 'on-target', statusLabel: 'Em linha com a meta' };
  const favorable = favorableWhenHigher ? difference > 0 : difference < 0;
  return favorable
    ? { status: 'favorable', statusLabel: 'Variação favorável' }
    : { status: 'unfavorable', statusLabel: 'Variação desfavorável' };
}

export function buildPresentationPlanIndicators(
  plan: PresentationPlanData,
): readonly PresentationPlanIndicator[] {
  const definitions: Array<{
    key: PresentationPlanMetricKey;
    label: string;
    unit: PresentationPlanIndicator['unit'];
    favorableWhenHigher: boolean;
  }> = [
    { key: 'revenue', label: 'Receita operacional', unit: 'currency', favorableWhenHigher: true },
    { key: 'expense', label: 'Despesa operacional', unit: 'currency', favorableWhenHigher: false },
    { key: 'result', label: 'Resultado operacional', unit: 'currency', favorableWhenHigher: true },
    { key: 'margin', label: 'Margem operacional', unit: 'percent', favorableWhenHigher: true },
    { key: 'cmv', label: 'CMV sobre receita', unit: 'percent', favorableWhenHigher: false },
  ];

  return definitions.map(definition => {
    const actual = definition.key === 'cmv'
      ? plan.actual.cmvPercent
      : metricValue(plan.actual, definition.key);
    const budget = definition.key === 'cmv'
      ? plan.budget.cmvTargetState === 'available'
        ? plan.budget.cmvTargetPercent
        : plan.budget.cmvPercent
      : metricValue(plan.budget, definition.key);
    const projection = plan.projection.metrics
      ? definition.key === 'cmv'
        ? plan.projection.metrics.cmvPercent
        : metricValue(plan.projection.metrics, definition.key)
      : null;
    const coverage = metricCoverage(definition.key, plan);
    const status = statusForDeviation(
      actual,
      budget,
      coverage,
      definition.favorableWhenHigher,
    );
    const deviation = actual === null || budget === null || !coverage?.complete
      ? null
      : definition.unit === 'currency'
        ? roundMoney(actual - budget)
        : actual - budget;
    const deviationPercent = deviation === null || budget === 0
      ? null
      : (deviation / Math.abs(budget)) * 100;
    const participationValue = definition.key === 'margin'
      ? null
      : definition.key === 'cmv'
        ? plan.actual.cmv
        : actual;

    return {
      ...definition,
      actual,
      budget,
      projection,
      deviation,
      deviationPercent,
      deviationUnit: definition.unit === 'currency' ? 'currency' : 'percentage-points',
      ...status,
      participationPercent: plan.actual.result === null
        || plan.actual.result === 0
        || participationValue === null
        ? null
        : (participationValue / Math.abs(plan.actual.result)) * 100,
    };
  });
}

export function selectedPresentationPlanValue(
  indicator: PresentationPlanIndicator,
  mode: PresentationComparisonMode,
): number | null {
  if (mode === 'actual') return indicator.actual;
  if (mode === 'budget') return indicator.budget;
  return indicator.projection;
}

export function presentationPlanHasConfiguredTarget(plan: PresentationPlanData): boolean {
  return plan.coverage.revenue.configured
    || plan.coverage.expense.configured
    || plan.coverage.cmv.configured
    || plan.budget.cmvTargetState === 'available';
}

export function presentationPlanActualMatches(
  plan: PresentationPlanData,
  expected: { revenue: number; expense: number; result: number },
): boolean {
  return Math.abs((plan.actual.revenue ?? 0) - expected.revenue) < 0.005
    && Math.abs((plan.actual.expense ?? 0) - expected.expense) < 0.005
    && Math.abs((plan.actual.result ?? 0) - expected.result) < 0.005;
}

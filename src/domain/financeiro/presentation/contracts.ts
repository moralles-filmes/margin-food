import { REALIZADO_STATUSES } from '../invariants';
import type { PresentationPlanData } from './plan';
import type { PresentationScenarioResult } from './scenario';
import type {
  PresentationDecisionComparison,
  PresentationDecisionDetail,
} from './decisions';
import type { PresentationChapterId } from './chapters';
import type { PresentationRevenueData } from './revenue';
import type { PresentationExpenseNode, PresentationExpensesData } from './expenses';
import type { PresentationResultsData } from './results';
import type { PresentationInsight, PresentationInsightsData } from './insights';

/**
 * Contrato de dados da Apresentação Sócios.
 *
 * Este módulo não descreve transporte, RPC, tela ou exportação. Ele fixa a
 * semântica que qualquer backend e consumidor das próximas fases deve manter.
 */

export const PRESENTATION_CONTRACT_VERSION = '1.0' as const;

export const MANAGERIAL_RESULT_CONTRACT = {
  source: 'fin_lancamentos',
  dateField: 'data_competencia',
  regime: 'competencia',
  includedStatuses: REALIZADO_STATUSES,
  includedTypes: ['RECEITA', 'DESPESA'] as const,
  excludedTypes: ['TRANSFERENCIA'] as const,
  excludedReportFlag: 'excluir_dos_relatorios',
  excludedUnreconciledOrigin: {
    origin: 'conciliacao',
    reconciledField: 'conciliado',
  },
  formulas: {
    result: 'revenue - expense',
    marginPercent: 'revenue === 0 ? 0 : (result / revenue) * 100',
  },
  openItems: {
    accountsPayable: {
      source: 'fin_contas_pagar',
      dateField: 'data_vencimento',
      closedOrDraftStatuses: ['PAGO', 'CANCELADO', 'RASCUNHO'] as const,
    },
    accountsReceivable: {
      source: 'fin_contas_receber',
      dateField: 'data_vencimento',
      closedOrDraftStatuses: ['RECEBIDO', 'CANCELADO', 'RASCUNHO'] as const,
    },
    excludedReportFlag: 'excluir_dos_relatorios',
    participation: 'indicators-only',
  },
  categoryResolution: {
    primary: 'fin_lancamento_rateios',
    fallback: 'fin_lancamentos.categoria_id',
    nonOperationalFlag: 'excluir_dos_relatorios',
    preserveHierarchy: true,
  },
} as const;

export type IsoDate = string;
export type YearMonth = string;

export const PRESENTATION_PERIOD_PRESETS = [
  'month',
  'month-range',
  'year',
  'year-to-date',
  'all-time',
  'custom',
] as const;

export type PresentationPeriodPreset = typeof PRESENTATION_PERIOD_PRESETS[number];

export type PresentationPeriodFilter =
  | { kind: 'month'; month: YearMonth }
  | { kind: 'month-range'; startMonth: YearMonth; endMonth: YearMonth }
  | { kind: 'year'; year: number }
  | { kind: 'year-to-date'; year: number; through: IsoDate }
  | { kind: 'all-time' }
  | { kind: 'custom'; start: IsoDate; endInclusive: IsoDate };

export interface AvailablePeriodBounds {
  minDate: IsoDate;
  maxDate: IsoDate;
}

/** Intervalo canônico: início inclusivo e fim exclusivo. */
export interface NormalizedDateRange {
  start: IsoDate;
  endExclusive: IsoDate;
}

export interface NormalizedPresentationPeriod extends NormalizedDateRange {
  filterKind: PresentationPeriodPreset;
  isCompleteCalendarPeriod: boolean;
}

export type ComparisonKind = 'previous-period' | 'previous-year';
export type ComparisonAlignment =
  | 'calendar-month'
  | 'equivalent-month-range'
  | 'equivalent-day-duration'
  | 'aligned-calendar-year';

export type ComparisonPeriodAvailability =
  | { state: 'available' }
  | { state: 'unavailable'; reason: 'outside-available-period' };

export interface ComparisonPeriodDefinition {
  kind: ComparisonKind;
  range: NormalizedDateRange;
  alignment: ComparisonAlignment;
  availability: ComparisonPeriodAvailability;
}

export interface PresentationComparisons {
  previousPeriod: ComparisonPeriodDefinition;
  previousYear: ComparisonPeriodDefinition;
}

export type ManagerialEntryType = 'RECEITA' | 'DESPESA' | 'TRANSFERENCIA';

export interface ManagerialAllocation {
  categoryId: string | null;
  amount: number;
}

/** Representação mínima da fonte canônica `fin_lancamentos`. */
export interface ManagerialLedgerEntry {
  id: string;
  type: ManagerialEntryType;
  status: string;
  amount: number;
  competenceDate: IsoDate;
  origin: string;
  reconciled: boolean | null;
  excludedFromReports: boolean;
  categoryId: string | null;
  allocations?: readonly ManagerialAllocation[] | null;
}

export interface ManagerialResultMetrics {
  revenue: number;
  expense: number;
  result: number;
  marginPercent: number;
}

export interface OpenItemsIndicator {
  amount: number;
  count: number;
}

/** CP/CR em aberto são indicadores e nunca entram no resultado gerencial. */
export interface OpenItemsIndicators {
  accountsPayableOpen: OpenItemsIndicator;
  accountsReceivableOpen: OpenItemsIndicator;
}

export interface PresentationMetrics {
  managerialResult: ManagerialResultMetrics;
  openItems: OpenItemsIndicators;
}

export type MetricDeltaUnavailableReason = 'zero-baseline';

export type MetricDelta =
  | {
      state: 'available';
      current: number;
      previous: number;
      absoluteChange: number;
      value: number;
      unit: 'percent' | 'percentage-points';
    }
  | {
      state: 'unavailable';
      current: number;
      previous: number;
      absoluteChange: number | null;
      value: null;
      unit: 'percent' | 'percentage-points';
      reason: MetricDeltaUnavailableReason;
    };

export interface PresentationMetricDeltas {
  revenue: MetricDelta;
  expense: MetricDelta;
  result: MetricDelta;
  margin: MetricDelta;
}

export type TimeSeriesGranularity = 'day' | 'month' | 'year';

export interface PresentationTimeSeriesPoint extends NormalizedDateRange {
  key: string;
  label: string;
  metrics: ManagerialResultMetrics;
}

export interface PresentationTimeSeries {
  granularity: TimeSeriesGranularity;
  points: readonly PresentationTimeSeriesPoint[];
}

export type CategoryNature = 'RECEITA' | 'DESPESA';

export interface PresentationCategoryDefinition {
  id: string;
  parentId: string | null;
  name: string;
  nature: CategoryNature;
  excludedFromTotals: boolean;
  order: number;
}

export interface ResolvedCategoryAmount {
  entryId: string;
  categoryId: string | null;
  nature: CategoryNature;
  amount: number;
  source: 'allocation' | 'entry-category';
  excludedFromTotals: boolean;
}

/** Nó hierárquico; `amount` inclui o valor direto e todos os descendentes. */
export interface CategoryCompositionNode {
  categoryId: string | null;
  parentCategoryId: string | null;
  name: string;
  nature: CategoryNature;
  directAmount: number;
  amount: number;
  sharePercent: number;
  children: readonly CategoryCompositionNode[];
}

export interface CategoryCompositionSection {
  revenue: readonly CategoryCompositionNode[];
  expense: readonly CategoryCompositionNode[];
}

export interface PresentationCategoryComposition {
  operational: CategoryCompositionSection;
  /** Seção apenas informativa, fora de receita, despesa, resultado e margem. */
  nonOperational: CategoryCompositionSection;
}

export interface PresentationRankingItem {
  rank: number;
  categoryId: string | null;
  label: string;
  amount: number;
  sharePercent: number;
}

export interface PresentationRankings {
  topRevenueCategories: readonly PresentationRankingItem[];
  topExpenseCategories: readonly PresentationRankingItem[];
}

export const DETERMINISTIC_HIGHLIGHT_RULES = [
  'managerial-result',
  'margin',
  'revenue-change',
  'expense-change',
  'largest-revenue-category',
  'largest-expense-category',
  'open-receivables',
  'open-payables',
] as const;

export type DeterministicHighlightRule = typeof DETERMINISTIC_HIGHLIGHT_RULES[number];

export interface DeterministicHighlight {
  id: string;
  rule: DeterministicHighlightRule;
  priority: number;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
  value: number;
  comparisonValue?: number;
  categoryId?: string | null;
}

export type DataUnavailableReason =
  | 'outside-available-period'
  | 'missing-canonical-source'
  | 'permission-denied'
  | 'not-requested';

export type DataAvailability<T> =
  | { state: 'idle' }
  | { state: 'loading' }
  | { state: 'available'; data: T; fetchedAt?: string }
  | { state: 'empty'; data: T; fetchedAt?: string }
  | { state: 'unavailable'; reason: DataUnavailableReason }
  | { state: 'error'; message: string };

export interface PresentationPeriodSnapshot {
  metrics: PresentationMetrics;
  deltas?: PresentationMetricDeltas;
  timeSeries: PresentationTimeSeries;
  categoryComposition: PresentationCategoryComposition;
  rankings: PresentationRankings;
  highlights: readonly DeterministicHighlight[];
}

export interface PresentationComparisonData {
  definition: ComparisonPeriodDefinition;
  snapshot: DataAvailability<PresentationPeriodSnapshot>;
}

export type PresentationSlideKind =
  | 'chapter-foundation'
  | 'revenue-summary'
  | 'revenue-weekdays'
  | 'revenue-history'
  | 'expenses-summary'
  | 'expenses-tree'
  | 'expenses-rolling'
  | 'expenses-history'
  | 'results-summary'
  | 'results-comparison'
  | 'results-evolution'
  | 'results-bridge'
  | 'results-non-operational'
  | 'insights'
  | 'cover'
  | 'executive-summary'
  | 'plan-comparison'
  | 'scenario-impact'
  | 'scenario-sensitivity'
  | 'decision-commitments'
  | 'decision-follow-up'
  | 'time-series'
  | 'category-composition'
  | 'rankings'
  | 'highlights'
  | 'open-items'
  | 'non-operational';

export type PresentationSlidePayload =
  | { type: 'chapter-foundation'; chapter: PresentationChapterId }
  | { type: 'revenue-summary'; revenue: PresentationRevenueData }
  | { type: 'revenue-weekdays'; revenue: PresentationRevenueData }
  | { type: 'revenue-history'; revenue: PresentationRevenueData }
  | { type: 'expenses-summary'; expenses: PresentationExpensesData }
  | {
      type: 'expenses-tree';
      expenses: PresentationExpensesData;
      nodes: readonly PresentationExpenseNode[];
    }
  | { type: 'expenses-rolling'; expenses: PresentationExpensesData }
  | { type: 'expenses-history'; expenses: PresentationExpensesData }
  | { type: 'results-summary'; results: PresentationResultsData }
  | { type: 'results-comparison'; results: PresentationResultsData }
  | { type: 'results-evolution'; results: PresentationResultsData; timeSeries: PresentationTimeSeries }
  | { type: 'results-bridge'; results: PresentationResultsData }
  | {
      type: 'results-non-operational';
      results: PresentationResultsData;
      composition: CategoryCompositionSection;
    }
  | {
      type: 'insights';
      insights: PresentationInsightsData;
      items: readonly PresentationInsight[];
    }
  | { type: 'cover'; periodLabel: string }
  | { type: 'executive-summary'; metrics: PresentationMetrics; deltas?: PresentationMetricDeltas }
  | { type: 'plan-comparison'; plan: PresentationPlanData }
  | { type: 'scenario-impact'; scenario: PresentationScenarioResult }
  | { type: 'scenario-sensitivity'; scenario: PresentationScenarioResult }
  | { type: 'decision-commitments'; decision: PresentationDecisionDetail }
  | {
      type: 'decision-follow-up';
      decision: PresentationDecisionDetail;
      comparison: Extract<PresentationDecisionComparison, { state: 'available' }>;
    }
  | { type: 'time-series'; timeSeries: PresentationTimeSeries }
  | { type: 'category-composition'; composition: CategoryCompositionSection }
  | { type: 'rankings'; rankings: PresentationRankings }
  | { type: 'highlights'; highlights: readonly DeterministicHighlight[] }
  | { type: 'open-items'; indicators: OpenItemsIndicators }
  | { type: 'non-operational'; composition: CategoryCompositionSection };

export interface PresentationSlideBase<
  TKind extends PresentationSlideKind,
  TPayload extends PresentationSlidePayload,
> {
  id: string;
  chapter: PresentationChapterId;
  kind: TKind;
  order: number;
  title: string;
  subtitle?: string;
  availability: DataAvailability<TPayload>;
}

export type PresentationSlide = {
  [TKind in PresentationSlideKind]: PresentationSlideBase<
    TKind,
    Extract<PresentationSlidePayload, { type: TKind }>
  >
}[PresentationSlideKind];

export interface PresentationData {
  contractVersion: typeof PRESENTATION_CONTRACT_VERSION;
  generatedAt: string;
  filter: PresentationPeriodFilter;
  period: NormalizedPresentationPeriod;
  periodLabel: string;
  availableBounds?: AvailablePeriodBounds;
  current: DataAvailability<PresentationPeriodSnapshot>;
  comparisons: {
    previousPeriod: PresentationComparisonData;
    previousYear: PresentationComparisonData;
  };
  slides: readonly PresentationSlide[];
}

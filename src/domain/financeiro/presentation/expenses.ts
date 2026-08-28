import type { IsoDate, YearMonth } from './contracts';

export const PRESENTATION_EXPENSES_CONTRACT_VERSION = '1.0' as const;

export const PRESENTATION_EXPENSES_SOURCE = {
  report: 'DFC',
  regime: 'caixa',
  relations: [
    'public.fin_lancamentos',
    'public.fin_lancamento_rateios',
  ],
  dateField: 'COALESCE(data_pagamento, conciliado_em::date, data_competencia)',
  label: 'Despesas financeiras — regime de caixa do DFC',
} as const;

export type PresentationExpensesAvailability = 'available' | 'empty' | 'unavailable';

export type PresentationExpensesCoverage =
  | { state: 'available'; minDate: IsoDate; maxDate: IsoDate }
  | { state: 'no-history' };

export type PresentationExpensesPeriodCoverage =
  | { state: 'covered'; firstDate: IsoDate; lastDate: IsoDate }
  | { state: 'gap'; availableFrom: IsoDate; availableThrough: IsoDate }
  | { state: 'outside-range'; availableFrom: IsoDate; availableThrough: IsoDate }
  | { state: 'no-history' };

export interface PresentationExpensesPeriodSummary {
  state: PresentationExpensesAvailability;
  month: YearMonth;
  startDate: IsoDate;
  endExclusive: IsoDate;
  total: number;
  quantity: number;
  coverage: PresentationExpensesPeriodCoverage;
}

export type PresentationExpensesDeltaReason =
  | 'current-period-absent'
  | 'previous-period-absent'
  | 'zero-baseline';

export type PresentationExpensesDeltaValue =
  | { state: 'available'; value: number }
  | { state: 'unavailable'; reason: PresentationExpensesDeltaReason };

export interface PresentationExpensesDelta {
  absolute: PresentationExpensesDeltaValue;
  percentage: PresentationExpensesDeltaValue;
  meaning: 'increase' | 'reduction' | 'unchanged' | 'unavailable';
  favorability: 'favorable' | 'unfavorable' | 'neutral' | 'unavailable';
}

export interface PresentationExpensesMonthlyPoint {
  yearMonth: YearMonth;
  state: PresentationExpensesAvailability;
  total: number;
  quantity: number;
}

export interface PresentationExpensesHistoryPoint extends PresentationExpensesMonthlyPoint {
  year: number;
  month: number;
}

export type PresentationExpenseOperationalClass = 'operational' | 'non-operational';

export interface PresentationExpenseNode {
  categoryId: string | null;
  parentId: string | null;
  name: string;
  order: number;
  operationalClass: PresentationExpenseOperationalClass;
  directAmount: number;
  amount: number;
  children: readonly PresentationExpenseNode[];
}

export interface PresentationExpensesData {
  contractVersion: typeof PRESENTATION_EXPENSES_CONTRACT_VERSION;
  source: typeof PRESENTATION_EXPENSES_SOURCE;
  availability: PresentationExpensesAvailability;
  selectedMonth: YearMonth;
  previousMonth: YearMonth;
  requestedYears: readonly number[];
  generatedAt: string;
  coverage: PresentationExpensesCoverage;
  current: PresentationExpensesPeriodSummary;
  previous: PresentationExpensesPeriodSummary;
  delta: PresentationExpensesDelta;
  rollingThreeMonths: readonly PresentationExpensesMonthlyPoint[];
  history: readonly PresentationExpensesHistoryPoint[];
  tree: readonly PresentationExpenseNode[];
}

export type PresentationExpenseDetailCursor =
  | {
      state: 'available';
      effectiveDate: IsoDate;
      ledgerId: string;
      allocationSource: 'allocation' | 'entry';
      allocationId: string;
    }
  | { state: 'end' };

export interface PresentationExpenseDetailRow {
  allocationId: string;
  allocationSource: 'allocation' | 'entry';
  ledgerId: string;
  effectiveDate: IsoDate;
  description: string;
  status: string;
  origin: string;
  categoryId: string | null;
  categoryName: string;
  operationalClass: PresentationExpenseOperationalClass;
  amount: number;
}

export interface PresentationExpenseDetailsPage {
  contractVersion: typeof PRESENTATION_EXPENSES_CONTRACT_VERSION;
  source: Pick<typeof PRESENTATION_EXPENSES_SOURCE, 'report' | 'regime'>;
  month: YearMonth;
  categoryId: string | null;
  limit: number;
  hasMore: boolean;
  nextCursor: PresentationExpenseDetailCursor;
  items: readonly PresentationExpenseDetailRow[];
  generatedAt: string;
}

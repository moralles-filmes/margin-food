import type { IsoDate, NormalizedPresentationPeriod, YearMonth } from './contracts';

export const PRESENTATION_REVENUE_CONTRACT_VERSION = '1.0' as const;

export const PRESENTATION_REVENUE_SOURCE = {
  relation: 'public.financeiro_fechamento_caixa',
  valueField: 'faturamento_bruto',
  dateField: 'data',
  label: 'Faturamento bruto — Fechamento de Caixa',
} as const;

export type PresentationRevenueAvailability = 'available' | 'empty' | 'unavailable';
export type PresentationRevenueCoverage =
  | { state: 'available'; minDate: IsoDate; maxDate: IsoDate }
  | { state: 'no-history' };

export type PresentationRevenuePeriodCoverage =
  | { state: 'covered'; firstDate: IsoDate; lastDate: IsoDate }
  | { state: 'gap'; availableFrom: IsoDate; availableThrough: IsoDate }
  | { state: 'outside-range'; availableFrom: IsoDate; availableThrough: IsoDate }
  | { state: 'no-history' };

export interface PresentationRevenuePeriodSummary {
  state: PresentationRevenueAvailability;
  month: YearMonth;
  startDate: IsoDate;
  endExclusive: IsoDate;
  total: number;
  closingCount: number;
  coverage: PresentationRevenuePeriodCoverage;
}

export type PresentationRevenueDeltaReason =
  | 'current-period-absent'
  | 'previous-period-absent'
  | 'zero-baseline';

export type PresentationRevenueDeltaValue =
  | { state: 'available'; value: number }
  | { state: 'unavailable'; reason: PresentationRevenueDeltaReason };

export interface PresentationRevenueDelta {
  absolute: PresentationRevenueDeltaValue;
  percentage: PresentationRevenueDeltaValue;
}

export type PresentationRevenueAverage =
  | { state: 'available'; value: number }
  | { state: 'unavailable'; reason: 'no-occurrences' };

export interface PresentationRevenueWeekday {
  isoWeekday: 1 | 2 | 3 | 4 | 5 | 6 | 7;
  label: string;
  state: 'available' | 'empty';
  total: number;
  occurrences: number;
  average: PresentationRevenueAverage;
}

export interface PresentationRevenueHistoryPoint {
  year: number;
  month: number;
  yearMonth: YearMonth;
  state: PresentationRevenueAvailability;
  total: number;
  closingCount: number;
}

export interface PresentationRevenueData {
  contractVersion: typeof PRESENTATION_REVENUE_CONTRACT_VERSION;
  source: typeof PRESENTATION_REVENUE_SOURCE;
  availability: PresentationRevenueAvailability;
  selectedMonth: YearMonth;
  previousMonth: YearMonth;
  requestedYears: readonly number[];
  generatedAt: string;
  coverage: PresentationRevenueCoverage;
  current: PresentationRevenuePeriodSummary;
  previous: PresentationRevenuePeriodSummary;
  delta: PresentationRevenueDelta;
  weekdays: readonly PresentationRevenueWeekday[];
  history: readonly PresentationRevenueHistoryPoint[];
}

const YEAR_MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/;

export function isPresentationYearMonth(value: string): value is YearMonth {
  if (!YEAR_MONTH_PATTERN.test(value)) return false;
  const year = Number(value.slice(0, 4));
  return Number.isInteger(year) && year >= 1 && year <= 9999;
}

export function normalizePresentationHistoryYears(years: readonly number[]): number[] {
  if (years.length < 1 || years.length > 3) {
    throw new RangeError('Selecione de um a três anos para o histórico.');
  }
  if (years.some(year => !Number.isInteger(year) || year < 1 || year > 9999)) {
    throw new RangeError('Os anos do histórico devem ter quatro dígitos válidos.');
  }
  const normalized = [...new Set(years)].sort((left, right) => left - right);
  if (normalized.length !== years.length) {
    throw new RangeError('Os anos do histórico devem ser distintos.');
  }
  return normalized;
}

export function defaultPresentationHistoryYears(month: YearMonth): number[] {
  if (!isPresentationYearMonth(month)) throw new RangeError('Mês de referência inválido.');
  const selectedYear = Number(month.slice(0, 4));
  return Array.from(
    { length: Math.min(3, selectedYear) },
    (_, index) => selectedYear - Math.min(3, selectedYear) + index + 1,
  );
}

function previousYearMonth(month: YearMonth): YearMonth {
  const year = Number(month.slice(0, 4));
  const monthNumber = Number(month.slice(5, 7));
  if (monthNumber > 1) return `${String(year).padStart(4, '0')}-${String(monthNumber - 1).padStart(2, '0')}`;
  if (year <= 1) throw new RangeError('O período não possui mês anterior representável.');
  return `${String(year - 1).padStart(4, '0')}-12`;
}

/** Usa o último mês incluído no período, sem parsing UTC de `yyyy-MM`. */
export function presentationRevenueMonthFromPeriod(
  period: NormalizedPresentationPeriod,
): YearMonth {
  const endMonth = period.endExclusive.slice(0, 7);
  if (!isPresentationYearMonth(endMonth)) throw new RangeError('Fim do período inválido.');
  return period.endExclusive.endsWith('-01') ? previousYearMonth(endMonth) : endMonth;
}

import { formatDateBR as formatDisplayDateBR } from '@/lib/formatters';
import { parseLocalDate } from '@/lib/dateUtils';
import type {
  AvailablePeriodBounds,
  ComparisonAlignment,
  ComparisonPeriodAvailability,
  ComparisonPeriodDefinition,
  IsoDate,
  NormalizedDateRange,
  NormalizedPresentationPeriod,
  PresentationComparisons,
  PresentationPeriodFilter,
  YearMonth,
} from './contracts';

const ISO_DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const YEAR_MONTH_PATTERN = /^(\d{4})-(\d{2})$/;

interface DateParts {
  year: number;
  month: number;
  day: number;
}

export interface PeriodNormalizationOptions {
  availableBounds?: AvailablePeriodBounds;
}

function pad(value: number): string {
  return String(value).padStart(2, '0');
}

function isLeapYear(year: number): boolean {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function daysInMonth(year: number, month: number): number {
  if (month === 2) return isLeapYear(year) ? 29 : 28;
  return [4, 6, 9, 11].includes(month) ? 30 : 31;
}

function parseIsoDate(value: IsoDate): DateParts {
  const match = ISO_DATE_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid ISO date: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > daysInMonth(year, month)) {
    throw new RangeError(`Invalid ISO date: ${value}`);
  }
  return { year, month, day };
}

function parseYearMonth(value: YearMonth): { year: number; month: number } {
  const match = YEAR_MONTH_PATTERN.exec(value);
  if (!match) throw new RangeError(`Invalid year-month: ${value}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  if (month < 1 || month > 12) throw new RangeError(`Invalid year-month: ${value}`);
  return { year, month };
}

function formatIsoDate({ year, month, day }: DateParts): IsoDate {
  return `${String(year).padStart(4, '0')}-${pad(month)}-${pad(day)}`;
}

function toUtcDay(value: IsoDate): number {
  const { year, month, day } = parseIsoDate(value);
  return Math.floor(Date.UTC(year, month - 1, day) / 86_400_000);
}

function fromUtcDay(dayNumber: number): IsoDate {
  const date = new Date(dayNumber * 86_400_000);
  return formatIsoDate({
    year: date.getUTCFullYear(),
    month: date.getUTCMonth() + 1,
    day: date.getUTCDate(),
  });
}

export function addCalendarDays(value: IsoDate, days: number): IsoDate {
  if (!Number.isInteger(days)) throw new RangeError('Calendar day delta must be an integer');
  return fromUtcDay(toUtcDay(value) + days);
}

function addCalendarMonths(value: IsoDate, months: number): IsoDate {
  const parts = parseIsoDate(value);
  const totalMonths = parts.year * 12 + parts.month - 1 + months;
  const year = Math.floor(totalMonths / 12);
  const monthIndex = ((totalMonths % 12) + 12) % 12;
  const month = monthIndex + 1;
  return formatIsoDate({ year, month, day: Math.min(parts.day, daysInMonth(year, month)) });
}

function addCalendarYears(value: IsoDate, years: number): IsoDate {
  const parts = parseIsoDate(value);
  const year = parts.year + years;
  return formatIsoDate({
    year,
    month: parts.month,
    day: Math.min(parts.day, daysInMonth(year, parts.month)),
  });
}

function firstDayOfMonth(value: YearMonth): IsoDate {
  parseYearMonth(value);
  return `${value}-01`;
}

function nextMonth(value: YearMonth): YearMonth {
  const { year, month } = parseYearMonth(value);
  return month === 12 ? `${year + 1}-01` : `${year}-${pad(month + 1)}`;
}

function monthDistance(start: YearMonth, end: YearMonth): number {
  const a = parseYearMonth(start);
  const b = parseYearMonth(end);
  return (b.year - a.year) * 12 + b.month - a.month;
}

function validateRange(range: NormalizedDateRange): NormalizedDateRange {
  parseIsoDate(range.start);
  parseIsoDate(range.endExclusive);
  if (range.start >= range.endExclusive) throw new RangeError('Period start must precede its exclusive end');
  return range;
}

function validateBounds(bounds: AvailablePeriodBounds): AvailablePeriodBounds {
  parseIsoDate(bounds.minDate);
  parseIsoDate(bounds.maxDate);
  if (bounds.minDate > bounds.maxDate) throw new RangeError('Available period bounds are inverted');
  return bounds;
}

export function normalizePresentationPeriod(
  filter: PresentationPeriodFilter,
  options: PeriodNormalizationOptions = {},
): NormalizedPresentationPeriod {
  if (filter.kind === 'month') {
    return {
      filterKind: filter.kind,
      start: firstDayOfMonth(filter.month),
      endExclusive: firstDayOfMonth(nextMonth(filter.month)),
      isCompleteCalendarPeriod: true,
    };
  }

  if (filter.kind === 'month-range') {
    if (monthDistance(filter.startMonth, filter.endMonth) < 0) {
      throw new RangeError('Month range start must not be after its end');
    }
    return {
      filterKind: filter.kind,
      start: firstDayOfMonth(filter.startMonth),
      endExclusive: firstDayOfMonth(nextMonth(filter.endMonth)),
      isCompleteCalendarPeriod: true,
    };
  }

  if (filter.kind === 'year') {
    if (!Number.isInteger(filter.year) || filter.year < 1) throw new RangeError('Invalid year');
    return {
      filterKind: filter.kind,
      start: `${filter.year}-01-01`,
      endExclusive: `${filter.year + 1}-01-01`,
      isCompleteCalendarPeriod: true,
    };
  }

  if (filter.kind === 'year-to-date') {
    const through = parseIsoDate(filter.through);
    if (!Number.isInteger(filter.year) || filter.year < 1 || through.year !== filter.year) {
      throw new RangeError('Year-to-date cutoff must belong to the selected year');
    }
    return {
      filterKind: filter.kind,
      start: `${filter.year}-01-01`,
      endExclusive: addCalendarDays(filter.through, 1),
      isCompleteCalendarPeriod: filter.through === `${filter.year}-12-31`,
    };
  }

  if (filter.kind === 'all-time') {
    if (!options.availableBounds) throw new RangeError('All-time requires available period bounds');
    const bounds = validateBounds(options.availableBounds);
    return {
      filterKind: filter.kind,
      start: bounds.minDate,
      endExclusive: addCalendarDays(bounds.maxDate, 1),
      isCompleteCalendarPeriod: false,
    };
  }

  const range = validateRange({
    start: filter.start,
    endExclusive: addCalendarDays(filter.endInclusive, 1),
  });
  return {
    filterKind: filter.kind,
    ...range,
    isCompleteCalendarPeriod: false,
  };
}

function shiftRangeByMonths(range: NormalizedDateRange, months: number): NormalizedDateRange {
  return {
    start: addCalendarMonths(range.start, months),
    endExclusive: addCalendarMonths(range.endExclusive, months),
  };
}

function shiftRangeByYears(range: NormalizedDateRange, years: number): NormalizedDateRange {
  return {
    start: addCalendarYears(range.start, years),
    endExclusive: addCalendarYears(range.endExclusive, years),
  };
}

function previousEquivalentDayRange(range: NormalizedDateRange): NormalizedDateRange {
  const duration = toUtcDay(range.endExclusive) - toUtcDay(range.start);
  return {
    start: addCalendarDays(range.start, -duration),
    endExclusive: range.start,
  };
}

function comparisonAvailability(
  range: NormalizedDateRange,
  bounds?: AvailablePeriodBounds,
): ComparisonPeriodAvailability {
  if (!bounds) return { state: 'available' };
  const validBounds = validateBounds(bounds);
  const availableEndExclusive = addCalendarDays(validBounds.maxDate, 1);
  return range.start >= validBounds.minDate && range.endExclusive <= availableEndExclusive
    ? { state: 'available' }
    : { state: 'unavailable', reason: 'outside-available-period' };
}

function createComparison(
  kind: ComparisonPeriodDefinition['kind'],
  range: NormalizedDateRange,
  alignment: ComparisonAlignment,
  bounds?: AvailablePeriodBounds,
): ComparisonPeriodDefinition {
  return {
    kind,
    range: validateRange(range),
    alignment,
    availability: comparisonAvailability(range, bounds),
  };
}

export function buildPresentationComparisons(
  filter: PresentationPeriodFilter,
  current: NormalizedPresentationPeriod,
  availableBounds?: AvailablePeriodBounds,
): PresentationComparisons {
  let previousRange: NormalizedDateRange;
  let previousAlignment: ComparisonAlignment;

  if (filter.kind === 'month') {
    previousRange = shiftRangeByMonths(current, -1);
    previousAlignment = 'calendar-month';
  } else if (filter.kind === 'month-range') {
    const monthCount = monthDistance(filter.startMonth, filter.endMonth) + 1;
    previousRange = shiftRangeByMonths(current, -monthCount);
    previousAlignment = 'equivalent-month-range';
  } else if (filter.kind === 'year' || filter.kind === 'year-to-date') {
    previousRange = shiftRangeByYears(current, -1);
    previousAlignment = 'aligned-calendar-year';
  } else {
    previousRange = previousEquivalentDayRange(current);
    previousAlignment = 'equivalent-day-duration';
  }

  return {
    previousPeriod: createComparison(
      'previous-period',
      previousRange,
      previousAlignment,
      availableBounds,
    ),
    previousYear: createComparison(
      'previous-year',
      shiftRangeByYears(current, -1),
      'aligned-calendar-year',
      availableBounds,
    ),
  };
}

function capitalize(value: string): string {
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function monthName(month: number): string {
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long' })
    .format(new Date(2020, month - 1, 1, 12));
  return label;
}

export function formatMonthPeriodPtBR(value: YearMonth): string {
  const { year, month } = parseYearMonth(value);
  return capitalize(`${monthName(month)} de ${year}`);
}

function displayDate(value: IsoDate): string {
  parseIsoDate(value);
  return formatDisplayDateBR(parseLocalDate(value));
}

export function formatPresentationPeriodLabelPtBR(
  filter: PresentationPeriodFilter,
  period: NormalizedPresentationPeriod,
): string {
  if (filter.kind === 'month') return formatMonthPeriodPtBR(filter.month);

  if (filter.kind === 'month-range') {
    const start = parseYearMonth(filter.startMonth);
    const end = parseYearMonth(filter.endMonth);
    if (start.year === end.year) {
      return capitalize(`${monthName(start.month)} a ${monthName(end.month)} de ${start.year}`);
    }
    return `${formatMonthPeriodPtBR(filter.startMonth)} a ${formatMonthPeriodPtBR(filter.endMonth).toLocaleLowerCase('pt-BR')}`;
  }

  if (filter.kind === 'year') return `Ano de ${filter.year}`;
  if (filter.kind === 'year-to-date') return `Acumulado do ano até ${displayDate(filter.through)}`;

  const endInclusive = addCalendarDays(period.endExclusive, -1);
  const rangeLabel = `${displayDate(period.start)} a ${displayDate(endInclusive)}`;
  return filter.kind === 'all-time' ? `Todo o período — ${rangeLabel}` : rangeLabel;
}

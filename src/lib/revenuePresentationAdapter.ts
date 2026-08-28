import {
  PRESENTATION_REVENUE_CONTRACT_VERSION,
  PRESENTATION_REVENUE_SOURCE,
  isPresentationYearMonth,
  normalizePresentationHistoryYears,
  type IsoDate,
  type PresentationRevenueAvailability,
  type PresentationRevenueCoverage,
  type PresentationRevenueData,
  type PresentationRevenueDeltaReason,
  type PresentationRevenueDeltaValue,
  type PresentationRevenueHistoryPoint,
  type PresentationRevenuePeriodCoverage,
  type PresentationRevenuePeriodSummary,
  type PresentationRevenueWeekday,
  type YearMonth,
} from '@/domain/financeiro/presentation';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const WEEKDAY_LABELS = [
  'Segunda-feira',
  'Terça-feira',
  'Quarta-feira',
  'Quinta-feira',
  'Sexta-feira',
  'Sábado',
  'Domingo',
] as const;

export class PresentationRevenuePayloadError extends Error {
  readonly path: string;

  constructor(path: string, expectation: string) {
    super(`Payload inválido de Faturamento: ${path} deve ser ${expectation}`);
    this.name = 'PresentationRevenuePayloadError';
    this.path = path;
  }
}

function fail(path: string, expectation: string): never {
  throw new PresentationRevenuePayloadError(path, expectation);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'um objeto');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'uma lista');
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) return fail(path, 'um texto não vazio');
  return value;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'um número finito');
  return value;
}

function readInteger(value: unknown, path: string, minimum = 0): number {
  const parsed = readFiniteNumber(value, path);
  if (!Number.isInteger(parsed) || parsed < minimum) return fail(path, `um inteiro maior ou igual a ${minimum}`);
  return parsed;
}

function readIsoDate(value: unknown, path: string): IsoDate {
  const date = readString(value, path);
  if (!ISO_DATE_PATTERN.test(date)) return fail(path, 'uma data ISO yyyy-MM-dd');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return fail(path, 'uma data ISO válida');
  return date;
}

function readTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) return fail(path, 'um timestamp ISO válido');
  return timestamp;
}

function readYearMonth(value: unknown, path: string): YearMonth {
  const month = readString(value, path);
  if (!isPresentationYearMonth(month)) return fail(path, 'um mês yyyy-MM válido');
  return month;
}

function readAvailability(value: unknown, path: string): PresentationRevenueAvailability {
  if (value !== 'available' && value !== 'empty' && value !== 'unavailable') {
    return fail(path, 'available, empty ou unavailable');
  }
  return value;
}

function readCoverage(value: unknown, path: string): PresentationRevenueCoverage {
  const record = readRecord(value, path);
  if (record.state === 'no-history') return { state: 'no-history' };
  if (record.state !== 'available') return fail(`${path}.state`, 'available ou no-history');
  const minDate = readIsoDate(record.minDate, `${path}.minDate`);
  const maxDate = readIsoDate(record.maxDate, `${path}.maxDate`);
  if (minDate > maxDate) return fail(path, 'uma cobertura ordenada');
  return { state: 'available', minDate, maxDate };
}

function readPeriodCoverage(value: unknown, path: string): PresentationRevenuePeriodCoverage {
  const record = readRecord(value, path);
  if (record.state === 'no-history') return { state: 'no-history' };
  if (record.state === 'covered') {
    const firstDate = readIsoDate(record.firstDate, `${path}.firstDate`);
    const lastDate = readIsoDate(record.lastDate, `${path}.lastDate`);
    if (firstDate > lastDate) return fail(path, 'datas de fechamento ordenadas');
    return { state: 'covered', firstDate, lastDate };
  }
  if (record.state === 'gap' || record.state === 'outside-range') {
    const availableFrom = readIsoDate(record.availableFrom, `${path}.availableFrom`);
    const availableThrough = readIsoDate(record.availableThrough, `${path}.availableThrough`);
    if (availableFrom > availableThrough) return fail(path, 'uma cobertura ordenada');
    return { state: record.state, availableFrom, availableThrough };
  }
  return fail(`${path}.state`, 'covered, gap, outside-range ou no-history');
}

function readPeriod(value: unknown, path: string): PresentationRevenuePeriodSummary {
  const record = readRecord(value, path);
  const state = readAvailability(record.state, `${path}.state`);
  const month = readYearMonth(record.month, `${path}.month`);
  const startDate = readIsoDate(record.startDate, `${path}.startDate`);
  const endExclusive = readIsoDate(record.endExclusive, `${path}.endExclusive`);
  const total = readFiniteNumber(record.total, `${path}.total`);
  const closingCount = readInteger(record.closingCount, `${path}.closingCount`);
  const coverage = readPeriodCoverage(record.coverage, `${path}.coverage`);
  if (startDate !== `${month}-01` || startDate >= endExclusive) return fail(path, 'um mês calendário coerente');
  if ((state === 'available') !== (closingCount > 0)) return fail(path, 'estado coerente com closingCount');
  if (state === 'available' && coverage.state !== 'covered') return fail(`${path}.coverage`, 'covered quando há fechamentos');
  if (state === 'empty' && coverage.state !== 'gap') return fail(`${path}.coverage`, 'gap quando o mês está vazio');
  if (state === 'unavailable' && coverage.state !== 'outside-range' && coverage.state !== 'no-history') {
    return fail(`${path}.coverage`, 'outside-range ou no-history quando indisponível');
  }
  return { state, month, startDate, endExclusive, total, closingCount, coverage };
}

function readDelta(value: unknown, path: string): PresentationRevenueDeltaValue {
  const record = readRecord(value, path);
  if (record.state === 'available') {
    return { state: 'available', value: readFiniteNumber(record.value, `${path}.value`) };
  }
  if (record.state !== 'unavailable') return fail(`${path}.state`, 'available ou unavailable');
  const reason = readString(record.reason, `${path}.reason`) as PresentationRevenueDeltaReason;
  if (
    reason !== 'current-period-absent'
    && reason !== 'previous-period-absent'
    && reason !== 'zero-baseline'
  ) return fail(`${path}.reason`, 'um motivo de delta conhecido');
  return { state: 'unavailable', reason };
}

function readWeekday(value: unknown, path: string, expectedIndex: number): PresentationRevenueWeekday {
  const record = readRecord(value, path);
  const isoWeekday = readInteger(record.isoWeekday, `${path}.isoWeekday`, 1);
  if (isoWeekday !== expectedIndex || isoWeekday > 7) return fail(`${path}.isoWeekday`, `o índice ISO ${expectedIndex}`);
  const label = readString(record.label, `${path}.label`);
  if (label !== WEEKDAY_LABELS[expectedIndex - 1]) return fail(`${path}.label`, WEEKDAY_LABELS[expectedIndex - 1]);
  const state = record.state === 'available' || record.state === 'empty'
    ? record.state
    : fail(`${path}.state`, 'available ou empty');
  const total = readFiniteNumber(record.total, `${path}.total`);
  const occurrences = readInteger(record.occurrences, `${path}.occurrences`);
  const averageRecord = readRecord(record.average, `${path}.average`);
  const average = averageRecord.state === 'available'
    ? { state: 'available' as const, value: readFiniteNumber(averageRecord.value, `${path}.average.value`) }
    : averageRecord.state === 'unavailable' && averageRecord.reason === 'no-occurrences'
      ? { state: 'unavailable' as const, reason: 'no-occurrences' as const }
      : fail(`${path}.average`, 'uma média disponível ou no-occurrences');
  if ((state === 'available') !== (occurrences > 0)) return fail(path, 'estado coerente com occurrences');
  if ((occurrences > 0) !== (average.state === 'available')) return fail(`${path}.average`, 'estado coerente com occurrences');
  if (average.state === 'available' && Math.abs(average.value - total / occurrences) > 0.011) {
    return fail(`${path}.average.value`, 'total dividido pelas ocorrências');
  }
  return { isoWeekday: isoWeekday as PresentationRevenueWeekday['isoWeekday'], label, state, total, occurrences, average };
}

function readHistoryPoint(value: unknown, path: string): PresentationRevenueHistoryPoint {
  const record = readRecord(value, path);
  const year = readInteger(record.year, `${path}.year`, 1);
  const month = readInteger(record.month, `${path}.month`, 1);
  if (year > 9999 || month > 12) return fail(path, 'ano e mês válidos');
  const yearMonth = readYearMonth(record.yearMonth, `${path}.yearMonth`);
  if (yearMonth !== `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`) {
    return fail(`${path}.yearMonth`, 'coerente com year e month');
  }
  const state = readAvailability(record.state, `${path}.state`);
  const total = readFiniteNumber(record.total, `${path}.total`);
  const closingCount = readInteger(record.closingCount, `${path}.closingCount`);
  if ((state === 'available') !== (closingCount > 0)) return fail(path, 'estado coerente com closingCount');
  return { year, month, yearMonth, state, total, closingCount };
}

export function adaptPresentationRevenuePayload(payload: unknown): PresentationRevenueData {
  const record = readRecord(payload, 'payload');
  if (record.contractVersion !== PRESENTATION_REVENUE_CONTRACT_VERSION) {
    return fail('payload.contractVersion', PRESENTATION_REVENUE_CONTRACT_VERSION);
  }
  const source = readRecord(record.source, 'payload.source');
  for (const [key, expected] of Object.entries(PRESENTATION_REVENUE_SOURCE)) {
    if (source[key] !== expected) return fail(`payload.source.${key}`, expected);
  }
  const availability = readAvailability(record.availability, 'payload.availability');
  const selectedMonth = readYearMonth(record.selectedMonth, 'payload.selectedMonth');
  const previousMonth = readYearMonth(record.previousMonth, 'payload.previousMonth');
  const requestedYears = normalizePresentationHistoryYears(
    readArray(record.requestedYears, 'payload.requestedYears')
      .map((year, index) => readInteger(year, `payload.requestedYears[${index}]`, 1)),
  );
  const current = readPeriod(record.current, 'payload.current');
  const previous = readPeriod(record.previous, 'payload.previous');
  if (current.month !== selectedMonth || previous.month !== previousMonth) {
    return fail('payload', 'períodos coerentes com selectedMonth e previousMonth');
  }
  const weekdays = readArray(record.weekdays, 'payload.weekdays');
  if (weekdays.length !== 7) return fail('payload.weekdays', 'sete dias de segunda a domingo');
  const parsedWeekdays = weekdays.map((weekday, index) => readWeekday(weekday, `payload.weekdays[${index}]`, index + 1));
  const history = readArray(record.history, 'payload.history')
    .map((point, index) => readHistoryPoint(point, `payload.history[${index}]`));
  if (history.length !== requestedYears.length * 12) return fail('payload.history', 'doze meses por ano solicitado');
  history.forEach((point, index) => {
    const expectedYear = requestedYears[Math.floor(index / 12)];
    const expectedMonth = index % 12 + 1;
    if (point.year !== expectedYear || point.month !== expectedMonth) {
      fail(`payload.history[${index}]`, 'ordenado por ano e mês');
    }
  });
  return {
    contractVersion: PRESENTATION_REVENUE_CONTRACT_VERSION,
    source: PRESENTATION_REVENUE_SOURCE,
    availability,
    selectedMonth,
    previousMonth,
    requestedYears,
    generatedAt: readTimestamp(record.generatedAt, 'payload.generatedAt'),
    coverage: readCoverage(record.coverage, 'payload.coverage'),
    current,
    previous,
    delta: {
      absolute: readDelta(readRecord(record.delta, 'payload.delta').absolute, 'payload.delta.absolute'),
      percentage: readDelta(readRecord(record.delta, 'payload.delta').percentage, 'payload.delta.percentage'),
    },
    weekdays: parsedWeekdays,
    history,
  };
}

export function createSafeRevenuePayloadDiagnostic(payload: unknown, error: PresentationRevenuePayloadError) {
  const record = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  return {
    error: { name: error.name, path: error.path },
    payload: {
      type: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
      contractVersionType: typeof record?.contractVersion,
      weekdayCount: Array.isArray(record?.weekdays) ? record.weekdays.length : undefined,
      historyCount: Array.isArray(record?.history) ? record.history.length : undefined,
    },
  };
}

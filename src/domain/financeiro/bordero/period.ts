/**
 * Períodos do Borderô (semana, mês, período personalizado).
 *
 * Toda a aritmética opera sobre strings `yyyy-MM-dd` via Date.UTC — o resultado
 * não depende do fuso do navegador (evita "05/09 vira 04/09"). "Hoje" vem de
 * `todayBR()` no consumidor. As duas pontas do período são inclusivas, igual ao
 * filtro por data_vencimento em `get_fin_bordero`.
 */
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { monthBounds, shiftMonth } from '@/components/financeiro/MonthNavigator';
import { formatDateValueBR } from '@/lib/datetime';

export type BorderoPeriodMode = 'week' | 'month' | 'custom';

export interface BorderoPeriod {
  /** Primeiro dia, inclusivo (`yyyy-MM-dd`). */
  start: string;
  /** Último dia, inclusivo (`yyyy-MM-dd`). */
  end: string;
}

export interface BorderoFilterState {
  mode: BorderoPeriodMode;
  /** Qualquer dia da semana selecionada. */
  weekAnchor: string;
  /** `yyyy-MM`. */
  month: string;
  customStart: string;
  customEnd: string;
}

export type BorderoPeriodResolution =
  | { ok: true; period: BorderoPeriod }
  | { ok: false; message: string };

/** Espelha o limite de `get_fin_bordero` (p_fim - p_inicio > 366 é recusado). */
export const MAX_BORDERO_PERIOD_SPAN_DAYS = 366;

const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_MS = 86_400_000;

function toUtcMs(iso: string): number | null {
  const match = ISO_DATE_RE.exec(iso);
  if (!match) return null;
  const [, y, m, d] = match.map(Number);
  const ms = Date.UTC(y, m - 1, d);
  const date = new Date(ms);
  if (date.getUTCFullYear() !== y || date.getUTCMonth() !== m - 1 || date.getUTCDate() !== d) return null;
  return ms;
}

function fromUtcMs(ms: number): string {
  const date = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

export function isValidIsoDate(value: string): boolean {
  return toUtcMs(value) !== null;
}

export function addDaysISO(iso: string, days: number): string {
  const ms = toUtcMs(iso);
  if (ms === null) throw new RangeError(`Data inválida: ${iso}`);
  return fromUtcMs(ms + days * DAY_MS);
}

export function daysBetweenISO(start: string, end: string): number {
  const a = toUtcMs(start);
  const b = toUtcMs(end);
  if (a === null || b === null) throw new RangeError(`Datas inválidas: ${start} / ${end}`);
  return Math.round((b - a) / DAY_MS);
}

/** Semana de SEGUNDA a DOMINGO que contém `iso`. */
export function weekBounds(iso: string): BorderoPeriod {
  const ms = toUtcMs(iso);
  if (ms === null) throw new RangeError(`Data inválida: ${iso}`);
  const mondayOffset = (new Date(ms).getUTCDay() + 6) % 7;
  const start = fromUtcMs(ms - mondayOffset * DAY_MS);
  return { start, end: addDaysISO(start, 6) };
}

export function shiftWeek(iso: string, weeks: number): string {
  return addDaysISO(weekBounds(iso).start, weeks * 7);
}

export function monthOfISO(iso: string): string {
  return iso.slice(0, 7);
}

/** Converte a data escolhida no calendário (meia-noite local) sem passar por fuso. */
export function localDateToISO(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export function createInitialBorderoFilter(todayISO: string): BorderoFilterState {
  const week = weekBounds(todayISO);
  return {
    mode: 'week',
    weekAnchor: todayISO,
    month: monthOfISO(todayISO),
    customStart: week.start,
    customEnd: week.end,
  };
}

export function resolveBorderoPeriod(filter: BorderoFilterState): BorderoPeriodResolution {
  if (filter.mode === 'week') {
    if (!isValidIsoDate(filter.weekAnchor)) return { ok: false, message: 'Selecione uma semana válida.' };
    return { ok: true, period: weekBounds(filter.weekAnchor) };
  }
  if (filter.mode === 'month') {
    if (!/^\d{4}-\d{2}$/.test(filter.month) || !isValidIsoDate(`${filter.month}-01`)) {
      return { ok: false, message: 'Selecione um mês válido.' };
    }
    return { ok: true, period: monthBounds(filter.month) };
  }
  if (!filter.customStart || !filter.customEnd) {
    return { ok: false, message: 'Informe a data inicial e a data final.' };
  }
  if (!isValidIsoDate(filter.customStart) || !isValidIsoDate(filter.customEnd)) {
    return { ok: false, message: 'Informe datas válidas.' };
  }
  const span = daysBetweenISO(filter.customStart, filter.customEnd);
  if (span < 0) return { ok: false, message: 'A data final deve ser igual ou posterior à data inicial.' };
  if (span > MAX_BORDERO_PERIOD_SPAN_DAYS) {
    return { ok: false, message: 'O período personalizado pode ter no máximo 1 ano.' };
  }
  return { ok: true, period: { start: filter.customStart, end: filter.customEnd } };
}

/** Mensagem de validação (o projeto roda sem strictNullChecks, que não estreita o union por `ok`). */
export function borderoPeriodError(resolution: BorderoPeriodResolution): string | null {
  return 'message' in resolution ? resolution.message : null;
}

export function shiftBorderoFilter(filter: BorderoFilterState, delta: number): BorderoFilterState {
  if (filter.mode === 'week') return { ...filter, weekAnchor: shiftWeek(filter.weekAnchor, delta) };
  if (filter.mode === 'month') return { ...filter, month: shiftMonth(filter.month, delta) };
  return filter;
}

/** "31/08/2026 a 06/09/2026". */
export function formatBorderoPeriod(period: BorderoPeriod): string {
  return `${formatDateValueBR(period.start)} a ${formatDateValueBR(period.end)}`;
}

/** "Setembro/2026". */
export function formatBorderoMonth(month: string): string {
  const [y, m] = month.split('-').map(Number);
  const name = format(new Date(y, m - 1, 1), 'MMMM', { locale: ptBR });
  return `${name.charAt(0).toUpperCase()}${name.slice(1)}/${y}`;
}

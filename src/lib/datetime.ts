/**
 * Central timezone-aware date utilities for America/Sao_Paulo.
 *
 * Rules:
 * - Database stays in UTC (timestamptz).
 * - All business dates (yyyy-MM-dd) are computed in BR timezone.
 * - UI always displays dd/MM/yyyy in BR timezone.
 * - NEVER use `new Date().toISOString().split('T')[0]` for business dates.
 */

import { formatInTimeZone } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

const TZ_BR = 'America/Sao_Paulo';
const ISO_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

function parseDateValue(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const isoDate = ISO_DATE_RE.exec(value);
  if (isoDate) {
    const [, year, month, day] = isoDate;
    const parsed = new Date(Number(year), Number(month) - 1, Number(day));
    const isSameDate = parsed.getFullYear() === Number(year)
      && parsed.getMonth() === Number(month) - 1
      && parsed.getDate() === Number(day);
    return isSameDate ? parsed : null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

/**
 * Format a Date to yyyy-MM-dd in America/Sao_Paulo timezone.
 * Use this whenever you need a business date string for the DB or filters.
 */
export function formatDateISO(date: Date = new Date()): string {
  return formatInTimeZone(date, TZ_BR, 'yyyy-MM-dd');
}

/** @deprecated Use formatDateISO. This alias remains for external compatibility. */
export const formatDateBR = formatDateISO;

/**
 * Format a Date to dd/MM/yyyy in America/Sao_Paulo timezone.
 * Use for user-facing display.
 */
export function formatDisplayBR(date: Date = new Date()): string {
  return formatInTimeZone(date, TZ_BR, 'dd/MM/yyyy');
}

/**
 * Format a date-only ISO string, timestamp or Date for user-facing display.
 * Date-only strings are parsed as local calendar dates to avoid the UTC shift.
 */
export function formatDateValueBR(
  value: Date | string | null | undefined,
  fallback = '—',
): string {
  if (!value) return fallback;
  if (typeof value === 'string') {
    const isoDate = ISO_DATE_RE.exec(value);
    if (isoDate) {
      const [, year, month, day] = isoDate;
      const parsed = parseDateValue(value);
      return parsed ? `${day}/${month}/${year}` : fallback;
    }
  }
  const parsed = parseDateValue(value);
  return parsed ? formatDisplayBR(parsed) : fallback;
}

/**
 * Returns "today" as yyyy-MM-dd in BR timezone.
 * Drop-in replacement for `new Date().toISOString().split('T')[0]`.
 */
export function todayBR(): string {
  return formatDateISO(new Date());
}

/**
 * Convert a UTC timestamptz string (from Postgres) to
 * a human-readable BR date/time string: "dd/MM/yyyy HH:mm".
 */
export function parseUTCToBR(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return formatInTimeZone(d, TZ_BR, 'dd/MM/yyyy HH:mm');
}

/**
 * Format a Date to dd/MM/yyyy HH:mm in BR timezone (full datetime display).
 */
export function formatDateTimeBR(date: Date): string {
  return formatInTimeZone(date, TZ_BR, 'dd/MM/yyyy HH:mm');
}

/**
 * Format a Date for a specific pattern in BR timezone.
 */
export function formatInBR(date: Date, pattern: string): string {
  return formatInTimeZone(date, TZ_BR, pattern, { locale: ptBR });
}

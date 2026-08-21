/**
 * Central timezone-aware date utilities for America/Sao_Paulo.
 *
 * Rules:
 * - Database stays in UTC (timestamptz).
 * - All business dates (yyyy-MM-dd) are computed in BR timezone.
 * - UI always displays dd/MM/yyyy in BR timezone.
 * - NEVER use `new Date().toISOString().split('T')[0]` for business dates.
 */

import { format as formatTZ } from 'date-fns-tz';
import { ptBR } from 'date-fns/locale';

const TZ_BR = 'America/Sao_Paulo';

/**
 * Format a Date to yyyy-MM-dd in America/Sao_Paulo timezone.
 * Use this whenever you need a business date string for the DB or filters.
 */
export function formatDateBR(date: Date = new Date()): string {
  return formatTZ(date, 'yyyy-MM-dd', { timeZone: TZ_BR });
}

/**
 * Format a Date to dd/MM/yyyy in America/Sao_Paulo timezone.
 * Use for user-facing display.
 */
export function formatDisplayBR(date: Date = new Date()): string {
  return formatTZ(date, 'dd/MM/yyyy', { timeZone: TZ_BR });
}

/**
 * Returns "today" as yyyy-MM-dd in BR timezone.
 * Drop-in replacement for `new Date().toISOString().split('T')[0]`.
 */
export function todayBR(): string {
  return formatDateBR(new Date());
}

/**
 * Convert a UTC timestamptz string (from Postgres) to
 * a human-readable BR date/time string: "dd/MM/yyyy HH:mm".
 */
export function parseUTCToBR(ts: string): string {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return ts;
  return formatTZ(d, 'dd/MM/yyyy HH:mm', { timeZone: TZ_BR });
}

/**
 * Format a Date to dd/MM/yyyy HH:mm in BR timezone (full datetime display).
 */
export function formatDateTimeBR(date: Date): string {
  return formatTZ(date, 'dd/MM/yyyy HH:mm', { timeZone: TZ_BR });
}

/**
 * Format a Date for a specific pattern in BR timezone.
 */
export function formatInBR(date: Date, pattern: string): string {
  return formatTZ(date, pattern, { timeZone: TZ_BR, locale: ptBR });
}

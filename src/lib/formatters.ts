/**
 * Central formatting utilities for the entire system.
 * 
 * All display formatting MUST go through these helpers.
 * Business logic and calculations remain untouched.
 * 
 * Patterns:
 *   Money:    R$5.000,00      → formatMoneyBR / fmtBRL
 *   Decimal:  5,25            → formatDecimalBR
 *   Percent:  12,50%          → formatPercentBR (always 2 decimals)
 *   Integer:  2.300           → formatIntegerBR
 *   Date:     13/03/2026      → formatDateBR (re-export from datetime)
 *   DateTime: 13/03/2026 14:35→ formatDateTimeBR (re-export from datetime)
 */

// ─── Re-export money helpers ───
export {
  fmtBRL,
  fmtBRLRaw,
  fmtBRLCompact,
  formatNumberToBRL,
  formatNumberToBRLWithSymbol,
  normalizeBRLMoneyToNumber,
} from './money';

// ─── Re-export date helpers ───
export {
  formatDisplayBR as formatDateBR,
  formatDateTimeBR,
  parseUTCToBR,
  todayBR,
  formatInBR,
} from './datetime';

export { parseLocalDate } from './dateUtils';

// ─── Aliases matching the prompt naming ───
import { formatNumberToBRLWithSymbol, formatNumberToBRL } from './money';

/**
 * Format a number as BRL currency.
 * formatMoneyBR(5000)        → "R$5.000,00"
 * formatMoneyBR(5000, false) → "5.000,00"
 */
export function formatMoneyBR(value: number | null | undefined, withSymbol = true): string {
  if (value == null || isNaN(value as number)) return withSymbol ? 'R$0,00' : '0,00';
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return withSymbol ? `R$${formatted}` : formatted;
}

/**
 * Format a number as a technical decimal (no currency symbol).
 * formatDecimalBR(5.2)     → "5,2"
 * formatDecimalBR(5.25)    → "5,25"
 * formatDecimalBR(12)      → "12"
 * formatDecimalBR(0.9, 1)  → "0,9"
 */
export function formatDecimalBR(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(value as number)) return '0';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a number as percentage with the % suffix.
 * Always uses 2 decimal places for consistency.
 * formatPercentBR(12.5)   → "12,50%"
 * formatPercentBR(35)     → "35,00%"
 * formatPercentBR(7.255)  → "7,26%"
 */
export function formatPercentBR(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(value as number)) return '0,00%';
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted}%`;
}

/**
 * Format a number as integer with thousand separators.
 * formatIntegerBR(2300)  → "2.300"
 * formatIntegerBR(12)    → "12"
 * formatIntegerBR(150.7) → "151"  (rounds)
 */
export function formatIntegerBR(value: number | null | undefined): string {
  if (value == null || isNaN(value as number)) return '0';
  return Math.round(value).toLocaleString('pt-BR');
}

/**
 * Format a number with exactly N decimal places (pt-BR).
 * formatFixedBR(5.2, 2) → "5,20"
 * Useful for table columns that need alignment.
 */
export function formatFixedBR(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(value as number)) return '0,00';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format a number with exactly N decimal places and a unit suffix.
 * formatQuantityBR(1500.5, 'kg') → "1.500,50 kg"
 * formatQuantityBR(1500, 'un', 0) → "1.500 un"
 */
export function formatQuantityBR(value: number | null | undefined, unit: string, decimals = 2): string {
  if (value == null || isNaN(value as number)) return `0 ${unit}`;
  const formatted = value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return `${formatted} ${unit}`;
}

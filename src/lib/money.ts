/**
 * Central money normalization utilities for pt-BR locale.
 *
 * Handles inputs like:
 *   "1,90"       → 1.90
 *   "1.90"       → 1.90
 *   "1.900,50"   → 1900.50
 *   "1900,50"    → 1900.50
 *   "R$ 1.900,50"→ 1900.50
 *   "R$1.900,50" → 1900.50
 */

/**
 * Normalises a pt-BR formatted money string to a JS number.
 * Returns null if the input is empty or unparseable.
 */
export function normalizeBRLMoneyToNumber(value: string | null | undefined): number | null {
  if (value == null) return null;

  let str = String(value).trim();
  if (str === '') return null;

  // Remove currency symbol, spaces, non-breaking spaces
  str = str.replace(/[R$\s\u00A0]/g, '');

  if (str === '' || str === '-') return null;

  // Detect separator roles:
  // If the string has both . and , we look at which comes last
  const lastComma = str.lastIndexOf(',');
  const lastDot = str.lastIndexOf('.');

  let numericString: string;

  if (lastComma > lastDot) {
    // Comma is the decimal separator (pt-BR style: 1.234,56)
    numericString = str.replace(/\./g, '').replace(',', '.');
  } else if (lastDot > lastComma) {
    const dotCount = (str.match(/\./g) || []).length;
    const digitsAfterDot = str.length - lastDot - 1;
    if (lastComma < 0 && digitsAfterDot === 3) {
      // Brazilian thousands without decimal cents: 1.234 → 1234
      numericString = str.replace(/\./g, '');
    } else if (dotCount > 1 && lastComma < 0) {
      // Brazilian grouped integer: 1.234.567 → 1234567
      numericString = str.replace(/\./g, '');
    } else {
      // Dot is the decimal separator (US style: 1,234.56 or typed 84.02)
      numericString = str.replace(/,/g, '');
    }
  } else {
    // Only one type of separator or none
    if (lastComma >= 0) {
      // Only commas — treat as decimal separator
      numericString = str.replace(',', '.');
    } else {
      // Only dots or no separators
      numericString = str;
    }
  }

  const parsed = parseFloat(numericString);
  return isNaN(parsed) ? null : parsed;
}

/**
 * Formats a number as pt-BR currency string (without R$ prefix).
 * Example: 1900.5 → "1.900,50"
 */
export function formatNumberToBRL(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(value)) return '0,00';
  return value.toLocaleString('pt-BR', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Formats a number as pt-BR currency string with R$ prefix (NO space).
 * Example: 1900.5 → "R$1.900,50"
 */
export function formatNumberToBRLWithSymbol(value: number | null | undefined, decimals = 2): string {
  if (value == null || isNaN(value)) return 'R$0,00';
  return `R$${formatNumberToBRL(value, decimals)}`;
}

/**
 * Short alias — primary display helper for monetary values.
 * fmtBRL(1900.5) → "R$1.900,50"
 */
export const fmtBRL = formatNumberToBRLWithSymbol;

/**
 * Short alias — monetary display without symbol.
 * fmtBRLRaw(1900.5) → "1.900,50"
 */
export const fmtBRLRaw = formatNumberToBRL;

/**
 * Compact format for chart axes and tight spaces.
 * fmtBRLCompact(1500) → "R$1,5k"
 * fmtBRLCompact(2500000) → "R$2,5M"
 */
export function fmtBRLCompact(value: number | null | undefined): string {
  if (value == null || isNaN(value)) return 'R$0';
  const abs = Math.abs(value);
  const sign = value < 0 ? '-' : '';
  if (abs >= 1_000_000) return `${sign}R$${(abs / 1_000_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`;
  if (abs >= 1_000) return `${sign}R$${(abs / 1_000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`;
  return `${sign}R$${abs.toLocaleString('pt-BR', { maximumFractionDigits: 0 })}`;
}

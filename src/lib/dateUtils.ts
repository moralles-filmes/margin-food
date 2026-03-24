/**
 * Shared date utilities — eliminates duplicated parseLocalDate across modules.
 */

/** Parse 'YYYY-MM-DD' without timezone shift */
export function parseLocalDate(s: string): Date {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Format number as BRL currency (no decimals) */
export const fmtR = (v: number) =>
  `R$${v.toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}`;

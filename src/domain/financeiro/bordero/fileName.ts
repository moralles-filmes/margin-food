import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import type { BorderoPeriod, BorderoPeriodMode } from './period';

/** "Barbados Villágio / Matriz" → "barbados-villagio-matriz". */
export function slugifyBorderoName(value: string): string {
  const slug = value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || 'unidade';
}

function dayMonthYear(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}-${m}-${y}`;
}

/**
 * Semana/período: `bordero-barbados-villagio-31-08-2026-a-06-09-2026.pdf`
 * Mês:            `bordero-barbados-villagio-setembro-2026.pdf`
 */
export function buildBorderoPdfFileName(storeName: string, mode: BorderoPeriodMode, period: BorderoPeriod): string {
  const store = slugifyBorderoName(storeName);
  if (mode === 'month') {
    const [y, m] = period.start.split('-').map(Number);
    const monthName = slugifyBorderoName(format(new Date(y, m - 1, 1), 'MMMM', { locale: ptBR }));
    return `bordero-${store}-${monthName}-${y}.pdf`;
  }
  return `bordero-${store}-${dayMonthYear(period.start)}-a-${dayMonthYear(period.end)}.pdf`;
}

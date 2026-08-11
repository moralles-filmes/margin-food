import { startOfWeek, endOfWeek } from 'date-fns';
import { todayBR } from '@/lib/datetime';
import { parseLocalDate } from '@/lib/dateUtils';
import { monthBounds } from './MonthNavigator';

export type FiltroPeriodo = 'todos' | 'dia' | 'semana' | 'mes';

export function computePeriodoRange(periodo: FiltroPeriodo, mes: string): { de: string | null; ate: string | null } {
  if (periodo === 'dia') { const t = todayBR(); return { de: t, ate: t }; }
  if (periodo === 'semana') {
    const hoje = parseLocalDate(todayBR());
    const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { de: iso(startOfWeek(hoje, { weekStartsOn: 1 })), ate: iso(endOfWeek(hoje, { weekStartsOn: 1 })) };
  }
  if (periodo === 'mes') {
    const { start, end } = monthBounds(mes);
    return { de: start, ate: end };
  }
  return { de: null, ate: null };
}

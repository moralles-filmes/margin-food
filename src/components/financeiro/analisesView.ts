import { formatDecimalBR, formatPercentBR } from '@/lib/formatters';
import type { KpiCardDelta } from '@/components/ui/KpiCard';
import { shiftMonth } from './MonthNavigator';

/**
 * Rótulos das análises do Financeiro (Redesign V2, Fase 06A). Só apresentação: os números vêm das
 * RPCs como antes; aqui se decide como descrevê-los (período, base e unidade da variação).
 */

/** "2026-10-05" → "05/10/2026" (aritmética de texto, sem `new Date`). */
export function dataBR(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/**
 * Janela que `get_fin_kpis(p_meses)` usa: do 1º dia do mês de (hoje − (meses − 1) meses) até hoje,
 * no dia de negócio de São Paulo. O mês atual entra só até hoje (parcial).
 */
export function periodoDosKpis(meses: number, hojeISO: string): { inicio: string; fim: string; label: string } {
  const inicio = `${shiftMonth(hojeISO.slice(0, 7), -(meses - 1))}-01`;
  return { inicio, fim: hojeISO, label: `${dataBR(inicio)} a ${dataBR(hojeISO)}` };
}

export type TomVariacao = 'positive' | 'negative' | 'neutral';

/**
 * Variação percentual do Comparativo, com a mesma regra de cor de antes (`varColor`): queda de
 * despesa é boa. A RPC devolve 0 quando a base (mês B) é zero — aqui isso vira "Sem base", nunca
 * "0,00%"; a decisão usa a base que a própria resposta traz.
 */
export function deltaPercentual(pct: number, temBase: boolean, rotulo: string, inverso = false): KpiCardDelta {
  if (!temBase) return { label: rotulo, formatted: 'Sem base', direction: 'none', tone: 'neutral' };
  if (pct === 0) return { label: rotulo, formatted: formatPercentBR(0), direction: 'flat', tone: 'neutral' };
  const positivo = inverso ? pct < 0 : pct > 0;
  return {
    label: rotulo,
    formatted: `${pct > 0 ? '+' : ''}${formatPercentBR(pct)}`,
    direction: pct > 0 ? 'up' : 'down',
    tone: positivo ? 'positive' : 'negative',
  };
}

/** Variação em pontos percentuais (margem): unidade "p.p.", nunca "%". */
export function deltaPontos(pp: number, rotulo: string): KpiCardDelta {
  if (pp === 0) return { label: rotulo, formatted: '0,0 p.p.', direction: 'flat', tone: 'neutral' };
  return {
    label: rotulo,
    formatted: `${pp > 0 ? '+' : ''}${formatDecimalBR(pp, 1)} p.p.`,
    direction: pp > 0 ? 'up' : 'down',
    tone: pp > 0 ? 'positive' : 'negative',
  };
}

/** Texto da variação de uma categoria (mesma base do servidor: só calcula com valor em B > 0). */
export function variacaoCategoria(variacaoPct: number, valorB: number): { texto: string; tom: TomVariacao } {
  if (!(valorB > 0)) return { texto: 'Sem base', tom: 'neutral' };
  if (variacaoPct === 0) return { texto: formatPercentBR(0), tom: 'neutral' };
  return {
    texto: `${variacaoPct > 0 ? '+' : ''}${formatPercentBR(variacaoPct)}`,
    // Despesa: subir é ruim (mesma cor de antes).
    tom: variacaoPct > 0 ? 'negative' : 'positive',
  };
}

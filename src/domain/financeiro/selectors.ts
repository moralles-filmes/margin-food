/**
 * ─── Domain Selectors: Financeiro ───
 *
 * Official helper functions that implement business rules.
 * All financial modules MUST use these selectors instead of
 * inline logic to ensure consistency.
 *
 * Source of truth: docs/DOMAIN_RULES.md
 */

import { REALIZADO_STATUSES, PENDENTE_STATUSES, EXCLUDED_STATUSES, EXCLUDED_TIPOS_FROM_RESULT, type RealizadoStatus } from './invariants';
import type { FinancialSummary, InadimplenciaSummary, RateioResolvedItem } from './contracts';

// ── Status predicates ──

/** RULE-01: Entry counts as realized (money moved) */
export function isRealizado(status: string): status is RealizadoStatus {
  return (REALIZADO_STATUSES as readonly string[]).includes(status);
}

/** RULE-02: Entry counts as pending (expected) */
export function isPendente(status: string): boolean {
  return (PENDENTE_STATUSES as readonly string[]).includes(status);
}

/** RULE-03: Entry is excluded from all calculations */
export function isExcluded(status: string): boolean {
  return (EXCLUDED_STATUSES as readonly string[]).includes(status);
}

// ── Type predicates ──

/** RULE-04: TRANSFERENCIA is excluded from Receita/Despesa */
export function isTransferencia(tipo: string): boolean {
  return (EXCLUDED_TIPOS_FROM_RESULT as readonly string[]).includes(tipo);
}

/** RULE-05: Entry is eligible for Receita calculation */
export function isElegivelParaReceita(tipo: string, status: string): boolean {
  if (isTransferencia(tipo)) return false;
  if (isExcluded(status)) return false;
  return tipo === 'RECEITA';
}

/** RULE-06: Entry is eligible for Despesa calculation */
export function isElegivelParaDespesa(tipo: string, status: string): boolean {
  if (isTransferencia(tipo)) return false;
  if (isExcluded(status)) return false;
  return tipo === 'DESPESA';
}

/** RULE-07: Should CONCILIADO entries be included? Yes — they are realized. */
export function shouldIncludeConciliado(): boolean {
  return true; // CONCILIADO ∈ REALIZADO_STATUSES
}

// ── Calculation helpers ──

/** RULE-08: Official Resultado = Receita − Despesa */
export function calcResultado(receita: number, despesa: number): number {
  return receita - despesa;
}

/** RULE-09: Official Margem = Resultado / Receita × 100 (0 if receita = 0) */
export function calcMargem(resultado: number, receita: number): number {
  return receita === 0 ? 0 : (resultado / receita) * 100;
}

/** RULE-10: Official FinancialSummary from receita and despesa */
export function calcFinancialSummary(receita: number, despesa: number): FinancialSummary {
  const resultado = calcResultado(receita, despesa);
  const margem = calcMargem(resultado, receita);
  return { receita, despesa, resultado, margem };
}

/** RULE-11: Inadimplência = Total Vencido / Total Pendente a Receber × 100 */
export function calcInadimplencia(totalVencido: number, totalPendente: number): InadimplenciaSummary {
  const inadimplenciaPct = totalPendente === 0 ? 0 : (totalVencido / totalPendente) * 100;
  return { totalVencido, totalPendente, inadimplenciaPct };
}

/** RULE-12: Percentage change, safe for zero denominators */
export function calcVariacaoPct(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? null : null;
  return ((current - previous) / Math.abs(previous)) * 100;
}

// ── Rateio resolution ──

/**
 * RULE-13: Resolve rateio for a lancamento.
 * If rateio items exist, use them. Otherwise, use the parent category.
 */
export function resolveRateio(
  categoriaId: string | null,
  valor: number,
  rateioItems: Array<{ categoria_id: string; valor: number }> | null | undefined,
): RateioResolvedItem[] {
  if (rateioItems && rateioItems.length > 0) {
    return rateioItems.map(r => ({
      categoriaId: r.categoria_id,
      valor: r.valor,
    }));
  }
  if (categoriaId) {
    return [{ categoriaId, valor }];
  }
  return [];
}

// ── Period helpers ──

/**
 * RULE-14: Normalize month string to start/end date range.
 * Input: "2026-03" → { inicio: "2026-03-01", fim: "2026-04-01" }
 */
export function normalizeMesPeriodo(mesYYYYMM: string): { inicio: string; fim: string } {
  const [year, month] = mesYYYYMM.split('-').map(Number);
  const inicio = `${mesYYYYMM}-01`;
  const fim = month === 12
    ? `${year + 1}-01-01`
    : `${year}-${String(month + 1).padStart(2, '0')}-01`;
  return { inicio, fim };
}

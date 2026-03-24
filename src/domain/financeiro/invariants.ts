/**
 * ─── Domain Invariants: Financeiro ───
 *
 * Business invariants that MUST hold true across all modules.
 * Violation of any invariant is a semantic bug.
 *
 * Source of truth: docs/DOMAIN_RULES.md
 */

// ── Status sets ──

/** Statuses that count as "realizado" (money actually moved) */
export const REALIZADO_STATUSES = ['REALIZADO', 'CONCILIADO'] as const;
export type RealizadoStatus = typeof REALIZADO_STATUSES[number];

/** Statuses that count as "pendente" (money expected but not yet moved) */
export const PENDENTE_STATUSES = ['PENDENTE', 'PREVISTO', 'APROVADO'] as const;
export type PendenteStatus = typeof PENDENTE_STATUSES[number];

/** Statuses excluded from all financial calculations */
export const EXCLUDED_STATUSES = ['CANCELADO'] as const;
export type ExcludedStatus = typeof EXCLUDED_STATUSES[number];

/** All valid ledger entry statuses */
export const ALL_STATUSES = [...REALIZADO_STATUSES, ...PENDENTE_STATUSES, ...EXCLUDED_STATUSES] as const;
export type LancamentoStatus = typeof ALL_STATUSES[number];

// ── Type exclusions ──

/** Ledger entry types excluded from Receita/Despesa calculations */
export const EXCLUDED_TIPOS_FROM_RESULT = ['TRANSFERENCIA'] as const;
export type ExcludedTipo = typeof EXCLUDED_TIPOS_FROM_RESULT[number];

// ── Natureza ──

/** The two natures of financial entries */
export const NATUREZAS = ['RECEITA', 'DESPESA'] as const;
export type Natureza = typeof NATUREZAS[number];

// ── Regime ──

/** Accounting regime for report perspective */
export const REGIMES = ['competencia', 'caixa'] as const;
export type Regime = typeof REGIMES[number];

// ── Core invariant assertions ──

/**
 * INV-01: Resultado = Receita − Despesa
 * Must hold in Dashboard, DRE, Relatório Sócios, KPIs, Comparativo.
 */
export function assertResultado(receita: number, despesa: number, resultado: number): boolean {
  return Math.abs((receita - despesa) - resultado) < 0.01;
}

/**
 * INV-02: Margem = Resultado / Receita × 100 (0 when receita = 0)
 * Must hold in Dashboard, Relatório Sócios, KPIs, Comparativo.
 */
export function assertMargem(resultado: number, receita: number, margem: number): boolean {
  const expected = receita === 0 ? 0 : (resultado / receita) * 100;
  return Math.abs(expected - margem) < 0.1;
}

/**
 * INV-03: Inadimplência = Total Vencido / Total Pendente a Receber × 100
 */
export function assertInadimplencia(
  totalVencido: number,
  totalPendente: number,
  inadimplenciaPct: number,
): boolean {
  const expected = totalPendente === 0 ? 0 : (totalVencido / totalPendente) * 100;
  return Math.abs(expected - inadimplenciaPct) < 0.1;
}

/**
 * INV-04: Fechamento líquido = bruto − taxas − descontos
 */
export function assertFechamentoLiquido(
  bruto: number,
  taxas: number,
  descontos: number,
  liquido: number,
): boolean {
  return Math.abs((bruto - taxas - descontos) - liquido) < 0.01;
}

/**
 * ─── Domain Contracts: Financeiro ───
 *
 * Official typed contracts for financial domain results.
 * Every dashboard, report, export, and KPI MUST consume these
 * contracts instead of defining local types.
 *
 * Source of truth: docs/DOMAIN_RULES.md
 */

// ── Period criterion ──

/** How financial data is sliced temporally */
export type PeriodCriterion = 'competencia' | 'vencimento' | 'caixa';

/** Describes a financial period range */
export interface FinancialPeriod {
  inicio: string;       // yyyy-MM-dd
  fim: string;          // yyyy-MM-dd
  criterio: PeriodCriterion;
}

// ── Core summary ──

/** Official financial summary — used by Dashboard, KPIs */
export interface FinancialSummary {
  receita: number;
  despesa: number;
  resultado: number;
  margem: number;
}

/** Extended summary with accounts payable/receivable */
export interface FinancialSummaryExtended extends FinancialSummary {
  saldoCaixa: number;
  aReceber: number;
  aPagar: number;
}

// ── Inadimplência ──

/** Official delinquency summary */
export interface InadimplenciaSummary {
  totalVencido: number;
  totalPendente: number;
  inadimplenciaPct: number;
}

// ── Rateio ──

/** A resolved allocation item after rateio rules are applied */
export interface RateioResolvedItem {
  categoriaId: string;
  valor: number;
}

// ── Cash flow ──

/** Official cash flow day entry */
export interface CashFlowDay {
  data: string;
  entradas: number;
  saidas: number;
  prevEntradas: number;
  prevSaidas: number;
  saldoDia: number;
}

/** Cash flow totals */
export interface CashFlowTotals {
  entradas: number;
  saidas: number;
  prevEntradas: number;
  prevSaidas: number;
  saldoReal: number;
  saldoProjetado: number;
}

// ── Projection ──

/** Official projection result */
export interface ProjectionResult {
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldoFinal: number;
  diasNegativo: number;
  saldoMinimo: number;
}

// ── DRE / DFC ──

/** A line in DRE or DFC — aggregated by category */
export interface DemonstrativoLine {
  categoriaId: string;
  categoriaNome: string;
  valor: number;
  pctReceita?: number;
}

// ── Comparativo ──

/** Official comparison between two periods */
export interface PeriodComparison {
  periodoA: FinancialSummary & { totalLancamentos: number };
  periodoB: FinancialSummary & { totalLancamentos: number };
  variacoes: {
    receitaPct: number;
    despesaPct: number;
    resultadoPct: number;
    margemPp: number;
    lancamentosPct: number;
  };
}

// ── Fechamento de Caixa ──

/** Official daily closing entry */
export interface FechamentoCaixa {
  data: string;
  faturamentoBruto: number;
  taxas: number;
  descontos: number;
  faturamentoLiquido: number;
}

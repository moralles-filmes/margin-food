/**
 * ─── Domain Rules: Estoque ───
 *
 * Canonical stock health classification rules.
 * These MUST be the single source of truth for stock status
 * across Dashboard, Saldo tab, cards, exports, and any other consumer.
 *
 * The same logic is mirrored in the RPC `get_stock_dashboard` (SQL).
 * Any change here MUST be reflected there and vice-versa.
 */

// ─── Stock Health Status ───

export type StockHealthStatus = 'ok' | 'atencao' | 'critico' | 'sem_estoque';

/**
 * Canonical stock health classification.
 *
 * Rules (applied in order):
 * 1. sem_estoque: saldo <= 0
 * 2. critico: saldo <= estoqueMinimo * 0.5 AND estoqueMinimo > 0
 * 3. atencao: saldo <= estoqueMinimo AND estoqueMinimo > 0
 * 4. ok: everything else (saldo > estoqueMinimo OR estoqueMinimo = 0)
 *
 * Products with estoqueMinimo = 0 are considered "not monitored" for
 * low-stock alerts and always classify as OK (if saldo > 0).
 *
 * IMPORTANT: estoqueIdeal is NOT used for classification. It is used
 * only for display purposes (progress bars, suggestions).
 */
export function classifyStockHealth(
  saldo: number,
  estoqueMinimo: number,
): StockHealthStatus {
  if (saldo <= 0) return 'sem_estoque';
  if (estoqueMinimo > 0 && saldo <= estoqueMinimo * 0.5) return 'critico';
  if (estoqueMinimo > 0 && saldo <= estoqueMinimo) return 'atencao';
  return 'ok';
}

/**
 * Display config for each stock health status.
 */
export const STOCK_HEALTH_CONFIG: Record<StockHealthStatus, {
  label: string;
  shortLabel: string;
  emoji: string;
  colorClass: string;
  bgClass: string;
  borderClass: string;
}> = {
  ok: {
    label: 'OK',
    shortLabel: 'OK',
    emoji: '✅',
    colorClass: 'text-success',
    bgClass: 'bg-success/15',
    borderClass: 'border-border',
  },
  atencao: {
    label: 'Estoque Baixo',
    shortLabel: 'Baixo',
    emoji: '⚠️',
    colorClass: 'text-warning',
    bgClass: 'bg-warning/15',
    borderClass: 'border-warning/30',
  },
  critico: {
    label: 'Crítico',
    shortLabel: 'Crítico',
    emoji: '❌',
    colorClass: 'text-destructive',
    bgClass: 'bg-destructive/15',
    borderClass: 'border-destructive/30',
  },
  sem_estoque: {
    label: 'Sem Estoque',
    shortLabel: 'Sem Estoque',
    emoji: '🚫',
    colorClass: 'text-muted-foreground',
    bgClass: 'bg-muted/15',
    borderClass: 'border-destructive/30',
  },
};

/**
 * Count products by stock health status.
 */
export interface StockHealthCounts {
  ok: number;
  atencao: number;
  critico: number;
  sem_estoque: number;
}

export function countStockHealth(
  items: Array<{ saldo: number; estoqueMinimo: number }>,
): StockHealthCounts {
  const counts: StockHealthCounts = { ok: 0, atencao: 0, critico: 0, sem_estoque: 0 };
  for (const item of items) {
    counts[classifyStockHealth(item.saldo, item.estoqueMinimo)] += 1;
  }
  return counts;
}

// ─── Rule documentation ───

export const ESTOQUE_RULES = {
  'EST-SALDO': {
    id: 'EST-SALDO',
    name: 'Saldo de Estoque',
    description: 'Saldo atual = entradas − saídas − perdas. Calculado server-side.',
    sourceOfTruth: 'RPC get_saldo_produtos',
    consumers: ['Estoque Geral', 'Dashboard Estoque', 'Inventário'],
  },
  'EST-CUSTO-MEDIO': {
    id: 'EST-CUSTO-MEDIO',
    name: 'Custo Médio Ponderado',
    description: 'Custo médio = soma(valor × qtd) / soma(qtd) das entradas.',
    sourceOfTruth: 'RPC / trigger em movimentacoes',
    consumers: ['Estoque Geral', 'Ficha Técnica', 'CMV'],
  },
  'EST-HEALTH': {
    id: 'EST-HEALTH',
    name: 'Classificação de Saúde do Estoque',
    description:
      'sem_estoque: saldo<=0 | critico: saldo<=min*0.5 | atencao: saldo<=min | ok: saldo>min. ' +
      'Produtos com estoque_minimo=0 são sempre OK se saldo>0.',
    sourceOfTruth: 'domain/estoque/rules.ts → classifyStockHealth + RPC get_stock_dashboard',
    consumers: ['Dashboard Estoque', 'Saldo tab', 'Cards', 'Exports', 'Alertas'],
  },
} as const;

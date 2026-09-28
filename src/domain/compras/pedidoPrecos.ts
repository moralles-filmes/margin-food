/**
 * Preços de referência da solicitação de compra (Pedidos & Compras).
 *
 * "Última compra" vem do cache do produto (`last_cost_purchase_unit`,
 * `last_purchase_date`, `last_supplier`), recalculado a partir da última
 * ENTRADA ativa no estoque e já expresso na unidade de compra.
 *
 * O preço atual (o que será pago) é o que vale para o pedido:
 * `estimated_unit_value` e `purchase_unit_cost_snapshot` gravam SEMPRE o preço
 * atual — os relatórios de Compras/Planejamento leem o snapshot como custo real.
 * A referência é só comparação na tela.
 */

export interface ProdutoPrecoFonte {
  lastCostPurchaseUnit?: number | null;
  lastPurchaseDate?: string | null;
  lastSupplier?: string | null;
  avg30CostPurchaseUnit?: number | null;
  defaultCostPurchaseUnit?: number | null;
  custoPadrao?: number | null;
}

export interface UltimaCompra {
  unitCost: number;
  date: string | null;
  supplier: string | null;
}

const positivo = (v: number | null | undefined): v is number =>
  typeof v === 'number' && Number.isFinite(v) && v > 0;

/** Última compra registrada no estoque, ou `null` se o produto nunca teve entrada com custo. */
export function getUltimaCompra(prod: ProdutoPrecoFonte): UltimaCompra | null {
  if (!positivo(prod.lastCostPurchaseUnit)) return null;
  return {
    unitCost: prod.lastCostPurchaseUnit,
    date: prod.lastPurchaseDate || null,
    supplier: prod.lastSupplier || null,
  };
}

/**
 * Preço sugerido para o campo "preço atual": última compra → média 30d →
 * custo padrão de compra → custo padrão. 0 quando o produto não tem custo algum.
 */
export function getPrecoSugerido(prod: ProdutoPrecoFonte): number {
  const candidatos = [
    prod.lastCostPurchaseUnit,
    prod.avg30CostPurchaseUnit,
    prod.defaultCostPurchaseUnit,
    prod.custoPadrao,
  ];
  return candidatos.find(positivo) ?? 0;
}

export interface ItemPrecoComparado {
  qty_requested: number;
  estimated_unit_value: number;
  /** Preço da última compra na unidade de compra; `null` = sem histórico. */
  reference_unit_cost?: number | null;
}

export interface ComparativoTotais {
  /** Soma pelo preço atual (é o total estimado do pedido). */
  totalAtual: number;
  /** Soma pelo preço da última compra; item sem histórico entra pelo preço atual. */
  totalReferencia: number;
  /** totalAtual − totalReferencia (positivo = pedido mais caro que a última compra). */
  diferenca: number;
  /** Diferença em % sobre o total de referência; `null` quando a referência é 0. */
  diferencaPercentual: number | null;
  itensSemReferencia: number;
}

const centavos = (v: number) => Math.round(v * 100) / 100;

export function compararTotais(items: ItemPrecoComparado[]): ComparativoTotais {
  let totalAtual = 0;
  let totalReferencia = 0;
  let itensSemReferencia = 0;
  for (const item of items) {
    const atual = item.qty_requested * item.estimated_unit_value;
    totalAtual += atual;
    if (positivo(item.reference_unit_cost)) {
      totalReferencia += item.qty_requested * item.reference_unit_cost;
    } else {
      totalReferencia += atual;
      itensSemReferencia++;
    }
  }
  totalAtual = centavos(totalAtual);
  totalReferencia = centavos(totalReferencia);
  const diferenca = centavos(totalAtual - totalReferencia);
  return {
    totalAtual,
    totalReferencia,
    diferenca,
    diferencaPercentual: totalReferencia > 0 ? (diferenca / totalReferencia) * 100 : null,
    itensSemReferencia,
  };
}

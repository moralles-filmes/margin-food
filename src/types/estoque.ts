/**
 * Extended Estoque types — eliminates `as any` for dual-unit product fields.
 * These extend the base Produto/MovimentacaoEstoque from salmon.ts.
 */

import type { Produto, MovimentacaoEstoque } from './salmon';
import type { StockHealthStatus } from '@/domain/estoque/rules';

/** Extended product with dual-unit, cost tracking, and inactivity fields */
export interface ProdutoExtended extends Produto {
  unidadeCompra: string;
  fatorConversaoPadrao: number;
  packageQuantity: number | null;
  packageMeasureUnit: string | null;
  conversionMode: 'auto' | 'manual';
  custoUltimaCompra: number;
  custoMedio30d: number;
  defaultCostPurchaseUnit: number;
  defaultCostBaseUnit: number;
  needsCostReview: boolean;
  lastCostPurchaseUnit: number;
  lastCostBaseUnit: number;
  lastPurchaseDate: string | null;
  lastSupplier: string | null;
  avg30CostBaseUnit: number;
  avg30CostPurchaseUnit: number;
  avg30VariationPercent: number;
  inactivityDaysThreshold: number | null;
  lastMovementAt: string | null;
  isSalmonRawLinked: boolean;
  contaNoCmv: boolean;
  saldoAtual: number;
}

/** Extended movimentação with audit/status fields */
export interface MovimentacaoExtended extends MovimentacaoEstoque {
  status: string;
  estorno_de_id: string | null;
  justificativa_cancelamento: string;
  justificativa_edicao: string;
  setor: string | null;
  reference_type: string | null;
  reference_id: string | null;
  internal_transfer: boolean;
  source_module: string | null;
  salmon_lot_id: string | null;
  direction: string;
}

/** Product with computed stock status */
export interface ProdutoComSaldo extends ProdutoExtended {
  saldo: number;
  status: StockHealthStatus;
}

/** Product form shape for create/edit */
export interface ProdutoFormData {
  nomeProduto: string;
  sku: string;
  categoria: string;
  unidadeMedida: Produto['unidadeMedida'];
  conversoes: string;
  custoPadrao: number;
  fornecedoresPreferenciais: string[];
  leadTimeDias: number;
  estoqueMinimo: number;
  estoqueIdeal: number;
  localEstoque: string;
  ativo: boolean;
  observacoes: string;
  unidadeCompra: string;
  fatorConversaoPadrao: number;
  defaultCostPurchaseUnit: number;
  minIdealMode: 'base' | 'purchase';
  minPurchaseQty: number;
  idealPurchaseQty: number;
  inactivityDaysThreshold: string | number;
  contaNoCmv: boolean;
  packageQuantity: number | null;
  packageMeasureUnit: string | null;
  conversionMode: 'auto' | 'manual';
}

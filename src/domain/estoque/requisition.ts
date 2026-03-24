import type { ProdutoExtended } from '@/types/estoque';

/**
 * Official UI contract for stock requisitions.
 * Requisição must render the purchase unit only; accounting/base unit stays internal.
 */
export interface RequisitionDisplayProduct {
  id: string;
  nomeProduto: string;
  sku: string;
  displayUnitForRequisition: string | null;
  purchaseUnitLabel: string | null;
  accountingUnitLabel: string;
  hasValidPurchaseUnit: boolean;
  issueCode: 'missing_purchase_unit' | null;
  issueMessage: string | null;
}

export interface RequisitionListedItemDisplay {
  unitLabel: string | null;
  source: 'product_purchase_unit' | 'stored_snapshot' | 'missing_purchase_unit';
  issueCode: 'missing_purchase_unit' | null;
  issueMessage: string | null;
}

function normalizeUnitLabel(unit: string | null | undefined): string | null {
  const normalized = unit?.trim();
  return normalized ? normalized : null;
}

export function toRequisitionDisplayProduct(
  product: Pick<ProdutoExtended, 'id' | 'nomeProduto' | 'sku' | 'unidadeCompra'> & { unidadeMedida: string },
): RequisitionDisplayProduct {
  const purchaseUnit = normalizeUnitLabel(product.unidadeCompra);
  const accountingUnit = normalizeUnitLabel(product.unidadeMedida) ?? 'UN';

  if (!purchaseUnit) {
    return {
      id: product.id,
      nomeProduto: product.nomeProduto,
      sku: product.sku,
      displayUnitForRequisition: null,
      purchaseUnitLabel: null,
      accountingUnitLabel: accountingUnit,
      hasValidPurchaseUnit: false,
      issueCode: 'missing_purchase_unit',
      issueMessage: 'Unidade de compra não configurada no cadastro do produto.',
    };
  }

  return {
    id: product.id,
    nomeProduto: product.nomeProduto,
    sku: product.sku,
    displayUnitForRequisition: purchaseUnit,
    purchaseUnitLabel: purchaseUnit,
    accountingUnitLabel: accountingUnit,
    hasValidPurchaseUnit: true,
    issueCode: null,
    issueMessage: null,
  };
}

export function resolveListedRequisitionItemDisplay(item: {
  unidade: string;
  produtos?: { unidade_compra: string | null };
}): RequisitionListedItemDisplay {
  const purchaseUnit = normalizeUnitLabel(item.produtos?.unidade_compra);
  if (purchaseUnit) {
    return {
      unitLabel: purchaseUnit,
      source: 'product_purchase_unit',
      issueCode: null,
      issueMessage: null,
    };
  }

  const storedSnapshotUnit = normalizeUnitLabel(item.unidade);
  if (storedSnapshotUnit) {
    return {
      unitLabel: storedSnapshotUnit,
      source: 'stored_snapshot',
      issueCode: 'missing_purchase_unit',
      issueMessage: 'Unidade de compra atual não configurada; exibindo a unidade salva na requisição.',
    };
  }

  return {
    unitLabel: null,
    source: 'missing_purchase_unit',
    issueCode: 'missing_purchase_unit',
    issueMessage: 'Unidade de compra não configurada no cadastro do produto.',
  };
}

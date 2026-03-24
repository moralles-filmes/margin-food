/**
 * Requisition Unit Display Tests
 *
 * Validates that the Requisição flow uses the centralized adapter
 * and always resolves the purchase unit (unidadeCompra), never
 * silently falling back to the accounting unit (unidadeMedida).
 */
import { describe, it, expect } from 'vitest';
import { resolveListedRequisitionItemDisplay, toRequisitionDisplayProduct } from '@/domain/estoque/requisition';

const makeProduct = (overrides: Partial<{
  id: string;
  nomeProduto: string;
  sku: string;
  unidadeCompra: string;
  unidadeMedida: string;
}> = {}): Parameters<typeof toRequisitionDisplayProduct>[0] => ({
  id: overrides.id ?? 'prod-1',
  nomeProduto: overrides.nomeProduto ?? 'Açucar Cristal 5kg',
  sku: overrides.sku ?? 'SKU-001',
  unidadeCompra: overrides.unidadeCompra ?? 'Pacote',
  unidadeMedida: overrides.unidadeMedida ?? 'KG',
});

describe('toRequisitionDisplayProduct', () => {
  it('returns purchase unit as displayUnitForRequisition when available', () => {
    const result = toRequisitionDisplayProduct(makeProduct());
    expect(result.displayUnitForRequisition).toBe('Pacote');
    expect(result.hasValidPurchaseUnit).toBe(true);
    expect(result.issueCode).toBeNull();
  });

  it('flags missing purchase unit explicitly — does NOT silently fallback', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: '' }));
    expect(result.displayUnitForRequisition).toBeNull();
    expect(result.hasValidPurchaseUnit).toBe(false);
    expect(result.issueCode).toBe('missing_purchase_unit');
    expect(result.issueMessage).toBeTruthy();
  });

  it('handles null-ish unidadeCompra correctly', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: '   ' }));
    expect(result.displayUnitForRequisition).toBeNull();
    expect(result.hasValidPurchaseUnit).toBe(false);
  });

  it('trims whitespace from purchase unit', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: '  Fardo  ' }));
    expect(result.displayUnitForRequisition).toBe('Fardo');
  });

  it('preserves accounting unit label separately', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: 'Pacote', unidadeMedida: 'KG' }));
    expect(result.accountingUnitLabel).toBe('KG');
    expect(result.purchaseUnitLabel).toBe('Pacote');
  });

  it('never returns accounting unit as displayUnitForRequisition', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: '', unidadeMedida: 'KG' }));
    expect(result.displayUnitForRequisition).not.toBe('KG');
    expect(result.displayUnitForRequisition).toBeNull();
  });

  it('products with same purchase and accounting unit still resolve correctly', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: 'UN', unidadeMedida: 'UN' }));
    expect(result.displayUnitForRequisition).toBe('UN');
    expect(result.hasValidPurchaseUnit).toBe(true);
  });

  it('products with different purchase and accounting units are distinguished', () => {
    const result = toRequisitionDisplayProduct(makeProduct({ unidadeCompra: 'Galão', unidadeMedida: 'L' }));
    expect(result.displayUnitForRequisition).toBe('Galão');
    expect(result.accountingUnitLabel).toBe('L');
  });
});

describe('resolveListedRequisitionItemDisplay', () => {
  it('prioritizes current purchase unit from product relation for rendered history', () => {
    const result = resolveListedRequisitionItemDisplay({
      unidade: 'KG',
      produtos: { unidade_compra: 'Pacote' },
    });

    expect(result.unitLabel).toBe('Pacote');
    expect(result.source).toBe('product_purchase_unit');
    expect(result.issueCode).toBeNull();
  });

  it('uses stored snapshot explicitly when current purchase unit is missing', () => {
    const result = resolveListedRequisitionItemDisplay({
      unidade: 'Pacote',
      produtos: { unidade_compra: null },
    });

    expect(result.unitLabel).toBe('Pacote');
    expect(result.source).toBe('stored_snapshot');
    expect(result.issueCode).toBe('missing_purchase_unit');
  });

  it('returns missing state when neither purchase unit nor snapshot exists', () => {
    const result = resolveListedRequisitionItemDisplay({
      unidade: '   ',
      produtos: { unidade_compra: '   ' },
    });

    expect(result.unitLabel).toBeNull();
    expect(result.source).toBe('missing_purchase_unit');
    expect(result.issueCode).toBe('missing_purchase_unit');
  });
}
);

import { describe, it, expect } from 'vitest';
import { compararTotais, getPrecoSugerido, getUltimaCompra } from './pedidoPrecos';

describe('pedidoPrecos', () => {
  it('getUltimaCompra devolve preço, data e fornecedor da última entrada', () => {
    expect(getUltimaCompra({ lastCostPurchaseUnit: 49.9, lastPurchaseDate: '2026-09-12', lastSupplier: 'Ilha' }))
      .toEqual({ unitCost: 49.9, date: '2026-09-12', supplier: 'Ilha' });
  });

  it('getUltimaCompra é null sem entrada com custo', () => {
    expect(getUltimaCompra({ lastCostPurchaseUnit: 0, lastPurchaseDate: '2026-09-12' })).toBeNull();
    expect(getUltimaCompra({})).toBeNull();
  });

  it('getPrecoSugerido prioriza a última compra sobre a média 30d', () => {
    expect(getPrecoSugerido({ lastCostPurchaseUnit: 50, avg30CostPurchaseUnit: 45, custoPadrao: 40 })).toBe(50);
  });

  it('getPrecoSugerido cai para média 30d → custo padrão de compra → custo padrão', () => {
    expect(getPrecoSugerido({ lastCostPurchaseUnit: 0, avg30CostPurchaseUnit: 45 })).toBe(45);
    expect(getPrecoSugerido({ defaultCostPurchaseUnit: 30, custoPadrao: 10 })).toBe(30);
    expect(getPrecoSugerido({ custoPadrao: 10 })).toBe(10);
    expect(getPrecoSugerido({})).toBe(0);
  });

  it('compararTotais usa o preço atual no total e a última compra na referência', () => {
    const r = compararTotais([
      { qty_requested: 18, estimated_unit_value: 52.9, reference_unit_cost: 49.9 },
      { qty_requested: 10, estimated_unit_value: 14, reference_unit_cost: 14.9 },
    ]);
    expect(r.totalAtual).toBe(1092.2); // 952,20 + 140
    expect(r.totalReferencia).toBe(1047.2); // 898,20 + 149
    expect(r.diferenca).toBe(45);
    expect(r.diferencaPercentual).toBeCloseTo((45 / 1047.2) * 100, 6);
    expect(r.itensSemReferencia).toBe(0);
  });

  it('item sem histórico entra pelo preço atual nos dois totais', () => {
    const r = compararTotais([
      { qty_requested: 2, estimated_unit_value: 10, reference_unit_cost: 8 },
      { qty_requested: 3, estimated_unit_value: 5, reference_unit_cost: null },
    ]);
    expect(r.totalAtual).toBe(35);
    expect(r.totalReferencia).toBe(31);
    expect(r.diferenca).toBe(4);
    expect(r.itensSemReferencia).toBe(1);
  });

  it('diferença percentual é null quando a referência é zero', () => {
    const r = compararTotais([{ qty_requested: 1, estimated_unit_value: 0, reference_unit_cost: null }]);
    expect(r.diferencaPercentual).toBeNull();
  });

  it('arredonda os totais em centavos (sem resíduo de ponto flutuante)', () => {
    const r = compararTotais([
      { qty_requested: 3, estimated_unit_value: 0.1, reference_unit_cost: 0.2 },
    ]);
    expect(r.totalAtual).toBe(0.3);
    expect(r.totalReferencia).toBe(0.6);
    expect(r.diferenca).toBe(-0.3);
  });
});

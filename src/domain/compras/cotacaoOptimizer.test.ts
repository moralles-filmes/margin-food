import { describe, it, expect } from 'vitest';
import { optimizeCotacao, type OptimizerInput } from './cotacaoOptimizer';

// Helpers para montar a entrada sem depender do banco
function mk(
  items: { id: string; qty: number }[],
  suppliers: { id: string; minOrder?: number; frete?: number; prazo?: number }[],
  prices: Record<string, Record<string, number | null>>, // prices[itemId][supplierId] = preço | null(indisp)
): OptimizerInput {
  const quotes: OptimizerInput['quotes'] = {};
  for (const it of items) {
    quotes[it.id] = {};
    const row = prices[it.id] ?? {};
    for (const [sid, p] of Object.entries(row)) {
      quotes[it.id][sid] = { price: p == null ? NaN : p, available: p != null };
    }
  }
  return {
    items: items.map(i => ({ id: i.id, nome: i.id, qty: i.qty })),
    suppliers: suppliers.map(s => ({ id: s.id, nome: s.id, minOrder: s.minOrder ?? 0, frete: s.frete ?? 0, prazo: s.prazo ?? 0 })),
    quotes,
  };
}

describe('cotacaoOptimizer', () => {
  it('MENOR_PRECO escolhe o fornecedor mais barato por item', () => {
    const input = mk(
      [{ id: 'i1', qty: 10 }, { id: 'i2', qty: 5 }],
      [{ id: 'A' }, { id: 'B' }],
      { i1: { A: 20, B: 19 }, i2: { A: 12, B: 13 } },
    );
    const { scenarios } = optimizeCotacao(input);
    const s = scenarios.MENOR_PRECO!;
    expect(s.assignment.i1).toBe('B'); // 19 < 20
    expect(s.assignment.i2).toBe('A'); // 12 < 13
    expect(s.totalItens).toBe(19 * 10 + 12 * 5); // 250
  });

  it('OTIMIZADA respeita o pedido mínimo (realoca ou consolida)', () => {
    // A é mais barato no i2, mas sozinho (12*5=60) fica abaixo do mínimo 100.
    const input = mk(
      [{ id: 'i1', qty: 10 }, { id: 'i2', qty: 5 }],
      [{ id: 'A', minOrder: 100 }, { id: 'B', minOrder: 0 }],
      { i1: { A: 21, B: 19 }, i2: { A: 12, B: 13 } },
    );
    const { scenarios } = optimizeCotacao(input);
    const s = scenarios.OTIMIZADA_PEDIDO_MINIMO!;
    // Todo fornecedor usado bate o mínimo OU está marcado como inatingível
    for (const sup of s.perSupplier) {
      expect(sup.minOrder <= 0 || sup.meetsMin || !sup.minReachable).toBe(true);
    }
  });

  it('item exclusivo de um fornecedor é sempre atribuído a ele', () => {
    const input = mk(
      [{ id: 'i1', qty: 1 }],
      [{ id: 'A' }, { id: 'B' }],
      { i1: { A: 50 } }, // só A cota
    );
    const { scenarios } = optimizeCotacao(input);
    expect(scenarios.MENOR_PRECO!.assignment.i1).toBe('A');
    expect(scenarios.OTIMIZADA_PEDIDO_MINIMO!.assignment.i1).toBe('A');
  });

  it('item indisponível (preço null) é ignorado e vira "sem resposta" se ninguém cota', () => {
    const input = mk(
      [{ id: 'i1', qty: 2 }],
      [{ id: 'A' }, { id: 'B' }],
      { i1: { A: null, B: null } },
    );
    const { scenarios } = optimizeCotacao(input);
    const s = scenarios.MENOR_PRECO!;
    expect(s.assignment.i1).toBeUndefined();
    expect(s.itemsSemResposta.map(x => x.id)).toContain('i1');
  });

  it('economia = diferença vs fornecedor mais caro por item', () => {
    const input = mk(
      [{ id: 'i1', qty: 10 }],
      [{ id: 'A' }, { id: 'B' }],
      { i1: { A: 20, B: 25 } },
    );
    const s = optimizeCotacao(input).scenarios.MENOR_PRECO!;
    expect(s.economia).toBe((25 - 20) * 10); // 50
  });
});

import { describe, expect, it } from 'vitest';
import type { ManagerialLedgerEntry, ManagerialResultMetrics } from './contracts';
import {
  aggregateManagerialResult,
  calculateManagerialMetrics,
  calculatePresentationDeltas,
  calculateRelativeDelta,
} from './metrics';

function entry(overrides: Partial<ManagerialLedgerEntry> = {}): ManagerialLedgerEntry {
  return {
    id: 'entry-1',
    type: 'RECEITA',
    status: 'REALIZADO',
    amount: 100,
    competenceDate: '2026-03-15',
    origin: 'manual',
    reconciled: false,
    excludedFromReports: false,
    categoryId: 'revenue-category',
    allocations: null,
    ...overrides,
  };
}

function expectFiniteMetrics(metrics: ManagerialResultMetrics): void {
  for (const value of Object.values(metrics)) expect(Number.isFinite(value)).toBe(true);
}

describe('contrato do resultado gerencial', () => {
  it('calcula receita, despesa, resultado e margem somente com lançamentos elegíveis', () => {
    const metrics = aggregateManagerialResult([
      entry({ id: 'r1', amount: 100.1 }),
      entry({ id: 'r2', status: 'CONCILIADO', amount: 99.9 }),
      entry({ id: 'r3', origin: 'conciliacao', reconciled: true, amount: 25 }),
      entry({ id: 'd1', type: 'DESPESA', amount: 50.05 }),
      entry({ id: 'pending', status: 'PENDENTE', amount: 1_000 }),
      entry({ id: 'transfer', type: 'TRANSFERENCIA', amount: 1_000 }),
      entry({ id: 'excluded', excludedFromReports: true, amount: 1_000 }),
      entry({ id: 'unreconciled', origin: 'conciliacao', reconciled: false, amount: 1_000 }),
      entry({ id: 'outside', competenceDate: '2026-04-01', amount: 1_000 }),
    ], { start: '2026-03-01', endExclusive: '2026-04-01' });

    expect(metrics.revenue).toBe(225);
    expect(metrics.expense).toBe(50.05);
    expect(metrics.result).toBe(174.95);
    expect(metrics.marginPercent).toBeCloseTo((174.95 / 225) * 100, 10);
  });

  it('preserva centavos sem resíduos no resultado', () => {
    const metrics = aggregateManagerialResult([
      entry({ id: 'r1', amount: 0.1 }),
      entry({ id: 'r2', amount: 0.2 }),
      entry({ id: 'd1', type: 'DESPESA', amount: 0.1 }),
    ]);

    expect(metrics).toMatchObject({ revenue: 0.3, expense: 0.1, result: 0.2 });
    expectFiniteMetrics(metrics);
  });

  it('aceita negativos e valores grandes sem quebrar as fórmulas', () => {
    const negative = calculateManagerialMetrics(-123.45, -23.45);
    const large = calculateManagerialMetrics(999_999_999_999.99, 888_888_888_888.88);

    expect(negative.result).toBe(-100);
    expect(negative.marginPercent).toBeCloseTo((-100 / -123.45) * 100, 10);
    expect(large.result).toBe(111_111_111_111.11);
    expectFiniteMetrics(negative);
    expectFiniteMetrics(large);
  });

  it('define margem zero quando a receita é zero', () => {
    const metrics = calculateManagerialMetrics(0, 250);

    expect(metrics).toEqual({ revenue: 0, expense: 250, result: -250, marginPercent: 0 });
    expectFiniteMetrics(metrics);
  });
});

describe('deltas seguros', () => {
  it('marca a comparação como indisponível quando a base anterior é zero', () => {
    expect(calculateRelativeDelta(100, 0)).toEqual({
      state: 'unavailable',
      current: 100,
      previous: 0,
      absoluteChange: 100,
      value: null,
      unit: 'percent',
      reason: 'zero-baseline',
    });
    expect(calculateRelativeDelta(0, 0).state).toBe('unavailable');
  });

  it('usa o valor absoluto da base anterior para variações relativas', () => {
    const delta = calculateRelativeDelta(50, -100);

    expect(delta.state).toBe('available');
    if (delta.state === 'available') expect(delta.value).toBe(150);
  });

  it('nunca produz NaN ou Infinity nas métricas e deltas', () => {
    const current = calculateManagerialMetrics(0, 10);
    const previous = calculateManagerialMetrics(0, 0);
    const deltas = calculatePresentationDeltas(current, previous);

    expectFiniteMetrics(current);
    for (const delta of Object.values(deltas)) {
      expect(delta.value === null || Number.isFinite(delta.value)).toBe(true);
      expect(delta.absoluteChange === null || Number.isFinite(delta.absoluteChange)).toBe(true);
    }
    expect(deltas.margin).toMatchObject({ state: 'unavailable', reason: 'zero-baseline', value: null });
    expect(() => calculateRelativeDelta(Number.NaN, 10)).toThrow('must be finite');
    expect(() => calculateRelativeDelta(10, Number.POSITIVE_INFINITY)).toThrow('must be finite');
  });
});

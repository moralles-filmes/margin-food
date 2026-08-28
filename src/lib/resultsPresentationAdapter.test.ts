import { describe, expect, it } from 'vitest';
import { calculateManagerialMetrics } from '@/domain/financeiro/presentation';
import {
  buildPresentationResultBridge,
  derivePresentationResultsAvailability,
} from '@/lib/resultsPresentationAdapter';
import { createPresentationSnapshot } from '@/test/fixtures/presentationSocios';

function sourceWithMetrics(
  currentMetrics = calculateManagerialMetrics(1_200, 700),
  previousMetrics = calculateManagerialMetrics(0, 0),
) {
  const current = createPresentationSnapshot();
  const previous = createPresentationSnapshot();
  current.metrics.managerialResult = currentMetrics;
  previous.metrics.managerialResult = previousMetrics;
  return {
    generatedAt: '2026-08-25T15:30:00-03:00',
    periodLabel: 'Março de 2026',
    current: { state: 'available' as const, data: current, fetchedAt: '2026-08-25T15:30:00-03:00' },
    previousPeriod: { state: 'available' as const, data: previous, fetchedAt: '2026-08-25T15:30:00-03:00' },
  };
}

describe('adapter canônico de Resultados', () => {
  it('deriva resumo, comparação e fonte sem recalcular a base gerencial', () => {
    const availability = derivePresentationResultsAvailability(sourceWithMetrics());
    expect(availability.state).toBe('available');
    if (availability.state !== 'available') return;

    expect(availability.data.current).toEqual({
      revenue: 1_200,
      expense: 700,
      result: 500,
      marginPercent: 41.66666666666667,
    });
    expect(availability.data.source).toMatchObject({
      rpc: 'public.get_fin_presentation_socios',
      regime: 'caixa',
      dateField: 'COALESCE(data_pagamento, conciliado_em::date, data_competencia)',
      relations: ['public.fin_lancamentos', 'public.fin_lancamento_rateios'],
    });
    expect(availability.data.comparison.state).toBe('available');
    if (availability.data.comparison.state !== 'available') return;
    expect(availability.data.comparison.deltas.revenue).toMatchObject({
      state: 'unavailable',
      reason: 'zero-baseline',
      absoluteChange: 1_200,
      value: null,
    });
    expect(JSON.stringify(availability.data)).not.toMatch(/Infinity|NaN/);
  });

  it('fecha a ponte e inverte corretamente o sinal econômico da despesa', () => {
    const previous = calculateManagerialMetrics(1_000, 600);
    const higherExpense = buildPresentationResultBridge(
      calculateManagerialMetrics(1_100, 800),
      previous,
    );
    expect(higherExpense).toMatchObject({
      state: 'available',
      previousResult: 400,
      revenueEffect: 100,
      expenseEffect: -200,
      totalChange: -100,
      currentResult: 300,
    });
    if (higherExpense.state !== 'available') return;
    expect(higherExpense.previousResult + higherExpense.revenueEffect + higherExpense.expenseEffect)
      .toBe(higherExpense.currentResult);
    expect(higherExpense.steps.find(step => step.key === 'expense-effect')?.favorability)
      .toBe('unfavorable');

    const lowerExpense = buildPresentationResultBridge(
      calculateManagerialMetrics(1_000, 500),
      previous,
    );
    expect(lowerExpense).toMatchObject({ state: 'available', expenseEffect: 100, currentResult: 500 });
    if (lowerExpense.state === 'available') {
      expect(lowerExpense.steps.find(step => step.key === 'expense-effect')?.favorability)
        .toBe('favorable');
    }
  });

  it('mantém não operacional separado dos totais operacionais', () => {
    const availability = derivePresentationResultsAvailability(sourceWithMetrics());
    expect(availability.state).toBe('available');
    if (availability.state !== 'available') return;

    expect(availability.data.current.result).toBe(500);
    expect(availability.data.nonOperational.totals).toEqual({
      revenue: 100,
      expense: 0,
      result: 100,
      marginPercent: 100,
    });
    expect(availability.data.nonOperational.composition.revenue[0]?.name)
      .toBe('Receitas não operacionais');
  });

  it('propaga comparação fora do histórico sem fabricar uma ponte', () => {
    const source = sourceWithMetrics();
    const availability = derivePresentationResultsAvailability({
      ...source,
      previousPeriod: { state: 'unavailable', reason: 'outside-available-period' },
    });
    expect(availability.state).toBe('available');
    if (availability.state !== 'available') return;
    expect(availability.data.comparison).toEqual({
      state: 'unavailable',
      reason: 'outside-available-period',
    });
    expect(availability.data.bridge).toEqual({
      state: 'unavailable',
      reason: 'outside-available-period',
    });
  });

  it('rejeita qualquer divergência da fórmula canônica', () => {
    const source = sourceWithMetrics();
    source.current.data.metrics.managerialResult = {
      revenue: 1_200,
      expense: 700,
      result: 600,
      marginPercent: 50,
    };
    expect(() => derivePresentationResultsAvailability(source))
      .toThrow(/diverge das fórmulas canônicas/i);
  });
});

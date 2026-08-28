import { describe, expect, it } from 'vitest';
import {
  PRESENTATION_EXPENSES_SOURCE,
  PRESENTATION_INSIGHT_RULES,
  PRESENTATION_REVENUE_SOURCE,
  derivePresentationInsightsAvailability,
  generatePresentationInsights,
  type DataAvailability,
  type PresentationExpensesData,
  type PresentationRevenueData,
} from '@/domain/financeiro/presentation';
import {
  createInsightRichExpensesData,
  createInsightRichRevenueData,
} from '@/test/fixtures/presentationInsights';

function quietRevenue(): PresentationRevenueData {
  const base = createInsightRichRevenueData();
  return {
    ...base,
    current: { ...base.current, total: 900, closingCount: 2 },
    previous: { ...base.previous, total: 800, closingCount: 2 },
    delta: {
      absolute: { state: 'available', value: 100 },
      percentage: { state: 'available', value: 12.5 },
    },
    weekdays: base.weekdays.map(day => ({
      ...day,
      state: day.isoWeekday <= 2 ? 'available' : 'empty',
      total: day.isoWeekday <= 2 ? 450 : 0,
      occurrences: day.isoWeekday <= 2 ? 1 : 0,
      average: day.isoWeekday <= 2
        ? { state: 'available', value: 450 }
        : { state: 'unavailable', reason: 'no-occurrences' },
    })),
    history: base.history.map(point => ({
      ...point,
      state: point.yearMonth === base.selectedMonth ? 'available' : 'empty',
      total: point.yearMonth === base.selectedMonth ? 900 : 0,
      closingCount: point.yearMonth === base.selectedMonth ? 2 : 0,
    })),
  };
}

function quietExpenses(): PresentationExpensesData {
  const base = createInsightRichExpensesData();
  return {
    ...base,
    current: { ...base.current, total: 800, quantity: 2 },
    previous: { ...base.previous, total: 700, quantity: 2 },
    delta: {
      absolute: { state: 'available', value: 100 },
      percentage: { state: 'available', value: 14.2857 },
      meaning: 'increase',
      favorability: 'unfavorable',
    },
    rollingThreeMonths: [
      { yearMonth: '2026-01', state: 'available', total: 750, quantity: 2 },
      { yearMonth: '2026-02', state: 'available', total: 775, quantity: 2 },
      { yearMonth: '2026-03', state: 'available', total: 800, quantity: 2 },
    ],
    tree: [
      { ...base.tree[0], directAmount: 400, amount: 400 },
      { ...base.tree[1], directAmount: 400, amount: 400 },
    ],
  };
}

function available<T>(data: T): DataAvailability<T> {
  return { state: 'available', data };
}

describe('motor determinístico de Insights executivos', () => {
  it('é independente da ordem de entrada e mantém ranking estável de no máximo cinco itens', () => {
    const revenue = createInsightRichRevenueData();
    const expenses = createInsightRichExpensesData();
    const canonical = generatePresentationInsights(revenue, expenses);
    const shuffled = generatePresentationInsights(
      { ...revenue, weekdays: [...revenue.weekdays].reverse(), history: [...revenue.history].reverse() },
      { ...expenses, rollingThreeMonths: [...expenses.rollingThreeMonths].reverse(), tree: [...expenses.tree].reverse() },
    );

    expect(canonical.candidateCount).toBe(6);
    expect(canonical.insights).toHaveLength(5);
    expect(canonical.insights.map(insight => insight.id))
      .toEqual(shuffled.insights.map(insight => insight.id));
    expect(new Set(canonical.insights.map(insight => insight.id)).size).toBe(5);
    expect(canonical.insights.map(insight => insight.relevance.score)).toEqual(
      [...canonical.insights].map(insight => insight.relevance.score).sort((left, right) => right - left),
    );
  });

  it('permanece vazio quando nenhuma evidência atinge limiar ou dados mínimos', () => {
    const data = generatePresentationInsights(quietRevenue(), quietExpenses());
    expect(data.candidateCount).toBe(0);
    expect(data.insights).toEqual([]);
    expect(derivePresentationInsightsAvailability(
      available(quietRevenue()),
      available(quietExpenses()),
    )).toMatchObject({ state: 'empty', data: { insights: [] } });
  });

  it('aplica limiares absolutos, percentuais e mínimos de ocorrência de forma inclusiva', () => {
    const revenue = quietRevenue();
    const expenses = quietExpenses();
    const atThreshold: PresentationRevenueData = {
      ...revenue,
      current: { ...revenue.current, total: 2_000 },
      previous: { ...revenue.previous, total: 1_000 },
    };
    const belowAbsolute: PresentationRevenueData = {
      ...atThreshold,
      current: { ...atThreshold.current, total: 1_999 },
    };
    expect(generatePresentationInsights(atThreshold, expenses).insights.some(
      insight => insight.ruleId === 'revenue-month-change',
    )).toBe(true);
    expect(generatePresentationInsights(atThreshold, expenses).insights).toHaveLength(1);
    expect(generatePresentationInsights(belowAbsolute, expenses).insights.some(
      insight => insight.ruleId === 'revenue-month-change',
    )).toBe(false);

    const weekdayAtMinimum: PresentationRevenueData = {
      ...revenue,
      current: { ...revenue.current, total: 4_000 },
      weekdays: revenue.weekdays.map(day => day.isoWeekday === 5
        ? {
            ...day,
            state: 'available', total: 1_000,
            occurrences: PRESENTATION_INSIGHT_RULES.revenueWeekdayConcentration.minimumOccurrences,
            average: { state: 'available', value: 333.33 },
          }
        : day),
    };
    expect(generatePresentationInsights(weekdayAtMinimum, expenses).insights.some(
      insight => insight.ruleId === 'revenue-weekday-concentration',
    )).toBe(true);
    const weekdayBelowMinimum = {
      ...weekdayAtMinimum,
      weekdays: weekdayAtMinimum.weekdays.map(day => day.isoWeekday === 5
        ? { ...day, occurrences: 2 }
        : day),
    };
    expect(generatePresentationInsights(weekdayBelowMinimum, expenses).insights.some(
      insight => insight.ruleId === 'revenue-weekday-concentration',
    )).toBe(false);
  });

  it('preserva mudança absoluta com base zero sem NaN, Infinity ou null ambíguo', () => {
    const revenue = quietRevenue();
    const zeroBaseline: PresentationRevenueData = {
      ...revenue,
      current: { ...revenue.current, total: 5_000 },
      previous: { ...revenue.previous, total: 0 },
      delta: {
        absolute: { state: 'available', value: 5_000 },
        percentage: { state: 'unavailable', reason: 'zero-baseline' },
      },
    };
    const result = generatePresentationInsights(zeroBaseline, quietExpenses());
    const change = result.insights.find(insight => insight.ruleId === 'revenue-month-change');
    expect(change?.evidence).toMatchObject({
      type: 'period-change',
      absoluteChange: 5_000,
      percentageChange: { state: 'unavailable', reason: 'zero-baseline' },
    });
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity|"percentageChange":null/);
  });

  it('usa semântica inversa para despesas maiores e menores', () => {
    const increase = createInsightRichExpensesData();
    const reduction: PresentationExpensesData = {
      ...increase,
      current: { ...increase.current, total: 40_000 },
      previous: { ...increase.previous, total: 60_000 },
      tree: [
        { ...increase.tree[0], directAmount: 25_000, amount: 25_000 },
        { ...increase.tree[1], directAmount: 15_000, amount: 15_000 },
      ],
    };
    const increasedInsight = generatePresentationInsights(quietRevenue(), increase).insights
      .find(insight => insight.ruleId === 'expenses-month-change');
    const reducedInsight = generatePresentationInsights(quietRevenue(), reduction).insights
      .find(insight => insight.ruleId === 'expenses-month-change');
    expect(increasedInsight?.tone).toBe('negative');
    expect(reducedInsight?.tone).toBe('positive');
  });

  it('mantém Faturamento separado do razão e identifica as fontes canônicas dos insights', () => {
    const data = generatePresentationInsights(
      createInsightRichRevenueData(),
      createInsightRichExpensesData(),
    );
    const revenueInsights = data.insights.filter(insight => insight.domain === 'revenue');
    const expenseInsights = data.insights.filter(insight => insight.domain === 'expenses');
    expect(revenueInsights.length).toBeGreaterThan(0);
    expect(revenueInsights.every(insight => (
      insight.source === undefined
      ? false
      : 'relation' in insight.source
        && insight.source.relation === PRESENTATION_REVENUE_SOURCE.relation
        && insight.regime === 'fechamento-caixa'
    ))).toBe(true);
    expect(JSON.stringify(revenueInsights)).not.toContain('fin_lancamentos');
    expect(expenseInsights.length).toBeGreaterThan(0);
    expect(expenseInsights.every(insight => (
      'report' in insight.source
      && insight.source.report === PRESENTATION_EXPENSES_SOURCE.report
      && insight.source.dateField === PRESENTATION_EXPENSES_SOURCE.dateField
      && insight.regime === 'caixa'
    ))).toBe(true);
    expect(JSON.stringify(data)).not.toContain('get_fin_presentation_socios');
  });

  it.each([
    ['loading', { state: 'loading' as const }, { state: 'loading' }],
  ])('aguarda o estado %s sem fabricar conteúdo', (_label, revenue, expected) => {
    expect(derivePresentationInsightsAvailability(
      revenue,
      available(quietExpenses()),
    )).toMatchObject(expected);
  });

  it.each([
    ['indisponível', { state: 'unavailable' as const, reason: 'missing-canonical-source' as const }],
    ['com erro', { state: 'error' as const, message: 'Falha controlada.' }],
  ])('gera Insights parciais de despesas quando Faturamento está %s', (_label, revenue) => {
    const availability = derivePresentationInsightsAvailability(
      revenue,
      available(createInsightRichExpensesData()),
    );
    expect(availability.state).toBe('available');
    if (availability.state !== 'available') return;
    expect(availability.data.insights.length).toBeGreaterThan(0);
    expect(availability.data.insights.every(insight => insight.domain === 'expenses')).toBe(true);
  });

  it('continua indisponível quando nenhuma fonte canônica pode ser materializada', () => {
    expect(derivePresentationInsightsAvailability(
      { state: 'unavailable', reason: 'missing-canonical-source' },
      { state: 'unavailable', reason: 'missing-canonical-source' },
    )).toEqual({ state: 'unavailable', reason: 'missing-canonical-source' });
  });
});

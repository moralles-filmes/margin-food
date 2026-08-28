import type {
  PresentationExpensesData,
  PresentationRevenueData,
} from '@/domain/financeiro/presentation';
import {
  attachPresentationExpenses,
  attachPresentationInsights,
  attachPresentationRevenue,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import { createPresentationExpensesData } from '@/test/fixtures/presentationExpenses';
import { createPresentationRevenueData } from '@/test/fixtures/presentationRevenue';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';

const CATEGORY_PEOPLE = '44444444-4444-4444-8444-444444444444';
const CATEGORY_OPERATIONS = '55555555-5555-4555-8555-555555555555';

export function createInsightRichRevenueData(): PresentationRevenueData {
  const base = createPresentationRevenueData();
  const historyValues = new Map<string, number>([
    ['2025-10', 60_000],
    ['2025-11', 66_000],
    ['2025-12', 72_000],
    ['2026-01', 80_000],
    ['2026-02', 88_000],
    ['2026-03', 100_000],
  ]);
  return {
    ...base,
    current: { ...base.current, total: 100_000, closingCount: 20 },
    previous: { ...base.previous, total: 80_000, closingCount: 18 },
    delta: {
      absolute: { state: 'available', value: 20_000 },
      percentage: { state: 'available', value: 25 },
    },
    weekdays: base.weekdays.map(day => day.isoWeekday === 5
      ? {
          ...day,
          state: 'available',
          total: 40_000,
          occurrences: 4,
          average: { state: 'available', value: 10_000 },
        }
      : day),
    history: base.history.map((point) => {
      const total = historyValues.get(point.yearMonth);
      return total === undefined
        ? point
        : { ...point, state: 'available', total, closingCount: 4 };
    }),
  };
}

export function createInsightRichExpensesData(): PresentationExpensesData {
  const base = createPresentationExpensesData();
  return {
    ...base,
    current: { ...base.current, total: 70_000, quantity: 30 },
    previous: { ...base.previous, total: 50_000, quantity: 25 },
    delta: {
      absolute: { state: 'available', value: 20_000 },
      percentage: { state: 'available', value: 40 },
      meaning: 'increase',
      favorability: 'unfavorable',
    },
    rollingThreeMonths: [
      { yearMonth: '2026-01', state: 'available', total: 40_000, quantity: 20 },
      { yearMonth: '2026-02', state: 'available', total: 50_000, quantity: 25 },
      { yearMonth: '2026-03', state: 'available', total: 70_000, quantity: 30 },
    ],
    tree: [
      {
        categoryId: CATEGORY_PEOPLE,
        parentId: null,
        name: 'Pessoas',
        order: 1,
        operationalClass: 'operational',
        directAmount: 45_000,
        amount: 45_000,
        children: [],
      },
      {
        categoryId: CATEGORY_OPERATIONS,
        parentId: null,
        name: 'Operação',
        order: 2,
        operationalClass: 'operational',
        directAmount: 25_000,
        amount: 25_000,
        children: [],
      },
    ],
  };
}

export function createPresentationWithInsights(
  base: PresentationSociosData = createPresentationSociosData(),
): PresentationSociosData {
  const revenue = createInsightRichRevenueData();
  const expenses = createInsightRichExpensesData();
  return attachPresentationInsights(
    attachPresentationExpenses(
      attachPresentationRevenue(base, {
        state: 'available', data: revenue, fetchedAt: revenue.generatedAt,
      }),
      { state: 'available', data: expenses, fetchedAt: expenses.generatedAt },
    ),
  );
}

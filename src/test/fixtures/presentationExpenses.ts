import {
  PRESENTATION_EXPENSES_SOURCE,
  type PresentationExpensesData,
} from '@/domain/financeiro/presentation';
import {
  attachPresentationExpenses,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';

const ROOT_ID = '11111111-1111-4111-8111-111111111111';
const CHILD_ID = '22222222-2222-4222-8222-222222222222';
const NON_OPERATIONAL_ID = '33333333-3333-4333-8333-333333333333';

export function createPresentationExpensesData(): PresentationExpensesData {
  const requestedYears = [2024, 2025, 2026];
  return {
    contractVersion: '1.0',
    source: PRESENTATION_EXPENSES_SOURCE,
    availability: 'available',
    selectedMonth: '2026-03',
    previousMonth: '2026-02',
    requestedYears,
    generatedAt: '2026-08-27T15:30:00-03:00',
    coverage: { state: 'available', minDate: '2024-01-05', maxDate: '2026-03-28' },
    current: {
      state: 'available', month: '2026-03', startDate: '2026-03-01', endExclusive: '2026-04-01',
      total: 1_200, quantity: 4, coverage: { state: 'covered', firstDate: '2026-03-03', lastDate: '2026-03-28' },
    },
    previous: {
      state: 'available', month: '2026-02', startDate: '2026-02-01', endExclusive: '2026-03-01',
      total: 1_500, quantity: 3, coverage: { state: 'covered', firstDate: '2026-02-04', lastDate: '2026-02-26' },
    },
    delta: {
      absolute: { state: 'available', value: -300 },
      percentage: { state: 'available', value: -20 },
      meaning: 'reduction',
      favorability: 'favorable',
    },
    rollingThreeMonths: [
      { yearMonth: '2026-01', state: 'available', total: 1_800, quantity: 5 },
      { yearMonth: '2026-02', state: 'available', total: 1_500, quantity: 3 },
      { yearMonth: '2026-03', state: 'available', total: 1_200, quantity: 4 },
    ],
    history: requestedYears.flatMap(year => Array.from({ length: 12 }, (_, monthIndex) => {
      const month = monthIndex + 1;
      const yearMonth = `${year}-${String(month).padStart(2, '0')}`;
      const total = yearMonth === '2026-03' ? 1_200 : yearMonth === '2026-02' ? 1_500 : yearMonth === '2026-01' ? 1_800 : 0;
      return {
        year, month, yearMonth,
        state: total > 0 ? 'available' as const : year === 2026 && month > 3 ? 'unavailable' as const : 'empty' as const,
        total,
        quantity: total > 0 ? month : 0,
      };
    })),
    tree: [
      {
        categoryId: ROOT_ID, parentId: null, name: 'Despesas operacionais', order: 1,
        operationalClass: 'operational', directAmount: 100, amount: 1_000,
        children: [
          { categoryId: CHILD_ID, parentId: ROOT_ID, name: 'Insumos', order: 1, operationalClass: 'operational', directAmount: 600, amount: 600, children: [] },
          { categoryId: NON_OPERATIONAL_ID, parentId: ROOT_ID, name: 'Ajustes extraordinários', order: 2, operationalClass: 'non-operational', directAmount: 300, amount: 300, children: [] },
        ],
      },
      { categoryId: null, parentId: null, name: 'Sem categoria — Despesas', order: 9981, operationalClass: 'operational', directAmount: 200, amount: 200, children: [] },
    ],
  };
}

export function createPresentationWithExpenses(
  base: PresentationSociosData = createPresentationSociosData(),
): PresentationSociosData {
  const expenses = createPresentationExpensesData();
  return attachPresentationExpenses(base, { state: 'available', data: expenses, fetchedAt: expenses.generatedAt });
}

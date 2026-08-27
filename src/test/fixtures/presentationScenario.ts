import {
  buildPresentationScenario,
  createEmptyPresentationScenarioDraft,
  type PresentationPlanCategory,
  type PresentationScenarioDraft,
  type PresentationScenarioResult,
} from '@/domain/financeiro/presentation';
import {
  attachPresentationPlan,
  attachPresentationScenario,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import {
  createPresentationPlanData,
  createPresentationSociosData,
} from '@/test/fixtures/presentationSocios';

export const SCENARIO_REVENUE_CATEGORY_ID = '11111111-1111-4111-8111-111111111111';
export const SCENARIO_EXPENSE_CATEGORY_ID = '22222222-2222-4222-8222-222222222222';

export function createPresentationScenarioCategories(): PresentationPlanCategory[] {
  return [
    {
      categoryId: SCENARIO_REVENUE_CATEGORY_ID,
      parentCategoryId: null,
      name: 'Receitas operacionais',
      nature: 'RECEITA',
      effectiveGroup: null,
      depth: 0,
      directActual: 1_200,
      actualAmount: 1_200,
      directBudget: 1_100,
      budgetAmount: 1_100,
      actualCoveredAmount: 1_200,
      budgetConfigured: true,
      coverageComplete: true,
      varianceAmount: 100,
      variancePercent: 9.0909,
      revenueSharePercent: 100,
      resultSharePercent: 240,
    },
    {
      categoryId: SCENARIO_EXPENSE_CATEGORY_ID,
      parentCategoryId: null,
      name: 'Ocupação',
      nature: 'DESPESA',
      effectiveGroup: 'ocupacao',
      depth: 0,
      directActual: 120,
      actualAmount: 120,
      directBudget: 100,
      budgetAmount: 100,
      actualCoveredAmount: 120,
      budgetConfigured: true,
      coverageComplete: true,
      varianceAmount: 20,
      variancePercent: 20,
      revenueSharePercent: 10,
      resultSharePercent: 24,
    },
  ];
}

export function createPresentationScenarioDraftFixture(
  withSensitivity = true,
): PresentationScenarioDraft {
  const empty = createEmptyPresentationScenarioDraft();
  return {
    ...empty,
    name: 'Renegociação executiva',
    totalRevenue: { mode: 'absolute', value: '100,00' },
    categoryLevers: [{
      categoryId: SCENARIO_EXPENSE_CATEGORY_ID,
      adjustment: { mode: 'absolute', value: '-20,00' },
    }],
    sensitivity: withSensitivity ? {
      leverId: 'revenue-total',
      minValue: '-600,00',
      maxValue: '200,00',
      stepValue: '100,00',
    } : null,
  };
}

export function createPresentationScenarioResult(
  withSensitivity = true,
): PresentationScenarioResult {
  const plan = createPresentationPlanData();
  return buildPresentationScenario({
    draft: createPresentationScenarioDraftFixture(withSensitivity),
    plan,
    categories: createPresentationScenarioCategories(),
    period: plan.range,
    granularity: 'month',
  });
}

export function createPresentationWithScenario(
  withSensitivity = true,
): PresentationSociosData {
  const withPlan = attachPresentationPlan(createPresentationSociosData(), {
    state: 'available',
    data: createPresentationPlanData(),
    fetchedAt: '2026-08-25T15:30:00-03:00',
  });
  return attachPresentationScenario(withPlan, {
    state: 'available',
    data: createPresentationScenarioResult(withSensitivity),
  });
}

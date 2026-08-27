import { describe, expect, it } from 'vitest';
import {
  buildPresentationScenario,
  createEmptyPresentationScenarioDraft,
  parseExactScaledInteger,
  parsePresentationScenarioDraft,
  parsePresentationScenarioResult,
  PRESENTATION_SCENARIO_MAX_RESULT_BYTES,
  presentationScenarioModeAvailability,
  type PresentationScenarioDraft,
  type PresentationScenarioResult,
} from './scenario';
import type { PresentationPlanCategory, PresentationPlanData } from './plan';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

const REVENUE_ID = '11111111-1111-4111-8111-111111111111';
const EXPENSE_ID = '22222222-2222-4222-8222-222222222222';
const CMV_ID = '33333333-3333-4333-8333-333333333333';
const EXPENSE_CHILD_ID = '44444444-4444-4444-8444-444444444444';

function category(
  categoryId: string,
  overrides: Partial<PresentationPlanCategory>,
): PresentationPlanCategory {
  return {
    categoryId,
    parentCategoryId: null,
    name: 'Categoria',
    nature: 'DESPESA',
    effectiveGroup: null,
    depth: 0,
    directActual: 0,
    actualAmount: 0,
    directBudget: 0,
    budgetAmount: 0,
    actualCoveredAmount: 0,
    budgetConfigured: true,
    coverageComplete: true,
    varianceAmount: 0,
    variancePercent: null,
    revenueSharePercent: null,
    resultSharePercent: null,
    ...overrides,
  };
}

function categories(): PresentationPlanCategory[] {
  return [
    category(REVENUE_ID, {
      name: 'Receitas operacionais',
      nature: 'RECEITA',
      directActual: 1_200,
      actualAmount: 1_200,
      directBudget: 1_100,
      budgetAmount: 1_100,
    }),
    category(EXPENSE_ID, {
      name: 'Despesas operacionais',
      directActual: 420,
      actualAmount: 700,
      directBudget: 390,
      budgetAmount: 650,
    }),
    category(CMV_ID, {
      parentCategoryId: EXPENSE_ID,
      name: 'Insumos',
      effectiveGroup: 'cmv',
      depth: 1,
      directActual: 280,
      actualAmount: 280,
      directBudget: 260,
      budgetAmount: 260,
    }),
    category(EXPENSE_CHILD_ID, {
      parentCategoryId: EXPENSE_ID,
      name: 'Ocupação',
      effectiveGroup: 'ocupacao',
      depth: 1,
      directActual: 120,
      actualAmount: 120,
      directBudget: 100,
      budgetAmount: 100,
    }),
  ];
}

function build(
  draft: PresentationScenarioDraft,
  plan: PresentationPlanData = createPresentationPlanData(),
): PresentationScenarioResult {
  return buildPresentationScenario({
    draft,
    plan,
    categories: categories(),
    period: plan.range,
    granularity: 'month',
  });
}

describe('cenários determinísticos da Apresentação Sócios', () => {
  it('mantém ausência total de alavancas como uma simulação neutra', () => {
    const result = build(createEmptyPresentationScenarioDraft());
    expect(result.activeLevers).toEqual([]);
    expect(result.scenario).toEqual(result.baseline);
    expect(result.sensitivity).toEqual({ state: 'not-configured' });
    expect(result.sources).toMatchObject({
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    });
    expect(result.rules.openItemsIncluded).toBe(false);
    expect(JSON.stringify(result)).not.toMatch(/NaN|Infinity/);
  });

  it('calcula ajuste absoluto e percentual com centavos e pontos-base exatos', () => {
    const draft = createEmptyPresentationScenarioDraft();
    const result = build({
      ...draft,
      totalRevenue: { mode: 'absolute', value: '100,10' },
      totalExpense: { mode: 'percentage', value: '10,00' },
    });
    expect(parseExactScaledInteger('R$ 1.234,56', 2)).toBe(123456n);
    expect(result.scenario.revenue).toBe(1_300.1);
    expect(result.scenario.expense).toBe(770);
    expect(result.scenario.result).toBe(530.1);
    expect(result.activeLevers.map(lever => lever.id)).toEqual(['expense-total', 'revenue-total']);
  });

  it('não recalcula CMV ao alterar receita sem alavanca explícita', () => {
    const draft = createEmptyPresentationScenarioDraft();
    const result = build({
      ...draft,
      totalRevenue: { mode: 'absolute', value: '100,00' },
    });
    expect(result.scenario.cmv).toBe(280);
    expect(result.scenario.cmvPercent).toBeCloseTo((280 / 1_300) * 100, 6);
    expect(result.scenario.expense).toBe(700);
  });

  it('aplica meta percentual explícita de CMV sobre a receita do cenário', () => {
    const draft = createEmptyPresentationScenarioDraft();
    const result = build({
      ...draft,
      totalRevenue: { mode: 'absolute', value: '100,00' },
      cmvTargetPercent: '25,00',
    });
    expect(result.scenario.cmv).toBe(325);
    expect(result.scenario.expense).toBe(745);
    expect(result.scenario.result).toBe(555);
    expect(result.scenario.cmvPercent).toBe(25);
  });

  it('bloqueia CMV monetário e percentual simultâneos', () => {
    const draft = createEmptyPresentationScenarioDraft();
    expect(() => build({
      ...draft,
      cmvMoney: { mode: 'absolute', value: '10,00' },
      cmvTargetPercent: '25,00',
    })).toThrowError(expect.objectContaining({ code: 'CMV_LEVER_CONFLICT' }));
  });

  it('bloqueia categoria pai e descendente para impedir dupla contagem do rollup', () => {
    const draft = createEmptyPresentationScenarioDraft();
    expect(() => build({
      ...draft,
      categoryLevers: [
        { categoryId: EXPENSE_ID, adjustment: { mode: 'absolute', value: '10,00' } },
        { categoryId: EXPENSE_CHILD_ID, adjustment: { mode: 'absolute', value: '5,00' } },
      ],
    })).toThrowError(expect.objectContaining({ code: 'CATEGORY_HIERARCHY_OVERLAP' }));
  });

  it('usa o rollup canônico uma única vez e preserva rateio, exclusões e CP/CR da RPC base', () => {
    const draft = createEmptyPresentationScenarioDraft();
    const result = build({
      ...draft,
      categoryLevers: [
        { categoryId: EXPENSE_ID, adjustment: { mode: 'percentage', value: '10,00' } },
      ],
    });
    expect(result.categoryRows[0]).toMatchObject({ baseline: 700, adjustment: 70, scenario: 770 });
    expect(result.scenario.expense).toBe(770);
    expect(result.scenario.result).toBe(430);
    expect(result.rules.categoryPrecedence).toMatch(/rollup canônico/i);
    expect(result.rules.openItemsIncluded).toBe(false);
  });

  it('rejeita categoria fora do conjunto tenant-scoped', () => {
    const draft = createEmptyPresentationScenarioDraft();
    expect(() => build({
      ...draft,
      categoryLevers: [{
        categoryId: '55555555-5555-4555-8555-555555555555',
        adjustment: { mode: 'absolute', value: '10,00' },
      }],
    })).toThrowError(expect.objectContaining({ code: 'CATEGORY_OUTSIDE_TENANT' }));
  });

  it.each([
    ['budget' as const, 1_100, 650, 450],
    ['projection' as const, 1_860, 1_085, 775],
  ])('seleciona a base %s sem fallback', (baselineMode, revenue, expense, result) => {
    const scenario = build({ ...createEmptyPresentationScenarioDraft(), baselineMode });
    expect(scenario.baseline).toMatchObject({ revenue, expense, result });
    expect(scenario.baselineMode).toBe(baselineMode);
  });

  it('mantém orçamento e projeção indisponíveis quando faltam configurações canônicas', () => {
    const base = createPresentationPlanData();
    const plan = createPresentationPlanData({
      budget: { ...base.budget, revenue: null, expense: null, result: null, marginPercent: null },
      coverage: {
        ...base.coverage,
        revenue: { configured: false, complete: false, actualCovered: 0, actualTotal: 1_200 },
        expense: { configured: false, complete: false, actualCovered: 0, actualTotal: 700 },
      },
      projection: { ...base.projection, state: 'insufficient-sample', metrics: null, factor: null },
    });
    expect(presentationScenarioModeAvailability(plan)).toMatchObject({
      budget: { available: false, reason: 'budget-not-configured' },
      projection: { available: false, reason: 'projection-unavailable' },
    });
    expect(() => build({ ...createEmptyPresentationScenarioDraft(), baselineMode: 'budget' }, plan))
      .toThrowError(expect.objectContaining({ code: 'BASELINE_UNAVAILABLE' }));
  });

  it('representa receita zero, impacto percentual de base zero e valores negativos sem não finitos', () => {
    const base = createPresentationPlanData();
    const plan = createPresentationPlanData({
      actual: { ...base.actual, revenue: 0, result: -700, marginPercent: null, cmvPercent: null },
    });
    const scenario = build({
      ...createEmptyPresentationScenarioDraft(),
      totalExpense: { mode: 'absolute', value: '-50,00' },
    }, plan);
    expect(scenario.scenario.marginPercent).toBeNull();
    expect(scenario.impact.revenue.percent).toBeNull();
    expect(scenario.scenario.result).toBe(-650);
    expect(JSON.stringify(scenario)).not.toMatch(/NaN|Infinity/);
  });

  it('gera sensibilidade de uma variável, mantém as demais fixas e destaca a configuração atual', () => {
    const draft = createEmptyPresentationScenarioDraft();
    const scenario = build({
      ...draft,
      totalRevenue: { mode: 'absolute', value: '100,00' },
      totalExpense: { mode: 'absolute', value: '20,00' },
      sensitivity: {
        leverId: 'revenue-total',
        minValue: '-600,00',
        maxValue: '200,00',
        stepValue: '100,00',
      },
    });
    expect(scenario.sensitivity.state).toBe('available');
    if (scenario.sensitivity.state !== 'available') return;
    expect(scenario.sensitivity.points.find(point => point.isBase)).toMatchObject({ inputValue: 100, result: 580 });
    expect(scenario.sensitivity.breakEven.state).toBe('available');
  });

  it('limita pontos de sensibilidade e exige faixa incluindo a alavanca atual', () => {
    const draft = {
      ...createEmptyPresentationScenarioDraft(),
      totalRevenue: { mode: 'absolute' as const, value: '1,00' },
      sensitivity: {
        leverId: 'revenue-total',
        minValue: '0,00',
        maxValue: '101,00',
        stepValue: '1,00',
      },
    };
    expect(() => build(draft)).toThrowError(expect.objectContaining({ code: 'SENSITIVITY_TOO_MANY_POINTS' }));
    expect(() => build({
      ...draft,
      sensitivity: { ...draft.sensitivity, minValue: '2,00', maxValue: '10,00' },
    })).toThrowError(expect.objectContaining({ code: 'SENSITIVITY_BASE_OUTSIDE_RANGE' }));
  });

  it('rejeita payload malformado, enum desconhecido, UUID inválido e resposta sem fórmula', () => {
    expect(() => parsePresentationScenarioDraft({
      ...createEmptyPresentationScenarioDraft(),
      baselineMode: 'forecast',
    })).toThrowError(expect.objectContaining({ code: 'UNKNOWN_ENUM' }));
    expect(() => parsePresentationScenarioDraft({
      ...createEmptyPresentationScenarioDraft(),
      categoryLevers: [{ categoryId: 'outro-tenant', adjustment: { mode: 'absolute', value: '1' } }],
    })).toThrowError(expect.objectContaining({ code: 'INVALID_UUID' }));
    const response = build(createEmptyPresentationScenarioDraft());
    expect(() => parsePresentationScenarioResult({ ...response, formulaVersion: undefined }))
      .toThrowError(expect.objectContaining({ code: 'UNKNOWN_VERSION' }));
    expect(() => parsePresentationScenarioResult({
      ...response,
      scenario: { ...response.scenario, result: Number.NaN },
    })).toThrowError(expect.objectContaining({ code: 'NON_FINITE' }));
    expect(() => parsePresentationScenarioResult({
      ...response,
      rules: { ...response.rules, scenarioFormula: undefined },
    })).toThrowError(expect.objectContaining({ code: 'MISSING_FORMULA' }));
    expect(() => parsePresentationScenarioResult({
      ...response,
      impact: {
        ...response.impact,
        result: { ...response.impact.result, favorability: 'promising' },
      },
    })).toThrowError(expect.objectContaining({ code: 'UNKNOWN_ENUM' }));
    expect(() => parsePresentationScenarioResult({
      ...response,
      baseline: { ...response.baseline, revenue: null },
    })).toThrowError(expect.objectContaining({ code: 'NON_FINITE' }));
    expect(() => parsePresentationScenarioResult({
      ...response,
      scenarioName: 'x'.repeat(PRESENTATION_SCENARIO_MAX_RESULT_BYTES),
    })).toThrowError(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
  });

  it('rejeita UUID inválido em alavanca serializada e pontos de sensibilidade incompletos', () => {
    const withCategory = build({
      ...createEmptyPresentationScenarioDraft(),
      categoryLevers: [{ categoryId: EXPENSE_ID, adjustment: { mode: 'absolute', value: '10,00' } }],
    });
    expect(() => parsePresentationScenarioResult({
      ...withCategory,
      activeLevers: withCategory.activeLevers.map(lever => ({ ...lever, categoryId: 'uuid-inválido' })),
    })).toThrowError(expect.objectContaining({ code: 'INVALID_UUID' }));

    const withSensitivity = build({
      ...createEmptyPresentationScenarioDraft(),
      totalRevenue: { mode: 'absolute', value: '100,00' },
      sensitivity: {
        leverId: 'revenue-total',
        minValue: '0,00',
        maxValue: '200,00',
        stepValue: '100,00',
      },
    });
    if (withSensitivity.sensitivity.state !== 'available') throw new Error('Fixture sem sensibilidade');
    const sensitivity = withSensitivity.sensitivity;
    expect(() => parsePresentationScenarioResult({
      ...withSensitivity,
      sensitivity: {
        ...sensitivity,
        points: sensitivity.points.map((point, index) => (
          index === 0 ? { ...point, result: null } : point
        )),
      },
    })).toThrowError(expect.objectContaining({ code: 'NON_FINITE' }));
  });
});

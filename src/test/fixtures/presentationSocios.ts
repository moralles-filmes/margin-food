import {
  calculatePresentationDeltas,
  type PresentationPlanData,
} from '@/domain/financeiro/presentation';
import {
  attachPresentationResults,
  type PresentationAnalyticsSnapshot,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';

const currentMetrics = { revenue: 1_200, expense: 700, result: 500, marginPercent: 41.6667 };
const zeroMetrics = { revenue: 0, expense: 0, result: 0, marginPercent: 0 };

export function createPresentationSnapshot(): PresentationAnalyticsSnapshot {
  return {
    metrics: {
      managerialResult: currentMetrics,
      openItems: {
        accountsPayableOpen: { amount: 320, count: 2 },
        accountsReceivableOpen: { amount: 540, count: 3 },
      },
    },
    deltas: calculatePresentationDeltas(currentMetrics, zeroMetrics),
    timeSeries: {
      granularity: 'month',
      points: [
        {
          key: '2026-03',
          label: 'Março/2026',
          start: '2026-03-01',
          endExclusive: '2026-04-01',
          metrics: currentMetrics,
        },
      ],
    },
    categoryComposition: {
      operational: {
        revenue: [
          {
            categoryId: 'receitas',
            parentCategoryId: null,
            name: 'Receitas operacionais',
            nature: 'RECEITA',
            directAmount: 1_000,
            amount: 1_000,
            sharePercent: 83.3333,
            children: [],
          },
          {
            categoryId: null,
            parentCategoryId: null,
            name: 'Sem categoria — Receitas',
            nature: 'RECEITA',
            directAmount: 200,
            amount: 200,
            sharePercent: 16.6667,
            children: [],
          },
        ],
        expense: [
          {
            categoryId: 'despesas',
            parentCategoryId: null,
            name: 'Despesas operacionais',
            nature: 'DESPESA',
            directAmount: 0,
            amount: 650,
            sharePercent: 92.8571,
            children: [
              {
                categoryId: 'insumos',
                parentCategoryId: 'despesas',
                name: 'Insumos',
                nature: 'DESPESA',
                directAmount: 650,
                amount: 650,
                sharePercent: 92.8571,
                children: [],
              },
            ],
          },
          {
            categoryId: null,
            parentCategoryId: null,
            name: 'Sem categoria — Despesas',
            nature: 'DESPESA',
            directAmount: 50,
            amount: 50,
            sharePercent: 7.1429,
            children: [],
          },
        ],
      },
      nonOperational: {
        revenue: [
          {
            categoryId: 'receitas-nao-operacionais',
            parentCategoryId: null,
            name: 'Receitas não operacionais',
            nature: 'RECEITA',
            directAmount: 80,
            amount: 80,
            sharePercent: 80,
            children: [],
          },
          {
            categoryId: null,
            parentCategoryId: null,
            name: 'Sem categoria — Receitas',
            nature: 'RECEITA',
            directAmount: 20,
            amount: 20,
            sharePercent: 20,
            children: [],
          },
        ],
        expense: [],
      },
    },
    rankings: {
      topRevenueCategories: [
        { rank: 1, categoryId: 'receitas', label: 'Receitas operacionais', amount: 1_000, sharePercent: 83.3333 },
        { rank: 2, categoryId: null, label: 'Sem categoria — Receitas', amount: 200, sharePercent: 16.6667 },
      ],
      topExpenseCategories: [
        { rank: 1, categoryId: 'insumos', label: 'Insumos', amount: 650, sharePercent: 92.8571 },
        { rank: 2, categoryId: null, label: 'Sem categoria — Despesas', amount: 50, sharePercent: 7.1429 },
      ],
    },
    highlights: [],
    nonOperationalTotals: { revenue: 100, expense: 0, result: 100 },
  };
}

export function createPresentationPlanData(
  overrides: Partial<PresentationPlanData> = {},
): PresentationPlanData {
  const plan: PresentationPlanData = {
    contractVersion: '1.0',
    generatedAt: '2026-08-25T15:30:00-03:00',
    range: { start: '2026-03-01', endExclusive: '2026-04-01' },
    sources: {
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    },
    rules: {
      regime: 'competencia',
      budgetProration: 'valor mensal proporcional aos dias do intervalo',
      hierarchyPrecedence: 'orçamento mais específico prevalece sobre o ancestral',
      projectionFormula: 'realizado até o corte / dias observados * dias totais',
      openItemsIncluded: false,
    },
    actual: {
      revenue: 1_200,
      expense: 700,
      result: 500,
      marginPercent: 41.6667,
      cmv: 280,
      cmvPercent: 23.3333,
    },
    budget: {
      revenue: 1_100,
      expense: 650,
      result: 450,
      marginPercent: 40.9091,
      cmv: 260,
      cmvPercent: 23.6364,
      cmvTargetPercent: 25,
      cmvTargetState: 'available',
    },
    coverage: {
      revenue: { configured: true, complete: true, actualCovered: 1_200, actualTotal: 1_200 },
      expense: { configured: true, complete: true, actualCovered: 700, actualTotal: 700 },
      cmv: { configured: true, complete: true, actualCovered: 280, actualTotal: 280 },
    },
    projection: {
      state: 'available',
      cutoffDate: '2026-03-20',
      sampleDays: 20,
      totalDays: 31,
      factor: 1.55,
      metrics: {
        revenue: 1_860,
        expense: 1_085,
        result: 775,
        marginPercent: 41.6667,
        cmv: 434,
        cmvPercent: 23.3333,
      },
    },
    series: [
      {
        key: '2026-03',
        start: '2026-03-01',
        endExclusive: '2026-04-01',
        actual: {
          revenue: 1_200,
          expense: 700,
          result: 500,
          marginPercent: 41.6667,
          cmv: 280,
          cmvPercent: 23.3333,
        },
        budget: {
          revenue: 1_100,
          expense: 650,
          result: 450,
          marginPercent: 40.9091,
          cmv: 260,
          cmvPercent: 23.6364,
        },
      },
    ],
    categories: {
      page: 1,
      pageSize: 25,
      totalCount: 2,
      hasMore: false,
      items: [
        {
          categoryId: 'receitas',
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
          categoryId: 'insumos',
          parentCategoryId: 'despesas',
          name: 'Insumos',
          nature: 'DESPESA',
          effectiveGroup: 'cmv',
          depth: 1,
          directActual: 280,
          actualAmount: 280,
          directBudget: 260,
          budgetAmount: 260,
          actualCoveredAmount: 280,
          budgetConfigured: true,
          coverageComplete: true,
          varianceAmount: 20,
          variancePercent: 7.6923,
          revenueSharePercent: 23.3333,
          resultSharePercent: 56,
        },
      ],
    },
    variations: {
      favorable: [{
        categoryId: 'receitas',
        name: 'Receitas operacionais',
        nature: 'RECEITA',
        actualAmount: 1_200,
        budgetAmount: 1_100,
        varianceAmount: 100,
        variancePercent: 9.0909,
      }],
      unfavorable: [{
        categoryId: 'insumos',
        name: 'Insumos',
        nature: 'DESPESA',
        actualAmount: 280,
        budgetAmount: 260,
        varianceAmount: 20,
        variancePercent: 7.6923,
      }],
    },
    hierarchyConflictCount: 0,
  };
  return { ...plan, ...overrides };
}

export function createPresentationSociosData(
  currentState: 'available' | 'empty' | 'unavailable' | 'error' = 'available',
): PresentationSociosData {
  const snapshot = createPresentationSnapshot();
  const current = currentState === 'available'
    ? { state: 'available' as const, data: snapshot, fetchedAt: '2026-08-25T15:30:00-03:00' }
    : currentState === 'empty'
      ? {
          state: 'empty' as const,
          data: {
            ...snapshot,
            metrics: {
              managerialResult: zeroMetrics,
              openItems: {
                accountsPayableOpen: { amount: 0, count: 0 },
                accountsReceivableOpen: { amount: 0, count: 0 },
              },
            },
            timeSeries: { granularity: 'month' as const, points: [] },
            categoryComposition: {
              operational: { revenue: [], expense: [] },
              nonOperational: { revenue: [], expense: [] },
            },
            rankings: { topRevenueCategories: [], topExpenseCategories: [] },
            nonOperationalTotals: { revenue: 0, expense: 0, result: 0 },
          },
          fetchedAt: '2026-08-25T15:30:00-03:00',
        }
      : currentState === 'unavailable'
        ? { state: 'unavailable' as const, reason: 'outside-available-period' as const }
        : { state: 'error' as const, message: 'Falha controlada.' };

  const base: PresentationSociosData = {
    contractVersion: '1.0',
    generatedAt: '2026-08-25T15:30:00-03:00',
    filter: { kind: 'month', month: '2026-03' },
    period: {
      filterKind: 'month',
      start: '2026-03-01',
      endExclusive: '2026-04-01',
      isCompleteCalendarPeriod: true,
    },
    periodLabel: 'Março de 2026',
    availableBounds: { minDate: '2025-01-01', maxDate: '2026-08-25' },
    current,
    comparisons: {
      previousPeriod: {
        definition: {
          kind: 'previous-period',
          range: { start: '2026-02-01', endExclusive: '2026-03-01' },
          alignment: 'calendar-month',
          availability: { state: 'available' },
        },
        snapshot: { state: 'empty', data: { ...snapshot, metrics: { ...snapshot.metrics, managerialResult: zeroMetrics } } },
      },
      previousYear: {
        definition: {
          kind: 'previous-year',
          range: { start: '2025-03-01', endExclusive: '2025-04-01' },
          alignment: 'aligned-calendar-year',
          availability: { state: 'unavailable', reason: 'outside-available-period' },
        },
        snapshot: { state: 'unavailable', reason: 'outside-available-period' },
      },
    },
    slides: [],
  };

  return attachPresentationResults(base);
}

import { describe, expect, it } from 'vitest';
import {
  buildPresentationComparisons,
  normalizePresentationPeriod,
  type PresentationPeriodFilter,
} from '@/domain/financeiro/presentation';
import {
  PresentationPayloadError,
  adaptPresentationSociosPayload,
  createSafePresentationPayloadDiagnostic,
  type PresentationAdapterContext,
} from './financeiroPresentationAdapter';

function context(filter: PresentationPeriodFilter = { kind: 'month', month: '2026-03' }): PresentationAdapterContext {
  const period = normalizePresentationPeriod(filter, {
    availableBounds: filter.kind === 'all-time'
      ? { minDate: '2025-01-01', maxDate: '2026-12-31' }
      : undefined,
  });
  const comparisons = buildPresentationComparisons(filter, period);
  return {
    filter,
    period,
    previousPeriod: comparisons.previousPeriod.range,
    previousYear: comparisons.previousYear.range,
    granularity: 'month',
    rankingLimit: 10,
  };
}

const definitions = [
  {
    id: 'revenue-root', parentId: null, name: 'Receitas operacionais', nature: 'RECEITA',
    excludedFromTotals: false, order: 1, depth: 0, path: ['revenue-root'],
  },
  {
    id: 'expense-root', parentId: null, name: 'Despesas operacionais', nature: 'DESPESA',
    excludedFromTotals: false, order: 2, depth: 0, path: ['expense-root'],
  },
  {
    id: 'expense-child', parentId: 'expense-root', name: 'Insumos', nature: 'DESPESA',
    excludedFromTotals: false, order: 1, depth: 1, path: ['expense-root', 'expense-child'],
  },
  {
    id: 'non-op-root', parentId: null, name: 'Receitas não operacionais', nature: 'RECEITA',
    excludedFromTotals: true, order: 9, depth: 0, path: ['non-op-root'],
  },
];

function categoryNode(overrides: Record<string, unknown> = {}) {
  return {
    categoryId: 'revenue-root',
    parentCategoryId: null,
    name: 'Receitas operacionais',
    nature: 'RECEITA',
    order: 1,
    depth: 0,
    path: ['revenue-root'],
    directAmount: 100,
    amount: 100,
    sharePercent: 100,
    ...overrides,
  };
}

function emptyComposition() {
  return {
    operational: { revenue: [], expense: [] },
    nonOperational: { revenue: [], expense: [] },
  };
}

function snapshot(range: { start: string; endExclusive: string }, empty = false) {
  return {
    range,
    metrics: {
      managerialResult: empty
        ? { revenue: 0, expense: 0, result: 0, marginPercent: 0 }
        : { revenue: 100, expense: 100, result: 0, marginPercent: 0 },
      openItems: {
        accountsPayableOpen: { amount: empty ? 0 : 75, count: empty ? 0 : 2 },
        accountsReceivableOpen: { amount: empty ? 0 : 125, count: empty ? 0 : 3 },
      },
    },
    timeSeries: {
      granularity: 'month',
      points: [{
        key: range.start.slice(0, 7),
        label: range.start.slice(0, 7),
        start: range.start,
        endExclusive: range.endExclusive,
        metrics: empty
          ? { revenue: 0, expense: 0, result: 0, marginPercent: 0 }
          : { revenue: 100, expense: 100, result: 0, marginPercent: 0 },
      }],
    },
    categoryComposition: empty ? emptyComposition() : {
      operational: {
        revenue: [categoryNode()],
        expense: [
          categoryNode({
            categoryId: 'expense-root', name: 'Despesas operacionais', nature: 'DESPESA', order: 2,
            path: ['expense-root'], directAmount: 0, amount: 60, sharePercent: 60,
          }),
          categoryNode({
            categoryId: 'expense-child', parentCategoryId: 'expense-root', name: 'Insumos', nature: 'DESPESA',
            order: 1, depth: 1, path: ['expense-root', 'expense-child'], directAmount: 60, amount: 60, sharePercent: 60,
          }),
          categoryNode({
            categoryId: null, parentCategoryId: null, name: 'Sem categoria — Despesas', nature: 'DESPESA',
            order: 2147483647, depth: 0, path: [], directAmount: 40, amount: 40, sharePercent: 40,
          }),
        ],
      },
      nonOperational: {
        revenue: [categoryNode({
          categoryId: 'non-op-root', name: 'Receitas não operacionais', order: 9,
          path: ['non-op-root'], directAmount: 20, amount: 20, sharePercent: 100,
        })],
        expense: [],
      },
    },
    rankings: empty ? { topRevenueCategories: [], topExpenseCategories: [] } : {
      topRevenueCategories: [
        { rank: 1, categoryId: 'revenue-root', label: 'Receitas operacionais', amount: 100, sharePercent: 100 },
      ],
      topExpenseCategories: [
        { rank: 1, categoryId: 'expense-child', label: 'Insumos', amount: 60, sharePercent: 60 },
        { rank: 2, categoryId: null, label: 'Sem categoria — Despesas', amount: 40, sharePercent: 40 },
      ],
    },
    nonOperationalTotals: empty
      ? { revenue: 0, expense: 0, result: 0 }
      : { revenue: 20, expense: 0, result: 20 },
  };
}

function payload(adapterContext: PresentationAdapterContext, empty = false) {
  return {
    contractVersion: '1.0',
    generatedAt: '2026-08-25T12:00:00+00:00',
    availableBounds: empty ? null : { minDate: '2025-01-01', maxDate: '2026-12-31' },
    categoryDefinitions: definitions,
    current: snapshot(adapterContext.period, empty),
    previousPeriod: snapshot(adapterContext.previousPeriod, true),
    previousYear: snapshot(adapterContext.previousYear, true),
  };
}

describe('adapter da RPC get_fin_presentation_socios', () => {
  it('monta a hierarquia pela estrutura do backend sem somar pai e filho novamente', () => {
    const adapterContext = context();
    const data = adaptPresentationSociosPayload(payload(adapterContext), adapterContext);
    expect(data.current.state).toBe('available');
    if (data.current.state !== 'available') return;

    const expenses = data.current.data.categoryComposition.operational.expense;
    expect(expenses.map(node => node.name)).toEqual(['Despesas operacionais', 'Sem categoria — Despesas']);
    expect(expenses[0]).toMatchObject({ directAmount: 0, amount: 60 });
    expect(expenses[0].children).toHaveLength(1);
    expect(expenses[0].children[0]).toMatchObject({ name: 'Insumos', directAmount: 60, amount: 60 });
    expect(expenses[1]).toMatchObject({ categoryId: null, amount: 40 });
  });

  it('mantém não operacional fora da composição operacional e preserva os totais da RPC', () => {
    const adapterContext = context();
    const data = adaptPresentationSociosPayload(payload(adapterContext), adapterContext);
    if (data.current.state !== 'available') throw new Error('snapshot deveria estar disponível');

    expect(data.current.data.categoryComposition.operational.revenue.map(node => node.categoryId))
      .toEqual(['revenue-root']);
    expect(data.current.data.categoryComposition.nonOperational.revenue[0])
      .toMatchObject({ categoryId: 'non-op-root', amount: 20 });
    expect(data.current.data.nonOperationalTotals).toEqual({ revenue: 20, expense: 0, result: 20 });
  });

  it('trata base zero como variação indisponível sem Infinity ou NaN', () => {
    const adapterContext = context();
    const data = adaptPresentationSociosPayload(payload(adapterContext), adapterContext);
    if (data.current.state !== 'available') throw new Error('snapshot deveria estar disponível');

    expect(data.current.data.deltas?.revenue).toMatchObject({
      state: 'unavailable', reason: 'zero-baseline', value: null,
    });
    expect(JSON.stringify(data)).not.toMatch(/Infinity|NaN/);
  });

  it('representa um retorno válido sem movimentos como empty', () => {
    const adapterContext = context();
    const data = adaptPresentationSociosPayload(payload(adapterContext, true), adapterContext);
    expect(data.availableBounds).toBeUndefined();
    expect(data.current.state).toBe('empty');
  });

  it('marca comparações fora de availableBounds como indisponíveis', () => {
    const adapterContext = context();
    const raw = payload(adapterContext);
    raw.availableBounds = { minDate: '2026-03-01', maxDate: '2026-03-31' };
    const data = adaptPresentationSociosPayload(raw, adapterContext);

    expect(data.comparisons.previousPeriod.snapshot).toEqual({
      state: 'unavailable', reason: 'outside-available-period',
    });
    expect(data.comparisons.previousYear.snapshot).toEqual({
      state: 'unavailable', reason: 'outside-available-period',
    });
  });

  it('rejeita payload malformado sem cast amplo ou coerção silenciosa', () => {
    const adapterContext = context();
    const raw = payload(adapterContext);
    raw.current.metrics.managerialResult.revenue = Number.POSITIVE_INFINITY;

    expect(() => adaptPresentationSociosPayload(raw, adapterContext)).toThrow(PresentationPayloadError);
  });

  it('promove a raiz canônica quando o parentId persistido pertence a outra natureza', () => {
    const adapterContext = context();
    const raw = payload(adapterContext);
    raw.categoryDefinitions.push({
      id: 'expense-promoted-root',
      parentId: 'revenue-root',
      name: 'Despesa promovida a raiz',
      nature: 'DESPESA',
      excludedFromTotals: false,
      order: 3,
      depth: 0,
      path: ['expense-promoted-root'],
    });
    raw.current.categoryComposition.operational.expense.push(categoryNode({
      categoryId: 'expense-promoted-root',
      parentCategoryId: 'revenue-root',
      name: 'Despesa promovida a raiz',
      nature: 'DESPESA',
      order: 3,
      depth: 0,
      path: ['expense-promoted-root'],
      directAmount: 25,
      amount: 25,
      sharePercent: 25,
    }));

    const data = adaptPresentationSociosPayload(raw, adapterContext);
    if (data.current.state !== 'available') throw new Error('snapshot deveria estar disponível');

    expect(data.current.data.categoryComposition.operational.expense).toEqual(expect.arrayContaining([
      expect.objectContaining({
        categoryId: 'expense-promoted-root',
        parentCategoryId: null,
        amount: 25,
      }),
    ]));
  });

  it('gera diagnóstico estrutural sem registrar valores sensíveis do payload', () => {
    const adapterContext = context();
    const raw = payload(adapterContext);
    raw.categoryDefinitions[0].parentId = 'sensitive-parent-id';
    raw.categoryDefinitions[0].depth = 1;

    let error: PresentationPayloadError | undefined;
    try {
      adaptPresentationSociosPayload(raw, adapterContext);
    } catch (caught) {
      if (caught instanceof PresentationPayloadError) error = caught;
    }
    if (!error) throw new Error('adapter deveria rejeitar o payload');

    const diagnostic = createSafePresentationPayloadDiagnostic(raw, error);
    expect(diagnostic).toMatchObject({
      error: {
        name: 'PresentationPayloadError',
        path: 'categoryDefinitions[0].path',
      },
      payload: {
        type: 'object',
        categoryDefinitionCount: definitions.length,
      },
    });
    expect(JSON.stringify(diagnostic)).not.toContain('sensitive-parent-id');
    expect(JSON.stringify(diagnostic)).not.toContain('Receitas operacionais');
    expect(JSON.stringify(diagnostic)).not.toContain('2026-08-25T12:00:00+00:00');
  });
});

import { describe, expect, it } from 'vitest';
import type {
  DeterministicHighlight,
  ManagerialLedgerEntry,
  PresentationCategoryDefinition,
} from './contracts';
import { buildCategoryComposition, resolveManagerialCategoryAmounts } from './categories';
import { sortDeterministicHighlights } from './highlights';

function entry(overrides: Partial<ManagerialLedgerEntry> = {}): ManagerialLedgerEntry {
  return {
    id: 'expense-1',
    type: 'DESPESA',
    status: 'REALIZADO',
    amount: 100,
    competenceDate: '2026-03-15',
    origin: 'manual',
    reconciled: false,
    excludedFromReports: false,
    categoryId: 'parent-category',
    allocations: null,
    ...overrides,
  };
}

describe('categorias da apresentação', () => {
  it('faz o rateio prevalecer integralmente sobre a categoria do lançamento', () => {
    const resolved = resolveManagerialCategoryAmounts(entry({
      allocations: [
        { categoryId: 'child-a', amount: 60 },
        { categoryId: 'child-b', amount: 40 },
      ],
    }));

    expect(resolved).toEqual([
      expect.objectContaining({ categoryId: 'child-a', amount: 60, source: 'allocation' }),
      expect.objectContaining({ categoryId: 'child-b', amount: 40, source: 'allocation' }),
    ]);
    expect(resolved.some(item => item.categoryId === 'parent-category')).toBe(false);
  });

  it('usa a categoria do lançamento somente quando não existe rateio', () => {
    expect(resolveManagerialCategoryAmounts(entry())).toEqual([
      expect.objectContaining({ categoryId: 'parent-category', amount: 100, source: 'entry-category' }),
    ]);
  });

  it('mantém a hierarquia pai/filho e separa não operacionais', () => {
    const definitions: PresentationCategoryDefinition[] = [
      { id: 'root', parentId: null, name: 'Despesas Operacionais', nature: 'DESPESA', excludedFromTotals: false, order: 1 },
      { id: 'child-a', parentId: 'root', name: 'Alimentos', nature: 'DESPESA', excludedFromTotals: false, order: 1 },
      { id: 'child-b', parentId: 'root', name: 'Bebidas', nature: 'DESPESA', excludedFromTotals: false, order: 2 },
      { id: 'non-op', parentId: null, name: 'Despesas não operacionais', nature: 'DESPESA', excludedFromTotals: true, order: 99 },
    ];
    const operational = resolveManagerialCategoryAmounts(entry({
      allocations: [
        { categoryId: 'child-a', amount: 60 },
        { categoryId: 'child-b', amount: 40 },
      ],
    }));
    const nonOperational = resolveManagerialCategoryAmounts(entry({
      id: 'expense-non-op',
      categoryId: 'non-op',
      amount: 25,
      excludedFromReports: true,
    }));

    const composition = buildCategoryComposition([...operational, ...nonOperational], definitions);

    expect(composition.operational.expense[0]).toMatchObject({
      categoryId: 'root',
      directAmount: 0,
      amount: 100,
      sharePercent: 100,
      children: [
        { categoryId: 'child-a', amount: 60 },
        { categoryId: 'child-b', amount: 40 },
      ],
    });
    expect(composition.nonOperational.expense[0]).toMatchObject({ categoryId: 'non-op', amount: 25 });
  });
});

describe('destaques determinísticos', () => {
  it('ordena por prioridade, regra contratual e id', () => {
    const highlights: DeterministicHighlight[] = [
      { id: 'z', rule: 'margin', priority: 1, tone: 'positive', value: 10 },
      { id: 'b', rule: 'managerial-result', priority: 1, tone: 'positive', value: 100 },
      { id: 'a', rule: 'managerial-result', priority: 1, tone: 'positive', value: 100 },
      { id: 'first', rule: 'open-payables', priority: 0, tone: 'warning', value: 50 },
    ];

    expect(sortDeterministicHighlights(highlights).map(item => item.id)).toEqual([
      'first',
      'a',
      'b',
      'z',
    ]);
  });
});

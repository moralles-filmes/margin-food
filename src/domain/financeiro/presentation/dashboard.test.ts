import { describe, expect, it } from 'vitest';
import {
  buildPresentationDashboardInsights,
  calculatePresentationGroupMetric,
  filterPresentationCategoriesByGroup,
  PRESENTATION_DETAILED_GROUPS,
  summarizeExpenseOutsideGroups,
  type PresentationCategoryMetadataMap,
} from './dashboard';
import type { CategoryCompositionNode } from './contracts';
import { createPresentationSnapshot } from '@/test/fixtures/presentationSocios';

function expenseNode(
  categoryId: string | null,
  name: string,
  directAmount: number,
  children: CategoryCompositionNode[] = [],
): CategoryCompositionNode {
  const amount = directAmount + children.reduce((sum, child) => sum + child.amount, 0);
  return {
    categoryId,
    parentCategoryId: null,
    name,
    nature: 'DESPESA',
    directAmount,
    amount,
    sharePercent: 0,
    children,
  };
}

const metadata: PresentationCategoryMetadataMap = {
  despesas: { group: null },
  insumos: { group: 'cmv' },
};

describe('modelo do dashboard executivo', () => {
  it('calcula CMV pelos metadados configuráveis sem somar acumulado de pai e filho', () => {
    const metric = calculatePresentationGroupMetric(createPresentationSnapshot(), metadata, 'cmv');

    expect(metric.amount).toBe(650);
    expect(metric.revenueSharePercent).toBeCloseTo(54.1667, 4);
  });

  it('herda o grupo do pai e promove apenas a árvore semanticamente relacionada', () => {
    const snapshot = createPresentationSnapshot();
    const expenseRoot = snapshot.categoryComposition.operational.expense[0];
    const inheritedMetadata: PresentationCategoryMetadataMap = {
      despesas: { group: 'cmv' },
      insumos: { group: null },
    };

    const filtered = filterPresentationCategoriesByGroup(
      snapshot.categoryComposition.operational.expense,
      inheritedMetadata,
      'cmv',
    );

    expect(filtered).toHaveLength(1);
    expect(filtered[0].categoryId).toBe(expenseRoot.categoryId);
    expect(filtered[0].children[0].categoryId).toBe('insumos');
  });

  it('gera insights auditáveis a partir dos números existentes', () => {
    const snapshot = createPresentationSnapshot();
    const cmv = calculatePresentationGroupMetric(snapshot, metadata, 'cmv');
    const insights = buildPresentationDashboardInsights(snapshot, cmv);

    expect(insights.map(item => item.id)).toEqual([
      'positive-result',
      'cmv-share',
      'expense-concentration',
      'open-payables',
    ]);
    expect(insights[1].description).toContain('54,2%');
  });

  it('soma a despesa que nenhum detalhamento mostra, respeitando a herança do grupo', () => {
    const nodes = [
      expenseNode('royal', 'ROYAL PARMA', 0, [
        expenseNode('royal-cmv', 'CMV', 0, [expenseNode('mignon', 'MIGNOM', 300.105)]),
        expenseNode('royal-pessoal', 'PESSOAL', 40, [expenseNode('salarios', 'SALARIOS', 120)]),
      ]),
      expenseNode('financiamentos', 'FINANCIAMENTOS', 0, [expenseNode('emprestimos', 'EMPRESTIMOS', 80)]),
      expenseNode('cmv-loja', 'CMV loja', 500),
      expenseNode(null, 'Sem categoria — Despesas', 10),
    ];
    const groups: PresentationCategoryMetadataMap = {
      'royal-cmv': { group: 'CMV' },
      'cmv-loja': { group: 'cmv' },
      financiamentos: { group: 'empréstimo' },
    };

    const outside = summarizeExpenseOutsideGroups(nodes, groups, PRESENTATION_DETAILED_GROUPS);

    expect(outside.amount).toBe(250);
    expect(outside.categories).toEqual([
      { categoryId: 'salarios', path: ['ROYAL PARMA', 'PESSOAL', 'SALARIOS'], group: null, amount: 120 },
      { categoryId: 'emprestimos', path: ['FINANCIAMENTOS', 'EMPRESTIMOS'], group: 'empréstimo', amount: 80 },
      { categoryId: 'royal-pessoal', path: ['ROYAL PARMA', 'PESSOAL'], group: null, amount: 40 },
      { categoryId: null, path: ['Sem categoria — Despesas'], group: null, amount: 10 },
    ]);
  });

  it('não aponta nada quando toda despesa tem grupo com detalhamento', () => {
    const nodes = [expenseNode('pessoal', 'Pessoal', 0, [expenseNode('salarios', 'Salários', 900)])];
    const outside = summarizeExpenseOutsideGroups(
      nodes,
      { pessoal: { group: 'pessoal' } },
      PRESENTATION_DETAILED_GROUPS,
    );

    expect(outside).toEqual({ amount: 0, categories: [] });
  });
});

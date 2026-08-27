import { describe, expect, it } from 'vitest';
import {
  buildPresentationDashboardInsights,
  calculatePresentationGroupMetric,
  filterPresentationCategoriesByGroup,
  type PresentationCategoryMetadataMap,
} from './dashboard';
import { createPresentationSnapshot } from '@/test/fixtures/presentationSocios';

const metadata: PresentationCategoryMetadataMap = {
  despesas: { group: null, dreLine: 'Despesas Operacionais' },
  insumos: { group: 'cmv', dreLine: 'CMV' },
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
      despesas: { group: 'cmv', dreLine: 'CMV' },
      insumos: { group: null, dreLine: null },
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
});

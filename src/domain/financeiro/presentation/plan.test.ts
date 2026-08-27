import { describe, expect, it } from 'vitest';
import {
  buildPresentationPlanIndicators,
  presentationPlanActualMatches,
  presentationPlanHasConfiguredTarget,
  selectedPresentationPlanValue,
} from '@/domain/financeiro/presentation/plan';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

describe('comparação executiva de metas, orçamento e projeção', () => {
  it('classifica receita acima da meta como favorável e despesa acima como desfavorável', () => {
    const indicators = buildPresentationPlanIndicators(createPresentationPlanData());
    expect(indicators.find(item => item.key === 'revenue')).toMatchObject({
      deviation: 100,
      status: 'favorable',
    });
    expect(indicators.find(item => item.key === 'expense')).toMatchObject({
      deviation: 50,
      status: 'unfavorable',
    });
  });

  it('calcula desvio de margem em pontos percentuais', () => {
    const margin = buildPresentationPlanIndicators(createPresentationPlanData())
      .find(item => item.key === 'margin');
    expect(margin?.deviationUnit).toBe('percentage-points');
    expect(margin?.deviation).toBeCloseTo(0.7576, 3);
  });

  it('não inventa meta quando orçamento e meta de CMV não estão configurados', () => {
    const base = createPresentationPlanData();
    const plan = createPresentationPlanData({
      budget: {
        ...base.budget,
        revenue: null,
        expense: null,
        result: null,
        marginPercent: null,
        cmv: null,
        cmvPercent: null,
        cmvTargetPercent: null,
        cmvTargetState: 'not-configured',
      },
      coverage: {
        revenue: { configured: false, complete: false, actualCovered: 0, actualTotal: 1_200 },
        expense: { configured: false, complete: false, actualCovered: 0, actualTotal: 700 },
        cmv: { configured: false, complete: false, actualCovered: 0, actualTotal: 280 },
      },
    });

    expect(presentationPlanHasConfiguredTarget(plan)).toBe(false);
    expect(buildPresentationPlanIndicators(plan).every(item => item.status === 'not-configured')).toBe(true);
  });

  it('não trata uma meta de CMV parcial como meta confiável para criar slide', () => {
    const base = createPresentationPlanData();
    const plan = createPresentationPlanData({
      budget: {
        ...base.budget,
        revenue: null,
        expense: null,
        result: null,
        marginPercent: null,
        cmv: null,
        cmvPercent: null,
        cmvTargetPercent: null,
        cmvTargetState: 'partial',
      },
      coverage: {
        revenue: { configured: false, complete: false, actualCovered: 0, actualTotal: 1_200 },
        expense: { configured: false, complete: false, actualCovered: 0, actualTotal: 700 },
        cmv: { configured: false, complete: false, actualCovered: 0, actualTotal: 280 },
      },
    });

    expect(presentationPlanHasConfiguredTarget(plan)).toBe(false);
  });

  it('mantém divisão por zero e projeção insuficiente como indisponíveis, sem NaN ou Infinity', () => {
    const base = createPresentationPlanData();
    const plan = createPresentationPlanData({
      actual: { ...base.actual, revenue: 0, result: -700, marginPercent: null },
      projection: {
        state: 'insufficient-sample',
        cutoffDate: '2026-03-03',
        sampleDays: 3,
        totalDays: 31,
        factor: null,
        metrics: null,
      },
    });
    const indicators = buildPresentationPlanIndicators(plan);
    const serialized = JSON.stringify(indicators);

    expect(indicators.find(item => item.key === 'margin')?.actual).toBeNull();
    expect(selectedPresentationPlanValue(indicators[0], 'projection')).toBeNull();
    expect(serialized).not.toMatch(/NaN|Infinity/);
  });

  it('detecta qualquer divergência entre o realizado do plano e a fonte canônica', () => {
    const plan = createPresentationPlanData();
    expect(presentationPlanActualMatches(plan, { revenue: 1_200, expense: 700, result: 500 })).toBe(true);
    expect(presentationPlanActualMatches(plan, { revenue: 1_201, expense: 700, result: 501 })).toBe(false);
  });
});

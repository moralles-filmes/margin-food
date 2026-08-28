import { describe, expect, it } from 'vitest';
import {
  attachPresentationDecision,
  attachPresentationExpenses,
  attachPresentationInsights,
  attachPresentationPlan,
  attachPresentationResults,
  attachPresentationRevenue,
} from '@/lib/financeiroPresentationAdapter';
import {
  buildPresentationSlides,
  isPresentationSlideExportable,
} from '@/lib/presentationSlides';
import {
  formatMetricDelta,
  presentationFilename,
} from '@/lib/presentationFormatting';
import {
  createPresentationPlanData,
  createPresentationSnapshot,
  createPresentationSociosData,
} from '@/test/fixtures/presentationSocios';
import { createPresentationDecisionDetail } from '@/test/fixtures/presentationDecision';
import { createPresentationRevenueData } from '@/test/fixtures/presentationRevenue';
import { createPresentationExpensesData } from '@/test/fixtures/presentationExpenses';
import { createPresentationWithInsights } from '@/test/fixtures/presentationInsights';

describe('composição determinística da Apresentação Sócios', () => {
  it('mantém os quatro capítulos na ordem contratada e publica os cinco layouts de Resultados', () => {
    const data = createPresentationSociosData();

    expect(data.slides.map(slide => [slide.id, slide.chapter, slide.kind])).toEqual([
      ['chapter-revenue', 'revenue', 'chapter-foundation'],
      ['chapter-expenses', 'expenses', 'chapter-foundation'],
      ['chapter-results', 'results', 'results-summary'],
      ['results-comparison', 'results', 'results-comparison'],
      ['results-evolution-1', 'results', 'results-evolution'],
      ['results-bridge', 'results', 'results-bridge'],
      ['results-non-operational-1', 'results', 'results-non-operational'],
      ['chapter-insights', 'insights', 'chapter-foundation'],
    ]);
    expect(data.slides.map(slide => slide.order)).toEqual(
      Array.from({ length: data.slides.length }, (_, index) => index),
    );
    expect(data.slides.filter(slide => slide.kind === 'chapter-foundation').map(slide => ({
      chapter: slide.chapter,
      availability: slide.availability,
    }))).toEqual([
      { chapter: 'revenue', availability: { state: 'unavailable', reason: 'not-requested' } },
      { chapter: 'expenses', availability: { state: 'unavailable', reason: 'not-requested' } },
      { chapter: 'insights', availability: { state: 'unavailable', reason: 'not-requested' } },
    ]);
  });

  it('mantém Faturamento e Despesas em suas fontes canônicas sem alterar Resultados', () => {
    const revenue = createPresentationRevenueData();
    const expenses = createPresentationExpensesData();
    const withRevenue = attachPresentationRevenue(createPresentationSociosData(), {
      state: 'available', data: revenue, fetchedAt: revenue.generatedAt,
    });
    const data = attachPresentationInsights(
      attachPresentationExpenses(withRevenue, {
        state: 'available', data: expenses, fetchedAt: expenses.generatedAt,
      }),
    );

    expect(data.slides.filter(slide => slide.chapter === 'revenue').map(slide => slide.kind)).toEqual([
      'revenue-summary', 'revenue-weekdays', 'revenue-history',
    ]);
    expect(data.slides.filter(slide => slide.chapter === 'expenses').map(slide => slide.kind)).toEqual([
      'expenses-summary', 'expenses-tree', 'expenses-rolling', 'expenses-history',
    ]);
    expect(data.slides.filter(slide => slide.chapter === 'results').map(slide => slide.kind)).toEqual([
      'results-summary',
      'results-comparison',
      'results-evolution',
      'results-bridge',
      'results-non-operational',
    ]);
    expect(data.slides.filter(slide => slide.chapter === 'insights').map(slide => slide.kind))
      .toEqual(['insights']);
    expect(data.slides.every(isPresentationSlideExportable)).toBe(true);
  });

  it('pagina de três em três e conserva o ranking do contrato no registry único', () => {
    const data = createPresentationWithInsights();
    expect(data.insights?.state).toBe('available');
    if (data.insights?.state !== 'available') return;
    const insightSlides = data.slides.filter(slide => slide.kind === 'insights');

    expect(insightSlides.map(slide => slide.id)).toEqual([
      'chapter-insights',
      'chapter-insights-page-2',
    ]);
    expect(insightSlides.map(slide => (
      slide.availability.state === 'available' ? slide.availability.data.items.length : 0
    ))).toEqual([3, 2]);
    expect(insightSlides.flatMap(slide => (
      slide.availability.state === 'available'
      && slide.availability.data.type === 'insights'
        ? slide.availability.data.items.map(insight => insight.id)
        : []
    ))).toEqual(data.insights.data.insights.map(insight => insight.id));
    expect(data.slides.map(slide => slide.order)).toEqual(
      Array.from({ length: data.slides.length }, (_, index) => index),
    );
    expect(buildPresentationSlides(data)).toEqual(data.slides);
  });

  it('reduz a densidade por página quando Insights têm textos excepcionalmente longos', () => {
    const data = createPresentationWithInsights();
    expect(data.insights?.state).toBe('available');
    if (data.insights?.state !== 'available') return;
    const longInsights = data.insights.data.insights.map(insight => ({
      ...insight,
      description: `${insight.description} ${'Contexto descritivo preservado. '.repeat(45)}`,
    }));
    const slides = buildPresentationSlides({
      ...data,
      insights: {
        ...data.insights,
        data: { ...data.insights.data, insights: longInsights },
      },
      slides: [],
    }).filter(slide => slide.kind === 'insights');

    expect(slides).toHaveLength(longInsights.length);
    expect(slides.every(slide => (
      slide.availability.state === 'available'
      && slide.availability.data.type === 'insights'
      && slide.availability.data.items.length === 1
    ))).toBe(true);
  });

  it('preserva plano e governança fora do deck novo, sem misturá-los a Insights', () => {
    const base = createPresentationWithInsights();
    const withPlan = attachPresentationPlan(base, {
      state: 'available',
      data: createPresentationPlanData(),
      fetchedAt: '2026-08-25T15:30:00-03:00',
    });
    const detail = createPresentationDecisionDetail();
    const withDecision = attachPresentationDecision(withPlan, {
      state: 'available',
      data: {
        detail,
        comparison: { state: 'unavailable', reason: 'current-data-unavailable' },
      },
      fetchedAt: detail.fetchedAt,
    });

    expect(withDecision.plan?.state).toBe('available');
    expect(withDecision.decision?.state).toBe('available');
    expect(withDecision.slides.filter(slide => slide.chapter === 'insights')).toHaveLength(2);
    expect(withDecision.slides.some(slide => [
      'plan-comparison', 'scenario-impact', 'scenario-sensitivity',
      'decision-commitments', 'decision-follow-up',
    ].includes(slide.kind))).toBe(false);
  });

  it('mantém base zero explícita sem fabricar percentuais', () => {
    const data = createPresentationSociosData();
    expect(data.results?.state).toBe('available');
    if (data.results?.state !== 'available') return;

    expect(data.results.data.comparison.state).toBe('available');
    if (data.results.data.comparison.state !== 'available') return;
    expect(data.results.data.comparison.deltas.revenue).toMatchObject({
      state: 'unavailable',
      reason: 'zero-baseline',
      absoluteChange: 1_200,
    });
    expect(formatMetricDelta(data.results.data.comparison.deltas.revenue))
      .toBe('Base zero - indisponível');
    expect(JSON.stringify(data.slides)).not.toMatch(/Infinity|NaN/);
  });

  it('fecha a ponte determinística e trata o aumento de despesa como efeito econômico negativo', () => {
    const data = createPresentationSociosData();
    expect(data.results?.state).toBe('available');
    if (data.results?.state !== 'available' || data.results.data.bridge.state !== 'available') return;
    const bridge = data.results.data.bridge;

    expect(bridge).toMatchObject({
      previousResult: 0,
      revenueEffect: 1_200,
      expenseEffect: -700,
      totalChange: 500,
      currentResult: 500,
    });
    expect(bridge.previousResult + bridge.revenueEffect + bridge.expenseEffect)
      .toBe(bridge.currentResult);
    expect(bridge.steps.find(step => step.key === 'expense-effect')?.favorability)
      .toBe('unfavorable');
  });

  it('pagina a evolução preservando a granularidade e a ordem canônica', () => {
    const base = createPresentationSociosData();
    expect(base.current.state).toBe('available');
    if (base.current.state !== 'available') return;
    const snapshot = createPresentationSnapshot();
    const points = Array.from({ length: 25 }, (_, index) => ({
      ...snapshot.timeSeries.points[0],
      key: `2026-03-${String(index + 1).padStart(2, '0')}`,
      label: `Ponto ${index + 1}`,
    }));
    const data = attachPresentationResults({
      ...base,
      current: {
        ...base.current,
        data: { ...base.current.data, timeSeries: { granularity: 'day', points } },
      },
      slides: [],
    });
    const evolutionSlides = data.slides.filter(slide => slide.kind === 'results-evolution');

    expect(evolutionSlides).toHaveLength(3);
    const exportedKeys = evolutionSlides.flatMap(slide => (
      slide.availability.state === 'available'
      && slide.availability.data.type === 'results-evolution'
        ? slide.availability.data.timeSeries.points.map(point => point.key)
        : []
    ));
    expect(exportedKeys).toEqual(points.map(point => point.key));
  });

  it('omite o informativo não operacional quando não há valor nem composição', () => {
    const base = createPresentationSociosData();
    expect(base.current.state).toBe('available');
    if (base.current.state !== 'available') return;
    const data = attachPresentationResults({
      ...base,
      current: {
        ...base.current,
        data: {
          ...base.current.data,
          nonOperationalTotals: { revenue: 0, expense: 0, result: 0 },
          categoryComposition: {
            ...base.current.data.categoryComposition,
            nonOperational: { revenue: [], expense: [] },
          },
        },
      },
      slides: [],
    });

    expect(data.slides.some(slide => slide.kind === 'results-non-operational')).toBe(false);
  });

  it.each(['empty', 'unavailable', 'error'] as const)(
    'propaga o estado %s ao capítulo de Resultados e mantém Insights não solicitado',
    (state) => {
      const data = createPresentationSociosData(state);
      const results = data.slides.filter(slide => slide.chapter === 'results');
      expect(results.every(slide => slide.availability.state === state)).toBe(true);
      expect(data.slides.find(slide => slide.chapter === 'insights')?.availability)
        .toEqual({ state: 'unavailable', reason: 'not-requested' });
    },
  );

  it('exporta fundações não solicitadas, mas não indisponibilidades de dados nem erros', () => {
    const unavailable = createPresentationSociosData('unavailable');
    expect(unavailable.slides.filter(isPresentationSlideExportable).map(slide => slide.kind)).toEqual([
      'chapter-foundation',
      'chapter-foundation',
      'chapter-foundation',
    ]);
  });

  it('gera nomes seguros com período e data de geração no fuso de negócio', () => {
    const data = createPresentationSociosData();
    expect(presentationFilename(data, 'pdf')).toBe(
      'apresentacao-socios-2026-03-01-a-2026-03-31-gerado-2026-08-25.pdf',
    );
  });

  it('reconstrói sempre o mesmo registry a partir do mesmo payload', () => {
    const data = createPresentationSociosData();
    expect(buildPresentationSlides(data)).toEqual(data.slides);
  });
});

import { describe, expect, it, vi } from 'vitest';
import {
  attachPresentationPlan,
  attachPresentationDecision,
  attachPresentationScenario,
  type PresentationSociosData,
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
  createPresentationSnapshot,
  createPresentationPlanData,
  createPresentationSociosData,
} from '@/test/fixtures/presentationSocios';
import {
  createPresentationScenarioResult,
  createPresentationWithScenario,
} from '@/test/fixtures/presentationScenario';
import {
  createPresentationDecisionComparison,
  createPresentationDecisionDetail,
} from '@/test/fixtures/presentationDecision';

describe('composição determinística da Apresentação Sócios', () => {
  it('mantém a ordem narrativa contratada e ordens sequenciais', () => {
    const data = createPresentationSociosData();
    expect(data.slides.map(slide => slide.kind)).toEqual([
      'cover',
      'executive-summary',
      'time-series',
      'category-composition',
      'rankings',
      'open-items',
      'non-operational',
    ]);
    expect(data.slides.map(slide => slide.order)).toEqual([0, 1, 2, 3, 4, 5, 6]);
  });

  it('inclui um único slide de plano apenas quando existe meta canônica configurada', () => {
    const base = createPresentationSociosData();
    const withPlan = attachPresentationPlan(base, {
      state: 'available',
      data: createPresentationPlanData(),
      fetchedAt: '2026-08-25T15:30:00-03:00',
    });
    expect(withPlan.slides.map(slide => slide.kind)).toEqual([
      'cover',
      'executive-summary',
      'plan-comparison',
      'time-series',
      'category-composition',
      'rankings',
      'open-items',
      'non-operational',
    ]);

    const configured = createPresentationPlanData();
    const withoutTargets = createPresentationPlanData({
      budget: {
        ...configured.budget,
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
    const withoutPlanSlide = attachPresentationPlan(base, {
      state: 'available',
      data: withoutTargets,
      fetchedAt: '2026-08-25T15:30:00-03:00',
    });
    expect(withoutPlanSlide.slides.some(slide => slide.kind === 'plan-comparison')).toBe(false);
  });

  it('inclui slides de cenário e sensibilidade somente com alavancas e análise válidas', () => {
    const withSensitivity = createPresentationWithScenario(true);
    expect(withSensitivity.slides.map(slide => slide.kind)).toContain('scenario-impact');
    expect(withSensitivity.slides.map(slide => slide.kind)).toContain('scenario-sensitivity');
    const withoutSensitivity = createPresentationWithScenario(false);
    expect(withoutSensitivity.slides.map(slide => slide.kind)).toContain('scenario-impact');
    expect(withoutSensitivity.slides.map(slide => slide.kind)).not.toContain('scenario-sensitivity');
  });

  it('inclui decisão aprovada, pagina ações de forma estável e só acompanha comparação compatível', () => {
    const detail = createPresentationDecisionDetail(8);
    const withDecision = attachPresentationDecision(createPresentationSociosData(), {
      state: 'available',
      data: { detail, comparison: createPresentationDecisionComparison() },
      fetchedAt: detail.fetchedAt,
    });
    const decisionSlides = withDecision.slides.filter(slide => slide.kind === 'decision-commitments');
    expect(decisionSlides).toHaveLength(2);
    expect(decisionSlides.map(slide => slide.title)).toEqual([
      'Decisão e compromissos (1/2)',
      'Decisão e compromissos (2/2)',
    ]);
    const exportedActions = decisionSlides.flatMap(slide => (
      slide.availability.state === 'available' && slide.availability.data.type === 'decision-commitments'
        ? slide.availability.data.decision.actions.map(action => action.id)
        : []
    ));
    expect(exportedActions).toEqual(detail.actions.map(action => action.id));
    expect(withDecision.slides.filter(slide => slide.kind === 'decision-follow-up')).toHaveLength(1);

    const incompatible = attachPresentationDecision(createPresentationSociosData(), {
      state: 'available',
      data: { detail, comparison: { state: 'unavailable', reason: 'period-incompatible' } },
      fetchedAt: detail.fetchedAt,
    });
    expect(incompatible.slides.some(slide => slide.kind === 'decision-follow-up')).toBe(false);
  });

  it('não inclui decisão vazia, em rascunho ou não anexada pela barreira de exportação', () => {
    const base = createPresentationSociosData();
    expect(base.slides.some(slide => slide.kind.startsWith('decision-'))).toBe(false);
    const draft = createPresentationDecisionDetail();
    draft.decision.status = 'DRAFT';
    draft.revisions[0].approvedAt = null;
    const withDraft = attachPresentationDecision(base, {
      state: 'available',
      data: { detail: draft, comparison: { state: 'unavailable', reason: 'current-data-unavailable' } },
      fetchedAt: draft.fetchedAt,
    });
    expect(withDraft.slides.some(slide => slide.kind.startsWith('decision-'))).toBe(false);
  });

  it('rejeita cenário inválido antes de gerar slides ou exportações', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    const valid = createPresentationScenarioResult();
    const data = attachPresentationScenario(createPresentationSociosData(), {
      state: 'available',
      data: {
        ...valid,
        scenario: { ...valid.scenario, result: Number.NaN },
      },
    });
    expect(data.scenario).toMatchObject({ state: 'error' });
    expect(data.slides.some(slide => slide.kind === 'scenario-impact')).toBe(false);
    expect(consoleError).toHaveBeenCalledOnce();
    consoleError.mockRestore();
  });

  it('preserva hierarquia, grupos sem categoria e separação não operacional sem recalcular valores', () => {
    const data = createPresentationSociosData();
    const composition = data.slides.find(slide => slide.kind === 'category-composition');
    const nonOperational = data.slides.find(slide => slide.kind === 'non-operational');
    expect(composition?.availability.state).toBe('available');
    expect(nonOperational?.availability.state).toBe('available');
    if (composition?.availability.state !== 'available' || composition.availability.data.type !== 'category-composition') return;
    if (nonOperational?.availability.state !== 'available' || nonOperational.availability.data.type !== 'non-operational') return;

    const expenseParent = composition.availability.data.composition.expense[0];
    expect(expenseParent).toMatchObject({ name: 'Despesas operacionais', directAmount: 0, amount: 650 });
    expect(expenseParent.children[0]).toMatchObject({ name: 'Insumos', directAmount: 650, amount: 650 });
    expect(composition.availability.data.composition.expense.map(node => node.name))
      .toContain('Sem categoria — Despesas');
    expect(composition.availability.data.composition.revenue.map(node => node.name))
      .toContain('Sem categoria — Receitas');
    expect(nonOperational.availability.data.composition.revenue.map(node => node.name))
      .toContain('Sem categoria — Receitas');
    expect(nonOperational.subtitle).toMatch(/fora de receita, despesa, resultado e margem/i);
  });

  it('pagina séries e rankings sem alterar rótulos, valores ou ranking original', () => {
    const base = createPresentationSociosData();
    const snapshot = createPresentationSnapshot();
    const points = Array.from({ length: 25 }, (_, index) => ({
      ...snapshot.timeSeries.points[0],
      key: `2026-03-${String(index + 1).padStart(2, '0')}`,
      label: `Ponto ${index + 1}`,
    }));
    const rankings = Array.from({ length: 16 }, (_, index) => ({
      rank: index + 1,
      categoryId: `categoria-${index + 1}`,
      label: `Categoria ${index + 1}`,
      amount: 100 - index,
      sharePercent: 10 - index / 10,
    }));
    const data: PresentationSociosData = {
      ...base,
      current: {
        state: 'available',
        data: {
          ...snapshot,
          timeSeries: { granularity: 'day', points },
          rankings: { topRevenueCategories: rankings, topExpenseCategories: rankings },
        },
      },
      slides: [],
    };
    const slides = buildPresentationSlides(data);
    const timeSlides = slides.filter(slide => slide.kind === 'time-series');
    const rankingSlides = slides.filter(slide => slide.kind === 'rankings');

    expect(timeSlides).toHaveLength(3);
    expect(rankingSlides).toHaveLength(3);
    expect(rankingSlides.map(slide => (
      slide.availability.state === 'available' && slide.availability.data.type === 'rankings'
        ? slide.availability.data.rankings.topRevenueCategories.length
        : 0
    ))).toEqual([6, 6, 4]);
    const exportedRanks = rankingSlides.flatMap(slide => {
      if (slide.availability.state !== 'available' || slide.availability.data.type !== 'rankings') return [];
      return slide.availability.data.rankings.topRevenueCategories.map(item => item.rank);
    });
    expect(exportedRanks).toEqual(Array.from({ length: 16 }, (_, index) => index + 1));
  });

  it('limita a composição a oito linhas por coluna para preservar o rodapé do PPTX', () => {
    const base = createPresentationSociosData();
    const snapshot = createPresentationSnapshot();
    snapshot.categoryComposition.operational.expense = Array.from({ length: 9 }, (_, index) => ({
      categoryId: `expense-${index + 1}`,
      parentCategoryId: null,
      name: `Despesa ${index + 1}`,
      nature: 'DESPESA' as const,
      directAmount: 100,
      amount: 100,
      sharePercent: 100 / 9,
      children: [],
    }));
    const data: PresentationSociosData = {
      ...base,
      current: { state: 'available', data: snapshot },
      slides: [],
    };

    const compositionSlides = buildPresentationSlides(data)
      .filter(slide => slide.kind === 'category-composition');
    expect(compositionSlides).toHaveLength(2);
    expect(compositionSlides.map(slide => (
      slide.availability.state === 'available'
      && slide.availability.data.type === 'category-composition'
        ? slide.availability.data.composition.expense.length
        : 0
    ))).toEqual([8, 1]);
  });

  it.each(['empty', 'unavailable', 'error'] as const)('propaga o estado %s para os slides de conteúdo', state => {
    const data = createPresentationSociosData(state);
    expect(data.slides[0].availability.state).toBe('available');
    expect(data.slides.slice(1).every(slide => slide.availability.state === state)).toBe(true);
  });

  it('não considera slides unavailable/error exportáveis e representa base zero sem Infinity/NaN', () => {
    const unavailable = createPresentationSociosData('unavailable');
    expect(unavailable.slides.filter(isPresentationSlideExportable).map(slide => slide.kind)).toEqual(['cover']);

    const snapshot = createPresentationSnapshot();
    expect(formatMetricDelta(snapshot.deltas?.revenue)).toBe('Base zero - indisponível');
    expect(JSON.stringify(unavailable.slides)).not.toMatch(/Infinity|NaN/);
  });

  it('gera nomes seguros com período e data de geração no fuso de negócio', () => {
    const data = createPresentationSociosData();
    expect(presentationFilename(data, 'pdf')).toBe(
      'apresentacao-socios-2026-03-01-a-2026-03-31-gerado-2026-08-25.pdf',
    );
  });
});

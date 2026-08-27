import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import PresentationSlideCanvas from '@/components/financeiro/PresentationSlideCanvas';
import type { DataAvailability, PresentationSlide } from '@/domain/financeiro/presentation';
import { buildPresentationSlides } from '@/lib/presentationSlides';
import {
  attachPresentationPlan,
  type PresentationAnalyticsSnapshot,
} from '@/lib/financeiroPresentationAdapter';
import {
  createPresentationPlanData,
  createPresentationSociosData,
} from '@/test/fixtures/presentationSocios';
import { createPresentationWithScenario } from '@/test/fixtures/presentationScenario';

function contentSlideFor(availability: DataAvailability<PresentationAnalyticsSnapshot>): PresentationSlide {
  const base = createPresentationSociosData();
  return buildPresentationSlides({ ...base, current: availability, slides: [] })[1];
}

function renderSlide(slide: PresentationSlide) {
  return render(
    <PresentationSlideCanvas
      slide={slide}
      generatedAt="2026-08-25T15:30:00-03:00"
      slideNumber={2}
      totalSlides={7}
    />,
  );
}

describe('estados e comparações dos slides', () => {
  it('renderiza loading, empty, unavailable e error conforme DataAvailability', () => {
    const cases: Array<[DataAvailability<PresentationAnalyticsSnapshot>, RegExp]> = [
      [{ state: 'loading' }, /carregando dados consolidados/i],
      [createPresentationSociosData('empty').current, /nenhum dado disponível/i],
      [{ state: 'unavailable', reason: 'outside-available-period' }, /fora do histórico disponível/i],
      [{ state: 'error', message: 'Falha controlada.' }, /falha controlada/i],
    ];

    for (const [availability, message] of cases) {
      const view = renderSlide(contentSlideFor(availability));
      expect(screen.getByText(message)).toBeInTheDocument();
      view.unmount();
    }
  });

  it('representa comparação de base zero como indisponível sem Infinity ou NaN', () => {
    const data = createPresentationSociosData();
    const summary = data.slides.find(slide => slide.kind === 'executive-summary');
    if (!summary) throw new Error('Resumo executivo ausente');
    const { container } = renderSlide(summary);
    expect(screen.getAllByText('Base zero - indisponível')).toHaveLength(4);
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('expõe comparação fora do histórico no subtítulo do resumo', () => {
    const base = createPresentationSociosData();
    const data = {
      ...base,
      comparisons: {
        ...base.comparisons,
        previousPeriod: {
          ...base.comparisons.previousPeriod,
          snapshot: { state: 'unavailable' as const, reason: 'outside-available-period' as const },
        },
      },
      slides: [],
    };
    const summary = buildPresentationSlides(data)[1];
    renderSlide(summary);
    expect(screen.getByText(/comparação anterior fora do histórico disponível/i)).toBeInTheDocument();
  });

  it('renderiza o slide de metas no modo apresentação sem valores não finitos', () => {
    const data = attachPresentationPlan(createPresentationSociosData(), {
      state: 'available',
      data: createPresentationPlanData(),
      fetchedAt: '2026-08-25T15:30:00-03:00',
    });
    const planSlide = data.slides.find(slide => slide.kind === 'plan-comparison');
    if (!planSlide) throw new Error('Slide de metas ausente');

    const { container } = renderSlide(planSlide);
    expect(screen.getAllByText('Orçado').length).toBeGreaterThan(0);
    expect(screen.getByText('Meta percentual de CMV')).toBeInTheDocument();
    expect(screen.getAllByText('25,0%').length).toBeGreaterThan(0);
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('renderiza cenário e sensibilidade com marca textual de simulação', () => {
    const data = createPresentationWithScenario();
    const scenarioSlide = data.slides.find(slide => slide.kind === 'scenario-impact');
    const sensitivitySlide = data.slides.find(slide => slide.kind === 'scenario-sensitivity');
    if (!scenarioSlide || !sensitivitySlide) throw new Error('Slides de cenário ausentes');

    const scenarioView = renderSlide(scenarioSlide);
    expect(screen.getByText('SIMULAÇÃO')).toBeInTheDocument();
    expect(screen.getByText('Renegociação executiva · SIMULAÇÃO · base realizada.')).toBeInTheDocument();
    expect(scenarioView.container.textContent).not.toMatch(/Infinity|NaN/);
    scenarioView.unmount();

    const sensitivityView = renderSlide(sensitivitySlide);
    expect(screen.getByText('SIMULAÇÃO')).toBeInTheDocument();
    expect(sensitivityView.container.textContent).toMatch(/demais alavancas mantidas fixas/i);
    expect(sensitivityView.container.textContent).not.toMatch(/Infinity|NaN/);
  });
});

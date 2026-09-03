import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationSlideCanvas from '@/components/financeiro/PresentationSlideCanvas';
import type { DataAvailability, PresentationSlide } from '@/domain/financeiro/presentation';
import {
  attachPresentationExpenses,
  attachPresentationResults,
  attachPresentationRevenue,
  type PresentationAnalyticsSnapshot,
} from '@/lib/financeiroPresentationAdapter';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';
import { createPresentationRevenueData, createPresentationWithRevenue } from '@/test/fixtures/presentationRevenue';
import { createPresentationExpensesData, createPresentationWithExpenses } from '@/test/fixtures/presentationExpenses';
import { createPresentationWithInsights } from '@/test/fixtures/presentationInsights';

function resultSlideFor(
  availability: DataAvailability<PresentationAnalyticsSnapshot>,
  kind: PresentationSlide['kind'] = 'results-summary',
): PresentationSlide {
  const base = createPresentationSociosData();
  const data = attachPresentationResults({ ...base, current: availability, slides: [] });
  const slide = data.slides.find(candidate => candidate.kind === kind);
  if (!slide) throw new Error(`Slide ${kind} ausente`);
  return slide;
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
  it('remove transições do canvas quando o usuário prefere movimento reduzido', () => {
    const slide = createPresentationSociosData().slides[0];
    const { container } = renderSlide(slide);
    const canvas = container.querySelector('article.presentation-slide');
    expect(canvas).toHaveClass('motion-safe:transition-opacity');
    expect(canvas).toHaveClass('motion-reduce:transition-none');
  });

  it('renderiza loading, unavailable e error conforme DataAvailability', () => {
    const cases: Array<[DataAvailability<PresentationAnalyticsSnapshot>, RegExp]> = [
      [{ state: 'loading' }, /carregando dados consolidados/i],
      [{ state: 'unavailable', reason: 'outside-available-period' }, /fora do histórico disponível/i],
      [{ state: 'error', message: 'Falha controlada.' }, /falha controlada/i],
    ];

    for (const [availability, message] of cases) {
      const view = renderSlide(resultSlideFor(availability));
      expect(screen.getByText(message)).toBeInTheDocument();
      view.unmount();
    }
  });

  it('renderiza estado vazio como métricas zeradas, sem transformar ausência em erro', () => {
    const slide = createPresentationSociosData('empty').slides
      .find(candidate => candidate.kind === 'results-summary');
    if (!slide) throw new Error('Resumo de Resultados ausente');
    const { container } = renderSlide(slide);
    expect(screen.getAllByText('R$0,00')).toHaveLength(3);
    expect(container.textContent).not.toMatch(/falha|Infinity|NaN/i);
  });

  it('representa comparação de base zero como indisponível sem valores não finitos', () => {
    const data = createPresentationSociosData();
    const comparison = data.slides.find(slide => slide.kind === 'results-comparison');
    if (!comparison) throw new Error('Comparação de Resultados ausente');
    const { container } = renderSlide(comparison);
    expect(screen.getAllByText('Base zero - indisponível')).toHaveLength(4);
    expect(container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('expõe comparação equivalente fora do histórico como indisponível', () => {
    const base = createPresentationSociosData();
    const data = attachPresentationResults({
      ...base,
      comparisons: {
        ...base.comparisons,
        previousPeriod: {
          ...base.comparisons.previousPeriod,
          snapshot: { state: 'unavailable' as const, reason: 'outside-available-period' as const },
        },
      },
      slides: [],
    });
    const comparison = data.slides.find(slide => slide.kind === 'results-comparison');
    if (!comparison) throw new Error('Comparação de Resultados ausente');
    renderSlide(comparison);
    expect(screen.getByText(/período anterior fora do histórico disponível/i)).toBeInTheDocument();
  });

  it('abre o detalhe do resultado em caixa a partir dos cartões do resumo', () => {
    const data = createPresentationSociosData();
    const summary = data.slides.find(slide => slide.kind === 'results-summary');
    if (!summary) throw new Error('Resumo de Resultados ausente');
    const onOpenResultDetail = vi.fn();
    render(<PresentationSlideCanvas slide={summary} generatedAt="2026-08-27T15:30:00-03:00" slideNumber={1} totalSlides={5} onOpenResultDetail={onOpenResultDetail} />);

    fireEvent.click(screen.getByRole('button', { name: /abrir detalhe de receita operacional/i }));
    fireEvent.click(screen.getByRole('button', { name: /abrir detalhe de margem operacional/i }));
    expect(onOpenResultDetail).toHaveBeenNthCalledWith(1, 'revenue');
    expect(onOpenResultDetail).toHaveBeenNthCalledWith(2, 'margin');
  });

  it('renderiza a ponte fechada e sinaliza o efeito econômico inverso da despesa', () => {
    const data = createPresentationSociosData();
    const bridge = data.slides.find(slide => slide.kind === 'results-bridge');
    if (!bridge) throw new Error('Ponte de Resultados ausente');
    const { container } = renderSlide(bridge);

    expect(screen.getByText('Efeito de despesa')).toBeInTheDocument();
    expect(screen.getByText('-R$700,00')).toHaveClass('text-destructive');
    expect(container).toHaveTextContent('Despesa maior gera efeito negativo; menor, positivo.');
    expect(container).toHaveTextContent('Ponte fechada exatamente no resultado atual');
  });

  it('renderiza resumo, dias da semana e histórico do Faturamento sem confundir ausência com zero', () => {
    const data = createPresentationWithRevenue();
    const summary = data.slides.find(slide => slide.kind === 'revenue-summary');
    const weekdays = data.slides.find(slide => slide.kind === 'revenue-weekdays');
    const history = data.slides.find(slide => slide.kind === 'revenue-history');
    if (!summary || !weekdays || !history) throw new Error('Slides de Faturamento ausentes');

    const summaryView = renderSlide(summary);
    expect(screen.getAllByText('R$3.000,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$1.500,00').length).toBeGreaterThan(0);
    expect(summaryView.container).toHaveTextContent('Faturamento bruto — Fechamento de Caixa');
    summaryView.unmount();

    const weekdayView = renderSlide(weekdays);
    expect(screen.getByText('Segunda-feira')).toBeInTheDocument();
    expect(screen.getAllByText('R$0,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sem fechamento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Não aplicável').length).toBeGreaterThan(0);
    expect(weekdayView.container.textContent).not.toMatch(/Infinity|NaN/);
    weekdayView.unmount();

    const historyView = renderSlide(history);
    expect(screen.getByText('2024')).toBeInTheDocument();
    expect(screen.getByText('2025')).toBeInTheDocument();
    expect(screen.getByText('2026')).toBeInTheDocument();
    expect(historyView.container.querySelectorAll('path').length).toBeGreaterThan(0);
    // 3 meses "available" na fixture (2025-03, 2026-02, 2026-03) — meses vazios/sem
    // cobertura NUNCA viram ponto nem cápsula, senão a ausência mentiria como zero.
    expect(historyView.container.querySelectorAll('circle').length).toBe(3);
    expect(historyView.container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('renderiza os quatro layouts de Despesas, leitura inversa e drill-down por categoria', () => {
    const data = createPresentationWithExpenses();
    const summary = data.slides.find(slide => slide.kind === 'expenses-summary');
    const tree = data.slides.find(slide => slide.kind === 'expenses-tree');
    const rolling = data.slides.find(slide => slide.kind === 'expenses-rolling');
    const history = data.slides.find(slide => slide.kind === 'expenses-history');
    if (!summary || !tree || !rolling || !history) throw new Error('Slides de Despesas ausentes');

    const summaryView = renderSlide(summary);
    expect(screen.getByText('Redução de despesas')).toHaveClass('text-success');
    expect(summaryView.container).toHaveTextContent('DFC · Regime de caixa');
    summaryView.unmount();

    const onOpenExpenseCategory = vi.fn();
    const treeView = render(<PresentationSlideCanvas slide={tree} generatedAt="2026-08-27T15:30:00-03:00" slideNumber={2} totalSlides={4} onOpenExpenseCategory={onOpenExpenseCategory} />);
    fireEvent.click(screen.getByRole('button', { name: /despesas operacionais/i }));
    expect(onOpenExpenseCategory).toHaveBeenCalledWith('11111111-1111-4111-8111-111111111111');
    expect(screen.getByText(/não operacional · fora do resultado/i)).toBeInTheDocument();
    treeView.unmount();

    const rollingView = renderSlide(rolling);
    expect(rollingView.container).toHaveTextContent('R$1.800,00');
    rollingView.unmount();
    const historyView = renderSlide(history);
    expect(historyView.container).toHaveTextContent('2024');
    // 3 meses "available" na fixture (2026-01, 2026-02, 2026-03).
    expect(historyView.container.querySelectorAll('circle').length).toBe(3);
    expect(historyView.container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('renderiza Receita líquida × Despesa por mês com buracos, sem inventar zero para meses ausentes', () => {
    const revenue = createPresentationRevenueData();
    const expenses = createPresentationExpensesData();
    const withRevenue = attachPresentationRevenue(createPresentationSociosData(), {
      state: 'available', data: revenue, fetchedAt: revenue.generatedAt,
    });
    const data = attachPresentationExpenses(withRevenue, {
      state: 'available', data: expenses, fetchedAt: expenses.generatedAt,
    });
    const slide = data.slides.find(candidate => candidate.kind === 'revenue-expenses-monthly');
    if (!slide) throw new Error('Slide Receita líquida × Despesa ausente');

    const view = renderSlide(slide);
    expect(screen.getByText('Receita líquida')).toBeInTheDocument();
    expect(screen.getByText('Despesa')).toBeInTheDocument();
    // Receita líquida disponível em fev e mar (2 pontos); despesa disponível em
    // jan, fev e mar (3 pontos) — total 5 círculos, nenhum para os meses restantes.
    expect(view.container.querySelectorAll('circle').length).toBe(5);
    expect(view.container.textContent).not.toMatch(/Infinity|NaN/);
    view.unmount();
  });

  it('esvazia Receita líquida × Despesa por mês com mensagem explícita quando o ano não está no seletor de uma das fontes', () => {
    const revenue = createPresentationRevenueData();
    const expenses = structuredClone(createPresentationExpensesData());
    expenses.requestedYears = [2024, 2025];
    const withRevenue = attachPresentationRevenue(createPresentationSociosData(), {
      state: 'available', data: revenue, fetchedAt: revenue.generatedAt,
    });
    const data = attachPresentationExpenses(withRevenue, {
      state: 'available', data: expenses, fetchedAt: expenses.generatedAt,
    });
    const slide = data.slides.find(candidate => candidate.kind === 'revenue-expenses-monthly');
    if (!slide) throw new Error('Slide Receita líquida × Despesa ausente');

    const view = renderSlide(slide);
    expect(view.container).toHaveTextContent('Inclua 2026 no seletor de anos do histórico');
  });

  it('renderiza Insights com evidência, origem, regime e drill-down DFC existente', () => {
    const data = createPresentationWithInsights();
    const insightSlide = data.slides.find(slide => slide.id === 'chapter-insights');
    if (!insightSlide) throw new Error('Capítulo de Insights ausente');
    const onOpenExpenseCategory = vi.fn();
    const { container } = render(
      <PresentationSlideCanvas
        slide={insightSlide}
        generatedAt="2026-08-27T15:30:00-03:00"
        slideNumber={13}
        totalSlides={14}
        onOpenExpenseCategory={onOpenExpenseCategory}
      />,
    );

    expect(screen.getAllByText('Faturamento').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Despesas').length).toBeGreaterThan(0);
    expect(container).toHaveTextContent('Faturamento bruto — Fechamento de Caixa');
    expect(container).toHaveTextContent('Despesas financeiras — regime de caixa do DFC');
    expect(container).toHaveTextContent('Caixa do DFC');
    expect(container).toHaveTextContent('Regras 1.0');
    expect(container.textContent).not.toMatch(/Infinity|NaN/);

    fireEvent.click(screen.getByRole('button', { name: /abrir detalhe de pessoas concentrou despesas/i }));
    expect(onOpenExpenseCategory).toHaveBeenCalledWith('44444444-4444-4444-8444-444444444444');
  });

  it('preserva nomes extensos de categoria sem truncar o conteúdo', () => {
    const data = createPresentationWithExpenses();
    const tree = data.slides.find(slide => slide.kind === 'expenses-tree');
    if (!tree || (tree.availability.state !== 'available' && tree.availability.state !== 'empty')) {
      throw new Error('Árvore de Despesas ausente');
    }
    if (tree.availability.data.type !== 'expenses-tree') throw new Error('Payload de árvore inválido');
    const longName = 'Insumos perecíveis e embalagens especiais para operações com atendimento prolongado';
    const [firstNode, ...remainingNodes] = tree.availability.data.nodes;
    const longTree: PresentationSlide = {
      ...tree,
      availability: {
        ...tree.availability,
        data: {
          ...tree.availability.data,
          nodes: [{ ...firstNode, name: longName }, ...remainingNodes],
        },
      },
    };

    renderSlide(longTree);
    const label = screen.getByText(longName);
    expect(label).toHaveClass('break-words');
    expect(label).not.toHaveClass('truncate');
  });
});

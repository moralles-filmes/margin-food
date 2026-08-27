import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationScenarioSection from './PresentationScenarioSection';
import { createEmptyPresentationScenarioDraft } from '@/domain/financeiro/presentation';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';
import {
  createPresentationScenarioCategories,
  createPresentationScenarioResult,
} from '@/test/fixtures/presentationScenario';

function renderSection(overrides: Partial<React.ComponentProps<typeof PresentationScenarioSection>> = {}) {
  const props: React.ComponentProps<typeof PresentationScenarioSection> = {
    canSimulate: true,
    planAvailability: { state: 'available', data: createPresentationPlanData() },
    categories: createPresentationScenarioCategories(),
    draft: {
      ...createEmptyPresentationScenarioDraft(),
      name: 'Renegociação executiva',
      totalRevenue: { mode: 'absolute', value: '100,00' },
      sensitivity: {
        leverId: 'revenue-total',
        minValue: '-600,00',
        maxValue: '200,00',
        stepValue: '100,00',
      },
    },
    result: createPresentationScenarioResult(),
    validationError: null,
    storageError: null,
    isDirty: true,
    hasMoreCategories: false,
    loadingMoreCategories: false,
    onLoadMoreCategories: vi.fn(),
    onDraftChange: vi.fn(),
    onBaselineModeChange: vi.fn(),
    onClear: vi.fn(),
    ...overrides,
  };
  return { ...render(<PresentationScenarioSection {...props} />), props };
}

describe('área executiva de cenários', () => {
  it('expõe controles acessíveis, marca SIMULAÇÃO e descrição textual da ponte', () => {
    renderSection();
    expect(screen.getByRole('heading', { name: /cenários e sensibilidade/i })).toBeInTheDocument();
    expect(screen.getByText('SIMULAÇÃO')).toBeInTheDocument();
    expect(screen.getByRole('group', { name: /base do cenário/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/nome local do cenário/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/receita total, ajuste absoluto/i)).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /ponte do resultado base/i })).toBeInTheDocument();
    expect(screen.getByRole('img', { name: /curva de sensibilidade/i })).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Infinity|NaN/);
  });

  it('exige confirmação antes de limpar um rascunho alterado', () => {
    const { props } = renderSection();
    fireEvent.click(screen.getByRole('button', { name: /limpar cenário/i }));
    expect(screen.getByRole('alertdialog')).toBeInTheDocument();
    expect(props.onClear).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: /descartar cenário/i }));
    expect(props.onClear).toHaveBeenCalledOnce();
  });

  it('mostra falta de permissão sem renderizar o editor', () => {
    renderSection({ canSimulate: false, result: null });
    expect(screen.getByText(/financeiro:relatorio-socios:simulate/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/nome local do cenário/i)).not.toBeInTheDocument();
  });

  it('não permite selecionar orçamento ou projeção indisponíveis', () => {
    const base = createPresentationPlanData();
    const plan = createPresentationPlanData({
      budget: { ...base.budget, revenue: null, expense: null, result: null, marginPercent: null },
      coverage: {
        ...base.coverage,
        revenue: { configured: false, complete: false, actualCovered: 0, actualTotal: 1_200 },
        expense: { configured: false, complete: false, actualCovered: 0, actualTotal: 700 },
      },
      projection: { ...base.projection, state: 'insufficient-sample', factor: null, metrics: null },
    });
    renderSection({ planAvailability: { state: 'available', data: plan }, result: null, isDirty: false });
    expect(screen.getByRole('button', { name: /orçado.*indisponível/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /projeção.*indisponível/i })).toBeDisabled();
    expect(screen.getByRole('button', { name: /^realizado$/i })).toBeEnabled();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationPlanComparison from '@/components/financeiro/PresentationPlanComparison';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

describe('comparação visual com metas e orçamento', () => {
  it('expõe os três modos como controles semânticos e informa variações favoráveis/desfavoráveis', () => {
    const onModeChange = vi.fn();
    const plan = createPresentationPlanData();
    const { container } = render(
      <PresentationPlanComparison
        plan={plan}
        mode="actual"
        onModeChange={onModeChange}
        expectedActual={{ revenue: 1_200, expense: 700, result: 500 }}
      />,
    );

    expect(screen.getByRole('group', { name: 'Modo de comparação executiva' })).toBeInTheDocument();
    expect(screen.getAllByText('Variação favorável').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Variação desfavorável').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: 'Projeção' }));
    expect(onModeChange).toHaveBeenCalledWith('projection');
    expect(container.textContent).not.toMatch(/NaN|Infinity/);
  });

  it('mostra ausência explícita em vez de assumir meta zero', () => {
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

    render(
      <PresentationPlanComparison
        plan={plan}
        mode="budget"
        onModeChange={() => undefined}
        expectedActual={{ revenue: 1_200, expense: 700, result: 500 }}
      />,
    );
    expect(screen.getAllByText('Meta não configurada').length).toBeGreaterThan(1);
  });

  it('bloqueia desvios quando o realizado diverge da apresentação canônica', () => {
    render(
      <PresentationPlanComparison
        plan={createPresentationPlanData()}
        mode="actual"
        onModeChange={() => undefined}
        expectedActual={{ revenue: 999, expense: 700, result: 299 }}
      />,
    );
    expect(screen.getByText('Comparação executiva indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Maiores variações favoráveis')).not.toBeInTheDocument();
  });
});

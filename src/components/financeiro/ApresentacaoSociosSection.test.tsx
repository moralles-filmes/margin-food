import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import PresentationAnalytics from './PresentationAnalytics';
import { PresentationRequestState } from './ApresentacaoSociosSection';
import { createPresentationSociosData } from '@/test/fixtures/presentationSocios';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn(), from: vi.fn() },
}));

describe('estados visuais da Apresentação Sócios', () => {
  it('mantém valores, hierarquia e não operacional no contrato analítico', () => {
    render(<PresentationAnalytics data={createPresentationSociosData()} />);

    expect(screen.getByText('Resumo executivo')).toBeInTheDocument();
    expect(screen.getAllByText('R$1.200,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$700,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('R$500,00').length).toBeGreaterThan(0);
    expect(screen.getAllByText('41,7%').length).toBeGreaterThan(0);
    expect(screen.getByText('R$320,00')).toBeInTheDocument();
    expect(screen.getByText('R$540,00')).toBeInTheDocument();
    expect(screen.getAllByText('Despesas operacionais').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Insumos').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Sem categoria — Despesas').length).toBeGreaterThan(0);
    expect(screen.getByText('Informativo não operacional')).toBeInTheDocument();
    expect(screen.getByText(/não compõem receita, despesa, resultado ou margem operacional/i)).toBeInTheDocument();
  });

  it('torna os indicadores acionáveis e calcula CMV pela classificação configurada', () => {
    render(
      <PresentationAnalytics
        data={createPresentationSociosData()}
        categoryMetadata={{
          despesas: { group: null },
          insumos: { group: 'cmv' },
        }}
      />,
    );

    expect(screen.getByRole('button', { name: 'Ver detalhes de CMV' })).toHaveTextContent('R$650,00');
    expect(screen.getByRole('button', { name: 'Ver detalhes de CMV' })).toHaveTextContent('54,2%');

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de CMV' }));
    expect(screen.getAllByText('Detalhamento do CMV').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Insumos').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole('button', { name: 'Ver detalhes de Receita operacional' }));
    expect(screen.getAllByText('Composição das receitas').length).toBeGreaterThan(0);
  });

  it('mapeia cada KPI, conta em aberto, ranking e item da árvore para o detalhe correto', () => {
    const onOpenDetail = vi.fn();
    render(
      <PresentationAnalytics
        data={createPresentationSociosData()}
        categoryMetadata={{
          despesas: { group: null },
          insumos: { group: 'cmv' },
        }}
        onOpenDetail={onOpenDetail}
      />,
    );

    const expectedCards = [
      ['Receita operacional', 'revenue'],
      ['Despesa operacional', 'expense'],
      ['Resultado operacional', 'result'],
      ['Margem operacional', 'margin'],
      ['CMV', 'cmv'],
    ] as const;
    for (const [label, target] of expectedCards) {
      fireEvent.click(screen.getByRole('button', { name: `Ver detalhes de ${label}` }));
      expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({ target }));
    }

    const payableButton = screen.getAllByRole('button').find(button => (
      button.textContent?.includes('Contas a pagar') && button.textContent.includes('R$')
    ));
    expect(payableButton).toBeDefined();
    fireEvent.click(payableButton as HTMLButtonElement);
    expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'payables' }));
    const receivableButton = screen.getAllByRole('button').find(button => (
      button.textContent?.includes('Contas a receber') && button.textContent.includes('R$')
    ));
    expect(receivableButton).toBeDefined();
    fireEvent.click(receivableButton as HTMLButtonElement);
    expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'receivables' }));
    fireEvent.click(screen.getByRole('button', { name: /top receitas/i }));
    expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'ranking-revenue' }));
    fireEvent.click(screen.getByRole('button', { name: /top despesas/i }));
    expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({ target: 'ranking-expense' }));

    const categoryButton = screen.getAllByRole('button', { name: /abrir detalhe da categoria insumos/i })[0];
    categoryButton.focus();
    expect(categoryButton).toHaveFocus();
    fireEvent.click(categoryButton);
    expect(onOpenDetail).toHaveBeenLastCalledWith(expect.objectContaining({
      target: 'expense',
      categoryId: 'insumos',
      returnAnchor: 'financial-tree',
    }));
  });

  it.each(['loading', 'idle'] as const)('expõe o estado %s de forma acessível', state => {
    render(<PresentationRequestState availability={{ state }} onRetry={() => {}} />);

    expect(screen.getByRole('status')).toHaveTextContent('Carregando dados consolidados da apresentação');
    expect(screen.getByRole('status').closest('[aria-busy="true"]')).not.toBeNull();
  });

  it('representa período vazio e indisponível sem números enganosos', () => {
    const empty = render(<PresentationAnalytics data={createPresentationSociosData('empty')} />);
    expect(screen.getByText('Nenhum realizado no período')).toBeInTheDocument();
    expect(empty.container.textContent).not.toMatch(/Infinity|NaN/);
    empty.unmount();

    const unavailable = render(<PresentationAnalytics data={createPresentationSociosData('unavailable')} />);
    expect(screen.getByText('Período indisponível')).toBeInTheDocument();
    expect(unavailable.container.textContent).not.toMatch(/Infinity|NaN/);
  });

  it.each([
    ['somente receitas', { revenue: 1_200, expense: 0, result: 1_200, marginPercent: 100 }, 'R$1.200,00'],
    ['somente despesas', { revenue: 0, expense: 700, result: -700, marginPercent: 0 }, 'R$-700,00'],
    ['somente não operacional', { revenue: 0, expense: 0, result: 0, marginPercent: 0 }, 'R$100,00'],
  ] as const)('renderiza %s sem misturar naturezas nem produzir valores inválidos', (scenario, metrics, expected) => {
    const data = structuredClone(createPresentationSociosData());
    if (data.current.state !== 'available') throw new Error('fixture deveria estar disponível');
    data.current.data.metrics.managerialResult = metrics;

    if (scenario === 'somente receitas') {
      data.current.data.categoryComposition.operational.expense = [];
      data.current.data.categoryComposition.nonOperational = { revenue: [], expense: [] };
      data.current.data.rankings.topExpenseCategories = [];
      data.current.data.nonOperationalTotals = { revenue: 0, expense: 0, result: 0 };
    } else if (scenario === 'somente despesas') {
      data.current.data.categoryComposition.operational.revenue = [];
      data.current.data.categoryComposition.nonOperational = { revenue: [], expense: [] };
      data.current.data.rankings.topRevenueCategories = [];
      data.current.data.nonOperationalTotals = { revenue: 0, expense: 0, result: 0 };
    } else {
      data.current.data.categoryComposition.operational = { revenue: [], expense: [] };
      data.current.data.rankings = { topRevenueCategories: [], topExpenseCategories: [] };
    }

    const view = render(<PresentationAnalytics data={data} />);
    expect(screen.getAllByText(expected).length).toBeGreaterThan(0);
    expect(view.container.textContent).not.toMatch(/Infinity|NaN/);
    if (scenario === 'somente não operacional') {
      expect(screen.getByText('Informativo não operacional')).toBeInTheDocument();
      expect(screen.getByText(/não compõem receita, despesa, resultado ou margem operacional/i)).toBeInTheDocument();
    }
  });

  it('explica o requisito de RBAC quando o acesso está indisponível', () => {
    render(
      <PresentationRequestState
        availability={{ state: 'unavailable', reason: 'permission-denied' }}
        onRetry={() => {}}
      />,
    );

    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(screen.getByText(/financeiro:relatorio-socios:view/)).toBeInTheDocument();
  });

  it('mostra erro acionável e permite tentar novamente', () => {
    const retry = vi.fn();
    render(
      <PresentationRequestState
        availability={{ state: 'error', message: 'Falha controlada.' }}
        onRetry={retry}
      />,
    );

    expect(screen.getByRole('alert')).toHaveTextContent('Falha controlada.');
    fireEvent.click(screen.getByRole('button', { name: /tentar novamente/i }));
    expect(retry).toHaveBeenCalledOnce();
  });
});

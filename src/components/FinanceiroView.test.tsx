import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Navigate, Route, Routes, useLocation } from 'react-router-dom';
import FinanceiroView from '@/components/FinanceiroView';
import { dropNavigationRequest, requestNavigation } from '@/hooks/useNavigationRequest';

const permissionState = vi.hoisted(() => ({ visibleSubtabs: ['relatorio-socios'] as string[] }));

vi.mock('@/hooks/usePersistedTab', async () => {
  const { useState } = await import('react');
  return { usePersistedTab: <T,>(_key: string, initial: T) => useState(initial) };
});

vi.mock('@/permissions', () => ({
  useCan: () => true,
  useModuleAccess: () => ({ visibleSubtabs: permissionState.visibleSubtabs }),
}));

vi.mock('@/integrations/supabase/client', () => ({
  supabase: {
    from: () => ({
      select: () => ({ in: () => Promise.resolve({ count: 0 }) }),
    }),
  },
}));

vi.mock('@/contexts/ModuleBadgesContext', async () => {
  const { EMPTY_MODULE_BADGES } = await import('@/lib/moduleBadges');
  return { useModuleBadges: () => ({ counts: EMPTY_MODULE_BADGES, totalsByTab: {}, refresh: () => {} }) };
});

vi.mock('@/components/ui/SubmoduleSwitcher', () => ({
  SubmoduleSwitcher: ({ items, onChange }: {
    items: Array<{ id: string; label: string }>;
    onChange: (id: string) => void;
  }) => (
    <nav aria-label="Navegação financeira">
      {items.map(item => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)}>{item.label}</button>
      ))}
    </nav>
  ),
}));

vi.mock('@/components/financeiro/BorderoSection', () => ({
  default: () => <div>Borderô renderizado</div>,
}));
vi.mock('@/components/financeiro/ApresentacaoSociosSection', () => ({
  default: () => <div data-testid="presentation-shell-direct">Shell direto da apresentação</div>,
}));

vi.mock('@/components/financeiro/ContasPagarSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/ContasReceberSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/FluxoCaixaSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/DRESection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/DFCSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/DashboardFinanceiroSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/AlertasSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/RecorrenciasSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/CategorizacaoSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/FechamentoCaixaSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/CadastroBaseTree', () => ({ default: () => null }));
vi.mock('@/components/financeiro/ContasBancariasSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/LivroRazaoSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/CentrosCustoFinSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/FornecedoresFinSection', () => ({
  default: () => <div>Fornecedores do Financeiro</div>,
}));

function LocationProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

afterEach(() => {
  permissionState.visibleSubtabs = ['relatorio-socios'];
  dropNavigationRequest();
});

describe('navegação vinda do CMV para Lançamentos', () => {
  it('abre Lançamentos quando o pedido traz a sub-aba lancamentos', async () => {
    permissionState.visibleSubtabs = ['dashboard', 'lancamentos'];
    render(<MemoryRouter><FinanceiroView /></MemoryRouter>);
    expect(screen.queryByLabelText('Visão de lançamentos')).not.toBeInTheDocument();

    act(() => requestNavigation({ tab: 'financeiro', subtab: 'lancamentos', record: { type: 'lancamento', id: 'l1' } }));
    expect(await screen.findByLabelText('Visão de lançamentos')).toBeInTheDocument();
  });

  it('sem acesso a Lançamentos o pedido não troca de aba', async () => {
    permissionState.visibleSubtabs = ['dashboard', 'pagar'];
    render(<MemoryRouter><FinanceiroView /></MemoryRouter>);

    act(() => requestNavigation({ tab: 'financeiro', subtab: 'lancamentos' }));
    await act(async () => {});
    expect(screen.queryByLabelText('Visão de lançamentos')).not.toBeInTheDocument();
  });
});

describe('navegação do Financeiro para Borderô e Apresentação Sócios', () => {
  it('abre o Borderô na rota nova e o shell direto ao clicar na apresentação', async () => {
    render(
      <MemoryRouter initialEntries={['/financeiro/bordero']}>
        <FinanceiroView />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Borderô renderizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Borderô' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Relatório Sócios' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apresentação Sócios' }));

    expect(await screen.findByTestId('presentation-shell-direct')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Rota atual' }))
      .toHaveTextContent('/financeiro/apresentacao-socios'));
  });

  it('redireciona o bookmark antigo /financeiro/relatorio-socios para o Borderô', async () => {
    render(
      <MemoryRouter initialEntries={['/financeiro/relatorio-socios']}>
        <Routes>
          <Route path="/financeiro/relatorio-socios" element={<Navigate to="/financeiro/bordero" replace />} />
          <Route path="/financeiro/bordero" element={<FinanceiroView />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Borderô renderizado')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Rota atual' })).toHaveTextContent('/financeiro/bordero');
  });

  it('não mostra nenhuma das entradas sem financeiro:relatorio-socios:view', () => {
    permissionState.visibleSubtabs = [];
    render(
      <MemoryRouter>
        <FinanceiroView />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Borderô' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apresentação Sócios' })).not.toBeInTheDocument();
    expect(screen.getByText('Acesso Negado')).toBeInTheDocument();
  });
});

describe('Cadastros Base do Financeiro', () => {
  it('oferece Fornecedores, com o mesmo cadastro de Compras', async () => {
    permissionState.visibleSubtabs = ['cadastros'];
    render(
      <MemoryRouter>
        <FinanceiroView />
      </MemoryRouter>,
    );

    fireEvent.click(await screen.findByRole('button', { name: 'Fornecedores' }));
    expect(await screen.findByText('Fornecedores do Financeiro')).toBeInTheDocument();
  });
});

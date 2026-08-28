import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, useLocation } from 'react-router-dom';
import FinanceiroView from '@/components/FinanceiroView';

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

vi.mock('@/components/ui/ModuleNav', () => ({
  ModuleNav: ({ items, onChange }: {
    items: Array<{ id: string; label: string; children?: Array<{ id: string; label: string }> }>;
    onChange: (id: string) => void;
  }) => (
    <nav aria-label="Navegação financeira">
      {items.flatMap(item => item.children ?? [item]).map(item => (
        <button key={item.id} type="button" onClick={() => onChange(item.id)}>{item.label}</button>
      ))}
    </nav>
  ),
}));

vi.mock('@/components/financeiro/RelatorioSociosSection', () => ({
  default: () => <div>Relatório mensal legado renderizado</div>,
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
vi.mock('@/components/financeiro/PlanoContasFinSection', () => ({ default: () => null }));
vi.mock('@/components/financeiro/CentrosCustoFinSection', () => ({ default: () => null }));

function LocationProbe() {
  return <output aria-label="Rota atual">{useLocation().pathname}</output>;
}

afterEach(() => {
  permissionState.visibleSubtabs = ['relatorio-socios'];
});

describe('navegação do Financeiro para sócios', () => {
  it('mantém o relatório legado e abre o shell direto ao clicar na apresentação', async () => {
    render(
      <MemoryRouter initialEntries={['/financeiro/relatorio-socios']}>
        <FinanceiroView />
        <LocationProbe />
      </MemoryRouter>,
    );

    expect(await screen.findByText('Relatório mensal legado renderizado')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Relatório Sócios' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Apresentação Sócios' }));

    expect(await screen.findByTestId('presentation-shell-direct')).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('status', { name: 'Rota atual' }))
      .toHaveTextContent('/financeiro/apresentacao-socios'));
  });

  it('não mostra nenhuma das entradas sem financeiro:relatorio-socios:view', () => {
    permissionState.visibleSubtabs = [];
    render(
      <MemoryRouter>
        <FinanceiroView />
      </MemoryRouter>,
    );

    expect(screen.queryByRole('button', { name: 'Relatório Sócios' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Apresentação Sócios' })).not.toBeInTheDocument();
    expect(screen.getByText('Acesso Negado')).toBeInTheDocument();
  });
});

import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import OrcamentoSection from '@/components/financeiro/OrcamentoSection';
import { fmtBRL } from '@/lib/formatters';

const state = vi.hoisted(() => ({
  supabase: { rpc: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => state.supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useConfirmDialog', () => ({ useConfirmDialog: () => ({ confirm: vi.fn(), ConfirmDialog: () => null }) }));

function rowOf(label: string): HTMLElement {
  const row = screen.getByText(label).closest('tr');
  expect(row).not.toBeNull();
  return row as HTMLElement;
}

describe('Orçamento × Realizado', () => {
  it('soma o realizado sem categoria no total da seção, sem permitir orçar a linha', async () => {
    state.supabase.rpc.mockResolvedValue({
      data: {
        regime: 'caixa',
        categorias: [
          { id: 'c-vendas', nome: 'VENDAS', codigo: '1.01', tipo: 'receita', parent_id: null, ordem: 0 },
          { id: 'c-salmao', nome: 'SALMAO', codigo: '2.01.01', tipo: 'despesa', parent_id: null, ordem: 1 },
        ],
        orcamentos: [],
        valores_realizado: { 'c-vendas': 1000, 'c-salmao': 98776.97 },
        valores_sem_categoria: { despesa: 2174.1 },
      },
      error: null,
    });

    render(<OrcamentoSection />);

    await screen.findByText('Sem categoria');
    const semCategoria = rowOf('Sem categoria');
    expect(within(semCategoria).getByText(fmtBRL(2174.1))).toBeInTheDocument();
    expect(within(semCategoria).queryByRole('textbox')).toBeNull();

    const totalDespesas = rowOf('TOTAL DE DESPESAS');
    expect(within(totalDespesas).getByText(fmtBRL(100951.07))).toBeInTheDocument();
    expect(screen.getByText(/Caixa \(Livro Razão\)/)).toBeInTheDocument();
    expect(state.supabase.rpc).toHaveBeenCalledWith('get_fin_orcamento_arvore', expect.objectContaining({ p_mes: expect.any(String) }));
  });
});

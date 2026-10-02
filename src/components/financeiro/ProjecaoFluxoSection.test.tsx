import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import ProjecaoFluxoSection from '@/components/financeiro/ProjecaoFluxoSection';
import { fmtBRL } from '@/lib/formatters';

const state = vi.hoisted(() => ({
  supabase: { rpc: vi.fn() },
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => state.supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));
vi.mock('recharts', async importOriginal => ({
  ...(await importOriginal<typeof import('recharts')>()),
  ResponsiveContainer: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

function cardValue(label: string): string {
  const card = screen.getByText(label).closest('div');
  return card?.parentElement?.querySelector('p.text-lg')?.textContent ?? '';
}

describe('Projeção de Fluxo de Caixa', () => {
  it('liga a estimativa por padrão e volta à projeção só com títulos ao desligar', async () => {
    state.supabase.rpc.mockResolvedValue({
      data: {
        saldo_inicial: 1000,
        entradas: 0,
        saidas: 800,
        saldo_final: 200,
        dias_negativo: 0,
        saldo_minimo: 200,
        estimativa: {
          disponivel: true,
          janela_inicio: '2026-09-03',
          janela_fim: '2026-09-30',
          receita_estimada: 500,
          despesa_estimada: 300,
          saldo_final: 400,
          dias_negativo: 0,
          saldo_minimo: 200,
        },
        timeline: [
          { data: '2026-10-02', saldo: 200, entradas: 0, saidas: 800, receita_estimada: 0, despesa_estimada: 0, saldo_com_estimativa: 200 },
          { data: '2026-10-03', saldo: 200, entradas: 0, saidas: 0, receita_estimada: 500, despesa_estimada: 300, saldo_com_estimativa: 400 },
        ],
      },
      error: null,
    });

    render(<ProjecaoFluxoSection />);

    await screen.findByText('Receita estimada');
    expect(cardValue('Receita estimada')).toBe(fmtBRL(500));
    expect(cardValue('Despesa estimada')).toBe(fmtBRL(300));
    expect(cardValue('Saldo Final')).toBe(fmtBRL(400));
    expect(screen.getByText(/03\/09\/2026 a 30\/09\/2026/)).toBeInTheDocument();
    expect(state.supabase.rpc).toHaveBeenCalledWith('get_fin_fluxo_projecao', { p_dias: 30, p_saldo_manual: null });

    fireEvent.click(screen.getByRole('switch', { name: 'Incluir estimativa' }));

    expect(screen.queryByText('Receita estimada')).toBeNull();
    expect(cardValue('Saldo Final')).toBe(fmtBRL(200));
  });
});

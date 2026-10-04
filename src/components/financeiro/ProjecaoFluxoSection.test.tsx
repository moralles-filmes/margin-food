import { fireEvent, render, screen, waitFor } from '@testing-library/react';
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

/** Raiz do KpiCard que tem o rótulo (o rótulo fica no cabeçalho do card). */
function cardOf(label: string): HTMLElement | null {
  return screen.getByText(label).closest('div')?.parentElement ?? null;
}

function cardValue(label: string): string {
  return cardOf(label)?.querySelector('p.font-bold')?.textContent ?? '';
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

  it('saldo final positivo fica no card azul; negativo sai do azul para o vermelho aparecer, com a data do mínimo', async () => {
    state.supabase.rpc.mockResolvedValue({
      data: {
        saldo_inicial: 100,
        entradas: 0,
        saidas: 350,
        saldo_final: -250,
        dias_negativo: 1,
        saldo_minimo: -250,
        timeline: [
          { data: '2026-10-02', saldo: 100, entradas: 0, saidas: 0 },
          { data: '2026-10-03', saldo: -250, entradas: 0, saidas: 350 },
        ],
      },
      error: null,
    });

    render(<ProjecaoFluxoSection />);

    await screen.findByText('Saldo Final');
    const final = cardOf('Saldo Final');
    expect(final).not.toHaveClass('bg-gradient-highlight');
    expect(final?.querySelector('p.font-bold')).toHaveClass('text-destructive');
    expect(cardValue('Saldo Final')).toBe(fmtBRL(-250));
    expect(cardValue('Dias com saldo negativo')).toBe('1');
    expect(screen.getByRole('alert')).toHaveTextContent(`${fmtBRL(-250)} em 03/10/2026`);
  });

  it('erro da RPC mostra estado de erro e "Tentar novamente" projeta de novo', async () => {
    state.supabase.rpc.mockReset();
    state.supabase.rpc.mockResolvedValue({ data: null, error: { message: 'falhou' } });

    render(<ProjecaoFluxoSection />);

    expect(await screen.findByText('Não foi possível gerar a projeção')).toBeInTheDocument();
    expect(screen.queryByText('Saldo Final')).toBeNull();
    const calls = state.supabase.rpc.mock.calls.length;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(state.supabase.rpc.mock.calls.length).toBe(calls + 1));
  });
});

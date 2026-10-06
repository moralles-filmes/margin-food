import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import FluxoCaixaSection from '@/components/financeiro/FluxoCaixaSection';
import { fluxoCaixaPeriodo } from '@/components/financeiro/fluxoCaixaView';
import { fmtBRL } from '@/lib/formatters';

const state = vi.hoisted(() => ({
  error: null as null | { message: string },
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
  listeners: {} as Record<string, () => void>,
}));

// Cliente estável como o de produção: um objeto novo a cada render recriaria `load` e o
// efeito de carga rodaria sem parar.
const supabase = { rpc: (name: string, params?: unknown) => state.rpc(name, params) };

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: (event: string, cb: () => void) => { state.listeners[event] = cb; } }));

const resposta = {
  periodo: {},
  dias: [
    {
      data: '2026-03-02',
      entradas: 300,
      saidas: 120,
      prev_entradas: 0,
      prev_saidas: 0,
      detalhes: [
        { id: 'a', entidade_tipo: 'lancamento', tipo: 'realizado', descricao: 'Venda balcão', valor: 300, natureza: 'entrada', origem: 'manual' },
        { id: 'b', entidade_tipo: 'conta_pagar', tipo: 'realizado', descricao: 'Fornecedor', valor: 120, natureza: 'saida', origem: 'espelho_cp' },
      ],
    },
    { data: '2026-03-20', entradas: 0, saidas: 0, prev_entradas: 0, prev_saidas: 75, detalhes: [] },
  ],
  // Totais vêm prontos da RPC (o período tem mais dias que a amostra) — valores distintos dos dias.
  totais: { entradas: 500, saidas: 150, prev_entradas: 0, prev_saidas: 75, saldo_acumulado: 4321.09 },
};

beforeEach(() => {
  state.error = null;
  state.listeners = {};
  state.rpc.mockReset();
  state.rpc.mockImplementation(() => Promise.resolve(state.error ? { data: null, error: state.error } : { data: resposta, error: null }));
});

describe('Fluxo de Caixa (V2)', () => {
  it('carrega o mesmo período e rotula saldo e resultados sem confundir os dois', async () => {
    render(<FluxoCaixaSection />);

    expect(await screen.findByText('Saldo acumulado')).toBeInTheDocument();
    const { inicio, fim } = fluxoCaixaPeriodo(new Date());
    expect(state.rpc).toHaveBeenCalledWith('get_fin_cashflow', { p_inicio: inicio, p_fim: fim });

    const saldo = screen.getByText(fmtBRL(4321.09));
    expect(saldo.closest('.bg-gradient-highlight')).not.toBeNull();
    expect(screen.getByText('Resultado realizado')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(350))).toBeInTheDocument();
    expect(screen.getByText('Resultado projetado')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(275))).toBeInTheDocument();
    expect(screen.queryByText('Saldo Real')).toBeNull();
    expect(screen.queryByText('Saldo Projetado')).toBeNull();
  });

  it('expandir o dia é um botão com aria-expanded e o atalho leva ao Livro Razão do dia', async () => {
    const onNavigate = vi.fn();
    render(<FluxoCaixaSection onNavigate={onNavigate} />);

    const [expandir] = await screen.findAllByRole('button', { name: 'Mostrar detalhes de 02/03/2026' });
    expect(expandir).toHaveAttribute('aria-expanded', 'false');
    fireEvent.click(expandir);
    const [ocultar] = screen.getAllByRole('button', { name: 'Ocultar detalhes de 02/03/2026' });
    expect(ocultar).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getAllByText('Venda balcão').length).toBeGreaterThan(0);

    fireEvent.click(screen.getAllByText('Fornecedor')[0]);
    expect(onNavigate).toHaveBeenLastCalledWith({ tab: 'pagar', dateFrom: '2026-03-02', dateTo: '2026-03-02' });

    fireEvent.click(screen.getAllByRole('button', { name: 'Ver lançamentos de 20/03/2026' })[0]);
    expect(onNavigate).toHaveBeenLastCalledWith({ tab: 'lancamentos', dateFrom: '2026-03-20', dateTo: '2026-03-20' });
  });

  it('só previsto troca os cards de fluxo e filtra os dias', async () => {
    render(<FluxoCaixaSection />);
    await screen.findByText('Saldo acumulado');

    fireEvent.click(screen.getByRole('radio', { name: 'Só Previsto' }));
    expect(screen.getByText('Saídas previstas')).toBeInTheDocument();
    expect(screen.queryByText('Entradas realizadas')).toBeNull();
    // get_fin_cashflow põe no previsto os vencidos em aberto de qualquer data.
    expect(screen.getAllByText('Inclui vencidos em aberto antes do período')).toHaveLength(2);
    expect(screen.getAllByText('Resultado previsto do dia').length).toBeGreaterThan(0);
    expect(screen.queryAllByRole('button', { name: 'Mostrar detalhes de 02/03/2026' })).toHaveLength(0);
    expect(screen.getAllByRole('button', { name: 'Mostrar detalhes de 20/03/2026' }).length).toBeGreaterThan(0);
  });

  it('falha numa recarga mantém os valores da última carga e avisa', async () => {
    render(<FluxoCaixaSection />);
    await screen.findByText(fmtBRL(4321.09));

    state.error = { message: 'falhou' };
    await act(async () => { state.listeners['financeiro:lancamentos'](); });

    expect(await screen.findByText('Não foi possível atualizar o fluxo de caixa')).toBeInTheDocument();
    expect(screen.getByText('Os valores abaixo são da última carga.')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(4321.09))).toBeInTheDocument();
  });

  it('erro mostra estado de erro com nova tentativa, nunca zeros', async () => {
    state.error = { message: 'falhou' };
    render(<FluxoCaixaSection />);

    expect(await screen.findByText('Não foi possível carregar o fluxo de caixa')).toBeInTheDocument();
    expect(screen.queryByText('Saldo acumulado')).toBeNull();

    state.error = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getByText('Saldo acumulado')).toBeInTheDocument());
  });
});

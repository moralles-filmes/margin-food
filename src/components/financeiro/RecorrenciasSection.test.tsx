import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import RecorrenciasSection from './RecorrenciasSection';

const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  items: [] as Record<string, unknown>[],
  erro: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const supabase = {
  rpc(name: string) {
    state.rpcCalls.push(name);
    if (name === '_guarded_list_recorrencias') {
      return Promise.resolve(state.erro
        ? { data: null, error: { message: 'falha simulada' } }
        : { data: { items: state.items, has_more: false, next_cursor_data: null, next_cursor_id: null }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));

const rec = (over: Record<string, unknown>) => ({
  id: 'r', origem: 'lancamento', chave_unica: 'lancamento:r', descricao: 'Recorrência', tipo: 'DESPESA', status: 'REALIZADO',
  valor: 100, dia_vencimento: 5, frequencia: 'mensal', ativo: true, proxima_data: null, filhos_mes: 0, gerado_mes: false,
  updated_at: '2026-01-01T00:00:00Z', parcelas_geradas: 1, parcelas_max: 12, ...over,
});

beforeEach(() => {
  state.rpcCalls = [];
  state.erro = false;
  state.items = [
    rec({ id: 'a', chave_unica: 'lancamento:a', descricao: 'Aluguel' }),
    rec({ id: 'b', chave_unica: 'conta_pagar:b', origem: 'conta_pagar', descricao: 'Assinatura', gerado_mes: true, filhos_mes: 1, parcelas_max: 0 }),
  ];
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Recorrências (V2)', () => {
  it('lista com tipo, origem e status no mês; "Gerar" só aparece para o Livro Razão e não grava sozinho', async () => {
    render(<RecorrenciasSection onNavigate={vi.fn()} />);

    expect((await screen.findAllByText('Aluguel')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Despesa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1 lançada(s)').length).toBeGreaterThan(0);
    expect(screen.getAllByText('1/∞').length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Gerar parcela de Aluguel' }).length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Gerar parcela de Assinatura' })).not.toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Abrir Contas a Pagar' }).length).toBeGreaterThan(0);
    expect(screen.getByText(/2 carregadas · 1 pendente no mês entre as carregadas/)).toBeInTheDocument();
    expect(state.rpcCalls).toEqual(['_guarded_list_recorrencias']);
  });

  it('erro com nova tentativa e vazio com orientação', async () => {
    state.erro = true;
    const { unmount } = render(<RecorrenciasSection />);
    expect(await screen.findByText('Erro ao carregar recorrências')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    unmount();

    state.erro = false;
    state.items = [];
    render(<RecorrenciasSection />);
    expect(await screen.findByText('Nenhuma recorrência cadastrada')).toBeInTheDocument();
  });
});

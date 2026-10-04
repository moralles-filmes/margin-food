import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContasBancariasSection from '@/components/financeiro/ContasBancariasSection';
import { fmtBRL } from '@/lib/money';

interface ContaFake {
  id: string;
  nome: string;
  tipo: string;
  banco: string | null;
  agencia: string | null;
  numero_conta: string | null;
  saldo_inicial: number;
  ativo: boolean;
  updated_at: string;
}

const state = vi.hoisted(() => ({
  contas: [] as ContaFake[],
  contasError: null as null | { message: string },
  saldos: [] as { conta_id: string; saldo: number }[],
  saldosError: null as null | { message: string },
  saldoNaData: 0,
  negadas: new Set<string>(),
  selects: 0,
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const supabase = {
  from: (table: string) => ({
    select: () => ({
      eq: () => ({
        order: () => {
          if (table === 'fin_contas') state.selects += 1;
          return Promise.resolve(state.contasError
            ? { data: null, error: state.contasError }
            : { data: state.contas, error: null });
        },
      }),
    }),
  }),
  rpc: (name: string, params?: unknown) => state.rpc(name, params),
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions', () => ({ useCan: (key: string) => !state.negadas.has(key) }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'empresa-teste' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'usuario-teste' } }) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));

const conta = (over: Partial<ContaFake>): ContaFake => ({
  id: 'x', nome: 'Conta', tipo: 'corrente', banco: null, agencia: null, numero_conta: null,
  saldo_inicial: 0, ativo: true, updated_at: '2026-01-01T00:00:00Z', ...over,
});

beforeEach(() => {
  state.contas = [
    conta({ id: 'c1', nome: 'Banco Alfa', banco: 'Alfa', agencia: '0001', numero_conta: '111', saldo_inicial: 1000 }),
    conta({ id: 'c2', nome: 'Caixa da Loja', tipo: 'caixa_fisico', saldo_inicial: 50 }),
    conta({ id: 'c3', nome: 'Banco Beta', banco: 'Beta', saldo_inicial: 0 }),
  ];
  state.contasError = null;
  state.saldos = [
    { conta_id: 'c1', saldo: 2500.5 },
    { conta_id: 'c2', saldo: 120 },
    { conta_id: 'c3', saldo: -300.25 },
  ];
  state.saldosError = null;
  state.saldoNaData = 0;
  state.negadas = new Set();
  state.selects = 0;
  state.rpc.mockReset();
  state.rpc.mockImplementation((name: string) => {
    if (name === 'get_all_saldos_contas') {
      return Promise.resolve(state.saldosError ? { data: null, error: state.saldosError } : { data: state.saldos, error: null });
    }
    if (name === 'get_fin_saldo_conta_em') return Promise.resolve({ data: state.saldoNaData, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

afterEach(() => {
  sessionStorage.clear();
});

describe('Contas Bancárias (V2)', () => {
  it('destaque soma TODAS as contas ativas, mesmo com busca; saldo negativo em vermelho com sinal', async () => {
    render(<ContasBancariasSection />);

    const total = fmtBRL(2500.5 + 120 - 300.25);
    expect(await screen.findByText(total)).toBeInTheDocument();
    expect(screen.getByText('Saldo somado das contas ativas')).toBeInTheDocument();
    expect(screen.getByText('Saldo atual no sistema de 3 contas ativas')).toBeInTheDocument();
    expect(screen.getByText('Conta Corrente: 2 · Caixa Físico: 1')).toBeInTheDocument();

    const negativo = screen.getByText(fmtBRL(-300.25));
    expect(negativo).toHaveClass('text-destructive');
    expect(negativo.textContent).toContain('-');
    expect(screen.getByText(fmtBRL(120))).toHaveClass('text-foreground');
    expect(screen.getByText('Alfa | Ag. 0001 | CC 111')).toBeInTheDocument();

    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar conta por nome ou banco' }), { target: { value: 'alfa' } });
    expect(screen.queryByText('Banco Beta')).toBeNull();
    expect(screen.getByText(total)).toBeInTheDocument();
    expect(screen.getByText('Mostrando 1 de 3')).toBeInTheDocument();
  });

  it('"Ver extrato" leva para o Livro Razão da conta e as ações respeitam a permissão', async () => {
    const onNavigateExtrato = vi.fn();
    state.negadas = new Set(['financeiro:contas:delete']);
    render(<ContasBancariasSection onNavigateExtrato={onNavigateExtrato} />);

    fireEvent.click(await screen.findByRole('button', { name: 'Ver extrato de Caixa da Loja' }));
    expect(onNavigateExtrato).toHaveBeenCalledWith('c2');
    expect(screen.getByRole('button', { name: 'Editar conta Banco Alfa' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar conta Banco Alfa' })).toBeNull();
  });

  it('erro ao carregar as contas mostra estado de erro com nova tentativa', async () => {
    state.contasError = { message: 'falhou' };
    render(<ContasBancariasSection />);

    expect(await screen.findByText('Não foi possível carregar as contas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conta ativa')).toBeNull();

    state.contasError = null;
    const antes = state.selects;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Banco Alfa')).toBeInTheDocument();
    expect(state.selects).toBe(antes + 1);
  });

  it('erro dos saldos não vira zero', async () => {
    state.saldosError = { message: 'falhou' };
    render(<ContasBancariasSection />);

    expect(await screen.findByText('Não foi possível carregar os saldos')).toBeInTheDocument();
    expect(screen.getByText('Indisponível')).toBeInTheDocument();
    expect(screen.getAllByText('Saldo indisponível')).toHaveLength(3);
    expect(screen.queryByText(fmtBRL(2500.5))).toBeNull();
    // A planilha sairia com saldo 0: exportar fica indisponível até os saldos carregarem.
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();

    state.saldosError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText(fmtBRL(2500.5 + 120 - 300.25))).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeEnabled();
  });

  it('sem contas mostra o vazio; busca sem resultado oferece limpar filtros', async () => {
    state.contas = [];
    const { unmount } = render(<ContasBancariasSection />);
    expect(await screen.findByText('Nenhuma conta ativa')).toBeInTheDocument();
    unmount();

    state.contas = [conta({ id: 'c1', nome: 'Banco Alfa' })];
    render(<ContasBancariasSection />);
    await screen.findByText('Banco Alfa');
    fireEvent.change(screen.getByRole('textbox', { name: 'Buscar conta por nome ou banco' }), { target: { value: 'zzz' } });
    expect(screen.getByText('Nenhuma conta encontrada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar filtros' }));
    expect(screen.getByText('Banco Alfa')).toBeInTheDocument();
  });

  it('conferência com o extrato compara as duas pontas na mesma data', async () => {
    sessionStorage.setItem('conciliacao_saldo_extrato_c1', JSON.stringify({ valor: 2600, data: '2026-08-31' }));
    state.saldoNaData = 2550;
    render(<ContasBancariasSection />);

    const tabela = await screen.findByRole('table');
    await waitFor(() => expect(within(tabela).getByText(fmtBRL(2550))).toBeInTheDocument());
    expect(state.rpc).toHaveBeenCalledWith('get_fin_saldo_conta_em', { p_conta_id: 'c1', p_data: '2026-08-31' });
    expect(within(tabela).getByText('31/08/2026')).toBeInTheDocument();
    expect(within(tabela).getByText(fmtBRL(2600))).toBeInTheDocument();
    expect(within(tabela).getByText(fmtBRL(50))).toBeInTheDocument();
    expect(within(tabela).getByText('Pendente')).toBeInTheDocument();
  });
});

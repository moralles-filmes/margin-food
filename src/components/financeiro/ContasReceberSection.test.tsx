import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContasReceberSection from './ContasReceberSection';
import { fmtBRL } from '@/lib/formatters';

// Cliente falso que registra TODA chamada (RPC e escrita direta em tabela).
const state = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; params: unknown }[],
  tableWrites: [] as string[],
  items: [] as Record<string, unknown>[],
  listError: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const LEITURAS = new Set(['list_fin_contas_receber_cursor', 'get_fin_counts_by_status']);

function builder(table: string) {
  let single = false;
  let id: string | null = null;
  const b: Record<string, unknown> = {};
  const self = () => b;
  Object.assign(b, {
    select: self, order: self,
    eq: (col: string, val: string) => { if (col === 'id') id = val; return b; },
    single: () => { single = true; return b; },
    insert: () => { state.tableWrites.push(`insert:${table}`); return b; },
    update: () => { state.tableWrites.push(`update:${table}`); return b; },
    upsert: () => { state.tableWrites.push(`upsert:${table}`); return b; },
    delete: () => { state.tableWrites.push(`delete:${table}`); return b; },
    then: (resolve: (v: unknown) => void) => {
      if (table === 'fin_contas_receber' && single) {
        return Promise.resolve({ data: state.items.find(r => r.id === id) ?? null, error: null }).then(resolve);
      }
      return Promise.resolve({ data: [], error: null }).then(resolve);
    },
  });
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc(name: string, params?: unknown) {
    state.rpcCalls.push({ name, params });
    if (name === 'list_fin_contas_receber_cursor') {
      if (state.listError) return Promise.resolve({ data: null, error: { message: 'falha simulada' } });
      return Promise.resolve({ data: { items: state.items, has_more: false, filtered_total: 0, filtered_count: state.items.length }, error: null });
    }
    if (name === 'get_fin_counts_by_status') {
      return Promise.resolve({ data: { total_pagar_pendente: 0, vencidas_pagar: 0, total_receber_pendente: 987.65, vencidas_receber: 0 }, error: null });
    }
    if (name === '_guarded_update_conta_receber_serie') {
      return Promise.resolve({ data: { id: 's', parcelas_atualizadas: 2, parcelas_ignoradas: 1 }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useChavesPendentes', () => ({ useChavesPendentes: () => ({ chave: vi.fn(), confirmar: vi.fn(), renovar: vi.fn() }) }));
vi.mock('@/lib/pdfFinanceiro', () => ({ gerarPDFContasReceber: vi.fn() }));

const conta = (over: Record<string, unknown>) => ({
  id: 'x', descricao: 'Conta', cliente: 'Cliente Teste', valor: 100, status: 'A_RECEBER',
  data_vencimento: '2099-01-10', categoria_id: null, updated_at: '2026-01-01T00:00:00Z', ...over,
});
const escritas = () => [...state.rpcCalls.filter(c => !LEITURAS.has(c.name)).map(c => c.name), ...state.tableWrites];

beforeEach(() => {
  state.rpcCalls = [];
  state.tableWrites = [];
  state.listError = false;
  state.items = [
    conta({ id: 'v', descricao: 'Sinal atrasado', status: 'A_RECEBER', data_vencimento: '2020-01-10' }),
    conta({ id: 'r', descricao: 'Buffet recebido', status: 'RECEBIDO', valor: 1500 }),
  ];
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1366 });
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Contas a Receber (V2)', () => {
  it('resumo, selos e ações com as condições de antes, sem escrita', async () => {
    render(<ContasReceberSection />);

    expect(await screen.findByText('Sinal atrasado')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(987.65))).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    expect(within(within(tabela).getByText('Sinal atrasado').closest('tr')!).getByText('Vencido')).toBeInTheDocument();
    expect(within(tabela).getByText('Recebido')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Receber Sinal atrasado' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estornar recebimento de Buffet recebido' })).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('erro da lista não vira "Nenhuma conta a receber"', async () => {
    state.listError = true;
    render(<ContasReceberSection />);
    expect(await screen.findByText('Não foi possível carregar as contas a receber')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conta a receber')).not.toBeInTheDocument();
  });

  it('estorno de recebimento: mesmo texto, Cancelar não grava, confirmar grava uma vez', async () => {
    render(<ContasReceberSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Estornar recebimento de Buffet recebido' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Deseja estornar este recebimento? O lançamento espelho será cancelado e a conta voltará ao status A Receber.');
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Estornar recebimento de Buffet recebido' }));
    const confirmar = within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Estornar' });
    await act(async () => { fireEvent.click(confirmar); fireEvent.click(confirmar); });
    await waitFor(() => expect(escritas()).toEqual(['_guarded_estornar_conta_receber']));
    expect(state.rpcCalls.find(c => c.name === '_guarded_estornar_conta_receber')?.params).toEqual({ p_id: 'r' });
  });

  it('parcela de série: pergunta ao salvar e "Esta e as próximas" chama a RPC da série com os mesmos parâmetros', async () => {
    state.items = [conta({ id: 's', descricao: 'Mensalidade (2/6)', parcela_atual: 2, parcela_total: 6 })];
    render(<ContasReceberSection />);
    const salvarComo = async (opcao: string) => {
      fireEvent.click(await screen.findByRole('button', { name: 'Editar Mensalidade (2/6)' }));
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Editar Conta a Receber' })).getByRole('button', { name: 'Salvar' }));
      const escolha = await screen.findByRole('alertdialog');
      expect(escolha).toHaveTextContent('Esta conta é a parcela 2 de 6.');
      expect(escolha).toHaveTextContent('as já recebidas ou canceladas não mudam');
      expect(escolha).toHaveTextContent('mesmo que tenha sido ajustado à mão');
      expect(escolha).not.toHaveTextContent('código de pagamento');
      expect(escolha).not.toHaveTextContent('regra de aprovação');
      fireEvent.click(within(escolha).getByRole('button', { name: opcao }));
    };

    await salvarComo('Somente esta parcela');
    await waitFor(() => expect(escritas()).toEqual(['_guarded_update_conta_receber']));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar Conta a Receber' })).not.toBeInTheDocument());

    await salvarComo('Esta e as próximas');
    await waitFor(() => expect(escritas()).toEqual(['_guarded_update_conta_receber', '_guarded_update_conta_receber_serie']));
    expect(state.toast.success).toHaveBeenLastCalledWith('Conta atualizada, junto com 2 parcelas seguintes. 1 parcela já recebida ou cancelada ficou como estava.');
    const [so, serie] = state.rpcCalls.filter(c => c.name.startsWith('_guarded_update_conta_receber'));
    expect(serie.params).toEqual(so.params);
  });

  it('"Receber" só abre o diálogo de recebimento', async () => {
    render(<ContasReceberSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Receber Sinal atrasado' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Registrar recebimento' });
    expect(within(dialogo).getByLabelText('Data do recebimento')).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });
});

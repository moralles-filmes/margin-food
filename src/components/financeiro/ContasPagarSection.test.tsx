import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import ContasPagarSection from './ContasPagarSection';
import { fmtBRL } from '@/lib/formatters';

/**
 * Cliente falso: responde só às leituras da tela e registra TODA chamada — RPC e escrita direta
 * em tabela (insert/update/delete/upsert). Nenhum teste aqui confirma pagamento ou estorno sem querer.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as { name: string; params: unknown }[],
  tableWrites: [] as string[],
  items: [] as Record<string, unknown>[],
  listError: false,
  totalsError: false,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const LEITURAS = new Set(['list_fin_contas_pagar_cursor', 'get_fin_counts_by_status', 'fin_get_limite_aprovacao_atual']);

function builder(table: string) {
  let single = false;
  let id: string | null = null;
  const b: Record<string, unknown> = {};
  const self = () => b;
  Object.assign(b, {
    select: self, order: self, in: self, gte: self, lte: self,
    eq: (col: string, val: string) => { if (col === 'id') id = val; return b; },
    single: () => { single = true; return b; },
    insert: () => { state.tableWrites.push(`insert:${table}`); return b; },
    update: () => { state.tableWrites.push(`update:${table}`); return b; },
    upsert: () => { state.tableWrites.push(`upsert:${table}`); return b; },
    delete: () => { state.tableWrites.push(`delete:${table}`); return b; },
    then: (resolve: (v: unknown) => void) => {
      if (table === 'fin_contas_pagar' && single) {
        const row = state.items.find(r => r.id === id);
        return Promise.resolve({ data: row ? { conta_id: null, ...row } : null, error: null }).then(resolve);
      }
      const dados: Record<string, unknown[]> = { fin_contas: [{ id: 'conta-a', nome: 'Conta Teste Alfa' }] };
      return Promise.resolve({ data: dados[table] ?? [], error: null }).then(resolve);
    },
  });
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc(name: string, params?: unknown) {
    state.rpcCalls.push({ name, params });
    if (name === 'list_fin_contas_pagar_cursor') {
      if (state.listError) return Promise.resolve({ data: null, error: { message: 'falha simulada' } });
      const total = state.items.reduce((s, r) => s + Number(r.valor), 0);
      return Promise.resolve({ data: { items: state.items, has_more: false, filtered_total: total, filtered_count: state.items.length }, error: null });
    }
    if (name === 'get_fin_counts_by_status') {
      return Promise.resolve(state.totalsError
        ? { data: null, error: { message: 'falha simulada' } }
        : { data: { total_pagar_pendente: 4321.09, vencidas_pagar: 1, total_receber_pendente: 0, vencidas_receber: 0 }, error: null });
    }
    if (name === 'fin_get_limite_aprovacao_atual') return Promise.resolve({ data: 2500, error: null });
    if (name === '_guarded_update_conta_pagar_serie') {
      return Promise.resolve({ data: { id: 's', status: 'APROVADO', parcelas_atualizadas: 31, parcelas_ignoradas: 0 }, error: null });
    }
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useNavigationRequest', () => ({ useNavigationRecord: () => undefined }));
vi.mock('@/hooks/useChavesPendentes', () => ({ useChavesPendentes: () => ({ chave: vi.fn(), confirmar: vi.fn(), renovar: vi.fn() }) }));
vi.mock('@/hooks/useCmvFinanceiro', () => ({ fetchCmvConfig: () => Promise.resolve(null), aplicarCmvSerie: vi.fn(), mensagemErroCmv: () => '' }));
vi.mock('@/lib/pdfFinanceiro', () => ({ gerarPDFContasPagar: vi.fn() }));
vi.mock('@/components/compras/QuickSupplierDialog', () => ({ default: () => null }));

const TODAS = ['financeiro:pagar:view', 'financeiro:pagar:create', 'financeiro:pagar:edit', 'financeiro:pagar:delete', 'financeiro:pagar:approve', 'financeiro:pagar:export'];
const conta = (over: Record<string, unknown>) => ({
  id: 'x', descricao: 'Conta', fornecedor: 'Fornecedor Teste', valor: 100, status: 'APROVADO',
  data_vencimento: '2099-01-10', categoria_id: null, updated_at: '2026-01-01T00:00:00Z', ...over,
});
const escritas = () => [
  ...state.rpcCalls.filter(c => !LEITURAS.has(c.name)).map(c => c.name),
  ...state.tableWrites,
];
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });

beforeEach(() => {
  state.rpcCalls = [];
  state.tableWrites = [];
  state.listError = false;
  state.totalsError = false;
  state.perms = new Set(TODAS);
  state.items = [
    conta({ id: 'v', descricao: 'Boleto vencido', valor: 1234.56, status: 'APROVADO', data_vencimento: '2020-01-10' }),
    conta({ id: 'a', descricao: 'Aguardando aprovação', valor: 3000, status: 'AGUARDANDO_APROVACAO' }),
    conta({ id: 'p', descricao: 'Boleto pago', valor: 80, status: 'PAGO' }),
    conta({ id: 'c', descricao: 'Boleto cancelado', valor: 10, status: 'CANCELADO', data_vencimento: '2020-01-10' }),
  ];
  largura(1366);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Contas a Pagar (V2)', () => {
  it('resumo das fontes atuais, selos com a precedência de antes e nenhuma escrita ao abrir', async () => {
    render(<ContasPagarSection />);

    expect(await screen.findByText('Boleto vencido')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Contas a Pagar', level: 2 })).toBeInTheDocument();
    expect(screen.getByText('Vencidas')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(4321.09))).toBeInTheDocument();
    expect(await screen.findByText('Limite de aprovação')).toBeInTheDocument();
    expect(screen.getByText('Toda a unidade, sem filtros')).toBeInTheDocument();

    const tabela = screen.getByRole('table');
    const linhaVencida = within(tabela).getByText('Boleto vencido').closest('tr')!;
    expect(within(linhaVencida).getByText('Vencido')).toBeInTheDocument();
    expect(within(tabela).getByText('Aguard. Aprovação')).toBeInTheDocument();
    expect(within(tabela).getByText('Pago')).toBeInTheDocument();
    // Cancelado com vencimento passado continua "Cancelado" (não vira vencido).
    expect(within(within(tabela).getByText('Boleto cancelado').closest('tr')!).getByText('Cancelado')).toBeInTheDocument();
    // Mesmas ações e condições: Pagar no vencido, Aprovar no aguardando, Estornar no pago.
    expect(screen.getByRole('button', { name: 'Pagar Boleto vencido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Aprovar Aguardando aprovação' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estornar pagamento de Boleto pago' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Boleto vencido' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Boleto pago' })).not.toBeInTheDocument();

    expect(state.rpcCalls.find(c => c.name === 'list_fin_contas_pagar_cursor')?.params).toEqual(expect.objectContaining({
      p_status: null, p_limit: 50, p_cursor_date: null, p_cursor_id: null, p_data_de: null, p_data_ate: null, p_conta_id: null, p_search: null,
    }));
    expect(escritas()).toEqual([]);
  });

  it('erro da lista vira estado de erro com nova tentativa, nunca "Nenhuma conta a pagar"', async () => {
    state.listError = true;
    render(<ContasPagarSection />);

    expect(await screen.findByText('Não foi possível carregar as contas a pagar')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conta a pagar')).not.toBeInTheDocument();

    state.listError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('Boleto vencido')).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('erro do resumo não mostra R$ 0,00', async () => {
    state.totalsError = true;
    render(<ContasPagarSection />);

    expect(await screen.findByText('Não foi possível carregar o resumo')).toBeInTheDocument();
    expect(screen.queryByText('Total pendente')).not.toBeInTheDocument();
    expect(screen.queryByText(fmtBRL(0))).not.toBeInTheDocument();
  });

  it('lista com erro e filtro aplicado: "Total filtrado" fica indisponível, nunca R$ 0,00', async () => {
    state.listError = true;
    render(<ContasPagarSection initialStatus="PAGO" />);

    expect(await screen.findByText('Não foi possível carregar as contas a pagar')).toBeInTheDocument();
    expect(screen.getByText('Total filtrado')).toBeInTheDocument();
    expect(screen.getByText('Indisponível: a lista não carregou')).toBeInTheDocument();
    expect(screen.queryByText(fmtBRL(0))).not.toBeInTheDocument();
  });

  it('vazio com filtro aplicado oferece limpar os filtros', async () => {
    state.items = [];
    render(<ContasPagarSection initialStatus="PAGO" />);

    expect(await screen.findByText('Nenhuma conta a pagar')).toBeInTheDocument();
    expect(screen.getByText('Nenhuma conta corresponde aos filtros aplicados.')).toBeInTheDocument();
    expect(screen.getByText('Total filtrado')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: /Limpar/ }).length).toBeGreaterThan(0);
  });

  it('estorno pede confirmação com o mesmo texto e só grava depois de "Estornar" (uma vez)', async () => {
    render(<ContasPagarSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Estornar pagamento de Boleto pago' }));

    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Estornar pagamento?');
    expect(dialogo).toHaveTextContent('Deseja estornar este pagamento? O lançamento espelho será cancelado e a conta voltará ao status Aprovado.');
    expect(escritas()).toEqual([]);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);

    fireEvent.click(screen.getByRole('button', { name: 'Estornar pagamento de Boleto pago' }));
    const confirmar = within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Estornar' });
    await act(async () => { fireEvent.click(confirmar); fireEvent.click(confirmar); });
    await waitFor(() => expect(escritas()).toEqual(['_guarded_estornar_conta_pagar']));
    expect(state.rpcCalls.find(c => c.name === '_guarded_estornar_conta_pagar')?.params).toEqual({ p_id: 'p' });
  });

  it('"Pagar" só abre o diálogo de pagamento (lê a conta do boleto, não grava)', async () => {
    render(<ContasPagarSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Pagar Boleto vencido' }));

    const dialogo = await screen.findByRole('dialog', { name: 'Registrar pagamento' });
    expect(within(dialogo).getByLabelText('Data do pagamento')).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Confirmar pagamento' })).toBeDisabled();
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Registrar pagamento' })).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);
  });

  it('janela estreita: lista empilhada (sem tabela) com as mesmas ações', async () => {
    largura(390);
    render(<ContasPagarSection />);

    expect(await screen.findByText('Boleto vencido')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Pagar Boleto vencido' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Estornar pagamento de Boleto pago' })).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('parcela de série: pergunta ao salvar; "Voltar" não grava; cada opção chama a sua RPC com os mesmos parâmetros', async () => {
    state.items = [conta({ id: 's', descricao: 'FGTS Marilda (5/36)', parcela_atual: 5, parcela_total: 36, data_competencia: '2099-01-10', categoria_id: 'cat-encargos' })];
    render(<ContasPagarSection />);
    const salvarComo = async (opcao?: string) => {
      if (!screen.queryByRole('dialog', { name: 'Editar Conta a Pagar' })) {
        fireEvent.click(await screen.findByRole('button', { name: 'Editar FGTS Marilda (5/36)' }));
      }
      const formulario = await screen.findByRole('dialog', { name: 'Editar Conta a Pagar' });
      fireEvent.click(within(formulario).getByRole('button', { name: 'Salvar' }));
      const escolha = await screen.findByRole('alertdialog');
      expect(escolha).toHaveTextContent('Esta conta é a parcela 5 de 36.');
      expect(escolha).toHaveTextContent('O código de pagamento de cada boleto é mantido.');
      expect(escolha).toHaveTextContent('as já pagas ou canceladas não mudam');
      expect(escolha).toHaveTextContent('passa de novo pela regra de aprovação');
      if (opcao) fireEvent.click(within(escolha).getByRole('button', { name: opcao }));
      return escolha;
    };

    const escolha = await salvarComo();
    expect(escritas()).toEqual([]);
    fireEvent.click(within(escolha).getByRole('button', { name: 'Voltar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByRole('dialog', { name: 'Editar Conta a Pagar' })).toBeInTheDocument();
    expect(escritas()).toEqual([]);

    await salvarComo('Somente esta parcela');
    await waitFor(() => expect(escritas()).toEqual(['_guarded_update_conta_pagar']));
    expect(state.toast.success).toHaveBeenLastCalledWith('Conta atualizada');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar Conta a Pagar' })).not.toBeInTheDocument());

    await salvarComo('Esta e as próximas');
    await waitFor(() => expect(escritas()).toEqual(['_guarded_update_conta_pagar', '_guarded_update_conta_pagar_serie']));
    expect(state.toast.success).toHaveBeenLastCalledWith('Conta atualizada, junto com 31 parcelas seguintes.');
    const [so, serie] = state.rpcCalls.filter(c => c.name.startsWith('_guarded_update_conta_pagar'));
    expect(serie.params).toEqual(so.params);
    expect(serie.params).toEqual(expect.objectContaining({ p_id: 's', p_expected_updated_at: '2026-01-01T00:00:00Z' }));
  });

  it('conta sem série (ou a última parcela) salva direto, sem perguntar', async () => {
    state.items = [
      conta({ id: 'u', descricao: 'Boleto avulso', categoria_id: 'cat-energia' }),
      conta({ id: 'l', descricao: 'FGTS Marilda (36/36)', parcela_atual: 36, parcela_total: 36, categoria_id: 'cat-encargos' }),
    ];
    render(<ContasPagarSection />);
    for (const descricao of ['Boleto avulso', 'FGTS Marilda (36/36)']) {
      fireEvent.click(await screen.findByRole('button', { name: `Editar ${descricao}` }));
      fireEvent.click(within(await screen.findByRole('dialog', { name: 'Editar Conta a Pagar' })).getByRole('button', { name: 'Salvar' }));
      await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Editar Conta a Pagar' })).not.toBeInTheDocument());
    }
    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
    expect(escritas()).toEqual(['_guarded_update_conta_pagar', '_guarded_update_conta_pagar']);
  });

  it('sem permissão de leitura: estado de acesso negado e nenhuma consulta', () => {
    state.perms = new Set();
    render(<ContasPagarSection />);
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
    expect(state.rpcCalls).toEqual([]);
  });
});

describe('Contas a Pagar — categoria obrigatória', () => {
  const novaConta = async () => {
    render(<ContasPagarSection />);
    await screen.findByText('Boleto vencido');
    fireEvent.click(screen.getByRole('button', { name: /Nova Conta/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nova despesa' });
    fireEvent.change(within(dialogo).getByLabelText('Descrição *'), { target: { value: 'Boleto de energia' } });
    const valor = within(dialogo).getByLabelText('Valor *');
    fireEvent.focus(valor);
    fireEvent.change(valor, { target: { value: '100,00' } });
    fireEvent.blur(valor);
    return dialogo;
  };
  const salvar = async (dialogo: HTMLElement) => {
    await act(async () => { fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar' })); });
  };

  it('sem rateio e sem categoria não grava', async () => {
    const dialogo = await novaConta();
    await salvar(dialogo);
    expect(state.toast.error).toHaveBeenCalledWith('Selecione uma categoria.');
    expect(escritas()).toEqual([]);
  });

  it('com o rateio ligado, a linha sem categoria fica à vista e não grava', async () => {
    const dialogo = await novaConta();
    fireEvent.click(within(dialogo).getByRole('switch', { name: 'Habilitar rateio' }));
    expect(within(dialogo).getByRole('columnheader', { name: 'Categoria *' })).toBeInTheDocument();
    expect(within(dialogo).getByText('Selecione a categoria em todas as linhas do rateio')).toBeInTheDocument();
    await salvar(dialogo);
    expect(state.toast.error).toHaveBeenCalledWith('Selecione a categoria da linha 1 do rateio.');
    expect(escritas()).toEqual([]);
  });
});

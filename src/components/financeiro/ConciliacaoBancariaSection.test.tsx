import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import ConciliacaoBancariaSection from '@/components/financeiro/ConciliacaoBancariaSection';
import { fmtBRL } from '@/lib/formatters';

/**
 * Conciliação Bancária (Redesign V2, Fase 04B). Cliente Supabase falso e dados sintéticos: confere a
 * apresentação dos estados e que abrir a tela, filtrar ou revisar não chama nenhuma RPC de escrita.
 */

type Resposta = { data: unknown; error: unknown; count?: number | null };

const state = vi.hoisted(() => ({
  contas: [] as Record<string, unknown>[],
  contasErro: false,
  lancamentos: [] as Record<string, unknown>[],
  lancamentosErro: false,
  categorias: [] as Record<string, unknown>[],
  pendentes: 0,
  conciliados: 0,
  saldoSistema: 0,
  queries: [] as { table: string; ops: [string, unknown[]][] }[],
  escritasDiretas: [] as string[],
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() },
}));

function responder(table: string, ops: [string, unknown[]][]): Resposta {
  const op = (nome: string) => ops.find(([n]) => n === nome)?.[1];
  if (table === 'fin_categorias') return { data: state.categorias, error: null };
  if (table === 'fin_contas') return state.contasErro ? { data: null, error: { message: 'falha' } } : { data: state.contas, error: null };
  if (table === 'fin_lancamentos') {
    const select = op('select');
    const head = (select?.[1] as { head?: boolean } | undefined)?.head;
    if (head) {
      const conciliado = ops.some(([n, a]) => n === 'eq' && a[0] === 'conciliado');
      return { data: null, error: null, count: conciliado ? state.conciliados : state.pendentes };
    }
    if (String(select?.[0]).includes('conciliado_em')) {
      return state.lancamentosErro ? { data: null, error: { message: 'falha' } } : { data: state.lancamentos, error: null };
    }
  }
  return { data: [], error: null };
}

function builder(table: string) {
  const ops: [string, unknown[]][] = [];
  state.queries.push({ table, ops });
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'or', 'gte', 'lte', 'order', 'range', 'in', 'not', 'limit']) {
    b[m] = (...args: unknown[]) => { ops.push([m, args]); return b; };
  }
  // Escrita direta em tabela também conta como escrita (sem isto ela lançaria TypeError, engolido
  // pelo try/catch da tela, e o "nenhuma escrita" passaria sem ver nada).
  for (const m of ['insert', 'update', 'delete', 'upsert']) {
    b[m] = (...args: unknown[]) => { ops.push([m, args]); state.escritasDiretas.push(`${table}.${m}`); return b; };
  }
  b.then = (resolve: (r: Resposta) => unknown, reject?: (e: unknown) => unknown) => Promise.resolve(responder(table, ops)).then(resolve, reject);
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc: (name: string, params?: unknown) => state.rpc(name, params),
};
const escopoAtivo = () => true;

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => () => undefined }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'emp1' }) }));
vi.mock('@/hooks/useScopeActivity', () => ({ useScopeActivity: () => escopoAtivo }));
vi.mock('@/components/financeiro/ContaFormDialog', () => ({ default: () => null }));

const CONTA = { id: 'conta-1', nome: 'Conta Sintética', numero_conta: '1-1', agencia: '1', banco: '1' };
const rascunho = (conta = CONTA.id) => JSON.stringify(['v2', 'u1', 'emp1', conta]);
const linha = (over: Record<string, unknown>) => ({ data: '2026-09-05', descricao: 'LINHA', valor: 10, tipo: 'DESPESA', selecionada: true, ...over });

const lanc = (over: Record<string, unknown>) => ({
  id: 'l', data_competencia: '2026-09-05', data_vencimento: null, data_pagamento: '2026-09-05', valor: 10, tipo: 'DESPESA',
  descricao: 'Lançamento', observacoes: null, conta_id: CONTA.id, categoria_id: null, centro_custo_id: null, forma_pagamento: 'pix',
  status: 'REALIZADO', origem: 'manual', recorrente: false, conciliado: false, conciliado_em: null, conciliado_por: null,
  created_at: '2026-09-05T12:00:00Z', updated_at: '2026-09-05T12:00:00Z', ...over,
});

const escritas = () => [
  ...state.rpc.mock.calls.map(([nome]) => String(nome)).filter(n => !/^(get_|list_)/.test(n)),
  ...state.escritasDiretas,
];

// Sem layout no jsdom, tabela ⇄ lista sai da largura da janela (useConteinerEstreito).
const larguraOriginal = window.innerWidth;
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, writable: true, value: px });

beforeAll(() => {
  // O Select do Radix rola a opção ativa para a vista; o jsdom não implementa scrollIntoView.
  Element.prototype.scrollIntoView = vi.fn();
});

beforeEach(() => {
  sessionStorage.clear();
  largura(larguraOriginal);
  state.escritasDiretas = [];
  state.contas = [CONTA];
  state.contasErro = false;
  state.lancamentos = [];
  state.lancamentosErro = false;
  state.categorias = [];
  state.pendentes = 0;
  state.conciliados = 0;
  state.saldoSistema = 0;
  state.queries = [];
  state.rpc.mockReset();
  state.rpc.mockImplementation((nome: string) => {
    if (nome === 'get_fin_saldo_conta_em') return Promise.resolve({ data: state.saldoSistema, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

afterEach(() => {
  sessionStorage.clear();
  largura(larguraOriginal);
});

describe('Conciliação Bancária — visão Lançamentos', () => {
  it('mostra a contagem da conta, as linhas com selos e os mesmos filtros de consulta de antes', async () => {
    state.pendentes = 2;
    state.conciliados = 1;
    state.lancamentos = [
      lanc({ id: 'a', descricao: 'PIX SINTÉTICO', tipo: 'RECEITA', valor: 75.3 }),
      lanc({ id: 'b', descricao: 'TARIFA SINTÉTICA', valor: 9.9 }),
    ];
    render(<ConciliacaoBancariaSection />);

    expect(await screen.findByText('PIX SINTÉTICO')).toBeInTheDocument();
    expect(screen.getByText('Pendentes de conciliação')).toBeInTheDocument();
    const situacao = screen.getByRole('region', { name: 'Situação da conta' });
    expect(within(situacao).getByText('2')).toBeInTheDocument();
    expect(within(situacao).getByText('1')).toBeInTheDocument();
    expect(screen.getAllByText('Pendente').length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: 'Conciliar Todos (2)' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Conciliar PIX SINTÉTICO' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar lançamento TARIFA SINTÉTICA' })).toBeInTheDocument();
    expect(screen.getByText(`+ ${fmtBRL(75.3)}`)).toBeInTheDocument();

    const lista = state.queries.find(q => q.table === 'fin_lancamentos' && String(q.ops[0][1][0]).includes('conciliado_em'));
    expect(lista?.ops).toEqual(expect.arrayContaining([
      ['eq', ['conta_id', CONTA.id]],
      ['eq', ['status', 'REALIZADO']],
      ['or', ['conciliado.is.null,conciliado.eq.false']],
    ]));
    expect(escritas()).toEqual([]);
  });

  it('falha na lista vira erro com nova tentativa — nunca "Nenhum lançamento encontrado"', async () => {
    state.lancamentosErro = true;
    render(<ConciliacaoBancariaSection />);

    expect(await screen.findByText('Não foi possível carregar os lançamentos')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum lançamento encontrado')).not.toBeInTheDocument();

    state.lancamentosErro = false;
    state.lancamentos = [lanc({ id: 'c', descricao: 'RECUPERADO' })];
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByText('RECUPERADO')).toBeInTheDocument();
  });

  it('lista vazia e conta sem lançamentos', async () => {
    render(<ConciliacaoBancariaSection />);
    expect(await screen.findByText('Nenhum lançamento encontrado')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Conciliar Todos/ })).not.toBeInTheDocument();
  });

  it('filtro sem nenhuma linha mostra a mensagem de vazio (não só o cabeçalho da tabela)', async () => {
    // "Pendentes" ativo e só um lançamento já conciliado na resposta — como depois de conciliar a
    // última pendente pelo checkbox.
    state.lancamentos = [lanc({ id: 'z', descricao: 'JÁ CONCILIADO', conciliado: true })];
    render(<ConciliacaoBancariaSection />);
    expect(await screen.findByText('Nenhum lançamento encontrado')).toBeInTheDocument();
    expect(screen.queryByText('JÁ CONCILIADO')).not.toBeInTheDocument();
  });

  it('janela estreita: lista empilhada com os mesmos controles, sem tabela', async () => {
    largura(600);
    state.pendentes = 1;
    state.lancamentos = [lanc({ id: 'a', descricao: 'PIX SINTÉTICO', tipo: 'RECEITA', valor: 75.3 })];
    render(<ConciliacaoBancariaSection />);

    const lista = await screen.findByRole('list', { name: 'Lançamentos da conta' });
    expect(within(lista).getByText('PIX SINTÉTICO')).toBeInTheDocument();
    expect(within(lista).getByText(`+ ${fmtBRL(75.3)}`)).toBeInTheDocument();
    expect(within(lista).getByRole('checkbox', { name: 'Conciliar PIX SINTÉTICO' })).toBeInTheDocument();
    expect(within(lista).getByRole('button', { name: 'Editar lançamento PIX SINTÉTICO' })).toBeInTheDocument();
    expect(within(lista).getByRole('button', { name: 'Excluir lançamento PIX SINTÉTICO' })).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('sem conta ativa e falha ao carregar as contas', async () => {
    state.contas = [];
    const { unmount } = render(<ConciliacaoBancariaSection />);
    expect(await screen.findByText('Nenhuma conta bancária ativa')).toBeInTheDocument();
    unmount();

    state.contasErro = true;
    render(<ConciliacaoBancariaSection />);
    expect(await screen.findByText('Não foi possível carregar as contas bancárias')).toBeInTheDocument();
  });
});

describe('Conciliação Bancária — visão Importar (rascunho restaurado)', () => {
  const restaurar = (linhas: Record<string, unknown>[], saldo?: { valor: number; data: string }) => {
    sessionStorage.setItem(`conciliacao_linhas_${rascunho()}`, JSON.stringify(linhas));
    if (saldo) sessionStorage.setItem(`conciliacao_saldo_extrato_${rascunho()}`, JSON.stringify(saldo));
  };

  it('chips com as mesmas contagens, banner pela regra de antes e nenhuma escrita ao abrir', async () => {
    restaurar([
      linha({ descricao: 'BOLETO JÁ BAIXADO', valor: 320, matchId: 'm1', matchOrigin: 'lancamento', matchDescricao: 'BOLETO JÁ BAIXADO', matchJaNoRazao: true, selecionada: false }),
      linha({ descricao: 'NOVA DESPESA', valor: 50, categoriaId: 'cat1' }),
      linha({ descricao: 'COM SUGESTÃO', valor: 20, suggestions: [{ id: 's1', origin: 'conta_pagar', descricao: 'SUG', valor: 21, data: '2026-09-05', score: 40, raw: {} }] }),
    ], { valor: 1000, data: '2026-09-05' });
    // Sistema 1070 + pendentes (−320 −50 −20) = 680 ≠ 1000 → não confere.
    state.saldoSistema = 1070;

    render(<ConciliacaoBancariaSection />);

    const filtros = await screen.findByRole('group', { name: 'Filtrar linhas do extrato' });
    const chips = within(filtros).getAllByRole('button').map(b => b.textContent);
    expect(chips).toEqual(['1 p/ conciliar', '1 com sugestões', '2 p/ criar', '3 total']);
    expect(screen.getAllByText('Já está no Livro Razão — veio da baixa em Contas a Pagar/Receber.', { exact: false }).length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: '1 sugestão' })).toBeInTheDocument();

    const alerta = await screen.findByRole('alert', {}, { timeout: 3000 });
    expect(alerta).toHaveTextContent(`Saldo NÃO confere com o extrato do banco — diferença de ${fmtBRL(320)}`);
    expect(alerta).toHaveTextContent('Sistema na mesma data (com linhas pendentes)');
    expect(state.rpc).toHaveBeenCalledWith('get_fin_saldo_conta_em', { p_conta_id: CONTA.id, p_data: '2026-09-05' });

    fireEvent.click(within(filtros).getByRole('button', { name: '1 p/ conciliar' }));
    expect(within(filtros).getByRole('button', { name: '1 p/ conciliar' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByText('Mostrando 1 de 3 linhas')).toBeInTheDocument();
    expect(screen.queryByText('NOVA DESPESA')).not.toBeInTheDocument();

    expect(escritas()).toEqual([]);
  });

  it('janela larga: tabela do extrato com as colunas e as ações de cada linha', async () => {
    largura(1366);
    restaurar([
      linha({ descricao: 'NOVA DESPESA', valor: 50, categoriaId: 'cat1' }),
      linha({ descricao: 'DESMARCADA', valor: 5, selecionada: false }),
    ]);
    render(<ConciliacaoBancariaSection />);

    const tabela = await screen.findByRole('table');
    for (const coluna of ['Data', 'Descrição (extrato)', 'Tipo', 'Valor', 'Status', 'Ações']) {
      expect(within(tabela).getByRole('columnheader', { name: coluna })).toBeInTheDocument();
    }
    expect(screen.queryByRole('list', { name: 'Linhas do extrato' })).not.toBeInTheDocument();

    const nova = within(tabela).getByText('NOVA DESPESA').closest('tr') as HTMLElement;
    expect(within(nova).getByRole('checkbox', { name: 'Incluir no processamento: NOVA DESPESA' })).toBeChecked();
    expect(within(nova).getByRole('button', { name: 'Criar' })).toBeInTheDocument();
    expect(within(nova).getByText('Criar novo')).toBeInTheDocument();
    const desmarcada = within(tabela).getByText('DESMARCADA').closest('tr') as HTMLElement;
    expect(within(desmarcada).getByRole('checkbox', { name: 'Incluir no processamento: DESMARCADA' })).not.toBeChecked();
    expect(within(desmarcada).getByText('Criar novo')).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('trocar de conta não mostra a falha de conferência da conta anterior', async () => {
    const CONTA2 = { id: 'conta-2', nome: 'Conta Dois', numero_conta: '2-2', agencia: '2', banco: '2' };
    state.contas = [CONTA, CONTA2];
    restaurar([linha({ descricao: 'LINHA CONTA UM' })], { valor: 100, data: '2026-09-05' });
    sessionStorage.setItem(`conciliacao_linhas_${rascunho(CONTA2.id)}`, JSON.stringify([linha({ descricao: 'LINHA CONTA DOIS' })]));
    sessionStorage.setItem(`conciliacao_saldo_extrato_${rascunho(CONTA2.id)}`, JSON.stringify({ valor: 200, data: '2026-09-06' }));
    state.rpc.mockImplementation((nome: string, params?: { p_conta_id?: string }) => {
      if (nome === 'get_fin_saldo_conta_em') {
        return params?.p_conta_id === CONTA.id
          ? Promise.resolve({ data: null, error: { message: 'falha' } })
          : new Promise(() => undefined); // conta 2: conferência ainda sem resposta
      }
      return Promise.resolve({ data: null, error: null });
    });
    render(<ConciliacaoBancariaSection />);
    expect(await screen.findByText('Não foi possível conferir o saldo com o extrato', {}, { timeout: 3000 })).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('combobox', { name: 'Conta bancária' }), { key: 'Enter' });
    fireEvent.click(await screen.findByRole('option', { name: /Conta Dois/ }));

    expect(await screen.findByText('LINHA CONTA DOIS')).toBeInTheDocument();
    expect(screen.queryByText('Não foi possível conferir o saldo com o extrato')).not.toBeInTheDocument();
    expect(screen.getByText('Conferindo o saldo do sistema com o extrato de 06/09/2026…')).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('Processar com baixa já no razão abre a confirmação antes de qualquer gravação', async () => {
    restaurar([
      linha({ descricao: 'BOLETO JÁ BAIXADO', valor: 320, matchId: 'm1', matchOrigin: 'lancamento', matchDescricao: 'BOLETO JÁ BAIXADO', matchJaNoRazao: true, selecionada: false }),
    ]);
    render(<ConciliacaoBancariaSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('Este pagamento já está no Livro Razão');
    expect(within(dialogo).getByRole('button', { name: 'Lançar como novo' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Confirmar e processar' })).toBeInTheDocument();
    expect(escritas()).toEqual([]);

    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);
  });

  it('possível duplicata: mesmo payload de antes (ocorrência 0) e decisão com os mesmos botões', async () => {
    restaurar([linha({ descricao: 'VENDA REPETIDA', tipo: 'RECEITA', valor: 42, categoriaId: 'cat1', fitId: 'F1' })]);
    state.rpc.mockImplementation((nome: string) => {
      if (nome === 'reconcile_import_lancamento') {
        return Promise.resolve({ data: { status: 'possible_duplicate', lancamento_id: 'dup1', criado_em: '2026-09-01T12:00:00Z' }, error: null });
      }
      return Promise.resolve({ data: state.saldoSistema, error: null });
    });
    render(<ConciliacaoBancariaSection />);

    fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(dialogo).toHaveTextContent('1 linha parece duplicada');
    expect(dialogo).toHaveTextContent('VENDA REPETIDA');
    expect(within(dialogo).getByRole('button', { name: 'Ignorar' })).toBeInTheDocument();
    expect(within(dialogo).getByRole('button', { name: 'Importar mesmo assim' })).toBeInTheDocument();
    expect(state.rpc).toHaveBeenCalledWith('reconcile_import_lancamento', expect.objectContaining({
      p_descricao: 'VENDA REPETIDA', p_valor: 42, p_tipo: 'RECEITA', p_conta_id: CONTA.id,
      p_external_id: 'F1', p_occurrence_index: 0,
    }));
    expect(escritas()).toEqual(['reconcile_import_lancamento']);
  });

  // Dentro do describe do rascunho restaurado: é ali que `restaurar` existe.
  describe('CMV financeiro', () => {
    const configCmv = (recursos: boolean) => ({
      classificacao_ativa: true,
      categorias: [{ id: 'cat1', nome: 'Peixes', cmv_sugerir: true }],
      ...(recursos ? { recursos: { lancamentos: true } } : {}),
    });
    const comConfig = (config: unknown) => state.rpc.mockImplementation((nome: string) => {
      if (nome === 'get_fin_cmv_config') return Promise.resolve({ data: config, error: null });
      if (nome === 'reconcile_import_lancamento') return Promise.resolve({ data: { status: 'ok', lancamento_id: 'novo' }, error: null });
      return Promise.resolve({ data: state.saldoSistema, error: null });
    });
    const importacao = () =>
      state.rpc.mock.calls.find(([nome]) => nome === 'reconcile_import_lancamento')?.[1] as Record<string, unknown> | undefined;

    it('linha nova leva a decisão no item do rateio e a competência ajustada; p_data segue a data do banco', async () => {
      comConfig(configCmv(true));
      restaurar([linha({ descricao: 'PIX ARROZ', valor: 55, categoriaId: 'cat1', cmvIncluir: true, competencia: '2026-09-01' })]);
      render(<ConciliacaoBancariaSection />);
      expect(await screen.findByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — PIX ARROZ' })).toBeInTheDocument();
      fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
      await waitFor(() => expect(importacao()).toBeDefined());
      expect(importacao()).toMatchObject({
        p_data: '2026-09-05', p_data_competencia: '2026-09-01',
        p_rateio_linhas: [expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: true })],
      });
    });

    it('linha salva antes do recurso segue pendente e sem competência própria', async () => {
      comConfig(configCmv(true));
      restaurar([linha({ descricao: 'PIX ANTIGO', categoriaId: 'cat1' })]);
      render(<ConciliacaoBancariaSection />);
      fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
      await waitFor(() => expect(importacao()).toBeDefined());
      expect(importacao()).not.toHaveProperty('p_data_competencia');
      expect((importacao()!.p_rateio_linhas as Record<string, unknown>[])[0].cmv_incluir).toBeNull();
    });

    it('rateio: a linha abre com a resposta da linha e a resposta trocada no diálogo é a que vai ao banco', async () => {
      comConfig(configCmv(true));
      restaurar([linha({ descricao: 'PIX ARROZ', valor: 55, categoriaId: 'cat1', cmvIncluir: true })]);
      render(<ConciliacaoBancariaSection />);
      expect(await screen.findByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — PIX ARROZ' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Ratear' }));
      const dialogo = await screen.findByRole('dialog');
      const grupo = within(dialogo).getByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — linha 1 do rateio' });
      expect(within(grupo).getByRole('radio', { name: 'Sim' })).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(within(grupo).getByRole('radio', { name: 'Não' }));
      fireEvent.click(within(dialogo).getByRole('button', { name: /Salvar Rateio/ }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      // Com rateio de uma linha, o Sim/Não da linha mostra a resposta do rateio.
      const naLinha = await screen.findByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — PIX ARROZ' });
      expect(within(naLinha).getByRole('radio', { name: 'Não' })).toHaveAttribute('aria-checked', 'true');
      fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
      await waitFor(() => expect(importacao()).toBeDefined());
      expect((importacao()!.p_rateio_linhas as Record<string, unknown>[])).toEqual([
        expect.objectContaining({ categoria_id: 'cat1', cmv_incluir: false }),
      ]);
    });

    it('rateio aberto só para responder Sim/Não: o centro de custo padrão da categoria não se perde', async () => {
      comConfig(configCmv(true));
      state.categorias = [{ id: 'cat1', nome: 'Peixes', tipo: 'despesa', parent_id: null, centro_custo_padrao_id: 'cc9', excluir_dos_totais: false }];
      restaurar([linha({ descricao: 'PIX ARROZ', valor: 55, categoriaId: 'cat1' })]);
      render(<ConciliacaoBancariaSection />);
      expect(await screen.findByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — PIX ARROZ' })).toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Ratear' }));
      const dialogo = await screen.findByRole('dialog');
      const grupo = within(dialogo).getByRole('radiogroup', { name: 'Aparecer no CMV financeiro? — linha 1 do rateio' });
      fireEvent.click(within(grupo).getByRole('radio', { name: 'Sim' }));
      fireEvent.click(within(dialogo).getByRole('button', { name: /Salvar Rateio/ }));
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      fireEvent.click(await screen.findByRole('button', { name: 'Processar' }));
      await waitFor(() => expect(importacao()).toBeDefined());
      expect((importacao()!.p_rateio_linhas as Record<string, unknown>[])).toEqual([
        expect.objectContaining({ categoria_id: 'cat1', centro_custo_id: 'cc9', cmv_incluir: true }),
      ]);
    });

    it('banco sem o recurso: nada novo na tela nem no payload', async () => {
      comConfig(configCmv(false));
      restaurar([linha({ descricao: 'PIX SEM RECURSO', categoriaId: 'cat1', cmvIncluir: true, competencia: '2026-09-01' })]);
      render(<ConciliacaoBancariaSection />);
      expect(await screen.findByText('PIX SEM RECURSO')).toBeInTheDocument();
      // A configuração já respondeu (sem `recursos`) antes de conferir que nada novo apareceu.
      await waitFor(() => expect(state.rpc.mock.calls.some(([nome]) => nome === 'get_fin_cmv_config')).toBe(true));
      await act(async () => { await Promise.resolve(); });
      expect(screen.queryByRole('radiogroup', { name: /Aparecer no CMV financeiro/ })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /Alterar a competência/ })).not.toBeInTheDocument();
      fireEvent.click(screen.getByRole('button', { name: 'Processar' }));
      await waitFor(() => expect(importacao()).toBeDefined());
      expect(importacao()).not.toHaveProperty('p_data_competencia');
      expect((importacao()!.p_rateio_linhas as Record<string, unknown>[])[0]).not.toHaveProperty('cmv_incluir');
    });
  });
});

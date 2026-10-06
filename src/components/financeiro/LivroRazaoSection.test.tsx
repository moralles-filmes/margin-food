import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import LivroRazaoSection from '@/components/financeiro/LivroRazaoSection';
import { dropNavigationRequest, requestNavigation } from '@/hooks/useNavigationRequest';
import { fmtBRL } from '@/lib/formatters';

const state = vi.hoisted(() => ({
  items: [] as Record<string, unknown>[],
  listError: null as null | { message: string },
  rpc: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

const tableData: Record<string, unknown> = {};
const tableError: Record<string, { message: string } | undefined> = {};
/** Segura a resposta de uma tabela até a promise resolver (para provar a ordem das respostas). */
const tableGate: Record<string, Promise<void> | undefined> = {};

// Encadeável: o salvar consulta `.in().gte().lte().limit()` e a edição, `.eq().maybeSingle()`.
function builder(table: string) {
  const b: Record<string, unknown> = {};
  for (const m of ['select', 'eq', 'in', 'gte', 'lte', 'order', 'limit', 'maybeSingle']) b[m] = () => b;
  b.then = (resolve: (r: unknown) => unknown, reject?: (e: unknown) => unknown) =>
    (tableGate[table] ?? Promise.resolve()).then(() => ({
      data: tableError[table] ? null : (table in tableData ? tableData[table] : []),
      error: tableError[table] ?? null,
    })).then(resolve, reject);
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc: (name: string, params?: unknown) => state.rpc(name, params),
};

type FormProps = {
  form: Record<string, unknown>;
  cmv: unknown;
  rateioLines: Record<string, unknown>[];
  onFormChange: (f: Record<string, unknown>) => void;
  onRateioLinesChange: (l: Record<string, unknown>[]) => void;
  onJustificativaChange: (v: string) => void;
  onSave: () => Promise<void> | void;
};
const formulario = vi.hoisted(() => ({ props: null as null | FormProps }));
const detalhe = vi.hoisted(() => ({ props: null as null | { open: boolean; data: Record<string, unknown> | null } }));

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useChavesPendentes', () => ({
  useChavesPendentes: () => ({ chave: vi.fn(), confirmar: vi.fn(), renovar: vi.fn() }),
}));
vi.mock('@/components/financeiro/ContaFormDialog', () => ({
  default: (props: FormProps) => { formulario.props = props; return null; },
}));
vi.mock('@/components/financeiro/ContaDetailDialog', () => ({
  default: (props: { open: boolean; data: Record<string, unknown> | null }) => { detalhe.props = props; return null; },
}));

const lancamento = (over: Record<string, unknown>) => ({
  id: 'x', tipo: 'DESPESA', status: 'REALIZADO', valor: 10, descricao: 'Lançamento', observacoes: null,
  conta_id: 'c1', conta_destino_id: null, categoria_id: null, centro_custo_id: null,
  data_competencia: '2026-03-10', data_ledger: '2026-03-10', data_vencimento: null, data_pagamento: '2026-03-10',
  forma_pagamento: 'pix', origem: 'manual', recorrente: false, recorrencia_config: null, conciliado: false,
  referencia_id: null, updated_at: '2026-03-10T12:00:00Z', saldo_apos: null, ...over,
});

beforeEach(() => {
  formulario.props = null;
  detalhe.props = null;
  dropNavigationRequest();
  for (const k of Object.keys(tableData)) delete tableData[k];
  for (const k of Object.keys(tableError)) delete tableError[k];
  for (const k of Object.keys(tableGate)) delete tableGate[k];
  Object.assign(tableData, { fin_categorias: [], fin_centros_custo: [], fin_contas: [{ id: 'c1', nome: 'Banco Alfa' }] });
  state.toast.success.mockReset();
  state.toast.error.mockReset();
  state.items = [
    lancamento({ id: 'l1', tipo: 'DESPESA', valor: 40, descricao: 'Compra de insumos', data_ledger: '2026-03-10', saldo_apos: 960 }),
    lancamento({ id: 'l2', tipo: 'RECEITA', status: 'PREVISTO', valor: 200, descricao: 'Venda prevista', data_ledger: '2026-03-09', origem: 'conciliacao', conciliado: true }),
  ];
  state.listError = null;
  state.rpc.mockReset();
  state.rpc.mockImplementation((name: string) => {
    if (name === 'list_fin_lancamentos_cursor') {
      return Promise.resolve(state.listError
        ? { data: null, error: state.listError }
        : { data: { items: state.items, has_more: false }, error: null });
    }
    if (name === 'get_fin_lancamentos_totais') {
      return Promise.resolve({ data: { total_receita: 200, total_despesa: 40, total_transferencia: 0, resultado: 160 }, error: null });
    }
    if (name === 'get_fin_saldo_atual') return Promise.resolve({ data: 1234.56, error: null });
    return Promise.resolve({ data: null, error: null });
  });
});

describe('Livro Razão (V2)', () => {
  it('saldo rotulado com a data do filtro, período nos totais e os mesmos parâmetros de antes', async () => {
    render(<LivroRazaoSection initialContaId="c1" initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Saldo em 31/03/2026')).toBeInTheDocument();
    expect(await screen.findByText('Banco Alfa · realizados até o fim do dia')).toBeInTheDocument();
    expect(screen.getByText(fmtBRL(1234.56))).toBeInTheDocument();
    expect(screen.getByText('01/03/2026 a 31/03/2026')).toBeInTheDocument();
    expect(screen.getByText('Entradas')).toBeInTheDocument();
    expect(screen.getByText('Resultado')).toBeInTheDocument();
    // A RPC de totais soma previstos; o saldo, só realizados.
    expect(screen.getAllByText('Realizados e previstos')).toHaveLength(3);

    expect(state.rpc).toHaveBeenCalledWith('list_fin_lancamentos_cursor', expect.objectContaining({
      p_start: '2026-03-01', p_end: '2026-03-31', p_tipo: null, p_conta_id: 'c1', p_origem: null,
      p_limit: 50, p_cursor_date: null, p_cursor_id: null,
    }));
    expect(state.rpc).toHaveBeenCalledWith('get_fin_saldo_atual', { p_conta_id: 'c1', p_data: '2026-03-31' });
  });

  it('cabeçalho do dia diz "fim do dia" sem filtro de linha e tipos aparecem como Receita/Despesa', async () => {
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect((await screen.findAllByText('Compra de insumos')).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Saldo no fim do dia').length).toBeGreaterThan(0);
    expect(screen.getAllByText(fmtBRL(960)).length).toBeGreaterThan(0);
    expect(screen.getAllByText('Despesa').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Receita').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Previsto').length).toBeGreaterThan(0);
    expect(screen.getAllByText(`- ${fmtBRL(40)}`).length).toBeGreaterThan(0);
    expect(screen.getAllByText(`+ ${fmtBRL(200)}`).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Editar lançamento Compra de insumos' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Editar classificação de Venda prevista' }).length).toBeGreaterThan(0);
    expect(screen.getAllByRole('button', { name: 'Excluir lançamento Compra de insumos' }).length).toBeGreaterThan(0);
  });

  it('transferências com filtro de conta dizem que só as enviadas entram no total', async () => {
    render(<LivroRazaoSection initialTipo="TRANSFERENCIA" initialContaId="c1" initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Transferências enviadas pela conta')).toBeInTheDocument();
    expect(screen.getByText('As recebidas não entram neste total')).toBeInTheDocument();
  });

  it('resposta atrasada de um pedido antigo não sobrescreve a do pedido mais recente', async () => {
    let falharPedidoAntigo: (v: unknown) => void = () => undefined;
    let chamadas = 0;
    const base = state.rpc.getMockImplementation()!;
    state.rpc.mockImplementation((name: string, params?: unknown) => {
      if (name === 'get_fin_saldo_atual' && chamadas++ === 0) {
        return new Promise(resolve => { falharPedidoAntigo = resolve; });
      }
      return base(name, params);
    });
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText(fmtBRL(1234.56))).toBeInTheDocument();
    await act(async () => { falharPedidoAntigo({ data: null, error: { message: 'falhou' } }); });
    expect(screen.queryByText('Não foi possível carregar os totais')).toBeNull();
    expect(screen.getByText(fmtBRL(1234.56))).toBeInTheDocument();
  });

  it('com filtro de tipo o saldo do dia é o do último lançamento listado e o total é só daquele tipo', async () => {
    render(<LivroRazaoSection initialTipo="DESPESA" initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Total de saídas')).toBeInTheDocument();
    expect(screen.getAllByText('Saldo após o último lançamento listado').length).toBeGreaterThan(0);
    expect(screen.queryByText('Resultado')).toBeNull();
    expect(state.rpc).toHaveBeenCalledWith('list_fin_lancamentos_cursor', expect.objectContaining({ p_tipo: 'DESPESA' }));
  });

  it('erro da lista mostra estado de erro (não "nenhum lançamento") e tenta de novo', async () => {
    state.listError = { message: 'falhou' };
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);

    expect(await screen.findByText('Não foi possível carregar os lançamentos')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum lançamento encontrado')).toBeNull();

    state.listError = null;
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    await waitFor(() => expect(screen.getAllByText('Compra de insumos').length).toBeGreaterThan(0));
  });

  it('lista vazia mostra o estado vazio', async () => {
    state.items = [];
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    expect(await screen.findByText('Nenhum lançamento encontrado')).toBeInTheDocument();
  });
});

const comConfig = (config: unknown) => {
  const base = state.rpc.getMockImplementation()!;
  state.rpc.mockImplementation((name: string, params?: unknown) =>
    name === 'get_fin_cmv_config' ? Promise.resolve({ data: config, error: null }) : base(name, params));
};
/** Só depois da resposta de `get_fin_cmv_config` o `cmv` do formulário vale como "sem o recurso". */
const configCarregada = async () => {
  await waitFor(() => expect(state.rpc.mock.calls.some(([nome]) => nome === 'get_fin_cmv_config')).toBe(true));
  await act(async () => {});
};
const chamada = (nome: string) => state.rpc.mock.calls.find(([n]) => n === nome)?.[1] as Record<string, unknown> | undefined;

describe('Livro Razão — CMV financeiro na despesa nova', () => {
  const novaDespesa = async () => {
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova Despesa/ }));
  };
  const salvarCom = async (campos: Record<string, unknown>) => {
    act(() => formulario.props!.onFormChange({ ...formulario.props!.form, ...campos }));
    await act(async () => { await formulario.props!.onSave(); });
    return chamada('_guarded_upsert_lancamento');
  };

  it('com o recurso no banco, o formulário recebe a configuração e o salvar envia a decisão', async () => {
    comConfig({ classificacao_ativa: true, categorias: [{ id: 'cat-peixe', nome: 'Peixes', cmv_sugerir: true }], recursos: { lancamentos: true } });
    await novaDespesa();
    await waitFor(() => expect(formulario.props?.cmv).toMatchObject({ ativo: true }));
    expect((formulario.props!.cmv as { padroes: Map<string, boolean | null> }).padroes.get('cat-peixe')).toBe(true);
    const args = await salvarCom({ descricao: 'PIX arroz', valor: 55, categoria_id: 'cat-peixe', cmv_incluir: true });
    expect(args).toMatchObject({ p_tipo: 'DESPESA', p_categoria_id: 'cat-peixe', p_rateios: [], p_cmv: { incluir: true } });
  });

  it('classificação desligada: o formulário vem sem sugestão e a despesa nasce pendente', async () => {
    comConfig({ classificacao_ativa: false, categorias: [{ id: 'cat-peixe', nome: 'Peixes', cmv_sugerir: true }], recursos: { lancamentos: true } });
    await novaDespesa();
    await waitFor(() => expect(formulario.props?.cmv).not.toBeNull());
    expect(formulario.props!.cmv).toMatchObject({ ativo: false });
    expect((formulario.props!.cmv as { padroes: Map<string, unknown> }).padroes.size).toBe(0);
    const args = await salvarCom({ descricao: 'PIX arroz', valor: 55, categoria_id: 'cat-peixe' });
    expect(args).toMatchObject({ p_cmv: { incluir: null } });
  });

  it('banco sem o recurso: formulário sem CMV e o payload de antes', async () => {
    comConfig({ classificacao_ativa: true, categorias: [] });
    await novaDespesa();
    await configCarregada();
    expect(formulario.props).not.toBeNull();
    expect(formulario.props!.cmv).toBeNull();
    const args = await salvarCom({ descricao: 'PIX arroz', valor: 55, categoria_id: 'cat-peixe' });
    expect(args).toBeDefined();
    expect(args).not.toHaveProperty('p_cmv');
  });

  it('receita nunca envia a decisão, nem no cabeçalho nem nas linhas do rateio', async () => {
    comConfig({ classificacao_ativa: true, categorias: [], recursos: { lancamentos: true } });
    await novaDespesa();
    await waitFor(() => expect(formulario.props?.cmv).not.toBeNull());
    act(() => formulario.props!.onRateioLinesChange([
      { key: 'r1', id: 'rateio-1', categoria_id: 'cat-venda', centro_custo_id: '', valor: 10, percentual: 100, cmv_incluir: true },
    ]));
    const args = await salvarCom({ tipo: 'RECEITA', descricao: 'Venda', valor: 10, categoria_id: 'cat-venda', cmv_incluir: true });
    expect(args).not.toHaveProperty('p_cmv');
    const rateios = args!.p_rateios as Record<string, unknown>[];
    expect(rateios).toHaveLength(1);
    expect(rateios[0]).not.toHaveProperty('cmv_incluir');
    expect(rateios[0]).not.toHaveProperty('id');
  });

  it('despesa que virou receita e voltou a despesa envia a decisão que o formulário guarda', async () => {
    comConfig({ classificacao_ativa: true, categorias: [], recursos: { lancamentos: true } });
    await novaDespesa();
    await waitFor(() => expect(formulario.props?.cmv).not.toBeNull());
    act(() => formulario.props!.onFormChange({ ...formulario.props!.form, tipo: 'DESPESA', descricao: 'PIX arroz', valor: 55, categoria_id: 'cat-peixe', cmv_incluir: true }));
    act(() => formulario.props!.onFormChange({ ...formulario.props!.form, tipo: 'RECEITA' }));
    expect(formulario.props!.form).toMatchObject({ tipo: 'RECEITA', cmv_incluir: true });
    const args = await salvarCom({ tipo: 'DESPESA' });
    expect(args).toMatchObject({ p_tipo: 'DESPESA', p_cmv: { incluir: true } });
  });
});

describe('Livro Razão — editar com a decisão do CMV', () => {
  const comRecurso = () => comConfig({ classificacao_ativa: true, categorias: [], recursos: { lancamentos: true } });
  const conciliada = () => lancamento({
    id: 'l3', tipo: 'DESPESA', valor: 55, descricao: 'PIX arroz', categoria_id: 'cat-peixe',
    conciliado: true, origem: 'conciliacao', updated_at: '2026-03-10T12:00:00Z',
  });
  const abrirClassificacao = async () => {
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    await configCarregada();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar classificação de PIX arroz' }))[0]);
    await waitFor(() => expect(formulario.props?.form).toMatchObject({ descricao: 'PIX arroz' }));
  };
  const salvarClassificacao = async (campos: Record<string, unknown> = {}) => {
    act(() => formulario.props!.onFormChange({ ...formulario.props!.form, ...campos }));
    act(() => formulario.props!.onJustificativaChange('Reclassificação do mês'));
    await act(async () => { await formulario.props!.onSave(); });
    return chamada('_guarded_update_reconciled_classification');
  };

  beforeEach(() => {
    state.items = [conciliada()];
    tableData.fin_lancamentos = { cmv_incluir: true };
  });

  it('conciliado: lê a decisão ao abrir e manda decisão e a nova competência', async () => {
    comRecurso();
    await abrirClassificacao();
    expect(formulario.props!.form.cmv_incluir).toBe(true);
    expect(formulario.props!.cmv).not.toBeNull();
    const args = await salvarClassificacao({ data_competencia: '2026-02-28' });
    expect(args).toMatchObject({ p_id: 'l3', p_categoria_id: 'cat-peixe', p_rateios: [], p_cmv: { incluir: true }, p_data_competencia: '2026-02-28' });
  });

  it('competência intacta não vai no payload', async () => {
    comRecurso();
    await abrirClassificacao();
    const args = await salvarClassificacao();
    expect(args).toMatchObject({ p_cmv: { incluir: true } });
    expect(args).not.toHaveProperty('p_data_competencia');
  });

  it('com rateio, a decisão é de cada linha: mantém o id da linha e o cabeçalho vai nulo', async () => {
    comRecurso();
    tableData.fin_lancamento_rateios = [{ id: 'rt-1', categoria_id: 'cat-peixe', centro_custo_id: null, valor: 55, percentual: 100, cmv_incluir: false }];
    await abrirClassificacao();
    expect(formulario.props!.rateioLines[0]).toMatchObject({ id: 'rt-1', cmv_incluir: false });
    const args = await salvarClassificacao();
    expect(args).toMatchObject({ p_categoria_id: null, p_cmv: { incluir: null } });
    expect((args!.p_rateios as unknown[])[0]).toMatchObject({ id: 'rt-1', categoria_id: 'cat-peixe', cmv_incluir: false });
  });

  it('se a decisão não pôde ser lida, o formulário fica sem CMV e nada dela é enviado', async () => {
    comRecurso();
    tableError.fin_lancamentos = { message: 'coluna cmv_incluir inexistente' };
    tableData.fin_lancamento_rateios = [{ id: 'rt-1', categoria_id: 'cat-peixe', centro_custo_id: null, valor: 55, percentual: 100, cmv_incluir: false }];
    await abrirClassificacao();
    expect(formulario.props!.cmv).toBeNull();
    const args = await salvarClassificacao();
    expect(args).toBeDefined();
    expect(args).not.toHaveProperty('p_cmv');
    expect((args!.p_rateios as unknown[])[0]).not.toHaveProperty('cmv_incluir');
    expect((args!.p_rateios as unknown[])[0]).not.toHaveProperty('id');
  });

  it('banco sem o recurso: payload de antes, sem decisão e sem competência', async () => {
    comConfig({ classificacao_ativa: true, categorias: [] });
    await abrirClassificacao();
    await configCarregada();
    expect(formulario.props!.cmv).toBeNull();
    const args = await salvarClassificacao({ data_competencia: '2026-02-28' });
    expect(args).toBeDefined();
    expect(args).not.toHaveProperty('p_cmv');
    expect(args).not.toHaveProperty('p_data_competencia');
  });

  it('lançamento não conciliado: a edição também envia a decisão lida', async () => {
    comRecurso();
    state.items = [lancamento({ id: 'l4', tipo: 'DESPESA', valor: 40, descricao: 'Compra de insumos', categoria_id: 'cat-peixe' })];
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    await configCarregada();
    fireEvent.click((await screen.findAllByRole('button', { name: 'Editar lançamento Compra de insumos' }))[0]);
    await waitFor(() => expect(formulario.props?.form).toMatchObject({ descricao: 'Compra de insumos', cmv_incluir: true }));
    act(() => formulario.props!.onJustificativaChange('Ajuste'));
    await act(async () => { await formulario.props!.onSave(); });
    expect(chamada('_guarded_upsert_lancamento')).toMatchObject({ p_id: 'l4', p_cmv: { incluir: true } });
  });
});

describe('Livro Razão — abrir o lançamento vindo do CMV', () => {
  const abrirVindoDoCmv = (id: string) => {
    requestNavigation({ tab: 'financeiro', subtab: 'lancamentos', record: { type: 'lancamento', id } });
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
  };

  it('busca o lançamento pelo id (mesmo fora da página carregada) e abre o detalhe', async () => {
    tableData.fin_lancamentos = lancamento({ id: 'l9', descricao: 'Vindo do CMV', data_competencia: '2026-01-05', data_pagamento: null });
    abrirVindoDoCmv('l9');
    await waitFor(() => expect(detalhe.props?.open).toBe(true));
    expect(detalhe.props!.data).toMatchObject({ id: 'l9', descricao: 'Vindo do CMV', data_competencia: '2026-01-05' });
  });

  it('só abre o detalhe quando categorias e contas já carregaram, para ele sair com os nomes', async () => {
    let liberar: () => void = () => undefined;
    tableGate.fin_categorias = new Promise<void>(resolve => { liberar = resolve; });
    tableData.fin_categorias = [{ id: 'cat-x', nome: 'Peixes', tipo: 'despesa', parent_id: null, centro_custo_padrao_id: null }];
    tableData.fin_lancamentos = lancamento({ id: 'l9', descricao: 'Vindo do CMV', categoria_id: 'cat-x', conta_id: 'c1' });
    abrirVindoDoCmv('l9');
    // O lançamento já foi buscado (o pedido não depende das listas), mas as listas ainda não chegaram.
    await act(async () => { await new Promise(resolve => setTimeout(resolve, 30)); });
    expect(detalhe.props?.open ?? false).toBe(false);

    await act(async () => { liberar(); });
    await waitFor(() => expect(detalhe.props?.open).toBe(true));
    expect(detalhe.props!.data).toMatchObject({ id: 'l9', categoria_nome: 'Peixes', conta_nome: 'Banco Alfa' });
  });

  it('lançamento inexistente avisa e não abre nada', async () => {
    tableData.fin_lancamentos = null;
    abrirVindoDoCmv('sumiu');
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Lançamento não encontrado.'));
    expect(detalhe.props?.open ?? false).toBe(false);
  });

  it('falha na leitura registra o erro antes do aviso', async () => {
    const erro = vi.spyOn(console, 'error').mockImplementation(() => {});
    tableError.fin_lancamentos = { message: 'falhou' };
    abrirVindoDoCmv('l9');
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith('Lançamento não encontrado.'));
    expect(erro).toHaveBeenCalledWith('[LivroRazaoSection.navegacao]', { message: 'falhou' });
    erro.mockRestore();
  });

  it('pedido de outro tipo de registro não abre o detalhe', async () => {
    requestNavigation({ tab: 'financeiro', record: { type: 'conta_pagar', id: 'cp1' } });
    render(<LivroRazaoSection initialDateFrom="2026-03-01" initialDateTo="2026-03-31" />);
    await screen.findAllByText('Compra de insumos');
    expect(detalhe.props?.open ?? false).toBe(false);
  });
});

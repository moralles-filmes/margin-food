import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CategorizacaoSection from './CategorizacaoSection';

/**
 * Cliente falso: responde às leituras (regras, nomes, contagem e prévia) e registra TODA chamada.
 * "Aplicar Regras" só com resultado simulado; editar/desativar com o UPDATE simulado (gravou ou a RLS descartou).
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  rpcArgs: {} as Record<string, unknown>,
  tableWrites: [] as string[],
  // Linhas devolvidas pelo UPDATE ... select('id'); [] = a RLS descartou sem erro.
  linhasUpdate: [{ id: 'r2' }] as unknown[],
  previewTotal: undefined as number | undefined,
  aplicar: { total: 7, categorizados: 3, regras_com_erro: [] as string[] },
  dados: {} as Record<string, unknown[]>,
  erro: {} as Record<string, boolean>,
  contagem: 7 as number | null,
  contagemErro: false,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

const LEITURAS = new Set(['contar_lancamentos_sem_categoria', 'preview_regra_categorizacao']);

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  let atualizacao = false;
  Object.assign(b, {
    select: self, order: self, eq: self, limit: self,
    insert: () => { state.tableWrites.push(`insert:${table}`); return b; },
    update: () => { state.tableWrites.push(`update:${table}`); atualizacao = true; return b; },
    delete: () => { state.tableWrites.push(`delete:${table}`); return b; },
    then: (resolve: (v: unknown) => void) => Promise.resolve(state.erro[table]
      ? { data: null, error: { message: 'falha simulada' } }
      : { data: atualizacao ? state.linhasUpdate : state.dados[table] ?? [], error: null }).then(resolve),
  });
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc(name: string, args?: unknown) {
    state.rpcCalls.push(name);
    state.rpcArgs[name] = args;
    if (name === 'contar_lancamentos_sem_categoria') {
      return Promise.resolve(state.contagemErro ? { data: null, error: { message: 'falha' } } : { data: state.contagem, error: null });
    }
    if (name === 'preview_regra_categorizacao') {
      return Promise.resolve({ data: [{ id: 'l1', descricao: 'Pagamento aluguel teste', valor: 1500, data_competencia: '2026-01-05', total: state.previewTotal }], error: null });
    }
    if (name === 'aplicar_regras_categorizacao') return Promise.resolve({ data: state.aplicar, error: null });
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'empresa-teste' }) }));

const TODAS = ['view', 'create', 'edit', 'delete', 'manage'].map(a => `financeiro:categorizacao:${a}`);
const escritas = () => [...state.rpcCalls.filter(n => !LEITURAS.has(n)), ...state.tableWrites];
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });

beforeEach(() => {
  state.rpcCalls = [];
  state.rpcArgs = {};
  state.tableWrites = [];
  state.linhasUpdate = [{ id: 'r2' }];
  state.previewTotal = undefined;
  state.aplicar = { total: 7, categorizados: 3, regras_com_erro: [] };
  state.erro = {};
  state.contagem = 7;
  state.contagemErro = false;
  state.perms = new Set(TODAS);
  state.dados = {
    fin_regras_categorizacao: [
      { id: 'r1', padrao: '^IFOOD.*REPASSE', tipo_match: 'regex', categoria_id: 'k1', centro_custo_id: 'c1', prioridade: 20 },
      { id: 'r2', padrao: 'aluguel', tipo_match: 'contem', categoria_id: 'k2', centro_custo_id: null, prioridade: 10 },
    ],
    fin_categorias: [{ id: 'k1', nome: 'Delivery Teste', tipo: 'receita' }, { id: 'k2', nome: 'Aluguel Teste', tipo: 'despesa' }],
    fin_centros_custo: [{ id: 'c1', nome: 'Salão Teste' }],
  };
  largura(1366);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Categorização (V2)', () => {
  it('situação com a contagem do servidor, alerta e regras; nenhuma escrita ao abrir', async () => {
    render(<CategorizacaoSection />);
    const situacao = await screen.findByRole('region', { name: 'Situação' });
    await waitFor(() => expect(within(situacao).getByText('7')).toBeInTheDocument());
    expect(within(situacao).getByText('2')).toBeInTheDocument();
    expect(within(situacao).getByText('Receitas e despesas sem categoria; transferências e cancelados ficam de fora')).toBeInTheDocument();
    expect(screen.getByText('7 lançamento(s) sem categoria.')).toBeInTheDocument();
    const tabela = screen.getByRole('table');
    expect(within(tabela).getByText('Delivery Teste')).toBeInTheDocument();
    expect(within(tabela).getByText('Regex')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar regra aluguel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar regra aluguel' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Aplicar Regras/ })).toBeEnabled();
    expect(escritas()).toEqual([]);
  });

  it('sem lançamentos sem categoria: Aplicar Regras desabilitado, como antes', async () => {
    state.contagem = 0;
    render(<CategorizacaoSection />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Aplicar Regras/ })).toBeDisabled());
    expect(screen.queryByText(/lançamento\(s\) sem categoria\./)).not.toBeInTheDocument();
  });

  it('regras não carregaram: erro com nova tentativa, não "Nenhuma regra cadastrada"', async () => {
    state.erro.fin_regras_categorizacao = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CategorizacaoSection />);
    expect(await screen.findByText('Não foi possível carregar as regras')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma regra cadastrada')).not.toBeInTheDocument();
    expect(screen.getByText('Indisponível: as regras não carregaram')).toBeInTheDocument();
    // O alerta de pendentes não manda "criar regras" quando elas só não carregaram.
    expect(screen.getByText('As regras não carregaram; tente de novo na lista abaixo.')).toBeInTheDocument();
    expect(screen.queryByText(/Crie regras de categorização/)).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('contagem não carregou: "—", nunca zero', async () => {
    state.contagemErro = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CategorizacaoSection />);
    expect(await screen.findByText('Indisponível: a contagem não carregou')).toBeInTheDocument();
    expect(within(screen.getByRole('region', { name: 'Situação' })).getByText('—')).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('Testar Regra mostra a prévia com o padrão testado e avisa quando o padrão muda; fechar não grava', async () => {
    render(<CategorizacaoSection />);
    await screen.findByRole('table');
    fireEvent.click(screen.getByRole('button', { name: /Nova Regra/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nova Regra de Categorização' });
    for (const rotulo of ['Padrão de texto', 'Tipo de correspondência', 'Prioridade (maior = primeiro)', 'Centro de Custo (opcional)']) {
      expect(within(dialogo).getByLabelText(rotulo)).toBeInTheDocument();
    }
    expect(within(dialogo).getByRole('combobox', { name: 'Categoria' })).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText('Padrão de texto'), { target: { value: 'aluguel' } });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Testar Regra/ }));
    expect(await within(dialogo).findByText('1 lançamento(s) seriam categorizados:')).toBeInTheDocument();
    expect(within(dialogo).getByText(/Padrão testado: “aluguel” \(Contém\)/)).toBeInTheDocument();
    expect(within(dialogo).getByText('Pagamento aluguel teste')).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText('Padrão de texto'), { target: { value: 'aluguel loja' } });
    expect(within(dialogo).getByText('O padrão ou a categoria mudou depois do teste: teste de novo.')).toBeInTheDocument();

    fireEvent.keyDown(dialogo, { key: 'Escape' });
    const guard = await screen.findByRole('alertdialog');
    fireEvent.click(within(guard).getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova Regra de Categorização' })).not.toBeInTheDocument());
    expect(state.rpcCalls).toContain('preview_regra_categorizacao');
    // Sem categoria escolhida, a prévia não filtra por tipo.
    expect(state.rpcArgs.preview_regra_categorizacao).toEqual({ p_padrao: 'aluguel', p_tipo_match: 'contem' });
    expect(escritas()).toEqual([]);
  });

  it('prévia de regra com categoria manda a categoria (só o tipo dela)', async () => {
    render(<CategorizacaoSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar regra aluguel' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar Regra' });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Testar Regra/ }));
    expect(await within(dialogo).findByText(/lançamentos do tipo da categoria sem categoria nem rateio/)).toBeInTheDocument();
    expect(state.rpcArgs.preview_regra_categorizacao).toEqual({ p_padrao: 'aluguel', p_tipo_match: 'contem', p_categoria_id: 'k2' });
  });

  it('prévia com mais casamentos do que exemplos mostra o total', async () => {
    state.previewTotal = 134;
    render(<CategorizacaoSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar regra aluguel' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar Regra' });
    fireEvent.click(within(dialogo).getByRole('button', { name: /Testar Regra/ }));
    expect(await within(dialogo).findByText('134 lançamento(s) seriam categorizados; os 1 mais recentes:')).toBeInTheDocument();
  });

  it('Aplicar Regras pede confirmação: cancelar não chama o banco', async () => {
    render(<CategorizacaoSection />);
    await screen.findByText('7 lançamento(s) sem categoria.');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar Regras/ }));
    const confirmacao = await screen.findByRole('alertdialog');
    expect(within(confirmacao).getByText(/As 2 regra\(s\) ativa\(s\) vão classificar .* \(até 7\)/)).toBeInTheDocument();
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(state.rpcCalls).not.toContain('aplicar_regras_categorizacao');
  });

  it('Aplicar Regras confirmado: resultado e aviso das regras com Regex recusado pelo banco', async () => {
    state.aplicar = { total: 7, categorizados: 3, regras_com_erro: ['(?<nome>x)'] };
    render(<CategorizacaoSection />);
    await screen.findByText('7 lançamento(s) sem categoria.');
    fireEvent.click(screen.getByRole('button', { name: /Aplicar Regras/ }));
    fireEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Aplicar' }));
    await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith('3 lançamento(s) categorizado(s) de 7 analisados'));
    expect(state.toast.warning).toHaveBeenCalledWith(
      'Regra(s) ignorada(s) porque o banco recusou o Regex: (?<nome>x). Corrija o padrão e aplique de novo.');
  });

  it('Desativar segue a permissão do banco (editar), não a de excluir', async () => {
    state.perms = new Set(['financeiro:categorizacao:view', 'financeiro:categorizacao:delete']);
    const { unmount } = render(<CategorizacaoSection />);
    await screen.findByRole('table');
    expect(screen.queryByRole('button', { name: 'Desativar regra aluguel' })).not.toBeInTheDocument();
    unmount();

    state.perms = new Set(['financeiro:categorizacao:view', 'financeiro:categorizacao:edit']);
    render(<CategorizacaoSection />);
    expect(await screen.findByRole('button', { name: 'Desativar regra aluguel' })).toBeInTheDocument();
  });

  it('editar regra que a RLS não deixou gravar: erro, nunca "Regra atualizada"', async () => {
    state.linhasUpdate = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CategorizacaoSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Editar regra aluguel' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar Regra' });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith(
      'A regra não foi salva: sem permissão para editar regras ou a regra não existe mais.'));
    expect(state.toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog', { name: 'Editar Regra' })).toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('desativar regra que a RLS não deixou gravar: erro, nunca "Regra desativada"', async () => {
    state.linhasUpdate = [];
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CategorizacaoSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar regra aluguel' }));
    const confirmacao = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(state.toast.error).toHaveBeenCalledWith(
      'A regra não foi desativada: sem permissão para editar regras ou a regra não existe mais.'));
    expect(state.toast.success).not.toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it('desativar regra gravada: sucesso', async () => {
    render(<CategorizacaoSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Desativar regra aluguel' }));
    const confirmacao = await screen.findByRole('alertdialog');
    fireEvent.click(within(confirmacao).getByRole('button', { name: 'Desativar' }));
    await waitFor(() => expect(state.toast.success).toHaveBeenCalledWith('Regra desativada'));
    expect(state.toast.error).not.toHaveBeenCalled();
  });

  it('"Ver no Livro Razão" no aviso de pendentes só com o atalho disponível', async () => {
    const verSemCategoria = vi.fn();
    const { unmount } = render(<CategorizacaoSection onVerSemCategoria={verSemCategoria} />);
    fireEvent.click(await screen.findByRole('button', { name: /Ver no Livro Razão/ }));
    expect(verSemCategoria).toHaveBeenCalledTimes(1);
    unmount();

    render(<CategorizacaoSection />);
    await screen.findByText('7 lançamento(s) sem categoria.');
    expect(screen.queryByRole('button', { name: /Ver no Livro Razão/ })).not.toBeInTheDocument();
  });

  it('tela estreita: cartões com as mesmas ações', async () => {
    largura(390);
    render(<CategorizacaoSection />);
    expect(await screen.findByText('aluguel')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar regra ^IFOOD.*REPASSE' })).toBeInTheDocument();
  });

  it('sem permissão: acesso restrito e nenhuma consulta', () => {
    state.perms = new Set();
    render(<CategorizacaoSection />);
    expect(screen.getByText('Acesso restrito')).toBeInTheDocument();
    expect(state.rpcCalls).toEqual([]);
  });
});

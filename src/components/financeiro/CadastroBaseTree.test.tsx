import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CadastroBaseTree from './CadastroBaseTree';

/**
 * Cliente falso: responde às leituras da árvore e registra TODA chamada — RPC (reordenar, lote,
 * Modelo Padrão) e escrita direta em tabela. Nenhum teste aqui reordena, desativa nem semeia.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  tableWrites: [] as string[],
  inserts: [] as Record<string, unknown>[],
  dados: {} as Record<string, unknown[]>,
  erro: {} as Record<string, boolean>,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  Object.assign(b, {
    select: self, order: self, eq: self, limit: self, in: self,
    insert: (payload: Record<string, unknown>) => { state.tableWrites.push(`insert:${table}`); state.inserts.push(payload); return b; },
    update: () => { state.tableWrites.push(`update:${table}`); return b; },
    upsert: () => { state.tableWrites.push(`upsert:${table}`); return b; },
    delete: () => { state.tableWrites.push(`delete:${table}`); return b; },
    then: (resolve: (v: unknown) => void) => Promise.resolve(state.erro[table]
      ? { data: null, error: { message: 'falha simulada' } }
      : { data: state.dados[table] ?? [], error: null }).then(resolve),
  });
  return b;
}

const supabase = {
  from: (table: string) => builder(table),
  rpc(name: string) {
    state.rpcCalls.push(name);
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'usuario-teste' } }) }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'empresa-teste' }) }));

const TODAS = ['view', 'create', 'edit', 'delete', 'export'].map(a => `financeiro:cadastros:${a}`);
const escritas = () => [...state.rpcCalls, ...state.tableWrites];

const cat = (id: string, nome: string, codigo: string, tipo: string, parent_id: string | null, ordem: number, extra: Record<string, unknown> = {}) => ({
  id, nome, codigo, tipo, parent_id, ordem, centro_custo_padrao_id: null, grupo: null,
  system_key: null, excluir_dos_totais: false, ativo: true, updated_at: '2026-01-01T00:00:00Z', ...extra,
});
const CATEGORIAS = [
  cat('r', 'RECEITAS', '1', 'receita', null, 10),
  cat('r1', 'Vendas no Salão', '1.01', 'receita', 'r', 10),
  cat('r1a', 'Almoço Executivo', '1.01.01', 'receita', 'r1', 10),
  cat('r2', 'Vendas Delivery', '1.02', 'receita', 'r', 20),
  cat('d', 'DESPESAS', '2', 'despesa', null, 20),
  cat('d1', 'Hortifrúti', '2.01', 'despesa', 'd', 10),
  cat('nor', 'RECEITAS NÃO OPERACIONAIS', 'NO-R', 'receita', null, 9990, { system_key: 'receitas_nao_operacionais', excluir_dos_totais: true }),
  cat('nor1', 'Descontos Obtidos', 'NO-R.01', 'receita', 'nor', 10, { excluir_dos_totais: true }),
];

beforeEach(() => {
  state.rpcCalls = [];
  state.tableWrites = [];
  state.inserts = [];
  state.erro = {};
  state.perms = new Set(TODAS);
  state.dados = { fin_categorias: CATEGORIAS, fin_centros_custo: [{ id: 'cc', nome: 'Cozinha' }], fin_lancamentos: [], fin_lancamento_rateios: [] };
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Estrutura de Categorias (V2)', () => {
  it('árvore com selos, raiz de sistema sem ações e ações nomeadas por linha; nenhuma escrita ao abrir', async () => {
    render(<CadastroBaseTree />);

    expect(await screen.findByText('RECEITAS')).toBeInTheDocument();
    expect(screen.getByText('8 categorias ativas')).toBeInTheDocument();
    // Raiz de sistema: "Fora dos totais" e "Sistema", sem editar nem reordenar.
    const sistema = screen.getByText('RECEITAS NÃO OPERACIONAIS').closest('li')!;
    expect(within(sistema).getAllByText('Fora dos totais').length).toBeGreaterThan(0);
    expect(within(sistema).getByText('Sistema')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar RECEITAS NÃO OPERACIONAIS' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Subir RECEITAS NÃO OPERACIONAIS|Descer RECEITAS NÃO OPERACIONAIS/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar RECEITAS' })).toBeInTheDocument();
    // Sem árvore duplicada: um só botão por ação.
    expect(screen.getAllByRole('button', { name: 'Expandir RECEITAS' })).toHaveLength(1);

    fireEvent.click(screen.getByRole('button', { name: 'Expandir RECEITAS' }));
    expect(screen.getByRole('button', { name: 'Recolher RECEITAS' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Descer Vendas no Salão' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Subir Vendas Delivery' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Subir Vendas no Salão' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Desativar Vendas Delivery' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Selecionar Vendas Delivery' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Adicionar sub-item em Vendas Delivery' })).toBeInTheDocument();
    expect(screen.getAllByText('Receita').length).toBeGreaterThan(0);
    // Há categorias regulares: sem Modelo Padrão.
    expect(screen.queryByRole('button', { name: /Modelo Padrão/ })).not.toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('busca sem acento acha a categoria mesmo com o grupo recolhido', async () => {
    render(<CadastroBaseTree />);
    await screen.findByText('RECEITAS');
    expect(screen.queryByText('Hortifrúti')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar categoria'), { target: { value: 'hortifruti' } });
    expect(screen.getByText('Hortifrúti')).toBeInTheDocument();
    expect(screen.queryByText('RECEITAS')).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Buscar categoria'), { target: { value: 'nada parecido' } });
    expect(screen.getByText('Nenhuma categoria encontrada')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Limpar busca' }));
    expect(screen.getByText('RECEITAS')).toBeInTheDocument();
  });

  it('busca que acha um grupo só pelo nome não o transforma em folha (sem seleção nem Desativar)', async () => {
    render(<CadastroBaseTree />);
    await screen.findByText('RECEITAS');
    fireEvent.change(screen.getByLabelText('Buscar categoria'), { target: { value: 'vendas no salao' } });
    expect(screen.getByText('Vendas no Salão')).toBeInTheDocument();
    expect(screen.queryByText('Almoço Executivo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Desativar Vendas no Salão' })).not.toBeInTheDocument();
    expect(screen.queryByRole('checkbox', { name: 'Selecionar Vendas no Salão' })).not.toBeInTheDocument();
    // "Selecionar todas" não aparece: não há folha de verdade entre os resultados.
    expect(screen.queryByRole('button', { name: 'Selecionar todas' })).not.toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('leitura falhou: erro com nova tentativa e sem convite ao Modelo Padrão', async () => {
    state.erro.fin_categorias = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CadastroBaseTree />);
    expect(await screen.findByText('Não foi possível carregar as categorias')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma categoria cadastrada')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Modelo Padrão/ })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();
    consoleError.mockRestore();
  });

  it('leitura deu certo e não há categorias regulares: vazio com Modelo Padrão (sem acionar)', async () => {
    state.dados.fin_categorias = CATEGORIAS.filter(c => c.id === 'nor' || c.id === 'nor1');
    render(<CadastroBaseTree />);
    expect(await screen.findByRole('button', { name: /Modelo Padrão/ })).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('Desativar só abre a confirmação de antes; Cancelar não grava e devolve o foco à linha', async () => {
    render(<CadastroBaseTree />);
    fireEvent.click(await screen.findByRole('button', { name: 'Expandir DESPESAS' }));
    const desativar = screen.getByRole('button', { name: 'Desativar Hortifrúti' });
    desativar.focus();
    fireEvent.click(desativar);
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Deseja desativar a categoria "Hortifrúti"? Esta ação pode ser revertida.')).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Desativar Hortifrúti' })).toHaveFocus());
    expect(escritas()).toEqual([]);
  });

  it('Nova Raiz abre o formulário com rótulos associados; fechar não grava', async () => {
    render(<CadastroBaseTree />);
    await screen.findByText('RECEITAS');
    fireEvent.click(screen.getByRole('button', { name: /Nova Raiz/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nova Categoria' });
    for (const rotulo of ['Código', 'Ordem', 'Nome', 'Tipo', /^Grupo/, 'Centro de Custo Padrão']) {
      expect(within(dialogo).getByLabelText(rotulo)).toBeInTheDocument();
    }
    // Linha DRE saiu: nenhum relatório a lia.
    expect(within(dialogo).queryByText('Linha DRE')).not.toBeInTheDocument();
    expect(within(dialogo).getByText('Categoria raiz da árvore.')).toBeInTheDocument();
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    const guard = await screen.findByRole('alertdialog');
    fireEvent.click(within(guard).getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova Categoria' })).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);
  });

  it('sem permissão: acesso negado', () => {
    state.perms = new Set();
    render(<CadastroBaseTree />);
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
    expect(screen.getByText('Você não tem permissão para visualizar os cadastros base.')).toBeInTheDocument();
  });
});

/**
 * Grupo obrigatório quando não há o que herdar: sem grupo próprio nem herdado, a despesa some
 * dos detalhamentos da Apresentação Sócios (caso real: R$ 111 mil de CMV do Ren Sushi fora do CMV).
 */
describe('Estrutura de Categorias — grupo da categoria', () => {
  async function abrirSubItem(nome: string) {
    render(<CadastroBaseTree />);
    await screen.findByText('RECEITAS');
    fireEvent.click(screen.getByRole('button', { name: `Adicionar sub-item em ${nome}` }));
    return screen.findByRole('dialog', { name: 'Nova Categoria' });
  }

  function nomearECriar(dialogo: HTMLElement, nome: string) {
    fireEvent.change(within(dialogo).getByLabelText('Nome'), { target: { value: nome } });
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Criar' }));
  }

  it('não cria categoria principal sem grupo', async () => {
    render(<CadastroBaseTree />);
    await screen.findByText('RECEITAS');
    fireEvent.click(screen.getByRole('button', { name: /Nova Raiz/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nova Categoria' });
    nomearECriar(dialogo, 'Delivery');

    expect(within(dialogo).getByText(/Obrigatório na categoria principal/)).toBeInTheDocument();
    expect(state.toast.error).toHaveBeenCalledWith('Selecione o grupo da categoria');
    expect(escritas()).toEqual([]);
  });

  it('sub-item herda o grupo da mãe e pode ficar em branco', async () => {
    state.dados.fin_categorias = CATEGORIAS.map(c => (c.id === 'd' ? { ...c, grupo: 'administrativa' } : c));
    const dialogo = await abrirSubItem('DESPESAS');
    expect(within(dialogo).getByText(/Em branco, a categoria usa o grupo da categoria acima/)).toBeInTheDocument();
    nomearECriar(dialogo, 'Limpeza');

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0]).toMatchObject({ parent_id: 'd', grupo: null });
  });

  it('exige grupo no sub-item de categoria antiga sem grupo', async () => {
    const dialogo = await abrirSubItem('DESPESAS');
    nomearECriar(dialogo, 'Frete');

    expect(within(dialogo).getByText(/nenhuma categoria acima tem grupo/)).toBeInTheDocument();
    expect(state.toast.error).toHaveBeenCalledWith('Selecione o grupo da categoria');
    expect(escritas()).toEqual([]);
  });

  it('não exige grupo em categoria não operacional', async () => {
    const dialogo = await abrirSubItem('RECEITAS NÃO OPERACIONAIS');
    nomearECriar(dialogo, 'Multa recebida');

    await waitFor(() => expect(state.inserts).toHaveLength(1));
    expect(state.inserts[0]).toMatchObject({ parent_id: 'nor', grupo: null });
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CategorizacaoSection from './CategorizacaoSection';

/**
 * Cliente falso: responde às leituras (regras, nomes, contagem e prévia) e registra TODA chamada.
 * "Aplicar Regras" e salvar/desativar regra nunca são acionados aqui.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  tableWrites: [] as string[],
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
  Object.assign(b, {
    select: self, order: self, eq: self, limit: self,
    insert: () => { state.tableWrites.push(`insert:${table}`); return b; },
    update: () => { state.tableWrites.push(`update:${table}`); return b; },
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
    if (name === 'contar_lancamentos_sem_categoria') {
      return Promise.resolve(state.contagemErro ? { data: null, error: { message: 'falha' } } : { data: state.contagem, error: null });
    }
    if (name === 'preview_regra_categorizacao') {
      return Promise.resolve({ data: [{ id: 'l1', descricao: 'Pagamento aluguel teste', valor: 1500, data_competencia: '2026-01-05' }], error: null });
    }
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
  state.tableWrites = [];
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
    expect(within(situacao).getByText('Sem categoria nem rateio categorizado, exceto cancelados')).toBeInTheDocument();
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
    expect(await within(dialogo).findByText('1 lançamento(s) seriam categorizados (máx. 20):')).toBeInTheDocument();
    expect(within(dialogo).getByText(/Padrão testado: “aluguel” \(Contém\)/)).toBeInTheDocument();
    expect(within(dialogo).getByText('Pagamento aluguel teste')).toBeInTheDocument();

    fireEvent.change(within(dialogo).getByLabelText('Padrão de texto'), { target: { value: 'aluguel loja' } });
    expect(within(dialogo).getByText('O padrão mudou depois do teste: teste de novo.')).toBeInTheDocument();

    fireEvent.keyDown(dialogo, { key: 'Escape' });
    const guard = await screen.findByRole('alertdialog');
    fireEvent.click(within(guard).getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Nova Regra de Categorização' })).not.toBeInTheDocument());
    expect(state.rpcCalls).toContain('preview_regra_categorizacao');
    expect(escritas()).toEqual([]);
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

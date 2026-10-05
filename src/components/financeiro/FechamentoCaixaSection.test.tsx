import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import FechamentoCaixaSection from './FechamentoCaixaSection';
import FechamentoMarcasTab from './FechamentoMarcasTab';
import { fmtBRL } from '@/lib/formatters';

/**
 * Cliente falso: responde às leituras das tabelas do Fechamento e registra TODA chamada — RPC e
 * escrita direta em tabela. Nenhum teste aqui salva, exclui ou ativa marca sem querer.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  tableWrites: [] as string[],
  fromCalls: [] as string[],
  dados: {} as Record<string, unknown[]>,
  erro: {} as Record<string, boolean>,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  Object.assign(b, {
    select: self, order: self, in: self, gte: self, lte: self, eq: self, limit: self,
    insert: () => { state.tableWrites.push(`insert:${table}`); return b; },
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
  from: (table: string) => { state.fromCalls.push(table); return builder(table); },
  rpc(name: string) {
    state.rpcCalls.push(name);
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: (perm: string) => state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined, useEmitDataEvent: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ accessibleCompanies: [] }) }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'empresa-teste', loading: false, error: null }) }));
vi.mock('@/components/cmv/cmvCache', () => ({ cacheInvalidate: vi.fn() }));

const TODAS = ['view', 'create', 'edit', 'delete', 'export'].map(a => `financeiro:fechamento:${a}`);
const escritas = () => [...state.rpcCalls, ...state.tableWrites];
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });

const MARCAS = [
  { id: 'm-salao', nome: 'Salão Teste', ativo: true, ordem: 1, categoria_id: 'cat-1', forma_venda: 'PESSOAS' },
  { id: 'm-delivery', nome: 'Delivery Teste', ativo: true, ordem: 2, categoria_id: 'cat-2', forma_venda: 'PEDIDOS' },
  { id: 'm-dark', nome: 'Dark Kitchen Teste', ativo: true, ordem: 3, categoria_id: null, forma_venda: 'PEDIDOS' },
  { id: 'm-balcao', nome: 'Balcão Teste', ativo: true, ordem: 4, categoria_id: 'cat-3', forma_venda: null },
];
const dia = (id: string, data: string, bruto: number, taxas: number, descontos: number, observacao: string | null = null) => ({
  id, data, faturamento_bruto: bruto, taxas, descontos, faturamento_liquido: bruto - taxas - descontos, observacao,
  created_at: '2026-01-01T00:00:00Z', updated_at: '2026-01-01T00:00:00Z',
});
const FECHAMENTOS = [
  dia('f3', '2026-01-03', 1234567.89, 23456.78, 1111.11, 'Evento atípico de teste'),
  dia('f2', '2026-01-02', 300, 10, 0, 'Dia anterior à divisão'),
  dia('f1', '2026-01-01', 1000, 50, 20),
];
const VALORES = [
  { fechamento_id: 'f3', marca_id: 'm-salao', valor_bruto: 1000000, quantidade: 3200, forma_venda: 'PESSOAS' },
  { fechamento_id: 'f3', marca_id: 'm-delivery', valor_bruto: 234567.89, quantidade: 4100, forma_venda: 'PEDIDOS' },
  { fechamento_id: 'f1', marca_id: 'm-salao', valor_bruto: 600, quantidade: 40, forma_venda: 'PESSOAS' },
  { fechamento_id: 'f1', marca_id: 'm-delivery', valor_bruto: 400, quantidade: 25, forma_venda: 'PEDIDOS' },
];

beforeEach(() => {
  state.rpcCalls = [];
  state.tableWrites = [];
  state.fromCalls = [];
  state.erro = {};
  state.perms = new Set(TODAS);
  state.dados = {
    financeiro_fechamento_caixa: FECHAMENTOS,
    financeiro_fechamento_marca_valores: VALORES,
    financeiro_fechamento_marcas: MARCAS,
    fin_categorias: [],
  };
  largura(1366);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Fechamento de Caixa (V2)', () => {
  it('resumo somado como antes, com período e origem no rótulo, e nenhuma escrita ao abrir', async () => {
    render(<FechamentoCaixaSection />);

    expect(await screen.findByRole('heading', { name: 'Fechamento de Caixa', level: 2 })).toBeInTheDocument();
    const resumo = await screen.findByRole('region', { name: 'Resumo do período' });
    const brutoTotal = FECHAMENTOS.reduce((s, r) => s + r.faturamento_bruto, 0);
    const liquidoTotal = FECHAMENTOS.reduce((s, r) => s + r.faturamento_liquido, 0);
    expect(within(resumo).getByText(fmtBRL(brutoTotal))).toBeInTheDocument();
    expect(within(resumo).getByText(fmtBRL(liquidoTotal))).toBeInTheDocument();
    expect(within(resumo).getByText('3')).toBeInTheDocument();
    // Pedidos e pessoas nunca se somam: 4100 + 25 pedidos; 3200 + 40 pessoas.
    expect(within(resumo).getByText((4125).toLocaleString('pt-BR'))).toBeInTheDocument();
    expect(within(resumo).getByText((3240).toLocaleString('pt-BR'))).toBeInTheDocument();
    expect(within(resumo).getByText(/somado na tela a partir dos fechamentos carregados/)).toBeInTheDocument();

    const tabela = screen.getByRole('table');
    expect(within(tabela).getByText('Não detalhado')).toBeInTheDocument();
    expect(within(tabela).getByText(/3\.200 pessoas/)).toBeInTheDocument();
    expect(within(tabela).getByText('Evento atípico de teste')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar fechamento de 01/01/2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir fechamento de 01/01/2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Seção do fechamento: Fechamentos diários' })).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('falha na leitura vira erro com nova tentativa, nunca "Nenhum fechamento" nem R$ 0,00', async () => {
    state.erro.financeiro_fechamento_caixa = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FechamentoCaixaSection />);

    expect(await screen.findByText('Não foi possível carregar os fechamentos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Tentar novamente' })).toBeInTheDocument();
    expect(screen.queryByText('Nenhum fechamento no período')).not.toBeInTheDocument();
    expect(screen.queryByText(fmtBRL(0))).not.toBeInTheDocument();
    expect(state.toast.error).toHaveBeenCalledWith('Erro ao carregar fechamentos');
    consoleError.mockRestore();
  });

  it('divisão por marca indisponível: pedidos e pessoas viram "—", nunca zero', async () => {
    state.erro.financeiro_fechamento_marca_valores = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<FechamentoCaixaSection />);

    expect(await screen.findByText('Não foi possível carregar a divisão por marca')).toBeInTheDocument();
    const resumo = screen.getByRole('region', { name: 'Resumo do período' });
    expect(within(resumo).getAllByText('—')).toHaveLength(2);
    expect(within(resumo).getAllByText('Indisponível: a divisão por marca não carregou')).toHaveLength(2);
    expect(within(screen.getByRole('table')).getAllByText('Indisponível')).toHaveLength(3);
    // O arquivo sairia sem a divisão por marca: exportar só depois de uma carga completa.
    expect(screen.getByRole('button', { name: /PDF/ })).toBeDisabled();
    expect(screen.getByRole('button', { name: /Excel/ })).toBeDisabled();
    // Edição nesse estado avisa que salvar regravaria o dia sem o detalhamento (PF-105).
    fireEvent.click(screen.getByRole('button', { name: 'Editar fechamento de 01/01/2026' }));
    const dialogo = await screen.findByRole('dialog', { name: 'Editar Fechamento' });
    expect(within(dialogo).getByText(/Salvar assim regrava o dia sem o detalhamento/)).toBeInTheDocument();
    expect(within(dialogo).queryByText(/Este fechamento antigo ainda não foi dividido/)).not.toBeInTheDocument();
    expect(escritas()).toEqual([]);
    consoleError.mockRestore();
  });

  it('um dia só: o gráfico explica que a tendência começa com dois dias', async () => {
    state.dados.financeiro_fechamento_caixa = [FECHAMENTOS[2]];
    render(<FechamentoCaixaSection />);
    expect(await screen.findByText('Tendência a partir de dois dias')).toBeInTheDocument();
  });

  it('vazio: estado vazio do período, sem gráfico', async () => {
    state.dados.financeiro_fechamento_caixa = [];
    render(<FechamentoCaixaSection />);
    expect(await screen.findByText('Nenhum fechamento no período')).toBeInTheDocument();
    expect(screen.queryByText('Faturamento líquido por dia')).not.toBeInTheDocument();
  });

  it('tela estreita: cartões por dia com as mesmas ações, sem tabela', async () => {
    largura(390);
    render(<FechamentoCaixaSection />);
    expect(await screen.findByText('Evento atípico de teste')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar fechamento de 02/01/2026' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir fechamento de 02/01/2026' })).toBeInTheDocument();
  });

  it('Excluir só abre a confirmação de antes; Cancelar não chama nada', async () => {
    render(<FechamentoCaixaSection />);
    fireEvent.click(await screen.findByRole('button', { name: 'Excluir fechamento de 01/01/2026' }));
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Excluir fechamento de caixa')).toBeInTheDocument();
    expect(within(dialogo).getByText(/pode impactar CMV, dashboards e relatórios/)).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);
  });

  it('Novo Dia abre o formulário com rótulos associados e somas ao vivo; fechar não grava', async () => {
    render(<FechamentoCaixaSection />);
    const novo = await screen.findByRole('button', { name: /Novo Dia/ });
    await waitFor(() => expect(novo).not.toBeDisabled());
    fireEvent.click(novo);

    const dialogo = await screen.findByRole('dialog', { name: 'Novo Fechamento' });
    expect(within(dialogo).getByLabelText('Data')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Taxas (R$)')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Descontos (R$)')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Observação')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Faturamento — Salão Teste')).toBeInTheDocument();
    expect(within(dialogo).getByLabelText('Qtd. de pessoas — Salão Teste')).toBeInTheDocument();
    expect(within(dialogo).getByText(/Sem categoria vinculada: Dark Kitchen Teste/)).toBeInTheDocument();
    // Balcão sem forma de venda: sem campo de quantidade, com a orientação de antes.
    expect(within(dialogo).queryByLabelText(/de Balcão Teste/, { selector: 'input[inputmode=numeric]' })).not.toBeInTheDocument();
    expect(within(dialogo).getByText('Faturamento bruto — soma das marcas')).toBeInTheDocument();
    expect(within(dialogo).getByText('Líquido estimado:')).toBeInTheDocument();

    fireEvent.keyDown(dialogo, { key: 'Escape' });
    const guard = await screen.findByRole('alertdialog');
    fireEvent.click(within(guard).getByRole('button', { name: 'Sair sem salvar' }));
    await waitFor(() => expect(screen.queryByRole('dialog', { name: 'Novo Fechamento' })).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);
  });

  it('sem permissão: acesso negado e nenhuma escrita', async () => {
    state.perms = new Set();
    render(<FechamentoCaixaSection />);
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
    // As leituras continuam disparando sem a permissão de ver (preexistente, PF-106; a RLS barra).
    await waitFor(() => expect(state.fromCalls).toContain('financeiro_fechamento_marcas'));
    expect(screen.queryByText('Resumo do período')).not.toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });
});

describe('Marcas e dark kitchens (V2)', () => {
  it('avisos, selos e nomes acessíveis; abrir e fechar a marca não grava', async () => {
    state.dados.fin_categorias = [{ id: 'cat-1', nome: 'Receita Salão', tipo: 'receita', codigo: '1.01', parent_id: null, ativo: true, excluir_dos_totais: false }];
    render(<FechamentoMarcasTab items={MARCAS as never} loading={false} canCreate canEdit />);

    expect(screen.getByText('1 marca sem categoria vinculada')).toBeInTheDocument();
    expect(screen.getByText('1 marca sem forma de venda')).toBeInTheDocument();
    expect(screen.getByText('Sem categoria')).toBeInTheDocument();
    expect(screen.getByText('Não definida')).toBeInTheDocument();
    expect(screen.getByRole('switch', { name: 'Desativar Salão Teste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Balcão Teste' })).toBeInTheDocument();
    expect(await screen.findByText('Receita Salão')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Nova marca/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nova marca' });
    const grupo = within(dialogo).getByRole('radiogroup', { name: 'Forma de venda' });
    // Sem forma escolhida, a primeira opção entra no Tab (antes o grupo ficava fora do teclado).
    expect(within(grupo).getByRole('radio', { name: 'Pedidos' })).toHaveAttribute('tabindex', '0');
    expect(within(dialogo).getByRole('combobox', { name: 'Categoria vinculada (livro razão)' })).toBeInTheDocument();
    fireEvent.keyDown(dialogo, { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(escritas()).toEqual([]);
  });

  it('leitura das marcas falhou: erro com nova tentativa, não "Nenhuma marca cadastrada"', () => {
    const onRetry = vi.fn();
    render(<FechamentoMarcasTab items={[]} loading={false} canCreate canEdit erro onRetry={onRetry} />);
    expect(screen.getByText('Não foi possível carregar as marcas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma marca cadastrada')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BookOpen, FolderTree } from 'lucide-react';
import PlanoContasFinSection from './PlanoContasFinSection';
import CentrosCustoFinSection from './CentrosCustoFinSection';
import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';

/**
 * Plano de Contas e Centros de Custo com cliente falso que registra TODA chamada (RPC `_guarded_*`
 * e escrita direta). Nenhum teste aqui salva nem remove.
 */
const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  tableWrites: [] as string[],
  dados: {} as Record<string, unknown[]>,
  erro: {} as Record<string, boolean>,
  perms: new Set<string>(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));

function builder(table: string) {
  const b: Record<string, unknown> = {};
  const self = () => b;
  Object.assign(b, {
    select: self, order: self, eq: self,
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
    return Promise.resolve({ data: null, error: null });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/permissions/hooks', () => ({ useCan: (perm: string) => perm === '' || state.perms.has(perm) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => vi.fn() }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'usuario-teste' } }) }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'empresa-teste' }) }));

const escritas = () => [...state.rpcCalls, ...state.tableWrites];
const largura = (px: number) => Object.defineProperty(window, 'innerWidth', { configurable: true, value: px });

beforeEach(() => {
  state.rpcCalls = [];
  state.tableWrites = [];
  state.erro = {};
  state.perms = new Set(['financeiro:cadastros:view']);
  state.dados = {
    fin_plano_contas: [
      { id: 'p1', codigo: '1.1.01', nome: 'Caixa Teste', tipo: 'ativo', natureza: 'operacional', linha_dre: null, updated_at: 'x' },
      { id: 'p2', codigo: '5.1.01', nome: 'Capital Teste', tipo: 'patrimonio', natureza: 'nao_operacional', linha_dre: null, updated_at: 'x' },
    ],
    fin_centros_custo: [
      { id: 'c1', nome: 'Cozinha Teste', descricao: 'Produção', updated_at: 'x' },
      { id: 'c2', nome: 'Salão Teste', descricao: null, updated_at: 'x' },
    ],
  };
  largura(1366);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Plano de Contas (V2)', () => {
  it('tipo e natureza com os rótulos do formulário, ações nomeadas e nenhuma escrita ao abrir', async () => {
    render(<PlanoContasFinSection canCreate canEdit canDelete />);
    expect(await screen.findByText('Capital Teste')).toBeInTheDocument();
    expect(screen.getByText('Patrimônio')).toBeInTheDocument();
    expect(screen.getByText('Não Operacional')).toBeInTheDocument();
    expect(screen.getByText('2 contas ativas')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar 1.1.01 Caixa Teste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover 5.1.01 Capital Teste' })).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('Remover abre a confirmação de antes; Cancelar não grava e devolve o foco ao botão', async () => {
    render(<PlanoContasFinSection canCreate canEdit canDelete />);
    const remover = await screen.findByRole('button', { name: 'Remover 5.1.01 Capital Teste' });
    remover.focus();
    fireEvent.click(remover);
    const dialogo = await screen.findByRole('alertdialog');
    expect(within(dialogo).getByText('Tem certeza que deseja remover a conta "Capital Teste"?')).toBeInTheDocument();
    fireEvent.click(within(dialogo).getByRole('button', { name: 'Cancelar' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Remover 5.1.01 Capital Teste' })).toHaveFocus());
    expect(escritas()).toEqual([]);
  });

  it('leitura falhou: erro com nova tentativa, não "Nenhuma conta cadastrada"', async () => {
    state.erro.fin_plano_contas = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<PlanoContasFinSection canCreate canEdit canDelete />);
    expect(await screen.findByText('Não foi possível carregar o plano de contas')).toBeInTheDocument();
    expect(screen.queryByText('Nenhuma conta cadastrada')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });

  it('tela estreita: cartões com as mesmas ações', async () => {
    largura(390);
    render(<PlanoContasFinSection canCreate canEdit canDelete />);
    expect(await screen.findByText('Capital Teste')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar 5.1.01 Capital Teste' })).toBeInTheDocument();
  });

  it('formulário com rótulos associados (Dialog continua só com permissão de criar — PF-009)', async () => {
    render(<PlanoContasFinSection canCreate canEdit canDelete />);
    fireEvent.click(await screen.findByRole('button', { name: /Nova Conta/ }));
    const dialogo = await screen.findByRole('dialog', { name: 'Nova Conta Contábil' });
    for (const rotulo of ['Código', 'Nome', 'Tipo', 'Natureza', 'Linha DRE']) {
      expect(within(dialogo).getByLabelText(rotulo)).toBeInTheDocument();
    }
    expect(escritas()).toEqual([]);
  });

  it('sem permissão: acesso negado em vez de tela em branco', () => {
    state.perms = new Set();
    render(<PlanoContasFinSection canCreate canEdit canDelete />);
    expect(screen.getByText('Acesso negado')).toBeInTheDocument();
  });
});

describe('Centros de Custo (V2)', () => {
  it('lista com descrição ausente e ações nomeadas; vazio é vazio', async () => {
    const { unmount } = render(<CentrosCustoFinSection canCreate canEdit canDelete />);
    expect(await screen.findByText('Cozinha Teste')).toBeInTheDocument();
    expect(screen.getByText('2 centros ativos')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Salão Teste' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remover Cozinha Teste' })).toBeInTheDocument();
    unmount();

    state.dados.fin_centros_custo = [];
    render(<CentrosCustoFinSection canCreate canEdit canDelete />);
    expect(await screen.findByText('Nenhum centro de custo')).toBeInTheDocument();
    expect(escritas()).toEqual([]);
  });

  it('leitura falhou: erro, não "Nenhum centro de custo"', async () => {
    state.erro.fin_centros_custo = true;
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<CentrosCustoFinSection canCreate canEdit canDelete />);
    expect(await screen.findByText('Não foi possível carregar os centros de custo')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum centro de custo')).not.toBeInTheDocument();
    consoleError.mockRestore();
  });
});

describe('SubmoduleSwitcher com nome acessível', () => {
  it('o botão diz o que escolhe e qual está aberto; sem ariaLabel nada muda', () => {
    const items = [
      { id: 'arvore', label: 'Estrutura de Categorias', icon: FolderTree },
      { id: 'plano', label: 'Plano de Contas', icon: BookOpen },
    ];
    const { unmount } = render(<SubmoduleSwitcher items={items} value="plano" onChange={vi.fn()} ariaLabel="Cadastro exibido" />);
    expect(screen.getByRole('button', { name: 'Cadastro exibido: Plano de Contas' })).toBeInTheDocument();
    unmount();
    render(<SubmoduleSwitcher items={items} value="plano" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Plano de Contas' })).toBeInTheDocument();
  });
});

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FolderTree, Target } from 'lucide-react';
import CentrosCustoFinSection from './CentrosCustoFinSection';
import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';

/**
 * Centros de Custo com cliente falso que registra TODA chamada (RPC `_guarded_*`
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
    fin_centros_custo: [
      { id: 'c1', nome: 'Cozinha Teste', descricao: 'Produção', updated_at: 'x' },
      { id: 'c2', nome: 'Salão Teste', descricao: null, updated_at: 'x' },
    ],
  };
  largura(1366);
});
afterEach(() => { cleanup(); vi.clearAllMocks(); });

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
      { id: 'centros', label: 'Centros de Custo', icon: Target },
    ];
    const { unmount } = render(<SubmoduleSwitcher items={items} value="centros" onChange={vi.fn()} ariaLabel="Cadastro exibido" />);
    expect(screen.getByRole('button', { name: 'Cadastro exibido: Centros de Custo' })).toBeInTheDocument();
    unmount();
    render(<SubmoduleSwitcher items={items} value="centros" onChange={vi.fn()} />);
    expect(screen.getByRole('button', { name: 'Centros de Custo' })).toBeInTheDocument();
  });
});

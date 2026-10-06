import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Supplier } from '@/types/salmon';
import type { SuppliersStore } from '@/hooks/useSuppliers';

const permissoes = vi.hoisted(() => new Set<string>());
const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));

vi.mock('@/permissions/hooks', () => ({ useCan: (chave: string) => permissoes.has(chave) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
vi.mock('@/hooks/useConfirmDialog', () => ({
  useConfirmDialog: () => ({ confirm: () => Promise.resolve(true), ConfirmDialog: () => null }),
}));

import SuppliersView from './SuppliersView';
import { SUPPLIER_KEYS_FINANCEIRO } from '@/domain/compras/fornecedores';

const zeta: Supplier = {
  id: 'z', name: 'Zeta', cnpj: '', contact: '', notes: '', active: true, categoriasAtendidas: [],
  prazoEntregaPadrao: 0, formaPagamentoPadrao: '', createdAt: '',
};

type Store = Pick<SuppliersStore, 'suppliers' | 'addSupplier' | 'updateSupplier' | 'deleteSupplier'>;

function criarStore(over: Partial<Store> = {}): Store {
  return {
    suppliers: [zeta],
    addSupplier: vi.fn<Store['addSupplier']>().mockResolvedValue({ ...zeta, id: 'n', name: 'Novo' }),
    updateSupplier: vi.fn<Store['updateSupplier']>().mockResolvedValue(undefined),
    deleteSupplier: vi.fn<Store['deleteSupplier']>().mockResolvedValue(undefined),
    ...over,
  };
}

const TODAS_COMPRAS = ['compras:fornecedores:create', 'compras:fornecedores:edit', 'compras:fornecedores:delete'];
const TODAS_FINANCEIRO = ['financeiro:cadastros:create', 'financeiro:cadastros:edit', 'financeiro:cadastros:delete'];

beforeEach(() => {
  permissoes.clear();
  vi.clearAllMocks();
});
afterEach(cleanup);

describe('SuppliersView — permissões por módulo', () => {
  it('sem chaves informadas usa as de Compras', () => {
    TODAS_COMPRAS.forEach(k => permissoes.add(k));
    render(<SuppliersView store={criarStore()} />);
    expect(screen.getByRole('button', { name: /Novo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Zeta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Zeta' })).toBeInTheDocument();
  });

  it('no Financeiro valem as chaves de Cadastros Base, não as de Compras', () => {
    TODAS_COMPRAS.forEach(k => permissoes.add(k));
    const { unmount } = render(<SuppliersView store={criarStore()} permissionKeys={SUPPLIER_KEYS_FINANCEIRO} />);
    expect(screen.queryByRole('button', { name: /Novo/ })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Editar Zeta' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Excluir Zeta' })).not.toBeInTheDocument();
    unmount();

    permissoes.clear();
    TODAS_FINANCEIRO.forEach(k => permissoes.add(k));
    render(<SuppliersView store={criarStore()} permissionKeys={SUPPLIER_KEYS_FINANCEIRO} />);
    expect(screen.getByRole('button', { name: /Novo/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Editar Zeta' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Excluir Zeta' })).toBeInTheDocument();
  });
});

describe('SuppliersView — gravação', () => {
  beforeEach(() => TODAS_COMPRAS.forEach(k => permissoes.add(k)));

  it('exclusão recusada pelo banco não mostra sucesso nem tira da lista', async () => {
    const store = criarStore({ deleteSupplier: vi.fn<Store['deleteSupplier']>().mockRejectedValue(new Error('vinculado')) });
    render(<SuppliersView store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Excluir Zeta' }));
    await waitFor(() => expect(store.deleteSupplier).toHaveBeenCalledWith('z'));
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByText('Zeta')).toBeInTheDocument();
  });

  it('ativar/desativar recusado não mostra aviso de sucesso', async () => {
    const store = criarStore({ updateSupplier: vi.fn<Store['updateSupplier']>().mockRejectedValue(new Error('rls')) });
    render(<SuppliersView store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Desativar Zeta' }));
    await waitFor(() => expect(store.updateSupplier).toHaveBeenCalledWith('z', { active: false }));
    expect(toast.info).not.toHaveBeenCalled();
  });

  it('edição recusada mantém o formulário aberto e não mostra sucesso', async () => {
    const store = criarStore({ updateSupplier: vi.fn<Store['updateSupplier']>().mockRejectedValue(new Error('rls')) });
    render(<SuppliersView store={store} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar Zeta' }));
    fireEvent.click(screen.getByRole('button', { name: 'Atualizar' }));
    await waitFor(() => expect(store.updateSupplier).toHaveBeenCalled());
    expect(toast.success).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'Atualizar' })).toBeInTheDocument();
  });

  it('duplo clique em Salvar cadastra uma vez só', async () => {
    const store = criarStore({ addSupplier: vi.fn<Store['addSupplier']>().mockReturnValue(new Promise(() => {})) });
    render(<SuppliersView store={store} />);
    fireEvent.click(screen.getByRole('button', { name: /Novo/ }));
    fireEvent.change(screen.getByPlaceholderText('Nome do fornecedor'), { target: { value: 'Ambev' } });
    const salvar = screen.getByRole('button', { name: 'Salvar' });
    fireEvent.click(salvar);
    fireEvent.click(salvar);
    await waitFor(() => expect(store.addSupplier).toHaveBeenCalledTimes(1));
  });

  it('enquanto carrega não diz que não há fornecedores', () => {
    render(<SuppliersView store={{ ...criarStore(), suppliers: [], loading: true }} />);
    expect(screen.getByText('Carregando fornecedores…')).toBeInTheDocument();
    expect(screen.queryByText('Nenhum fornecedor cadastrado')).not.toBeInTheDocument();
  });
});

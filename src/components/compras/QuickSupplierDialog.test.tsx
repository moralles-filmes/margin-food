import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const db = vi.hoisted(() => ({
  tabelas: [] as string[],
  inserido: undefined as unknown,
  resultado: { data: null as unknown, error: null as unknown },
}));

const supabase = {
  from: (tabela: string) => {
    db.tabelas.push(tabela);
    return {
      insert: (payload: unknown) => {
        db.inserido = payload;
        return { select: () => ({ single: () => Promise.resolve(db.resultado) }) };
      },
    };
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'company-1' }) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
const emitidos = vi.hoisted(() => [] as string[]);
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => (canal: string) => { emitidos.push(canal); } }));

import QuickSupplierDialog from './QuickSupplierDialog';

beforeEach(() => {
  vi.clearAllMocks();
  db.tabelas = [];
  db.inserido = undefined;
  emitidos.length = 0;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(cleanup);

function preencherESalvar() {
  fireEvent.change(screen.getByLabelText('Nome / Razão Social *'), { target: { value: 'Ambev' } });
  fireEvent.click(screen.getByRole('button', { name: 'Cadastrar Fornecedor' }));
}

describe('QuickSupplierDialog', () => {
  it('abrir o atalho não carrega nada; salvar grava só em suppliers com company_id', async () => {
    db.resultado = { data: { id: 'n1', name: 'Ambev', is_active: true, created_at: '', contact_info: {} }, error: null };
    const onSuccess = vi.fn();
    render(<QuickSupplierDialog open onOpenChange={() => {}} onSuccess={onSuccess} />);
    expect(db.tabelas).toEqual([]);

    preencherESalvar();
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('Ambev', 'n1'));
    expect(db.tabelas).toEqual(['suppliers']);
    expect(db.inserido).toMatchObject({ company_id: 'company-1', name: 'Ambev', is_active: true });
    // As listas abertas (Compras, Salmão, Cadastros Base) recarregam.
    expect(emitidos).toEqual(['fornecedores']);
  });

  it('nome repetido avisa com a mensagem traduzida e não confirma', async () => {
    db.resultado = { data: null, error: { code: '23505', message: 'duplicate key value violates unique constraint "suppliers_name_company_key"' } };
    const onSuccess = vi.fn();
    render(<QuickSupplierDialog open onOpenChange={() => {}} onSuccess={onSuccess} />);
    preencherESalvar();
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith('Já existe um fornecedor com este nome nesta unidade. Confira a lista.'));
    expect(onSuccess).not.toHaveBeenCalled();
    expect(emitidos).toEqual([]);
  });
});

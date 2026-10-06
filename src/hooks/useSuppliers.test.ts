import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() }));
const db = vi.hoisted(() => ({
  rows: [] as unknown[],
  companyId: 'company-1' as string | null,
  insertResult: { data: null as unknown, error: null as unknown },
  updateResult: { data: [{ id: 'x' }] as unknown, error: null as unknown },
  deleteResult: { data: [{ id: 'x' }] as unknown, error: null as unknown },
  inserted: undefined as unknown,
  updated: undefined as { payload: unknown; id: string } | undefined,
  deletedId: undefined as string | undefined,
  tables: [] as string[],
}));

const supabase = {
  from: (table: string) => {
    db.tables.push(table);
    return {
      select: () => ({ order: () => Promise.resolve({ data: db.rows, error: null }) }),
      insert: (payload: unknown) => {
        db.inserted = payload;
        return { select: () => ({ single: () => Promise.resolve(db.insertResult) }) };
      },
      update: (payload: unknown) => ({
        eq: (_col: string, id: string) => {
          db.updated = { payload, id };
          return { select: () => Promise.resolve(db.updateResult) };
        },
      }),
      delete: () => ({
        eq: (_col: string, id: string) => {
          db.deletedId = id;
          return { select: () => Promise.resolve(db.deleteResult) };
        },
      }),
    };
  },
};

const eventos = vi.hoisted(() => ({ emitidos: [] as string[], handlers: new Map<string, () => void>() }));
vi.mock('@/lib/dataEvents', () => ({
  useEmitDataEvent: () => (canal: string) => { eventos.emitidos.push(canal); },
  useDataEvent: (canal: string, handler: () => void) => { eventos.handlers.set(canal, handler); },
}));

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase }));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: db.companyId }) }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));
const permissoes = vi.hoisted(() => new Set<string>());
vi.mock('@/permissions/hooks', () => ({ useCan: (chave: string) => permissoes.has(chave) }));

import { usePodeCadastrarFornecedor, useSuppliers } from './useSuppliers';

describe('usePodeCadastrarFornecedor', () => {
  it.each([
    [['compras:fornecedores:create'], true],
    [['financeiro:cadastros:create'], true],
    [['financeiro:pagar:create', 'compras:fornecedores:view'], false],
  ])('com %j → %s', (chaves, esperado) => {
    permissoes.clear();
    chaves.forEach(k => permissoes.add(k));
    const { result } = renderHook(() => usePodeCadastrarFornecedor());
    expect(result.current).toBe(esperado);
  });
});

const linha = (id: string, name: string, extra: Record<string, unknown> = {}) => ({
  id, name, is_active: true, created_at: '2026-10-01T00:00:00Z', contact_info: {}, minimum_order_value: 0,
  minimum_order_quantity: 0, whatsapp_number: null, ...extra,
});

beforeEach(() => {
  vi.clearAllMocks();
  db.rows = [linha('b', 'Zeta'), linha('a', 'Alfa', { is_active: false })];
  db.companyId = 'company-1';
  db.insertResult = { data: null, error: null };
  db.updateResult = { data: [{ id: 'x' }], error: null };
  db.deleteResult = { data: [{ id: 'x' }], error: null };
  db.inserted = undefined;
  db.updated = undefined;
  db.deletedId = undefined;
  db.tables = [];
  eventos.emitidos = [];
  eventos.handlers.clear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

async function montar() {
  const hook = renderHook(() => useSuppliers());
  await waitFor(() => expect(hook.result.current.loading).toBe(false));
  return hook;
}

describe('useSuppliers', () => {
  it('carrega só a tabela suppliers, ordenada por nome, e separa os ativos', async () => {
    const { result } = await montar();
    expect(db.tables).toEqual(['suppliers']);
    expect(result.current.suppliers.map(s => s.name)).toEqual(['Alfa', 'Zeta']);
    expect(result.current.activeSuppliers.map(s => s.name)).toEqual(['Zeta']);
  });

  it('cadastro envia company_id explícito e entra na lista', async () => {
    db.insertResult = { data: linha('n', 'Novo'), error: null };
    const { result } = await montar();
    let criado: { id: string } | undefined;
    await act(async () => {
      criado = await result.current.addSupplier({
        name: 'Novo', cnpj: '', contact: '', notes: '', active: true, categoriasAtendidas: [], prazoEntregaPadrao: 0, formaPagamentoPadrao: '',
      });
    });
    expect(db.inserted).toMatchObject({ company_id: 'company-1', name: 'Novo', is_active: true });
    expect(criado?.id).toBe('n');
    expect(result.current.suppliers.map(s => s.name)).toEqual(['Alfa', 'Novo', 'Zeta']);
  });

  it('sem unidade selecionada não grava', async () => {
    db.companyId = null;
    const { result } = await montar();
    await expect(result.current.addSupplier({
      name: 'X', cnpj: '', contact: '', notes: '', active: true, categoriasAtendidas: [], prazoEntregaPadrao: 0, formaPagamentoPadrao: '',
    })).rejects.toThrow('Unidade não selecionada');
    expect(db.inserted).toBeUndefined();
  });

  it('exclusão barrada por vínculo avisa, lança e mantém o fornecedor na lista', async () => {
    db.deleteResult = { data: null, error: { code: '23503', message: 'violates foreign key constraint "fin_contas_pagar_supplier_id_fkey"' } };
    const { result } = await montar();
    await act(async () => {
      await expect(result.current.deleteSupplier('b')).rejects.toThrow();
    });
    expect(db.deletedId).toBe('b');
    expect(toast.error).toHaveBeenCalledWith(expect.stringContaining('Desative-o'));
    expect(result.current.suppliers.map(s => s.id)).toContain('b');
  });

  it('exclusão aceita remove da lista', async () => {
    const { result } = await montar();
    await act(async () => { await result.current.deleteSupplier('b'); });
    expect(result.current.suppliers.map(s => s.id)).toEqual(['a']);
  });

  it('atualização recusada avisa, lança e não altera a lista', async () => {
    db.updateResult = { data: null, error: { code: '42501', message: 'row-level security' } };
    const { result } = await montar();
    await act(async () => {
      await expect(result.current.updateSupplier('b', { name: 'Outro' })).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledWith('Sem permissão para atualizar fornecedores nesta unidade.');
    expect(result.current.suppliers.find(s => s.id === 'b')?.name).toBe('Zeta');
  });

  it('edição de contato preserva o contact_info que a tela não mexeu', async () => {
    db.rows = [linha('b', 'Zeta', { contact_info: { cnpj: '123', notes: 'antiga' } })];
    const { result } = await montar();
    await act(async () => { await result.current.updateSupplier('b', { notes: 'nova' }); });
    expect(db.updated).toEqual({
      id: 'b',
      payload: { contact_info: expect.objectContaining({ cnpj: '123', notes: 'nova' }) },
    });
  });

  it('ativar/desativar grava só is_active (não regrava o contato a partir da lista local)', async () => {
    db.rows = [linha('b', 'Zeta', { contact_info: { cnpj: '123' } })];
    const { result } = await montar();
    await act(async () => { await result.current.updateSupplier('b', { active: false }); });
    expect(db.updated).toEqual({ id: 'b', payload: { is_active: false } });
    expect(result.current.suppliers[0].active).toBe(false);
  });

  it('exclusão filtrada pela RLS (0 linhas, sem erro) avisa e não some da lista', async () => {
    db.deleteResult = { data: [], error: null };
    const { result } = await montar();
    await act(async () => {
      await expect(result.current.deleteSupplier('b')).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledWith('Sem permissão para excluir fornecedores nesta unidade.');
    expect(result.current.suppliers.map(s => s.id)).toContain('b');
  });

  it('atualização filtrada pela RLS (0 linhas, sem erro) avisa e não altera a lista', async () => {
    db.updateResult = { data: [], error: null };
    const { result } = await montar();
    await act(async () => {
      await expect(result.current.updateSupplier('b', { name: 'Outro' })).rejects.toThrow();
    });
    expect(toast.error).toHaveBeenCalledWith('Sem permissão para atualizar fornecedores nesta unidade.');
    expect(result.current.suppliers.find(s => s.id === 'b')?.name).toBe('Zeta');
  });

  it('atualizar fornecedor fora da lista lança em vez de fingir sucesso', async () => {
    const { result } = await montar();
    await expect(result.current.updateSupplier('nao-existe', { name: 'X' })).rejects.toThrow();
    expect(db.updated).toBeUndefined();
  });

  it('gravação avisa as outras telas, e o aviso recarrega a lista', async () => {
    const { result } = await montar();
    await act(async () => { await result.current.deleteSupplier('b'); });
    expect(eventos.emitidos).toContain('fornecedores');

    db.rows = [linha('c', 'Gama')];
    await act(async () => { eventos.handlers.get('fornecedores')?.(); });
    await waitFor(() => expect(result.current.suppliers.map(s => s.name)).toEqual(['Gama']));
  });
});

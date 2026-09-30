/**
 * createOrder: duplo clique e reenvio não podem criar dois pedidos.
 *   · a trava é síncrona (o 2º clique do mesmo render não chega ao servidor);
 *   · a chave é derivada — o retry do mesmo pedido reaproveita a chave e o
 *     servidor devolve o pedido já gravado.
 */
import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { criarChavesPendentes, type ChavesPendentes } from '@/lib/chaveOperacao';

const rpc = vi.fn();
const toast = { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() };
const user = { id: 'user-1' };
const channel = { on: () => channel, subscribe: () => channel };
// Identidade estável: fetchOrders depende do cliente, e um objeto novo por
// render dispararia o efeito de carga em loop.
const supabase = { rpc, channel: () => channel, removeChannel: vi.fn() };

vi.mock('@/contexts/CompanyScopeContext', () => ({
  useSupabase: () => supabase,
}));
vi.mock('@/hooks/useCompanyId', () => ({ useCompanyId: () => ({ companyId: 'company-1' }) }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user }) }));
vi.mock('@/lib/dataEvents', () => ({ useEmitDataEvent: () => vi.fn() }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => toast }));

import { usePurchaseOrdersStore } from '@/hooks/usePurchaseOrdersStore';

const orderData = {
  title: 'Hortifruti',
  type: 'FORNECEDOR' as const,
  priority: 'MEDIA' as const,
  category: '',
  supplier_name: 'Forn X',
  payment_type: null,
  need_by_date: null,
  delivery_forecast_date: null,
  responsible_user_id: null,
  notes: '',
  status: 'OPEN' as const,
  total_estimated: 0,
  origin: 'MANUAL',
  origin_ref: null,
};
const items = [{ stock_item_id: 'p1', name_snapshot: 'Tomate', unit_snapshot: 'KG', estimated_unit_value: 10, qty_requested: 2 }];

function createCalls() {
  return rpc.mock.calls.filter(([nome]) => nome === 'create_purchase_order_atomic');
}

let createResponse: () => Promise<unknown>;

beforeEach(() => {
  rpc.mockReset();
  Object.values(toast).forEach(fn => fn.mockReset());
  createResponse = async () => ({ data: { status: 'created', order_id: 'order-1' }, error: null });
  rpc.mockImplementation((nome: string) => (
    nome === 'create_purchase_order_atomic' ? createResponse() : Promise.resolve({ data: [], error: null })
  ));
});

describe('usePurchaseOrdersStore.createOrder', () => {
  // Uma instância por teste: a semente é fixa por formulário, como a tela faz com
  // useChavesPendentes('compras-pedido', 'uuid').
  let form1: { pendentes: ChavesPendentes };
  let form2: { pendentes: ChavesPendentes };
  beforeEach(() => {
    form1 = { pendentes: criarChavesPendentes('compras-pedido', { formato: 'uuid', gerarSemente: () => 'form-1' }) };
    form2 = { pendentes: criarChavesPendentes('compras-pedido', { formato: 'uuid', gerarSemente: () => 'form-2' }) };
  });

  it('duplo clique: só a 1ª chamada chega ao servidor', async () => {
    let liberar: (v: unknown) => void = () => {};
    createResponse = () => new Promise(resolve => { liberar = resolve; });
    const { result } = renderHook(() => usePurchaseOrdersStore());

    let primeira: Promise<unknown> = Promise.resolve();
    let segunda: unknown = 'não chamada';
    await act(async () => {
      primeira = result.current.createOrder(orderData, items, form1);
      segunda = await result.current.createOrder(orderData, items, form1);
    });
    // A chave é derivada de forma assíncrona (SHA-256) antes da RPC.
    await vi.waitFor(() => expect(createCalls()).toHaveLength(1));
    await act(async () => {
      liberar({ data: { status: 'created', order_id: 'order-1' }, error: null });
      await primeira;
    });

    expect(createCalls()).toHaveLength(1);
    expect(segunda).toBeNull();
    expect(toast.info).toHaveBeenCalledWith(expect.stringMatching(/Aguarde/));
  });

  it('retry depois de erro reaproveita a chave; o servidor devolve o pedido já gravado', async () => {
    createResponse = async () => ({ data: null, error: { message: 'Failed to fetch' } });
    const { result } = renderHook(() => usePurchaseOrdersStore());
    await act(async () => { await result.current.createOrder(orderData, items, form1); });

    createResponse = async () => ({ data: { status: 'idempotent', order_id: 'order-1', deleted: false }, error: null });
    let res: unknown;
    await act(async () => { res = await result.current.createOrder(orderData, items, form1); });

    const [primeira, segunda] = createCalls();
    expect(segunda[1].p_idempotency_key).toBe(primeira[1].p_idempotency_key);
    expect(res).toEqual({ id: 'order-1', idempotent: true, deleted: false });
  });

  it('pedido alterado ou formulário novo usam outra chave', async () => {
    const { result } = renderHook(() => usePurchaseOrdersStore());
    await act(async () => { await result.current.createOrder(orderData, items, form1); });
    await act(async () => { await result.current.createOrder({ ...orderData, title: 'Outro' }, items, form1); });
    await act(async () => { await result.current.createOrder(orderData, items, form2); });

    const chaves = createCalls().map(([, args]) => args.p_idempotency_key);
    expect(new Set(chaves).size).toBe(3);
  });

  it('REQUEST_ID_REUTILIZADO vira orientação, não "tente de novo"', async () => {
    createResponse = async () => ({ data: null, error: { message: 'REQUEST_ID_REUTILIZADO: a chave pertence a outro pedido' } });
    const { result } = renderHook(() => usePurchaseOrdersStore());
    await act(async () => { await result.current.createOrder(orderData, items, form1); });

    expect(toast.error).toHaveBeenCalledWith(expect.stringMatching(/Confira a lista de pedidos/));
  });
});

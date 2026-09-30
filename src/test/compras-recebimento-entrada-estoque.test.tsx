/**
 * Recebimento de pedido de compra: a entrada no estoque é uma escolha do usuário.
 *
 * Cobre o que não pode regredir:
 *   · confirmar o recebimento pergunta antes de dar entrada, e "Não" chega à RPC
 *     como stock_entry=false;
 *   · "Voltar" não registra nada;
 *   · sem item vinculado a produto não há entrada possível, então não pergunta;
 *   · o item recebido sem entrada fica identificado na tela.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PedidosComprasMercadoView from '@/components/PedidosComprasMercadoView';
import type { PurchaseOrder, PurchaseOrderItem } from '@/hooks/usePurchaseOrdersStore';

vi.mock('@/hooks/useScopedToast', () => ({
  useScopedToast: () => ({ error: vi.fn(), success: vi.fn(), info: vi.fn(), warning: vi.fn() }),
}));
// A tela só lê stock_categories direto; o resto passa pela store. Cliente estável,
// senão o efeito que depende dele roda a cada render.
const mockSupabase = vi.hoisted(() => {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    then: (resolve: (r: { data: unknown[] }) => unknown) => Promise.resolve({ data: [] }).then(resolve),
  };
  return { from: () => query };
});
vi.mock('@/contexts/CompanyScopeContext', () => ({
  useSupabase: () => mockSupabase,
  useCompanyScope: () => ({ companyId: 'company-1' }),
}));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'user-1' } }) }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/contexts/EstoqueGeralStoreContext', () => ({ useEstoqueGeralStoreContext: () => ({ produtos: [] }) }));
vi.mock('@/contexts/SalmonStoreContext', () => ({ useSalmonStoreContext: () => ({ suppliers: [] }) }));

const mockStore = {
  orders: [] as PurchaseOrder[],
  loading: false,
  errorMessage: null as string | null,
  openCount: 1,
  receivingCount: 0,
  unackedPartialCount: 0,
  fetchItems: vi.fn(),
  fetchOrders: vi.fn().mockResolvedValue(undefined),
  confirmReceiving: vi.fn().mockResolvedValue(true),
  finalizePartialItem: vi.fn().mockResolvedValue(undefined),
  acknowledgeNotDelivered: vi.fn(),
  cancelOrder: vi.fn(),
  createOrder: vi.fn(),
  deleteOrder: vi.fn(),
  editOrder: vi.fn(),
};
vi.mock('@/contexts/PurchaseOrdersStoreContext', () => ({ usePurchaseOrdersStoreContext: () => mockStore }));

const PEDIDO: PurchaseOrder = {
  id: 'po-1', title: 'Compra da semana', type: 'FORNECEDOR', priority: 'MEDIA', category: '',
  supplier_name: 'Atacadão', payment_type: null, need_by_date: null, delivery_forecast_date: null,
  responsible_user_id: null, notes: '', status: 'OPEN', total_estimated: 0, total_confirmed: 0,
  concluded_at: null, shopping_done_at: null, shopping_done_by: null, not_delivered_ack_at: null,
  not_delivered_ack_by: null, created_by: 'user-1', created_at: '2026-09-28T12:00:00Z',
  updated_at: '2026-09-28T12:00:00Z', origin: 'MANUAL', origin_ref: null,
};

function item(over: Partial<PurchaseOrderItem>): PurchaseOrderItem {
  return {
    id: 'poi-1', order_id: 'po-1', stock_item_id: 'prod-1', name_snapshot: 'Arroz 5kg', unit_snapshot: 'UN',
    estimated_unit_value: 25, qty_requested: 4, qty_received: 0, received_status: 'PENDING',
    not_delivered_reason: null, received_at: null, received_by: null, shopping_status: 'OK', shopping_note: '',
    purchase_unit_snapshot: null, purchase_unit_cost_snapshot: null, conversion_factor_snapshot: 1,
    stock_entry_skipped: false, created_at: '2026-09-28T12:00:00Z', updated_at: '2026-09-28T12:00:00Z',
    ...over,
  };
}

async function abrirPedido(itens: PurchaseOrderItem[]) {
  mockStore.fetchItems.mockResolvedValue(itens);
  render(<PedidosComprasMercadoView />);
  fireEvent.click(screen.getByText('Compra da semana'));
  await screen.findByText('Confirmar Recebimento');
}

beforeEach(() => {
  vi.clearAllMocks();
  mockStore.orders = [PEDIDO];
  mockStore.confirmReceiving.mockResolvedValue(true);
});
afterEach(() => { cleanup(); });

describe('recebimento com entrada no estoque opcional', () => {
  it('"Não" registra o recebimento sem entrada no estoque', async () => {
    await abrirPedido([
      item({}),
      item({ id: 'poi-2', stock_item_id: null, name_snapshot: 'Frete avulso', qty_requested: 1 }),
    ]);

    fireEvent.click(screen.getByText('Confirmar Recebimento'));

    expect(await screen.findByText('Dar entrada no estoque?')).toBeTruthy();
    // Só o item vinculado a produto aparece — o avulso nunca gera entrada.
    expect(screen.getByText('• Arroz 5kg: 4 UN')).toBeTruthy();
    expect(screen.queryByText(/Frete avulso:/)).toBeNull();
    expect(mockStore.confirmReceiving).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText('Não, só receber'));

    await waitFor(() => expect(mockStore.confirmReceiving).toHaveBeenCalledTimes(1));
    const [orderId, decisions, stockEntry] = mockStore.confirmReceiving.mock.calls[0];
    expect(orderId).toBe('po-1');
    expect(stockEntry).toBe(false);
    expect(decisions).toHaveLength(2);
  });

  it('"Sim" dá entrada no estoque', async () => {
    await abrirPedido([item({})]);

    fireEvent.click(screen.getByText('Confirmar Recebimento'));
    fireEvent.click(await screen.findByText('Sim, dar entrada'));

    await waitFor(() => expect(mockStore.confirmReceiving).toHaveBeenCalledTimes(1));
    expect(mockStore.confirmReceiving.mock.calls[0][2]).toBe(true);
  });

  it('"Voltar" não registra o recebimento', async () => {
    await abrirPedido([item({})]);

    fireEvent.click(screen.getByText('Confirmar Recebimento'));
    fireEvent.click(await screen.findByText('Voltar'));

    await waitFor(() => expect(screen.queryByText('Dar entrada no estoque?')).toBeNull());
    expect(mockStore.confirmReceiving).not.toHaveBeenCalled();
  });

  it('sem item vinculado a produto não pergunta', async () => {
    await abrirPedido([item({ stock_item_id: null, name_snapshot: 'Frete avulso' })]);

    fireEvent.click(screen.getByText('Confirmar Recebimento'));

    await waitFor(() => expect(mockStore.confirmReceiving).toHaveBeenCalledTimes(1));
    expect(screen.queryByText('Dar entrada no estoque?')).toBeNull();
  });

  it('item recebido sem entrada fica identificado', async () => {
    await abrirPedido([
      item({ received_status: 'RECEIVED', qty_received: 4, stock_entry_skipped: true }),
      item({ id: 'poi-2', name_snapshot: 'Feijão 1kg' }),
    ]);

    expect(screen.getByText(/sem entrada no estoque/)).toBeTruthy();
  });
});

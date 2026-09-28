import { useCompanyId } from '@/hooks/useCompanyId';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useEmitDataEvent } from '@/lib/dataEvents';
import { includesNormalized } from '@/lib/utils';

export interface PurchaseOrder {
  id: string;
  title: string;
  type: 'FORNECEDOR' | 'MERCADO' | 'SAZONAL';
  priority: 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE';
  category: string;
  supplier_name: string | null;
  payment_type: string | null;
  need_by_date: string | null;
  delivery_forecast_date: string | null;
  responsible_user_id: string | null;
  notes: string;
  status: 'PENDING' | 'SHOPPING_OK' | 'OPEN' | 'IN_RECEIVING' | 'PARTIAL' | 'COMPLETED' | 'CANCELLED';
  total_estimated: number;
  total_confirmed: number;
  concluded_at: string | null;
  shopping_done_at: string | null;
  shopping_done_by: string | null;
  not_delivered_ack_at: string | null;
  not_delivered_ack_by: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
  origin: string;
  origin_ref: string | null;
}

export interface PurchaseOrderItem {
  id: string;
  order_id: string;
  stock_item_id: string | null;
  name_snapshot: string;
  unit_snapshot: string;
  estimated_unit_value: number;
  qty_requested: number;
  qty_received: number;
  received_status: 'PENDING' | 'RECEIVED' | 'NOT_DELIVERED';
  not_delivered_reason: string | null;
  received_at: string | null;
  received_by: string | null;
  shopping_status: 'PENDING' | 'OK' | 'NOT_AVAILABLE';
  shopping_note: string;
  purchase_unit_snapshot: string | null;
  purchase_unit_cost_snapshot: number | null;
  conversion_factor_snapshot: number | null;
  /** Recebido sem entrada automática no estoque (o usuário respondeu "não" no recebimento). */
  stock_entry_skipped: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShoppingDecision {
  order_item_id: string;
  shopping_status: 'OK' | 'NOT_AVAILABLE';
  note?: string;
}

export interface ReceivingDecision {
  order_item_id: string;
  status: 'RECEIVED' | 'NOT_DELIVERED';
  qty_received: number;
  unit_cost: number;
  reason?: string;
}

const PO_PAGE_SIZE = 50;
const FALLBACK_SEARCH_LIMIT = 200;
const PURCHASE_ORDER_SELECT = 'id, title, type, priority, category, supplier_name, payment_type, need_by_date, delivery_forecast_date, responsible_user_id, notes, status, total_estimated, total_confirmed, concluded_at, shopping_done_at, shopping_done_by, not_delivered_ack_at, not_delivered_ack_by, created_by, created_at, updated_at, origin, origin_ref';
const PURCHASE_ORDER_ITEM_SELECT = 'id, order_id, stock_item_id, name_snapshot, unit_snapshot, estimated_unit_value, qty_requested, qty_received, received_status, not_delivered_reason, received_at, received_by, shopping_status, shopping_note, purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot, stock_entry_skipped, created_at, updated_at';
type PurchaseOrderRow = PurchaseOrder & { has_more?: boolean | null };

export interface PurchaseOrderFilters {
  status?: string;
  type?: string;
  priority?: string;
  search?: string;
  responsible?: string;
}

function normalizePurchaseOrder(row: PurchaseOrderRow): PurchaseOrder {
  return {
    ...row,
    category: row.category ?? '',
    supplier_name: row.supplier_name ?? null,
    payment_type: row.payment_type ?? null,
    need_by_date: row.need_by_date ?? null,
    delivery_forecast_date: row.delivery_forecast_date ?? null,
    responsible_user_id: row.responsible_user_id ?? null,
    notes: row.notes ?? '',
    concluded_at: row.concluded_at ?? null,
    shopping_done_at: row.shopping_done_at ?? null,
    shopping_done_by: row.shopping_done_by ?? null,
    not_delivered_ack_at: row.not_delivered_ack_at ?? null,
    not_delivered_ack_by: row.not_delivered_ack_by ?? null,
    origin_ref: row.origin_ref ?? null,
  };
}

function dedupePurchaseOrders(rows: PurchaseOrder[]): PurchaseOrder[] {
  const seen = new Set<string>();
  return rows.filter((row) => {
    if (seen.has(row.id)) return false;
    seen.add(row.id);
    return true;
  });
}

function matchesPurchaseOrderSearch(order: PurchaseOrder, search: string): boolean {
  return includesNormalized(order.title, search) || includesNormalized(order.supplier_name || '', search);
}

export function usePurchaseOrdersStore() {
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const { user } = useAuth();
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(true);
  const [filters, setFilters] = useState<PurchaseOrderFilters>({});
  const cursorRef = useRef<{ created_at: string | null; id: string | null }>({ created_at: null, id: null });
  const fetchGenerationRef = useRef(0);
  const receiptKeysRef = useRef(new Map<string, string>());

  const fetchOrders = useCallback(async (append = false, currentFilters?: PurchaseOrderFilters) => {
    const generation = ++fetchGenerationRef.current;
    if (!user) {
      cursorRef.current = { created_at: null, id: null };
      setOrders([]);
      setHasMore(false);
      setErrorMessage(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    setErrorMessage(null);

    const f = currentFilters ?? filters;
    const cursor_created_at = append && cursorRef.current.created_at ? cursorRef.current.created_at : undefined;
    const cursor_id = append && cursorRef.current.id ? cursorRef.current.id : undefined;

    try {
      let rows: PurchaseOrder[] = [];
      let hasMoreFlag = false;

      try {
        const { data, error } = await supabase.rpc('list_purchase_orders_cursor', {
          p_limit: PO_PAGE_SIZE,
          p_cursor_created_at: cursor_created_at ?? null,
          p_cursor_id: cursor_id ?? null,
          p_status: f.status || null,
          p_type: f.type || null,
          p_priority: f.priority || null,
          p_search: f.search || null,
          p_responsible: f.responsible || null,
        });

        if (error) throw error;

        const rpcRows = Array.isArray(data) ? (data as PurchaseOrderRow[]) : [];
        rows = dedupePurchaseOrders(rpcRows.map(normalizePurchaseOrder));
        hasMoreFlag = rpcRows.length === PO_PAGE_SIZE;
      } catch (rpcError) {
        console.warn('list_purchase_orders_cursor failed, using fallback query', rpcError);

        const fallbackLimit = f.search ? FALLBACK_SEARCH_LIMIT : PO_PAGE_SIZE;
        let fallbackQuery = supabase
          .from('purchase_orders')
          .select(PURCHASE_ORDER_SELECT)
          .is('deleted_at', null)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(fallbackLimit);

        if (f.status) fallbackQuery = fallbackQuery.eq('status', f.status);
        if (f.type) fallbackQuery = fallbackQuery.eq('type', f.type);
        if (f.priority) fallbackQuery = fallbackQuery.eq('priority', f.priority);
        if (f.responsible) fallbackQuery = fallbackQuery.eq('responsible_user_id', f.responsible);
        if (append && cursor_created_at && cursor_id) {
          fallbackQuery = fallbackQuery.or(
            `created_at.lt.${cursor_created_at},and(created_at.eq.${cursor_created_at},id.lt.${cursor_id})`
          );
        }

        const { data: fallbackData, error: fallbackError } = await fallbackQuery;
        if (fallbackError) {
          console.error('purchase_orders fallback failed', fallbackError);
          if (generation === fetchGenerationRef.current) {
            setHasMore(false);
            setErrorMessage('Não foi possível carregar os pedidos agora.');
          }
          return;
        }

        const fallbackRows = dedupePurchaseOrders(((fallbackData || []) as PurchaseOrderRow[]).map(normalizePurchaseOrder));
        rows = f.search ? fallbackRows.filter((order) => matchesPurchaseOrderSearch(order, f.search!)) : fallbackRows;
        hasMoreFlag = !f.search && fallbackRows.length === PO_PAGE_SIZE;
      }

      if (generation !== fetchGenerationRef.current) return;

      setHasMore(hasMoreFlag);

      if (rows.length > 0) {
        const last = rows[rows.length - 1];
        cursorRef.current.created_at = last.created_at;
        cursorRef.current.id = last.id;
      } else if (!append) {
        cursorRef.current = { created_at: null, id: null };
      }

      setOrders((prev) => (append ? dedupePurchaseOrders([...prev, ...rows]) : rows));
    } finally {
      if (generation === fetchGenerationRef.current) setLoading(false);
    }
  }, [filters, supabase, user]);

  const loadMore = useCallback(() => {
    if (hasMore && !loading) fetchOrders(true);
  }, [hasMore, loading, fetchOrders]);

  const applyFilters = useCallback((newFilters: PurchaseOrderFilters) => {
    setFilters(newFilters);
    cursorRef.current.created_at = null;
    cursorRef.current.id = null;
  }, []);

  useEffect(() => {
    if (user) fetchOrders();
  }, [user, fetchOrders]);

  // Mantém a referência mais recente de fetchOrders sem re-executar o efeito do
  // canal Realtime. O efeito abaixo depende só de [user], então o canal é criado
  // e subscrito UMA vez por sessão — nunca re-bindado quando os filtros mudam
  // (evita o erro "cannot add postgres_changes callbacks after subscribe()").
  const fetchOrdersRef = useRef(fetchOrders);
  useEffect(() => { fetchOrdersRef.current = fetchOrders; }, [fetchOrders]);

  useEffect(() => {
    if (!user || !companyId) return;
    let active = true;
    const channel = supabase
      .channel('purchase-orders-rt:' + companyId)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'purchase_orders', filter: `company_id=eq.${companyId}` }, () => {
        if (active) fetchOrdersRef.current();
      })
      .subscribe();
    return () => { active = false; supabase.removeChannel(channel); };
  }, [companyId, supabase, user]);

  const fetchItems = useCallback(async (orderId: string): Promise<PurchaseOrderItem[]> => {
    const { data } = await supabase
      .from('purchase_order_items')
      .select(PURCHASE_ORDER_ITEM_SELECT)
      .eq('order_id', orderId)
      .is('deleted_at', null)
      .order('name_snapshot', { ascending: true })
      .order('created_at', { ascending: true });
    return (data || []) as unknown as PurchaseOrderItem[];
  }, [supabase]);

  // ===== W2: ATOMIC createOrder via RPC =====
  const createOrder = useCallback(async (
    orderData: Omit<PurchaseOrder, 'id' | 'created_at' | 'updated_at' | 'concluded_at' | 'total_confirmed' | 'created_by' | 'shopping_done_at' | 'shopping_done_by' | 'not_delivered_ack_at' | 'not_delivered_ack_by'>,
    items: { stock_item_id?: string; name_snapshot: string; unit_snapshot: string; estimated_unit_value: number; qty_requested: number; purchase_unit_snapshot?: string; purchase_unit_cost_snapshot?: number; conversion_factor_snapshot?: number }[]
  ) => {
    if (!user || saving) return null;
    setSaving(true);

    try {
      const idempotencyKey = crypto.randomUUID();

      const payload = {
        title: orderData.title,
        type: orderData.type,
        priority: orderData.priority,
        category: orderData.category,
        supplier_name: orderData.supplier_name || '',
        payment_type: orderData.payment_type || '',
        need_by_date: orderData.need_by_date || null,
        delivery_forecast_date: orderData.delivery_forecast_date || null,
        responsible_user_id: orderData.responsible_user_id || '',
        notes: orderData.notes || '',
        items: items.map(i => ({
          stock_item_id: i.stock_item_id || '',
          name_snapshot: i.name_snapshot,
          unit_snapshot: i.unit_snapshot,
          estimated_unit_value: i.estimated_unit_value,
          qty_requested: i.qty_requested,
          purchase_unit_snapshot: i.purchase_unit_snapshot || i.unit_snapshot,
          purchase_unit_cost_snapshot: i.purchase_unit_cost_snapshot ?? i.estimated_unit_value,
          conversion_factor_snapshot: i.conversion_factor_snapshot ?? 1,
        })),
      };

      const { data: result, error } = await supabase.rpc('create_purchase_order_atomic', {
        p_payload: payload as any,
        p_idempotency_key: idempotencyKey,
      });

      if (error) { toast.error('Erro ao criar pedido: ' + error.message); return null; }

      const res = result as any;
      const orderId = res?.order_id;

      await fetchOrders();
      if (res?.status === 'idempotent') {
        toast.info('Pedido já criado (operação duplicada ignorada).');
      }
      return { id: orderId };
    } finally {
      setSaving(false);
    }
  }, [user, saving, supabase, fetchOrders, toast]);

  // ===== SHOPPING CHECKLIST FUNCTIONS =====
  const confirmShopping = useCallback(async (orderId: string, decisions: ShoppingDecision[]) => {
    if (!user) return false;

    const { error } = await supabase.rpc('confirm_purchase_shopping_atomic' as any, {
      p_order_id: orderId,
      p_items: decisions as any,
    });
    if (error) {
      toast.error('Erro ao confirmar a compra: ' + error.message);
      return false;
    }

    await fetchOrders();
    toast.success('Compra confirmada! Pedido enviado para Recebimento.');
    emitDataEvent('compras:pedidos');
    return true;
  }, [user, supabase, fetchOrders, emitDataEvent, toast]);

  // ===== RECEIVING FUNCTIONS =====
  /**
   * `stockEntry=false` registra o recebimento sem gerar ENTRADA no estoque — escolha
   * do usuário no diálogo de confirmação. A resposta diz o que o servidor fez de fato:
   * num replay idempotente vale a escolha da 1ª tentativa, não a atual.
   */
  const confirmReceiving = useCallback(async (orderId: string, rpcItems: ReceivingDecision[], stockEntry: boolean) => {
    if (!user) return false;
    const keyName = `order:${orderId}`;
    const idempotencyKey = receiptKeysRef.current.get(keyName) ?? crypto.randomUUID();
    receiptKeysRef.current.set(keyName, idempotencyKey);

    const { data: result, error } = await supabase.rpc('receive_purchase_order_atomic', {
      p_order_id: orderId,
      p_items: rpcItems as any,
      p_metadata: { source: 'confirmReceiving', idempotency_key: idempotencyKey, stock_entry: stockEntry } as any,
    });

    if (error) {
      toast.error('Erro no recebimento: ' + error.message);
      return false;
    }

    receiptKeysRef.current.delete(keyName);

    const res = result as any;
    const newStatus = res?.status || 'COMPLETED';
    // Lote gravado antes da entrada opcional não traz stock_entry — esses sempre deram entrada.
    const enteredStock = res?.stock_entry !== false;

    await fetchOrders();
    if (newStatus === 'COMPLETED') {
      toast.success(enteredStock ? 'Pedido concluído! Estoque atualizado.' : 'Pedido concluído, sem entrada no estoque.');
    } else {
      toast.success(`Recebimento parcial registrado${enteredStock ? '' : ', sem entrada no estoque'}. Itens não entregues pendentes.`);
    }
    emitDataEvent('compras:pedidos');
    emitDataEvent('estoque:movimentacoes');
    return true;
  }, [user, supabase, fetchOrders, emitDataEvent, toast]);

  const finalizePartialItem = useCallback(async (itemId: string, qtyReceived: number, stockEntry: boolean) => {
    if (!user) return;

    const { data: item } = await supabase.from('purchase_order_items').select(PURCHASE_ORDER_ITEM_SELECT).eq('id', itemId).single();
    if (!item) return;
    const typedItem = item as unknown as PurchaseOrderItem;

    const rpcItems = [{
      order_item_id: itemId,
      status: 'RECEIVED',
      qty_received: qtyReceived,
      unit_cost: typedItem.estimated_unit_value,
    }];

    const keyName = `item:${itemId}`;
    const idempotencyKey = receiptKeysRef.current.get(keyName) ?? crypto.randomUUID();
    receiptKeysRef.current.set(keyName, idempotencyKey);
    const { data: result, error } = await supabase.rpc('receive_purchase_order_atomic', {
      p_order_id: typedItem.order_id,
      p_items: rpcItems as any,
      p_metadata: { source: 'finalizePartialItem', idempotency_key: idempotencyKey, stock_entry: stockEntry } as any,
    });

    if (error) {
      toast.error('Erro ao receber item: ' + error.message);
      return;
    }

    receiptKeysRef.current.delete(keyName);

    const res = result as any;
    const newStatus = res?.status || 'PARTIAL';
    const enteredStock = res?.stock_entry !== false;

    await fetchOrders();
    if (newStatus === 'COMPLETED') {
      toast.success(enteredStock ? 'Todos os itens recebidos! Pedido concluído.' : 'Todos os itens recebidos, sem entrada no estoque. Pedido concluído.');
    } else {
      toast.success(enteredStock ? 'Item recebido e estoque atualizado.' : 'Item recebido, sem entrada no estoque.');
    }
    emitDataEvent('compras:pedidos');
    emitDataEvent('estoque:movimentacoes');
  }, [user, supabase, fetchOrders, emitDataEvent, toast]);

  const updateOrderStatus = useCallback(async (orderId: string, status: string) => {
    await supabase.from('purchase_orders').update({
      status,
      // W5: updated_at handled by server trigger
    }).eq('id', orderId);
    await fetchOrders();
  }, [fetchOrders, supabase]);

  const cancelOrder = useCallback(async (orderId: string) => {
    if (!user) return;
    await supabase.from('purchase_orders').update({
      status: 'CANCELLED',
    }).eq('id', orderId);


    await fetchOrders();
    toast.success('Pedido cancelado.');
    emitDataEvent('compras:pedidos');
  }, [user, supabase, fetchOrders, emitDataEvent, toast]);

  // ===== W2: ATOMIC editOrder via RPC =====
  const editOrder = useCallback(async (
    orderId: string,
    updates: Partial<Pick<PurchaseOrder, 'title' | 'type' | 'priority' | 'category' | 'supplier_name' | 'payment_type' | 'need_by_date' | 'delivery_forecast_date' | 'responsible_user_id' | 'notes'>>,
    newItems?: { stock_item_id?: string; name_snapshot: string; unit_snapshot: string; estimated_unit_value: number; qty_requested: number; purchase_unit_snapshot?: string; purchase_unit_cost_snapshot?: number; conversion_factor_snapshot?: number }[]
  ) => {
    if (!user || saving) return false;
    setSaving(true);

    try {
      const payload: Record<string, any> = {
        title: updates.title || '',
        type: updates.type || '',
        priority: updates.priority || '',
        category: updates.category ?? '',
        supplier_name: updates.supplier_name || '',
        payment_type: updates.payment_type || '',
        need_by_date: updates.need_by_date || null,
        delivery_forecast_date: updates.delivery_forecast_date || null,
        responsible_user_id: updates.responsible_user_id || '',
        notes: updates.notes ?? '',
      };

      if (newItems) {
        payload.items = newItems.map(i => ({
          stock_item_id: i.stock_item_id || '',
          name_snapshot: i.name_snapshot,
          unit_snapshot: i.unit_snapshot,
          estimated_unit_value: i.estimated_unit_value,
          qty_requested: i.qty_requested,
          purchase_unit_snapshot: i.purchase_unit_snapshot || i.unit_snapshot,
          purchase_unit_cost_snapshot: i.purchase_unit_cost_snapshot ?? i.estimated_unit_value,
          conversion_factor_snapshot: i.conversion_factor_snapshot ?? 1,
        }));
      }

      const { data: result, error } = await supabase.rpc('edit_purchase_order_atomic', {
        p_order_id: orderId,
        p_payload: payload as any,
      });

      if (error) { toast.error('Erro ao editar: ' + error.message); return false; }

      await fetchOrders();
      toast.success('Pedido atualizado!');
      emitDataEvent('compras:pedidos');
      return true;
    } finally {
      setSaving(false);
    }
  }, [user, saving, supabase, fetchOrders, emitDataEvent, toast]);

  const deleteOrder = useCallback(async (orderId: string) => {
    if (!user) return false;
    const { data, error } = await supabase.rpc('delete_purchase_order_atomic' as any, {
      p_order_id: orderId,
    });

    if (error) { toast.error('Erro ao excluir: ' + error.message); return false; }
    const reversedCount = Number((data as any)?.reversed_count) || 0;

    await fetchOrders();
    toast.success(reversedCount > 0 ? 'Pedido excluído (arquivado) e estoque estornado.' : 'Pedido excluído (arquivado).');
    emitDataEvent('compras:pedidos');
    if (reversedCount > 0) emitDataEvent('estoque:movimentacoes');
    return true;
  }, [user, supabase, fetchOrders, emitDataEvent, toast]);

  // Counts
  const pendingCount = orders.filter(o => o.status === 'PENDING').length;
  const openCount = orders.filter(o => o.status === 'OPEN' || o.status === 'PENDING').length;
  const receivingCount = orders.filter(o => o.status === 'IN_RECEIVING' || o.status === 'SHOPPING_OK').length;
  const partialCount = orders.filter(o => o.status === 'PARTIAL').length;
  const completedCount = orders.filter(o => o.status === 'COMPLETED').length;
  const unackedPartialCount = orders.filter(o => o.status === 'PARTIAL' && !o.not_delivered_ack_at).length;

  const shoppingCount = orders.filter(o =>
    o.status === 'PENDING' &&
    (o.type === 'MERCADO' || o.type === 'SAZONAL') &&
    o.responsible_user_id === user?.id
  ).length;

  const acknowledgeNotDelivered = useCallback(async (orderId: string) => {
    if (!user) return;
    await supabase.from('purchase_orders').update({
      not_delivered_ack_at: new Date().toISOString(),
      not_delivered_ack_by: user.id,
      // W5: updated_at handled by server trigger
    }).eq('id', orderId);

    await supabase.from('notifications').update({ read_at: new Date().toISOString() })
      .eq('recipient_user_id', user.id)
      .eq('entity_id', orderId)
      .eq('type', 'NOT_DELIVERED_ACK_REQUIRED')
      .is('read_at', null);

    await fetchOrders();
    toast.success('Ciência registrada.');
  }, [user, supabase, fetchOrders, toast]);

  return {
    orders, loading, saving, errorMessage, hasMore, loadMore, filters, applyFilters,
    openCount, receivingCount, partialCount, completedCount, pendingCount, shoppingCount, unackedPartialCount,
    fetchOrders, fetchItems,
    createOrder, editOrder, deleteOrder,
    confirmReceiving,
    finalizePartialItem, updateOrderStatus, cancelOrder,
    confirmShopping,
    acknowledgeNotDelivered,
  };
}

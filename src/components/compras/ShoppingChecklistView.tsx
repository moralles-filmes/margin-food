import { useState, useEffect, useCallback, useMemo } from 'react';
import { fmtBRL } from '@/lib/money';
import { ShoppingCart, Check, X, RefreshCw, Inbox, Package, AlertTriangle, ChevronRight, Send, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions/hooks';
import { usePurchaseOrdersStore, PurchaseOrder, PurchaseOrderItem } from '@/hooks/usePurchaseOrdersStore';
import { supabase } from '@/integrations/supabase/client';

interface Props {
  onNavigateToOrder?: (orderId: string) => void;
}

export default function ShoppingChecklistView({ onNavigateToOrder }: Props) {
  const { user } = useAuth();
  const store = usePurchaseOrdersStore();
  const isAdmin = useCan('system:global:manage');

  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
  const [items, setItems] = useState<PurchaseOrderItem[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);

  // Filter: only MERCADO/SAZONAL orders where user is responsible and status is PENDING
  const myOrders = useMemo(() => {
    if (!user) return [];
    return store.orders.filter(o =>
      (o.type === 'MERCADO' || o.type === 'SAZONAL') &&
      o.status === 'PENDING' &&
      (o.responsible_user_id === user.id || isAdmin)
    );
  }, [store.orders, user, isAdmin]);

  const fetchItemsFn = store.fetchItems;
  const loadItems = useCallback(async (orderId: string) => {
    setLoadingItems(true);
    const data = await fetchItemsFn(orderId);
    setItems(data);
    const n: Record<string, string> = {};
    data.forEach(i => { n[i.id] = i.shopping_note || ''; });
    setNotes(n);
    setLoadingItems(false);
  }, [fetchItemsFn]);

  useEffect(() => {
    if (selectedOrderId) loadItems(selectedOrderId);
  }, [selectedOrderId, loadItems]);

  const handleMarkItem = async (itemId: string, status: 'OK' | 'NOT_AVAILABLE') => {
    await store.updateShoppingItem(itemId, status, notes[itemId] || '');
    setItems(prev => prev.map(i => i.id === itemId ? { ...i, shopping_status: status, shopping_note: notes[itemId] || '' } : i));
  };

  const handleConfirmShopping = async () => {
    if (!selectedOrderId) return;
    const pending = items.filter(i => i.shopping_status === 'PENDING');
    if (pending.length > 0) {
      toast.error(`Ainda há ${pending.length} item(ns) pendente(s). Marque todos antes de enviar.`);
      return;
    }
    setSubmitting(true);
    await store.confirmShopping(selectedOrderId);
    setSubmitting(false);
    setSelectedOrderId(null);
  };

  const selectedOrder = myOrders.find(o => o.id === selectedOrderId);

  // Detail view
  if (selectedOrder) {
    const okCount = items.filter(i => i.shopping_status === 'OK').length;
    const naCount = items.filter(i => i.shopping_status === 'NOT_AVAILABLE').length;
    const pendingCount = items.filter(i => i.shopping_status === 'PENDING').length;
    const progress = items.length > 0 ? ((okCount + naCount) / items.length) * 100 : 0;
    const canSubmit = pendingCount === 0 && okCount > 0;

    return (
      <div className="space-y-4">
        <button onClick={() => setSelectedOrderId(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
          ← Voltar
        </button>

        <div className="bg-card border border-border rounded-xl p-4">
          <div className="flex items-start justify-between mb-3">
            <div>
              <h3 className="text-base font-bold text-foreground">{selectedOrder.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-warning/15 text-warning font-semibold">Checklist de Compra</span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{selectedOrder.type}</span>
                {selectedOrder.category && <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{selectedOrder.category}</span>}
              </div>
            </div>
            <div className="text-right text-xs text-muted-foreground">
              <p>{fmtBRL(selectedOrder.total_estimated)}</p>
              {selectedOrder.need_by_date && <p>Até: {selectedOrder.need_by_date}</p>}
            </div>
          </div>

          {selectedOrder.notes && <p className="text-xs text-muted-foreground italic mb-3">{selectedOrder.notes}</p>}

          <div className="mb-4">
            <div className="flex items-center justify-between text-xs mb-1">
              <span className="text-muted-foreground">Progresso: {okCount + naCount}/{items.length}</span>
              <span className="font-semibold text-foreground">{Math.round(progress)}%</span>
            </div>
            <Progress value={progress} className="h-2" />
            <div className="flex gap-3 mt-1.5 text-[10px]">
              <span className="text-success">✅ {okCount} comprados</span>
              <span className="text-destructive">❌ {naCount} indisponíveis</span>
              <span className="text-muted-foreground">⏳ {pendingCount} pendentes</span>
            </div>
          </div>
        </div>

        {/* Items checklist */}
        {loadingItems ? (
          <div className="flex items-center justify-center p-8">
            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
          </div>
        ) : (
          <div className="space-y-2">
            {items.map((item, i) => (
              <div key={item.id} className={`bg-card border rounded-xl p-3 transition-all animate-fade-up ${
                item.shopping_status === 'OK' ? 'border-success/30 bg-success/5' :
                item.shopping_status === 'NOT_AVAILABLE' ? 'border-destructive/30 bg-destructive/5' :
                'border-border'
              }`} style={{ animationDelay: `${i * 20}ms` }}>
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3 flex-1">
                    <div className="mt-0.5">
                      {item.shopping_status === 'OK' ? <CheckCircle2 className="w-5 h-5 text-success" /> :
                       item.shopping_status === 'NOT_AVAILABLE' ? <X className="w-5 h-5 text-destructive" /> :
                       <div className="w-5 h-5 rounded border-2 border-muted-foreground/30" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm font-medium ${item.shopping_status === 'OK' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                        {item.name_snapshot}
                      </p>
                      <p className="text-[10px] text-muted-foreground">
                        {item.qty_requested} {item.purchase_unit_snapshot || item.unit_snapshot} × {fmtBRL(item.estimated_unit_value)} = {fmtBRL(item.qty_requested * item.estimated_unit_value)}
                      </p>
                    </div>
                  </div>

                  {item.shopping_status === 'PENDING' && (
                    <div className="flex items-center gap-1 flex-shrink-0">
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-0.5 border-success/30 text-success hover:bg-success/10"
                        onClick={() => handleMarkItem(item.id, 'OK')}>
                        <Check className="w-3 h-3" /> Comprado
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 px-2 text-[10px] gap-0.5 border-destructive/30 text-destructive hover:bg-destructive/10"
                        onClick={() => handleMarkItem(item.id, 'NOT_AVAILABLE')}>
                        <X className="w-3 h-3" /> Indisponível
                      </Button>
                    </div>
                  )}

                  {item.shopping_status !== 'PENDING' && (
                    <Button size="sm" variant="ghost" className="h-7 px-2 text-[10px] text-muted-foreground"
                      onClick={async () => {
                        await supabase.from('purchase_order_items').update({ shopping_status: 'PENDING', shopping_note: '' }).eq('id', item.id);
                        setItems(prev => prev.map(i => i.id === item.id ? { ...i, shopping_status: 'PENDING' as PurchaseOrderItem['shopping_status'], shopping_note: '' } : i));
                      }}>
                      Desfazer
                    </Button>
                  )}
                </div>

                {/* Note field for NOT_AVAILABLE */}
                {item.shopping_status === 'NOT_AVAILABLE' && (
                  <div className="mt-2 ml-8">
                    <Input
                      value={notes[item.id] || ''}
                      onChange={e => {
                        const val = e.target.value;
                        setNotes(prev => ({ ...prev, [item.id]: val }));
                      }}
                      onBlur={() => store.updateShoppingItem(item.id, 'NOT_AVAILABLE', notes[item.id] || '')}
                      placeholder="Motivo (opcional)..."
                      className="text-xs h-7"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {/* Submit button */}
        <div className="flex justify-end gap-2 pt-2">
          <Button size="sm" variant="ghost" onClick={() => setSelectedOrderId(null)}>Cancelar</Button>
          <Button size="sm" className="gap-1.5 bg-success text-success-foreground hover:bg-success/90"
            disabled={!canSubmit || submitting}
            onClick={handleConfirmShopping}>
            <Send className="w-3.5 h-3.5" />
            {submitting ? 'Enviando...' : 'Enviar para Recebimento'}
          </Button>
        </div>
      </div>
    );
  }

  // List view
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingCart className="w-4 h-4 text-warning" />
          <p className="text-sm font-semibold text-foreground">Checklist de Compra</p>
          {myOrders.length > 0 && (
            <span className="bg-warning/15 text-warning text-[10px] px-2 py-0.5 rounded-full font-bold">{myOrders.length} pendente{myOrders.length > 1 ? 's' : ''}</span>
          )}
        </div>
        <Button size="sm" variant="outline" className="gap-1 text-xs h-8" onClick={() => store.fetchOrders()} disabled={store.loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${store.loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Pedidos de Mercado/Sazonal atribuídos a você. Marque os itens comprados e envie para conferência.
      </p>

      {myOrders.length > 0 ? (
        <div className="space-y-2">
          {myOrders.map((order, i) => (
            <button
              key={order.id}
              onClick={() => setSelectedOrderId(order.id)}
              className="w-full text-left bg-card border border-warning/20 rounded-xl p-3 hover:border-primary/30 transition-all animate-fade-up"
              style={{ animationDelay: `${i * 30}ms` }}
            >
              <div className="flex items-center justify-between">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <ShoppingCart className="w-4 h-4 text-warning flex-shrink-0" />
                    <p className="text-sm font-semibold text-foreground truncate">{order.title}</p>
                  </div>
                  <div className="flex items-center gap-2 mt-1 flex-wrap">
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-semibold">Aguardando Compra</span>
                    <span className="text-[9px] text-muted-foreground">{order.type}</span>
                    {order.category && <span className="text-[9px] text-muted-foreground">• {order.category}</span>}
                    <span className="text-[9px] text-muted-foreground">{fmtBRL(order.total_estimated)}</span>
                    {order.need_by_date && <span className="text-[9px] text-muted-foreground">• Até: {order.need_by_date}</span>}
                  </div>
                </div>
                <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
              </div>
            </button>
          ))}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-foreground mb-1">Nenhum checklist pendente</p>
          <p className="text-xs text-muted-foreground">Quando alguém atribuir você como responsável de um pedido de Mercado ou Sazonal, aparecerá aqui.</p>
        </div>
      )}
    </div>
  );
}

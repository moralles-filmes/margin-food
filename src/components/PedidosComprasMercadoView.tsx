import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { includesNormalized, normalizeSearchText } from '@/lib/utils';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions/hooks';
import { PurchaseOrder, PurchaseOrderItem, ReceivingDecision } from '@/hooks/usePurchaseOrdersStore';
import { usePurchaseOrdersStoreContext } from '@/contexts/PurchaseOrdersStoreContext';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandItem } from '@/components/ui/command';
import { useScopedToast } from '@/hooks/useScopedToast';
import { fmtBRL, formatDateBR, formatDateTimeBR, formatDateValueBR, formatPercentBR } from '@/lib/formatters';
import { formatNumberToBRL, normalizeBRLMoneyToNumber } from '@/lib/money';
import { BRLInput, CurrencyInput } from '@/components/ui/brl-input';
import { compararTotais, getPrecoSugerido, getUltimaCompra } from '@/domain/compras/pedidoPrecos';
import { novaSemente } from '@/lib/chaveOperacao';
import UserMentionSelect from '@/components/UserMentionSelect';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';
import {
  Plus, ShoppingCart, X, Check, ChevronRight, AlertTriangle,
  Clock, CheckCircle2, XCircle, Inbox, Package, Search,
  Truck, MoreVertical, Pencil, Trash2, Eye, Building2, ChevronsUpDown, FileDown
} from 'lucide-react';
import ExportPedidoModal from '@/components/compras/ExportPedidoModal';
import StatusBadge, { type StatusType } from '@/components/ui/StatusBadge';
import { useNavigationRecord } from '@/hooks/useNavigationRequest';

type SubTab = 'pedidos' | 'recebimento' | 'concluidos' | 'nao-entregues';

/** Mesmos filtros de `filteredOrders`. */
const ORDER_STATUS_SUBTAB: Partial<Record<PurchaseOrder['status'], SubTab>> = {
  OPEN: 'pedidos',
  PENDING: 'pedidos',
  IN_RECEIVING: 'recebimento',
  SHOPPING_OK: 'recebimento',
  COMPLETED: 'concluidos',
  PARTIAL: 'nao-entregues',
};

// Severidade da prioridade não bate 1:1 com as 5 variantes do StatusBadge
// (URGENTE e ALTA são ambas "danger" no design system, mas precisam de intensidade
// visual distinta) — mantido como Record local com tokens semânticos.
const PRIORITY_COLORS: Record<string, string> = {
  URGENTE: 'bg-destructive text-destructive-foreground',
  ALTA: 'bg-destructive-soft text-destructive',
  MEDIA: 'bg-warning-soft text-warning',
  BAIXA: 'bg-success-soft text-success',
};

const STATUS_CONFIG: Record<string, { label: string; variant: StatusType; icon: typeof Clock }> = {
  PENDING: { label: 'Pendente (Compra)', variant: 'warning', icon: ShoppingCart },
  SHOPPING_OK: { label: 'Compra OK', variant: 'success', icon: CheckCircle2 },
  OPEN: { label: 'Aberto', variant: 'info', icon: Clock },
  IN_RECEIVING: { label: 'Em Recebimento', variant: 'warning', icon: Package },
  PARTIAL: { label: 'Parcial', variant: 'warning', icon: AlertTriangle },
  COMPLETED: { label: 'Concluído', variant: 'success', icon: CheckCircle2 },
  CANCELLED: { label: 'Cancelado', variant: 'neutral', icon: XCircle },
};


/** Linha do diálogo de entrada no estoque: item vinculado a produto que vai ser recebido. */
interface StockEntryLine { id: string; name: string; qty: number; unit: string }

type StockEntryPrompt =
  | { kind: 'order'; decisions: ReceivingDecision[]; lines: StockEntryLine[] }
  | { kind: 'item'; itemId: string; qty: number; lines: StockEntryLine[] };

/** Parse comma-separated category string into array */
function parseCategories(raw: string): string[] {
  if (!raw) return [];
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

/** Serialize category array to comma-separated string */
function serializeCategories(cats: string[]): string {
  return [...new Set(cats)].join(', ');
}

type FormItem = {
  stock_item_id?: string;
  name_snapshot: string;
  unit_snapshot: string;
  /** Preço atual (o que será pago) — é o que vai para o pedido e para o total estimado. */
  estimated_unit_value: number;
  qty_requested: number;
  purchase_unit_snapshot?: string;
  purchase_unit_cost_snapshot?: number;
  conversion_factor_snapshot?: number;
  /** Preço da última compra no estoque — só comparação na tela, não é gravado. */
  reference_unit_cost?: number | null;
};

/** "+R$ 45,00 (+4,30%)" / "-R$ 9,00 (-6,04%)" */
function formatDiferenca(diferenca: number, percentual: number | null): string {
  const sinal = diferenca > 0 ? '+' : '-';
  const pct = percentual == null ? '' : ` (${sinal}${formatPercentBR(Math.abs(percentual))})`;
  return `${sinal}${fmtBRL(Math.abs(diferenca))}${pct}`;
}

export default function PedidosComprasMercadoView() {
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { user } = useAuth();
  const store = usePurchaseOrdersStoreContext();
  const estoqueStore = useEstoqueGeralStoreContext();
  const salmonStore = useSalmonStoreContext();
  const { produtos } = estoqueStore;
  const activeSuppliers = useMemo(() => 
    salmonStore.suppliers.filter(s => s.active).sort((a, b) => a.name.localeCompare(b.name)),
    [salmonStore.suppliers]
  );

  const productOptions: ProductOption[] = useMemo(() =>
    produtos.filter(p => p.ativo).map(p => {
      const purchaseUnit = p.unidadeCompra || p.unidadeMedida || 'UN';
      const ultima = getUltimaCompra(p);
      return {
        id: p.id,
        label: p.nomeProduto,
        sublabel: ultima
          ? `(${purchaseUnit}) — últ. compra ${fmtBRL(ultima.unitCost)}`
          : `(${purchaseUnit}) — sem compra registrada`,
        keywords: p.sku || '',
      };
    }),
    [produtos]
  );

  const canCreate = useCan('compras:pedidos:create');
  const canReceive = useCan('compras:recebimentos:close');
  const canEdit = useCan('compras:pedidos:edit');
  const canDelete = useCan('compras:pedidos:delete');
  const canExport = useCan('compras:pedidos:export');
  const isAdmin = useCan('system:global:manage');

  const [subTab, setSubTab] = useState<SubTab>('pedidos');
  const [showForm, setShowForm] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [filterType, setFilterType] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterPriority, setFilterPriority] = useState('');

  // Categorias buscadas do banco (stock_categories) — NÃO usar lista hardcoded.
  // RLS garante isolamento por empresa automaticamente.
  const [dbCategorias, setDbCategorias] = useState<string[]>([]);
  useEffect(() => {
    supabase
      .from('stock_categories')
      .select('name')
      .eq('is_active', true)
      .order('name', { ascending: true })
      .then(({ data }) => {
        if (data) setDbCategorias(data.map((c: { name: string }) => c.name));
      });
  }, [supabase]);
  const [supplierOpen, setSupplierOpen] = useState(false);

  const toggleCategory = useCallback((cat: string) => {
    setForm(f => {
      const current = parseCategories(f.category);
      const updated = current.includes(cat) ? current.filter(c => c !== cat) : [...current, cat];
      return { ...f, category: serializeCategories(updated) };
    });
  }, []);
  // Form state (shared for create & edit)
  const emptyForm = {
    title: '', type: 'MERCADO' as 'FORNECEDOR' | 'MERCADO' | 'SAZONAL',
    priority: 'MEDIA' as 'BAIXA' | 'MEDIA' | 'ALTA' | 'URGENTE',
    category: '', supplier_name: '', payment_type: '',
    need_by_date: '' as string, delivery_forecast_date: '' as string,
    responsible_user_id: '', notes: '',
  };
  const [form, setForm] = useState(emptyForm);
  const [formItems, setFormItems] = useState<FormItem[]>([]);
  // Semente da solicitação em andamento: troca só quando o formulário fecha. A
  // chave enviada é derivada dela + conteúdo (duplo clique/retry reaproveitam).
  const [sementePedido, setSementePedido] = useState(novaSemente);
  const submittingRef = useRef(false);
  const [submitting, setSubmitting] = useState(false);
  const [itemProdId, setItemProdId] = useState('');
  const [itemQtd, setItemQtd] = useState('');
  const [itemPreco, setItemPreco] = useState('');

  const selectedItemProd = useMemo(() => produtos.find(p => p.id === itemProdId) ?? null, [produtos, itemProdId]);
  const selectedUltimaCompra = selectedItemProd ? getUltimaCompra(selectedItemProd) : null;

  // Ao escolher o produto, o preço atual já vem com a última compra — o usuário só troca se mudou.
  const handleSelectItemProduct = (id: string) => {
    setItemProdId(id);
    const prod = produtos.find(p => p.id === id);
    const sugerido = prod ? getPrecoSugerido(prod) : 0;
    setItemPreco(sugerido > 0 ? formatNumberToBRL(sugerido) : '');
  };

  const updateFormItemPrice = (index: number, price: number) => {
    setFormItems(prev => prev.map((item, j) => j === index
      ? { ...item, estimated_unit_value: price, purchase_unit_cost_snapshot: price }
      : item));
  };

  // Edit state
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [editLockedItems, setEditLockedItems] = useState<PurchaseOrderItem[]>([]);

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<PurchaseOrder | null>(null);
  const [deleteItems, setDeleteItems] = useState<PurchaseOrderItem[]>([]);
  const [deleting, setDeleting] = useState(false);

  // Detail & receiving
  const [selectedOrder, setSelectedOrder] = useState<PurchaseOrder | null>(null);
  const [orderItems, setOrderItems] = useState<PurchaseOrderItem[]>([]);
  const [receivingQtds, setReceivingQtds] = useState<Record<string, { qty: string; status: 'RECEIVED' | 'NOT_DELIVERED'; reason: string }>>({});
  const [finalizingItemId, setFinalizingItemId] = useState<string | null>(null);
  const [finalizeQtd, setFinalizeQtd] = useState('');
  // Recebimento aguardando a resposta "dar entrada no estoque?"
  const [stockEntryPrompt, setStockEntryPrompt] = useState<StockEntryPrompt | null>(null);
  const [submittingReceipt, setSubmittingReceipt] = useState(false);

  // Export
  const [exportOrder, setExportOrder] = useState<PurchaseOrder | null>(null);
  const [exportItems, setExportItems] = useState<PurchaseOrderItem[]>([]);

  // Sininho e atalhos: o pedido pode estar fora da página carregada (ou a lista
  // ainda nem chegou, quando o clique veio de outro módulo) — busca pelo id.
  // A lista por trás fica na aba do status: ao voltar do detalhe, o pedido e o
  // "Confirmo ciência" (não entregues) estão à vista.
  useNavigationRecord('compras', ['purchase_order'], async ({ id }) => {
    const order = store.orders.find(o => o.id === id) ?? await store.fetchOrderById(id);
    if (!order) {
      toast.error('Pedido não encontrado. Ele pode ter sido excluído.');
      return;
    }
    const listTab = ORDER_STATUS_SUBTAB[order.status];
    if (listTab) setSubTab(listTab);
    await openDetail(order);
  });

  const filteredOrders = useMemo(() => {
    let list = store.orders;
    if (subTab === 'pedidos') list = list.filter(o => ['OPEN', 'PENDING'].includes(o.status));
    else if (subTab === 'recebimento') list = list.filter(o => ['IN_RECEIVING', 'SHOPPING_OK'].includes(o.status));
    else if (subTab === 'concluidos') list = list.filter(o => o.status === 'COMPLETED');
    else if (subTab === 'nao-entregues') list = list.filter(o => o.status === 'PARTIAL');
    if (filterType) list = list.filter(o => o.type === filterType);
    if ((subTab === 'concluidos' || subTab === 'nao-entregues') && filterCategory) list = list.filter(o => parseCategories(o.category).includes(filterCategory));
    if (filterPriority) list = list.filter(o => o.priority === filterPriority);
    if (searchText) list = list.filter(o => includesNormalized(o.title, searchText) || includesNormalized(o.supplier_name || '', searchText));
    return list;
  }, [store.orders, subTab, filterType, filterCategory, filterPriority, searchText]);

  const visibleCounts = useMemo(() => ({
    pedidos: store.orders.filter(o => ['OPEN', 'PENDING'].includes(o.status)).length,
    recebimento: store.orders.filter(o => ['IN_RECEIVING', 'SHOPPING_OK'].includes(o.status)).length,
    concluidos: store.orders.filter(o => o.status === 'COMPLETED').length,
    naoEntregues: store.orders.filter(o => o.status === 'PARTIAL').length,
  }), [store.orders]);

  const hasActiveFilters = Boolean(
    searchText ||
    filterType ||
    filterPriority ||
    ((subTab === 'concluidos' || subTab === 'nao-entregues') && filterCategory)
  );

  const hasOrdersInOtherTabs = filteredOrders.length === 0 && Object.entries(visibleCounts).some(([key, count]) => key !== subTab && count > 0);

  const quickTabTargets = [
    { id: 'pedidos' as const, label: 'Pedidos', count: visibleCounts.pedidos },
    { id: 'recebimento' as const, label: 'Recebimento', count: visibleCounts.recebimento },
    { id: 'concluidos' as const, label: 'Concluídos', count: visibleCounts.concluidos },
    { id: 'nao-entregues' as const, label: 'Não Entregues', count: visibleCounts.naoEntregues },
  ].filter(tab => tab.id !== subTab && tab.count > 0);

  useEffect(() => {
    if (subTab !== 'concluidos' && subTab !== 'nao-entregues' && filterCategory) {
      setFilterCategory('');
    }
  }, [subTab, filterCategory]);

  const clearVisibleFilters = () => {
    setSearchText('');
    setFilterType('');
    setFilterPriority('');
    setFilterCategory('');
  };

  const emptyState = useMemo(() => {
    if (store.errorMessage) {
      return {
        title: 'Não foi possível carregar os pedidos',
        description: store.errorMessage,
      };
    }

    if (hasActiveFilters) {
      return {
        title: 'Nenhum pedido encontrado com os filtros atuais',
        description: 'Limpe os filtros ou tente outro termo de busca.',
      };
    }

    if (hasOrdersInOtherTabs) {
      return {
        title: 'Existem pedidos em outras etapas',
        description: 'A solicitação pode ter avançado para Recebimento, Concluídos ou Não Entregues.',
      };
    }

    return {
      title: subTab === 'pedidos' ? 'Nenhum pedido aberto' :
        subTab === 'recebimento' ? 'Nenhum pedido para receber' :
        subTab === 'concluidos' ? 'Nenhum pedido concluído' :
        'Nenhum pedido com itens pendentes',
      description: canCreate && subTab === 'pedidos' ? 'Crie uma nova solicitação para começar.' : '',
    };
  }, [store.errorMessage, hasActiveFilters, hasOrdersInOtherTabs, subTab, canCreate]);

  const handleAddItem = () => {
    if (!itemProdId || !itemQtd) { toast.error('Selecione produto e quantidade'); return; }
    const prod = selectedItemProd;
    if (!prod) return;
    const qty = parseFloat(itemQtd);
    if (!Number.isFinite(qty) || qty <= 0) { toast.error('Informe uma quantidade válida'); return; }
    // Preço atual (unidade de compra) é o que vai para o pedido; a última compra fica só como referência.
    const precoAtual = normalizeBRLMoneyToNumber(itemPreco);
    if (precoAtual == null || precoAtual <= 0) { toast.error('Informe o preço atual do item'); return; }
    const purchaseUnit = prod.unidadeCompra || prod.unidadeMedida || 'UN';
    const conversionFactor = prod.fatorConversaoPadrao || 1;
    setFormItems(prev => [...prev, {
      stock_item_id: prod.id,
      name_snapshot: prod.nomeProduto,
      unit_snapshot: purchaseUnit,
      estimated_unit_value: precoAtual,
      qty_requested: qty,
      purchase_unit_snapshot: purchaseUnit,
      purchase_unit_cost_snapshot: precoAtual,
      conversion_factor_snapshot: conversionFactor,
      reference_unit_cost: getUltimaCompra(prod)?.unitCost ?? null,
    }]);
    setItemProdId(''); setItemQtd(''); setItemPreco('');
  };

  const handleSubmit = async () => {
    if (!form.title.trim()) { toast.error('Informe o título'); return; }
    if (formItems.length === 0 && editLockedItems.length === 0) { toast.error('Adicione itens'); return; }
    // O preço do item vira o custo da entrada no recebimento — preço zerado distorce o custo do estoque.
    const itemSemPreco = formItems.find(i => !(i.estimated_unit_value > 0));
    if (itemSemPreco) { toast.error(`Informe o preço atual de ${itemSemPreco.name_snapshot}`); return; }
    if (form.type === 'FORNECEDOR' && !form.supplier_name.trim()) { toast.error('Fornecedor obrigatório para pedidos de fornecedor'); return; }
    if ((form.type === 'MERCADO' || form.type === 'SAZONAL') && !form.responsible_user_id) {
      toast.error('Para Mercado/Sazonal é obrigatório definir um responsável.');
      return;
    }

    // Trava antes do primeiro await: o 2º clique do mesmo render ainda vê
    // `submitting` falso.
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    try {
      if (editingOrder) {
        // EDIT mode
        const isCompleted = editingOrder.status === 'COMPLETED';
        const result = await store.editOrder(
          editingOrder.id,
          {
            title: form.title,
            type: form.type,
            priority: form.priority,
            category: form.category,
            supplier_name: form.supplier_name,
            payment_type: form.payment_type,
            need_by_date: form.need_by_date,
            delivery_forecast_date: form.delivery_forecast_date,
            responsible_user_id: form.responsible_user_id,
            notes: form.notes,
          },
          isCompleted ? undefined : formItems.length > 0 ? formItems : undefined
        );
        if (result) {
          closeForm();
          if (selectedOrder?.id === editingOrder.id) setSelectedOrder(null);
        }
      } else {
        // CREATE mode
        const result = await store.createOrder({
          ...form,
          status: (form.type === 'MERCADO' || form.type === 'SAZONAL') ? 'PENDING' : 'OPEN',
          total_estimated: 0,
          responsible_user_id: form.responsible_user_id || null,
          supplier_name: form.supplier_name || null,
          payment_type: form.payment_type || null,
          need_by_date: form.need_by_date || null,
          delivery_forecast_date: form.delivery_forecast_date || null,
          origin: 'MANUAL',
          origin_ref: null,
        }, formItems, { semente: sementePedido });
        if (result) {
          toast.success(result.idempotent
            ? 'Esta solicitação já tinha sido criada — nada foi duplicado.'
            : 'Solicitação criada!');
          closeForm();
        }
      }
    } finally {
      submittingRef.current = false;
      setSubmitting(false);
    }
  };

  const closeForm = () => {
    setShowForm(false);
    setEditingOrder(null);
    setEditLockedItems([]);
    setForm(emptyForm);
    setFormItems([]);
    setItemProdId(''); setItemQtd(''); setItemPreco('');
    // A próxima solicitação é outra operação, mesmo que tenha o mesmo conteúdo.
    setSementePedido(novaSemente());
  };

  const startEdit = async (order: PurchaseOrder) => {
    if (!canEdit && !isAdmin) { toast.error('Sem permissão para editar'); return; }
    const items = await store.fetchItems(order.id);
    const lockedItems = items.filter(i => i.qty_received > 0);
    const editableItems = items.filter(i => i.received_status === 'PENDING');
    setEditingOrder(order);
    setEditLockedItems(lockedItems);
    setForm({
      title: order.title,
      type: order.type,
      priority: order.priority,
      category: order.category,
      supplier_name: order.supplier_name || '',
      payment_type: order.payment_type || '',
      need_by_date: order.need_by_date || '',
      delivery_forecast_date: order.delivery_forecast_date || '',
      responsible_user_id: order.responsible_user_id || '',
      notes: order.notes,
    });
    setFormItems(order.status === 'COMPLETED' ? [] : editableItems.map(i => {
      const prod = i.stock_item_id ? produtos.find(p => p.id === i.stock_item_id) : undefined;
      return {
        stock_item_id: i.stock_item_id || undefined,
        name_snapshot: i.name_snapshot,
        unit_snapshot: i.unit_snapshot,
        estimated_unit_value: i.estimated_unit_value,
        qty_requested: i.qty_requested,
        purchase_unit_snapshot: (i as any).purchase_unit_snapshot || i.unit_snapshot,
        // Snapshot acompanha o preço atual do item (relatórios leem o snapshot como custo da compra).
        purchase_unit_cost_snapshot: i.estimated_unit_value,
        conversion_factor_snapshot: (i as any).conversion_factor_snapshot ?? 1,
        reference_unit_cost: prod ? getUltimaCompra(prod)?.unitCost ?? null : null,
      };
    }));
    setShowForm(true);
  };

  const startDelete = async (order: PurchaseOrder) => {
    if (!canDelete && !isAdmin) { toast.error('Sem permissão para excluir'); return; }
    const items = await store.fetchItems(order.id);
    setDeleteTarget(order);
    setDeleteItems(items);
  };

  const confirmDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    const result = await store.deleteOrder(deleteTarget.id);
    setDeleting(false);
    if (result) {
      setDeleteTarget(null);
      if (selectedOrder?.id === deleteTarget.id) setSelectedOrder(null);
    }
  };

  const openDetail = async (order: PurchaseOrder) => {
    setSelectedOrder(order);
    const items = await store.fetchItems(order.id);
    setOrderItems(items);
    const qtds: Record<string, { qty: string; status: 'RECEIVED' | 'NOT_DELIVERED'; reason: string }> = {};
    items.forEach(i => {
      qtds[i.id] = {
        qty: i.received_status === 'PENDING' ? String(i.qty_requested) : String(i.qty_received),
        status: i.received_status === 'PENDING' ? 'RECEIVED' : i.received_status as any,
        reason: i.not_delivered_reason || '',
      };
    });
    setReceivingQtds(qtds);
  };

  const handleMarkAllReceived = () => {
    const updated: Record<string, { qty: string; status: 'RECEIVED' | 'NOT_DELIVERED'; reason: string }> = {};
    orderItems.forEach(i => {
      if (i.received_status === 'PENDING') {
        updated[i.id] = { qty: String(i.qty_requested), status: 'RECEIVED', reason: '' };
      } else {
        updated[i.id] = receivingQtds[i.id] || { qty: String(i.qty_received), status: i.received_status as any, reason: '' };
      }
    });
    setReceivingQtds(updated);
  };

  const handleConfirmReceiving = async () => {
    if (!selectedOrder) return;
    const pendingItems = orderItems.filter(i => i.received_status === 'PENDING');
    const decisions: ReceivingDecision[] = [];
    for (const item of pendingItems) {
      const r = receivingQtds[item.id];
      if (!r) { toast.error('Confira todos os itens'); return; }
      const qty = r.status === 'NOT_DELIVERED' ? 0 : parseFloat(r.qty);
      if (r.status === 'RECEIVED' && (!Number.isFinite(qty) || qty <= 0)) {
        toast.error(`Informe uma quantidade válida para ${item.name_snapshot}`);
        return;
      }
      decisions.push({
        order_item_id: item.id,
        status: r.status,
        qty_received: qty || 0,
        unit_cost: item.estimated_unit_value,
        reason: r.reason || undefined,
      });
    }
    const lines: StockEntryLine[] = pendingItems
      .filter(i => i.stock_item_id && receivingQtds[i.id]?.status === 'RECEIVED')
      .map(i => ({ id: i.id, name: i.name_snapshot, qty: parseFloat(receivingQtds[i.id].qty), unit: i.unit_snapshot }));
    const prompt: StockEntryPrompt = { kind: 'order', decisions, lines };
    // Sem item vinculado a produto não há entrada a gerar — não há o que perguntar.
    if (lines.length === 0) await submitReceipt(prompt, true);
    else setStockEntryPrompt(prompt);
  };

  const handleFinalizeItem = async (itemId: string) => {
    const qty = parseFloat(finalizeQtd) || 0;
    if (qty <= 0) { toast.error('Informe a quantidade recebida'); return; }
    const item = orderItems.find(i => i.id === itemId);
    const lines: StockEntryLine[] = item?.stock_item_id
      ? [{ id: item.id, name: item.name_snapshot, qty, unit: item.unit_snapshot }]
      : [];
    const prompt: StockEntryPrompt = { kind: 'item', itemId, qty, lines };
    if (lines.length === 0) await submitReceipt(prompt, true);
    else setStockEntryPrompt(prompt);
  };

  const submitReceipt = async (prompt: StockEntryPrompt, stockEntry: boolean) => {
    if (!selectedOrder) return;
    setSubmittingReceipt(true);
    try {
      if (prompt.kind === 'order') {
        const success = await store.confirmReceiving(selectedOrder.id, prompt.decisions, stockEntry);
        if (success) setSelectedOrder(null);
      } else {
        await store.finalizePartialItem(prompt.itemId, prompt.qty, stockEntry);
        setFinalizingItemId(null);
        setFinalizeQtd('');
        await openDetail(selectedOrder);
      }
    } finally {
      setSubmittingReceipt(false);
      setStockEntryPrompt(null);
    }
  };

  // Itens já recebidos (edição) entram pelo próprio preço nos dois totais — não há o que comparar.
  const comparativoTotais = compararTotais([
    ...formItems,
    ...editLockedItems.map(i => ({ qty_requested: i.qty_requested, estimated_unit_value: i.estimated_unit_value })),
  ]);
  const itensSemReferencia = formItems.filter(i => !((i.reference_unit_cost ?? 0) > 0)).length;

  const subTabs: { id: SubTab; label: string; icon: typeof ShoppingCart; count?: number }[] = [
    { id: 'pedidos', label: 'Pedidos', icon: ShoppingCart, count: store.openCount || undefined },
    { id: 'recebimento', label: 'Recebimento', icon: Package, count: store.receivingCount || undefined },
    { id: 'concluidos', label: 'Concluídos', icon: CheckCircle2 },
    { id: 'nao-entregues', label: 'Não Entregues', icon: AlertTriangle, count: store.unackedPartialCount || undefined },
  ];

  // Detail view: for receiving, only show items with shopping_status OK
  const receivableItems = useMemo(() => {
    if (!selectedOrder) return orderItems;
    const isMercadoSazonal = selectedOrder.type === 'MERCADO' || selectedOrder.type === 'SAZONAL';
    if (isMercadoSazonal && (selectedOrder.status === 'IN_RECEIVING' || selectedOrder.status === 'SHOPPING_OK')) {
      return orderItems.filter(i => (i as any).shopping_status === 'OK');
    }
    return orderItems;
  }, [selectedOrder, orderItems]);

  const unavailableItems = useMemo(() => {
    if (!selectedOrder) return [];
    return orderItems.filter(i => (i as any).shopping_status === 'NOT_AVAILABLE');
  }, [selectedOrder, orderItems]);

  // Item recebido sem entrada no estoque não tem movimentação a estornar.
  const deleteItemsWithStock = deleteItems.filter(i => i.qty_received > 0 && !i.stock_entry_skipped);
  const hasReceivedItems = deleteItemsWithStock.length > 0;

  // ===== DELETE CONFIRMATION DIALOG =====
  const deleteDialog = (
    <Dialog open={!!deleteTarget} onOpenChange={open => { if (!open) setDeleteTarget(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="text-destructive flex items-center gap-2">
            <Trash2 className="w-5 h-5" /> Excluir Solicitação
          </DialogTitle>
          <DialogDescription>
            {hasReceivedItems ? (
              <span className="text-destructive font-medium">
                ⚠️ Este pedido já gerou entradas no estoque. A exclusão irá estornar automaticamente todas as entradas de estoque vinculadas.
              </span>
            ) : (
              <span>Tem certeza que deseja excluir "{deleteTarget?.title}"? Esta ação não pode ser desfeita.</span>
            )}
          </DialogDescription>
        </DialogHeader>
        {hasReceivedItems && (
          <div className="bg-destructive-soft border border-destructive-border rounded-lg p-3 text-xs space-y-1">
            <p className="font-semibold text-destructive">Itens com recebimento que serão estornados:</p>
            {deleteItemsWithStock.map(i => (
              <p key={i.id} className="text-foreground">• {i.name_snapshot}: {i.qty_received} {i.unit_snapshot} recebidos</p>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="ghost" onClick={() => setDeleteTarget(null)} disabled={deleting}>Cancelar</Button>
          <Button variant="destructive" onClick={confirmDelete} disabled={deleting}>
            {deleting ? 'Excluindo...' : hasReceivedItems ? 'Excluir e Estornar Estoque' : 'Excluir'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ===== STOCK ENTRY CONFIRMATION DIALOG =====
  const stockEntryDialog = (
    <Dialog open={!!stockEntryPrompt} onOpenChange={open => { if (!open && !submittingReceipt) setStockEntryPrompt(null); }}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Package className="w-5 h-5" /> Dar entrada no estoque?
          </DialogTitle>
          <DialogDescription>
            Os itens abaixo entram automaticamente no estoque, com a quantidade e o custo deste recebimento.
          </DialogDescription>
        </DialogHeader>
        <div className="bg-background-subtle rounded-lg p-3 text-xs space-y-1 max-h-48 overflow-y-auto">
          {stockEntryPrompt?.lines.map(l => (
            <p key={l.id} className="text-foreground">• {l.name}: {l.qty} {l.unit}</p>
          ))}
        </div>
        <p className="text-xs text-muted-foreground">
          Se escolher <strong>Não</strong>, o recebimento é registrado normalmente, mas o saldo do estoque não muda.
        </p>
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="ghost" onClick={() => setStockEntryPrompt(null)} disabled={submittingReceipt}>Voltar</Button>
          <Button variant="outline" onClick={() => stockEntryPrompt && submitReceipt(stockEntryPrompt, false)} disabled={submittingReceipt}>
            Não, só receber
          </Button>
          <Button onClick={() => stockEntryPrompt && submitReceipt(stockEntryPrompt, true)} disabled={submittingReceipt}>
            {submittingReceipt ? 'Registrando...' : 'Sim, dar entrada'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  // ===== ACTION MENU for each order =====
  const renderActionMenu = (order: PurchaseOrder, e?: React.MouseEvent) => (
    <DropdownMenu>
      <DropdownMenuTrigger asChild onClick={ev => ev.stopPropagation()}>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0">
          <MoreVertical className="w-4 h-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" onClick={ev => ev.stopPropagation()}>
        <DropdownMenuItem onClick={() => openDetail(order)} className="gap-2 text-xs">
          <Eye className="w-3.5 h-3.5" /> Ver detalhes
        </DropdownMenuItem>
        <DropdownMenuItem onClick={async () => {
          if (order.type !== 'FORNECEDOR' || !order.supplier_name) {
            toast.error('Selecione um fornecedor antes de exportar.');
            return;
          }
          const items = await store.fetchItems(order.id);
          setExportItems(items);
          setExportOrder(order);
        }} className="gap-2 text-xs">
          <FileDown className="w-3.5 h-3.5" /> Exportar para fornecedor
        </DropdownMenuItem>
        {(canEdit || isAdmin) && (
          <>
            <DropdownMenuItem onClick={() => startEdit(order)} className="gap-2 text-xs">
              <Pencil className="w-3.5 h-3.5" /> Editar
            </DropdownMenuItem>
          </>
        )}
        {(canDelete || isAdmin) && (
          <DropdownMenuItem onClick={() => startDelete(order)} className="gap-2 text-xs text-destructive focus:text-destructive">
            <Trash2 className="w-3.5 h-3.5" /> Excluir
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  // ===== DETAIL VIEW =====
  if (selectedOrder) {
    const sc = STATUS_CONFIG[selectedOrder.status] || STATUS_CONFIG.OPEN;
    const Icon = sc.icon;
    const isPending = selectedOrder.status === 'OPEN' || selectedOrder.status === 'IN_RECEIVING' || selectedOrder.status === 'SHOPPING_OK';
    const isPartial = selectedOrder.status === 'PARTIAL';

    return (
      <div className="space-y-4">
        {deleteDialog}
        {stockEntryDialog}
        <button onClick={() => setSelectedOrder(null)} className="flex items-center gap-1 text-sm text-primary hover:underline">
          ← Voltar
        </button>

        <div className="bg-card border border-border rounded-xl p-5">
          <div className="flex items-start justify-between mb-4">
            <div>
              <h3 className="text-lg font-bold text-foreground">{selectedOrder.title}</h3>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <span className="inline-flex items-center gap-1">
                  <Icon className="w-3 h-3 text-muted-foreground" />
                  <StatusBadge status={sc.variant} label={sc.label} />
                </span>
                 <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[selectedOrder.priority]}`}>
                   {selectedOrder.priority}
                 </span>
                 <span className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{selectedOrder.type}</span>
                 {selectedOrder.origin === 'REQUISICAO' && (
                   <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-primary-soft text-primary-ink">📋 Origem: Requisição</span>
                 )}
                 {selectedOrder.category && parseCategories(selectedOrder.category).map(cat => (
                   <span key={cat} className="text-[10px] px-2 py-0.5 rounded-full bg-secondary text-muted-foreground">{cat}</span>
                 ))}
              </div>
            </div>
            <div className="flex items-center gap-2">
              {renderActionMenu(selectedOrder)}
              <div className="text-right text-xs text-muted-foreground">
                <p>Criado: {formatDateBR(new Date(selectedOrder.created_at))}</p>
                {selectedOrder.need_by_date && <p>Necessidade: {formatDateValueBR(selectedOrder.need_by_date)}</p>}
                {selectedOrder.supplier_name && <p>Forn: {selectedOrder.supplier_name}</p>}
              </div>
            </div>
          </div>

          {selectedOrder.notes && <p className="text-xs text-muted-foreground italic mb-4">{selectedOrder.notes}</p>}

          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="bg-background-subtle rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Total Estimado</p>
              <p className="text-lg font-bold text-foreground">{fmtBRL(selectedOrder.total_estimated)}</p>
            </div>
            <div className="bg-background-subtle rounded-lg p-3">
              <p className="text-[10px] text-muted-foreground">Total Confirmado</p>
              <p className="text-lg font-bold text-foreground">{fmtBRL(selectedOrder.total_confirmed)}</p>
            </div>
          </div>

          <div className="flex gap-2 mb-4 flex-wrap">
            {isPending && canReceive && (
              <>
                <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={handleMarkAllReceived}>
                  <Check className="w-3.5 h-3.5" /> Marcar todos entregues
                </Button>
                <Button size="sm" className="gap-1 bg-success text-success-foreground hover:bg-success/90 text-xs" onClick={handleConfirmReceiving} disabled={submittingReceipt}>
                  <CheckCircle2 className="w-3.5 h-3.5" /> Confirmar Recebimento
                </Button>
              </>
            )}
            {selectedOrder.type === 'FORNECEDOR' && selectedOrder.supplier_name && (
              <Button size="sm" variant="outline" className="gap-1 text-xs" onClick={() => {
                setExportItems(orderItems);
                setExportOrder(selectedOrder);
              }}>
                <FileDown className="w-3.5 h-3.5" /> Exportar para fornecedor
              </Button>
            )}
            {!['COMPLETED', 'CANCELLED'].includes(selectedOrder.status) && canCreate && (
              <Button size="sm" variant="destructive" className="gap-1 text-xs" onClick={() => { store.cancelOrder(selectedOrder.id); setSelectedOrder(null); }}>
                <XCircle className="w-3.5 h-3.5" /> Cancelar
              </Button>
            )}
          </div>
        </div>

        {/* Items */}
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-sm font-semibold text-foreground mb-3">
            Itens ({receivableItems.filter(i => i.received_status === 'RECEIVED').length}/{receivableItems.length} recebidos)
            {orderItems.length !== receivableItems.length && (
              <span className="text-[10px] text-muted-foreground ml-2">({orderItems.length - receivableItems.length} indisponíveis na compra)</span>
            )}
          </h4>
          <div className="space-y-2">
            {receivableItems.map(item => {
              const r = receivingQtds[item.id];
              return (
                <div key={item.id} className={`border rounded-lg p-3 transition-all ${
                  item.received_status === 'RECEIVED' ? 'bg-success-soft border-success-border' :
                  item.received_status === 'NOT_DELIVERED' ? 'bg-destructive-soft border-destructive-border' :
                  'border-border'
                }`}>
                  <div className="flex items-start justify-between">
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5">
                        {item.received_status === 'RECEIVED' ? <CheckCircle2 className="w-5 h-5 text-success" /> :
                         item.received_status === 'NOT_DELIVERED' ? <XCircle className="w-5 h-5 text-destructive" /> :
                         <div className="w-5 h-5 rounded border-2 border-border-strong" />}
                      </div>
                      <div>
                        <p className={`text-sm font-medium ${item.received_status === 'RECEIVED' ? 'line-through text-muted-foreground' : 'text-foreground'}`}>
                          {item.name_snapshot}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.qty_requested} {item.unit_snapshot} × {fmtBRL(item.estimated_unit_value)} = {fmtBRL(item.qty_requested * item.estimated_unit_value)}
                        </p>
                        {item.received_status === 'RECEIVED' && (
                          <p className="text-[10px] text-success mt-0.5">
                            ✓ Recebido: {item.qty_received} {item.unit_snapshot}
                            {item.stock_entry_skipped && <span className="text-muted-foreground"> · sem entrada no estoque</span>}
                          </p>
                        )}
                        {item.received_status === 'NOT_DELIVERED' && (
                          <p className="text-[10px] text-destructive mt-0.5">✗ Não entregue{item.not_delivered_reason ? `: ${item.not_delivered_reason}` : ''}</p>
                        )}
                      </div>
                    </div>
                  </div>

                  {isPending && item.received_status === 'PENDING' && canReceive && r && (
                    <div className="mt-3 bg-background-subtle rounded-lg p-3 space-y-2">
                      <div className="flex gap-2 items-end">
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Qtd recebida</Label>
                          <Input type="number" value={r.qty} onChange={e => setReceivingQtds(prev => ({ ...prev, [item.id]: { ...prev[item.id], qty: e.target.value } }))} className="text-xs" />
                        </div>
                        <div className="flex-1">
                          <Label className="text-[10px] text-muted-foreground">Status</Label>
                          <Select value={r.status} onValueChange={v => setReceivingQtds(prev => ({ ...prev, [item.id]: { ...prev[item.id], status: v as any } }))}>
                            <SelectTrigger className="text-xs"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="RECEIVED">✅ Entregue</SelectItem>
                              <SelectItem value="NOT_DELIVERED">❌ Não entregue</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      </div>
                      {r.status === 'NOT_DELIVERED' && (
                        <Input placeholder="Motivo (opcional)" value={r.reason} onChange={e => setReceivingQtds(prev => ({ ...prev, [item.id]: { ...prev[item.id], reason: e.target.value } }))} className="text-xs" />
                      )}
                    </div>
                  )}

                  {isPartial && item.received_status === 'NOT_DELIVERED' && canReceive && (
                    <div className="mt-3">
                      {finalizingItemId === item.id ? (
                        <div className="bg-background-subtle rounded-lg p-3 space-y-2">
                          <div className="flex gap-2 items-end">
                            <div className="flex-1">
                              <Label className="text-[10px] text-muted-foreground">Qtd recebida agora</Label>
                              <Input type="number" value={finalizeQtd} onChange={e => setFinalizeQtd(e.target.value)} className="text-xs" placeholder={String(item.qty_requested)} />
                            </div>
                            <Button size="sm" className="text-xs gap-1" onClick={() => handleFinalizeItem(item.id)} disabled={submittingReceipt}>
                              <Check className="w-3 h-3" /> Receber
                            </Button>
                            <Button size="sm" variant="ghost" className="text-xs" onClick={() => setFinalizingItemId(null)}>Cancelar</Button>
                          </div>
                        </div>
                      ) : (
                        <Button size="sm" variant="outline" className="text-xs gap-1" onClick={() => { setFinalizingItemId(item.id); setFinalizeQtd(String(item.qty_requested)); }}>
                          <Truck className="w-3 h-3" /> Finalizar entrega
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Itens indisponíveis no checklist */}
          {unavailableItems.length > 0 && (
            <div className="mt-4 pt-4 border-t border-border">
              <h4 className="text-sm font-semibold text-destructive mb-3 flex items-center gap-2">
                <XCircle className="w-4 h-4" />
                Indisponíveis na compra ({unavailableItems.length})
              </h4>
              <div className="space-y-2">
                {unavailableItems.map(item => (
                  <div key={item.id} className="border border-destructive-border bg-destructive-soft rounded-lg p-3">
                    <div className="flex items-start gap-3">
                      <XCircle className="w-5 h-5 text-destructive mt-0.5 shrink-0" />
                      <div>
                        <p className="text-sm font-medium text-foreground">{item.name_snapshot}</p>
                        <p className="text-[10px] text-muted-foreground">
                          {item.qty_requested} {item.unit_snapshot} × {fmtBRL(item.estimated_unit_value)} = {fmtBRL(item.qty_requested * item.estimated_unit_value)}
                        </p>
                        <p className="text-[10px] text-destructive mt-0.5">
                          ✗ Indisponível{item.shopping_note ? `: ${item.shopping_note}` : ''}
                        </p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  // ===== MAIN LIST VIEW =====
  return (
    <div className="space-y-4">
      {deleteDialog}

      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-base font-semibold text-foreground">Pedidos & Compras Mercado</h3>
          <p className="text-[10px] text-muted-foreground">Fornecedores, Mercado e Sazonais — fluxo unificado</p>
        </div>
        {canCreate && (
          <Button size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1.5 text-xs" onClick={() => { closeForm(); setShowForm(true); }}>
            <Plus className="w-3.5 h-3.5" /> Nova Solicitação
          </Button>
        )}
      </div>

      {/* Sub-tabs */}
      <SubmoduleSwitcher
        items={subTabs.map(t => ({ ...t, badge: t.count }))}
        value={subTab}
        onChange={(id) => setSubTab(id as SubTab)}
      />

      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <div className="relative flex-1 min-w-[150px]">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <Input value={searchText} onChange={e => setSearchText(e.target.value)} placeholder="Buscar..." className="pl-8 text-xs h-8" />
        </div>
        <Select value={filterType} onValueChange={v => setFilterType(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-32 text-xs h-8"><SelectValue placeholder="Tipo" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            <SelectItem value="FORNECEDOR">Fornecedor</SelectItem>
            <SelectItem value="MERCADO">Mercado</SelectItem>
            <SelectItem value="SAZONAL">Sazonal</SelectItem>
          </SelectContent>
        </Select>
        <Select value={filterPriority} onValueChange={v => setFilterPriority(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-28 text-xs h-8"><SelectValue placeholder="Prioridade" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            <SelectItem value="URGENTE">Urgente</SelectItem>
            <SelectItem value="ALTA">Alta</SelectItem>
            <SelectItem value="MEDIA">Média</SelectItem>
            <SelectItem value="BAIXA">Baixa</SelectItem>
          </SelectContent>
        </Select>
        {(subTab === 'concluidos' || subTab === 'nao-entregues') && (
          <Select value={filterCategory} onValueChange={v => setFilterCategory(v === 'all' ? '' : v)}>
            <SelectTrigger className="w-28 text-xs h-8"><SelectValue placeholder="Categoria" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              {dbCategorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        )}
      </div>

      {/* Create/Edit Form */}
      {showForm && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
          <h4 className="text-sm font-semibold text-foreground">
            {editingOrder ? `Editar: ${editingOrder.title}` : 'Nova Solicitação'}
          </h4>

          {editingOrder?.status === 'COMPLETED' && (
            <div className="bg-warning-soft border border-warning-border rounded-lg p-2 text-xs text-warning">
              ⚠️ Pedido concluído — apenas campos do cabeçalho podem ser editados. Itens/quantidades estão travados.
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <Label className="text-[10px] text-muted-foreground">Título *</Label>
              <Input value={form.title} onChange={e => setForm(f => ({ ...f, title: e.target.value }))} className="text-xs mt-1" placeholder="Ex: Compra semanal feira" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Tipo *</Label>
              <Select value={form.type} onValueChange={v => setForm(f => ({ ...f, type: v as any }))}>
                <SelectTrigger className="text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="FORNECEDOR">Fornecedor</SelectItem>
                  <SelectItem value="MERCADO">Mercado</SelectItem>
                  <SelectItem value="SAZONAL">Sazonal</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Prioridade</Label>
              <Select value={form.priority} onValueChange={v => setForm(f => ({ ...f, priority: v as any }))}>
                <SelectTrigger className="text-xs mt-1"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BAIXA">Baixa</SelectItem>
                  <SelectItem value="MEDIA">Média</SelectItem>
                  <SelectItem value="ALTA">Alta</SelectItem>
                  <SelectItem value="URGENTE">Urgente</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Categorias</Label>
              <Popover modal>
                <PopoverTrigger asChild>
                  <Button variant="outline" className="w-full justify-between text-xs mt-1 font-normal h-auto min-h-[36px] py-1.5">
                    {parseCategories(form.category).length > 0 ? (
                      <div className="flex flex-wrap gap-1">
                        {parseCategories(form.category).map(cat => (
                          <span key={cat} className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded-full bg-primary-soft text-primary-ink font-medium">
                            {cat}
                            <button type="button" onClick={(e) => { e.stopPropagation(); toggleCategory(cat); }} className="hover:text-destructive">
                              <X className="w-2.5 h-2.5" />
                            </button>
                          </span>
                        ))}
                      </div>
                    ) : (
                      <span className="text-muted-foreground">Selecione categorias…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command>
                    <CommandInput placeholder="Buscar categoria..." className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">Nenhuma categoria encontrada.</CommandEmpty>
                      {dbCategorias.map(cat => {
                        const selected = parseCategories(form.category).includes(cat);
                        return (
                          <CommandItem key={cat} value={cat} onSelect={() => toggleCategory(cat)} className="text-xs gap-1.5">
                            <Check className={`w-3 h-3 ${selected ? 'opacity-100' : 'opacity-0'}`} />
                            {cat}
                          </CommandItem>
                        );
                      })}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Fornecedor {form.type === 'FORNECEDOR' ? '*' : '(opcional)'}</Label>
              <Popover open={supplierOpen} onOpenChange={setSupplierOpen} modal>
                <PopoverTrigger asChild>
                  <Button variant="outline" role="combobox" aria-expanded={supplierOpen}
                    className="w-full justify-between text-xs mt-1 font-normal h-9">
                    {form.supplier_name ? (
                      <span className="flex items-center gap-1.5 truncate">
                        <Building2 className="w-3 h-3 text-muted-foreground shrink-0" />
                        {form.supplier_name}
                      </span>
                    ) : (
                      <span className="text-muted-foreground">Selecione um fornecedor…</span>
                    )}
                    <ChevronsUpDown className="ml-2 h-3.5 w-3.5 shrink-0 opacity-50" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[--radix-popover-trigger-width] p-0" align="start">
                  <Command filter={(value, search) => { if (!search) return 1; return normalizeSearchText(value).includes(normalizeSearchText(search)) ? 1 : 0; }}>
                    <CommandInput placeholder="Buscar fornecedor..." className="text-xs" />
                    <CommandList>
                      <CommandEmpty className="text-xs py-4 text-center text-muted-foreground">Nenhum fornecedor encontrado.</CommandEmpty>
                      {form.supplier_name && (
                        <CommandItem
                          value="__clear__"
                          onSelect={() => { setForm(f => ({ ...f, supplier_name: '' })); setSupplierOpen(false); }}
                          className="text-xs text-destructive gap-1.5"
                        >
                          <X className="w-3 h-3" /> Limpar seleção
                        </CommandItem>
                      )}
                      {activeSuppliers.map(s => (
                        <CommandItem
                          key={s.id}
                          value={s.name + ' ' + (s.cnpj || '')}
                          onSelect={() => { setForm(f => ({ ...f, supplier_name: s.name })); setSupplierOpen(false); }}
                          className="text-xs gap-1.5"
                        >
                          <Check className={`w-3 h-3 ${form.supplier_name === s.name ? 'opacity-100' : 'opacity-0'}`} />
                          <div className="flex flex-col">
                            <span>{s.name}</span>
                            {s.cnpj && <span className="text-[9px] text-muted-foreground">{s.cnpj}</span>}
                          </div>
                        </CommandItem>
                      ))}
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Tipo de pagamento</Label>
              <Input value={form.payment_type} onChange={e => setForm(f => ({ ...f, payment_type: e.target.value }))} className="text-xs mt-1" placeholder="Pix, Boleto..." />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Data necessidade</Label>
              <DateInput value={form.need_by_date} onValueChange={v => setForm(f => ({ ...f, need_by_date: v }))} className="text-xs mt-1" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Previsão de entrega</Label>
              <DateInput value={form.delivery_forecast_date} onValueChange={v => setForm(f => ({ ...f, delivery_forecast_date: v }))} className="text-xs mt-1" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">
                Responsável (@mencionar) {(form.type === 'MERCADO' || form.type === 'SAZONAL') ? '*' : '(opcional)'}
              </Label>
              <div className="mt-1">
                <UserMentionSelect
                  value={form.responsible_user_id}
                  onChange={(userId) => setForm(f => ({ ...f, responsible_user_id: userId }))}
                  placeholder="Buscar e mencionar responsável..."
                />
              </div>
              {(form.type === 'MERCADO' || form.type === 'SAZONAL') && !form.responsible_user_id && (
                <p className="text-[9px] text-destructive mt-0.5">Obrigatório para Mercado/Sazonal</p>
              )}
            </div>
            <div className="col-span-2">
              <Label className="text-[10px] text-muted-foreground">Observações</Label>
              <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} className="text-xs mt-1" />
            </div>
          </div>

          {/* Locked items (already received) */}
          {editLockedItems.length > 0 && (
            <div>
              <Label className="text-[10px] text-muted-foreground mb-1">Itens já recebidos (somente leitura)</Label>
              <div className="space-y-1">
                {editLockedItems.map(item => (
                  <div key={item.id} className="flex items-center justify-between bg-success-soft border border-success-border rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-muted-foreground">🔒 {item.name_snapshot}</span>
                    <span className="text-muted-foreground">{item.qty_received} {item.unit_snapshot} recebidos — {fmtBRL(item.qty_received * item.estimated_unit_value)}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Editable Items (not for COMPLETED) */}
          {editingOrder?.status !== 'COMPLETED' && (
            <div>
              <Label className="text-[10px] text-muted-foreground mb-2">{editingOrder ? 'Itens editáveis (pendentes)' : 'Itens do Pedido'}</Label>
              <div className="flex flex-wrap items-end gap-2 mt-1">
                <div className="flex-1 min-w-[200px]">
                  <ProductSearchCombobox
                    options={productOptions}
                    value={itemProdId}
                    onSelect={handleSelectItemProduct}
                    placeholder="Buscar produto do estoque…"
                    searchPlaceholder="Buscar por nome ou SKU…"
                    allowClear={false}
                  />
                </div>
                <div className="w-20">
                  <Label htmlFor="pedido-item-qtd" className="text-[10px] text-muted-foreground">Qtd</Label>
                  <Input id="pedido-item-qtd" type="number" value={itemQtd} onChange={e => setItemQtd(e.target.value)} placeholder="Qtd" className="h-9 text-xs" />
                </div>
                <div className="w-32">
                  <Label htmlFor="pedido-item-preco" className="text-[10px] text-muted-foreground">Preço atual</Label>
                  <CurrencyInput id="pedido-item-preco" value={itemPreco} onValueChange={raw => setItemPreco(raw)} showPrefix className="h-9 text-xs" />
                </div>
                <Button size="sm" variant="outline" className="h-9" onClick={handleAddItem} aria-label="Adicionar item"><Plus className="w-3.5 h-3.5" /></Button>
              </div>
              {selectedItemProd && (
                <p className="text-[10px] text-muted-foreground mt-1.5">
                  {selectedUltimaCompra ? (
                    <>
                      Última compra: <span className="font-semibold text-foreground">{fmtBRL(selectedUltimaCompra.unitCost)}</span>
                      {' '}/ {selectedItemProd.unidadeCompra || selectedItemProd.unidadeMedida || 'UN'}
                      {selectedUltimaCompra.date && ` em ${formatDateValueBR(selectedUltimaCompra.date)}`}
                      {selectedUltimaCompra.supplier && ` · ${selectedUltimaCompra.supplier}`}
                    </>
                  ) : (
                    'Sem compra registrada no estoque — informe o preço atual.'
                  )}
                </p>
              )}
            </div>
          )}

          {formItems.length > 0 && (
            <div className="space-y-1">
              {formItems.map((item, i) => {
                const ref = item.reference_unit_cost ?? 0;
                const diffUnit = item.estimated_unit_value - ref;
                return (
                  <div key={i} className="bg-background-subtle rounded-lg px-3 py-1.5 text-xs">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-foreground">{item.name_snapshot}</span>
                      <div className="flex items-center gap-2">
                        <span className="text-muted-foreground whitespace-nowrap">{item.qty_requested} {item.unit_snapshot} ×</span>
                        <div className="w-28">
                          <BRLInput
                            numericValue={item.estimated_unit_value}
                            onNumericChange={v => updateFormItemPrice(i, v)}
                            showPrefix
                            aria-label={`Preço atual de ${item.name_snapshot}`}
                            className="h-7 text-xs"
                          />
                        </div>
                        <span className="font-bold text-foreground whitespace-nowrap">{fmtBRL(item.qty_requested * item.estimated_unit_value)}</span>
                        <button onClick={() => setFormItems(prev => prev.filter((_, j) => j !== i))} className="text-destructive" aria-label={`Remover ${item.name_snapshot}`}><X className="w-3 h-3" /></button>
                      </div>
                    </div>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {ref > 0 ? (
                        <>
                          Última compra: {fmtBRL(ref)}
                          {Math.abs(diffUnit) >= 0.005 && (
                            <span className={`ml-1.5 font-medium ${diffUnit > 0 ? 'text-destructive' : 'text-success'}`}>
                              {formatDiferenca(diffUnit, (diffUnit / ref) * 100)}
                            </span>
                          )}
                        </>
                      ) : 'Sem compra anterior registrada'}
                    </p>
                  </div>
                );
              })}
              <div className="text-right pt-1 space-y-0.5">
                <p className="text-xs font-bold text-foreground">
                  Total estimado (preço atual): {fmtBRL(comparativoTotais.totalAtual)}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  No preço da última compra: {fmtBRL(comparativoTotais.totalReferencia)}
                  {comparativoTotais.diferenca !== 0 && (
                    <span className={`ml-1.5 font-medium ${comparativoTotais.diferenca > 0 ? 'text-destructive' : 'text-success'}`}>
                      {formatDiferenca(comparativoTotais.diferenca, comparativoTotais.diferencaPercentual)}
                    </span>
                  )}
                </p>
                {itensSemReferencia > 0 && (
                  <p className="text-[10px] text-muted-foreground">
                    {itensSemReferencia === 1 ? '1 item sem compra anterior entra' : `${itensSemReferencia} itens sem compra anterior entram`} pelo preço atual.
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={closeForm} disabled={submitting}>Cancelar</Button>
            <Button size="sm" className="bg-primary-strong text-primary-foreground border-0" onClick={handleSubmit} disabled={submitting}>
              {submitting ? 'Salvando…' : editingOrder ? 'Salvar Alterações' : 'Criar Solicitação'}
            </Button>
          </div>
        </div>
      )}

      {/* Orders List */}
      {store.errorMessage && (
        <div className="bg-warning-soft border border-warning-border rounded-xl p-3 text-xs text-warning">
          {store.errorMessage}
        </div>
      )}

      {store.loading ? (
        <div className="space-y-2">
          {[1, 2, 3].map(i => (
            <div key={i} className="bg-card border border-border rounded-xl p-4 animate-pulse">
              <div className="h-4 bg-secondary rounded w-1/3 mb-2" />
              <div className="h-3 bg-secondary rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : filteredOrders.length > 0 ? (
        <div className="space-y-2">
          {filteredOrders.map((order, i) => {
            const sc = STATUS_CONFIG[order.status] || STATUS_CONFIG.OPEN;
            const isNaoEntregues = subTab === 'nao-entregues';
            const acked = !!order.not_delivered_ack_at;
            // Baixar pedido de outro criador é atribuição de quem edita pedidos,
            // não privilégio de super-admin.
            const canAck = !acked && (order.created_by === user?.id || canEdit || isAdmin);
            return (
              <div key={order.id}
                className={`w-full bg-card border rounded-xl p-3 hover:border-primary/30 transition-all animate-fade-up ${
                  isNaoEntregues && !acked ? 'border-warning-border' : 'border-border'
                }`}
                style={{ animationDelay: `${i * 30}ms` }}>
                <div className="flex items-center justify-between">
                  <button onClick={() => openDetail(order)} className="flex-1 text-left min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-foreground truncate">{order.title}</p>
                    </div>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <StatusBadge status={sc.variant} label={sc.label} size="xs" />
                      <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-semibold ${PRIORITY_COLORS[order.priority]}`}>{order.priority}</span>
                      <span className="text-[9px] text-muted-foreground">{order.type}</span>
                      {order.origin === 'REQUISICAO' && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full font-semibold bg-primary-soft text-primary-ink">📋 Requisição</span>
                      )}
                      {order.supplier_name && <span className="text-[9px] text-muted-foreground">• {order.supplier_name}</span>}
                      <span className="text-[9px] text-muted-foreground">
                        {fmtBRL(order.total_confirmed || order.total_estimated)}
                      </span>
                    </div>
                  </button>
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {renderActionMenu(order)}
                  </div>
                </div>
                {isNaoEntregues && (
                  <div className={`mt-2 rounded-lg p-2 text-xs ${acked ? 'bg-success-soft border border-success-border' : 'bg-warning-soft border border-warning-border'}`}>
                    {acked ? (
                      <div className="flex items-center gap-1.5 text-success">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Ciência confirmada em {formatDateTimeBR(new Date(order.not_delivered_ack_at!))}</span>
                      </div>
                    ) : (
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 text-warning">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>Aguardando confirmação de ciência do criador</span>
                        </div>
                        {canAck && (
                          <Button size="sm" variant="outline" className="text-[10px] h-7 gap-1 border-warning-border text-warning hover:bg-warning/10"
                            onClick={(e) => { e.stopPropagation(); store.acknowledgeNotDelivered(order.id); }}>
                            <Check className="w-3 h-3" /> Confirmo ciência
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl p-8 text-center space-y-4">
          <Inbox className="w-12 h-12 mx-auto text-muted-foreground" />
          <div>
            <p className="text-sm font-medium text-foreground mb-1">{emptyState.title}</p>
            <p className="text-xs text-muted-foreground">{emptyState.description}</p>
          </div>

          {(hasActiveFilters || quickTabTargets.length > 0) && (
            <div className="flex flex-wrap items-center justify-center gap-2">
              {quickTabTargets.map(tab => (
                <Button key={tab.id} size="sm" variant="outline" className="gap-1.5 text-xs" onClick={() => setSubTab(tab.id)}>
                  Ver {tab.label}
                  <span className="inline-flex min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 py-0.5 text-[10px] text-foreground">
                    {tab.count}
                  </span>
                  <ChevronRight className="w-3 h-3" />
                </Button>
              ))}
              {hasActiveFilters && (
                <Button size="sm" variant="ghost" className="text-xs" onClick={clearVisibleFilters}>
                  Limpar filtros
                </Button>
              )}
            </div>
          )}

          {store.orders.length > 0 && (
            <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
              <span>Pedidos: {visibleCounts.pedidos}</span>
              <span>Recebimento: {visibleCounts.recebimento}</span>
              <span>Concluídos: {visibleCounts.concluidos}</span>
              <span>Não entregues: {visibleCounts.naoEntregues}</span>
            </div>
          )}
        </div>
      )}
      {exportOrder && (
        <ExportPedidoModal
          open={!!exportOrder}
          onOpenChange={open => { if (!open) { setExportOrder(null); setExportItems([]); } }}
          order={exportOrder}
          items={exportItems}
        />
      )}
    </div>
  );
}

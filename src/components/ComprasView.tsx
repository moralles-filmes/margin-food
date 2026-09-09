import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useMemo, useEffect } from 'react';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { ShoppingCart, Calendar, BarChart3, ClipboardList, ShoppingBag, Building2, ShieldAlert, PackageX, FileText } from 'lucide-react';
import { SubmoduleSwitcher } from '@/components/ui/SubmoduleSwitcher';
import { useAuth } from '@/contexts/AuthContext';
import { useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import PedidosComprasMercadoView from '@/components/PedidosComprasMercadoView';
import AlertasFaltaEstoqueView from '@/components/compras/AlertasFaltaEstoqueView';
import SuppliersView from '@/components/SuppliersView';
import { usePurchaseOrdersStoreContext } from '@/contexts/PurchaseOrdersStoreContext';
import ShoppingChecklistView from '@/components/compras/ShoppingChecklistView';
import CalendarioLembretesView from '@/components/compras/CalendarioLembretesView';
import RankingFornecedoresView from '@/components/compras/RankingFornecedoresView';
import CotacaoView from '@/components/compras/cotacao/CotacaoView';
import { useCotacoesStore } from '@/hooks/useCotacoesStore';
import { useModuleAccess, useCan } from '@/permissions/hooks';

// Map internal subtab keys to registry keys
const SUBTAB_REGISTRY_MAP: Record<string, string> = {
  'pedidos-compras': 'pedidos',
  'requisicoes': 'checklist',
  'calendario': 'calendario',
  'ranking': 'ranking',
  'fornecedores': 'fornecedores',
  'alertas-falta': 'alertas_falta',
  'cotacao': 'cotacao',
};

type SubView = 'requisicoes' | 'pedidos-compras' | 'calendario' | 'ranking' | 'fornecedores' | 'alertas-falta' | 'cotacao';

const DIAS = ['Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado', 'Domingo'];
const CATEGORIAS = ['Peixe', 'Oriental', 'Bebidas', 'Limpeza', 'Embalagens', 'Cozinha', 'Descartáveis', 'Proteínas', 'Hortifruti', 'Outros'];

export default function ComprasView() {
  const supabase = useSupabase();
  const { user } = useAuth();
  const { visibleSubtabs, canView } = useModuleAccess('compras');
  
  // Action-level permissions
  const canCreatePedido = useCan('compras:pedidos:create');
  const canEditPedido = useCan('compras:pedidos:edit');
  const canDeletePedido = useCan('compras:pedidos:delete');
  const canApproveChecklist = useCan('compras:checklist:approve');
  const canEditCalendario = useCan('compras:calendario:edit');
  const canCreateFornecedor = useCan('compras:fornecedores:create');
  const canEditFornecedor = useCan('compras:fornecedores:edit');
  const canDeleteFornecedor = useCan('compras:fornecedores:delete');

  const [activeView, setActiveView] = usePersistedTab<SubView>('app:tab:compras', 'pedidos-compras');
  const salmonStore = useSalmonStoreContext();
  const purchaseOrdersStore = usePurchaseOrdersStoreContext();
  const cotacoesStore = useCotacoesStore();
  const shoppingCount = purchaseOrdersStore.shoppingCount;

  // Calendário form
  const [showCalForm, setShowCalForm] = useState(false);
  const [calForm, setCalForm] = useState({ diaSemana: 'Segunda', categorias: [] as string[], regra: '' });
  const [editCalId, setEditCalId] = useState<string | null>(null);

  // Requisição form
  const [showReqForm, setShowReqForm] = useState(false);
  const [reqItens, setReqItens] = useState<{ produtoId: string; quantidade: number; motivo: string; prioridade: 'alta' | 'media' | 'baixa' }[]>([]);
  const [reqItemProd, setReqItemProd] = useState('');
  const [reqItemQtd, setReqItemQtd] = useState('');
  const [reqObs, setReqObs] = useState('');

  // Map visible subtabs from registry to internal SubView IDs
  const availableViews = useMemo(() => {
    const reverseMap: Record<string, SubView> = {
      'pedidos': 'pedidos-compras',
      'checklist': 'requisicoes',
      'calendario': 'calendario',
      'ranking': 'ranking',
      'fornecedores': 'fornecedores',
      'alertas_falta': 'alertas-falta',
      'cotacao': 'cotacao',
    };
    return visibleSubtabs
      .map(k => reverseMap[k])
      .filter(Boolean) as SubView[];
  }, [visibleSubtabs]);

  const toggleCatForm = (cat: string) => {
    setCalForm(f => ({
      ...f,
      categorias: f.categorias.includes(cat) ? f.categorias.filter(c => c !== cat) : [...f.categorias, cat],
    }));
  };

  // Alertas falta count
  const [alertasFaltaCount, setAlertasFaltaCount] = useState(0);
  useEffect(() => {
    supabase
      .from('alertas_falta_estoque')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'PENDENTE')
      .then(({ count }) => setAlertasFaltaCount(count ?? 0));
  }, [activeView, supabase]);

  // Deep-link from notification
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail;
      if (detail?.linkPath) {
        const url = new URL(detail.linkPath, 'https://placeholder');
        const subtab = url.searchParams.get('subtab');
        if (subtab && availableViews.includes(subtab as SubView)) {
          setActiveView(subtab as SubView);
        }
      }
    };
    window.addEventListener('notification-navigate', handler);
    return () => window.removeEventListener('notification-navigate', handler);
  }, [availableViews]);

  const allSubViews: { id: SubView; label: string; icon: typeof ShoppingCart; badge?: number }[] = [
    { id: 'pedidos-compras', label: 'Pedidos & Compras Mercado', icon: ShoppingBag, badge: (purchaseOrdersStore.openCount + purchaseOrdersStore.receivingCount + purchaseOrdersStore.unackedPartialCount) || undefined },
    { id: 'requisicoes', label: 'Checklist Compra', icon: ClipboardList, badge: shoppingCount || undefined },
    { id: 'alertas-falta', label: 'Itens em Falta', icon: PackageX, badge: alertasFaltaCount || undefined },
    { id: 'cotacao', label: 'Cotação', icon: FileText, badge: cotacoesStore.openCount || undefined },
    { id: 'calendario', label: 'Calendário', icon: Calendar },
    { id: 'ranking', label: 'Ranking', icon: BarChart3 },
    { id: 'fornecedores', label: 'Fornecedores', icon: Building2 },
  ];

  const subViews = allSubViews.filter(v => availableViews.includes(v.id));

  // Ensure activeView is valid for current permissions
  useEffect(() => {
    if (subViews.length > 0 && !subViews.some(v => v.id === activeView)) {
      setActiveView(subViews[0].id);
    }
  }, [subViews, activeView]);

  // No access at all
  if (!canView) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <ShieldAlert className="w-12 h-12 text-muted-foreground mb-3" />
        <h3 className="text-lg font-semibold text-foreground">Acesso Negado</h3>
        <p className="text-sm text-muted-foreground mt-1">Sem permissão (compras:*:view)</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Compras</h2>
        <p className="text-xs text-muted-foreground">Requisições, pedidos e inteligência de reposição</p>
      </div>

      <SubmoduleSwitcher
        items={subViews}
        value={activeView}
        onChange={setActiveView}
      />

      {/* ====== CHECKLIST DE COMPRA ====== */}
      {activeView === 'requisicoes' && (
        <ShoppingChecklistView onNavigateToOrder={(orderId) => {
          setActiveView('pedidos-compras');
        }} />
      )}

      {/* ====== PEDIDOS & COMPRAS MERCADO ====== */}
      {activeView === 'pedidos-compras' && <PedidosComprasMercadoView />}

      {/* ====== ITENS EM FALTA ====== */}
      {activeView === 'alertas-falta' && <AlertasFaltaEstoqueView />}

      {/* ====== CALENDÁRIO (LEMBRETES) ====== */}
      {activeView === 'calendario' && <CalendarioLembretesView />}

      {/* ====== RANKING FORNECEDORES ====== */}
      {activeView === 'ranking' && <RankingFornecedoresView />}

      {/* ====== FORNECEDORES ====== */}
      {activeView === 'fornecedores' && <SuppliersView store={salmonStore} />}

      {/* ====== COTAÇÃO (RFQ) ====== */}
      {activeView === 'cotacao' && <CotacaoView store={cotacoesStore} />}
    </div>
  );
}

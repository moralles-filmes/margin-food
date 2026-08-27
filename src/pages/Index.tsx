import { useState, useEffect, useMemo, useCallback, useRef, lazy, Suspense } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { TabId } from '@/types/salmon';
import { SalmonStoreProvider, useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import { EstoqueGeralStoreProvider, useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { PurchaseOrdersStoreProvider } from '@/contexts/PurchaseOrdersStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import AppLayout from '@/components/AppLayout';

const SalmonControlView = lazy(() => import('@/components/SalmonControlView'));
const EstoqueGeralView = lazy(() => import('@/components/EstoqueGeralView'));
const ComprasView = lazy(() => import('@/components/ComprasView'));
const PlanningView = lazy(() => import('@/components/PlanningView'));
const SuppliersView = lazy(() => import('@/components/SuppliersView'));
const RelatoriosView = lazy(() => import('@/components/RelatoriosView'));
const CmvView = lazy(() => import('@/components/CmvView'));
const FichaTecnicaView = lazy(() => import('@/components/FichaTecnicaView'));
const ConfiguracoesView = lazy(() => import('@/components/ConfiguracoesView'));
const InventarioView = lazy(() => import('@/components/InventarioView'));
const CentralIAView = lazy(() => import('@/components/CentralIAView'));
const RhView = lazy(() => import('@/components/RhView'));
const FinanceiroView = lazy(() => import('@/components/FinanceiroView'));
import { Button } from '@/components/ui/button';
import { RefreshCw, LogOut, AlertTriangle, ShieldAlert } from 'lucide-react';
import { toast } from 'sonner';
import { useMentionToast } from '@/hooks/useMentionToast';
import { useModuleAccess } from '@/permissions/hooks';

// Map each TabId to its module key in the registry
const TAB_MODULE_MAP: Record<TabId, string> = {
  salmon: 'salmon',
  'estoque-geral': 'estoque',
  inventario: 'inventario',
  compras: 'compras',
  cmv: 'cmv',
  'ficha-tecnica': 'ficha',
  planning: 'planning',
  suppliers: 'compras', // suppliers is under compras module (fornecedores subtab)
  relatorios: 'relatorios',
  ia: 'ia',
  rh: 'rh',
  financeiro: 'financeiro',
  configuracoes: 'configuracoes',
  'configuracoes-usuarios': 'configuracoes',
};

// Priority order for default tab selection
const TAB_PRIORITY: TabId[] = [
  'salmon', 'estoque-geral', 'relatorios', 'compras', 'inventario',
  'cmv', 'ficha-tecnica', 'planning', 'ia', 'rh', 'financeiro', 'configuracoes-usuarios', 'configuracoes',
];

const Index = () => {
  const { user, loading, permissionState, permissionError, retryPermissions, signOut, hasPermission, effectivePermissions } = useAuth();
  
  // Build module access for all tabs
  const salmonAccess = useModuleAccess('salmon');
  const estoqueAccess = useModuleAccess('estoque');
  const inventarioAccess = useModuleAccess('inventario');
  const comprasAccess = useModuleAccess('compras');
  const cmvAccess = useModuleAccess('cmv');
  const fichaAccess = useModuleAccess('ficha');
  const planningAccess = useModuleAccess('planning');
  const relatoriosAccess = useModuleAccess('relatorios');
  const iaAccess = useModuleAccess('ia');
  const rhAccess = useModuleAccess('rh');
  const financeiroAccess = useModuleAccess('financeiro');
  const configAccess = useModuleAccess('configuracoes');
  
  const moduleAccessMap = useMemo(() => ({
    salmon: salmonAccess.canView,
    'estoque-geral': estoqueAccess.canView,
    inventario: inventarioAccess.canView,
    compras: comprasAccess.canView,
    cmv: cmvAccess.canView,
    'ficha-tecnica': fichaAccess.canView,
    planning: planningAccess.canView,
    suppliers: comprasAccess.canView, // suppliers is under compras
    relatorios: relatoriosAccess.canView,
    ia: iaAccess.canView,
    rh: rhAccess.canView,
    financeiro: financeiroAccess.canView,
    configuracoes: configAccess.canView,
    'configuracoes-usuarios': configAccess.canView,
  }), [salmonAccess, estoqueAccess, inventarioAccess, comprasAccess, cmvAccess, fichaAccess, planningAccess, relatoriosAccess, iaAccess, rhAccess, financeiroAccess, configAccess]);
  const navigate = useNavigate();
  const location = useLocation();
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const store = useSalmonStoreContext();
  const estoqueStore = useEstoqueGeralStoreContext();
  const permissionRetryCountRef = useRef(0);

  const navigateToRequisicoes = useCallback(() => {
    setActiveTab('compras' as TabId);
  }, []);

  useMentionToast(user?.id, navigateToRequisicoes);

  // Check if user can access a given tab — uses useModuleAccess results
  const canAccessTab = useCallback((tab: TabId): boolean => {
    if (effectivePermissions.includes('system:global:manage')) return true;
    return !!moduleAccessMap[tab];
  }, [effectivePermissions, moduleAccessMap]);

  // Determine the first accessible tab
  const defaultTab = useMemo(() => {
    return TAB_PRIORITY.find(t => canAccessTab(t)) || 'estoque-geral';
  }, [canAccessTab]);

  const [activeTab, setActiveTab] = usePersistedTab<TabId>(
    'app:tab:main',
    defaultTab,
    TAB_PRIORITY,
  );

  // When permissions load, ensure activeTab is allowed
  useEffect(() => {
    if (permissionState === 'READY' && !canAccessTab(activeTab)) {
      toast.error('Sem permissão para acessar este módulo.');
      setActiveTab(defaultTab);
    }
  }, [permissionState, activeTab, canAccessTab, defaultTab]);

  // Guard tab changes
  const handleTabChange = useCallback((tab: TabId) => {
    if (canAccessTab(tab)) {
      setActiveTab(tab);
    } else {
      toast.error('Sem permissão para acessar este módulo.');
      setActiveTab(defaultTab);
    }
  }, [canAccessTab, defaultTab]);

  useEffect(() => {
    if (!loading && !user) {
      navigate('/login', { replace: true });
    }
  }, [loading, user, navigate]);

  useEffect(() => {
    if (permissionState === 'READY' || permissionState === 'ERROR') {
      permissionRetryCountRef.current = 0;
    }
  }, [permissionState]);

  // Recuperação automática caso fique preso em IDLE (usuário autenticado)
  useEffect(() => {
    if (!loading && user && permissionState === 'IDLE' && permissionRetryCountRef.current < 1) {
      permissionRetryCountRef.current += 1;
      retryPermissions();
    }
  }, [loading, user, permissionState, retryPermissions]);

  // Watchdog para estado LOADING prolongado
  useEffect(() => {
    if (!user || permissionState !== 'LOADING' || permissionRetryCountRef.current >= 2) return;

    const timer = window.setTimeout(() => {
      permissionRetryCountRef.current += 1;
      retryPermissions();
    }, 9000);

    return () => window.clearTimeout(timer);
  }, [user, permissionState, retryPermissions]);

  // URL guard for purchase-related routes (module-level check with legacy-aware resolver)
  useEffect(() => {
    if (permissionState !== 'READY') return;

    const path = location.pathname;
    const isComprasRoute =
      path.startsWith('/compras') ||
      path.startsWith('/fornecedores') ||
      path.startsWith('/recebimentos') ||
      path.startsWith('/mercados-sazonais') ||
      path.startsWith('/confirmacoes-recebimento');

    if (!isComprasRoute) return;

    if (!canAccessTab('compras')) {
      toast.error('Sem permissão.');
      navigate('/', { replace: true });
      return;
    }

    setActiveTab('compras');
  }, [location.pathname, permissionState, canAccessTab, navigate]);

  useEffect(() => {
    if (permissionState !== 'READY' || !location.pathname.startsWith('/financeiro/')) return;
    if (!canAccessTab('financeiro')) {
      toast.error('Sem permissão.');
      navigate('/', { replace: true });
      return;
    }
    setActiveTab('financeiro');
  }, [location.pathname, permissionState, canAccessTab, navigate, setActiveTab]);

  useEffect(() => {
    const handleOnline = () => setIsOffline(false);
    const handleOffline = () => setIsOffline(true);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  // Auth loading
  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) return null;

  // Permission ERROR state
  if (permissionState === 'ERROR') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center max-w-sm mx-auto p-6">
          <div className="w-12 h-12 rounded-full bg-destructive/10 flex items-center justify-center mx-auto mb-4">
            <AlertTriangle className="w-6 h-6 text-destructive" />
          </div>
          <h2 className="text-lg font-semibold text-foreground mb-2">Falha ao carregar permissões</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {permissionError || 'Não foi possível carregar suas permissões. Tente novamente.'}
          </p>
          <div className="flex flex-col gap-2">
            <Button onClick={retryPermissions} className="w-full gap-2">
              <RefreshCw className="w-4 h-4" /> Tentar novamente
            </Button>
            <Button variant="outline" onClick={() => window.location.reload()} className="w-full">
              Recarregar página
            </Button>
            <Button variant="ghost" onClick={() => { signOut(); navigate('/login', { replace: true }); }} className="w-full gap-2 text-destructive hover:text-destructive">
              <LogOut className="w-4 h-4" /> Sair
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // Permission LOADING
  if (permissionState === 'LOADING' || permissionState === 'IDLE') {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center">
          <div className="w-10 h-10 border-2 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">Carregando permissões...</p>
        </div>
      </div>
    );
  }

  // Access denied fallback (shouldn't happen but safety net)
  if (!canAccessTab(activeTab)) {
    return (
      <AppLayout activeTab={activeTab} onTabChange={handleTabChange} isOffline={isOffline} entries={store.entries} metasCompra={store.metasCompra}>
        <div className="flex flex-col items-center justify-center py-20">
          <ShieldAlert className="w-12 h-12 text-destructive mb-4" />
          <h2 className="text-lg font-semibold mb-2">Acesso negado</h2>
          <p className="text-sm text-muted-foreground">Você não tem permissão para acessar este módulo.</p>
        </div>
      </AppLayout>
    );
  }

  return (
    <AppLayout activeTab={activeTab} onTabChange={handleTabChange} isOffline={isOffline} entries={store.entries} metasCompra={store.metasCompra}>
      <Suspense fallback={<div className="flex items-center justify-center py-20"><div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" /></div>}>
        {activeTab === 'salmon' && canAccessTab('salmon') && <SalmonControlView store={store} />}
        {activeTab === 'estoque-geral' && canAccessTab('estoque-geral') && <EstoqueGeralView />}
        {activeTab === 'inventario' && canAccessTab('inventario') && <InventarioView />}
        {activeTab === 'compras' && canAccessTab('compras') && (
          <PurchaseOrdersStoreProvider><ComprasView /></PurchaseOrdersStoreProvider>
        )}
        {activeTab === 'planning' && canAccessTab('planning') && <PlanningView store={store} estoqueStore={estoqueStore} />}
        {activeTab === 'suppliers' && canAccessTab('suppliers') && <SuppliersView store={store} />}
        {activeTab === 'relatorios' && canAccessTab('relatorios') && <RelatoriosView />}
        {activeTab === 'cmv' && canAccessTab('cmv') && <CmvView />}
        {activeTab === 'ficha-tecnica' && canAccessTab('ficha-tecnica') && <FichaTecnicaView lotesLimpos={store.lotesLimpos} />}
        {activeTab === 'ia' && canAccessTab('ia') && <CentralIAView />}
        {activeTab === 'rh' && canAccessTab('rh') && <RhView />}
        {activeTab === 'financeiro' && canAccessTab('financeiro') && <FinanceiroView />}
        {activeTab === 'configuracoes-usuarios' && canAccessTab('configuracoes-usuarios') && <ConfiguracoesView store={store} initialSubTab="usuarios" />}
        {activeTab === 'configuracoes' && canAccessTab('configuracoes') && <ConfiguracoesView store={store} />}
      </Suspense>
    </AppLayout>
  );
};

function IndexWithProviders() {
  return (
    <SalmonStoreProvider>
      <EstoqueGeralStoreProvider>
        <Index />
      </EstoqueGeralStoreProvider>
    </SalmonStoreProvider>
  );
}

export default IndexWithProviders;

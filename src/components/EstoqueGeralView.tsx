import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { includesNormalized } from '@/lib/utils';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { TenantError } from '@/lib/tenant';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';

function isTenantErrorMessage(msg?: string): boolean {
  if (!msg) return false;
  return /tenant\s*inv[aá]lido|placeholder|empresa\s*n[ãa]o\s*(est[aá]|config)|n[ãa]o\s*vinculad/i.test(msg);
}

function showTenantErrorToast(msg: string) {
  toast.error(msg || 'Seu usuário não está vinculado a uma empresa válida. Faça logout e login novamente.', {
    action: {
      label: 'Recarregar sessão',
      onClick: async () => {
        await supabase.auth.signOut();
        window.location.href = '/login';
      },
    },
    duration: 10000,
  });
}
import { Package, Search, Filter, Plus, ArrowUpDown, AlertTriangle, CheckCircle, TrendingDown, Inbox, ClipboardList, BarChart3, Edit2, Trash2, X, Check, Eye, ArrowDown, ArrowUp, Minus, Calculator, RefreshCw, ShoppingCart, Settings2, Shield, Copy, MoreVertical, Power, PowerOff, LayoutDashboard, ArrowLeftRight, Brain } from 'lucide-react';
import SubTabBadge from '@/components/ui/SubTabBadge';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { normalizeBRLMoneyToNumber, fmtBRL } from '@/lib/money';
import { formatDecimalBR, formatIntegerBR, formatFixedBR } from '@/lib/formatters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { BRLInput, CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { useEstoqueGeralStoreContext } from '@/contexts/EstoqueGeralStoreContext';
import { useSalmonStoreContext } from '@/contexts/SalmonStoreContext';
import { useAuth } from '@/contexts/AuthContext';
import { useCan, useModuleAccess } from '@/permissions';
import { supabase } from '@/integrations/supabase/client';
import type { Produto, MovimentacaoEstoque } from '@/types/salmon';
import type { ProdutoExtended, ProdutoComSaldo, ProdutoFormData } from '@/types/estoque';
import { classifyStockHealth, countStockHealth, STOCK_HEALTH_CONFIG } from '@/domain/estoque/rules';
import { toast } from 'sonner';
import SimuladorCompraGeral from './SimuladorCompraGeral';
import RequisicaoEstoqueSection from './RequisicaoEstoqueSection';
import MovimentacoesSection from './MovimentacoesSection';
import StockCadastrosSection from './StockCadastrosSection';
import CustoItemDisplay, { getCostOrigin, getCostLabel, getActiveCostBase, getActiveCostPurchase } from './estoque/CustoItemDisplay';
import StockDashboardSection from './estoque/StockDashboardSection';

import StockTopConsumedSection from './estoque/StockTopConsumedSection';
import StockLossesSection from './estoque/StockLossesSection';
import StockTransfersSection from './estoque/StockTransfersSection';
import StockPredictiveSection from './estoque/StockPredictiveSection';
import { cacheInvalidate } from '@/components/cmv/cmvCache';
import StockSummaryCard from './estoque/StockSummaryCard';
import StockInactivityAlert from './estoque/StockInactivityAlert';
import ProdutoFormPanel, { emptyProdForm } from './estoque/ProdutoFormPanel';
import ProductSearchCombobox, { type ProductOption } from '@/components/ui/ProductSearchCombobox';
import { todayBR } from '@/lib/datetime';
import NovaMovimentacaoModal, { type MovModalPreset } from './estoque/NovaMovimentacaoModal';

type SubView = 'dashboard' | 'ranking' | 'perdas' | 'transferencias' | 'preditivo' | 'saldo' | 'movimentacoes' | 'solicitacoes' | 'produtos' | 'simulador' | 'cadastros';
import {
  decomposeStockLayers,
  formatStockLayers,
  PURCHASE_UNITS,
} from '@/lib/unitConversions';

// Map SubView ids to registry subtab keys
const SUB_VIEW_REGISTRY_MAP: Record<SubView, string> = {
  dashboard: 'dashboard',
  ranking: 'ranking',
  perdas: 'perdas',
  transferencias: 'transferencias',
  preditivo: 'preditivo',
  saldo: 'saldo',
  movimentacoes: 'movimentacoes',
  simulador: 'simulador',
  solicitacoes: 'requisicoes',
  produtos: 'catalogo',
  cadastros: 'cadastros',
};

export default function EstoqueGeralView() {
  const [activeView, setActiveView] = usePersistedTab<SubView>('app:tab:estoque', 'dashboard');
  const store = useEstoqueGeralStoreContext();
  const salmonStore = useSalmonStoreContext();
  const { user, hasPermission } = useAuth();
  const { confirm, ConfirmDialog } = useConfirmDialog();
  const { visibleSubtabs } = useModuleAccess('estoque');

  // Granular permission checks
  const canCreateCatalogo = useCan('estoque:catalogo:create');
  const canEditCatalogo = useCan('estoque:catalogo:edit');
  const canDeleteCatalogo = useCan('estoque:catalogo:delete');
  const canCreateMov = useCan('estoque:movimentacoes:create');
  const canEditPricing = canEditCatalogo;
  const canViewSelector = canEditCatalogo || useCan('financeiro:dashboard:view');
  const { produtos, saldos, movimentacoes, categorias, prodTotalCount, prodHasMore, prodPage, prodGlobalCounts } = store;

  // Requisition pending count for badge — counts only requisitions with ≥1 SOLICITADO item
  const [reqPendingCount, setReqPendingCount] = useState(0);
  const refreshReqBadge = useCallback(async () => {
    const { data, error } = await supabase.rpc('count_requisicoes_with_pending_items');
    if (!error && typeof data === 'number') setReqPendingCount(data);
  }, []);
  useEffect(() => { refreshReqBadge(); }, [refreshReqBadge, activeView]);

  const movProductOptions: ProductOption[] = useMemo(() =>
    produtos.filter(p => p.ativo).map(p => ({
      id: p.id,
      label: p.nomeProduto,
      sublabel: `(${p.unidadeMedida})`,
      keywords: p.sku || '',
    })),
    [produtos]
  );

  // Fetch categories & locations from DB
  const [dbCategorias, setDbCategorias] = useState<string[]>([]);
  const [dbLocais, setDbLocais] = useState<string[]>([]);
  const fetchCadastros = useCallback(async () => {
    const [catRes, locRes] = await Promise.all([
      supabase.from('stock_categories').select('name').eq('is_active', true).order('sort_order').order('name'),
      supabase.from('stock_locations').select('name').eq('is_active', true).order('name'),
    ]);
    setDbCategorias((catRes.data || []).map((c: { name: string }) => c.name));
    setDbLocais((locRes.data || []).map((l: { name: string }) => l.name));
  }, []);
  useEffect(() => { fetchCadastros(); }, [fetchCadastros]);

  // Merge DB categories with any legacy categories from products
  const allCategorias = useMemo(() => [...new Set([...dbCategorias, ...categorias])].sort(), [dbCategorias, categorias]);

  // Produto form
  const [showProdForm, setShowProdForm] = useState(false);
  const [editProdId, setEditProdId] = useState<string | null>(null);
  const [prodForm, setProdForm] = useState(emptyProdForm);
  const [saving, setSaving] = useState(false);

  // Movimentação modal
  const [movModalOpen, setMovModalOpen] = useState(false);
  const [movModalPreset, setMovModalPreset] = useState<MovModalPreset>('entrada');
  const handleOpenMovModal = useCallback((preset: MovModalPreset) => {
    setMovModalPreset(preset);
    setMovModalOpen(true);
  }, []);
  const handleCloseMovModal = useCallback(() => setMovModalOpen(false), []);

  // Legacy form state kept for inline usage in Saldo tab (if any)
  const [showMovForm, setShowMovForm] = useState(false);
  const [movForm, setMovForm] = useState({ produtoId: '', tipo: 'ENTRADA' as MovimentacaoEstoque['tipo'], quantidade: '', custoUnitario: '', observacao: '', setor: '' });
  const [movPrecoTotal, setMovPrecoTotal] = useState('');
  const [movQtdEmbalagem, setMovQtdEmbalagem] = useState('1');
  const [recalculating, setRecalculating] = useState(false);
  const [expandedProdId, setExpandedProdId] = useState<string | null>(null);
  const [costLocked, setCostLocked] = useState(true);
  const [batchMode, setBatchMode] = useState(false);
  const [catalogStockFilter, setCatalogStockFilter] = useState<'all' | 'low' | 'none'>('all');

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [filterCat, setFilterCat] = useState('');
  const [filterStatus, setFilterStatus] = useState('');

  // Catálogo filters — server-side with debounce
  const [catalogSearchInput, setCatalogSearchInput] = useState('');
  const [catalogCatFilter, setCatalogCatFilter] = useState('');
  const [catalogStatusFilter, setCatalogStatusFilter] = useState<'active' | 'inactive' | 'all'>('active');
  const [catalogSortBy, setCatalogSortBy] = useState<import('@/hooks/useEstoqueGeralStore').ProdSortBy>('recent');
  const catalogDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const ESTOQUE_PAGE = 50;
  const totalPages = prodTotalCount != null ? Math.max(1, Math.ceil(prodTotalCount / ESTOQUE_PAGE)) : 1;

  // Build the full filter object from local UI state
  const buildCatalogFilters = useCallback((search: string, cat: string, status: 'active' | 'inactive' | 'all', sort: import('@/hooks/useEstoqueGeralStore').ProdSortBy) => {
    return {
      ativo: status === 'all' ? undefined : status === 'active',
      search: search.trim() || undefined,
      categoria: cat || undefined,
      sortBy: sort,
    };
  }, []);

  // Trigger server-side fetch when catalog filters change
  const applyCatalogFilters = useCallback((search: string, cat: string, status?: 'active' | 'inactive' | 'all', sort?: import('@/hooks/useEstoqueGeralStore').ProdSortBy) => {
    store.updateProdFilters(buildCatalogFilters(search, cat, status ?? catalogStatusFilter, sort ?? catalogSortBy));
  }, [store, buildCatalogFilters, catalogStatusFilter, catalogSortBy]);

  // Debounced search
  const handleCatalogSearchChange = useCallback((value: string) => {
    setCatalogSearchInput(value);
    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current);
    catalogDebounceRef.current = setTimeout(() => {
      applyCatalogFilters(value, catalogCatFilter);
    }, 300);
  }, [catalogCatFilter, applyCatalogFilters]);

  // Category filter (immediate)
  const handleCatalogCatChange = useCallback((value: string) => {
    const cat = value === 'all' ? '' : value;
    setCatalogCatFilter(cat);
    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current);
    applyCatalogFilters(catalogSearchInput, cat);
  }, [catalogSearchInput, applyCatalogFilters]);

  // Status filter (immediate)
  const handleCatalogStatusChange = useCallback((value: string) => {
    const status = value as 'active' | 'inactive' | 'all';
    setCatalogStatusFilter(status);
    applyCatalogFilters(catalogSearchInput, catalogCatFilter, status);
  }, [catalogSearchInput, catalogCatFilter, applyCatalogFilters]);

  // Sort (immediate)
  const handleCatalogSortChange = useCallback((value: string) => {
    const sort = value as import('@/hooks/useEstoqueGeralStore').ProdSortBy;
    setCatalogSortBy(sort);
    applyCatalogFilters(catalogSearchInput, catalogCatFilter, undefined, sort);
  }, [catalogSearchInput, catalogCatFilter, applyCatalogFilters]);

  // Clear all filters
  const clearCatalogFilters = useCallback(() => {
    setCatalogSearchInput('');
    setCatalogCatFilter('');
    setCatalogStatusFilter('active');
    setCatalogSortBy('recent');
    setCatalogStockFilter('all');
    if (catalogDebounceRef.current) clearTimeout(catalogDebounceRef.current);
    store.updateProdFilters(buildCatalogFilters('', '', 'active', 'recent'));
  }, [store, buildCatalogFilters]);

  const hasActiveFilters = catalogSearchInput || catalogCatFilter || catalogStatusFilter !== 'active' || catalogSortBy !== 'recent' || catalogStockFilter !== 'all';

  // Duplicate item handler
  const handleDuplicate = useCallback((p: ProdutoExtended) => {
    const fator = p.fatorConversaoPadrao || 1;
    const hasDual = p.unidadeCompra && p.unidadeCompra !== p.unidadeMedida;
    setEditProdId(null);
    setProdForm({
      nomeProduto: `${p.nomeProduto} (cópia)`,
      sku: '',
      categoria: p.categoria,
      unidadeMedida: p.unidadeMedida as ProdutoFormData['unidadeMedida'],
      conversoes: p.conversoes,
      custoPadrao: p.custoPadrao,
      fornecedoresPreferenciais: p.fornecedoresPreferenciais,
      leadTimeDias: p.leadTimeDias,
      estoqueMinimo: p.estoqueMinimo,
      estoqueIdeal: p.estoqueIdeal,
      localEstoque: p.localEstoque,
      ativo: true,
      observacoes: p.observacoes,
      unidadeCompra: p.unidadeCompra || 'UN',
      fatorConversaoPadrao: fator,
      defaultCostPurchaseUnit: p.defaultCostPurchaseUnit || p.custoPadrao || 0,
      minIdealMode: hasDual ? 'purchase' : 'base',
      minPurchaseQty: hasDual && fator > 0 ? p.estoqueMinimo / fator : 0,
      idealPurchaseQty: hasDual && fator > 0 ? p.estoqueIdeal / fator : 0,
      inactivityDaysThreshold: p.inactivityDaysThreshold ?? '',
      contaNoCmv: p.contaNoCmv ?? true,
      packageQuantity: p.packageQuantity ?? null,
      packageMeasureUnit: p.packageMeasureUnit ?? null,
      conversionMode: p.conversionMode || 'manual',
    });
    setShowProdForm(true);
  }, []);

  // Toggle ativo/inativo
  const handleToggleAtivo = useCallback(async (p: ProdutoExtended) => {
    const newStatus = !p.ativo;
    const ok = await confirm({
      title: newStatus ? 'Reativar produto' : 'Inativar produto',
      description: `Tem certeza que deseja ${newStatus ? 'reativar' : 'inativar'} "${p.nomeProduto}"?`,
      confirmLabel: newStatus ? 'Reativar' : 'Inativar',
      variant: newStatus ? 'default' : 'destructive',
    });
    if (ok) {
      await store.updateProduto(p.id, { ativo: newStatus });
      toast.success(newStatus ? 'Produto reativado' : 'Produto inativado');
      if (activeView === 'produtos') applyCatalogFilters(catalogSearchInput, catalogCatFilter);
    }
  }, [confirm, store, activeView, applyCatalogFilters, catalogSearchInput, catalogCatFilter]);


  // Filtered catalog products (stock filter is client-side since saldos are already loaded)
  const catalogFiltered = useMemo(() => {
    if (catalogStockFilter === 'all') return produtos;
    return produtos.filter(p => {
      const s = saldos[p.id]?.saldo ?? 0;
      if (catalogStockFilter === 'none') return s <= 0;
      if (catalogStockFilter === 'low') return s > 0 && s <= p.estoqueMinimo;
      return true;
    });
  }, [produtos, saldos, catalogStockFilter]);

  // Load catalog with ativo=true filter when switching to catálogo tab
  useEffect(() => {
    if (activeView === 'produtos') {
      applyCatalogFilters(catalogSearchInput, catalogCatFilter);
    } else {
      store.fetchAllProdutos();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeView]);

  // Computed product status — uses canonical domain rule
  const produtosComSaldo = useMemo(() => {
    return produtos.filter(p => p.ativo).map(p => {
      const s = saldos[p.id] || { saldo: 0 };
      const status = classifyStockHealth(s.saldo, p.estoqueMinimo);
      return { ...p, saldo: s.saldo, status };
    });
  }, [produtos, saldos]);

  const filtered = useMemo(() => {
    let list = produtosComSaldo;
    if (searchTerm) list = list.filter(p => includesNormalized(p.nomeProduto, searchTerm));
    if (filterCat) list = list.filter(p => p.categoria === filterCat);
    if (filterStatus) list = list.filter(p => p.status === filterStatus);
    return list;
  }, [produtosComSaldo, searchTerm, filterCat, filterStatus]);

  const counts = useMemo(() => countStockHealth(
    produtosComSaldo.map(p => ({ saldo: p.saldo, estoqueMinimo: p.estoqueMinimo }))
  ), [produtosComSaldo]);

  // Auto-calc: preço base = preço total / qtd embalagem
  const precoBaseCalc = useMemo(() => {
    const pt = normalizeBRLMoneyToNumber(movPrecoTotal) || 0;
    const qe = normalizeBRLMoneyToNumber(movQtdEmbalagem) || 1;
    return qe > 0 ? pt / qe : 0;
  }, [movPrecoTotal, movQtdEmbalagem]);

  const quantidadeBaseCalc = useMemo(() => {
    const qty = normalizeBRLMoneyToNumber(movForm.quantidade) || 0;
    const qe = normalizeBRLMoneyToNumber(movQtdEmbalagem) || 1;
    return qty * qe;
  }, [movForm.quantidade, movQtdEmbalagem]);

  // Helper: does selected product have purchase unit?
  const selectedProd = useMemo(() => produtos.find(p => p.id === movForm.produtoId), [movForm.produtoId, produtos]);
  const hasPurchaseUnit = useMemo(() => {
    if (!selectedProd) return false;
    const unCompra = selectedProd.unidadeCompra || selectedProd.unidadeMedida;
    return unCompra !== selectedProd.unidadeMedida;
  }, [selectedProd]);
  const selectedFator = useMemo(() => selectedProd?.fatorConversaoPadrao || 1, [selectedProd]);
  const selectedUnCompra = useMemo(() => selectedProd?.unidadeCompra || selectedProd?.unidadeMedida || '', [selectedProd]);

  // For saídas: qty is always in purchase unit when available, convert to base
  const saidaBaseCalc = useMemo(() => {
    const qty = normalizeBRLMoneyToNumber(movForm.quantidade) || 0;
    return hasPurchaseUnit ? qty * selectedFator : qty;
  }, [movForm.quantidade, hasPurchaseUnit, selectedFator]);

  // Auto-fill cost for saídas using hierarchy: avg30 → last → default
  const saidaCostInfo = useMemo(() => {
    if (!selectedProd) return null;
    const origin = getCostOrigin(selectedProd);
    const costBase = getActiveCostBase(selectedProd);
    const costPurchase = getActiveCostPurchase(selectedProd);
    const label = getCostLabel(origin);
    const hasCost = costBase > 0;
    return { origin, costBase, costPurchase, label, hasCost };
  }, [selectedProd]);

  // Auto-set cost when product or tipo changes for saídas
  const prevProdRef = useMemo(() => movForm.produtoId + movForm.tipo, [movForm.produtoId, movForm.tipo]);
  useEffect(() => {
    if (movForm.tipo === 'ENTRADA' || !selectedProd) return;
    if (saidaCostInfo?.hasCost) {
      setMovForm(f => ({ ...f, custoUnitario: String(Math.round(saidaCostInfo.costBase * 100) / 100) }));
      setCostLocked(true);
    } else {
      setMovForm(f => ({ ...f, custoUnitario: '' }));
      setCostLocked(false);
    }
  }, [prevProdRef]); // eslint-disable-line react-hooks/exhaustive-deps

  // Saída total estimate
  const saidaTotalEstimate = useMemo(() => {
    const costUnit = normalizeBRLMoneyToNumber(movForm.custoUnitario) || 0;
    return saidaBaseCalc * costUnit;
  }, [saidaBaseCalc, movForm.custoUnitario]);

  // Saldo display for selected product
  const selectedSaldo = useMemo(() => {
    if (!selectedProd) return { base: 0, purchase: 0 };
    const s = saldos[selectedProd.id]?.saldo || 0;
    return { base: s, purchase: selectedFator > 0 ? s / selectedFator : s };
  }, [selectedProd, saldos, selectedFator]);

   const handleSaveMov = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return; // Guard: prevent double submit
    if (!movForm.produtoId || !movForm.quantidade) { toast.error('Preencha todos os campos'); return; }
    const isSaida = movForm.tipo !== 'ENTRADA';
    if (isSaida && !movForm.setor) { toast.error('Setor é obrigatório para saídas.'); return; }
    const qty = normalizeBRLMoneyToNumber(movForm.quantidade) || 0;
    const qe = normalizeBRLMoneyToNumber(movQtdEmbalagem) || 1;
    let quantidadeBase: number;
    if (movForm.tipo === 'ENTRADA') {
      if (qe <= 0) { toast.error('Fator de conversão deve ser > 0'); return; }
      quantidadeBase = qty * qe;
    } else {
      quantidadeBase = hasPurchaseUnit ? qty * selectedFator : qty;
    }

    // Validate stock for saídas
    if (isSaida) {
      const saldoAtual = saldos[movForm.produtoId]?.saldo || 0;
      if (quantidadeBase > saldoAtual) {
        toast.error(`Estoque insuficiente! Disponível: ${formatDecimalBR(saldoAtual, 2)} ${selectedProd?.unidadeMedida || ''}`);
        return;
      }
    }

    // For saídas: block if no cost available
    const custoUnit = movForm.tipo === 'ENTRADA' ? precoBaseCalc : (normalizeBRLMoneyToNumber(movForm.custoUnitario) || 0);
    if (isSaida && custoUnit <= 0) {
      toast.error('Item sem custo cadastrado. Registre uma entrada inicial ou custo padrão.');
      return;
    }
    setSaving(true);
    try {
      await store.addMovimentacao({
        produtoId: movForm.produtoId,
        data: todayBR(),
        tipo: movForm.tipo,
        quantidade: quantidadeBase,
        custoUnitario: Math.round(custoUnit * 100) / 100,
        custoTotal: Math.round(quantidadeBase * custoUnit * 100) / 100,
        origem: 'Manual',
        referenciaId: '',
        observacao: movForm.observacao,
        createdBy: user?.id || 'admin',
        setor: isSaida ? movForm.setor : undefined,
      } as Parameters<typeof store.addMovimentacao>[0]);
      toast.success(`Movimentação ${movForm.tipo} registrada!`);
      if (movForm.tipo === 'ENTRADA') {
        recalcularPrecos(movForm.produtoId);
      }
      setMovForm({ produtoId: '', tipo: 'ENTRADA', quantidade: '', custoUnitario: '', observacao: '', setor: '' });
      setMovPrecoTotal('');
      setMovQtdEmbalagem('1');
      setShowMovForm(false);
    } catch (err: any) {
      const msg = err?.message || '';
      if (err instanceof TenantError || isTenantErrorMessage(msg)) {
        showTenantErrorToast(msg);
      } else {
        toast.error(msg || 'Erro ao registrar movimentação');
      }
    }
    setSaving(false);
  };

  const recalcularPrecos = useCallback(async (produtoId?: string) => {
    setRecalculating(true);
    try {
      const action = produtoId ? 'recalcular_precos_produto' : 'recalcular_todos_precos';
      const body = produtoId ? { action, produto_id: produtoId } : { action };
      const { data, error } = await supabase.functions.invoke('cmv', { body });
      if (error) throw error;
      cacheInvalidate('calcular_cmv');
      cacheInvalidate('get_ranking');
      if (!produtoId) {
        toast.success(`Preços recalculados: ${data?.total || 0} produtos`);
      }
    } catch (e: any) {
      console.error('Erro ao recalcular preços:', e);
    }
    setRecalculating(false);
  }, []);

  // Permission map for sub-views - now using granular registry via useModuleAccess
  const canAccessSubView = (view: SubView) => {
    const registryKey = SUB_VIEW_REGISTRY_MAP[view];
    return visibleSubtabs.includes(registryKey);
  };

  const allSubViews: { id: SubView; label: string; icon: typeof Package; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'ranking', label: 'Ranking', icon: BarChart3 },
    { id: 'perdas', label: 'Perdas', icon: Trash2 },
    { id: 'transferencias', label: 'Transferências', icon: ArrowLeftRight },
    { id: 'preditivo', label: 'Preditivo', icon: Brain },
    { id: 'saldo', label: 'Saldo', icon: BarChart3 },
    { id: 'movimentacoes', label: 'Movimentações', icon: ArrowUpDown },
    { id: 'simulador', label: 'Simulador', icon: ShoppingCart },
    { id: 'solicitacoes', label: 'Requisições', icon: ClipboardList, badge: reqPendingCount || undefined },
    { id: 'produtos', label: 'Catálogo', icon: Package },
    { id: 'cadastros', label: 'Cadastros', icon: Settings2 },
  ];

  const subViews = allSubViews.filter(v => canAccessSubView(v.id));

  // Auto-redirect to first allowed sub-view
  if (subViews.length > 0 && !subViews.some(v => v.id === activeView)) {
    setActiveView(subViews[0].id);
  }

  if (subViews.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Shield className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
        <p className="text-sm font-medium text-foreground">Acesso Negado</p>
        <p className="text-xs text-muted-foreground">Você não possui permissões para acessar o módulo Estoque Geral.</p>
      </div>
    );
  }

  const getProdNome = (id: string) => produtos.find(p => p.id === id)?.nomeProduto || id.slice(0, 8);
  const getMovIcon = (tipo: string) => tipo === 'ENTRADA' ? <ArrowDown className="w-3 h-3 text-success" /> : tipo === 'SAIDA' ? <ArrowUp className="w-3 h-3 text-destructive" /> : <Minus className="w-3 h-3 text-warning" />;

  return (
    <><div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Estoque Geral</h2>
        <p className="text-xs text-muted-foreground">{prodGlobalCounts.active} ativos de {prodGlobalCounts.total} produtos ({prodGlobalCounts.inactive} inativos) • {formatIntegerBR(Object.values(saldos).reduce((s, v) => s + v.saldo, 0))} itens em estoque</p>
      </div>

      <StockSummaryCard />

      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {subViews.map(view => {
          const Icon = view.icon;
          const active = activeView === view.id;
          return (
            <button key={view.id} onClick={() => { setActiveView(view.id); if (view.id === 'produtos' || view.id === 'saldo') fetchCadastros(); }}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all relative ${active ? 'gradient-salmon text-primary-foreground shadow-md' : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'}`}>
              <Icon className="w-3.5 h-3.5" />
              {view.label}
              <SubTabBadge count={view.badge} />
            </button>
          );
        })}
      </div>

      {/* ====== DASHBOARD ====== */}
      {activeView === 'dashboard' && (
        <StockDashboardSection categorias={allCategorias} onNavigate={(subTab, statusFilter) => {
          setActiveView(subTab as SubView);
          setFilterStatus(statusFilter ?? '');
          setSearchTerm('');
          setFilterCat('');
        }} />
      )}


      {/* ====== RANKING ====== */}
      {activeView === 'ranking' && (
        <StockTopConsumedSection categorias={allCategorias} />
      )}

      {/* ====== PERDAS ====== */}
      {activeView === 'perdas' && (
        <StockLossesSection categorias={allCategorias} />
      )}

      {/* ====== TRANSFERÊNCIAS ====== */}
      {activeView === 'transferencias' && (
        <StockTransfersSection categorias={allCategorias} locais={dbLocais} />
      )}

      {/* ====== PREDITIVO ====== */}
      {activeView === 'preditivo' && (
        <StockPredictiveSection categorias={allCategorias} />
      )}

      {/* ====== SALDO ====== */}
      {activeView === 'saldo' && (
        <div className="space-y-3">
          <StockInactivityAlert categorias={allCategorias} />
          <div className="grid grid-cols-4 gap-2">
            <button onClick={() => setFilterStatus(filterStatus === 'ok' ? '' : 'ok')} className={`bg-card border rounded-xl p-3 text-center transition-all ${filterStatus === 'ok' ? 'border-success ring-1 ring-success/30' : 'border-border'}`}>
              <CheckCircle className="w-5 h-5 text-success mx-auto mb-1" />
              <p className="text-lg font-display font-bold text-foreground">{counts.ok}</p>
              <p className="text-[10px] text-muted-foreground">OK</p>
            </button>
            <button onClick={() => setFilterStatus(filterStatus === 'atencao' ? '' : 'atencao')} className={`bg-card border rounded-xl p-3 text-center transition-all ${filterStatus === 'atencao' ? 'border-warning ring-1 ring-warning/30' : 'border-border'}`}>
              <TrendingDown className="w-5 h-5 text-warning mx-auto mb-1" />
              <p className="text-lg font-display font-bold text-foreground">{counts.atencao}</p>
              <p className="text-[10px] text-muted-foreground">Estoque Baixo</p>
            </button>
            <button onClick={() => setFilterStatus(filterStatus === 'critico' ? '' : 'critico')} className={`bg-card border rounded-xl p-3 text-center transition-all ${filterStatus === 'critico' ? 'border-destructive ring-1 ring-destructive/30' : 'border-border'}`}>
              <AlertTriangle className="w-5 h-5 text-destructive mx-auto mb-1" />
              <p className="text-lg font-display font-bold text-foreground">{counts.critico}</p>
              <p className="text-[10px] text-muted-foreground">Crítico</p>
            </button>
            <button onClick={() => setFilterStatus(filterStatus === 'sem_estoque' ? '' : 'sem_estoque')} className={`bg-card border rounded-xl p-3 text-center transition-all ${filterStatus === 'sem_estoque' ? 'border-destructive ring-1 ring-destructive/30' : 'border-border'}`}>
              <Inbox className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
              <p className="text-lg font-display font-bold text-foreground">{counts.sem_estoque}</p>
              <p className="text-[10px] text-muted-foreground">Sem Estoque</p>
            </button>
          </div>

          {/* Active filter indicator */}
          {filterStatus && (
            <div className="flex items-center gap-2 px-3 py-2 bg-accent/30 border border-border rounded-lg">
              <span className="text-xs text-muted-foreground">Filtro ativo:</span>
              <Badge variant="secondary" className="text-xs gap-1">
                {STOCK_HEALTH_CONFIG[filterStatus as keyof typeof STOCK_HEALTH_CONFIG]?.emoji}{' '}
                {STOCK_HEALTH_CONFIG[filterStatus as keyof typeof STOCK_HEALTH_CONFIG]?.label || filterStatus}
              </Badge>
              <Button variant="ghost" size="sm" className="h-6 w-6 p-0 ml-auto" onClick={() => setFilterStatus('')} aria-label="Limpar filtro">
                <X className="w-3.5 h-3.5" />
              </Button>
            </div>
          )}

          <div className="flex items-center gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Buscar produto..." className="pl-9 h-9 text-xs bg-secondary border-border" />
            </div>
            <Select value={filterCat} onValueChange={v => setFilterCat(v === 'all' ? '' : v)}>
              <SelectTrigger className="w-28 h-9 text-xs bg-secondary border-border"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                {allCategorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {filtered.length > 0 ? (
            <div className="space-y-2">
              {filtered.map((p, i) => {
                const fator = p.fatorConversaoPadrao || 1;
                const unCompra = p.unidadeCompra || p.unidadeMedida;
                const showDual = unCompra !== p.unidadeMedida;
                const saldoPurchase = fator > 0 ? p.saldo / fator : p.saldo;
                const origin = getCostOrigin(p);
                const costBase = getActiveCostBase(p);
                const costPurchase = getActiveCostPurchase(p);
                const isExpanded = expandedProdId === p.id;

                return (
                <div key={p.id} className={`bg-card border rounded-xl p-3 animate-fade-up cursor-pointer transition-all ${STOCK_HEALTH_CONFIG[p.status].borderClass}`} style={{ animationDelay: `${i * 30}ms` }}
                  onClick={() => setExpandedProdId(isExpanded ? null : p.id)}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-semibold text-foreground truncate">{p.nomeProduto}</p>
                        <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${STOCK_HEALTH_CONFIG[p.status].bgClass} ${STOCK_HEALTH_CONFIG[p.status].colorClass}`}>
                          {STOCK_HEALTH_CONFIG[p.status].emoji} {STOCK_HEALTH_CONFIG[p.status].shortLabel}
                        </span>
                        <span className="text-[8px] px-1.5 py-0.5 rounded bg-primary/10 text-primary font-medium">{getCostLabel(origin)}</span>
                        {p.needsCostReview && <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-medium">⚠️ Revisar custo</span>}
                      </div>
                      <div className="flex items-center gap-3 text-[10px] text-muted-foreground mt-0.5">
                        <span>{p.categoria}</span>
                        <span>{p.localEstoque}</span>
                        {p.sku && <span>SKU: {p.sku}</span>}
                      </div>
                    </div>
                    <div className="text-right">
                      {(() => {
                        const layers = decomposeStockLayers(p.saldo, fator, unCompra, p.unidadeMedida);
                        if (layers.hasLayers) {
                          return (
                            <>
                              <p className="text-base font-display font-bold text-foreground">
                                {formatStockLayers(layers)}
                              </p>
                              <p className="text-[10px] text-muted-foreground">({formatDecimalBR(p.saldo, 2)} {p.unidadeMedida})</p>
                            </>
                          );
                        }
                        return (
                          <p className="text-base font-display font-bold text-foreground">
                            {formatDecimalBR(p.saldo, p.unidadeMedida === 'KG' || p.unidadeMedida === 'L' ? 2 : 0)} {p.unidadeMedida}
                          </p>
                        );
                      })()}
                      {costBase > 0 && (
                        <p className="text-[9px] text-muted-foreground mt-0.5">
                          {fmtBRL(costBase)}/{p.unidadeMedida}
                          {showDual && ` | ${fmtBRL(costPurchase)}/${unCompra}`}
                        </p>
                      )}
                    </div>
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 bg-secondary rounded-full overflow-hidden">
                    <div className={`h-full rounded-full transition-all ${p.status === 'ok' ? 'bg-success' : p.status === 'atencao' ? 'bg-warning' : 'bg-destructive'}`}
                      style={{ width: `${Math.min(100, (p.saldo / Math.max(p.estoqueIdeal || p.estoqueMinimo, 1)) * 100)}%` }} />
                  </div>
                  {/* Min/Ideal dual display */}
                  <div className="flex items-center gap-3 mt-1 text-[9px] text-muted-foreground">
                    {(() => {
                      const minP = showDual && fator > 0 ? p.estoqueMinimo / fator : 0;
                      const idealP = showDual && fator > 0 ? p.estoqueIdeal / fator : 0;
                      return (
                        <>
                          <span>Mín: {showDual ? `${minP.toFixed(1)} ${unCompra} (${p.estoqueMinimo} ${p.unidadeMedida})` : `${p.estoqueMinimo} ${p.unidadeMedida}`}</span>
                          {p.estoqueIdeal > 0 && <span>Ideal: {showDual ? `${idealP.toFixed(1)} ${unCompra} (${p.estoqueIdeal} ${p.unidadeMedida})` : `${p.estoqueIdeal} ${p.unidadeMedida}`}</span>}
                          {p.status === 'critico' && showDual && <span className="text-destructive font-medium">abaixo do mínimo ({minP.toFixed(1)} {unCompra})</span>}
                        </>
                      );
                    })()}
                  </div>
                  {/* Expanded cost detail */}
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t border-border" onClick={e => e.stopPropagation()}>
                      <CustoItemDisplay produto={p} saldoBase={p.saldo} showSelector={canViewSelector} />
                    </div>
                  )}
                </div>
                );
              })}
            </div>
          ) : (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">{produtos.length === 0 ? 'Nenhum produto cadastrado' : 'Nenhum resultado'}</p>
              <p className="text-xs text-muted-foreground mb-4">{produtos.length === 0 ? 'Cadastre produtos no Catálogo para controlar o estoque.' : 'Ajuste os filtros.'}</p>
              {produtos.length === 0 && (
                <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5" onClick={() => setActiveView('produtos')}>
                  <Plus className="w-4 h-4" /> Cadastrar Produto
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {/* ====== MOVIMENTAÇÕES ====== */}
      {activeView === 'movimentacoes' && (
        <>
          <MovimentacoesSection
            movimentacoes={movimentacoes}
            produtos={produtos}
            categorias={categorias}
            getProdNome={getProdNome}
            canCreateMov={canCreateMov}
            onOpenMovModal={handleOpenMovModal}
            canEditPricing={canEditPricing}
            recalculating={recalculating}
            recalcularPrecos={recalcularPrecos}
            onRefresh={store.refetch}
            onFilterChange={store.updateMovFilters}
            onLoadMore={store.loadMoreMovimentacoes}
            hasMore={store.movHasMore}
            totalCount={store.movTotalCount}
            serverTotals={store.movServerTotals}
          />
          <NovaMovimentacaoModal
            open={movModalOpen}
            preset={movModalPreset}
            onClose={handleCloseMovModal}
            produtos={produtos}
            saldos={saldos}
            userId={user?.id || ''}
            hasPermission={hasPermission}
            canEditPricing={canEditPricing}
            addMovimentacao={store.addMovimentacao}
            recalcularPrecos={recalcularPrecos}
          />
        </>
      )}

      {/* ====== REQUISIÇÕES DE ESTOQUE ====== */}
      {activeView === 'solicitacoes' && (
        <RequisicaoEstoqueSection produtos={produtos} saldos={saldos} onBadgeRefresh={refreshReqBadge} />
      )}

      {/* ====== CATÁLOGO ====== */}
      {activeView === 'produtos' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm font-semibold text-foreground">Catálogo de Produtos</p>
            {canCreateCatalogo && <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5 text-xs" onClick={() => { setShowProdForm(!showProdForm); setEditProdId(null); setProdForm(emptyProdForm); }}>
              <Plus className="w-3.5 h-3.5" /> Novo Produto
            </Button>}
          </div>

          {/* Busca + Filtros */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[140px]">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <Input value={catalogSearchInput} onChange={e => handleCatalogSearchChange(e.target.value)} placeholder="🔎 Buscar item..." className="pl-9 h-9 text-xs bg-secondary border-border" />
            </div>
            <Select value={catalogCatFilter || 'all'} onValueChange={handleCatalogCatChange}>
              <SelectTrigger className="w-32 h-9 text-xs bg-secondary border-border"><SelectValue placeholder="Categoria" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas categorias</SelectItem>
                {allCategorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
            <Select value={catalogStatusFilter} onValueChange={handleCatalogStatusChange}>
              <SelectTrigger className="w-28 h-9 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="active">Ativos</SelectItem>
                <SelectItem value="inactive">Inativos</SelectItem>
                <SelectItem value="all">Todos</SelectItem>
              </SelectContent>
            </Select>
            <Select value={catalogSortBy} onValueChange={handleCatalogSortChange}>
              <SelectTrigger className="w-36 h-9 text-xs bg-secondary border-border">
                <ArrowUpDown className="w-3 h-3 mr-1 text-muted-foreground" /><SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="recent">Mais recentes</SelectItem>
                <SelectItem value="oldest">Mais antigos</SelectItem>
                <SelectItem value="name_asc">Nome A → Z</SelectItem>
                <SelectItem value="name_desc">Nome Z → A</SelectItem>
                <SelectItem value="sku_asc">SKU crescente</SelectItem>
                <SelectItem value="sku_desc">SKU decrescente</SelectItem>
                <SelectItem value="cat_asc">Categoria A → Z</SelectItem>
              </SelectContent>
            </Select>
            <Select value={catalogStockFilter} onValueChange={v => setCatalogStockFilter(v as 'all' | 'low' | 'none')}>
              <SelectTrigger className="w-32 h-9 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todo estoque</SelectItem>
                <SelectItem value="low">⚠️ Estoque baixo</SelectItem>
                <SelectItem value="none">❌ Sem estoque</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Active filter chips */}
          {hasActiveFilters && (
            <div className="flex flex-wrap items-center gap-1.5">
              {catalogSearchInput && (
                <Badge variant="secondary" className="text-[10px] gap-1 h-5">Busca: {catalogSearchInput}</Badge>
              )}
              {catalogCatFilter && (
                <Badge variant="secondary" className="text-[10px] gap-1 h-5">Categoria: {catalogCatFilter}</Badge>
              )}
              {catalogStatusFilter !== 'active' && (
                <Badge variant="secondary" className="text-[10px] gap-1 h-5">Status: {catalogStatusFilter === 'inactive' ? 'Inativos' : 'Todos'}</Badge>
              )}
              {catalogSortBy !== 'recent' && (
                <Badge variant="secondary" className="text-[10px] gap-1 h-5">Ordenação: {{
                  oldest: 'Mais antigos', name_asc: 'Nome A→Z', name_desc: 'Nome Z→A',
                  sku_asc: 'SKU ↑', sku_desc: 'SKU ↓', cat_asc: 'Categoria A→Z',
                }[catalogSortBy]}</Badge>
              )}
              {catalogStockFilter !== 'all' && (
                <Badge variant="secondary" className="text-[10px] gap-1 h-5">Estoque: {catalogStockFilter === 'low' ? 'Baixo' : 'Sem estoque'}</Badge>
              )}
              <button onClick={clearCatalogFilters} className="text-[10px] text-primary hover:underline ml-1">Limpar filtros</button>
            </div>
          )}

          {showProdForm && (
            <ProdutoFormPanel
              editProdId={editProdId}
              prodForm={prodForm}
              setProdForm={setProdForm}
              categorias={allCategorias}
              locais={dbLocais}
              batchMode={batchMode}
              setBatchMode={setBatchMode}
              saving={saving}
              setSaving={setSaving}
              onClose={() => { setShowProdForm(false); setEditProdId(null); }}
              onSave={(created, shouldClose) => {
                if (shouldClose) {
                  toast.success(`Produto cadastrado! SKU: ${created.sku}`);
                  setProdForm(emptyProdForm);
                  setShowProdForm(false);
                  if (activeView === 'produtos') applyCatalogFilters(catalogSearchInput, catalogCatFilter);
                } else {
                  toast.success('Item cadastrado. Pronto para cadastrar o próximo.');
                  if (activeView === 'produtos') applyCatalogFilters(catalogSearchInput, catalogCatFilter);
                }
              }}
              onUpdate={(shouldClose) => {
                toast.success('Produto atualizado!');
                setEditProdId(null);
                setProdForm(emptyProdForm);
                setShowProdForm(false);
                if (activeView === 'produtos') applyCatalogFilters(catalogSearchInput, catalogCatFilter);
              }}
              addProduto={store.addProduto}
              updateProduto={store.updateProduto}
            />
          )}

          {/* Total count + page range */}
          {prodTotalCount !== null && (
            <div className="flex items-center justify-between">
              <p className="text-[11px] text-muted-foreground">
                {prodTotalCount} {prodTotalCount === 1 ? 'item encontrado' : 'itens encontrados'}
                {prodTotalCount > ESTOQUE_PAGE && (
                  <span className="ml-1">— mostrando {prodPage * ESTOQUE_PAGE + 1}–{Math.min((prodPage + 1) * ESTOQUE_PAGE, prodTotalCount)}</span>
                )}
              </p>
            </div>
          )}

          {(() => {
            const displayList = catalogFiltered;
            return displayList.length > 0 ? (
            <>
            <div className="space-y-2">
              {displayList.map((p, i) => {
                const saldo = saldos[p.id]?.saldo ?? 0;
                const isLowStock = p.ativo && saldo > 0 && saldo <= p.estoqueMinimo;
                const isNoStock = p.ativo && saldo <= 0;
                const stockBorderClass = isNoStock ? 'border-destructive/40' : isLowStock ? 'border-warning/40' : 'border-border';
                return (
                <div key={p.id} className={`bg-card border rounded-xl p-3 animate-fade-up ${p.ativo ? stockBorderClass : 'border-border/50 opacity-60'}`} style={{ animationDelay: `${i * 30}ms` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-foreground truncate">{p.nomeProduto}</p>
                        {p.sku && <Badge variant="outline" className="text-[9px] px-1.5 py-0">{p.sku}</Badge>}
                        {!p.ativo && <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-muted text-muted-foreground">Inativo</Badge>}
                        {isNoStock && <Badge className="text-[9px] px-1.5 py-0 bg-destructive/15 text-destructive border-0">Sem estoque</Badge>}
                        {isLowStock && <Badge className="text-[9px] px-1.5 py-0 bg-warning/15 text-warning border-0">Estoque baixo</Badge>}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-muted-foreground mt-0.5">
                        <span>{p.categoria}</span>
                        <span>•</span>
                        <span>{p.unidadeMedida}</span>
                        {p.localEstoque && <><span>•</span><span>{p.localEstoque}</span></>}
                        {p.unidadeCompra && p.unidadeCompra !== p.unidadeMedida && (
                          <><span>•</span><span>Compra: {p.unidadeCompra} (×{p.fatorConversaoPadrao || 1})</span></>
                        )}
                        {p.ativo && (() => {
                          const fator = p.fatorConversaoPadrao || 1;
                          const unCompra = p.unidadeCompra || p.unidadeMedida;
                          const layers = decomposeStockLayers(saldo, fator, unCompra, p.unidadeMedida);
                          const label = layers.hasLayers ? formatStockLayers(layers) : `${saldo.toFixed(1)} ${p.unidadeMedida}`;
                          return <><span>•</span><span className={isNoStock ? 'text-destructive font-medium' : isLowStock ? 'text-warning font-medium' : ''}>{label}</span></>;
                        })()}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {p.isSalmonRawLinked && (
                        <Badge variant="outline" className="text-[8px] px-1 py-0 h-3.5 border-primary/30 text-primary mr-1">🐟 Salmão</Badge>
                      )}
                      {!p.isSalmonRawLinked && (
                        <>
                          {canEditCatalogo && (
                            <button onClick={() => {
                              const fator = p.fatorConversaoPadrao || 1;
                              const hasDual = p.unidadeCompra && p.unidadeCompra !== p.unidadeMedida;
                              setEditProdId(p.id);
                              setProdForm({
                                nomeProduto: p.nomeProduto, sku: p.sku, categoria: p.categoria,
                                unidadeMedida: p.unidadeMedida as Produto['unidadeMedida'],
                                conversoes: p.conversoes, custoPadrao: p.custoPadrao,
                                fornecedoresPreferenciais: p.fornecedoresPreferenciais,
                                leadTimeDias: p.leadTimeDias, estoqueMinimo: p.estoqueMinimo,
                                estoqueIdeal: p.estoqueIdeal, localEstoque: p.localEstoque,
                                ativo: p.ativo, observacoes: p.observacoes,
                                unidadeCompra: p.unidadeCompra || 'UN',
                                fatorConversaoPadrao: fator,
                                defaultCostPurchaseUnit: p.defaultCostPurchaseUnit || p.custoPadrao || 0,
                                minIdealMode: hasDual ? 'purchase' : 'base',
                                minPurchaseQty: hasDual && fator > 0 ? p.estoqueMinimo / fator : 0,
                                idealPurchaseQty: hasDual && fator > 0 ? p.estoqueIdeal / fator : 0,
                                inactivityDaysThreshold: p.inactivityDaysThreshold ?? '',
                                contaNoCmv: p.contaNoCmv ?? true,
                                packageQuantity: p.packageQuantity ?? null,
                                packageMeasureUnit: p.packageMeasureUnit ?? null,
                                conversionMode: p.conversionMode || 'manual',
                              });
                              setShowProdForm(true);
                            }}
                              className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary" title="Editar">
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {canCreateCatalogo && (
                            <button onClick={() => handleDuplicate(p)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary" title="Duplicar">
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary"><MoreVertical className="w-3.5 h-3.5" /></button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="text-xs">
                              {canEditCatalogo && (
                                <DropdownMenuItem onClick={() => handleToggleAtivo(p)} className="gap-2">
                                  {p.ativo ? <PowerOff className="w-3.5 h-3.5" /> : <Power className="w-3.5 h-3.5" />}
                                  {p.ativo ? 'Inativar' : 'Reativar'}
                                </DropdownMenuItem>
                              )}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-4 mt-1.5 text-[10px] text-muted-foreground flex-wrap">
                    {(() => {
                      const fator = p.fatorConversaoPadrao || 1;
                      const unCompra = p.unidadeCompra || p.unidadeMedida;
                      const showDual = unCompra !== p.unidadeMedida;
                      const minP = showDual && fator > 0 ? p.estoqueMinimo / fator : 0;
                      const idealP = showDual && fator > 0 ? p.estoqueIdeal / fator : 0;
                      return (
                        <>
                          <span>Mín: {showDual ? `${minP.toFixed(1)} ${unCompra} (${p.estoqueMinimo} ${p.unidadeMedida})` : `${p.estoqueMinimo} ${p.unidadeMedida}`}</span>
                          {p.estoqueIdeal > 0 && <span>Ideal: {showDual ? `${idealP.toFixed(1)} ${unCompra} (${p.estoqueIdeal} ${p.unidadeMedida})` : `${p.estoqueIdeal} ${p.unidadeMedida}`}</span>}
                        </>
                      );
                    })()}
                    {(() => {
                      const fator = p.fatorConversaoPadrao || 1;
                      const unCompra = p.unidadeCompra || p.unidadeMedida;
                      const origin = getCostOrigin(p);
                      const costBase = getActiveCostBase(p);
                      const costPurchase = getActiveCostPurchase(p);
                      const showDual = unCompra !== p.unidadeMedida;
                      return costBase > 0 ? (
                        <>
                          <span className="px-1 py-0 rounded bg-primary/10 text-primary font-medium">{getCostLabel(origin)}</span>
                          <span>
                            {fmtBRL(costBase)}/{p.unidadeMedida}
                            {showDual && ` • ${fmtBRL(costPurchase)}/${unCompra}`}
                          </span>
                        </>
                      ) : null;
                    })()}
                    {p.needsCostReview && <span className="text-warning font-medium">⚠️ Revisar</span>}
                  </div>
                </div>
                );
              })}
            </div>
            {/* Pagination controls */}
            {totalPages > 1 && (
              <div className="flex items-center justify-center gap-3 pt-2">
                <Button variant="outline" size="sm" className="text-xs h-8" disabled={prodPage === 0} onClick={() => store.goToProdPage(prodPage - 1)}>
                  ← Anterior
                </Button>
                <span className="text-[11px] text-muted-foreground">Página {prodPage + 1} de {totalPages}</span>
                <Button variant="outline" size="sm" className="text-xs h-8" disabled={!prodHasMore} onClick={() => store.goToProdPage(prodPage + 1)}>
                  Próxima →
                </Button>
              </div>
            )}
            </>
          ) : (
            <div className="bg-card border border-border rounded-xl p-8 text-center">
              <Package className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
              <p className="text-sm font-medium text-foreground mb-1">{hasActiveFilters ? 'Nenhum item encontrado' : 'Catálogo vazio'}</p>
              <p className="text-xs text-muted-foreground">
                {hasActiveFilters
                  ? catalogStatusFilter === 'inactive'
                    ? 'Nenhum item inativo encontrado. Ajuste os filtros.'
                    : 'Tente ajustar a busca ou os filtros.'
                  : 'Cadastre produtos com categoria, unidade, estoque mínimo e fornecedores.'}
              </p>
              {hasActiveFilters && (
                <Button variant="ghost" size="sm" className="text-xs mt-2" onClick={clearCatalogFilters}>Limpar filtros</Button>
              )}
            </div>
          );
          })()}
        </div>
      )}

      {activeView === 'simulador' && <SimuladorCompraGeral />}

      {/* ====== CADASTROS ====== */}
      {activeView === 'cadastros' && <StockCadastrosSection />}
    </div>
      <ConfirmDialog />
    </>
  );
}

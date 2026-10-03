import { useNavigationSubtab } from '@/hooks/useNavigationRequest';
import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import { useModuleBadges } from '@/contexts/ModuleBadgesContext';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { useCan, useModuleAccess } from '@/permissions';
import { ModuleNav, type ModuleNavItem } from '@/components/ui/ModuleNav';
import { isPresentationDetailTarget } from '@/lib/presentationDetailNavigation';
import { Shield, Percent } from 'lucide-react';
import {
  LayoutDashboard, FolderTree, Landmark, Receipt,
  DollarSign, TrendingUp, LayoutGrid, Settings,
  Building2, RefreshCw, CreditCard, ArrowDownToLine, Activity, BarChart3,
  Target, Bell, ClipboardList
} from 'lucide-react';
import ContasPagarSection from '@/components/financeiro/ContasPagarSection';
import ContasReceberSection from '@/components/financeiro/ContasReceberSection';
import FluxoCaixaSection, { type FluxoNavigateParams } from '@/components/financeiro/FluxoCaixaSection';
import DRESection from '@/components/financeiro/DRESection';
import DFCSection from '@/components/financeiro/DFCSection';
import DashboardFinanceiroSection, { type DashboardNavigateParams } from '@/components/financeiro/DashboardFinanceiroSection';
const CodigosPagamentoSection = lazy(() => import('@/components/financeiro/CodigosPagamentoSection'));
const OrcamentoSection = lazy(() => import('@/components/financeiro/OrcamentoSection'));
const ConciliacaoBancariaSection = lazy(() => import('@/components/financeiro/ConciliacaoBancariaSection'));
import AlertasSection from '@/components/financeiro/AlertasSection';
import RecorrenciasSection from '@/components/financeiro/RecorrenciasSection';
import CategorizacaoSection from '@/components/financeiro/CategorizacaoSection';
const BorderoSection = lazy(() => import('@/components/financeiro/BorderoSection'));
const ApresentacaoSociosSection = lazy(() => import('@/components/financeiro/ApresentacaoSociosSection'));
const ProjecaoFluxoSection = lazy(() => import('@/components/financeiro/ProjecaoFluxoSection'));
const KPIsSection = lazy(() => import('@/components/financeiro/KPIsSection'));
const AuditoriaFinSection = lazy(() => import('@/components/financeiro/AuditoriaFinSection'));
const ComparativoSection = lazy(() => import('@/components/financeiro/ComparativoSection'));
const CmvFinanceiroSection = lazy(() => import('@/components/financeiro/cmv/CmvFinanceiroSection'));
import FechamentoCaixaSection from '@/components/financeiro/FechamentoCaixaSection';
import CadastroBaseTree from '@/components/financeiro/CadastroBaseTree';
import ContasBancariasSection from '@/components/financeiro/ContasBancariasSection';
import LivroRazaoSection from '@/components/financeiro/LivroRazaoSection';
import PlanoContasFinSection from '@/components/financeiro/PlanoContasFinSection';
import CentrosCustoFinSection from '@/components/financeiro/CentrosCustoFinSection';

type FinSubTab = 'dashboard' | 'cadastros' | 'contas' | 'lancamentos' | 'pagar' | 'codigos_pagamento' | 'receber' | 'fluxo' | 'dre' | 'orcamento' | 'conciliacao' | 'alertas' | 'recorrencias' | 'categorizacao' | 'bordero' | 'apresentacao_socios' | 'projecao' | 'kpis' | 'auditoria' | 'comparativo' | 'fechamento' | 'cmv';

// DashboardFinanceiro extracted to src/components/financeiro/DashboardFinanceiroSection.tsx

// ==================== CADASTROS BASE ====================
function CadastrosBase() {
  const [subView, setSubView] = useState<'arvore' | 'plano' | 'centros'>('arvore');
  const canCreate = useCan('financeiro:cadastros:create');
  const canEdit = useCan('financeiro:cadastros:edit');
  const canDelete = useCan('financeiro:cadastros:delete');
  
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-4">
        <Button variant={subView === 'arvore' ? 'default' : 'outline'} size="sm" onClick={() => setSubView('arvore')}>Estrutura de Categorias</Button>
        <Button variant={subView === 'plano' ? 'default' : 'outline'} size="sm" onClick={() => setSubView('plano')}>Plano de Contas</Button>
        <Button variant={subView === 'centros' ? 'default' : 'outline'} size="sm" onClick={() => setSubView('centros')}>Centros de Custo</Button>
      </div>
      {subView === 'arvore' && <CadastroBaseTree />}
      {subView === 'plano' && <PlanoContasFinSection canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />}
      {subView === 'centros' && <CentrosCustoFinSection canCreate={canCreate} canEdit={canEdit} canDelete={canDelete} />}
    </div>
  );
}

// ContasBancarias extracted to src/components/financeiro/ContasBancariasSection.tsx

// LancamentosSection wrapper - LivroRazaoSection extracted to src/components/financeiro/LivroRazaoSection.tsx
function LancamentosSection({ initialContaId, initialDateFrom, initialDateTo, initialTipo }: { initialContaId?: string; initialDateFrom?: string; initialDateTo?: string; initialTipo?: string }) {
  const [innerTab, setInnerTab] = useState<'razao' | 'conciliacao'>('razao');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Button variant={innerTab === 'razao' ? 'default' : 'outline'} size="sm" onClick={() => setInnerTab('razao')}>Livro Razão</Button>
        <Button variant={innerTab === 'conciliacao' ? 'default' : 'outline'} size="sm" onClick={() => setInnerTab('conciliacao')}>Conciliação Bancária</Button>
      </div>
      {innerTab === 'razao' ? <LivroRazaoSection initialContaId={initialContaId} initialDateFrom={initialDateFrom} initialDateTo={initialDateTo} initialTipo={initialTipo} /> : <Suspense fallback={<FinSpinner />}><ConciliacaoBancariaSection /></Suspense>}
    </div>
  );
}

// ==================== DRE / DFC WRAPPER ====================
function DREDFCSection() {
  const [innerTab, setInnerTab] = useState<'dre' | 'dfc'>('dre');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Button variant={innerTab === 'dre' ? 'default' : 'outline'} size="sm" onClick={() => setInnerTab('dre')}>DRE</Button>
        <Button variant={innerTab === 'dfc' ? 'default' : 'outline'} size="sm" onClick={() => setInnerTab('dfc')}>DFC</Button>
      </div>
      {innerTab === 'dre' ? <DRESection /> : <DFCSection />}
    </div>
  );
}

// ==================== PERMISSION-GATED NO ACCESS ====================
function NoAccess({ perm }: { perm: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <Shield className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
      <p className="text-sm font-medium text-foreground">Sem Permissão</p>
      <p className="text-xs text-muted-foreground">Você não possui a permissão <code className="text-[10px] bg-muted px-1 rounded">{perm}</code>.</p>
    </div>
  );
}

function FinSpinner() {
  return (
    <div className="flex items-center justify-center py-20">
      <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
    </div>
  );
}

// ── Tab grouping ─────────────────────────────────────────────────────────────
const TAB_GROUPS = {
  dashboard:  { label: null },
  operacoes:  { label: 'Operações' },
  config:     { label: 'Configurações' },
  relatorios: { label: 'Relatórios & Análise' },
} as const;

type FinTabGroup = keyof typeof TAB_GROUPS;

const GROUP_ICONS: Partial<Record<FinTabGroup, typeof LayoutDashboard>> = {
  operacoes:  LayoutGrid,
  config:     Settings,
  relatorios: BarChart3,
};

interface FinTab {
  id: FinSubTab;
  label: string;
  icon: typeof LayoutDashboard;
  badge?: number;
  group: FinTabGroup;
}

// Map internal FinSubTab ids to registry subtab keys
const TAB_REGISTRY_MAP: Record<FinSubTab, string> = {
  dashboard: 'dashboard',
  fechamento: 'fechamento',
  cadastros: 'cadastros',
  contas: 'contas',
  lancamentos: 'lancamentos',
  pagar: 'pagar',
  codigos_pagamento: 'pagar', // Mesma autorização e fonte de Contas a Pagar.
  receber: 'receber',
  fluxo: 'fluxo',
  dre: 'dre',
  orcamento: 'orcamento',
  conciliacao: 'conciliacao',
  alertas: 'alertas',
  recorrencias: 'recorrencias',
  categorizacao: 'categorizacao',
  // Borderô (antigo Relatório Sócios) e Apresentação Sócios compartilham o mesmo contrato RBAC.
  bordero: 'relatorio-socios',
  apresentacao_socios: 'relatorio-socios',
  projecao: 'projecao',
  kpis: 'kpis',
  auditoria: 'auditoria',
  comparativo: 'comparativo',
  cmv: 'cmv',
};

// ==================== MAIN VIEW ====================
export default function FinanceiroView() {
  const [activeTab, setActiveTab] = usePersistedTab<FinSubTab>('app:tab:financeiro', 'dashboard');
  const [extratoContaId, setExtratoContaId] = useState<string | undefined>(undefined);
  const [fluxoDateFrom, setFluxoDateFrom] = useState<string | undefined>(undefined);
  const [fluxoDateTo, setFluxoDateTo] = useState<string | undefined>(undefined);
  const [lancamentosInitialTipo, setLancamentosInitialTipo] = useState<string | undefined>(undefined);
  const [pagarInitialStatus, setPagarInitialStatus] = useState<string | undefined>(undefined);
  const [receberInitialStatus, setReceberInitialStatus] = useState<string | undefined>(undefined);
  const { visibleSubtabs } = useModuleAccess('financeiro');
  const location = useLocation();
  const navigate = useNavigate();
  const { detail } = useParams<{ detail?: string }>();
  const detailTarget = isPresentationDetailTarget(detail) ? detail : undefined;

  useEffect(() => {
    if (location.pathname.startsWith('/financeiro/apresentacao-socios')) {
      setActiveTab('apresentacao_socios');
    } else if (location.pathname === '/financeiro/bordero') {
      setActiveTab('bordero');
    }
  }, [location.pathname, setActiveTab]);

  const handleTabSelect = useCallback((tab: FinSubTab) => {
    const sociosRoute = location.pathname.startsWith('/financeiro/bordero')
      || location.pathname.startsWith('/financeiro/relatorio-socios')
      || location.pathname.startsWith('/financeiro/apresentacao-socios');
    if (tab === 'bordero') navigate('/financeiro/bordero');
    else if (tab === 'apresentacao_socios') navigate('/financeiro/apresentacao-socios');
    else if (sociosRoute) navigate('/');
    setActiveTab(tab);
  }, [location.pathname, navigate, setActiveTab]);

  useNavigationSubtab('financeiro', subtab => {
    if (subtab === 'pagar' && visibleSubtabs.includes('pagar')) handleTabSelect('pagar');
  });

  // Contas a Pagar pending count — mesma fonte do menu lateral
  const moduleBadges = useModuleBadges();
  const pagarPendingCount = moduleBadges.counts.financeiro.pagar;
  const refreshBadges = moduleBadges.refresh;
  useEffect(() => { refreshBadges(); }, [activeTab, refreshBadges]);

  // Handle "Ver extrato" navigation from ContasBancarias
  const handleNavigateExtrato = useCallback((contaId: string) => {
    setExtratoContaId(contaId);
    setActiveTab('lancamentos');
  }, [setActiveTab]);

  // Handle navigation from Fluxo de Caixa
  const handleFluxoNavigate = useCallback((params: FluxoNavigateParams) => {
    setFluxoDateFrom(params.dateFrom);
    setFluxoDateTo(params.dateTo);
    setActiveTab(params.tab as FinSubTab);
  }, [setActiveTab]);

  // Handle navigation from cards do Dashboard Financeiro, levando o filtro do card ao sub-módulo
  const handleDashboardNavigate = useCallback((params: DashboardNavigateParams) => {
    setFluxoDateFrom(params.dateFrom);
    setFluxoDateTo(params.dateTo);
    setLancamentosInitialTipo(params.tipo);
    setPagarInitialStatus(params.tab === 'pagar' ? params.status : undefined);
    setReceberInitialStatus(params.tab === 'receber' ? params.status : undefined);
    setActiveTab(params.tab as FinSubTab);
  }, [setActiveTab]);

  // Clear filters when navigating away
  useEffect(() => {
    if (activeTab !== 'lancamentos') {
      setExtratoContaId(undefined);
      setFluxoDateFrom(undefined);
      setFluxoDateTo(undefined);
      setLancamentosInitialTipo(undefined);
    }
    if (activeTab !== 'pagar') setPagarInitialStatus(undefined);
    if (activeTab !== 'receber') setReceberInitialStatus(undefined);
  }, [activeTab]);

  const allTabs = useMemo<FinTab[]>(() => [
    { id: 'dashboard',        label: 'Dashboard',           icon: LayoutDashboard, group: 'dashboard'  },
    // Operações
    { id: 'fechamento',       label: 'Fechamento de Caixa', icon: DollarSign,      group: 'operacoes'  },
    { id: 'lancamentos',      label: 'Lançamentos',          icon: Receipt,         group: 'operacoes'  },
    { id: 'pagar',            label: 'Contas a Pagar',       icon: CreditCard,      group: 'operacoes', badge: pagarPendingCount || undefined },
    { id: 'codigos_pagamento', label: 'Códigos de Pagamento', icon: ClipboardList, group: 'operacoes' },
    { id: 'receber',          label: 'Contas a Receber',     icon: ArrowDownToLine, group: 'operacoes'  },
    { id: 'alertas',          label: 'Alertas',              icon: Bell,            group: 'operacoes'  },
    { id: 'recorrencias',     label: 'Recorrências',         icon: RefreshCw,       group: 'operacoes'  },
    // Configurações
    { id: 'cadastros',        label: 'Cadastros Base',       icon: FolderTree,      group: 'config'     },
    { id: 'contas',           label: 'Contas Bancárias',     icon: Landmark,        group: 'config'     },
    { id: 'categorizacao',    label: 'Categorização',        icon: FolderTree,      group: 'config'     },
    // Relatórios & Análise
    { id: 'fluxo',            label: 'Fluxo de Caixa',       icon: Activity,        group: 'relatorios' },
    { id: 'dre',              label: 'DRE / DFC',            icon: BarChart3,       group: 'relatorios' },
    { id: 'orcamento',        label: 'Orçamento',            icon: Target,          group: 'relatorios' },
    { id: 'projecao',         label: 'Projeção',             icon: TrendingUp,      group: 'relatorios' },
    { id: 'kpis',             label: 'KPIs',                 icon: BarChart3,       group: 'relatorios' },
    { id: 'cmv',              label: 'CMV',                  icon: Percent,         group: 'relatorios' },
    { id: 'bordero',          label: 'Borderô',              icon: ClipboardList,   group: 'relatorios' },
    { id: 'apresentacao_socios', label: 'Apresentação Sócios', icon: BarChart3,     group: 'relatorios' },
    { id: 'comparativo',      label: 'Comparativo',          icon: Activity,        group: 'relatorios' },
    { id: 'auditoria',        label: 'Auditoria',            icon: Building2,       group: 'relatorios' },
  ], [pagarPendingCount]);

  // Filter tabs by permission
  const tabs = useMemo(() => {
    return allTabs.filter(tab => {
      const registryKey = TAB_REGISTRY_MAP[tab.id];
      return visibleSubtabs.includes(registryKey);
    });
  }, [allTabs, visibleSubtabs]);

  // Group the RBAC-filtered tabs for rendering
  const groupedTabs = useMemo(() => {
    const order: FinTabGroup[] = [];
    const map = new Map<FinTabGroup, typeof tabs>();
    for (const tab of tabs) {
      if (!map.has(tab.group)) {
        order.push(tab.group);
        map.set(tab.group, []);
      }
      map.get(tab.group)!.push(tab);
    }
    return order.map(g => ({ group: g, meta: TAB_GROUPS[g], tabs: map.get(g)! }));
  }, [tabs]);

  // If active tab is not visible, switch to first visible
  const effectiveTab = useMemo(() => {
    // Aba persistida antes do rename Relatório Sócios → Borderô.
    const current = (activeTab as string) === 'relatorio_socios' ? 'bordero' : activeTab;
    if (tabs.some(t => t.id === current)) return current;
    return tabs[0]?.id || 'dashboard';
  }, [tabs, activeTab]);

  // Módulo nav: item simples para Dashboard, um item com dropdown por grupo
  const moduleNavItems = useMemo<ModuleNavItem<FinSubTab>[]>(() => {
    const items: ModuleNavItem<FinSubTab>[] = [];
    const dashboardTab = groupedTabs.find(g => g.group === 'dashboard')?.tabs[0];
    if (dashboardTab) {
      items.push({ id: dashboardTab.id, label: dashboardTab.label, icon: dashboardTab.icon });
    }
    groupedTabs
      .filter(g => g.group !== 'dashboard')
      .forEach(({ group, meta, tabs: groupTabs }) => {
        items.push({
          id: group,
          label: meta.label ?? group,
          icon: GROUP_ICONS[group] ?? LayoutGrid,
          children: groupTabs,
        });
      });
    return items;
  }, [groupedTabs]);

  if (tabs.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <Shield className="w-12 h-12 mx-auto text-destructive/30 mb-3" />
        <p className="text-sm font-medium text-foreground">Acesso Negado</p>
        <p className="text-xs text-muted-foreground">Você não possui permissões para acessar o módulo Financeiro.</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-1">
        <DollarSign className="w-5 h-5 text-primary" />
        <h1 className="text-lg font-bold text-foreground">Financeiro</h1>
      </div>

      {/* ── Navegação do módulo ── */}
      <ModuleNav items={moduleNavItems} value={effectiveTab} onChange={handleTabSelect} />

      {/* ── Conteúdo ── */}
      {effectiveTab === 'dashboard' && <DashboardFinanceiroSection onNavigate={handleDashboardNavigate} />}
      {effectiveTab === 'fechamento' && <FechamentoCaixaSection />}
      {effectiveTab === 'cadastros' && <CadastrosBase />}
      {effectiveTab === 'contas' && <ContasBancariasSection onNavigateExtrato={handleNavigateExtrato} />}
      {effectiveTab === 'lancamentos' && <LancamentosSection initialContaId={extratoContaId} initialDateFrom={fluxoDateFrom} initialDateTo={fluxoDateTo} initialTipo={lancamentosInitialTipo} />}
      {effectiveTab === 'pagar' && <ContasPagarSection initialStatus={pagarInitialStatus} />}
      {effectiveTab === 'codigos_pagamento' && <Suspense fallback={<FinSpinner />}><CodigosPagamentoSection /></Suspense>}
      {effectiveTab === 'receber' && <ContasReceberSection initialStatus={receberInitialStatus} />}
      {effectiveTab === 'fluxo' && <FluxoCaixaSection onNavigate={handleFluxoNavigate} />}
      {effectiveTab === 'dre' && <DREDFCSection />}
      {effectiveTab === 'orcamento' && <Suspense fallback={<FinSpinner />}><OrcamentoSection /></Suspense>}
      {/* conciliacao está dentro de LancamentosSection */}
      {effectiveTab === 'alertas' && <AlertasSection onNavigate={(t) => setActiveTab(t as FinSubTab)} />}
      {effectiveTab === 'recorrencias' && <RecorrenciasSection onNavigate={(t) => setActiveTab(t as FinSubTab)} />}
      {effectiveTab === 'categorizacao' && <CategorizacaoSection />}
      {effectiveTab === 'bordero' && <Suspense fallback={<FinSpinner />}><BorderoSection /></Suspense>}
      {effectiveTab === 'apresentacao_socios' && (
        <Suspense fallback={<FinSpinner />}>
          <ApresentacaoSociosSection
            detailTarget={detailTarget}
            invalidDetail={Boolean(detail && !detailTarget)}
          />
        </Suspense>
      )}
      {effectiveTab === 'projecao' && <Suspense fallback={<FinSpinner />}><ProjecaoFluxoSection /></Suspense>}
      {effectiveTab === 'kpis' && <Suspense fallback={<FinSpinner />}><KPIsSection /></Suspense>}
      {effectiveTab === 'auditoria' && <Suspense fallback={<FinSpinner />}><AuditoriaFinSection /></Suspense>}
      {effectiveTab === 'comparativo' && <Suspense fallback={<FinSpinner />}><ComparativoSection /></Suspense>}
      {effectiveTab === 'cmv' && <Suspense fallback={<FinSpinner />}><CmvFinanceiroSection /></Suspense>}
    </div>
  );
}

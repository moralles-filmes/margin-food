import { useState, useEffect, useMemo, useCallback, lazy, Suspense } from 'react';
import SubTabBadge from '@/components/ui/SubTabBadge';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useCan, useModuleAccess } from '@/permissions';
import { Shield } from 'lucide-react';
import {
  LayoutDashboard, FolderTree, Landmark, Receipt,
  DollarSign, TrendingUp,
  Building2, RefreshCw, CreditCard, ArrowDownToLine, Activity, BarChart3,
  Target, Bell
} from 'lucide-react';
import ContasPagarSection from '@/components/financeiro/ContasPagarSection';
import ContasReceberSection from '@/components/financeiro/ContasReceberSection';
import FluxoCaixaSection, { type FluxoNavigateParams } from '@/components/financeiro/FluxoCaixaSection';
import DRESection from '@/components/financeiro/DRESection';
import DFCSection from '@/components/financeiro/DFCSection';
import DashboardFinanceiroSection from '@/components/financeiro/DashboardFinanceiroSection';
const OrcamentoSection = lazy(() => import('@/components/financeiro/OrcamentoSection'));
const ConciliacaoBancariaSection = lazy(() => import('@/components/financeiro/ConciliacaoBancariaSection'));
import AlertasSection from '@/components/financeiro/AlertasSection';
import RecorrenciasSection from '@/components/financeiro/RecorrenciasSection';
import CategorizacaoSection from '@/components/financeiro/CategorizacaoSection';
const RelatorioSociosSection = lazy(() => import('@/components/financeiro/RelatorioSociosSection'));
const ProjecaoFluxoSection = lazy(() => import('@/components/financeiro/ProjecaoFluxoSection'));
const KPIsSection = lazy(() => import('@/components/financeiro/KPIsSection'));
const AuditoriaFinSection = lazy(() => import('@/components/financeiro/AuditoriaFinSection'));
const ComparativoSection = lazy(() => import('@/components/financeiro/ComparativoSection'));
import FechamentoCaixaSection from '@/components/financeiro/FechamentoCaixaSection';
import CadastroBaseTree from '@/components/financeiro/CadastroBaseTree';
import ContasBancariasSection from '@/components/financeiro/ContasBancariasSection';
import LivroRazaoSection from '@/components/financeiro/LivroRazaoSection';
import CategoriasFinSection from '@/components/financeiro/CategoriasFinSection';
import PlanoContasFinSection from '@/components/financeiro/PlanoContasFinSection';
import CentrosCustoFinSection from '@/components/financeiro/CentrosCustoFinSection';

type FinSubTab = 'dashboard' | 'cadastros' | 'contas' | 'lancamentos' | 'pagar' | 'receber' | 'fluxo' | 'dre' | 'orcamento' | 'conciliacao' | 'alertas' | 'recorrencias' | 'categorizacao' | 'relatorio_socios' | 'projecao' | 'kpis' | 'auditoria' | 'comparativo' | 'fechamento';

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
function LancamentosSection({ initialContaId, initialDateFrom, initialDateTo }: { initialContaId?: string; initialDateFrom?: string; initialDateTo?: string }) {
  const [innerTab, setInnerTab] = useState<'razao' | 'conciliacao'>('razao');
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 mb-2">
        <Button variant={innerTab === 'razao' ? 'default' : 'outline'} size="sm" onClick={() => setInnerTab('razao')}>Livro Razão</Button>
        <Button variant={innerTab === 'conciliacao' ? 'default' : 'outline'} size="sm" onClick={() => setInnerTab('conciliacao')}>Conciliação Bancária</Button>
      </div>
      {innerTab === 'razao' ? <LivroRazaoSection initialContaId={initialContaId} initialDateFrom={initialDateFrom} initialDateTo={initialDateTo} /> : <Suspense fallback={<FinSpinner />}><ConciliacaoBancariaSection /></Suspense>}
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

// Map internal FinSubTab ids to registry subtab keys
const TAB_REGISTRY_MAP: Record<FinSubTab, string> = {
  dashboard: 'dashboard',
  fechamento: 'fechamento',
  cadastros: 'cadastros',
  contas: 'contas',
  lancamentos: 'lancamentos',
  pagar: 'pagar',
  receber: 'receber',
  fluxo: 'fluxo',
  dre: 'dre',
  orcamento: 'orcamento',
  conciliacao: 'conciliacao',
  alertas: 'alertas',
  recorrencias: 'recorrencias',
  categorizacao: 'categorizacao',
  relatorio_socios: 'relatorio-socios',
  projecao: 'projecao',
  kpis: 'kpis',
  auditoria: 'auditoria',
  comparativo: 'comparativo',
};

// ==================== MAIN VIEW ====================
export default function FinanceiroView() {
  const [activeTab, setActiveTab] = usePersistedTab<FinSubTab>('app:tab:financeiro', 'dashboard');
  const [extratoContaId, setExtratoContaId] = useState<string | undefined>(undefined);
  const [fluxoDateFrom, setFluxoDateFrom] = useState<string | undefined>(undefined);
  const [fluxoDateTo, setFluxoDateTo] = useState<string | undefined>(undefined);
  const { visibleSubtabs } = useModuleAccess('financeiro');

  // Contas a Pagar pending count
  const [pagarPendingCount, setPagarPendingCount] = useState(0);
  useEffect(() => {
    supabase
      .from('fin_contas_pagar')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pendente', 'vencido'])
      .then(({ count }) => setPagarPendingCount(count ?? 0));
  }, [activeTab]);

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

  // Clear filters when navigating away
  useEffect(() => {
    if (activeTab !== 'lancamentos') {
      setExtratoContaId(undefined);
      setFluxoDateFrom(undefined);
      setFluxoDateTo(undefined);
    }
  }, [activeTab]);

  const allTabs: { id: FinSubTab; label: string; icon: typeof LayoutDashboard; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'fechamento', label: 'Fechamento de Caixa', icon: DollarSign },
    { id: 'cadastros', label: 'Cadastros Base', icon: FolderTree },
    { id: 'contas', label: 'Contas Bancárias', icon: Landmark },
    { id: 'lancamentos', label: 'Lançamentos', icon: Receipt },
    { id: 'pagar', label: 'Contas a Pagar', icon: CreditCard, badge: pagarPendingCount || undefined },
    { id: 'receber', label: 'Contas a Receber', icon: ArrowDownToLine },
    { id: 'fluxo', label: 'Fluxo de Caixa', icon: Activity },
    { id: 'dre', label: 'DRE / DFC', icon: BarChart3 },
    { id: 'orcamento', label: 'Orçamento', icon: Target },
    // conciliacao moved inside Lançamentos
    { id: 'alertas', label: 'Alertas', icon: Bell },
    { id: 'recorrencias', label: 'Recorrências', icon: RefreshCw },
    { id: 'categorizacao', label: 'Categorização', icon: FolderTree },
    { id: 'relatorio_socios', label: 'Relatório Sócios', icon: BarChart3 },
    { id: 'projecao', label: 'Projeção', icon: TrendingUp },
    { id: 'kpis', label: 'KPIs', icon: BarChart3 },
    { id: 'auditoria', label: 'Auditoria', icon: Building2 },
    { id: 'comparativo', label: 'Comparativo', icon: Activity },
  ];

  // Filter tabs by permission
  const tabs = useMemo(() => {
    return allTabs.filter(tab => {
      const registryKey = TAB_REGISTRY_MAP[tab.id];
      return visibleSubtabs.includes(registryKey);
    });
  }, [visibleSubtabs]);

  // If active tab is not visible, switch to first visible
  const effectiveTab = useMemo(() => {
    if (tabs.some(t => t.id === activeTab)) return activeTab;
    return tabs[0]?.id || 'dashboard';
  }, [tabs, activeTab]);

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

      <Tabs value={effectiveTab} onValueChange={v => setActiveTab(v as FinSubTab)}>
        <TabsList className="flex flex-wrap h-auto gap-1 bg-muted/50 p-1">
          {tabs.map(tab => {
            const Icon = tab.icon;
            return (
              <TabsTrigger key={tab.id} value={tab.id} className="flex items-center gap-1.5 text-xs data-[state=active]:bg-background relative">
                <Icon className="w-3.5 h-3.5" />
                {tab.label}
                <SubTabBadge count={tab.badge} />
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="dashboard"><DashboardFinanceiroSection onNavigate={setActiveTab} /></TabsContent>
        <TabsContent value="fechamento"><FechamentoCaixaSection /></TabsContent>
        <TabsContent value="cadastros"><CadastrosBase /></TabsContent>
        <TabsContent value="contas"><ContasBancariasSection onNavigateExtrato={handleNavigateExtrato} /></TabsContent>
        <TabsContent value="lancamentos"><LancamentosSection initialContaId={extratoContaId} initialDateFrom={fluxoDateFrom} initialDateTo={fluxoDateTo} /></TabsContent>
        <TabsContent value="pagar"><ContasPagarSection /></TabsContent>
        <TabsContent value="receber"><ContasReceberSection /></TabsContent>
        <TabsContent value="fluxo"><FluxoCaixaSection onNavigate={handleFluxoNavigate} /></TabsContent>
        <TabsContent value="dre"><DREDFCSection /></TabsContent>
        <TabsContent value="orcamento"><Suspense fallback={<FinSpinner />}><OrcamentoSection /></Suspense></TabsContent>
        {/* conciliacao now inside LancamentosSection */}
        <TabsContent value="alertas"><AlertasSection onNavigate={(t) => setActiveTab(t as FinSubTab)} /></TabsContent>
        <TabsContent value="recorrencias"><RecorrenciasSection onNavigate={(t) => setActiveTab(t as FinSubTab)} /></TabsContent>
        <TabsContent value="categorizacao"><CategorizacaoSection /></TabsContent>
        <TabsContent value="relatorio_socios"><Suspense fallback={<FinSpinner />}><RelatorioSociosSection /></Suspense></TabsContent>
        <TabsContent value="projecao"><Suspense fallback={<FinSpinner />}><ProjecaoFluxoSection /></Suspense></TabsContent>
        <TabsContent value="kpis"><Suspense fallback={<FinSpinner />}><KPIsSection /></Suspense></TabsContent>
        <TabsContent value="auditoria"><Suspense fallback={<FinSpinner />}><AuditoriaFinSection /></Suspense></TabsContent>
        <TabsContent value="comparativo"><Suspense fallback={<FinSpinner />}><ComparativoSection /></Suspense></TabsContent>
      </Tabs>
    </div>
  );
}

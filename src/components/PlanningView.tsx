import { useState, useEffect, useMemo } from 'react';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { useEstoqueGeralStore } from '@/hooks/useEstoqueGeralStore';
import { usePlanningStore } from '@/hooks/usePlanningStore';
import { useModuleAccess, useCan } from '@/permissions/hooks';
import { SalmonEntry } from '@/types/salmon';
import { formatInBR, formatDateBR } from '@/lib/datetime';
import { ChevronDown, ChevronUp, Expand, Shrink, Filter, Loader2, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import MetaCompraCard from './MetaCompraCard';
import WeeklyBreakdown from './WeeklyBreakdown';
import PurchaseRadar from './PurchaseRadar';
import SimuladorCompra from './SimuladorCompra';
import PlanningProjecaoCard from './PlanningProjecaoCard';
import BudgetPressure from './BudgetPressure';

interface PlanningViewProps {
  store: ReturnType<typeof useSalmonStore>;
  estoqueStore?: ReturnType<typeof useEstoqueGeralStore>;
}

const MONTHS = [
  { value: '01', label: 'Janeiro' }, { value: '02', label: 'Fevereiro' },
  { value: '03', label: 'Março' }, { value: '04', label: 'Abril' },
  { value: '05', label: 'Maio' }, { value: '06', label: 'Junho' },
  { value: '07', label: 'Julho' }, { value: '08', label: 'Agosto' },
  { value: '09', label: 'Setembro' }, { value: '10', label: 'Outubro' },
  { value: '11', label: 'Novembro' }, { value: '12', label: 'Dezembro' },
];

function getYearOptions() {
  const currentStr = formatDateBR();
  const current = parseInt(currentStr.split('-')[0]);
  return [current - 1, current, current + 1].map(y => ({ value: String(y), label: String(y) }));
}

type SourceFilter = 'tudo' | 'salmao' | 'geral';

const SECTION_TO_SUBTAB: Record<string, string> = {
  meta: 'meta-compras',
  projecao: 'projecao',
  semanal: 'ritmo',
  pressao: 'pressao',
  radar: 'radar',
  simulador: 'simulador',
};

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-20 text-center space-y-3">
      <ShieldAlert className="w-10 h-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground">Você não tem permissão para acessar o Planejamento.</p>
    </div>
  );
}

function buildGeneralEntries(estoqueStore: ReturnType<typeof useEstoqueGeralStore>): SalmonEntry[] {
  const { movimentacoes, produtos } = estoqueStore;
  return movimentacoes
    .filter(m => m.tipo === 'ENTRADA')
    .map(m => {
      const prod = produtos.find(p => p.id === m.produtoId && p.ativo);
      return {
        id: m.id, date: m.data, lot: '', sif: '', supplier: m.origem || '',
        totalValue: m.custoTotal, pricePerKg: m.custoUnitario,
        boxes: 0, units: 0, grossKg: m.quantidade, notes: m.observacao,
        createdAt: m.createdAt,
        _categoria: prod?.categoria || 'Geral',
      } as SalmonEntry & { _categoria: string };
    });
}

export default function PlanningView({ store, estoqueStore }: PlanningViewProps) {
  const { entries: salmonEntries, activeSuppliers } = store;
  const planningStore = usePlanningStore();

  // ── RBAC (all hooks before any conditional return) ──
  const { visibleSubtabs, canView } = useModuleAccess('planning');
  const canEditMeta = useCan('planning:meta-compras:edit');

  const nowStr = formatDateBR(); // yyyy-MM-dd BR timezone
  const [nowY, nowM] = nowStr.split('-');
  const [selectedMonth, setSelectedMonth] = useState(nowM);
  const [selectedYear, setSelectedYear] = useState(nowY);
  const [showSimulador, setShowSimulador] = useState(false);
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('tudo');
  const [categoryFilter, setCategoryFilter] = useState<string>('todas');
  const [allExpanded, setAllExpanded] = useState(false);
  const [openSections, setOpenSections] = useState<Record<string, boolean>>({
    meta: true, projecao: true, semanal: false, pressao: false, radar: false, simulador: false,
  });

  const targetMonth = `${selectedYear}-${selectedMonth}`;
  const monthLabel = formatInBR(new Date(parseInt(selectedYear), parseInt(selectedMonth) - 1), 'MMMM yyyy');

  useEffect(() => {
    planningStore.fetchMetas(parseInt(selectedYear));
  }, [selectedYear, selectedMonth]);

  useEffect(() => {
    planningStore.fetchSpendSummary(
      parseInt(selectedYear),
      parseInt(selectedMonth),
      sourceFilter === 'tudo' ? null : sourceFilter,
      categoryFilter !== 'todas' ? categoryFilter : null
    );
  }, [selectedYear, selectedMonth, sourceFilter, categoryFilter]);

  const generalEntries = useMemo(() => estoqueStore ? buildGeneralEntries(estoqueStore) : [], [estoqueStore?.movimentacoes, estoqueStore?.produtos]);

  const filteredEntries: (SalmonEntry & { _categoria?: string })[] = useMemo(() => {
    let result: (SalmonEntry & { _categoria?: string })[] = [];
    if (sourceFilter === 'salmao' || sourceFilter === 'tudo') {
      result = [...result, ...salmonEntries.map(e => ({ ...e, _categoria: 'salmao' }))];
    }
    if (sourceFilter === 'geral' || sourceFilter === 'tudo') {
      let gEntries = generalEntries;
      if (categoryFilter !== 'todas' && sourceFilter !== 'tudo') {
        gEntries = generalEntries.filter(e => (e as SalmonEntry & { _categoria?: string })._categoria === categoryFilter);
      }
      result = [...result, ...gEntries];
    }
    return result;
  }, [sourceFilter, categoryFilter, salmonEntries, generalEntries]);

  const availableCategories = useMemo(() => {
    if (planningStore.spendSummary?.realizado_por_categoria?.length) {
      const cats = planningStore.spendSummary.realizado_por_categoria.map(r => r.categoria);
      return ['todas', ...cats.sort()];
    }
    const cats = new Set<string>();
    generalEntries.forEach(e => { const cat = (e as SalmonEntry & { _categoria?: string })._categoria; if (cat) cats.add(cat); });
    return ['todas', ...Array.from(cats).sort()];
  }, [generalEntries, planningStore.spendSummary]);

  const activeCategoria = useMemo(() => {
    if (sourceFilter === 'salmao') return 'salmao';
    if (sourceFilter === 'geral' && categoryFilter !== 'todas') return categoryFilter;
    if (sourceFilter === 'geral') return 'geral';
    return 'tudo';
  }, [sourceFilter, categoryFilter]);

  const handleSaveMeta = async (data: any) => {
    await planningStore.saveMeta(data);
    planningStore.fetchSpendSummary(
      parseInt(selectedYear),
      parseInt(selectedMonth),
      sourceFilter === 'tudo' ? null : sourceFilter,
      categoryFilter !== 'todas' ? categoryFilter : null
    );
  };

  const serverGastoMes = planningStore.spendSummary?.realizado_total ?? 0;

  const toggleAll = () => {
    const next = !allExpanded;
    setAllExpanded(next);
    setOpenSections({ meta: next, projecao: next, semanal: next, pressao: next, radar: next, simulador: next });
  };

  const toggleSection = (key: string) => {
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));
  };

  // ── RBAC gate (after all hooks) ──
  if (!canView) return <NoAccess />;

  // Build sections, filter by visible subtabs
  const allSections = [
    {
      key: 'meta',
      title: `Meta de Compras — ${activeCategoria === 'tudo' ? 'Consolidado' : activeCategoria === 'salmao' ? 'Salmão' : activeCategoria === 'geral' ? 'Estoque Geral' : activeCategoria}`,
      content: (
        <MetaCompraCard
          entries={filteredEntries}
          metas={planningStore.metasCompra}
          onSaveMeta={handleSaveMeta}
          targetMonth={targetMonth}
          periodIsMonth
          categoria={activeCategoria}
          canManage={canEditMeta}
          saving={planningStore.saving}
          serverGasto={serverGastoMes}
          spendLoading={planningStore.spendLoading}
        />
      ),
    },
    {
      key: 'projecao', title: 'Projeção Mensal',
      content: <PlanningProjecaoCard entries={filteredEntries} metasCompra={planningStore.metasCompra} targetMonth={targetMonth} categoria={activeCategoria} serverGasto={serverGastoMes} />,
    },
    {
      key: 'semanal', title: 'Ritmo Semanal (W1–W5)',
      content: <WeeklyBreakdown entries={filteredEntries} metas={planningStore.metasCompra} targetMonth={targetMonth} categoria={activeCategoria} serverWeekly={planningStore.spendSummary?.weekly_breakdown} />,
    },
    {
      key: 'pressao', title: 'Pressão Orçamentária',
      content: <BudgetPressure entries={filteredEntries} targetMonth={targetMonth} metas={planningStore.metasCompra} categoria={activeCategoria} />,
    },
    {
      key: 'radar', title: 'Radar de Compras',
      content: <PurchaseRadar entries={filteredEntries} targetMonth={targetMonth} metas={planningStore.metasCompra} categoria={activeCategoria} />,
    },
    {
      key: 'simulador', title: 'Simulador de Compras',
      content: (
        <div className="bg-card border border-primary/20 rounded-xl p-5 space-y-3 animate-fade-up">
          <p className="text-sm text-foreground font-medium">Simule uma compra e veja impacto antes de salvar.</p>
          <p className="text-xs text-muted-foreground">Teste cenários hipotéticos para meta, projeção e ritmo semanal.</p>
          <Button onClick={() => setShowSimulador(true)} className="gradient-salmon text-primary-foreground border-0 gap-1.5">
            Simular compra
          </Button>
        </div>
      ),
    },
  ];

  const sections = allSections.filter(s => {
    const subtabKey = SECTION_TO_SUBTAB[s.key];
    return subtabKey && visibleSubtabs.includes(subtabKey);
  });

  if (sections.length === 0) return <NoAccess />;

  return (
    <div className="space-y-0">
      <div className="sticky top-0 z-40 -mx-4 px-4 pt-0 pb-3 bg-background/95 backdrop-blur-sm border-b border-border/50 space-y-3">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Planejamento</h2>
          <p className="text-xs text-muted-foreground">Controle de compras por categoria, metas e projeções</p>
        </div>

        <div className="flex items-center gap-2">
          <Select value={selectedMonth} onValueChange={setSelectedMonth}>
            <SelectTrigger className="w-[130px] h-8 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={m.value}>{m.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={selectedYear} onValueChange={setSelectedYear}>
            <SelectTrigger className="w-[90px] h-8 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>{getYearOptions().map(y => <SelectItem key={y.value} value={y.value}>{y.label}</SelectItem>)}</SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground ml-auto capitalize">{monthLabel}</span>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-3.5 h-3.5 text-muted-foreground" />
          <Select value={sourceFilter} onValueChange={(v) => { setSourceFilter(v as SourceFilter); setCategoryFilter('todas'); }}>
            <SelectTrigger className="w-[110px] h-7 text-[11px] bg-secondary border-border"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="tudo">🔄 Tudo</SelectItem>
              <SelectItem value="salmao">🐟 Salmão</SelectItem>
              <SelectItem value="geral">📦 Geral</SelectItem>
            </SelectContent>
          </Select>

          {sourceFilter === 'geral' && availableCategories.length > 1 && (
            <Select value={categoryFilter} onValueChange={setCategoryFilter}>
              <SelectTrigger className="w-[120px] h-7 text-[11px] bg-secondary border-border"><SelectValue /></SelectTrigger>
              <SelectContent>
                {availableCategories.map(c => <SelectItem key={c} value={c}>{c === 'todas' ? 'Todas categorias' : c}</SelectItem>)}
              </SelectContent>
            </Select>
          )}

          {planningStore.spendLoading && (
            <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />
          )}
        </div>

        {planningStore.spendError && (
          <div className="flex items-center gap-2 text-[11px] text-destructive bg-destructive/10 rounded-lg px-3 py-1.5">
            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
            <span className="flex-1">{planningStore.spendError}</span>
            <Button variant="ghost" size="sm" className="h-5 px-2 text-[10px]" onClick={() => planningStore.fetchSpendSummary(
              parseInt(selectedYear), parseInt(selectedMonth),
              sourceFilter === 'tudo' ? null : sourceFilter,
              categoryFilter !== 'todas' ? categoryFilter : null
            )}>Tentar novamente</Button>
          </div>
        )}

        <div className="lg:hidden">
          <Button variant="ghost" size="sm" className="text-xs text-muted-foreground gap-1" onClick={toggleAll}>
            {allExpanded ? <Shrink className="w-3.5 h-3.5" /> : <Expand className="w-3.5 h-3.5" />}
            {allExpanded ? 'Recolher tudo' : 'Expandir tudo'}
          </Button>
        </div>
      </div>

      <div className="hidden lg:grid lg:grid-cols-5 lg:gap-4 pt-4">
        <div className="lg:col-span-3 space-y-4">
          {sections.filter(s => ['meta', 'projecao', 'semanal'].includes(s.key)).map(s => (
            <div key={s.key} className="animate-fade-up">{s.content}</div>
          ))}
        </div>
        <div className="lg:col-span-2 space-y-4">
          {sections.filter(s => ['pressao', 'radar', 'simulador'].includes(s.key)).map(s => (
            <div key={s.key} className="animate-fade-up">{s.content}</div>
          ))}
        </div>
      </div>

      <div className="lg:hidden space-y-2 pt-3">
        {sections.map(s => (
          <Collapsible key={s.key} open={openSections[s.key]} onOpenChange={() => toggleSection(s.key)}>
            <CollapsibleTrigger asChild>
              <button className="w-full flex items-center justify-between bg-card border border-border rounded-xl px-4 py-3 text-left transition-colors hover:bg-secondary/50">
                <span className="text-sm font-semibold text-foreground">{s.title}</span>
                {openSections[s.key] ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2 animate-fade-up">{s.content}</CollapsibleContent>
          </Collapsible>
        ))}
      </div>

      <SimuladorCompra
        open={showSimulador}
        onClose={() => setShowSimulador(false)}
        entries={filteredEntries}
        metas={planningStore.metasCompra}
        activeSuppliers={activeSuppliers}
        targetMonth={targetMonth}
      />
    </div>
  );
}

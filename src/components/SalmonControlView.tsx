import { useState } from 'react';
import { usePersistedTab } from '@/hooks/usePersistedTab';
import { SalmonSubTab } from '@/types/salmon';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { LayoutDashboard, PackagePlus, Scissors, Warehouse, Target, ClipboardList, ShieldX } from 'lucide-react';
import DashboardView from './DashboardView';
import EntriesView from './EntriesView';
import ManipulationView from './ManipulationView';
import StockView from './StockView';
import GoalsView from './GoalsView';
import PlanningView from './PlanningView';
import { useModuleAccess } from '@/permissions/hooks';

interface Props {
  store: ReturnType<typeof useSalmonStore>;
}

// Map UI subtab IDs → registry subtab keys
const UI_TO_REGISTRY: Record<string, string> = {
  'dashboard': 'dashboard',
  'entries': 'entradas',
  'manipulation': 'manipulacao',
  'stock': 'estoque',
  'goals': 'metas',
  'planning-salmon': 'planejamento',
};

const REGISTRY_TO_UI: Record<string, string> = Object.fromEntries(
  Object.entries(UI_TO_REGISTRY).map(([ui, reg]) => [reg, ui])
);

const subTabs: { id: SalmonSubTab; registryKey: string; label: string; icon: typeof LayoutDashboard }[] = [
  { id: 'dashboard', registryKey: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { id: 'entries', registryKey: 'entradas', label: 'Entradas', icon: PackagePlus },
  { id: 'manipulation', registryKey: 'manipulacao', label: 'Manipulação', icon: Scissors },
  { id: 'stock', registryKey: 'estoque', label: 'Estoque', icon: Warehouse },
  { id: 'goals', registryKey: 'metas', label: 'Metas', icon: Target },
  { id: 'planning-salmon', registryKey: 'planejamento', label: 'Planejamento', icon: ClipboardList },
];

function NoAccess({ perm }: { perm: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <ShieldX className="w-10 h-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground font-medium">Sem permissão</p>
      <p className="text-[10px] text-muted-foreground/70">({perm})</p>
    </div>
  );
}

export default function SalmonControlView({ store }: Props) {
  const { visibleSubtabs, canView } = useModuleAccess('salmon');

  // Filter subtabs based on permissions (registry keys)
  const visibleTabs = subTabs.filter(t => visibleSubtabs.includes(t.registryKey));
  const defaultTab = visibleTabs[0]?.id || 'dashboard';

  const [activeSubTab, setActiveSubTab] = usePersistedTab<SalmonSubTab>('app:tab:salmon', defaultTab);
  const [preSelectedEntryId, setPreSelectedEntryId] = useState<string | null>(null);

  const handleStartManipulation = (entryId: string) => {
    setPreSelectedEntryId(entryId);
    setActiveSubTab('manipulation');
  };

  const handleNavigate = (tab: string) => {
    if (tab === 'planning') setActiveSubTab('planning-salmon');
    else setActiveSubTab(tab as SalmonSubTab);
  };

  if (!canView) {
    return <NoAccess perm="salmon:*:view" />;
  }

  return (
    <div className="space-y-4">
      {/* Sub-tabs */}
      <div className="flex items-center gap-1 overflow-x-auto pb-1 -mx-1 px-1">
        {visibleTabs.map(tab => {
          const Icon = tab.icon;
          const active = activeSubTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveSubTab(tab.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all ${
                active
                  ? 'gradient-salmon text-primary-foreground shadow-md'
                  : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Sub-tab content */}
      {activeSubTab === 'dashboard' && <DashboardView store={store} onNavigate={handleNavigate} />}
      {activeSubTab === 'entries' && <EntriesView store={store} />}
      {activeSubTab === 'manipulation' && (
        <ManipulationView
          store={store}
          preSelectedEntryId={preSelectedEntryId}
          onClearPreSelected={() => setPreSelectedEntryId(null)}
        />
      )}
      {activeSubTab === 'stock' && (
        <StockView store={store} onStartManipulation={handleStartManipulation} />
      )}
      {activeSubTab === 'goals' && <GoalsView store={store} />}
      {activeSubTab === 'planning-salmon' && <PlanningView store={store} />}
    </div>
  );
}

import { ReactNode, useMemo, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabId, MetaCompraMensal, SalmonEntry } from '@/types/salmon';
import {
  Package, ShoppingCart, ClipboardList, Building2, Settings, AlertTriangle, BarChart3,
  LayoutDashboard, Target, Menu, Moon, Sun, User, ChevronLeft, X, LogOut, Users, Fish, ClipboardCheck, TrendingDown, BookOpen, Brain, UserCheck, DollarSign, Shield
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';
import logoMarginPro from '@/assets/logo-marginpro.png';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { useIsMobile } from '@/hooks/use-mobile';
import { MODULE_MANIFESTS } from '@/permissions/registry';
import type { AppPermission } from '@/contexts/AuthContext';

function parseLocalDate(s: string) { const [y,m,d] = s.split('-').map(Number); return new Date(y,m-1,d); }

interface LayoutProps {
  children: ReactNode;
  activeTab: TabId;
  onTabChange: (tab: TabId) => void;
  isOffline: boolean;
  entries?: SalmonEntry[];
  metasCompra?: MetaCompraMensal[];
}

interface NavItem {
  id: TabId;
  label: string;
  icon: typeof Fish;
  /** Module key in the permission registry — used to derive visibility from granular permissions */
  moduleKey: string;
  /** Optional: extra legacy/granular keys to also check (OR logic with moduleKey) */
  extraPermissions?: string[];
}

interface NavSection {
  title: string;
  items: NavItem[];
}

/**
 * Builds the set of ALL granular permission keys for a module from the registry.
 * Used to check if the user has ANY permission in the module → show the nav item.
 */
function getModuleAnyKeys(moduleKey: string): string[] {
  const manifest = MODULE_MANIFESTS.find(m => m.key === moduleKey);
  if (!manifest) return [];
  return manifest.subtabs.flatMap(s =>
    s.actions.map(a => `${moduleKey}:${s.key}:${a.action}`)
  );
}

const navSections: NavSection[] = [
  {
    title: 'ESTRATÉGICO',
    items: [
      { id: 'relatorios', label: 'Relatórios Gerais', icon: BarChart3, moduleKey: 'relatorios' },
      { id: 'salmon', label: 'Dashboard Salmão', icon: LayoutDashboard, moduleKey: 'salmon', extraPermissions: ['salmon:dashboard:view'] },
    ],
  },
  {
    title: 'OPERAÇÃO',
    items: [
      { id: 'estoque-geral', label: 'Controle de Estoque', icon: Package, moduleKey: 'estoque' },
      { id: 'salmon', label: 'Controle de Salmão', icon: Fish, moduleKey: 'salmon' },
      { id: 'inventario', label: 'Inventário Geral', icon: ClipboardCheck, moduleKey: 'inventario' },
      { id: 'compras', label: 'Compras', icon: ShoppingCart, moduleKey: 'compras' },
    ],
  },
  {
    title: 'KPIs & INTELIGÊNCIA',
    items: [
      { id: 'cmv', label: 'Centro de CMV', icon: TrendingDown, moduleKey: 'cmv' },
      { id: 'ficha-tecnica', label: 'Ficha Técnica', icon: BookOpen, moduleKey: 'ficha' },
      { id: 'planning', label: 'Planejamento', icon: ClipboardList, moduleKey: 'planning' },
    ],
  },
  {
    title: 'INTELIGÊNCIA',
    items: [
      { id: 'ia', label: 'Central de IA', icon: Brain, moduleKey: 'ia' },
    ],
  },
  {
    title: 'PESSOAS',
    items: [
      { id: 'rh', label: 'RH', icon: UserCheck, moduleKey: 'rh' },
    ],
  },
  {
    title: 'FINANCEIRO',
    items: [
      { id: 'financeiro', label: 'Financeiro', icon: DollarSign, moduleKey: 'financeiro' },
    ],
  },
  {
    title: 'ADMINISTRAÇÃO',
    items: [
      { id: 'configuracoes', label: 'Usuários', icon: Users, moduleKey: 'configuracoes', extraPermissions: ['configuracoes:usuarios:view', 'configuracoes:usuarios:manage'] },
      { id: 'configuracoes', label: 'Configurações', icon: Settings, moduleKey: 'configuracoes', extraPermissions: ['configuracoes:geral:view', 'configuracoes:geral:manage'] },
    ],
  },
];

const ROLE_DISPLAY: Record<string, string> = {
  admin: 'Admin',
  operador: 'Operador',
};

const tabLabels: Record<TabId, string> = {
  salmon: 'Dashboard Salmão',
  'estoque-geral': 'Controle de Estoque',
  inventario: 'Inventário Geral',
  compras: 'Compras',
  cmv: 'Centro de CMV',
  'ficha-tecnica': 'Ficha Técnica',
  planning: 'Planejamento',
  suppliers: 'Fornecedores',
  relatorios: 'Relatórios Gerais',
  ia: 'Central de IA',
  rh: 'RH — Pessoas',
  financeiro: 'Financeiro',
  configuracoes: 'Configurações',
};

export default function AppLayout({ children, activeTab, onTabChange, isOffline, entries = [], metasCompra = [] }: LayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const { profile, signOut, roles, hasPermission, permissionState, rbacDebug } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const isSuperAdmin = permissionState === 'READY' && hasPermission('system:global:manage');

  const permissionsReady = permissionState === 'READY';

  // Check if a nav item is visible to the user — returns false if permissions not loaded
  // Uses the module registry to derive ALL granular keys and checks if user has ANY
  const isItemVisible = useCallback((item: NavItem) => {
    if (!permissionsReady) return false; // NEVER show items while loading

    // For admin items with extraPermissions only (no full module scan needed)
    const extraMatch = item.extraPermissions?.some(p => hasPermission(p)) ?? false;

    // Check any granular permission from the registry module
    const moduleKeys = getModuleAnyKeys(item.moduleKey);
    const moduleMatch = moduleKeys.some(k => hasPermission(k));

    return extraMatch || moduleMatch;
  }, [permissionsReady, hasPermission]);

  // For colaborador/chefe_setor: redirect estoque-geral to requisições only
  // This is handled at the component level

  const budgetStatus = useMemo(() => {
    const mesAno = format(new Date(), 'yyyy-MM');
    const meta = metasCompra.find(m => m.mesAno === mesAno && m.categoria === 'salmao');
    if (!meta) return null;
    const [year, month] = mesAno.split('-').map(Number);
    const monthStart = startOfMonth(new Date(year, month - 1));
    const monthEnd = endOfMonth(new Date(year, month - 1));
    const gastoMes = entries.reduce((sum, e) => {
      const d = parseLocalDate(e.date);
      if (d >= monthStart && d <= monthEnd) return sum + e.totalValue;
      return sum;
    }, 0);
    const pct = meta.metaValorCompra > 0 ? (gastoMes / meta.metaValorCompra) * 100 : 0;
    if (pct >= meta.alertaVermelhoPercent) return 'estourado';
    if (pct >= meta.alertaAmareloPercent) return 'perto';
    return null;
  }, [entries, metasCompra]);

  const handleNav = (tabId: TabId) => {
    onTabChange(tabId);
    if (isMobile) setSidebarOpen(false);
  };

  const sidebarWidth = sidebarCollapsed ? 'w-16' : 'w-60';

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-5 border-b border-sidebar-border ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
        <img src={logoMarginPro} alt="MarginPro" className={`${sidebarCollapsed ? 'w-8 h-8' : 'h-10'} object-contain`} />
        {!sidebarCollapsed && (
          <div className="min-w-0 sr-only">
            <h1>MarginPro</h1>
          </div>
        )}
        {!isMobile && !sidebarCollapsed && (
          <button onClick={() => setSidebarCollapsed(true)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-3 px-2 space-y-5">
        {!permissionsReady ? (
          /* Skeleton while permissions load — NEVER show full menu */
          <div className="space-y-4 px-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-muted animate-pulse" />
                {!sidebarCollapsed && <div className="h-3 w-24 rounded bg-muted animate-pulse" />}
              </div>
            ))}
          </div>
        ) : (
          navSections.map(section => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title}>
                {!sidebarCollapsed && (
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1.5">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item, idx) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    const key = `${section.title}-${item.id}-${idx}`;
                    return (
                      <button
                        key={key}
                        onClick={() => handleNav(item.id)}
                        className={`w-full flex items-center gap-3 rounded-lg transition-all duration-200 group relative
                          ${sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}
                          ${active
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-muted-foreground hover:bg-accent hover:text-foreground'
                          }`}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        {active && (
                          <div className="absolute left-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-primary rounded-r-full" />
                        )}
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {!sidebarCollapsed && (
                          <span className="text-sm truncate">{item.label}</span>
                        )}
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })
        )}

        {/* Admin link — super_admin only */}
        {permissionsReady && isSuperAdmin && (
          <div className="px-2 pb-2">
            {!sidebarCollapsed && (
              <p className="text-[10px] font-semibold text-muted-foreground uppercase tracking-widest px-3 mb-1.5">
                SISTEMA
              </p>
            )}
            <button
              onClick={() => { navigate('/admin'); if (isMobile) setSidebarOpen(false); }}
              className={`w-full flex items-center gap-3 rounded-lg transition-all duration-200
                ${sidebarCollapsed ? 'justify-center px-2 py-2.5' : 'px-3 py-2'}
                text-muted-foreground hover:bg-accent hover:text-foreground`}
              title={sidebarCollapsed ? 'Admin' : undefined}
            >
              <Shield className="w-4 h-4" />
              {!sidebarCollapsed && <span className="text-sm">Admin</span>}
            </button>
          </div>
        )}
      </nav>

      {/* Sidebar footer */}
      {sidebarCollapsed && !isMobile && (
        <div className="p-2 border-t border-sidebar-border">
          <button onClick={() => setSidebarCollapsed(false)} className="w-full flex items-center justify-center p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-accent transition-colors">
            <Menu className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* RBAC Diagnostic — hidden by default, toggle with Alt+Shift+D */}
      {import.meta.env.DEV && !sidebarCollapsed && false && (
        <div className="p-2 border-t border-sidebar-border text-[8px] text-muted-foreground/60 space-y-0.5 font-mono overflow-hidden">
          <p>state: {rbacDebug.state}</p>
          <p>roles: {rbacDebug.roles.join(', ') || '—'}</p>
          <p>perms: {rbacDebug.permissions.join(', ') || '—'}</p>
          <p>nonce: {rbacDebug.nonce.slice(0, 12)}</p>
        </div>
      )}
    </div>
  );

  return (
    <div className="min-h-screen bg-background flex w-full">
      {/* Mobile overlay */}
      {isMobile && sidebarOpen && (
        <div className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      {isMobile ? (
        <aside
          className={`fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border w-60 transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      ) : (
        <aside className={`sticky top-0 h-screen bg-sidebar border-r border-sidebar-border ${sidebarWidth} transition-all duration-200 flex-shrink-0`}>
          {sidebarContent}
        </aside>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 glass h-14 flex items-center justify-between px-4 lg:px-6">
          <div className="flex items-center gap-3">
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-base font-display font-bold text-foreground leading-none">{tabLabels[activeTab]}</h2>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {budgetStatus && (
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium ${
                budgetStatus === 'estourado'
                  ? 'bg-destructive/10 border border-destructive/20 text-destructive'
                  : 'bg-warning/10 border border-warning/20 text-warning'
              }`}>
                <AlertTriangle className="w-3 h-3" />
                {budgetStatus === 'estourado' ? 'Meta estourada' : 'Perto da meta'}
              </div>
            )}
            {isOffline && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning/10 border border-warning/20">
                <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse-soft" />
                <span className="text-[11px] font-medium text-warning">Offline</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </Button>
            <NotificationBell onNavigate={(tab, linkPath) => {
              onTabChange(tab as TabId);
              // Store linkPath for deep navigation
              if (linkPath) {
                window.dispatchEvent(new CustomEvent('notification-navigate', { detail: { linkPath } }));
              }
            }} />
            <div className="relative">
              <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-8 h-8 rounded-full bg-primary/10 border border-border flex items-center justify-center hover:bg-primary/20 transition-colors">
                <User className="w-4 h-4 text-primary" />
              </button>
              {showUserMenu && (
                <div className="absolute right-0 top-10 bg-card border border-border rounded-xl shadow-lg p-3 w-52 z-50 animate-scale-in">
                  <div className="mb-2 pb-2 border-b border-border">
                    <p className="text-xs font-semibold text-foreground truncate">{profile?.nome || 'Usuário'}</p>
                    <p className="text-[10px] text-muted-foreground truncate">{profile?.email}</p>
                    {roles.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {roles.map(r => (
                          <span key={r} className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary font-medium">
                            {ROLE_DISPLAY[r] || r}
                          </span>
                        ))}
                      </div>
                    )}
                    {profile?.sector && (
                      <p className="text-[9px] text-muted-foreground mt-1">Setor: {profile.sector}</p>
                    )}
                  </div>
                  <button onClick={() => { signOut(); setShowUserMenu(false); }}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded-lg text-xs text-destructive hover:bg-destructive/10 transition-colors">
                    <LogOut className="w-3.5 h-3.5" /> Sair
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6">
          <div className="max-w-7xl mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

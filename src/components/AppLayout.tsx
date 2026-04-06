import { ReactNode, useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabId, MetaCompraMensal, SalmonEntry } from '@/types/salmon';
import {
  Package, ShoppingCart, ClipboardList, Building2, Settings, AlertTriangle, BarChart3,
  LayoutDashboard, Target, Menu, Moon, Sun, User, ChevronLeft, ChevronRight, X, LogOut, Users, Fish, ClipboardCheck, TrendingDown, BookOpen, Brain, UserCheck, DollarSign, Shield
} from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { APP_NAME, APP_TAGLINE } from '@/lib/brand';
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
      { id: 'configuracoes-usuarios', label: 'Usuários', icon: Users, moduleKey: 'configuracoes', extraPermissions: ['configuracoes:usuarios:view', 'configuracoes:usuarios:manage'] },
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
  'configuracoes-usuarios': 'Usuários',
  configuracoes: 'Configurações',
};

export default function AppLayout({ children, activeTab, onTabChange, isOffline, entries = [], metasCompra = [] }: LayoutProps) {
  const { theme, toggleTheme } = useTheme();
  const { profile, signOut, roles, hasPermission, permissionState, rbacDebug } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('app:sidebar:width');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isResizing, setIsResizing] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const isSuperAdmin = permissionState === 'READY' && hasPermission('system:global:manage');

  const permissionsReady = permissionState === 'READY';

  const startResizing = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setIsResizing(true);
  }, []);

  const stopResizing = useCallback(() => {
    setIsResizing(false);
    localStorage.setItem('app:sidebar:width', sidebarWidth.toString());
  }, [sidebarWidth]);

  const resize = useCallback((e: MouseEvent) => {
    if (isResizing) {
      const newWidth = e.clientX;
      if (newWidth >= 160 && newWidth <= 480) {
        setSidebarWidth(newWidth);
        if (sidebarCollapsed && newWidth > 100) {
          setSidebarCollapsed(false);
        }
      }
    }
  }, [isResizing, sidebarCollapsed]);

  useEffect(() => {
    if (isResizing) {
      window.addEventListener('mousemove', resize);
      window.addEventListener('mouseup', stopResizing);
    } else {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    }
    return () => {
      window.removeEventListener('mousemove', resize);
      window.removeEventListener('mouseup', stopResizing);
    };
  }, [isResizing, resize, stopResizing]);

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

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Logo */}
      <div className={`flex items-center gap-3 px-4 py-6 border-b border-sidebar-border/10 ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
        {!sidebarCollapsed ? (
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0">
              <span className="text-white font-black text-xl tracking-tighter">M</span>
            </div>
            <div className="flex flex-col min-w-0">
              <span className="text-[17px] font-black text-foreground leading-tight tracking-tight truncate">Margin <span className="text-primary font-bold">Food</span></span>
              <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-[0.2em] opacity-40 leading-none mt-0.5">{profile?.company_name || 'Margin Food'}</span>
            </div>
          </div>
        ) : (
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center shadow-lg shadow-primary/20 shrink-0 scale-90">
            <span className="text-white font-black text-xl tracking-tighter">M</span>
          </div>
        )}

        {!isMobile && (
          <button 
            onClick={() => setSidebarCollapsed(!sidebarCollapsed)} 
            className={`ml-auto text-muted-foreground hover:text-foreground transition-all duration-300 p-1.5 rounded-lg hover:bg-white/40
              ${sidebarCollapsed ? 'rotate-180 ml-0 fixed left-12 bg-background shadow-md border border-border/50 z-[60]' : ''}`}
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        )}
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} className="ml-auto text-muted-foreground hover:text-foreground transition-colors p-1">
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
                        className={`w-full flex items-center gap-3 rounded-xl transition-all duration-300 group relative
                          ${sidebarCollapsed ? 'justify-center px-2 py-3' : 'px-4 py-2.5'}
                          ${active
                            ? 'bg-card text-primary font-bold shadow-card border-border/50 border scale-[1.02]'
                            : 'text-muted-foreground hover:bg-white/40 hover:text-foreground'
                          }`}
                        title={sidebarCollapsed ? item.label : undefined}
                      >
                        <Icon className={`w-4 h-4 flex-shrink-0 transition-transform duration-300 ${active ? 'scale-110' : 'group-hover:scale-110'}`} />
                        {!sidebarCollapsed && (
                          <span className="text-[13px] truncate tracking-tight">{item.label}</span>
                        )}
                        {active && !sidebarCollapsed && (
                          <div className="absolute right-3 w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
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

      {/* Resizer Handle */}
      {!isMobile && (
        <div
          onMouseDown={startResizing}
          className={`absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize hover:bg-primary/30 transition-colors z-50
            ${isResizing ? 'bg-primary/40 w-2' : ''}`}
        />
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
        <aside 
          className={`sticky top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200 flex-shrink-0 group overflow-visible`}
          style={{ 
            width: sidebarCollapsed ? '64px' : `${sidebarWidth}px`,
            transition: isResizing ? 'none' : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-background/60 backdrop-blur-md h-16 flex items-center justify-between px-4 lg:px-8 transition-all">
          <div className="flex items-center gap-4">
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} className="text-muted-foreground hover:text-foreground transition-colors p-2 rounded-lg hover:bg-accent">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <div>
              <h2 className="text-xl font-bold text-foreground tracking-tight">{tabLabels[activeTab]}</h2>
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

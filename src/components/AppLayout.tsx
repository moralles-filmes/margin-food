import { ReactNode, useMemo, useState, useCallback, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabId, MetaCompraMensal, SalmonEntry } from '@/types/salmon';
import { Package, ShoppingCart, ClipboardList, Settings, AlertTriangle, BarChart3, LayoutDashboard, Menu, Moon, Sun, User, ChevronLeft, ChevronRight, PanelLeftClose, X, LogOut, Users, Fish, ClipboardCheck, TrendingDown, BookOpen, Brain, UserCheck, DollarSign, Shield, ArrowDownUp } from 'lucide-react';
import NotificationBell from '@/components/NotificationBell';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { useTheme } from '@/hooks/useTheme';
import { useAuth } from '@/contexts/AuthContext';
import { CompanySelector } from '@/components/CompanySelector';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { useIsMobile } from '@/hooks/use-mobile';
import { MODULE_MANIFESTS } from '@/permissions/registry';
import { useModuleBadges } from '@/contexts/ModuleBadgesContext';
import { formatBadgeCount } from '@/lib/moduleBadges';

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
      { id: 'movimentacao-operacional', label: 'Movimentação Operacional', icon: ArrowDownUp, moduleKey: 'operacional' },
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
  'movimentacao-operacional': 'Movimentação Operacional',
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
  const { profile, signOut, roles, hasPermission, permissionState, rbacDebug, accessibleCompanies, activeCompanyId, setActiveCompany } = useAuth();
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const saved = localStorage.getItem('app:sidebar:width');
    return saved ? parseInt(saved, 10) : 240;
  });
  const [isResizing, setIsResizing] = useState(false);
  const isSuperAdmin = permissionState === 'READY' && hasPermission('system:global:manage');
  const { totalsByTab: badgeTotals } = useModuleBadges();

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
      <div className={`flex items-center gap-2.5 px-4 py-5 border-b border-sidebar-border ${sidebarCollapsed ? 'justify-center px-2' : ''}`}>
        {sidebarCollapsed && accessibleCompanies.length > 1 ? <CompanySelector companies={accessibleCompanies} value={activeCompanyId!} onChange={id => void setActiveCompany(id)} compact label="Trocar unidade" /> : <div className="w-8 h-8 rounded-lg bg-primary-strong flex items-center justify-center shadow-sm shrink-0">
          <span className="text-primary-strong-foreground font-black text-base tracking-tighter">M</span>
        </div>}
        {!sidebarCollapsed && (
          <div className="flex flex-col min-w-0">
            <span className="text-[15px] font-bold text-sidebar-foreground leading-tight tracking-tight truncate">Margin Food</span>
            <div className="text-[11px] text-muted-foreground leading-tight truncate"><CompanySelector companies={accessibleCompanies} value={activeCompanyId!} onChange={id => void setActiveCompany(id)} label="Trocar unidade" /></div>
          </div>
        )}

        {!isMobile && !sidebarCollapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarCollapsed(true)}
                aria-label="Recolher menu"
                className="ml-auto h-8 w-8 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors rounded-md"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Recolher menu</TooltipContent>
          </Tooltip>
        )}
        {isMobile && (
          <button onClick={() => setSidebarOpen(false)} aria-label="Fechar menu" className="ml-auto h-10 w-10 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-md">
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {!isMobile && sidebarCollapsed && (
        <div className="flex justify-center py-2 border-b border-sidebar-border">
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Expandir menu"
                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors rounded-md"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menu</TooltipContent>
          </Tooltip>
        </div>
      )}

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
                  <p className="text-[10px] font-semibold text-sidebar-section uppercase tracking-widest px-3 mb-1.5">
                    {section.title}
                  </p>
                )}
                <div className="space-y-0.5">
                  {visibleItems.map((item, idx) => {
                    const Icon = item.icon;
                    const active = activeTab === item.id;
                    const key = `${section.title}-${item.id}-${idx}`;
                    // Soma dos contadores das abas internas do módulo (ModuleBadgesProvider).
                    const badgeTotal = badgeTotals[item.id] ?? 0;
                    const pendingLabel = badgeTotal === 1 ? '1 pendência' : `${badgeTotal} pendências`;
                    const navButton = (
                      <button
                        onClick={() => handleNav(item.id)}
                        aria-current={active ? 'page' : undefined}
                        className={`w-full flex items-center gap-3 rounded-lg transition-colors duration-150 relative
                          ${sidebarCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'min-h-[40px] px-3 py-2.5'}
                          ${active
                            ? 'bg-sidebar-active text-sidebar-active-foreground font-semibold'
                            : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-hover-foreground'
                          }`}
                      >
                        {active && (
                          <span className="absolute left-0 top-1/2 -translate-y-1/2 h-5 w-[3px] rounded-full bg-sidebar-active-marker" />
                        )}
                        <Icon className="w-4 h-4 flex-shrink-0" />
                        {!sidebarCollapsed && (
                          <span className="min-w-0 text-[13.5px] truncate tracking-tight">{item.label}</span>
                        )}
                        {badgeTotal > 0 && (
                          <>
                            <span
                              aria-hidden="true"
                              className={sidebarCollapsed
                                ? 'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center font-bold leading-none'
                                : 'ml-auto shrink-0 min-w-5 h-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold leading-none'}
                            >
                              {formatBadgeCount(badgeTotal)}
                            </span>
                            <span className="sr-only">{pendingLabel}</span>
                          </>
                        )}
                      </button>
                    );
                    return sidebarCollapsed ? (
                      <Tooltip key={key}>
                        <TooltipTrigger asChild>{navButton}</TooltipTrigger>
                        <TooltipContent side="right">
                          {badgeTotal > 0 ? `${item.label} · ${pendingLabel}` : item.label}
                        </TooltipContent>
                      </Tooltip>
                    ) : (
                      <div key={key}>{navButton}</div>
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
              <p className="text-[10px] font-semibold text-sidebar-section uppercase tracking-widest px-3 mb-1.5">
                SISTEMA
              </p>
            )}
            {(() => {
              const adminButton = (
                <button
                  onClick={() => { navigate('/admin'); if (isMobile) setSidebarOpen(false); }}
                  className={`w-full flex items-center gap-3 rounded-lg transition-colors duration-150
                    ${sidebarCollapsed ? 'h-10 w-10 justify-center mx-auto' : 'min-h-[40px] px-3 py-2.5'}
                    text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-hover-foreground`}
                >
                  <Shield className="w-4 h-4 flex-shrink-0" />
                  {!sidebarCollapsed && <span className="text-[13.5px] truncate tracking-tight">Admin</span>}
                </button>
              );
              return sidebarCollapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{adminButton}</TooltipTrigger>
                  <TooltipContent side="right">Admin</TooltipContent>
                </Tooltip>
              ) : adminButton;
            })()}
          </div>
        )}
      </nav>

      {/* Footer collapse control */}
      {!isMobile && !sidebarCollapsed && (
        <div className="border-t border-sidebar-border p-2">
          <button
            onClick={() => setSidebarCollapsed(true)}
            className="w-full flex items-center gap-3 rounded-lg min-h-[40px] px-3 py-2.5 text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-hover-foreground transition-colors duration-150"
          >
            <PanelLeftClose className="w-4 h-4 flex-shrink-0" />
            <span className="text-[13.5px] truncate tracking-tight">Recolher menu</span>
          </button>
        </div>
      )}

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
        <header className="sticky top-0 z-30 bg-background border-b border-border h-16 flex items-center justify-between px-4 lg:px-8">
          <div className="flex items-center gap-4 min-w-0">
            {isMobile && (
              <button onClick={() => setSidebarOpen(true)} aria-label="Abrir menu" className="h-10 w-10 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent">
                <Menu className="w-5 h-5" />
              </button>
            )}
            <h2 className="text-xl font-semibold text-foreground tracking-tight truncate">{tabLabels[activeTab]}</h2>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {budgetStatus && (
              <div className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium border ${
                budgetStatus === 'estourado'
                  ? 'bg-destructive-soft border-destructive-border text-destructive'
                  : 'bg-warning-soft border-warning-border text-warning'
              }`}>
                <AlertTriangle className="w-3 h-3" />
                {budgetStatus === 'estourado' ? 'Meta estourada' : 'Perto da meta'}
              </div>
            )}
            {isOffline && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning-soft border border-warning-border">
                <div className="w-1.5 h-1.5 rounded-full bg-warning animate-pulse-soft" />
                <span className="text-[11px] font-medium text-warning">Offline</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              aria-label={theme === 'dark' ? 'Ativar tema claro' : 'Ativar tema escuro'}
              className="h-9 w-9 p-0 text-muted-foreground hover:text-foreground"
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
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button aria-label="Menu do usuário" className="h-9 w-9 rounded-full bg-primary-soft border border-border flex items-center justify-center hover:bg-primary-soft/70 transition-colors">
                  <User className="w-4 h-4 text-primary-ink" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56">
                <div className="px-2 py-1.5">
                  <p className="text-xs font-semibold text-foreground truncate">{profile?.nome || 'Usuário'}</p>
                  <p className="text-[11px] text-muted-foreground truncate">{profile?.email}</p>
                  {roles.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      {roles.map(r => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full bg-primary-soft text-primary-soft-foreground font-medium">
                          {ROLE_DISPLAY[r] || r}
                        </span>
                      ))}
                    </div>
                  )}
                  {profile?.sector && (
                    <p className="text-[10px] text-muted-foreground mt-1.5">Setor: {profile.sector}</p>
                  )}
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onSelect={() => signOut()}
                  className="text-destructive focus:text-destructive focus:bg-destructive-soft cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5 mr-2" /> Sair
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </header>

        {/* Content */}
        <main className="flex-1 overflow-y-auto overflow-x-hidden p-4 lg:p-6 xl:p-8">
          <div className="max-w-[1920px] mx-auto">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}

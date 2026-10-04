import { ReactNode, useMemo, useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { TabId, MetaCompraMensal, SalmonEntry } from '@/types/salmon';
import { Package, ShoppingCart, ClipboardList, Settings, AlertTriangle, BarChart3, LayoutDashboard, Menu, Moon, Sun, ChevronLeft, ChevronRight, ChevronsUpDown, X, LogOut, Users, Fish, ClipboardCheck, TrendingDown, BookOpen, Brain, UserCheck, DollarSign, Shield, ArrowDownUp } from 'lucide-react';
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

/** Iniciais para o avatar da conta: primeira letra do primeiro e do último nome. */
function getInitials(text: string) {
  const words = text.trim().split(/[\s@._-]+/).filter(Boolean);
  if (words.length === 0) return '?';
  const first = words[0][0] ?? '';
  const last = words.length > 1 ? words[words.length - 1][0] ?? '' : words[0][1] ?? '';
  return (first + last).toUpperCase();
}

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
    // Padrão de 256 px (faixa de 240–260 px da referência); a largura salva continua valendo.
    return saved ? parseInt(saved, 10) : 256;
  });
  const [isResizing, setIsResizing] = useState(false);
  const isSuperAdmin = permissionState === 'READY' && hasPermission('system:global:manage');
  const { totalsByTab: badgeTotals } = useModuleBadges();
  // A gaveta do celular mostra sempre o menu completo, mesmo se o desktop estava recolhido.
  const collapsed = sidebarCollapsed && !isMobile;
  // Sidebar expandida mas estreita (perto de 160 px): a marca fica só no "M" e o cartão da loja perde o ícone.
  const narrow = !collapsed && !isMobile && sidebarWidth < 208;
  const brandIconOnly = collapsed || narrow;
  const navRef = useRef<HTMLElement>(null);
  const mobileAsideRef = useRef<HTMLElement>(null);
  const mainAreaRef = useRef<HTMLDivElement>(null);
  const openMenuButtonRef = useRef<HTMLButtonElement>(null);
  const closeMenuButtonRef = useRef<HTMLButtonElement>(null);
  const drawerWasOpen = useRef(false);

  const permissionsReady = permissionState === 'READY';

  // Gaveta do celular: fechada fica fora do Tab e do leitor de tela; aberta isola o conteúdo.
  useEffect(() => {
    const aside = mobileAsideRef.current;
    const main = mainAreaRef.current;
    if (aside) aside.inert = isMobile && !sidebarOpen;
    if (main) main.inert = isMobile && sidebarOpen;
    return () => {
      if (aside) aside.inert = false;
      if (main) main.inert = false;
    };
  }, [isMobile, sidebarOpen]);

  // A gaveta só existe no celular: ao virar desktop ela fecha, para não reabrir sozinha depois.
  useEffect(() => { if (!isMobile) setSidebarOpen(false); }, [isMobile]);

  // Foco entra na gaveta ao abrir e volta ao botão "Abrir menu" ao fechar.
  useEffect(() => {
    if (!isMobile) { drawerWasOpen.current = false; return; }
    if (sidebarOpen) {
      drawerWasOpen.current = true;
      closeMenuButtonRef.current?.focus();
    } else if (drawerWasOpen.current) {
      drawerWasOpen.current = false;
      openMenuButtonRef.current?.focus();
    }
  }, [isMobile, sidebarOpen]);

  useEffect(() => {
    if (!isMobile || !sidebarOpen) return;
    // Menus abertos dentro da gaveta tratam o Escape antes (Radix marca defaultPrevented).
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented) setSidebarOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [isMobile, sidebarOpen]);

  // O item ativo fica à vista quando o menu é maior que a tela.
  useEffect(() => {
    if (!permissionsReady || (isMobile && !sidebarOpen)) return;
    navRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView?.({ block: 'nearest' });
  }, [activeTab, permissionsReady, isMobile, sidebarOpen, collapsed]);

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

  const userName = profile?.nome || profile?.email || 'Usuário';
  const userInitials = getInitials(userName);

  const accountTrigger = (
    <button
      type="button"
      aria-label={`Menu da conta: ${userName}`}
      className={`flex items-center rounded-xl transition-colors duration-150 hover:bg-sidebar-hover
        ${collapsed ? 'h-10 w-10 justify-center mx-auto' : 'w-full gap-3 px-2 py-2 text-left'}`}
    >
      <span aria-hidden="true" className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary-soft text-xs font-semibold text-primary-ink">
        {userInitials}
      </span>
      {!collapsed && (
        <>
          <span className="min-w-0 flex-1">
            <span className="block truncate text-[13px] font-semibold leading-tight text-sidebar-hover-foreground">{userName}</span>
            {profile?.email && profile.email !== userName && (
              <span className="mt-0.5 block truncate text-[11.5px] text-muted-foreground">{profile.email}</span>
            )}
          </span>
          <ChevronsUpDown aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
        </>
      )}
    </button>
  );

  const accountMenu = (
    <DropdownMenu>
      {collapsed ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <DropdownMenuTrigger asChild>{accountTrigger}</DropdownMenuTrigger>
          </TooltipTrigger>
          <TooltipContent side="right">{userName}</TooltipContent>
        </Tooltip>
      ) : (
        <DropdownMenuTrigger asChild>{accountTrigger}</DropdownMenuTrigger>
      )}
      <DropdownMenuContent
        side={collapsed ? 'right' : 'top'}
        align={collapsed ? 'end' : 'start'}
        className={collapsed ? 'w-56' : 'w-[--radix-dropdown-menu-trigger-width] min-w-56'}
      >
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
  );

  const navItemClass = (active: boolean) => `w-full flex items-center gap-2.5 rounded-xl transition-colors duration-150 relative
    ${collapsed ? 'h-10 w-10 justify-center mx-auto' : 'min-h-[40px] px-3 py-2'}
    ${active
      ? 'bg-sidebar-active bg-gradient-highlight text-sidebar-active-foreground font-semibold shadow-sm'
      : 'text-sidebar-foreground hover:bg-sidebar-hover hover:text-sidebar-hover-foreground'
    }`;

  const sidebarContent = (
    <div className="flex flex-col h-full">
      {/* Marca */}
      <div className={`flex items-center gap-3 pt-5 pb-4 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
        <div
          role={brandIconOnly ? 'img' : undefined}
          aria-label={brandIconOnly ? 'Margin Food' : undefined}
          aria-hidden={brandIconOnly ? undefined : true}
          className="w-9 h-9 rounded-xl bg-primary-strong flex items-center justify-center shadow-sm shrink-0"
        >
          <span aria-hidden="true" className="text-primary-strong-foreground font-black text-lg tracking-tighter">M</span>
        </div>
        {!brandIconOnly && (
          <span className="min-w-0 truncate text-base font-bold text-sidebar-hover-foreground leading-tight tracking-tight">Margin Food</span>
        )}

        {!isMobile && !collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
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
          <button
            ref={closeMenuButtonRef}
            type="button"
            onClick={() => setSidebarOpen(false)}
            aria-label="Fechar menu"
            className="ml-auto h-10 w-10 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors rounded-md"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      {/* Loja ativa */}
      <div className={collapsed ? 'flex flex-col items-center gap-2 px-2 pb-3' : 'px-3 pb-3'}>
        {!isMobile && collapsed && (
          <Tooltip>
            <TooltipTrigger asChild>
              <button
                type="button"
                onClick={() => setSidebarCollapsed(false)}
                aria-label="Expandir menu"
                className="h-8 w-8 flex items-center justify-center text-muted-foreground hover:text-foreground hover:bg-sidebar-hover transition-colors rounded-md"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right">Expandir menu</TooltipContent>
          </Tooltip>
        )}
        {activeCompanyId && (
          <CompanySelector
            companies={accessibleCompanies}
            value={activeCompanyId}
            onChange={id => void setActiveCompany(id)}
            appearance={collapsed ? 'compact' : 'card'}
            showIcon={!narrow}
            label="Trocar unidade"
          />
        )}
      </div>

      {/* Navigation */}
      <nav ref={navRef} aria-label="Módulos" className={`flex-1 overflow-y-auto overscroll-contain pt-1 pb-3 space-y-4 ${collapsed ? 'px-2' : 'px-3'}`}>
        {!permissionsReady ? (
          /* Skeleton while permissions load — NEVER show full menu */
          <div className="space-y-4 px-3">
            {[1,2,3,4,5].map(i => (
              <div key={i} className="flex items-center gap-3">
                <div className="w-4 h-4 rounded bg-muted animate-pulse" />
                {!collapsed && <div className="h-3 w-24 rounded bg-muted animate-pulse" />}
              </div>
            ))}
          </div>
        ) : (
          navSections.map(section => {
            const visibleItems = section.items.filter(isItemVisible);
            if (visibleItems.length === 0) return null;
            return (
              <div key={section.title}>
                {!collapsed && (
                  <p className="text-[10.5px] font-semibold text-sidebar-section uppercase tracking-[0.12em] px-3 mb-1">
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
                        type="button"
                        onClick={() => handleNav(item.id)}
                        aria-current={active ? 'page' : undefined}
                        title={collapsed ? undefined : item.label}
                        className={navItemClass(active)}
                      >
                        <Icon className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                        {!collapsed && (
                          <span className="min-w-0 flex-1 text-left text-[13.5px] truncate tracking-tight">{item.label}</span>
                        )}
                        {badgeTotal > 0 && (
                          <>
                            <span
                              aria-hidden="true"
                              className={collapsed
                                ? 'absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-destructive text-[9px] text-destructive-foreground flex items-center justify-center font-bold leading-none'
                                : 'ml-auto shrink-0 min-w-5 h-5 px-1 rounded-full bg-destructive text-[10px] text-destructive-foreground flex items-center justify-center font-bold leading-none'}
                            >
                              {formatBadgeCount(badgeTotal)}
                            </span>
                            <span className="sr-only">{pendingLabel}</span>
                          </>
                        )}
                        {active && !collapsed && <ChevronRight aria-hidden="true" className="w-4 h-4 shrink-0" />}
                      </button>
                    );
                    return collapsed ? (
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
          <div className="pb-2">
            {!collapsed && (
              <p className="text-[10.5px] font-semibold text-sidebar-section uppercase tracking-[0.12em] px-3 mb-1">
                SISTEMA
              </p>
            )}
            {(() => {
              const adminButton = (
                <button
                  type="button"
                  onClick={() => { navigate('/admin'); if (isMobile) setSidebarOpen(false); }}
                  className={navItemClass(false)}
                >
                  <Shield className="w-4 h-4 flex-shrink-0" aria-hidden="true" />
                  {!collapsed && <span className="min-w-0 flex-1 text-left text-[13.5px] truncate tracking-tight">Admin</span>}
                </button>
              );
              return collapsed ? (
                <Tooltip>
                  <TooltipTrigger asChild>{adminButton}</TooltipTrigger>
                  <TooltipContent side="right">Admin</TooltipContent>
                </Tooltip>
              ) : adminButton;
            })()}
          </div>
        )}
      </nav>

      {/* Conta do usuário (D07) */}
      <div className={`border-t border-sidebar-border ${collapsed ? 'p-2' : 'p-3'}`}>
        {accountMenu}
      </div>

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
        <div aria-hidden="true" className="fixed inset-0 z-40 bg-foreground/20 backdrop-blur-sm" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Sidebar */}
      {isMobile ? (
        <aside
          // Chaves distintas: sem elas o React reaproveita o mesmo <aside> ao virar desktop
          // e o `inert` da gaveta fechada ficava na sidebar fixa.
          key="sidebar-mobile"
          ref={mobileAsideRef}
          id="app-sidebar"
          role={sidebarOpen ? 'dialog' : undefined}
          aria-modal={sidebarOpen ? true : undefined}
          aria-label="Menu de navegação"
          className={`fixed inset-y-0 left-0 z-50 bg-sidebar border-r border-sidebar-border w-64 max-w-[85vw] transition-transform duration-300 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          {sidebarContent}
        </aside>
      ) : (
        <aside
          key="sidebar-desktop"
          className={`sticky top-0 h-screen bg-sidebar border-r border-sidebar-border transition-all duration-200 flex-shrink-0 group overflow-visible`}
          style={{
            width: collapsed ? '64px' : `${sidebarWidth}px`,
            transition: isResizing ? 'none' : 'width 300ms cubic-bezier(0.4, 0, 0.2, 1)'
          }}
        >
          {sidebarContent}
        </aside>
      )}

      {/* Main area */}
      <div ref={mainAreaRef} className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="sticky top-0 z-30 bg-card border-b border-border h-16 flex items-center justify-between gap-3 px-4 lg:px-8">
          <div className="flex items-center gap-3 min-w-0">
            {isMobile && (
              <button
                ref={openMenuButtonRef}
                type="button"
                onClick={() => setSidebarOpen(true)}
                aria-label="Abrir menu"
                aria-expanded={sidebarOpen}
                aria-controls="app-sidebar"
                className="h-10 w-10 flex items-center justify-center shrink-0 text-muted-foreground hover:text-foreground transition-colors rounded-lg hover:bg-accent"
              >
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
              <div
                className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-warning-soft border border-warning-border"
                title="Sem conexão com o servidor. Tentando reconectar a cada 15 segundos."
              >
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
            <NotificationBell />
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

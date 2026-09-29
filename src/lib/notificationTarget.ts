import type { TabId } from '@/types/salmon';

/**
 * Para onde o clique numa notificação leva. O `link_path` gravado pelo banco e
 * pelas Edge Functions tem dois formatos: o módulo no caminho (`/compras?subtab=...`,
 * `/inventario`) ou só na query (`/?module=estoque&sub=requisicoes`, usado pelas
 * notificações de requisição). O segundo tem caminho vazio e o sininho ignorava o
 * clique; `module` da própria notificação é o último recurso.
 */
export interface NotificationTarget {
  tab: TabId;
  subtab: string | null;
}

const TAB_IDS: ReadonlySet<string> = new Set<TabId>([
  'salmon', 'estoque-geral', 'movimentacao-operacional', 'inventario', 'compras', 'planning',
  'suppliers', 'relatorios', 'cmv', 'ficha-tecnica', 'configuracoes', 'configuracoes-usuarios',
  'ia', 'rh', 'financeiro',
]);

/** Chave de módulo (registry e nomes legados em inglês) → aba principal. */
const MODULE_TAB: Record<string, TabId> = {
  estoque: 'estoque-geral',
  stock: 'estoque-geral',
  compras: 'compras',
  purchases: 'compras',
  inventario: 'inventario',
  inventory: 'inventario',
  financeiro: 'financeiro',
  finance: 'financeiro',
  rh: 'rh',
};

function toTab(value: string | null | undefined): TabId | null {
  if (!value) return null;
  if (TAB_IDS.has(value)) return value as TabId;
  return MODULE_TAB[value] ?? null;
}

export function resolveNotificationTarget(
  linkPath: string | null | undefined,
  module: string | null | undefined,
): NotificationTarget | null {
  if (linkPath) {
    let url: URL | null = null;
    try {
      url = new URL(linkPath, 'https://placeholder');
    } catch {
      url = null;
    }
    if (url) {
      const tab = toTab(url.pathname.split('/').filter(Boolean)[0]) ?? toTab(url.searchParams.get('module'));
      if (tab) return { tab, subtab: url.searchParams.get('subtab') ?? url.searchParams.get('sub') };
    }
  }
  const tab = toTab(module);
  return tab ? { tab, subtab: null } : null;
}

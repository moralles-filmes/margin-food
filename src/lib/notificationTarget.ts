import type { TabId } from '@/types/salmon';
import { PRESENTATION_BASE_PATH } from '@/lib/presentationDetailNavigation';

/**
 * Para onde o clique numa notificação leva. O `link_path` gravado pelo banco e
 * pelas Edge Functions tem dois formatos: o módulo no caminho (`/compras?subtab=...`,
 * `/inventario`) ou só na query (`/?module=estoque&sub=requisicoes`, usado pelas
 * notificações de requisição). O segundo tem caminho vazio e o sininho ignorava o
 * clique; `module` da própria notificação é o último recurso.
 *
 * O registro exato vem de `entity_type`/`entity_id`, que todo produtor grava — o
 * link sozinho só leva ao módulo. A Apresentação Sócios guarda decisão e sessão na
 * URL, então recebe `href` em vez de registro e a própria tela lê a query.
 */
export interface NotificationRecord {
  type: string;
  id: string;
}

export interface NotificationTarget {
  tab: TabId;
  subtab: string | null;
  record: NotificationRecord | null;
  /** Rota do app a abrir, para telas cujo estado mora na URL. */
  href: string | null;
}

export interface NotificationLink {
  link_path: string | null;
  module: string | null;
  entity_type?: string | null;
  entity_id?: string | null;
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

/** Aba interna que exibe cada tipo de registro, para links que não dizem a sub-aba. */
const RECORD_SUBTAB: Record<string, { tab: TabId; subtab: string }> = {
  purchase_order: { tab: 'compras', subtab: 'pedidos-compras' },
  requisicao_estoque: { tab: 'estoque-geral', subtab: 'requisicoes' },
};

const PRESENTATION_PARAMS = ['decision', 'session', 'revision', 'agendaItem'];
const LEGACY_SOCIOS_PATH = '/financeiro/relatorio-socios';

/** Query de decisão/sessão/ata da Apresentação Sócios (os avisos ainda gravam o caminho antigo). */
export function hasPresentationParams(params: URLSearchParams): boolean {
  return PRESENTATION_PARAMS.some(key => params.has(key));
}

function toTab(value: string | null | undefined): TabId | null {
  if (!value) return null;
  if (TAB_IDS.has(value)) return value as TabId;
  return MODULE_TAB[value] ?? null;
}

function parseLink(linkPath: string | null | undefined): URL | null {
  if (!linkPath) return null;
  try {
    return new URL(linkPath, 'https://placeholder');
  } catch {
    return null;
  }
}

function financeiroHref(url: URL): string {
  const path = url.pathname === LEGACY_SOCIOS_PATH && hasPresentationParams(url.searchParams)
    ? PRESENTATION_BASE_PATH
    : url.pathname;
  return path + url.search;
}

function recordOf(notification: NotificationLink, url: URL | null): NotificationRecord | null {
  if (notification.entity_type && notification.entity_id) {
    return { type: notification.entity_type, id: notification.entity_id };
  }
  const orderId = url?.searchParams.get('order');
  return orderId ? { type: 'purchase_order', id: orderId } : null;
}

export function resolveNotificationTarget(notification: NotificationLink): NotificationTarget | null {
  const url = parseLink(notification.link_path);
  const linkTab = url
    ? toTab(url.pathname.split('/').filter(Boolean)[0]) ?? toTab(url.searchParams.get('module'))
    : null;
  const record = recordOf(notification, url);
  const tab = linkTab ?? toTab(notification.module) ?? (record ? RECORD_SUBTAB[record.type]?.tab : null) ?? null;
  if (!tab) return null;

  if (tab === 'financeiro' && url?.pathname.startsWith('/financeiro/')) {
    return { tab, subtab: null, record: null, href: financeiroHref(url) };
  }

  const linkSubtab = linkTab && url ? url.searchParams.get('subtab') ?? url.searchParams.get('sub') : null;
  const recordView = record ? RECORD_SUBTAB[record.type] : undefined;
  const subtab = linkSubtab ?? (recordView?.tab === tab ? recordView.subtab : null);
  return { tab, subtab, record, href: null };
}

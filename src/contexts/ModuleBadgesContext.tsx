import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useCompanyScope, useSupabase } from '@/contexts/CompanyScopeContext';
import { useAuth } from '@/contexts/AuthContext';
import { useNotificationsContext } from '@/contexts/NotificationsContext';
import { useModuleAccess } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import { COTACAO_STATUS_ABERTOS } from '@/types/cotacao';
import type { TabId } from '@/types/salmon';
import {
  badgeTotalsByTab,
  EMPTY_MODULE_BADGES,
  mergeModuleBadges,
  type ModuleBadgeCounts,
  type ModuleBadgeReading,
} from '@/lib/moduleBadges';

/**
 * Fonte única dos contadores de pendência: abas internas e menu lateral leem
 * daqui. O menu precisa do número com o módulo fechado, então cada contagem é
 * um `count` no servidor — nunca derivada de uma lista paginada ou filtrada na
 * tela (o contador de Pedidos antigo contava só a 1ª página já filtrada).
 */
interface ModuleBadgesValue {
  counts: ModuleBadgeCounts;
  totalsByTab: Partial<Record<TabId, number>>;
  refresh: () => void;
}

const ModuleBadgesContext = createContext<ModuleBadgesValue | null>(null);

const REFRESH_DEBOUNCE_MS = 300;
const REFRESH_INTERVAL_MS = 60_000;
const OPEN_ORDER_STATUSES = 'status.in.(OPEN,PENDING,IN_RECEIVING,SHOPPING_OK),and(status.eq.PARTIAL,not_delivered_ack_at.is.null)';

type CountResponse = { count: number | null; error: unknown };

async function readCount(label: string, query: PromiseLike<CountResponse>): Promise<number | null> {
  const { count, error } = await query;
  if (error) {
    console.error(`[moduleBadges] falha ao contar ${label}:`, error);
    return null;
  }
  return count ?? 0;
}

export function ModuleBadgesProvider({ children }: { children: ReactNode }) {
  const supabase = useSupabase();
  const companyId = useCompanyScope()?.companyId ?? null;
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const { notifications } = useNotificationsContext();
  const estoqueAccess = useModuleAccess('estoque');
  const comprasAccess = useModuleAccess('compras');
  const financeiroAccess = useModuleAccess('financeiro');

  // Aba sem permissão de visualização não soma no menu (fica 0, sem consulta).
  const canRequisicoes = estoqueAccess.visibleSubtabs.includes('requisicoes');
  const canPedidos = comprasAccess.visibleSubtabs.includes('pedidos');
  const canChecklist = comprasAccess.visibleSubtabs.includes('checklist');
  const canAlertasFalta = comprasAccess.visibleSubtabs.includes('alertas_falta');
  const canCotacao = comprasAccess.visibleSubtabs.includes('cotacao');
  const canPagar = financeiroAccess.visibleSubtabs.includes('pagar');
  const visible = useMemo(() => ({
    requisicoes: canRequisicoes,
    pedidos: canPedidos,
    checklist: canChecklist,
    alertas_falta: canAlertasFalta,
    cotacao: canCotacao,
    pagar: canPagar,
  }), [canRequisicoes, canPedidos, canChecklist, canAlertasFalta, canCotacao, canPagar]);

  const [counts, setCounts] = useState<ModuleBadgeCounts>(EMPTY_MODULE_BADGES);

  const loadCounts = useCallback(async (): Promise<ModuleBadgeReading> => {
    if (!companyId || !userId) return toReading([0, 0, 0, 0, 0, 0]);
    const hidden = Promise.resolve(0);

    const requisicoes = visible.requisicoes
      ? supabase.rpc('count_requisicoes_with_pending_items').then(({ data, error }) => {
        if (error) {
          console.error('[moduleBadges] falha ao contar requisições:', error);
          return null;
        }
        return typeof data === 'number' ? data : 0;
      })
      : hidden;

    const pedidos = visible.pedidos
      ? readCount('pedidos', supabase.from('purchase_orders').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).is('deleted_at', null).or(OPEN_ORDER_STATUSES))
      : hidden;

    const checklist = visible.checklist
      ? readCount('checklist', supabase.from('purchase_orders').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).is('deleted_at', null).eq('status', 'PENDING')
        .in('type', ['MERCADO', 'SAZONAL']).eq('responsible_user_id', userId))
      : hidden;

    const alertasFalta = visible.alertas_falta
      ? readCount('itens em falta', supabase.from('alertas_falta_estoque').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).eq('status', 'PENDENTE'))
      : hidden;

    const cotacao = visible.cotacao
      ? readCount('cotações', supabase.from('cotacoes').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).is('deleted_at', null).in('status', COTACAO_STATUS_ABERTOS))
      : hidden;

    const pagar = visible.pagar
      ? readCount('contas a pagar', supabase.from('fin_contas_pagar').select('id', { count: 'exact', head: true })
        .eq('company_id', companyId).in('status', ['pendente', 'vencido']))
      : hidden;

    return toReading(await Promise.all([requisicoes, pedidos, checklist, alertasFalta, cotacao, pagar]));
  }, [supabase, companyId, userId, visible]);

  // Leituras sobrepostas: só a mais recente vale (troca de unidade no meio de uma leitura).
  const seqRef = useRef(0);
  const refreshNow = useCallback(async () => {
    const seq = ++seqRef.current;
    const reading = await loadCounts();
    if (seq === seqRef.current) setCounts(prev => mergeModuleBadges(prev, reading));
  }, [loadCounts]);

  const timerRef = useRef<number | null>(null);
  const refreshNowRef = useRef(refreshNow);
  refreshNowRef.current = refreshNow;
  const refresh = useCallback(() => {
    if (timerRef.current !== null) window.clearTimeout(timerRef.current);
    timerRef.current = window.setTimeout(() => {
      timerRef.current = null;
      void refreshNowRef.current();
    }, REFRESH_DEBOUNCE_MS);
  }, []);
  useEffect(() => () => { if (timerRef.current !== null) window.clearTimeout(timerRef.current); }, []);

  useEffect(() => { setCounts(EMPTY_MODULE_BADGES); }, [companyId]);
  useEffect(() => { void refreshNow(); }, [refreshNow]);

  // Mutações (e foco/reconexão, via app:refresh) nos módulos que têm contador.
  useDataEvent('estoque:*', refresh);
  useDataEvent('compras:*', refresh);
  useDataEvent('financeiro:pagar', refresh);
  useDataEvent('financeiro:contas_pagar', refresh);

  // Notificação nova costuma ser pendência nova (ex.: requisição aberta).
  const newestNotificationId = notifications[0]?.id;
  useEffect(() => { if (newestNotificationId) refresh(); }, [newestNotificationId, refresh]);

  // O que outros usuários fazem não passa pelos eventos desta aba.
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.visibilityState === 'visible') refresh();
    }, REFRESH_INTERVAL_MS);
    return () => window.clearInterval(id);
  }, [refresh]);

  const value = useMemo<ModuleBadgesValue>(() => ({
    counts,
    totalsByTab: badgeTotalsByTab(counts),
    refresh,
  }), [counts, refresh]);

  return <ModuleBadgesContext.Provider value={value}>{children}</ModuleBadgesContext.Provider>;
}

function toReading([requisicoes, pedidos, checklist, alertasFalta, cotacao, pagar]: (number | null)[]): ModuleBadgeReading {
  return {
    estoque: { requisicoes },
    compras: { pedidos, checklist, alertas_falta: alertasFalta, cotacao },
    financeiro: { pagar },
  };
}

export function useModuleBadges(): ModuleBadgesValue {
  const ctx = useContext(ModuleBadgesContext);
  if (!ctx) throw new Error('useModuleBadges must be used inside ModuleBadgesProvider');
  return ctx;
}

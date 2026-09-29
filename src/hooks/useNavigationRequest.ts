import { useEffect, useRef } from 'react';
import type { TabId } from '@/types/salmon';

/**
 * Leva um clique (sininho, aviso, atalho entre telas) até a aba interna e ao
 * registro certo. As views são lazy e montadas por condição: quando o clique troca
 * de módulo, a view de destino ainda não existe e um evento disparado naquele
 * instante se perde — era assim que a notificação de Compras abria o módulo e não
 * o pedido. O pedido fica guardado aqui e cada nível consome a sua parte ao montar
 * (o módulo lê a sub-aba, a tela da sub-aba lê o registro), ou na hora, se já
 * estava aberto. O que ninguém consome expira sozinho.
 */
export interface NavigationRecord {
  type: string;
  id: string;
}

export interface NavigationRequest {
  tab: TabId;
  subtab?: string | null;
  record?: NavigationRecord | null;
}

const EVENT = 'app-navigation-request';
const MAX_AGE_MS = 15_000;

let pending: { tab: TabId; subtab: string | null; record: NavigationRecord | null; at: number } | null = null;

export function requestNavigation(request: NavigationRequest) {
  pending = { tab: request.tab, subtab: request.subtab ?? null, record: request.record ?? null, at: Date.now() };
  window.dispatchEvent(new CustomEvent<TabId>(EVENT, { detail: request.tab }));
}

/** Descarta o pedido em aberto — ex.: destino sem permissão, que nunca vai montar. */
export function dropNavigationRequest() {
  pending = null;
}

function pendingFor(tab: TabId) {
  if (!pending) return null;
  if (Date.now() - pending.at > MAX_AGE_MS) {
    pending = null;
    return null;
  }
  return pending.tab === tab ? pending : null;
}

function releaseIfConsumed() {
  if (pending && !pending.subtab && !pending.record) pending = null;
}

function takeSubtab(tab: TabId): string | null {
  const request = pendingFor(tab);
  if (!request?.subtab) return null;
  const { subtab } = request;
  request.subtab = null;
  releaseIfConsumed();
  return subtab;
}

function takeRecord(tab: TabId, types: readonly string[]): NavigationRecord | null {
  const request = pendingFor(tab);
  if (!request?.record || !types.includes(request.record.type)) return null;
  const { record } = request;
  request.record = null;
  releaseIfConsumed();
  return record;
}

/** Troca o módulo principal. Só a tela raiz usa; as views consomem sub-aba e registro. */
export function useNavigationTab(onTab: (tab: TabId) => void) {
  const handlerRef = useRef(onTab);
  handlerRef.current = onTab;

  useEffect(() => {
    const handler = (event: Event) => handlerRef.current((event as CustomEvent<TabId>).detail);
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, []);
}

function useConsumer(consume: () => void, key: string) {
  const consumeRef = useRef(consume);
  consumeRef.current = consume;

  useEffect(() => {
    const handler = () => consumeRef.current();
    handler();
    window.addEventListener(EVENT, handler);
    return () => window.removeEventListener(EVENT, handler);
  }, [key]);
}

export function useNavigationSubtab(tab: TabId, onSubtab: (subtab: string) => void) {
  useConsumer(() => {
    const subtab = takeSubtab(tab);
    if (subtab) onSubtab(subtab);
  }, tab);
}

export function useNavigationRecord(tab: TabId, types: readonly string[], onRecord: (record: NavigationRecord) => void) {
  useConsumer(() => {
    const record = takeRecord(tab, types);
    if (record) onRecord(record);
  }, `${tab}:${types.join('|')}`);
}

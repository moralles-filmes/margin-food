/**
 * Lightweight pub-sub event bus for cross-component data invalidation.
 *
 * Usage:
 *   // After a mutation succeeds:
 *   const emitDataEvent = useEmitDataEvent();
 *   emitDataEvent('financeiro:lancamentos');
 *   emitDataEvent('financeiro:dashboard');
 *
 *   // In a consuming component:
 *   useDataEvent('financeiro:lancamentos', loadData);
 *   useDataEvent('financeiro:dashboard', loadResumo);
 *
 * Channel naming convention:
 *   '<module>:<entity>' e.g. 'financeiro:lancamentos', 'estoque:produtos'
 *
 * Wildcard support:
 *   useDataEvent('financeiro:*', handler) — reacts to ANY financeiro event
 *   emitDataEvent('financeiro:*') — triggers ALL financeiro listeners
 */

import { useCallback, useEffect, useRef } from 'react';
import { useCompanyScope } from '@/contexts/CompanyScopeContext';
import { clientScopeKey, getClientScope, type ClientScope } from './companyClientLifetime';
import { useScopeActivity } from '@/hooks/useScopeActivity';

type Listener = () => void;

type BroadcastPayload = {
  channel: string;
  sourceId: string;
  timestamp: number;
  scopeKey: string;
};

const listeners = new Map<string, Set<{ fn: Listener; scopeKey: string }>>();
const APP_REFRESH_CHANNEL = 'app:refresh';
const STORAGE_KEY = 'marginpro:data-event';
const BROADCAST_CHANNEL_NAME = 'marginpro-data-events';
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `tab-${Math.random().toString(36).slice(2, 10)}`;

const broadcastChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  : null;

function notifyListeners(channel: string, scopeKey?: string) {
  const notify = (entry: { fn: Listener; scopeKey: string }) => {
    if (scopeKey === undefined || scopeKey === entry.scopeKey) entry.fn();
  };
  if (channel === APP_REFRESH_CHANNEL) {
    for (const set of listeners.values()) {
      set.forEach(notify);
    }
    return;
  }

  listeners.get(channel)?.forEach(notify);

  const [module] = channel.split(':');
  if (module && !channel.endsWith(':*')) {
    listeners.get(`${module}:*`)?.forEach(notify);
  }

  if (channel.endsWith(':*')) {
    const prefix = channel.replace(':*', ':');
    for (const [key, set] of listeners) {
      if (key.startsWith(prefix) && key !== channel) {
        set.forEach(notify);
      }
    }
  }
}

function emitCrossTab(channel: string, scopeKey: string) {
  const payload: BroadcastPayload = {
    channel,
    sourceId: TAB_ID,
    timestamp: Date.now(),
    scopeKey,
  };

  try {
    if (broadcastChannel) {
      broadcastChannel.postMessage(payload);
      return;
    }

    if (typeof window !== 'undefined') {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      window.localStorage.removeItem(STORAGE_KEY);
    }
  } catch { /* Invalidação local já ocorreu; storage/canal pode estar indisponível. */ }
}

if (broadcastChannel) {
  broadcastChannel.onmessage = event => {
    const payload = event.data as BroadcastPayload | undefined;
    if (!payload || payload.sourceId === TAB_ID || typeof payload.channel !== 'string' || typeof payload.scopeKey !== 'string') return;
    notifyListeners(payload.channel, payload.scopeKey);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;

    try {
      const payload = JSON.parse(event.newValue) as BroadcastPayload;
      if (payload.sourceId === TAB_ID || typeof payload.channel !== 'string' || typeof payload.scopeKey !== 'string') return;
      notifyListeners(payload.channel, payload.scopeKey);
    } catch {
      // noop
    }
  });
}

export function emitDataEvent(channel: string, scope: ClientScope) {
  if (scope.signal.aborted) return;
  const key = clientScopeKey(scope);
  notifyListeners(channel, key);
  emitCrossTab(channel, key);
}

/** Foco/reconexão atualiza os escopos montados nesta aba; não propaga entre abas. */
export function emitAppRefresh() { notifyListeners(APP_REFRESH_CHANNEL); }

export function onDataEvent(channel: string, fn: Listener, scope: ClientScope): () => void {
  const entry = { fn: () => { if (!scope.signal.aborted) fn(); }, scopeKey: clientScopeKey(scope) };
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)?.add(entry);
  return () => {
    listeners.get(channel)?.delete(entry);
    if (!listeners.get(channel)?.size) listeners.delete(channel);
  };
}

export function useEmitDataEvent() {
  const context = useCompanyScope();
  const scope = context && getClientScope(context.client);
  const isActive = useScopeActivity();
  return useCallback((channel: string) => {
    if (scope && isActive()) emitDataEvent(channel, scope);
  }, [scope, isActive]);
}

/**
 * React hook — subscribes to a data event channel.
 * The handler is called whenever that channel fires.
 * Uses a ref to avoid re-subscribing on handler identity changes.
 */
export function useDataEvent(channel: string, handler: Listener) {
  const context = useCompanyScope();
  const scope = context && getClientScope(context.client);
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!scope) return;
    return onDataEvent(channel, () => ref.current(), scope);
  }, [channel, scope]);
}

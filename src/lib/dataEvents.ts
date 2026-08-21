/**
 * Lightweight pub-sub event bus for cross-component data invalidation.
 *
 * Usage:
 *   // After a mutation succeeds:
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

import { useEffect, useRef } from 'react';

type Listener = () => void;

type BroadcastPayload = {
  channel: string;
  sourceId: string;
  timestamp: number;
};

const listeners = new Map<string, Set<Listener>>();
const APP_REFRESH_CHANNEL = 'app:refresh';
const STORAGE_KEY = 'marginpro:data-event';
const BROADCAST_CHANNEL_NAME = 'marginpro-data-events';
const TAB_ID = typeof crypto !== 'undefined' && 'randomUUID' in crypto
  ? crypto.randomUUID()
  : `tab-${Math.random().toString(36).slice(2, 10)}`;

const broadcastChannel = typeof BroadcastChannel !== 'undefined'
  ? new BroadcastChannel(BROADCAST_CHANNEL_NAME)
  : null;

function notifyListeners(channel: string) {
  if (channel === APP_REFRESH_CHANNEL) {
    for (const set of listeners.values()) {
      set.forEach(fn => fn());
    }
    return;
  }

  listeners.get(channel)?.forEach(fn => fn());

  const [module] = channel.split(':');
  if (module && !channel.endsWith(':*')) {
    listeners.get(`${module}:*`)?.forEach(fn => fn());
  }

  if (channel.endsWith(':*')) {
    const prefix = channel.replace(':*', ':');
    for (const [key, set] of listeners) {
      if (key.startsWith(prefix) && key !== channel) {
        set.forEach(fn => fn());
      }
    }
  }
}

function emitCrossTab(channel: string) {
  const payload: BroadcastPayload = {
    channel,
    sourceId: TAB_ID,
    timestamp: Date.now(),
  };

  if (broadcastChannel) {
    broadcastChannel.postMessage(payload);
    return;
  }

  if (typeof window !== 'undefined') {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
    window.localStorage.removeItem(STORAGE_KEY);
  }
}

if (broadcastChannel) {
  broadcastChannel.onmessage = event => {
    const payload = event.data as BroadcastPayload | undefined;
    if (!payload || payload.sourceId === TAB_ID || typeof payload.channel !== 'string') return;
    notifyListeners(payload.channel);
  };
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;

    try {
      const payload = JSON.parse(event.newValue) as BroadcastPayload;
      if (payload.sourceId === TAB_ID || typeof payload.channel !== 'string') return;
      notifyListeners(payload.channel);
    } catch {
      // noop
    }
  });
}

export function emitDataEvent(channel: string) {
  notifyListeners(channel);
  emitCrossTab(channel);
}

export function onDataEvent(channel: string, fn: Listener): () => void {
  if (!listeners.has(channel)) listeners.set(channel, new Set());
  listeners.get(channel)?.add(fn);
  return () => {
    listeners.get(channel)?.delete(fn);
  };
}

/**
 * React hook — subscribes to a data event channel.
 * The handler is called whenever that channel fires.
 * Uses a ref to avoid re-subscribing on handler identity changes.
 */
export function useDataEvent(channel: string, handler: Listener) {
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    return onDataEvent(channel, () => ref.current());
  }, [channel]);
}

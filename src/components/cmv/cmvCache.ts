/**
 * Lightweight in-memory cache for CMV Edge Function results.
 * No localStorage, no database — purely runtime.
 */

interface CacheEntry<T = any> {
  data: T;
  expiresAt: number;
}

import { isCompanyClientActive } from '@/lib/companyClientLifetime';

// A→B→A e relogin criam outra instância: nunca recuperam o cache do lifetime antigo.
const stores = new WeakMap<object, Map<string, CacheEntry>>();
function storeFor(client: object) {
  let store = stores.get(client);
  if (!store) { store = new Map(); stores.set(client, store); }
  return store;
}

function buildKey(params: Record<string, any>): string {
  const sorted = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k] ?? ''}`)
    .join('&');
  return sorted;
}

/** Get cached value if still valid */
export function cacheGet<T = any>(client: object, prefix: string, params: Record<string, any>): T | null {
  if (!isCompanyClientActive(client)) return null;
  const store = storeFor(client);
  const key = `${prefix}:${buildKey(params)}`;
  const entry = store.get(key);
  if (!entry) return null;
  if (Date.now() > entry.expiresAt) {
    store.delete(key);
    return null;
  }
  return entry.data as T;
}

/** Store a value with TTL in seconds */
export function cacheSet(client: object, prefix: string, params: Record<string, any>, data: any, ttlSeconds: number): void {
  if (!isCompanyClientActive(client)) return;
  const store = storeFor(client);
  const key = `${prefix}:${buildKey(params)}`;
  store.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

/** Invalidate all entries matching a prefix, or all entries if no prefix */
export function cacheInvalidate(client: object, prefix?: string): void {
  if (!isCompanyClientActive(client)) return;
  const store = storeFor(client);
  if (!prefix) {
    store.clear();
    return;
  }
  const pfx = `${prefix}:`;
  for (const key of store.keys()) {
    if (key.startsWith(pfx)) {
      store.delete(key);
    }
  }
}

/**
 * Reusable guards and helpers for safe patterns.
 */

/**
 * Submit guard: wraps an async handler with loading state + double-click protection.
 * Usage:
 *   const [saving, guardedSave] = useSubmitGuard(async () => { ... });
 */
export function createSubmitGuard() {
  let busy = false;
  return async <T>(fn: () => Promise<T>): Promise<T | undefined> => {
    if (busy) return undefined;
    busy = true;
    try {
      return await fn();
    } finally {
      busy = false;
    }
  };
}

/**
 * Narrow unknown to a typed array with a mapper.
 * Safe alternative to `data as any[]`.
 */
export function narrowRows<T>(data: unknown, mapper: (row: any) => T): T[] {
  if (!Array.isArray(data)) return [];
  return data.map(mapper);
}

/**
 * Safe cast for RPC responses that return a single scalar.
 */
export function narrowScalar<T>(data: unknown, fallback: T): T {
  if (data === null || data === undefined) return fallback;
  return data as T;
}

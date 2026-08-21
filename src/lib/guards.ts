/**
 * Reusable guards and helpers for safe patterns.
 */

/**
 * Narrow unknown to a typed array with a mapper.
 * Safe alternative to `data as any[]`.
 */
export function narrowRows<T>(data: unknown, mapper: (row: any) => T): T[] {
  if (!Array.isArray(data)) return [];
  return data.map(mapper);
}

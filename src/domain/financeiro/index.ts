/**
 * ─── Domain Layer: Financeiro ───
 *
 * Central entry point for all financial business rules,
 * contracts, selectors, and invariants.
 *
 * Usage:
 *   import { calcResultado, isTransferencia, RULES } from '@/domain/financeiro';
 */

export * from './contracts';
export * from './invariants';
export * from './selectors';
export * from './presentation';
export { RULES } from './rules';
export type { DomainRule } from './rules';

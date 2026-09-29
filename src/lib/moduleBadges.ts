import type { TabId } from '@/types/salmon';

/**
 * Contadores de pendência por aba interna, na chave de subtab do registry. As
 * abas internas e o menu lateral leem o mesmo objeto (`ModuleBadgesProvider`),
 * então o número do módulo é sempre a soma do que as abas mostram.
 *
 * Só entram contadores de pendência. Os de Ficha Técnica (quantidade de fichas
 * por tipo) são tamanho de catálogo, não trabalho a fazer, e ficam fora.
 */
export interface ModuleBadgeCounts {
  estoque: { requisicoes: number };
  compras: { pedidos: number; checklist: number; alertas_falta: number; cotacao: number };
  financeiro: { pagar: number };
}

export type BadgeModule = keyof ModuleBadgeCounts;

/** Resultado de uma leitura: `null` = aquela contagem falhou e o valor anterior é mantido. */
export type ModuleBadgeReading = {
  [M in BadgeModule]: { [K in keyof ModuleBadgeCounts[M]]: number | null };
};

export const EMPTY_MODULE_BADGES: ModuleBadgeCounts = {
  estoque: { requisicoes: 0 },
  compras: { pedidos: 0, checklist: 0, alertas_falta: 0, cotacao: 0 },
  financeiro: { pagar: 0 },
};

export const BADGE_MODULE_TAB: Record<BadgeModule, TabId> = {
  estoque: 'estoque-geral',
  compras: 'compras',
  financeiro: 'financeiro',
};

function mergeGroup<T extends Record<string, number>>(prev: T, next: { [K in keyof T]: number | null }): T {
  const merged = { ...prev };
  for (const key of Object.keys(prev) as (keyof T)[]) {
    const value = next[key];
    if (value !== null && value !== undefined) merged[key] = value as T[keyof T];
  }
  return merged;
}

export function mergeModuleBadges(prev: ModuleBadgeCounts, next: ModuleBadgeReading): ModuleBadgeCounts {
  return {
    estoque: mergeGroup(prev.estoque, next.estoque),
    compras: mergeGroup(prev.compras, next.compras),
    financeiro: mergeGroup(prev.financeiro, next.financeiro),
  };
}

export function moduleBadgeTotal(group: Record<string, number>): number {
  return Object.values(group).reduce((sum, value) => sum + (Number.isFinite(value) && value > 0 ? value : 0), 0);
}

export function badgeTotalsByTab(counts: ModuleBadgeCounts): Partial<Record<TabId, number>> {
  const totals: Partial<Record<TabId, number>> = {};
  for (const module of Object.keys(BADGE_MODULE_TAB) as BadgeModule[]) {
    const total = moduleBadgeTotal(counts[module]);
    if (total > 0) totals[BADGE_MODULE_TAB[module]] = total;
  }
  return totals;
}

export function formatBadgeCount(value: number): string {
  return value > 99 ? '99+' : String(value);
}

import { describe, expect, it } from 'vitest';
import {
  badgeTotalsByTab,
  EMPTY_MODULE_BADGES,
  formatBadgeCount,
  mergeModuleBadges,
  type ModuleBadgeCounts,
} from './moduleBadges';

describe('badgeTotalsByTab', () => {
  it('soma as abas internas no módulo', () => {
    const counts: ModuleBadgeCounts = {
      estoque: { requisicoes: 1 },
      compras: { pedidos: 2, checklist: 1, alertas_falta: 4, cotacao: 0 },
      financeiro: { pagar: 3 },
    };
    expect(badgeTotalsByTab(counts)).toEqual({ 'estoque-geral': 1, compras: 7, financeiro: 3 });
  });

  it('omite módulo sem pendência em vez de mostrar 0', () => {
    expect(badgeTotalsByTab(EMPTY_MODULE_BADGES)).toEqual({});
  });
});

describe('mergeModuleBadges', () => {
  it('mantém o último valor bom quando uma contagem falha', () => {
    const prev: ModuleBadgeCounts = {
      estoque: { requisicoes: 5 },
      compras: { pedidos: 2, checklist: 0, alertas_falta: 1, cotacao: 3 },
      financeiro: { pagar: 7 },
    };
    const merged = mergeModuleBadges(prev, {
      estoque: { requisicoes: null },
      compras: { pedidos: 4, checklist: 0, alertas_falta: null, cotacao: 0 },
      financeiro: { pagar: 6 },
    });
    expect(merged).toEqual({
      estoque: { requisicoes: 5 },
      compras: { pedidos: 4, checklist: 0, alertas_falta: 1, cotacao: 0 },
      financeiro: { pagar: 6 },
    });
  });
});

describe('formatBadgeCount', () => {
  it('limita em 99+ como as abas internas', () => {
    expect(formatBadgeCount(99)).toBe('99');
    expect(formatBadgeCount(100)).toBe('99+');
  });
});

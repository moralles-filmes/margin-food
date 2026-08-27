import { describe, expect, it, vi } from 'vitest';
import {
  isPresentationPlanPermissionError,
  parsePresentationPlan,
  presentationPlanAvailability,
} from '@/hooks/usePresentationPlan';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

vi.mock('@/integrations/supabase/client', () => ({ supabase: {} }));

describe('contrato de transporte do planejamento executivo', () => {
  it('valida e preserva fonte, paginação e fórmulas auditáveis', () => {
    const parsed = parsePresentationPlan(createPresentationPlanData());
    expect(parsed.sources).toEqual({
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    });
    expect(parsed.rules.openItemsIncluded).toBe(false);
    expect(parsed.categories).toMatchObject({ page: 1, pageSize: 25, totalCount: 2, hasMore: false });
  });

  it('rejeita fonte trocada, valores não finitos e inclusão de contas em aberto', () => {
    const plan = createPresentationPlanData();
    expect(() => parsePresentationPlan({ ...plan, sources: { ...plan.sources, actual: 'outra_tabela' } })).toThrow(/sources\.actual/);
    expect(() => parsePresentationPlan({ ...plan, actual: { ...plan.actual, revenue: Number.NaN } })).toThrow(/actual\.revenue/);
    expect(() => parsePresentationPlan({ ...plan, rules: { ...plan.rules, openItemsIncluded: true } })).toThrow(/openItemsIncluded/);
  });

  it('distingue ausência de permissão de falha técnica', () => {
    expect(isPresentationPlanPermissionError({ code: '42501' })).toBe(true);
    expect(isPresentationPlanPermissionError({ message: 'PERMISSION_DENIED: financeiro:relatorio-socios:view' })).toBe(true);
    expect(presentationPlanAvailability(false, undefined, null, false)).toEqual({
      state: 'unavailable',
      reason: 'permission-denied',
    });
    expect(presentationPlanAvailability(true, undefined, new Error('rede'), false)).toEqual({
      state: 'error',
      message: 'Não foi possível carregar metas, orçamento e projeção.',
    });
  });
});

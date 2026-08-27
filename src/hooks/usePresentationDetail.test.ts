import { describe, expect, it, vi } from 'vitest';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));
import {
  isPresentationDetailPermissionError,
  parsePresentationDetailRowsPage,
  parsePresentationDetailSeries,
} from '@/hooks/usePresentationDetail';

describe('contrato do drill-down paginado', () => {
  it('aceita uma página incremental e mantém hasMore', () => {
    expect(parsePresentationDetailRowsPage({
      page: 1,
      pageSize: 25,
      hasMore: true,
      items: [{
        id: 'entry-1',
        kind: 'ledger',
        description: 'Compra de insumos',
        nature: 'DESPESA',
        status: 'REALIZADO',
        effectiveDate: '2026-08-20',
        amount: 300,
        classifiedAmount: 125,
        categoryName: 'Insumos',
        origin: 'manual',
      }],
    })).toMatchObject({ page: 1, pageSize: 25, hasMore: true });
  });

  it('bloqueia payload numérico inválido antes de renderizar Infinity/NaN', () => {
    expect(() => parsePresentationDetailSeries([{
      key: '2026-08',
      start: '2026-08-01',
      endExclusive: '2026-09-01',
      amount: Number.NaN,
      revenue: 100,
      revenueSharePercent: 10,
    }])).toThrow(/amount inválido/i);
  });

  it('classifica negação de permissão e categoria fora do tenant como acesso restrito', () => {
    expect(isPresentationDetailPermissionError({ code: '42501', message: 'PERMISSION_DENIED' })).toBe(true);
    expect(isPresentationDetailPermissionError({ code: '42501', message: 'PRESENTATION_CATEGORY_OUT_OF_SCOPE' })).toBe(true);
  });
});

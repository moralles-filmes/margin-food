import { createElement, type PropsWithChildren } from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createPresentationExpenseDetailsQueryKey, usePresentationExpenseDetails } from '@/hooks/usePresentationExpenseDetails';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
const companyId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const categoryId = '33333333-3333-4333-8333-333333333333';
const ledgerId = '11111111-1111-4111-8111-111111111111';
const allocationId = '22222222-2222-4222-8222-222222222222';

function createExpenseDetailsPayload(hasMore = true) {
  return {
    contractVersion: '1.0', source: { report: 'DFC', regime: 'caixa' }, month: '2026-03', categoryId, limit: 25, hasMore,
    nextCursor: hasMore ? { state: 'available', effectiveDate: '2026-03-20', ledgerId, allocationSource: 'allocation', allocationId } : { state: 'end' },
    items: [{ allocationId, allocationSource: 'allocation', ledgerId, effectiveDate: '2026-03-20', description: 'Compra rateada', status: 'REALIZADO', origin: 'manual', categoryId, categoryName: 'Insumos', operationalClass: 'operational', amount: 450 }],
    generatedAt: '2026-08-27T15:30:00-03:00',
  };
}

describe('drill-down paginado de Despesas', () => {
  it('isola cache por empresa, mês, categoria e limite', () => {
    expect(createPresentationExpenseDetailsQueryKey(companyId, '2026-03', categoryId, 25))
      .toEqual(['financeiro', 'presentation-socios', 'expense-details', companyId, '2026-03', categoryId, 25]);
  });

  it('encadeia o cursor opaco sem baixar o razão inteiro', async () => {
    const first = createExpenseDetailsPayload(true);
    const second = createExpenseDetailsPayload(false);
    second.items[0].allocationId = '44444444-4444-4444-8444-444444444444';
    const abortSignal = vi.fn()
      .mockResolvedValueOnce({ data: first, error: null })
      .mockResolvedValueOnce({ data: second, error: null });
    vi.mocked(supabase.rpc).mockImplementation(() => ({ abortSignal }) as never);
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => usePresentationExpenseDetails({ companyId, month: '2026-03', categoryId, enabled: true, limit: 25 }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(result.current.rows).toHaveLength(1);
    await act(async () => { await result.current.fetchNextPage(); });
    await waitFor(() => expect(result.current.rows).toHaveLength(2));
    expect(supabase.rpc).toHaveBeenNthCalledWith(1, 'get_fin_presentation_expense_details', {
      p_month: '2026-03', p_category_id: categoryId, p_cursor: undefined, p_limit: 25,
    });
    expect(supabase.rpc).toHaveBeenNthCalledWith(2, 'get_fin_presentation_expense_details', expect.objectContaining({
      p_cursor: first.nextCursor,
    }));
    client.clear();
  });
});

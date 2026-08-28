import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type { PresentationExpenseDetailCursor, YearMonth } from '@/domain/financeiro/presentation';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { useDataEvent } from '@/lib/dataEvents';
import { adaptPresentationExpenseDetailsPayload } from '@/lib/expenseDetailsPresentationAdapter';

type ExpenseDetailsRpcArgs = Database['public']['Functions']['get_fin_presentation_expense_details']['Args'];

export const PRESENTATION_EXPENSE_DETAILS_QUERY_ROOT = ['financeiro', 'presentation-socios', 'expense-details'] as const;

function cursorParam(cursor: PresentationExpenseDetailCursor | null): Json | undefined {
  return cursor?.state === 'available' ? { ...cursor } : undefined;
}

export function createPresentationExpenseDetailsQueryKey(
  companyId: string | null | undefined,
  month: YearMonth,
  categoryId: string | null,
  limit: number,
) {
  return [...PRESENTATION_EXPENSE_DETAILS_QUERY_ROOT, companyId ?? 'unresolved', month, categoryId ?? 'all', limit] as const;
}

export function usePresentationExpenseDetails({
  companyId,
  month,
  categoryId,
  enabled,
  limit = 25,
}: {
  companyId: string | null | undefined;
  month: YearMonth;
  categoryId: string | null;
  enabled: boolean;
  limit?: number;
}) {
  const queryClient = useQueryClient();
  const queryKey = useMemo(
    () => createPresentationExpenseDetailsQueryKey(companyId, month, categoryId, limit),
    [categoryId, companyId, limit, month],
  );
  const query = useInfiniteQuery({
    queryKey,
    initialPageParam: null as PresentationExpenseDetailCursor | null,
    queryFn: async ({ pageParam, signal }) => {
      const params: ExpenseDetailsRpcArgs = {
        p_month: month,
        p_category_id: categoryId ?? undefined,
        p_cursor: cursorParam(pageParam),
        p_limit: limit,
      };
      const request = supabase.rpc('get_fin_presentation_expense_details', params);
      const { data, error } = await request.abortSignal(signal);
      if (error) throw error;
      return adaptPresentationExpenseDetailsPayload(data);
    },
    getNextPageParam: page => page.nextCursor.state === 'available' ? page.nextCursor : undefined,
    enabled: enabled && Boolean(companyId),
  });
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PRESENTATION_EXPENSE_DETAILS_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);
  return {
    ...query,
    rows: query.data?.pages.flatMap(page => page.items) ?? [],
  };
}

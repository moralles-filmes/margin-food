import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  isPresentationYearMonth,
  normalizePresentationHistoryYears,
  type DataAvailability,
  type PresentationExpensesData,
  type YearMonth,
} from '@/domain/financeiro/presentation';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useDataEvent } from '@/lib/dataEvents';
import {
  PresentationExpensesPayloadError,
  adaptPresentationExpensesPayload,
  createSafeExpensesPayloadDiagnostic,
} from '@/lib/expensesPresentationAdapter';

type PresentationExpensesRpcArgs = Database['public']['Functions']['get_fin_presentation_expenses']['Args'];

export const PRESENTATION_EXPENSES_QUERY_ROOT = ['financeiro', 'presentation-socios', 'expenses'] as const;

export interface PresentationExpensesQueryDefinition {
  params: PresentationExpensesRpcArgs;
  queryKey: readonly unknown[];
}

export interface PresentationExpensesQueryOptions {
  companyId: string | null | undefined;
  month: YearMonth;
  historyYears: readonly number[];
  enabled: boolean;
}

interface PresentationExpensesQueryState {
  data?: PresentationExpensesData;
  error: unknown;
  isPending: boolean;
}

function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const shape = error as { code?: unknown; message?: unknown };
  return shape.code === '42501'
    || (typeof shape.message === 'string' && shape.message.includes('PERMISSION_DENIED'));
}

export function createPresentationExpensesQueryDefinition(
  month: YearMonth,
  historyYears: readonly number[],
  companyId?: string | null,
): PresentationExpensesQueryDefinition {
  if (!isPresentationYearMonth(month)) throw new RangeError('Mês de despesas inválido.');
  const normalizedYears = normalizePresentationHistoryYears(historyYears);
  return {
    params: { p_month: month, p_history_years: normalizedYears },
    queryKey: [...PRESENTATION_EXPENSES_QUERY_ROOT, companyId ?? 'unresolved', month, ...normalizedYears],
  };
}

export async function fetchPresentationExpenses(
  definition: PresentationExpensesQueryDefinition,
  signal?: AbortSignal,
): Promise<PresentationExpensesData> {
  const request = supabase.rpc('get_fin_presentation_expenses', definition.params);
  const { data, error } = signal ? await request.abortSignal(signal) : await request;
  if (error) throw error;
  try {
    return adaptPresentationExpensesPayload(data);
  } catch (adapterError) {
    if (adapterError instanceof PresentationExpensesPayloadError) {
      console.error(
        '[Apresentação Sócios] Payload de Despesas incompatível com o contrato.',
        createSafeExpensesPayloadDiagnostic(data, adapterError),
      );
    }
    throw adapterError;
  }
}

export function presentationExpensesQueryAvailability(
  canView: boolean,
  query: PresentationExpensesQueryState,
): DataAvailability<PresentationExpensesData> {
  if (!canView) return { state: 'unavailable', reason: 'permission-denied' };
  if (query.data) {
    if (query.data.availability === 'available') {
      return { state: 'available', data: query.data, fetchedAt: query.data.generatedAt };
    }
    if (query.data.availability === 'empty') {
      return { state: 'empty', data: query.data, fetchedAt: query.data.generatedAt };
    }
    return { state: 'unavailable', reason: 'missing-canonical-source' };
  }
  if (query.isPending) return { state: 'loading' };
  if (isPermissionError(query.error)) return { state: 'unavailable', reason: 'permission-denied' };
  if (query.error) return { state: 'error', message: 'Não foi possível carregar as Despesas do DFC.' };
  return { state: 'idle' };
}

export function usePresentationExpenses(options: PresentationExpensesQueryOptions) {
  const queryClient = useQueryClient();
  const definition = useMemo(() => createPresentationExpensesQueryDefinition(
    options.month,
    options.historyYears,
    options.companyId,
  ), [options.companyId, options.historyYears, options.month]);
  const query = useQuery({
    queryKey: definition.queryKey,
    queryFn: ({ signal }) => fetchPresentationExpenses(definition, signal),
    enabled: options.enabled && Boolean(options.companyId),
    retry: (failureCount, error) => (
      failureCount < 1
      && !isPermissionError(error)
      && !(error instanceof PresentationExpensesPayloadError)
    ),
  });
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PRESENTATION_EXPENSES_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);
  return {
    ...query,
    definition,
    availability: presentationExpensesQueryAvailability(options.enabled, query),
  };
}

import { useCallback, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import {
  isPresentationYearMonth,
  normalizePresentationHistoryYears,
  type DataAvailability,
  type PresentationRevenueData,
  type YearMonth,
} from '@/domain/financeiro/presentation';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useDataEvent } from '@/lib/dataEvents';
import {
  PresentationRevenuePayloadError,
  adaptPresentationRevenuePayload,
  createSafeRevenuePayloadDiagnostic,
} from '@/lib/revenuePresentationAdapter';

type PresentationRevenueRpcArgs = Database['public']['Functions']['get_fin_presentation_revenue']['Args'];

export const PRESENTATION_REVENUE_QUERY_ROOT = ['financeiro', 'presentation-socios', 'revenue'] as const;

export interface PresentationRevenueQueryDefinition {
  params: PresentationRevenueRpcArgs;
  queryKey: readonly unknown[];
}

export interface PresentationRevenueQueryOptions {
  companyId: string | null | undefined;
  month: YearMonth;
  historyYears: readonly number[];
  enabled: boolean;
}

interface PresentationRevenueQueryState {
  data?: PresentationRevenueData;
  error: unknown;
  isPending: boolean;
}

function isPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const shape = error as { code?: unknown; message?: unknown };
  return shape.code === '42501'
    || (typeof shape.message === 'string' && shape.message.includes('PERMISSION_DENIED'));
}

export function createPresentationRevenueQueryDefinition(
  month: YearMonth,
  historyYears: readonly number[],
  companyId?: string | null,
): PresentationRevenueQueryDefinition {
  if (!isPresentationYearMonth(month)) throw new RangeError('Mês de faturamento inválido.');
  const normalizedYears = normalizePresentationHistoryYears(historyYears);
  return {
    params: { p_month: month, p_history_years: normalizedYears },
    queryKey: [
      ...PRESENTATION_REVENUE_QUERY_ROOT,
      companyId ?? 'unresolved',
      month,
      ...normalizedYears,
    ] as const,
  };
}

export async function fetchPresentationRevenue(
  definition: PresentationRevenueQueryDefinition,
  signal?: AbortSignal,
): Promise<PresentationRevenueData> {
  const request = supabase.rpc('get_fin_presentation_revenue', definition.params);
  const { data, error } = signal ? await request.abortSignal(signal) : await request;
  if (error) throw error;
  try {
    return adaptPresentationRevenuePayload(data);
  } catch (adapterError) {
    if (adapterError instanceof PresentationRevenuePayloadError) {
      console.error(
        '[Apresentação Sócios] Payload de Faturamento incompatível com o contrato.',
        createSafeRevenuePayloadDiagnostic(data, adapterError),
      );
    }
    throw adapterError;
  }
}

export function presentationRevenueQueryAvailability(
  canView: boolean,
  query: PresentationRevenueQueryState,
): DataAvailability<PresentationRevenueData> {
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
  if (query.error) {
    return { state: 'error', message: 'Não foi possível carregar o Faturamento do Fechamento de Caixa.' };
  }
  return { state: 'idle' };
}

export function usePresentationRevenue(options: PresentationRevenueQueryOptions) {
  const queryClient = useQueryClient();
  const definition = useMemo(() => createPresentationRevenueQueryDefinition(
    options.month,
    options.historyYears,
    options.companyId,
  ), [options.companyId, options.historyYears, options.month]);
  const query = useQuery({
    queryKey: definition.queryKey,
    queryFn: ({ signal }) => fetchPresentationRevenue(definition, signal),
    enabled: options.enabled && Boolean(options.companyId),
    retry: (failureCount, error) => (
      failureCount < 1
      && !isPermissionError(error)
      && !(error instanceof PresentationRevenuePayloadError)
    ),
  });
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PRESENTATION_REVENUE_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);
  return {
    ...query,
    definition,
    availability: presentationRevenueQueryAvailability(options.enabled, query),
  };
}

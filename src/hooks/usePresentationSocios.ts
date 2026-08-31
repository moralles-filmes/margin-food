import { useCallback, useMemo } from 'react';
import { keepPreviousData, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  buildPresentationComparisons,
  normalizePresentationPeriod,
  type AvailablePeriodBounds,
  type DataAvailability,
  type PresentationComparisons,
  type PresentationPeriodFilter,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useDataEvent } from '@/lib/dataEvents';
import {
  PresentationPayloadError,
  adaptPresentationSociosPayload,
  createSafePresentationPayloadDiagnostic,
  type PresentationAdapterContext,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';

type PresentationRpcArgs = Database['public']['Functions']['get_fin_presentation_socios']['Args'];

export const PRESENTATION_SOCIOS_QUERY_ROOT = ['financeiro', 'presentation-socios'] as const;

export interface PresentationQueryDefinition {
  context: PresentationAdapterContext;
  comparisons: PresentationComparisons;
  params: PresentationRpcArgs;
  queryKey: readonly unknown[];
}

export interface PresentationQueryOptions {
  companyId: string | null | undefined;
  filter: PresentationPeriodFilter;
  availableBounds?: AvailablePeriodBounds;
  granularity: TimeSeriesGranularity;
  rankingLimit: number;
  enabled: boolean;
}

interface PresentationQueryState {
  data?: PresentationSociosData;
  error: unknown;
  isPending: boolean;
}

interface PostgrestErrorShape {
  code?: unknown;
  message?: unknown;
}

function readErrorShape(error: unknown): PostgrestErrorShape | null {
  return typeof error === 'object' && error !== null
    ? error as PostgrestErrorShape
    : null;
}

export function isPresentationPermissionError(error: unknown): boolean {
  const shape = readErrorShape(error);
  return shape?.code === '42501'
    || (typeof shape?.message === 'string' && shape.message.includes('PERMISSION_DENIED'));
}

export function presentationErrorMessage(error: unknown): string {
  if (isPresentationPermissionError(error)) {
    return 'Você não tem permissão para consultar a Apresentação Sócios.';
  }
  if (error instanceof PresentationPayloadError) {
    return 'Os dados retornados estão incompatíveis com o contrato da apresentação.';
  }
  return 'Não foi possível carregar a Apresentação Sócios. Tente novamente.';
}

export function createPresentationQueryDefinition(
  filter: PresentationPeriodFilter,
  availableBounds: AvailablePeriodBounds | undefined,
  granularity: TimeSeriesGranularity,
  rankingLimit: number,
  companyId?: string | null,
): PresentationQueryDefinition {
  if (!Number.isInteger(rankingLimit) || rankingLimit < 1 || rankingLimit > 50) {
    throw new RangeError('Presentation ranking limit must be an integer between 1 and 50');
  }

  const period = normalizePresentationPeriod(filter, { availableBounds });
  const comparisons = buildPresentationComparisons(filter, period, availableBounds);
  const params: PresentationRpcArgs = {
    p_start: period.start,
    p_end_exclusive: period.endExclusive,
    p_previous_start: comparisons.previousPeriod.range.start,
    p_previous_end_exclusive: comparisons.previousPeriod.range.endExclusive,
    p_previous_year_start: comparisons.previousYear.range.start,
    p_previous_year_end_exclusive: comparisons.previousYear.range.endExclusive,
    p_granularity: granularity,
    p_ranking_limit: rankingLimit,
  };
  const context: PresentationAdapterContext = {
    filter,
    period,
    previousPeriod: comparisons.previousPeriod.range,
    previousYear: comparisons.previousYear.range,
    granularity,
    rankingLimit,
  };

  return {
    context,
    comparisons,
    params,
    queryKey: [
      ...PRESENTATION_SOCIOS_QUERY_ROOT,
      companyId ?? 'unresolved',
      period.start,
      period.endExclusive,
      comparisons.previousPeriod.range.start,
      comparisons.previousPeriod.range.endExclusive,
      comparisons.previousYear.range.start,
      comparisons.previousYear.range.endExclusive,
      granularity,
      rankingLimit,
      filter,
    ] as const,
  };
}

export async function fetchPresentationSocios(
  definition: PresentationQueryDefinition,
  signal?: AbortSignal,
): Promise<PresentationSociosData> {
  const request = supabase.rpc('get_fin_presentation_socios', definition.params);
  const { data, error } = signal
    ? await request.abortSignal(signal)
    : await request;
  if (error) throw error;
  try {
    return adaptPresentationSociosPayload(data, definition.context);
  } catch (adapterError) {
    if (adapterError instanceof PresentationPayloadError) {
      console.error(
        '[Apresentação Sócios] Payload incompatível com o contrato.',
        createSafePresentationPayloadDiagnostic(data, adapterError),
      );
    }
    throw adapterError;
  }
}

export function presentationQueryAvailability(
  canView: boolean,
  query: PresentationQueryState,
): DataAvailability<PresentationSociosData> {
  if (!canView) return { state: 'unavailable', reason: 'permission-denied' };
  if (query.data) {
    return { state: 'available', data: query.data, fetchedAt: query.data.generatedAt };
  }
  if (query.isPending) return { state: 'loading' };
  if (isPresentationPermissionError(query.error)) {
    return { state: 'unavailable', reason: 'permission-denied' };
  }
  if (query.error) return { state: 'error', message: presentationErrorMessage(query.error) };
  return { state: 'idle' };
}

export function usePresentationSocios(options: PresentationQueryOptions) {
  const queryClient = useQueryClient();
  const definition = useMemo(() => createPresentationQueryDefinition(
    options.filter,
    options.availableBounds,
    options.granularity,
    options.rankingLimit,
    options.companyId,
  ), [options.filter, options.availableBounds, options.granularity, options.rankingLimit, options.companyId]);

  const query = useQuery({
    queryKey: definition.queryKey,
    queryFn: ({ signal }) => fetchPresentationSocios(definition, signal),
    enabled: options.enabled && Boolean(options.companyId),
    // Mantém os dados do período anterior visíveis enquanto o novo período
    // carrega — sem isso, `query.data` fica undefined por um instante a cada
    // troca de filtro, o que derruba a condição de render em
    // ApresentacaoSociosSection (linha ~449) e desmonta o toolbar de filtros,
    // fazendo o rascunho do mês voltar ao valor original.
    placeholderData: keepPreviousData,
    retry: (failureCount, error) => (
      failureCount < 1
      && !isPresentationPermissionError(error)
      && !(error instanceof PresentationPayloadError)
    ),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PRESENTATION_SOCIOS_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);

  return {
    ...query,
    definition,
    availability: presentationQueryAvailability(options.enabled, query),
  };
}

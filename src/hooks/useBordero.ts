import { useCallback } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useDataEvent } from '@/lib/dataEvents';
import {
  BorderoContractError,
  buildBorderoReport,
  parseBorderoPayload,
  type BorderoPeriod,
  type BorderoReport,
} from '@/domain/financeiro/bordero';

export const BORDERO_QUERY_ROOT = ['financeiro', 'bordero'] as const;

export interface UseBorderoOptions {
  companyId: string | null | undefined;
  /** `null` quando o filtro ainda não forma um período válido. */
  period: BorderoPeriod | null;
  enabled: boolean;
}

export function isBorderoPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const { code, message } = error as { code?: unknown; message?: unknown };
  if (code === '42501') return true;
  return typeof message === 'string' && /PERMISSION_DENIED|COMPANY_ACCESS_DENIED/.test(message);
}

export async function fetchBorderoReport(
  supabase: ReturnType<typeof useSupabase>,
  period: BorderoPeriod,
  signal?: AbortSignal,
): Promise<BorderoReport> {
  let request = supabase.rpc('get_fin_bordero', { p_inicio: period.start, p_fim: period.end });
  if (signal) request = request.abortSignal(signal);
  const { data, error } = await request;
  if (error) {
    console.error('[Borderô] Falha ao carregar get_fin_bordero:', error);
    throw error;
  }
  const report = buildBorderoReport(parseBorderoPayload(data));
  if (report.period.start !== period.start || report.period.end !== period.end) {
    throw new BorderoContractError('O período devolvido pelo servidor não corresponde ao solicitado.');
  }
  return report;
}

/**
 * Dados do Borderô da unidade ativa. A chave inclui unidade e período: ao trocar
 * o filtro a consulta nova começa sem dados (nenhum valor do filtro anterior fica
 * na tela), e o tenant real é resolvido no banco pelo header da unidade.
 */
export function useBordero({ companyId, period, enabled }: UseBorderoOptions) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: [...BORDERO_QUERY_ROOT, companyId ?? 'unresolved', period?.start ?? null, period?.end ?? null],
    queryFn: ({ signal }) => fetchBorderoReport(supabase, period!, signal),
    enabled: enabled && Boolean(companyId) && period !== null,
    retry: (failureCount, error) => failureCount < 1
      && !isBorderoPermissionError(error)
      && !(error instanceof BorderoContractError),
  });

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: BORDERO_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);

  return query;
}

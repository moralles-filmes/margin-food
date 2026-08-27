import { createElement, type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import type { PresentationPeriodFilter } from '@/domain/financeiro/presentation';
import {
  createPresentationQueryDefinition,
  fetchPresentationSocios,
  presentationQueryAvailability,
  usePresentationSocios,
} from './usePresentationSocios';
import { supabase } from '@/integrations/supabase/client';
import { PresentationPayloadError } from '@/lib/financeiroPresentationAdapter';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

const bounds = { minDate: '2023-01-01', maxDate: '2026-08-25' };
const companyId = '11111111-1111-4111-8111-111111111111';

function rpcSnapshot(range: { start: string; endExclusive: string }) {
  return {
    range,
    metrics: {
      managerialResult: { revenue: 0, expense: 0, result: 0, marginPercent: 0 },
      openItems: {
        accountsPayableOpen: { amount: 0, count: 0 },
        accountsReceivableOpen: { amount: 0, count: 0 },
      },
    },
    timeSeries: { granularity: 'month', points: [] },
    categoryComposition: {
      operational: { revenue: [], expense: [] },
      nonOperational: { revenue: [], expense: [] },
    },
    rankings: { topRevenueCategories: [], topExpenseCategories: [] },
    nonOperationalTotals: { revenue: 0, expense: 0, result: 0 },
  };
}

function rpcPayload(definition: ReturnType<typeof createPresentationQueryDefinition>) {
  return {
    contractVersion: '1.0',
    generatedAt: '2026-08-25T12:00:00Z',
    availableBounds: bounds,
    categoryDefinitions: [],
    current: rpcSnapshot(definition.context.period),
    previousPeriod: rpcSnapshot(definition.context.previousPeriod),
    previousYear: rpcSnapshot(definition.context.previousYear),
  };
}

describe('definição tipada da query da Apresentação Sócios', () => {
  it.each<[
    string,
    PresentationPeriodFilter,
    string,
    string,
    string,
    string,
    string,
    string,
  ]>([
    ['mês', { kind: 'month', month: '2026-03' }, '2026-03-01', '2026-04-01', '2026-02-01', '2026-03-01', '2025-03-01', '2025-04-01'],
    ['intervalo de meses', { kind: 'month-range', startMonth: '2026-01', endMonth: '2026-03' }, '2026-01-01', '2026-04-01', '2025-10-01', '2026-01-01', '2025-01-01', '2025-04-01'],
    ['ano', { kind: 'year', year: 2026 }, '2026-01-01', '2027-01-01', '2025-01-01', '2026-01-01', '2025-01-01', '2026-01-01'],
    ['acumulado do ano', { kind: 'year-to-date', year: 2026, through: '2026-08-25' }, '2026-01-01', '2026-08-26', '2025-01-01', '2025-08-26', '2025-01-01', '2025-08-26'],
    ['todo o período', { kind: 'all-time' }, '2023-01-01', '2026-08-26', '2019-05-09', '2023-01-01', '2022-01-01', '2025-08-26'],
    ['personalizado', { kind: 'custom', start: '2026-03-10', endInclusive: '2026-04-05' }, '2026-03-10', '2026-04-06', '2026-02-11', '2026-03-10', '2025-03-10', '2025-04-06'],
  ])(
    'usa normalizePresentationPeriod e buildPresentationComparisons no filtro %s',
    (_label, filter, start, end, previousStart, previousEnd, yearStart, yearEnd) => {
      const definition = createPresentationQueryDefinition(filter, bounds, 'month', 10);
      expect(definition.params).toEqual({
        p_start: start,
        p_end_exclusive: end,
        p_previous_start: previousStart,
        p_previous_end_exclusive: previousEnd,
        p_previous_year_start: yearStart,
        p_previous_year_end_exclusive: yearEnd,
        p_granularity: 'month',
        p_ranking_limit: 10,
      });
      expect(definition.params).not.toHaveProperty('company_id');
      expect(definition.queryKey).toEqual(expect.arrayContaining([
        start,
        end,
        previousStart,
        previousEnd,
        yearStart,
        yearEnd,
        'month',
      ]));
    },
  );

  it.each(['day', 'month', 'year'] as const)('transporta e diferencia a granularidade %s na queryKey', granularity => {
    const definition = createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' },
      bounds,
      granularity,
      5,
    );
    expect(definition.params.p_granularity).toBe(granularity);
    expect(definition.params.p_ranking_limit).toBe(5);
    expect(definition.queryKey).toContain(granularity);
    expect(definition.queryKey).toContain(5);
  });

  it('recusa limite de ranking fora do contrato da RPC', () => {
    expect(() => createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' }, bounds, 'month', 0,
    )).toThrow();
    expect(() => createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' }, bounds, 'month', 51,
    )).toThrow();
  });

  it('faz uma única RPC por chave de cache válida e reutiliza a chave anterior', async () => {
    const client = new QueryClient({
      defaultOptions: { queries: { retry: false, staleTime: 60_000 } },
    });
    const definition = createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' }, bounds, 'month', 10,
    );
    vi.mocked(supabase.rpc).mockImplementation(() => ({
      abortSignal: vi.fn().mockResolvedValue({ data: rpcPayload(definition), error: null }),
    }) as never);
    const wrapper = ({ children }: PropsWithChildren) => createElement(
      QueryClientProvider,
      { client },
      children,
    );
    const { result, rerender, unmount } = renderHook(
      ({ rankingLimit }) => usePresentationSocios({
        companyId,
        filter: { kind: 'month', month: '2026-03' },
        availableBounds: bounds,
        granularity: 'month',
        rankingLimit,
        enabled: true,
      }),
      { initialProps: { rankingLimit: 10 }, wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledOnce();
    rerender({ rankingLimit: 10 });
    expect(supabase.rpc).toHaveBeenCalledOnce();

    const secondDefinition = createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' }, bounds, 'month', 5,
    );
    vi.mocked(supabase.rpc).mockImplementation(() => ({
      abortSignal: vi.fn().mockResolvedValue({ data: rpcPayload(secondDefinition), error: null }),
    }) as never);
    rerender({ rankingLimit: 5 });
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2));
    rerender({ rankingLimit: 10 });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledTimes(2);

    unmount();
    client.clear();
  });

  it('isola o cache por empresa sem enviar company_id à RPC', () => {
    const first = createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' }, bounds, 'month', 10, companyId,
    );
    const secondCompanyId = '22222222-2222-4222-8222-222222222222';
    const second = createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' }, bounds, 'month', 10, secondCompanyId,
    );
    expect(first.queryKey).toContain(companyId);
    expect(second.queryKey).toContain(secondCompanyId);
    expect(first.queryKey).not.toEqual(second.queryKey);
    expect(first.params).not.toHaveProperty('company_id');
  });
});

describe('estados de erro e RBAC da consulta', () => {
  it('não expõe dados e informa permission-denied sem a permissão de view', () => {
    expect(presentationQueryAvailability(false, {
      data: undefined,
      error: null,
      isPending: true,
    })).toEqual({ state: 'unavailable', reason: 'permission-denied' });
  });

  it('converte a recusa 42501 do backend para indisponibilidade por RBAC', () => {
    expect(presentationQueryAvailability(true, {
      data: undefined,
      error: { code: '42501', message: 'PERMISSION_DENIED: financeiro:relatorio-socios:view' },
      isPending: false,
    })).toEqual({ state: 'unavailable', reason: 'permission-denied' });
  });

  it('expõe falha não-RBAC como error sem detalhes internos', () => {
    expect(presentationQueryAvailability(true, {
      data: undefined,
      error: new Error('network down'),
      isPending: false,
    })).toEqual({
      state: 'error',
      message: 'Não foi possível carregar a Apresentação Sócios. Tente novamente.',
    });
  });

  it('registra payload incompatível somente por estrutura, sem valores do tenant', async () => {
    const definition = createPresentationQueryDefinition(
      { kind: 'month', month: '2026-03' },
      bounds,
      'month',
      10,
    );
    const sensitiveValue = 'valor-financeiro-interno-que-nao-pode-ser-logado';
    const abortSignal = vi.fn().mockResolvedValue({
      data: {
        contractVersion: '0.9',
        generatedAt: '2026-08-25T12:00:00Z',
        sensitiveValue,
      },
      error: null,
    });
    vi.mocked(supabase.rpc).mockReturnValue({ abortSignal } as never);
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

    await expect(fetchPresentationSocios(definition, new AbortController().signal))
      .rejects.toBeInstanceOf(PresentationPayloadError);

    expect(consoleError).toHaveBeenCalledOnce();
    const diagnostic = consoleError.mock.calls[0][1];
    expect(diagnostic).toMatchObject({
      error: { path: 'contractVersion', expectation: '1.0' },
      payload: { type: 'object' },
    });
    expect(JSON.stringify(diagnostic)).not.toContain(sensitiveValue);
  });
});

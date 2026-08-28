import { createElement, type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { createPresentationRevenueData } from '@/test/fixtures/presentationRevenue';
import {
  createPresentationRevenueQueryDefinition,
  presentationRevenueQueryAvailability,
  usePresentationRevenue,
} from '@/hooks/usePresentationRevenue';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

const companyId = '11111111-1111-4111-8111-111111111111';

describe('consulta dedicada de Faturamento da Apresentação Sócios', () => {
  it.each([
    [[2026], 1],
    [[2025, 2026], 2],
    [[2024, 2025, 2026], 3],
  ] as const)('aceita %i ano(s) e ordena a chave deterministicamente', (years, count) => {
    const definition = createPresentationRevenueQueryDefinition('2026-03', years, companyId);
    expect(definition.params).toEqual({ p_month: '2026-03', p_history_years: [...years] });
    expect(definition.params).not.toHaveProperty('company_id');
    expect(definition.queryKey).toContain(companyId);
    expect(definition.queryKey.slice(-count)).toEqual([...years]);
  });

  it('ordena anos distintos e rejeita o quarto ano', () => {
    expect(createPresentationRevenueQueryDefinition('2026-03', [2026, 2024, 2025]).params.p_history_years)
      .toEqual([2024, 2025, 2026]);
    expect(() => createPresentationRevenueQueryDefinition('2026-03', [2023, 2024, 2025, 2026]))
      .toThrow(/um a três anos/i);
    expect(() => createPresentationRevenueQueryDefinition('2026-03', [2026, 2026]))
      .toThrow(/distintos/i);
  });

  it('faz uma única RPC agregada por chave e isola o cache por empresa', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: 60_000 } } });
    vi.mocked(supabase.rpc).mockImplementation(() => ({
      abortSignal: vi.fn().mockResolvedValue({ data: createPresentationRevenueData(), error: null }),
    }) as never);
    const wrapper = ({ children }: PropsWithChildren) => createElement(
      QueryClientProvider,
      { client },
      children,
    );
    const { result, rerender, unmount } = renderHook(
      ({ historyYears }) => usePresentationRevenue({
        companyId,
        month: '2026-03',
        historyYears,
        enabled: true,
      }),
      { initialProps: { historyYears: [2024, 2025, 2026] as readonly number[] }, wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('get_fin_presentation_revenue', {
      p_month: '2026-03',
      p_history_years: [2024, 2025, 2026],
    });
    rerender({ historyYears: [2024, 2025, 2026] });
    expect(supabase.rpc).toHaveBeenCalledOnce();
    rerender({ historyYears: [2025, 2026] });
    await waitFor(() => expect(supabase.rpc).toHaveBeenCalledTimes(2));

    unmount();
    client.clear();
  });

  it('preserva idle, loading, available, empty, unavailable e error', () => {
    const available = createPresentationRevenueData();
    expect(presentationRevenueQueryAvailability(true, { data: undefined, error: null, isPending: false }))
      .toEqual({ state: 'idle' });
    expect(presentationRevenueQueryAvailability(true, { data: undefined, error: null, isPending: true }))
      .toEqual({ state: 'loading' });
    expect(presentationRevenueQueryAvailability(true, { data: available, error: null, isPending: false }))
      .toMatchObject({ state: 'available', data: available });
    expect(presentationRevenueQueryAvailability(true, {
      data: { ...available, availability: 'empty' }, error: null, isPending: false,
    })).toMatchObject({ state: 'empty' });
    expect(presentationRevenueQueryAvailability(true, {
      data: { ...available, availability: 'unavailable' }, error: null, isPending: false,
    })).toEqual({ state: 'unavailable', reason: 'missing-canonical-source' });
    expect(presentationRevenueQueryAvailability(false, { data: undefined, error: null, isPending: true }))
      .toEqual({ state: 'unavailable', reason: 'permission-denied' });
    expect(presentationRevenueQueryAvailability(true, {
      data: undefined, error: new Error('network'), isPending: false,
    })).toEqual({ state: 'error', message: 'Não foi possível carregar o Faturamento do Fechamento de Caixa.' });
  });
});

import { createElement, type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { describe, expect, it, vi } from 'vitest';
import { supabase } from '@/integrations/supabase/client';
import { usePresentationExpenses, createPresentationExpensesQueryDefinition, presentationExpensesQueryAvailability } from '@/hooks/usePresentationExpenses';
import { createPresentationExpensesData } from '@/test/fixtures/presentationExpenses';

vi.mock('@/integrations/supabase/client', () => ({ supabase: { rpc: vi.fn() } }));
const companyId = '11111111-1111-4111-8111-111111111111';

describe('consulta dedicada de Despesas da Apresentação Sócios', () => {
  it('normaliza anos, não envia company_id e isola o cache por empresa', () => {
    const definition = createPresentationExpensesQueryDefinition('2026-03', [2026, 2024, 2025], companyId);
    expect(definition.params).toEqual({ p_month: '2026-03', p_history_years: [2024, 2025, 2026] });
    expect(definition.params).not.toHaveProperty('company_id');
    expect(definition.queryKey).toContain(companyId);
    expect(() => createPresentationExpensesQueryDefinition('2026-03', [2023, 2024, 2025, 2026])).toThrow(/um a três anos/i);
  });

  it('faz uma única RPC agregada por chave', async () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.mocked(supabase.rpc).mockImplementation(() => ({ abortSignal: vi.fn().mockResolvedValue({ data: transport(), error: null }) }) as never);
    const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
    const { result } = renderHook(() => usePresentationExpenses({ companyId, month: '2026-03', historyYears: [2024, 2025, 2026], enabled: true }), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledOnce();
    expect(supabase.rpc).toHaveBeenCalledWith('get_fin_presentation_expenses', { p_month: '2026-03', p_history_years: [2024, 2025, 2026] });
    client.clear();
  });

  it('preserva todos os estados explícitos', () => {
    const data = createPresentationExpensesData();
    expect(presentationExpensesQueryAvailability(true, { data: undefined, error: null, isPending: false })).toEqual({ state: 'idle' });
    expect(presentationExpensesQueryAvailability(true, { data: undefined, error: null, isPending: true })).toEqual({ state: 'loading' });
    expect(presentationExpensesQueryAvailability(true, { data, error: null, isPending: false })).toMatchObject({ state: 'available' });
    expect(presentationExpensesQueryAvailability(true, { data: { ...data, availability: 'empty' }, error: null, isPending: false })).toMatchObject({ state: 'empty' });
    expect(presentationExpensesQueryAvailability(false, { data: undefined, error: null, isPending: true })).toEqual({ state: 'unavailable', reason: 'permission-denied' });
    expect(presentationExpensesQueryAvailability(true, { data: undefined, error: new Error('network'), isPending: false })).toMatchObject({ state: 'error' });
  });
});

function transport() {
  const data = structuredClone(createPresentationExpensesData());
  const flatten = (nodes: typeof data.tree): unknown[] => nodes.flatMap(node => [{ ...node, children: undefined }, ...flatten(node.children)]);
  return { ...data, tree: flatten(data.tree).map((node) => { const copy = { ...(node as Record<string, unknown>) }; delete copy.children; return copy; }) };
}

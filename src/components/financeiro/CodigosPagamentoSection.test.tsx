import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import CodigosPagamentoSection from './CodigosPagamentoSection';

const BOLETO = '00190.00009 01234.567890 12345.678901 1 00000000123456';
const PIX = '00020126580014BR.GOV.BCB.PIX0136a1b2c3d4-0000-4000-8000-0000000000015204000053039865802BR6304ABCD';

const state = vi.hoisted(() => ({
  rpcCalls: [] as string[],
  erro: false,
  vazio: false,
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

const item = (over: Record<string, unknown>) => ({
  id: 'x', descricao: 'Boleto', fornecedor: 'Fornecedor Teste', categorias: 'Insumos', data_vencimento: '2026-10-10',
  valor: 100, status: 'APROVADO', status_exibicao: 'APROVADO', tipo_codigo_pagamento: 'boleto', codigo_pagamento: BOLETO, ...over,
});

const supabase = {
  rpc(name: string) {
    state.rpcCalls.push(name);
    if (state.erro) return Promise.resolve({ data: null, error: { message: 'falha simulada' } });
    return Promise.resolve({
      data: {
        items: state.vazio ? [] : [item({ id: 'a' }), item({ id: 'b', fornecedor: 'Outro Fornecedor', tipo_codigo_pagamento: 'pix_copia_cola', codigo_pagamento: PIX })],
        has_more: false,
        categorias: [],
      },
      error: null,
    });
  },
};

vi.mock('@/contexts/CompanyScopeContext', () => ({ useSupabase: () => supabase, useCompanyScope: () => ({ companyId: 'empresa-teste' }) }));
vi.mock('@/permissions/hooks', () => ({ useCan: () => true }));
vi.mock('@/hooks/useScopedToast', () => ({ useScopedToast: () => state.toast }));
vi.mock('@/lib/dataEvents', () => ({ useDataEvent: () => undefined }));
vi.mock('@/hooks/useNavigationRequest', () => ({ requestNavigation: vi.fn() }));

beforeEach(() => { state.rpcCalls = []; state.erro = false; state.vazio = false; });
afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Códigos de Pagamento (V2)', () => {
  it('copia exatamente o código original (zeros à esquerda e PIX) e diz quantos estão carregados', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    render(<CodigosPagamentoSection />);

    expect(await screen.findByText('2 códigos carregados')).toBeInTheDocument();
    // Tabela e cartões ficam no DOM (container query); o primeiro de cada nome basta.
    fireEvent.click(screen.getAllByRole('button', { name: 'Copiar código de Fornecedor Teste' })[0]);
    fireEvent.click(screen.getAllByRole('button', { name: 'Copiar código de Outro Fornecedor' })[0]);
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(2));
    expect(writeText.mock.calls.map(c => c[0])).toEqual([BOLETO, PIX]);
    expect(state.rpcCalls.every(n => n === 'list_fin_codigos_pagamento')).toBe(true);
  });

  it('erro com nova tentativa e vazio', async () => {
    state.erro = true;
    const { unmount } = render(<CodigosPagamentoSection />);
    expect(await screen.findByText('Não foi possível carregar os códigos de pagamento.')).toBeInTheDocument();
    unmount();

    state.erro = false;
    state.vazio = true;
    render(<CodigosPagamentoSection />);
    expect(await screen.findByText('Nenhum código de pagamento encontrado para os filtros selecionados.')).toBeInTheDocument();
  });
});

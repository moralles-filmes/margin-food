/**
 * useMovimentacaoOperacional — o operacional só registra saída.
 *
 * O tipo não é escolha da tela: o hook sempre envia SAIDA. O banco também
 * recusa qualquer outro tipo (op_registrar_movimentacao → TIPO_INVALIDO), então
 * este teste cobre a metade do cliente; a do servidor é a migration.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useMovimentacaoOperacional } from '@/hooks/useMovimentacaoOperacional';

const rpc = vi.fn();
// Mesmo objeto a cada render: o hook usa o cliente como dependência dos efeitos.
const supabase = { rpc };
vi.mock('@/contexts/CompanyScopeContext', () => ({
  useSupabase: () => supabase,
}));

beforeEach(() => {
  rpc.mockReset();
  rpc.mockImplementation((nome: string) => {
    if (nome === 'op_list_setores') return Promise.resolve({ data: [], error: null });
    return Promise.resolve({
      data: {
        id: 'mov-1', idempotente: false, produto_nome: 'Coca-Cola Lata 350ml', unidade_medida: 'UN',
        setor: 'Cozinha', tipo: 'SAIDA', quantidade: 2, saldo_anterior: 8, saldo_novo: 6,
      },
      error: null,
    });
  });
});

describe('useMovimentacaoOperacional.registrar', () => {
  it('envia sempre SAIDA à RPC', async () => {
    const { result } = renderHook(() => useMovimentacaoOperacional());
    await waitFor(() => expect(result.current.setoresLoading).toBe(false));

    const res = await result.current.registrar({
      produtoId: 'prod-coca', setorId: 'setor-cozinha', quantidade: 2, clientRequestId: 'req-1',
    });

    expect(res.ok).toBe(true);
    expect(rpc).toHaveBeenCalledWith('op_registrar_movimentacao', expect.objectContaining({
      p_produto_id: 'prod-coca',
      p_setor_id: 'setor-cozinha',
      p_tipo: 'SAIDA',
      p_quantidade: 2,
      p_client_request_id: 'req-1',
    }));
  });
});

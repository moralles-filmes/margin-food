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

describe('useMovimentacaoOperacional.registrarLote', () => {
  const ITENS = [
    { produtoId: 'prod-coca', setorId: 'setor-cozinha', quantidade: 2, clientRequestId: 's|a' },
    { produtoId: 'prod-agua', setorId: 'setor-delivery', quantidade: 3, clientRequestId: 's|b' },
  ];

  it('manda a lista inteira numa chamada só, com a chave de cada item', async () => {
    rpc.mockImplementation((nome: string) => {
      if (nome === 'op_list_setores') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({
        data: {
          success: true,
          itens: [
            { id: 'mov-1', idempotente: false, produto_nome: 'Coca', unidade_medida: 'UN', setor: 'Cozinha', quantidade: 2, saldo_novo: 6 },
            { id: 'mov-2', idempotente: true, produto_nome: 'Água', unidade_medida: 'UN', setor: 'Delivery', quantidade: 3, saldo_novo: 17 },
          ],
        },
        error: null,
      });
    });
    const { result } = renderHook(() => useMovimentacaoOperacional());
    await waitFor(() => expect(result.current.setoresLoading).toBe(false));

    const res = await result.current.registrarLote({ itens: ITENS, observacao: 'turno da noite' });

    expect(rpc).toHaveBeenCalledWith('op_registrar_saidas_lote', {
      p_itens: [
        { produto_id: 'prod-coca', setor_id: 'setor-cozinha', quantidade: 2, client_request_id: 's|a' },
        { produto_id: 'prod-agua', setor_id: 'setor-delivery', quantidade: 3, client_request_id: 's|b' },
      ],
      p_observacao: 'turno da noite',
    });
    expect(rpc).not.toHaveBeenCalledWith('op_registrar_movimentacao', expect.anything());
    expect(res.ok).toBe(true);
    if (res.ok === true) {
      expect(res.resultados.map(r => [r.produtoNome, r.saldoNovo, r.idempotente])).toEqual([
        ['Coca', 6, false],
        ['Água', 17, true],
      ]);
    }
  });

  it('aponta o item recusado pelo servidor', async () => {
    rpc.mockImplementation((nome: string) => {
      if (nome === 'op_list_setores') return Promise.resolve({ data: [], error: null });
      return Promise.resolve({
        data: null,
        error: { message: 'LOTE_ITEM=2 SALDO_INSUFICIENTE: disponivel=1.000, solicitado=3' },
      });
    });
    const { result } = renderHook(() => useMovimentacaoOperacional());
    await waitFor(() => expect(result.current.setoresLoading).toBe(false));

    const res = await result.current.registrarLote({ itens: ITENS });

    expect(res).toEqual({
      ok: false,
      indice: 1,
      erro: 'Quantidade indisponível. Existem apenas 1 neste setor.',
    });
  });
});

import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useContagemPorCodigo } from '@/hooks/useContagemPorCodigo';
import type { BarcodeLookupResult, UpdateContagemResult } from '@/hooks/useInventarioStore';

const inventarioId = 'inv-1';

function setup(overrides?: {
  buscarPorBarcode?: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  salvarContagem?: (itemId: string, contagemBase: number) => Promise<UpdateContagemResult | null>;
}) {
  const buscarPorBarcode = overrides?.buscarPorBarcode ?? vi.fn(async (): Promise<BarcodeLookupResult> => ({
    status: 'found',
    item_id: 'item-1',
    produto_id: 'produto-1',
    nome_produto: 'Coca-Cola 350ml',
    sku: 'COCA350',
    barcode: '7891234567890',
    unidade_medida: 'UN',
    unidade_compra: 'CX',
    fator_conversao_padrao: 12,
    saldo_teorico: 100,
    contagem_fisica: null,
    classificacao: 'NORMAL',
  }));
  const salvarContagem = overrides?.salvarContagem ?? vi.fn(async (): Promise<UpdateContagemResult> => ({
    diferenca_qtd: 12, diferenca_percent: 12, impacto_financeiro: 5, classificacao: 'NORMAL',
  }));
  const { result } = renderHook(() => useContagemPorCodigo({ inventarioId, buscarPorBarcode, salvarContagem }));
  return { result, buscarPorBarcode, salvarContagem };
}

describe('useContagemPorCodigo', () => {
  it('conta a primeira leitura como +1 unidade de compra (produto dual-unit)', async () => {
    const { result, salvarContagem } = setup();
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('7891234567890'); });

    expect(resultado?.tipo).toBe('contabilizado');
    if (resultado?.tipo === 'contabilizado') {
      expect(resultado.item.quantidadeContadaCompra).toBe(1);
    }
    // contagem_fisica é base: 1 CX * fator 12 = 12 UN
    expect(salvarContagem).toHaveBeenCalledWith('item-1', 12);
    expect(result.current.historico).toHaveLength(1);
  });

  it('soma sobre a contagem já existente, não zera', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({
      status: 'found', item_id: 'item-1', produto_id: 'produto-1', nome_produto: 'Água 500ml', sku: '',
      barcode: '1111', unidade_medida: 'UN', unidade_compra: 'UN', fator_conversao_padrao: 1,
      saldo_teorico: 50, contagem_fisica: 4, classificacao: 'NORMAL',
    }));
    const { result, salvarContagem } = setup({ buscarPorBarcode });
    await act(async () => { await result.current.processarLeitura('1111'); });
    expect(salvarContagem).toHaveBeenCalledWith('item-1', 5);
  });

  it('produto não encontrado mantém o scanner utilizável, sem chamar salvarContagem', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({ status: 'not_found', barcode: '0000' }));
    const { result, salvarContagem } = setup({ buscarPorBarcode });
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('0000'); });
    expect(resultado).toEqual({ tipo: 'nao_encontrado', barcode: '0000' });
    expect(salvarContagem).not.toHaveBeenCalled();
  });

  it('produto fora do inventário é distinguível de não encontrado', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({ status: 'not_in_inventory', barcode: '2222' }));
    const { result } = setup({ buscarPorBarcode });
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('2222'); });
    expect(resultado).toEqual({ tipo: 'fora_do_inventario', barcode: '2222' });
  });

  it('ignora a mesma leitura em bounce (<1200ms), mas conta de novo se deliberada', async () => {
    vi.useFakeTimers();
    try {
      const { result, salvarContagem } = setup();
      await act(async () => { await result.current.processarLeitura('7891234567890'); });
      await act(async () => { await result.current.processarLeitura('7891234567890'); }); // bounce imediato
      expect(salvarContagem).toHaveBeenCalledTimes(1);

      await act(async () => { vi.advanceTimersByTime(1300); });
      await act(async () => { await result.current.processarLeitura('7891234567890'); }); // segunda unidade, deliberada
      expect(salvarContagem).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('conflito de lock otimista (salvarContagem retorna null) vira erro visível, sem entrar no histórico', async () => {
    const salvarContagem = vi.fn(async (): Promise<UpdateContagemResult | null> => null);
    const { result } = setup({ salvarContagem });
    let resultado: Awaited<ReturnType<typeof result.current.processarLeitura>> | undefined;
    await act(async () => { resultado = await result.current.processarLeitura('7891234567890'); });
    expect(resultado?.tipo).toBe('erro');
    expect(result.current.historico).toHaveLength(0);
  });

  it('desfazer última leitura restaura o valor anterior e some do histórico', async () => {
    const { result, salvarContagem } = setup();
    await act(async () => { await result.current.processarLeitura('7891234567890'); });
    expect(result.current.historico).toHaveLength(1);

    let desfeito = false;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito).toBe(true);
    expect(salvarContagem).toHaveBeenLastCalledWith('item-1', 0); // contagem_fisica era null -> base 0
    expect(result.current.historico).toHaveLength(0);
  });

  it('desfazer sem histórico não chama salvarContagem', async () => {
    const { result, salvarContagem } = setup();
    let desfeito = true;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito).toBe(false);
    expect(salvarContagem).not.toHaveBeenCalled();
  });
});

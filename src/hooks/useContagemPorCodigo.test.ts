import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi, type Mock } from 'vitest';
import { mensagemErroContagem, useContagemPorCodigo } from '@/hooks/useContagemPorCodigo';
import type { AjusteContagemResult, BarcodeLookupResult, OpcoesAjusteContagem } from '@/hooks/useInventarioStore';

const inventarioId = 'inv-1';

const lookupDual: BarcodeLookupResult = {
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
};

function ajusteResult(overrides?: Partial<AjusteContagemResult>): AjusteContagemResult {
  const contagem = overrides?.contagem_fisica ?? 12;
  return {
    item_id: 'item-1',
    idempotente: false,
    conflito: false,
    contagem_anterior: null,
    contagem_apos: contagem,
    contagem_fisica: contagem,
    diferenca_qtd: -88,
    diferenca_percent: -88,
    impacto_financeiro: -50,
    classificacao: 'CRITICO',
    status_inventario: 'EM_CONTAGEM',
    ...overrides,
  };
}

type AjustarContagem = (itemId: string, deltaBase: number, opcoes: OpcoesAjusteContagem) => Promise<AjusteContagemResult>;

function setup(overrides?: {
  buscarPorBarcode?: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  ajustarContagem?: Mock<AjustarContagem>;
}) {
  const buscarPorBarcode = overrides?.buscarPorBarcode ?? vi.fn(async () => lookupDual);
  const ajustarContagem = overrides?.ajustarContagem
    ?? vi.fn<AjustarContagem>(async (_itemId, deltaBase) => ajusteResult({ contagem_fisica: deltaBase }));
  const { result } = renderHook(() => useContagemPorCodigo({ inventarioId, buscarPorBarcode, ajustarContagem }));
  return { result, buscarPorBarcode, ajustarContagem };
}

async function buscar(result: ReturnType<typeof setup>['result'], codigo: string) {
  let r: Awaited<ReturnType<typeof result.current.buscarProduto>> | undefined;
  await act(async () => { r = await result.current.buscarProduto(codigo); });
  return r!;
}

async function confirmar(result: ReturnType<typeof setup>['result'], quantidade: number | null) {
  const busca = await buscar(result, '7891234567890');
  if (busca.tipo !== 'encontrado') throw new Error(`busca inesperada: ${busca.tipo}`);
  let r: Awaited<ReturnType<typeof result.current.confirmarQuantidade>> | undefined;
  await act(async () => { r = await result.current.confirmarQuantidade(busca.produto, quantidade); });
  return r!;
}

describe('useContagemPorCodigo', () => {
  it('a leitura só busca o produto — nada é gravado antes de confirmar a quantidade', async () => {
    const { result, ajustarContagem } = setup();
    const busca = await buscar(result, '7891234567890');

    expect(busca.tipo).toBe('encontrado');
    if (busca.tipo === 'encontrado') {
      expect(busca.produto.nomeProduto).toBe('Coca-Cola 350ml');
      expect(busca.produto.unidadeCompra).toBe('CX');
      expect(busca.produto.contadoCompra).toBeNull();
    }
    expect(ajustarContagem).not.toHaveBeenCalled();
  });

  it('confirma a quantidade informada em unidade de compra, somando em unidade base', async () => {
    const { result, ajustarContagem } = setup();
    const r = await confirmar(result, 5);

    // 5 CX * fator 12 = 60 UN; soma (delta), nunca o total calculado no cliente
    expect(ajustarContagem).toHaveBeenCalledWith('item-1', 60, { origem: 'leitura', chave: expect.stringMatching(/:60$/) });
    expect(r.tipo).toBe('contabilizado');
    if (r.tipo === 'contabilizado') {
      expect(r.item.quantidadeLidaCompra).toBe(5);
      expect(r.item.quantidadeContadaCompra).toBe(5);
    }
    expect(result.current.historico).toHaveLength(1);
  });

  it('o total exibido vem do banco, não da soma local (outra pessoa pode ter contado junto)', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>(async () => ajusteResult({ contagem_anterior: 24, contagem_fisica: 36 }));
    const { result } = setup({ ajustarContagem });
    const r = await confirmar(result, 1);

    expect(ajustarContagem).toHaveBeenCalledWith('item-1', 12, expect.objectContaining({ origem: 'leitura' }));
    if (r.tipo === 'contabilizado') expect(r.item.quantidadeContadaCompra).toBe(3); // 36 UN / 12
  });

  it('produto sem unidade dupla soma a quantidade direto', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({
      ...lookupDual, unidade_compra: 'UN', fator_conversao_padrao: 1, contagem_fisica: 4,
    }));
    const ajustarContagem = vi.fn<AjustarContagem>(async () => ajusteResult({ contagem_anterior: 4, contagem_fisica: 6.5 }));
    const { result } = setup({ buscarPorBarcode, ajustarContagem });
    const busca = await buscar(result, '7891234567890');
    if (busca.tipo !== 'encontrado') throw new Error(`busca inesperada: ${busca.tipo}`);
    expect(busca.produto.contadoCompra).toBe(4);

    let r: Awaited<ReturnType<typeof result.current.confirmarQuantidade>> | undefined;
    await act(async () => { r = await result.current.confirmarQuantidade(busca.produto, 2.5); });
    expect(ajustarContagem).toHaveBeenCalledWith('item-1', 2.5, expect.objectContaining({ origem: 'leitura' }));
    if (r?.tipo === 'contabilizado') expect(r.item.quantidadeContadaCompra).toBe(6.5);
  });

  it.each([
    [null, 'Informe a quantidade.'],
    [0, 'A quantidade precisa ser maior que zero.'],
    [1_000_000, 'Quantidade acima do limite'],
  ])('quantidade %s é recusada sem ir ao banco', async (quantidade, mensagem) => {
    const { result, ajustarContagem } = setup();
    const r = await confirmar(result, quantidade);
    expect(r.tipo).toBe('invalido');
    if (r.tipo === 'invalido') expect(r.mensagem).toContain(mensagem);
    expect(ajustarContagem).not.toHaveBeenCalled();
  });

  it('produto não encontrado mantém o leitor utilizável', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({ status: 'not_found', barcode: '0000' }));
    const { result, ajustarContagem } = setup({ buscarPorBarcode });
    expect(await buscar(result, '0000')).toEqual({ tipo: 'nao_encontrado', barcode: '0000' });
    expect(ajustarContagem).not.toHaveBeenCalled();
  });

  it('produto fora do inventário é distinguível de não encontrado', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => ({ status: 'not_in_inventory', barcode: '2222' }));
    const { result } = setup({ buscarPorBarcode });
    expect(await buscar(result, '2222')).toEqual({ tipo: 'fora_do_inventario', barcode: '2222' });
  });

  it('falha na busca vira erro visível em vez de exceção solta', async () => {
    const buscarPorBarcode = vi.fn(async (): Promise<BarcodeLookupResult> => { throw new Error('Failed to fetch'); });
    const { result } = setup({ buscarPorBarcode });
    const r = await buscar(result, '7891234567890');
    expect(r.tipo).toBe('erro');
    if (r.tipo === 'erro') expect(r.mensagem).toMatch(/conexão/i);
  });

  it('ignora a mesma leitura em bounce (<1200ms), mas aceita de novo se deliberada', async () => {
    vi.useFakeTimers();
    try {
      const { result, buscarPorBarcode } = setup();
      await buscar(result, '7891234567890');
      const bounce = await buscar(result, '7891234567890');
      expect(bounce.tipo).toBe('invalido');
      expect(buscarPorBarcode).toHaveBeenCalledTimes(1);

      await act(async () => { vi.advanceTimersByTime(1300); });
      await buscar(result, '7891234567890');
      expect(buscarPorBarcode).toHaveBeenCalledTimes(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('erro do banco vira mensagem legível, sem entrar no histórico', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>(async () => { throw new Error('INVENTARIO_FINALIZADO'); });
    const { result } = setup({ ajustarContagem });
    const r = await confirmar(result, 1);
    expect(r).toEqual({ tipo: 'erro', mensagem: 'Este inventário já foi finalizado.' });
    expect(result.current.historico).toHaveLength(0);
  });

  it('reenviar a mesma quantidade do mesmo produto lido reaproveita a chave (o banco não soma de novo)', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(ajusteResult({ contagem_fisica: 60, idempotente: true }));
    const { result } = setup({ ajustarContagem });
    const busca = await buscar(result, '7891234567890');
    if (busca.tipo !== 'encontrado') throw new Error('busca inesperada');

    await act(async () => { await result.current.confirmarQuantidade(busca.produto, 5); });
    await act(async () => { await result.current.confirmarQuantidade(busca.produto, 5); });

    const [primeira, segunda] = ajustarContagem.mock.calls;
    expect(segunda[2].chave).toBe(primeira[2].chave);
    expect(result.current.historico).toHaveLength(1);
  });

  it('mudar a quantidade depois de uma falha gera outra chave (é outra operação)', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>()
      .mockRejectedValueOnce(new Error('Failed to fetch'))
      .mockResolvedValueOnce(ajusteResult({ contagem_fisica: 72 }));
    const { result } = setup({ ajustarContagem });
    const busca = await buscar(result, '7891234567890');
    if (busca.tipo !== 'encontrado') throw new Error('busca inesperada');

    await act(async () => { await result.current.confirmarQuantidade(busca.produto, 5); });
    await act(async () => { await result.current.confirmarQuantidade(busca.produto, 6); });

    const [primeira, segunda] = ajustarContagem.mock.calls;
    expect(segunda[2].chave).not.toBe(primeira[2].chave);
  });

  it('confirmação repetida que o banco reconhece como reenvio não duplica o histórico', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>()
      .mockResolvedValueOnce(ajusteResult({ contagem_fisica: 12 }))
      .mockResolvedValueOnce(ajusteResult({ contagem_fisica: 12, idempotente: true }));
    const { result } = setup({ ajustarContagem });
    const busca = await buscar(result, '7891234567890');
    if (busca.tipo !== 'encontrado') throw new Error('busca inesperada');

    await act(async () => {
      await Promise.all([
        result.current.confirmarQuantidade(busca.produto, 1),
        result.current.confirmarQuantidade(busca.produto, 1),
      ]);
    });
    expect(result.current.historico).toHaveLength(1);
  });

  it('desfazer a primeira leitura exige o total que ela deixou e volta a "não contado"', async () => {
    const { result, ajustarContagem } = setup();
    await confirmar(result, 5);
    const chaveLeitura = ajustarContagem.mock.calls[0][2].chave;

    let desfeito: Awaited<ReturnType<typeof result.current.desfazerUltimaLeitura>> | undefined;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito?.tipo).toBe('desfeito');
    // subtrai exatamente o que a leitura somou, só se o item ainda estiver em 60;
    // NULL em vez de 0 para o finalizar não zerar o saldo
    expect(ajustarContagem).toHaveBeenLastCalledWith('item-1', -60, {
      origem: 'desfazer', chave: `desfazer:${chaveLeitura}`, esperado: 60, restaurarNaoContado: true,
    });
    expect(result.current.historico).toHaveLength(0);
  });

  it('desfazer leitura de produto que já estava contado só subtrai', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>(async (_itemId, deltaBase) =>
      ajusteResult({ contagem_anterior: 24, contagem_fisica: 24 + deltaBase }));
    const { result } = setup({ ajustarContagem });
    await confirmar(result, 1);
    await act(async () => { await result.current.desfazerUltimaLeitura(); });
    expect(ajustarContagem).toHaveBeenLastCalledWith('item-1', -12, expect.objectContaining({
      origem: 'desfazer', esperado: 36, restaurarNaoContado: false,
    }));
  });

  it('desfazer recusado porque o produto mudou depois da leitura avisa e tira a leitura do histórico', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>()
      .mockResolvedValueOnce(ajusteResult({ contagem_fisica: 12 }))
      .mockResolvedValueOnce(ajusteResult({ contagem_fisica: 20, conflito: true }));
    const { result } = setup({ ajustarContagem });
    await confirmar(result, 1);

    let desfeito: Awaited<ReturnType<typeof result.current.desfazerUltimaLeitura>> | undefined;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito?.tipo).toBe('erro');
    if (desfeito?.tipo === 'erro') expect(desfeito.mensagem).toMatch(/contado de novo/);
    expect(result.current.historico).toHaveLength(0);
  });

  it('desfazer que falha no banco mantém a leitura no histórico', async () => {
    const ajustarContagem = vi.fn<AjustarContagem>()
      .mockResolvedValueOnce(ajusteResult())
      .mockRejectedValueOnce(new Error('CONTAGEM_NEGATIVA'));
    const { result } = setup({ ajustarContagem });
    await confirmar(result, 1);

    let desfeito: Awaited<ReturnType<typeof result.current.desfazerUltimaLeitura>> | undefined;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito?.tipo).toBe('erro');
    expect(result.current.historico).toHaveLength(1);
  });

  it('desfazer sem histórico não chama o banco', async () => {
    const { result, ajustarContagem } = setup();
    let desfeito: Awaited<ReturnType<typeof result.current.desfazerUltimaLeitura>> | undefined;
    await act(async () => { desfeito = await result.current.desfazerUltimaLeitura(); });
    expect(desfeito?.tipo).toBe('vazio');
    expect(ajustarContagem).not.toHaveBeenCalled();
  });
});

describe('mensagemErroContagem', () => {
  it.each([
    ['INVENTARIO_RASCUNHO', 'rascunho'],
    ['CONTAGEM_NEGATIVA', 'negativa'],
    ['PERMISSION_DENIED: inventario:detalhe:edit', 'permissão'],
    ['Failed to fetch', 'conexão'],
  ])('%s', (codigo, trecho) => {
    expect(mensagemErroContagem(new Error(codigo)).toLowerCase()).toContain(trecho);
  });

  it('mensagem já legível (vinda da Edge Function) passa adiante', () => {
    expect(mensagemErroContagem(new Error('Sem permissão: inventario:detalhe:edit'))).toBe('Sem permissão: inventario:detalhe:edit');
  });

  it('sem mensagem cai no texto genérico', () => {
    expect(mensagemErroContagem(null)).toBe('Não foi possível salvar a contagem. Tente novamente.');
  });
});

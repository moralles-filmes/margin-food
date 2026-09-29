import { describe, expect, it } from 'vitest';
import { chavePedidoCompra, mensagemErroCriarPedido, operacaoLembrete } from '@/domain/compras/pedidoIdempotencia';

const pedido = {
  title: 'Hortifruti',
  type: 'FORNECEDOR',
  supplier_name: 'Forn X',
  items: [{ stock_item_id: 'p1', qty_requested: 2, estimated_unit_value: 10 }],
};
const comPreco = (preco: number) => ({ ...pedido, items: [{ ...pedido.items[0], estimated_unit_value: preco }] });

describe('chave do pedido de compra — formulário (semente + conteúdo)', () => {
  it('duplo clique / retry do mesmo pedido usam a mesma chave', async () => {
    const semente = 'form-1';
    expect(await chavePedidoCompra({ semente }, pedido)).toBe(await chavePedidoCompra({ semente }, { ...pedido }));
  });

  it('mudar o pedido depois de uma falha gera chave nova (não devolve o pedido anterior)', async () => {
    const semente = 'form-1';
    expect(await chavePedidoCompra({ semente }, comPreco(12))).not.toBe(await chavePedidoCompra({ semente }, pedido));
  });

  it('formulário novo com o mesmo conteúdo é outro pedido', async () => {
    expect(await chavePedidoCompra({ semente: 'form-2' }, pedido))
      .not.toBe(await chavePedidoCompra({ semente: 'form-1' }, pedido));
  });

  it('a chave é um UUID (coluna idempotency_key é uuid)', async () => {
    expect(await chavePedidoCompra({ semente: 'form-1' }, pedido)).toMatch(/^[0-9a-f-]{36}$/);
  });
});

describe('chave do pedido de compra — calendário (lembrete + dia)', () => {
  it('um pedido por lembrete por dia: o 2º clique repete a chave mesmo com preço novo no catálogo', async () => {
    const operacao = operacaoLembrete('lembrete-1', '2026-09-29');
    expect(await chavePedidoCompra({ operacao }, comPreco(15))).toBe(await chavePedidoCompra({ operacao }, pedido));
  });

  it('outro dia ou outro lembrete é outro pedido', async () => {
    const hoje = await chavePedidoCompra({ operacao: operacaoLembrete('lembrete-1', '2026-09-29') }, pedido);
    expect(await chavePedidoCompra({ operacao: operacaoLembrete('lembrete-1', '2026-09-30') }, pedido)).not.toBe(hoje);
    expect(await chavePedidoCompra({ operacao: operacaoLembrete('lembrete-2', '2026-09-29') }, pedido)).not.toBe(hoje);
  });
});

describe('mensagemErroCriarPedido', () => {
  it('REQUEST_ID_REUTILIZADO manda conferir a lista, não repetir às cegas', () => {
    expect(mensagemErroCriarPedido('REQUEST_ID_REUTILIZADO: a chave pertence a outro pedido')).toMatch(/Confira a lista/);
  });

  it('demais erros mantêm o texto do servidor', () => {
    expect(mensagemErroCriarPedido('INVALID_PURCHASE_ORDER')).toBe('Erro ao criar pedido: INVALID_PURCHASE_ORDER');
  });
});

import { chaveOperacaoUuid } from '@/lib/chaveOperacao';

/**
 * De onde vem a chave de idempotência de um pedido de compra
 * (`create_purchase_order_atomic`, coluna `uuid`).
 */
export type IdempotenciaPedido =
  /**
   * Formulário: semente da tela + conteúdo do pedido. Duplo clique e retry do
   * mesmo pedido reaproveitam a chave; qualquer campo alterado gera outra.
   */
  | { semente: string }
  /**
   * Operação única por natureza (ex.: lembrete do calendário no dia). A chave
   * NÃO depende do conteúdo: o gerador relê o preço do catálogo a cada clique,
   * e um preço atualizado entre dois cliques não pode virar um 2º pedido.
   */
  | { operacao: string };

export function chavePedidoCompra(idem: IdempotenciaPedido, payload: unknown): Promise<string> {
  return 'semente' in idem
    ? chaveOperacaoUuid(idem.semente, payload)
    : chaveOperacaoUuid('operacao', idem.operacao);
}

/** Um pedido por lembrete por dia: o 2º clique devolve o pedido já gerado. */
export function operacaoLembrete(lembreteId: string, dia: string): string {
  return `lembrete:${lembreteId}:${dia}`;
}

/** Mensagem para os erros de idempotência de `create_purchase_order_atomic`. */
export function mensagemErroCriarPedido(mensagem: string | undefined): string {
  const msg = mensagem ?? '';
  if (msg.includes('REQUEST_ID_REUTILIZADO')) {
    return 'Este envio não confere com a solicitação registrada antes. Confira a lista de pedidos antes de criar de novo.';
  }
  return `Erro ao criar pedido: ${msg}`;
}

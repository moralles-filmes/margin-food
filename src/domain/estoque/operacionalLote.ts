/**
 * ─── Movimentação Operacional — saída de vários itens ───
 *
 * O operador bipa vários produtos, revisa a lista e confirma uma vez só. A
 * lista vai inteira para `op_registrar_saidas_lote`, que grava tudo ou nada.
 *
 * Como em `operacional.ts`, o que está aqui é resposta imediata na tela; o
 * gate é o banco, que confere cada item com as regras da saída unitária.
 */

import {
  chaveRequisicao,
  formatarQuantidade,
  QUANTIDADE_MAXIMA,
  traduzirErroOperacional,
  validarQuantidade,
  type ProdutoOperacional,
  type SetorOperacional,
  type ValidacaoQuantidade,
} from './operacional';

export interface ItemSaidaLote {
  /** Estável enquanto a linha existir — entra na chave de idempotência. */
  id: string;
  produto: ProdutoOperacional;
  setor: SetorOperacional;
  quantidade: number;
}

const arredondar = (valor: number) => Math.round(valor * 1000) / 1000;

const mesmoItem = (a: ItemSaidaLote, produtoId: string, setorId: string) =>
  a.produto.produtoId === produtoId && a.setor.setorId === setorId;

/**
 * Quanto do produto já está na lista, somando todos os setores — o saldo do
 * produto é um só. `ignorarId` tira da conta a linha que está sendo editada.
 */
export function quantidadeNoLote(
  itens: ItemSaidaLote[],
  produtoId: string,
  ignorarId?: string,
): number {
  return arredondar(itens
    .filter(i => i.produto.produtoId === produtoId && i.id !== ignorarId)
    .reduce((soma, i) => soma + i.quantidade, 0));
}

/**
 * Valida a quantidade de um item contra o saldo menos o que a lista já retira
 * do mesmo produto. Duas linhas de 6 com 10 em estoque passariam uma a uma.
 */
export function validarQuantidadeNoLote(
  quantidade: number | null,
  produto: ProdutoOperacional,
  itens: ItemSaidaLote[],
  ignorarId?: string,
): ValidacaoQuantidade {
  const naLista = quantidadeNoLote(itens, produto.produtoId, ignorarId);
  if (naLista <= 0) return validarQuantidade(quantidade, produto.saldo, produto.unidadeMedida);

  const restante = Math.max(0, arredondar(produto.saldo - naLista));
  const validacao = validarQuantidade(quantidade, restante, produto.unidadeMedida);
  // Só a mensagem de saldo muda: as demais não dependem da lista.
  if (validacao.valida || quantidade === null || quantidade <= 0 || quantidade > QUANTIDADE_MAXIMA) {
    return validacao;
  }
  const un = produto.unidadeMedida;
  return {
    valida: false,
    erro: `Quantidade indisponível. A lista já tem ${formatarQuantidade(naLista)} ${un} deste produto; `
      + `restam ${formatarQuantidade(restante)} ${un}.`,
  };
}

/**
 * Coloca o item na lista. Mesmo produto no mesmo setor soma na linha que já
 * existe — bipar duas vezes o mesmo item é pedir mais dele, não uma 2ª linha.
 * `somadoEm` é o id da linha que recebeu a soma (null quando entrou linha nova).
 */
export function adicionarAoLote(
  itens: ItemSaidaLote[],
  novo: ItemSaidaLote,
): { itens: ItemSaidaLote[]; somadoEm: string | null } {
  const existente = itens.find(i => mesmoItem(i, novo.produto.produtoId, novo.setor.setorId));
  if (!existente) return { itens: [...itens, novo], somadoEm: null };

  return {
    itens: itens.map(i => i.id === existente.id
      // O produto recém-lido traz o saldo mais novo.
      ? { ...i, produto: novo.produto, quantidade: arredondar(i.quantidade + novo.quantidade) }
      : i),
    somadoEm: existente.id,
  };
}

export function alterarQuantidadeNoLote(
  itens: ItemSaidaLote[],
  id: string,
  quantidade: number,
): ItemSaidaLote[] {
  return itens.map(i => (i.id === id ? { ...i, quantidade } : i));
}

export function removerDoLote(itens: ItemSaidaLote[], id: string): ItemSaidaLote[] {
  return itens.filter(i => i.id !== id);
}

/**
 * Chave de idempotência de cada item.
 *
 * Semente do lançamento + id da linha + identidade da operação: reenviar a
 * MESMA lista depois de uma falha de rede reaproveita as chaves (o servidor
 * devolve os lançamentos originais); mudar a quantidade de um item muda só a
 * chave dele. O id da linha separa duas linhas iguais em setores diferentes.
 */
export function chaveItemLote(semente: string, item: ItemSaidaLote): string {
  return chaveRequisicao(
    `${semente}:${item.id}`,
    item.produto.produtoId,
    item.setor.setorId,
    item.quantidade,
  );
}

/**
 * Erro de `op_registrar_saidas_lote`: `LOTE_ITEM=<n> <erro da saída unitária>`,
 * com n em base 1. Devolve o índice em base 0 (null quando o erro não é de um
 * item) e a mensagem já traduzida para o operador.
 */
export function traduzirErroLote(mensagem: string | undefined): { indice: number | null; erro: string } {
  const item = /^LOTE_ITEM=(\d+)\s+([\s\S]*)$/.exec(mensagem ?? '');
  if (!item) return { indice: null, erro: traduzirErroOperacional(mensagem) };
  return { indice: Number(item[1]) - 1, erro: traduzirErroOperacional(item[2]) };
}

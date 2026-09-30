/**
 * ─── Movimentação Operacional — saída de vários itens ───
 *
 * O operador bipa vários produtos, revisa a lista e confirma uma vez só. A
 * lista vai inteira para `op_registrar_saidas_lote`, que grava tudo ou nada.
 *
 * Como em `operacional.ts`, o que está aqui é resposta imediata na tela; o
 * gate é o banco, que confere cada item com as regras da saída unitária.
 */

import type { ChavesPendentes } from '@/lib/chaveOperacao';
import {
  chaveSaida,
  formatarQuantidade,
  QUANTIDADE_MAXIMA,
  traduzirErroOperacional,
  validarQuantidade,
  type IdentidadeSaida,
  type ProdutoOperacional,
  type SetorOperacional,
  type ValidacaoQuantidade,
} from './operacional';

export interface ItemSaidaLote {
  /** Estável enquanto a linha existir — identifica a linha na tela (editar, remover, erro). */
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

/** O que o servidor compara em cada item do lote (a mesma identidade da saída unitária). */
export function identidadeItemLote(item: ItemSaidaLote): IdentidadeSaida {
  return { produtoId: item.produto.produtoId, setorId: item.setor.setorId, quantidade: item.quantidade };
}

/**
 * Chave de idempotência de cada item: a mesma de uma saída unitária igual
 * (`chaveSaida`). Reenviar a MESMA lista reaproveita as chaves (o servidor
 * devolve os lançamentos originais); mudar a quantidade de um item muda só a
 * chave dele; e um item que já saiu sozinho sem resposta, posto depois numa
 * lista, é reconhecido em vez de sair de novo. Não há duas linhas com o mesmo
 * produto e setor na lista (`adicionarAoLote` soma), então as chaves de uma
 * lista nunca se repetem.
 */
export function chaveItemLote(pendentes: ChavesPendentes<IdentidadeSaida>, item: ItemSaidaLote): string {
  return chaveSaida(pendentes, identidadeItemLote(item));
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

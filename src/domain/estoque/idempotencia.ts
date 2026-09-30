/**
 * ─── Conteúdo que identifica os envios do Estoque e do Salmão ───
 *
 * Cada função descreve, em forma canônica, o que o servidor compara no reenvio
 * (`criar_requisicao_estoque`, `estoque_registrar_movimentacoes_lote`,
 * `_salmon_create_entry_guarded`, `_salmon_create_manipulation_guarded`,
 * `stock_transfer_between_locations`, `estoque_criar_produto`). A tela passa o
 * conteúdo a `useChavesPendentes`, que deriva a chave dele + a semente pendente
 * (`@/lib/chaveOperacao`); transferência e cadastro de produto ainda derivam a
 * chave aqui (`chaveX(semente, …)`). Campo que entra aqui mas não na
 * comparação do servidor faria um retry legítimo virar REQUEST_ID_REUTILIZADO,
 * e o contrário deixaria operações diferentes com a mesma chave. Conteúdos que
 * o servidor considera iguais precisam produzir o mesmo JSON.
 */

import { chaveOperacao } from '@/lib/chaveOperacao';

export interface ItemRequisicaoChave {
  produtoId: string;
  quantidade: number;
  unidade: string;
}

/**
 * Requisição de estoque (manual e por lista fixa, mesma RPC). A ordem dos itens
 * não muda o pedido — o servidor compara o conjunto —, então o conteúdo sai
 * ordenado.
 */
export function conteudoRequisicaoEstoque(
  dados: { setor: string; observacao: string; itens: ItemRequisicaoChave[] },
) {
  const itens = dados.itens
    .map(item => [item.produtoId, item.quantidade, item.unidade] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return { tipo: 'requisicao', setor: dados.setor, observacao: dados.observacao, itens };
}

export interface ItemMovimentacaoChave {
  produtoId: string;
  quantidade: number;
  custoUnitario: number;
  setor?: string;
}

/**
 * Lote da Nova Movimentação (módulo administrativo). A ordem conta: o servidor
 * grava cada linha como `<chave>:<posição>` e compara posição a posição. A data
 * fica de fora de propósito — é o dia do envio, não uma escolha do usuário, e
 * um retry depois da meia-noite continua sendo o mesmo lote.
 */
export function conteudoLoteMovimentacao(
  dados: { tipo: string; observacao: string; itens: ItemMovimentacaoChave[] },
) {
  return {
    tipo: 'movimentacao',
    movimento: dados.tipo,
    observacao: dados.observacao,
    itens: dados.itens.map(item => [item.produtoId, item.quantidade, item.custoUnitario, item.setor ?? '']),
  };
}

export interface EntradaSalmaoChave {
  date: string;
  expirationDate?: string;
  lot?: string;
  sif?: string;
  supplier?: string;
  totalValue: number;
  grossKg: number;
  boxes?: number;
  units?: number;
  notes?: string;
}

/** Entrada de salmão bruto: os mesmos campos que `create_salmon_entry_atomic` grava. */
export function conteudoEntradaSalmao(dados: EntradaSalmaoChave) {
  return {
    tipo: 'salmao-entrada',
    date: dados.date,
    expirationDate: dados.expirationDate || null,
    lot: dados.lot || '',
    sif: dados.sif || '',
    supplier: dados.supplier || '',
    totalValue: dados.totalValue,
    grossKg: dados.grossKg,
    boxes: dados.boxes || 0,
    units: dados.units || 0,
    notes: dados.notes || '',
  };
}

export interface ManipulacaoSalmaoChave {
  entryId: string;
  date: string;
  fishCount?: number;
  grossKg: number;
  cleanKg: number;
  leftoverKg?: number;
}

/** Manipulação de salmão: os mesmos campos que `create_salmon_manipulation_atomic` grava. */
export function conteudoManipulacaoSalmao(dados: ManipulacaoSalmaoChave) {
  return {
    tipo: 'salmao-manipulacao',
    entryId: dados.entryId,
    date: dados.date,
    fishCount: dados.fishCount || 0,
    grossKg: dados.grossKg,
    cleanKg: dados.cleanKg,
    leftoverKg: dados.leftoverKg || 0,
  };
}

export interface TransferenciaChave {
  produtoId: string;
  origem: string;
  destino: string;
  quantidade: number;
  motivo?: string | null;
}

/**
 * Transferência entre locais: os campos que `stock_transfer_between_locations`
 * compara no reenvio (produto, locais, quantidade e o motivo, que vai para a
 * observação). Os valores entram como são enviados — o servidor aplica o mesmo
 * `btrim` na gravação e na comparação.
 */
export function chaveTransferencia(semente: string, dados: TransferenciaChave): Promise<string> {
  return chaveOperacao(semente, {
    tipo: 'transferencia',
    produtoId: dados.produtoId,
    origem: dados.origem,
    destino: dados.destino,
    quantidade: dados.quantidade,
    motivo: dados.motivo || '',
  });
}

/**
 * Cadastro de produto: o formulário inteiro que vai para `estoque_criar_produto`.
 * O servidor compara nome, categoria, unidades, fator, custo de compra e o SKU
 * digitado — todos dentro do formulário. Retry do MESMO formulário devolve o
 * produto já criado em vez de gerar outro SKU; qualquer campo alterado é outro
 * cadastro.
 */
export function chaveCadastroProduto(semente: string, produto: object): Promise<string> {
  return chaveOperacao(semente, { tipo: 'produto', produto });
}

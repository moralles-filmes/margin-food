/**
 * ─── Chaves de idempotência dos envios do Estoque e do Salmão ───
 *
 * Cada função descreve o que identifica a operação para o servidor
 * (`criar_requisicao_estoque`, `estoque_registrar_movimentacoes_lote`,
 * `_salmon_create_entry_guarded`, `_salmon_create_manipulation_guarded`). O
 * conteúdo aqui precisa ser o MESMO que o servidor compara no reenvio: campo
 * que entra na chave mas não na comparação faria um retry legítimo virar
 * REQUEST_ID_REUTILIZADO, e o contrário deixaria operações diferentes com a
 * mesma chave. Semente, derivação e o porquê: `@/lib/chaveOperacao`.
 */

import { chaveOperacao } from '@/lib/chaveOperacao';

export interface ItemRequisicaoChave {
  produtoId: string;
  quantidade: number;
  unidade: string;
}

/**
 * Requisição de estoque (manual e por lista fixa). A ordem dos itens não muda
 * o pedido — o servidor compara o conjunto —, então a chave também não depende
 * dela.
 */
export function chaveRequisicaoEstoque(
  semente: string,
  dados: { setor: string; observacao: string; itens: ItemRequisicaoChave[] },
): Promise<string> {
  const itens = dados.itens
    .map(item => [item.produtoId, item.quantidade, item.unidade] as const)
    .sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] - b[1]));
  return chaveOperacao(semente, { tipo: 'requisicao', setor: dados.setor, observacao: dados.observacao, itens });
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
export function chaveLoteMovimentacao(
  semente: string,
  dados: { tipo: string; observacao: string; itens: ItemMovimentacaoChave[] },
): Promise<string> {
  return chaveOperacao(semente, {
    tipo: 'movimentacao',
    movimento: dados.tipo,
    observacao: dados.observacao,
    itens: dados.itens.map(item => [item.produtoId, item.quantidade, item.custoUnitario, item.setor ?? '']),
  });
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
export function chaveEntradaSalmao(semente: string, dados: EntradaSalmaoChave): Promise<string> {
  return chaveOperacao(semente, {
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
  });
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
export function chaveManipulacaoSalmao(semente: string, dados: ManipulacaoSalmaoChave): Promise<string> {
  return chaveOperacao(semente, {
    tipo: 'salmao-manipulacao',
    entryId: dados.entryId,
    date: dados.date,
    fishCount: dados.fishCount || 0,
    grossKg: dados.grossKg,
    cleanKg: dados.cleanKg,
    leftoverKg: dados.leftoverKg || 0,
  });
}

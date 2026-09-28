/**
 * ─── Movimentação em lote (Controle de Estoque → Movimentações) ───
 *
 * Cálculo e validação de uma movimentação com vários itens. Mesmas regras do
 * lançamento de um item só, aplicadas a cada linha:
 *   - Entrada: quantidade na un. base ou de compra (× fator); custo base =
 *     preço por un. de compra ÷ fator.
 *   - Saída/Baixa/Ajuste: quantidade na un. base ou de compra (× fator padrão);
 *     custo base vem do cadastro e é obrigatório; setor obrigatório por linha.
 *
 * O saldo das saídas é conferido pela SOMA das linhas do mesmo produto — mesmo
 * em setores diferentes, o estoque é um só. Duas
 * linhas de 6 kg com 10 kg em estoque passariam uma a uma e deixariam o saldo
 * negativo. Como no lançamento unitário, essa trava é só do cliente.
 */

import { normalizeBRLMoneyToNumber } from '@/lib/money';
import { formatFixedBR } from '@/lib/formatters';
import type { ProdutoExtended } from '@/types/estoque';

export interface MovLoteItem {
  key: string;
  produtoId: string;
  /** Texto digitado, na unidade escolhida em `usePurchaseUnit`. */
  quantidade: string;
  usePurchaseUnit: boolean;
  /** Entrada: un. base por un. de compra. */
  fator: string;
  /** Entrada: preço por un. de compra (R$). */
  precoCompra: string;
  /** Saída: custo por un. base (R$). */
  custoUnitario: string;
  /** Saída: setor de destino — cada linha pode ir para um setor diferente. */
  setor: string;
}

export type MovLoteProduto = Pick<ProdutoExtended, 'id' | 'nomeProduto' | 'unidadeMedida' | 'fatorConversaoPadrao'>;

export interface MovLoteItemCalculado {
  quantidadeBase: number;
  /** Arredondado a 2 casas, como é gravado. */
  custoUnitario: number;
  /** Mesma conta do INSERT: quantidade × custo unitário gravado. */
  custoTotal: number;
}

export interface MovLoteItemValido extends MovLoteItemCalculado {
  key: string;
  produtoId: string;
  setor: string;
}

// Formato plano, não união discriminada: com `strict: false` o TS não estreita
// por `ok: false` e acusaria `erros`/`mensagem` inexistentes.
export interface MovLoteResultado {
  ok: boolean;
  /** Itens prontos para gravar — vazio quando `ok` é false. */
  itens: MovLoteItemValido[];
  /** Resumo para o toast — vazio quando `ok` é true. */
  mensagem: string;
  /** Erro por `key` de linha. */
  erros: Record<string, string>;
}

function falha(mensagem: string, erros: Record<string, string> = {}): MovLoteResultado {
  return { ok: false, itens: [], mensagem, erros };
}

// Tolerância para somas de ponto flutuante (0,1 + 0,2 > 0,3).
const EPSILON = 1e-9;

/** `setor` já vem preenchido quando a linha herda o setor da anterior. */
export function novoItemLote(key: string, setor = ''): MovLoteItem {
  return { key, produtoId: '', quantidade: '', usePurchaseUnit: false, fator: '1', precoCompra: '', custoUnitario: '', setor };
}

/**
 * Linha que o usuário não começou a preencher — ignorada no registro. O setor
 * não conta: ele é herdado da linha anterior, não digitado.
 */
export function itemLoteVazio(item: MovLoteItem): boolean {
  return !item.produtoId && !item.quantidade.trim() && !item.precoCompra.trim();
}

export function calcularItemLote(
  item: MovLoteItem,
  produto: MovLoteProduto | undefined,
  isEntrada: boolean,
): MovLoteItemCalculado {
  const qty = normalizeBRLMoneyToNumber(item.quantidade) || 0;
  let quantidadeBase: number;
  let custo: number;

  if (isEntrada) {
    const fator = normalizeBRLMoneyToNumber(item.fator) || 1;
    const preco = normalizeBRLMoneyToNumber(item.precoCompra) || 0;
    quantidadeBase = item.usePurchaseUnit ? qty * fator : qty;
    custo = fator > 0 ? preco / fator : 0;
  } else {
    const fator = produto?.fatorConversaoPadrao || 1;
    quantidadeBase = item.usePurchaseUnit ? qty * fator : qty;
    custo = normalizeBRLMoneyToNumber(item.custoUnitario) || 0;
  }

  const custoUnitario = Math.round(custo * 100) / 100;
  return {
    quantidadeBase,
    custoUnitario,
    custoTotal: Number((quantidadeBase * custoUnitario).toFixed(2)),
  };
}

interface ValidarLoteParams {
  itens: MovLoteItem[];
  produtos: Map<string, MovLoteProduto>;
  saldos: Record<string, { saldo: number }>;
  isEntrada: boolean;
}

export function validarLote({ itens, produtos, saldos, isEntrada }: ValidarLoteParams): MovLoteResultado {
  const preenchidos = itens.filter(i => !itemLoteVazio(i));
  if (preenchidos.length === 0) return falha('Adicione ao menos um item.');

  const erros: Record<string, string> = {};
  const validos: MovLoteItemValido[] = [];

  for (const item of preenchidos) {
    const produto = produtos.get(item.produtoId);
    if (!item.produtoId || !produto) { erros[item.key] = 'Selecione o produto.'; continue; }

    const calc = calcularItemLote(item, produto, isEntrada);
    if (calc.quantidadeBase <= 0) { erros[item.key] = 'Informe a quantidade.'; continue; }

    if (isEntrada) {
      const fator = normalizeBRLMoneyToNumber(item.fator) || 1;
      if (fator <= 0) { erros[item.key] = 'Fator de conversão deve ser > 0'; continue; }
    } else {
      if (!item.setor) { erros[item.key] = 'Setor é obrigatório para saídas.'; continue; }
      if (calc.custoUnitario <= 0) {
        erros[item.key] = 'Item sem custo cadastrado. Registre uma entrada inicial ou custo padrão.';
        continue;
      }
    }

    validos.push({ key: item.key, produtoId: item.produtoId, setor: isEntrada ? '' : item.setor, ...calc });
  }

  if (!isEntrada) {
    const porProduto = new Map<string, MovLoteItemValido[]>();
    for (const v of validos) porProduto.set(v.produtoId, [...(porProduto.get(v.produtoId) ?? []), v]);

    for (const [produtoId, linhas] of porProduto) {
      const total = linhas.reduce((s, l) => s + l.quantidadeBase, 0);
      const saldo = saldos[produtoId]?.saldo || 0;
      if (total <= saldo + EPSILON) continue;
      const un = produtos.get(produtoId)?.unidadeMedida || '';
      const soma = linhas.length > 1 ? ` (soma de ${linhas.length} linhas: ${formatFixedBR(total, 2)} ${un})` : '';
      for (const l of linhas) {
        erros[l.key] = `Estoque insuficiente! Disponível: ${formatFixedBR(saldo, 2)} ${un}${soma}`.trim();
      }
    }
  }

  const chaves = Object.keys(erros);
  if (chaves.length > 0) {
    const posicao = (key: string) => itens.findIndex(i => i.key === key) + 1;
    const mensagem = chaves.length === 1
      ? `Item ${posicao(chaves[0])}: ${erros[chaves[0]]}`
      : `${chaves.length} itens com problema — corrija antes de registrar.`;
    return falha(mensagem, erros);
  }

  return { ok: true, itens: validos, mensagem: '', erros: {} };
}

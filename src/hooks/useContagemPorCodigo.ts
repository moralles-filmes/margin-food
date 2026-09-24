import { useCallback, useRef, useState } from 'react';
import { validarBarcode, mensagemBarcodeInvalido, ehLeituraDuplicada } from '@/domain/estoque/barcode';
import { QUANTIDADE_MAXIMA } from '@/domain/estoque/operacional';
import type { AjusteContagemResult, BarcodeLookupResult, OpcoesAjusteContagem } from '@/hooks/useInventarioStore';

/** Produto achado pela leitura, esperando o operador informar a quantidade. */
export interface ProdutoLido {
  itemId: string;
  produtoId: string;
  nomeProduto: string;
  sku: string;
  barcode: string;
  unidadeCompra: string;
  fator: number;
  hasDual: boolean;
  /** Total já contado no momento da leitura, em unidade de compra (null = ainda não contado). */
  contadoCompra: number | null;
  /** Semente da chave de idempotência — uma por leitura. */
  chaveLeitura: string;
}

export interface ItemContabilizado {
  itemId: string;
  produtoId: string;
  nomeProduto: string;
  sku: string;
  barcode: string;
  unidadeCompra: string;
  /** Quanto esta leitura somou, em unidade de compra. */
  quantidadeLidaCompra: number;
  /** Total do produto depois da soma, em unidade de compra — valor do banco. */
  quantidadeContadaCompra: number;
  diferencaQtdBase: number;
  diferencaPercent: number;
  impactoFinanceiro: number;
  classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
}

export interface LeituraHistorico extends ItemContabilizado {
  id: string;
  chave: string;
  deltaBase: number;
  /** Total logo depois desta leitura: o desfazer só age se o item ainda estiver nele. */
  totalBaseApos: number;
  /** O produto não tinha contagem antes desta leitura — o desfazer volta para "não contado". */
  eraNaoContado: boolean;
  em: number;
}

export type ResultadoBusca =
  | { tipo: 'encontrado'; produto: ProdutoLido }
  | { tipo: 'nao_encontrado'; barcode: string }
  | { tipo: 'fora_do_inventario'; barcode: string }
  | { tipo: 'invalido'; mensagem: string }
  | { tipo: 'erro'; mensagem: string };

export type ResultadoConfirmacao =
  | { tipo: 'contabilizado'; item: ItemContabilizado }
  | { tipo: 'invalido'; mensagem: string }
  | { tipo: 'erro'; mensagem: string };

export type ResultadoDesfazer =
  | { tipo: 'desfeito'; leitura: LeituraHistorico }
  | { tipo: 'vazio' }
  | { tipo: 'erro'; mensagem: string };

interface Deps {
  inventarioId: string;
  buscarPorBarcode: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  /** Soma `deltaBase` (unidade base) no banco, de forma atômica. Lança erro em falha. */
  ajustarContagem: (itemId: string, deltaBase: number, opcoes: OpcoesAjusteContagem) => Promise<AjusteContagemResult>;
}

const HISTORICO_MAX = 10;

const MENSAGEM_ERRO_PADRAO = 'Não foi possível salvar a contagem. Tente novamente.';

// Códigos levantados por inventario_ajustar_contagem / assert_tenant.
const MENSAGENS_ERRO: Array<[string, string]> = [
  ['INVENTARIO_FINALIZADO', 'Este inventário já foi finalizado.'],
  ['INVENTARIO_SOB_ANALISE', 'Inventário sob análise: a contagem está bloqueada.'],
  ['INVENTARIO_RASCUNHO', 'Inventário ainda em rascunho. Inicie a contagem na tela do inventário.'],
  ['CONTAGEM_NEGATIVA', 'A contagem deste produto ficaria negativa: alguém alterou esse item nesse meio-tempo. Confira em "Ver lista completa".'],
  ['ITEM_NAO_ENCONTRADO', 'Este produto não está mais neste inventário.'],
  ['QUANTIDADE_INVALIDA', 'Quantidade inválida.'],
  ['PERMISSION_DENIED', 'Você não tem permissão para contar itens deste inventário.'],
  ['COMPANY_ACCESS_DENIED', 'Sem acesso a esta unidade.'],
  ['Failed to fetch', 'Sem conexão com o servidor. Verifique a internet e tente novamente.'],
];

export function mensagemErroContagem(erro: unknown): string {
  const texto = erro instanceof Error ? erro.message : typeof erro === 'string' ? erro : '';
  if (!texto) return MENSAGEM_ERRO_PADRAO;
  const conhecido = MENSAGENS_ERRO.find(([codigo]) => texto.includes(codigo));
  return conhecido ? conhecido[1] : texto;
}

/**
 * Converte quantidade em unidade de compra para a unidade base salva em
 * contagem_fisica — mesma fórmula usada no onSave de InventoryItemRow.tsx.
 * Duplicada intencionalmente (1 linha) em vez de extraída para não tocar um
 * arquivo que já funciona.
 */
export function converterParaBase(quantidadeCompra: number, fator: number, hasDual: boolean): number {
  return hasDual ? Number((quantidadeCompra * fator).toFixed(4)) : quantidadeCompra;
}

function converterParaCompra(quantidadeBase: number, fator: number, hasDual: boolean): number {
  return hasDual ? Number((quantidadeBase / fator).toFixed(4)) : quantidadeBase;
}

function validarQuantidadeLida(quantidade: number | null): string | null {
  if (quantidade === null) return 'Informe a quantidade.';
  if (quantidade <= 0) return 'A quantidade precisa ser maior que zero.';
  if (quantidade > QUANTIDADE_MAXIMA) return `Quantidade acima do limite (${QUANTIDADE_MAXIMA}).`;
  return null;
}

/**
 * Contagem via código em dois passos: a leitura só identifica o produto; a
 * gravação acontece quando o operador confirma a quantidade. A gravação é uma
 * SOMA no banco (delta), nunca o total calculado aqui — com o total, duas
 * pessoas lendo o mesmo produto partiam do mesmo valor e uma contagem sumia.
 */
export function useContagemPorCodigo({ inventarioId, buscarPorBarcode, ajustarContagem }: Deps) {
  const [processando, setProcessando] = useState(false);
  const [historico, setHistorico] = useState<LeituraHistorico[]>([]);
  const ultimoCodigoRef = useRef<string | null>(null);
  const ultimoEmRef = useRef<number | null>(null);

  const buscarProduto = useCallback(async (raw: string): Promise<ResultadoBusca> => {
    const { valido, codigo, motivo } = validarBarcode(raw);
    if (!valido) return { tipo: 'invalido', mensagem: mensagemBarcodeInvalido(motivo!) };

    const agora = Date.now();
    if (ehLeituraDuplicada(codigo, ultimoCodigoRef.current, ultimoEmRef.current, agora)) {
      ultimoEmRef.current = agora;
      return { tipo: 'invalido', mensagem: 'Leitura repetida ignorada.' };
    }
    ultimoCodigoRef.current = codigo;
    ultimoEmRef.current = agora;

    setProcessando(true);
    try {
      const lookup = await buscarPorBarcode(inventarioId, codigo);
      if (lookup.status === 'not_found') return { tipo: 'nao_encontrado', barcode: codigo };
      if (lookup.status === 'not_in_inventory') return { tipo: 'fora_do_inventario', barcode: codigo };
      if (lookup.status === 'invalid') return { tipo: 'invalido', mensagem: mensagemBarcodeInvalido('vazio') };

      const fator = lookup.fator_conversao_padrao || 1;
      const unidadeCompra = lookup.unidade_compra || lookup.unidade_medida;
      const hasDual = unidadeCompra.toUpperCase() !== lookup.unidade_medida.toUpperCase() && fator !== 1;

      return {
        tipo: 'encontrado',
        produto: {
          itemId: lookup.item_id,
          produtoId: lookup.produto_id,
          nomeProduto: lookup.nome_produto,
          sku: lookup.sku,
          barcode: codigo,
          unidadeCompra,
          fator,
          hasDual,
          contadoCompra: lookup.contagem_fisica === null ? null : converterParaCompra(lookup.contagem_fisica, fator, hasDual),
          chaveLeitura: crypto.randomUUID(),
        },
      };
    } catch (e) {
      console.error('[inventario] busca por código', e);
      return { tipo: 'erro', mensagem: mensagemErroContagem(e) };
    } finally {
      setProcessando(false);
    }
  }, [inventarioId, buscarPorBarcode]);

  const confirmarQuantidade = useCallback(async (
    produto: ProdutoLido,
    quantidadeCompra: number | null,
  ): Promise<ResultadoConfirmacao> => {
    const invalida = validarQuantidadeLida(quantidadeCompra);
    if (invalida || quantidadeCompra === null) return { tipo: 'invalido', mensagem: invalida ?? 'Informe a quantidade.' };

    const deltaBase = converterParaBase(quantidadeCompra, produto.fator, produto.hasDual);
    // Chave derivada da operação, não da tentativa: repetir a mesma quantidade
    // do mesmo produto lido (resposta perdida na rede) reaproveita a chave e o
    // banco não soma de novo; mudar a quantidade é outra operação, outra chave.
    const chave = `${produto.chaveLeitura}:${deltaBase}`;
    setProcessando(true);
    try {
      const resultado = await ajustarContagem(produto.itemId, deltaBase, { origem: 'leitura', chave });
      const totalBase = resultado.contagem_fisica ?? 0;

      const item: ItemContabilizado = {
        itemId: produto.itemId,
        produtoId: produto.produtoId,
        nomeProduto: produto.nomeProduto,
        sku: produto.sku,
        barcode: produto.barcode,
        unidadeCompra: produto.unidadeCompra,
        quantidadeLidaCompra: quantidadeCompra,
        quantidadeContadaCompra: converterParaCompra(totalBase, produto.fator, produto.hasDual),
        diferencaQtdBase: resultado.diferenca_qtd,
        diferencaPercent: resultado.diferenca_percent,
        impactoFinanceiro: resultado.impacto_financeiro,
        classificacao: resultado.classificacao,
      };

      setHistorico(prev => prev.some(h => h.chave === chave) ? prev : [
        {
          ...item,
          id: crypto.randomUUID(),
          chave,
          deltaBase,
          totalBaseApos: resultado.contagem_apos ?? totalBase,
          eraNaoContado: resultado.contagem_anterior === null,
          em: Date.now(),
        },
        ...prev,
      ].slice(0, HISTORICO_MAX));

      return { tipo: 'contabilizado', item };
    } catch (e) {
      console.error('[inventario] ajustar contagem', e);
      return { tipo: 'erro', mensagem: mensagemErroContagem(e) };
    } finally {
      setProcessando(false);
    }
  }, [ajustarContagem]);

  const desfazerUltimaLeitura = useCallback(async (): Promise<ResultadoDesfazer> => {
    const [ultima] = historico;
    if (!ultima) return { tipo: 'vazio' };
    setProcessando(true);
    try {
      // Subtrai exatamente o que a leitura somou, e só se o item ainda estiver
      // no total que ela deixou: se alguém contou de novo ou corrigiu pela lista,
      // subtrair daria um número que ninguém contou.
      const resultado = await ajustarContagem(ultima.itemId, -ultima.deltaBase, {
        origem: 'desfazer',
        chave: `desfazer:${ultima.chave}`,
        esperado: ultima.totalBaseApos,
        restaurarNaoContado: ultima.eraNaoContado,
      });
      setHistorico(prev => prev.filter(h => h.id !== ultima.id));
      if (resultado.conflito) {
        return {
          tipo: 'erro',
          mensagem: `Não dá para desfazer: ${ultima.nomeProduto} foi contado de novo depois desta leitura. Confira o total em "Ver lista completa".`,
        };
      }
      return { tipo: 'desfeito', leitura: ultima };
    } catch (e) {
      console.error('[inventario] desfazer leitura', e);
      return { tipo: 'erro', mensagem: mensagemErroContagem(e) };
    } finally {
      setProcessando(false);
    }
  }, [historico, ajustarContagem]);

  return { buscarProduto, confirmarQuantidade, desfazerUltimaLeitura, historico, processando };
}

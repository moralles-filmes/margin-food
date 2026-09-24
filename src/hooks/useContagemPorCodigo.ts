import { useCallback, useRef, useState } from 'react';
import { validarBarcode, mensagemBarcodeInvalido, ehLeituraDuplicada } from '@/domain/estoque/barcode';
import type { BarcodeLookupResult, UpdateContagemResult } from '@/hooks/useInventarioStore';

export interface ItemContabilizado {
  itemId: string;
  produtoId: string;
  nomeProduto: string;
  sku: string;
  barcode: string;
  unidadeCompra: string;
  quantidadeContadaCompra: number;
  diferencaQtdBase: number;
  diferencaPercent: number;
  impactoFinanceiro: number;
  classificacao: 'NORMAL' | 'ALERTA' | 'CRITICO';
}

export interface LeituraHistorico extends ItemContabilizado {
  id: string;
  quantidadeAnteriorBase: number;
  quantidadeNovaBase: number;
  em: number;
}

export type ResultadoLeitura =
  | { tipo: 'contabilizado'; item: ItemContabilizado }
  | { tipo: 'nao_encontrado'; barcode: string }
  | { tipo: 'fora_do_inventario'; barcode: string }
  | { tipo: 'invalido'; mensagem: string }
  | { tipo: 'erro'; mensagem: string };

interface Deps {
  inventarioId: string;
  buscarPorBarcode: (inventarioId: string, barcode: string) => Promise<BarcodeLookupResult>;
  salvarContagem: (itemId: string, contagemBase: number) => Promise<UpdateContagemResult | null>;
}

const HISTORICO_MAX = 10;

/**
 * Converte quantidade em unidade de compra para a unidade base salva em
 * contagem_fisica — mesma fórmula usada no onSave de InventoryItemRow.tsx.
 * Duplicada intencionalmente (1 linha) em vez de extraída para não tocar um
 * arquivo que já funciona.
 */
export function converterParaBase(quantidadeCompra: number, fator: number, hasDual: boolean): number {
  return hasDual ? Number((quantidadeCompra * fator).toFixed(4)) : quantidadeCompra;
}

export function useContagemPorCodigo({ inventarioId, buscarPorBarcode, salvarContagem }: Deps) {
  const [processando, setProcessando] = useState(false);
  const [historico, setHistorico] = useState<LeituraHistorico[]>([]);
  const ultimoCodigoRef = useRef<string | null>(null);
  const ultimoEmRef = useRef<number | null>(null);

  const processarLeitura = useCallback(async (raw: string): Promise<ResultadoLeitura> => {
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
      const atualBase = lookup.contagem_fisica ?? 0;
      const atualCompra = hasDual ? atualBase / fator : atualBase;
      const novaCompra = atualCompra + 1;
      const novaBase = converterParaBase(novaCompra, fator, hasDual);

      const resultado = await salvarContagem(lookup.item_id, novaBase);
      if (!resultado) return { tipo: 'erro', mensagem: 'Não foi possível salvar a contagem. Tente novamente.' };

      const item: ItemContabilizado = {
        itemId: lookup.item_id,
        produtoId: lookup.produto_id,
        nomeProduto: lookup.nome_produto,
        sku: lookup.sku,
        barcode: codigo,
        unidadeCompra,
        quantidadeContadaCompra: novaCompra,
        diferencaQtdBase: resultado.diferenca_qtd,
        diferencaPercent: resultado.diferenca_percent,
        impactoFinanceiro: resultado.impacto_financeiro,
        classificacao: resultado.classificacao,
      };

      setHistorico(prev => [
        { ...item, id: crypto.randomUUID(), quantidadeAnteriorBase: atualBase, quantidadeNovaBase: novaBase, em: agora },
        ...prev,
      ].slice(0, HISTORICO_MAX));

      return { tipo: 'contabilizado', item };
    } finally {
      setProcessando(false);
    }
  }, [inventarioId, buscarPorBarcode, salvarContagem]);

  const desfazerUltimaLeitura = useCallback(async (): Promise<boolean> => {
    const [ultima] = historico;
    if (!ultima) return false;
    const resultado = await salvarContagem(ultima.itemId, ultima.quantidadeAnteriorBase);
    if (!resultado) return false;
    setHistorico(prev => prev.slice(1));
    return true;
  }, [historico, salvarContagem]);

  return { processarLeitura, desfazerUltimaLeitura, historico, processando };
}

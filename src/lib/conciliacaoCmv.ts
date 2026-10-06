/**
 * Conciliação Bancária × CMV Financeiro: decisão "Aparecer no CMV financeiro?" e
 * competência própria da linha do extrato que vira despesa nova.
 *
 * A data do banco (`data` da linha) é sempre o `p_data` de reconcile_import_lancamento:
 * é ela que entra na chave de idempotência e na checagem de duplicata. A competência
 * só muda a data de competência (DRE e CMV). Nada disso vai ao servidor quando o banco
 * ainda não tem o recurso (`recursos.lancamentos`).
 */
import { decisaoAoTrocarCategoria, type CmvAvisoDecisao, type CmvDecisao } from '@/domain/financeiro/cmv';

export interface RateioExtratoCmv {
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
  cmv_incluir?: CmvDecisao;
  cmv_aviso?: CmvAvisoDecisao;
}

export interface LinhaExtratoCmv {
  data: string;
  valor: number;
  tipo: 'RECEITA' | 'DESPESA';
  categoriaId?: string;
  rateioLinhas?: RateioExtratoCmv[];
  /** Decisão da linha sem rateio. Ausente em linha salva antes do recurso = pendente. */
  cmvIncluir?: CmvDecisao;
  cmvAviso?: CmvAvisoDecisao;
  /** Competência própria (yyyy-MM-dd); ausente = a data do banco. */
  competencia?: string;
}

export interface ItemRateioImportacao {
  categoria_id: string | null;
  centro_custo_id: string | null;
  valor: number;
  percentual: number | null;
  observacao: string | null;
  cmv_incluir?: CmvDecisao;
}

/** Rateio (ou categoria única) da linha no formato de `reconcile_import_lancamento`. `null` = sem categoria. */
export function rateioDaLinhaExtrato(
  l: LinhaExtratoCmv,
  centroPadrao: (categoriaId: string) => string | null,
  enviaCmv: boolean,
): ItemRateioImportacao[] | null {
  const comCmv = enviaCmv && l.tipo === 'DESPESA';
  if (l.rateioLinhas && l.rateioLinhas.length > 0) {
    return l.rateioLinhas.map(r => ({
      categoria_id: r.categoria_id || null,
      centro_custo_id: r.centro_custo_id || null,
      valor: r.valor,
      percentual: r.percentual || null,
      observacao: r.observacao || null,
      ...(comCmv ? { cmv_incluir: r.cmv_incluir ?? null } : {}),
    }));
  }
  if (l.categoriaId) {
    return [{
      categoria_id: l.categoriaId,
      centro_custo_id: centroPadrao(l.categoriaId),
      valor: l.valor,
      percentual: 100,
      observacao: null,
      ...(comCmv ? { cmv_incluir: l.cmvIncluir ?? null } : {}),
    }];
  }
  return null;
}

/** `p_data_competencia` só quando difere da data do banco, em despesa, e o banco aceita o parâmetro. */
export function competenciaDaLinhaExtrato(l: LinhaExtratoCmv, aceita: boolean): { p_data_competencia?: string } {
  if (!aceita || l.tipo !== 'DESPESA' || !l.competencia || l.competencia === l.data) return {};
  return { p_data_competencia: l.competencia };
}

/** Decisão exibida na linha: com rateio de uma linha, a dessa linha; senão, a da linha do extrato. */
export function decisaoDaLinhaExtrato(l: LinhaExtratoCmv): CmvDecisao {
  if (l.rateioLinhas && l.rateioLinhas.length === 1) return l.rateioLinhas[0].cmv_incluir ?? null;
  return l.cmvIncluir ?? null;
}

/** Resposta dada na própria linha: grava onde a importação vai ler. */
export function definirDecisaoDaLinha<T extends LinhaExtratoCmv>(l: T, decisao: boolean): T {
  const rateioLinhas = l.rateioLinhas && l.rateioLinhas.length === 1
    ? [{ ...l.rateioLinhas[0], cmv_incluir: decisao, cmv_aviso: undefined }]
    : l.rateioLinhas;
  return { ...l, rateioLinhas, cmvIncluir: decisao, cmvAviso: undefined };
}

/**
 * Trocar a categoria no seletor da linha. A categoria visível passa a valer: um
 * rateio de uma linha salvo antes era usado na importação em silêncio, ignorando o
 * que a tela mostrava. Com `padroes` (classificação ativa), a decisão é sugerida de
 * novo pelo padrão da categoria; sem eles, a resposta da linha não muda sozinha.
 */
export function trocarCategoriaDaLinha<T extends LinhaExtratoCmv>(
  l: T,
  categoriaId: string,
  padroes: ReadonlyMap<string, CmvDecisao> | null,
): T {
  const base: T = { ...l, categoriaId, rateioLinhas: undefined };
  if (l.tipo !== 'DESPESA') return base;
  // O rateio de uma linha sai daqui: a resposta que só vivia nele passa para a própria linha.
  const atual = decisaoDaLinhaExtrato(l);
  if (!padroes) return { ...base, cmvIncluir: atual };
  const { cmv_incluir, cmv_aviso } = decisaoAoTrocarCategoria(atual, categoriaId, padroes);
  return { ...base, cmvIncluir: cmv_incluir, cmvAviso: cmv_aviso };
}

export function resumoCmvRateio(linhas: readonly RateioExtratoCmv[]): { total: number; respondidas: number } {
  return { total: linhas.length, respondidas: linhas.filter(r => (r.cmv_incluir ?? null) !== null).length };
}

/**
 * Datas do lançamento criado pelo diálogo "Criar" (destino lançamento).
 *
 * `dataBanco` é a data da linha do extrato, nunca o campo editável do diálogo: ela
 * entra na chave de idempotência e na checagem de duplicata de
 * `reconcile_import_lancamento`. Com o banco atualizado, ela vai sempre em `p_data` e
 * a competência editada em `p_data_competencia` (só quando preenchida e diferente da
 * data do banco). Sem o recurso, o fluxo antigo: competência em `p_data` e a data de
 * pagamento corrigida depois por UPDATE (`atualizaPagamento`).
 */
export function datasDoLancamentoCriado({ dataBanco, dataCompetencia, aceitaCompetencia }: {
  dataBanco: string;
  dataCompetencia: string;
  aceitaCompetencia: boolean;
}): { p_data: string; extra: { p_data_competencia?: string }; atualizaPagamento: boolean } {
  if (!aceitaCompetencia) return { p_data: dataCompetencia, extra: {}, atualizaPagamento: true };
  return {
    p_data: dataBanco,
    extra: dataCompetencia && dataCompetencia !== dataBanco ? { p_data_competencia: dataCompetencia } : {},
    atualizaPagamento: false,
  };
}

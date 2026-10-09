/**
 * Decisão "Aparecer no CMV financeiro?" das despesas do Livro Razão, no formato
 * de `_guarded_upsert_lancamento` e `_guarded_update_reconciled_classification`.
 *
 * Só vai ao servidor quando `enviaCmv`: o banco tem o recurso (`recursos.lancamentos`),
 * a despesa é DESPESA e, na edição, as decisões foram lidas ao abrir. Sem isso o
 * payload é o de antes e o servidor preserva (herda) as decisões que já existem.
 */
import type { CmvDecisao } from '@/domain/financeiro/cmv';

export interface LinhaRateioCmv {
  /** Id da linha já gravada: o servidor mantém o identificador na edição. */
  id?: string;
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  cmv_incluir?: CmvDecisao;
}

export interface RateioPayload {
  categoria_id: string;
  centro_custo_id: string | null;
  valor: number;
  percentual: number | null;
  observacao: null;
  id?: string | null;
  cmv_incluir?: CmvDecisao;
}

export function rateiosComCmv(linhas: readonly LinhaRateioCmv[], enviaCmv: boolean): RateioPayload[] {
  return linhas.map(l => ({
    categoria_id: l.categoria_id,
    centro_custo_id: l.centro_custo_id || null,
    valor: Number(l.valor),
    percentual: l.percentual || null,
    observacao: null,
    ...(enviaCmv ? { id: l.id ?? null, cmv_incluir: l.cmv_incluir ?? null } : {}),
  }));
}

/** `p_cmv` = decisão da despesa SEM rateio; com rateio, a decisão é de cada linha. */
export function cmvDoCabecalho(temRateio: boolean, decisao: CmvDecisao | undefined, enviaCmv: boolean): { p_cmv?: { incluir: CmvDecisao } } {
  if (!enviaCmv) return {};
  return { p_cmv: { incluir: temRateio ? null : (decisao ?? null) } };
}

/**
 * Conteúdo da chave de idempotência da criação no Livro Razão: os parâmetros sem o
 * que vem do CMV (`p_cmv` e, em cada item de `p_rateios`, `cmv_incluir` e `id`).
 * O servidor reconhece o reenvio pela operação (tipo, valor, conta, competência,
 * descrição, categoria), não pela resposta: com a resposta na chave, trocar Sim/Não
 * depois de uma resposta perdida gerava chave nova e um 2º lançamento. Usar o mesmo
 * conteúdo em `chave` e em `confirmar`. Devolve uma cópia; o original não muda.
 */
export function conteudoChaveLancamento(params: Record<string, unknown>): Record<string, unknown> {
  const { p_cmv: _cmv, ...resto } = params;
  if (!Array.isArray(resto.p_rateios)) return resto;
  return {
    ...resto,
    p_rateios: resto.p_rateios.map(item => {
      if (typeof item !== 'object' || item === null) return item;
      const { cmv_incluir: _incluir, id: _id, ...linha } = item as Record<string, unknown>;
      return linha;
    }),
  };
}

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

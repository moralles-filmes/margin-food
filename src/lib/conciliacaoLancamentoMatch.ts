import { addDays, subDays } from 'date-fns';
import { computeScore } from '@/lib/conciliacaoScore';
import { parseLocalDate } from '@/lib/formatters';
import { formatInBR } from '@/lib/datetime';

export type SituacaoConta = 'mesma' | 'sem_conta' | 'outra';

export interface CandidatoLancamentoMatch {
  tipo: string;
  valor: number;
  status?: string | null;
  data_competencia: string;
  data_pagamento?: string | null;
  data_vencimento?: string | null;
  descricao?: string | null;
  conta_id?: string | null;
  referencia_modulo?: string | null;
  origem?: string | null;
}

/** Origens que `reconcile_link_existing_lancamento` nunca muda de conta: a conta
 *  delas vem do título ou do extrato da própria conta. */
const ORIGENS_SEM_MUDANCA_DE_CONTA = new Set(['espelho_cp', 'espelho_cr', 'ajuste_pagamento', 'transferencia', 'conciliacao']);

/** Origens que o vínculo aceita com valor diferente do extrato: o espelho guarda o
 *  valor do título e a diferença já virou lançamento de ajuste. */
const ORIGENS_VALOR_DO_TITULO = new Set(['espelho_cp', 'espelho_cr', 'ajuste_pagamento', 'transferencia']);

/** Compara em centavos: `Math.abs(a - b) < 0.01` trata 10,10 × 10,09 como iguais. */
const mesmoValor = (a: number, b: number) => Math.round(Number(a) * 100) === Math.round(Number(b) * 100);

/**
 * Mesma regra de `reconcile_link_existing_lancamento` (VALOR_DIVERGENTE): o vínculo
 * mantém o valor do lançamento, então lançamento manual com valor diferente do
 * extrato deixaria o saldo da conta errado sem aviso — precisa ser corrigido no
 * Livro Razão antes de conciliar.
 */
export function valorDivergenteDoExtrato(
  linhaValor: number,
  c: { valor: number; tipo?: string | null; origem?: string | null },
): boolean {
  if (c.tipo === 'TRANSFERENCIA' || ORIGENS_VALOR_DO_TITULO.has(c.origem ?? '')) return false;
  return !mesmoValor(c.valor, linhaValor);
}

export interface AvaliacaoLancamento {
  score: number;
  data: string;
  previsto: boolean;
  situacaoConta: SituacaoConta;
}

/** Previsto manual é sugestão; previsto de CP/CR deve ser baixado pelo título. */
export function avaliarLancamentoCandidato(
  linha: { valor: number; data: string; descricao: string; tipo: string },
  c: CandidatoLancamentoMatch,
  contaSel: string | null,
): AvaliacaoLancamento | null {
  const status = c.status ?? 'REALIZADO';
  if (c.tipo !== linha.tipo || !['REALIZADO', 'PREVISTO'].includes(status)) return null;
  const previsto = status === 'PREVISTO';
  if (previsto && c.referencia_modulo?.trim()) return null;
  const dates = previsto
    ? [c.data_pagamento, c.data_vencimento, c.data_competencia]
    : [c.data_pagamento || c.data_competencia];
  let score = 0;
  let data = '';
  for (const date of dates) {
    if (!date) continue;
    const candidateScore = computeScore(linha.valor, linha.data, linha.descricao, Number(c.valor), date, c.descricao || '');
    // Empate mantém a primeira data: pagamento, vencimento e competência.
    if (candidateScore > score) { score = candidateScore; data = date; }
  }
  if (score === 0) return null;
  const situacaoConta: SituacaoConta = !c.conta_id ? 'sem_conta' : c.conta_id === contaSel ? 'mesma' : 'outra';
  // O servidor recusa trazer de outra conta o que pertence a título ou extrato:
  // oferecer só levaria a pessoa a confirmar e ver o erro no Processar.
  if (situacaoConta === 'outra'
    && (ORIGENS_SEM_MUDANCA_DE_CONTA.has(c.origem ?? '') || !!c.referencia_modulo?.trim())) return null;
  return { score: score + (situacaoConta === 'mesma' ? 10 : 0), data, previsto, situacaoConta };
}

/**
 * Valor aproximado continua sugerido, mas só espelhos preservam o match automático.
 * Boleto exige o centavo desde que a tolerância de 5% casou boleto de um fornecedor
 * com linha de outro (KIDELICIA 1.185,14 × 1.138,60, exatamente 60 pontos) e baixou
 * 21 contas de uma vez; lançamento manual segue a mesma regra, porque o vínculo
 * mantém o valor dele e a diferença sumiria do saldo sem aviso.
 */
export function casaSozinho(linhaValor: number, s: {
  origin: 'lancamento' | 'conta_pagar' | 'conta_receber';
  valor: number;
  score: number;
  jaNoRazao?: boolean;
  previsto?: boolean;
  situacaoConta?: SituacaoConta;
}): boolean {
  if (s.score < 60) return false;
  const valorExato = mesmoValor(s.valor, linhaValor);
  if (s.origin !== 'lancamento') return valorExato;
  if (s.jaNoRazao) return true;
  return !s.previsto && s.situacaoConta !== 'outra' && valorExato;
}

/** Fora de sete dias das datas do arquivo, nenhum candidato pontua. */
export function janelaCandidatos(datas: string[]): { inicio: string; fim: string } | null {
  if (datas.length === 0) return null;
  const sorted = [...datas].sort();
  return {
    inicio: formatInBR(subDays(parseLocalDate(sorted[0]), 7), 'yyyy-MM-dd'),
    fim: formatInBR(addDays(parseLocalDate(sorted[sorted.length - 1]), 7), 'yyyy-MM-dd'),
  };
}

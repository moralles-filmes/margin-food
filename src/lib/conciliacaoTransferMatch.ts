import { computeScore } from '@/lib/conciliacaoScore';

/**
 * Reconhece a contrapartida de uma transferência entre contas por valor/data,
 * sem depender de FITID (OFX) nem de vínculo persistido em fin_conciliacao_vinculos.
 *
 * Contexto do bug: o modelo de transferência é um único fin_lancamentos
 * (tipo='TRANSFERENCIA', conta_id=origem, conta_destino_id=destino), criado
 * inteiro pela primeira conta conciliada. Ao importar o extrato da SEGUNDA
 * conta, o matcher genérico nunca reconhece esse lançamento como candidato —
 * ele compara `ex.tipo === linha.tipo`, e uma linha de extrato só é
 * RECEITA/DESPESA, nunca TRANSFERENCIA. A RPC reconcile_auto_bind_transfer_
 * counterparts cobre o caso com FITID (OFX), mas é best-effort (falha calada)
 * e não roda para CSV (sem FITID). Este matcher client-side é a camada de
 * segurança: roda sempre, mesmo sem FITID, e usa a mesma regra conservadora
 * de "só reconhece se for candidato inequívoco" (maior score, respeitando o
 * mesmo limiar de confiança já usado para lançamentos comuns).
 */
export interface TransferCandidate {
  id: string;
  conta_id: string;
  conta_destino_id: string;
  valor: number;
  data_competencia: string;
  descricao: string | null;
}

export interface TransferMatchResult {
  id: string;
  score: number;
}

const TRANSFER_MATCH_THRESHOLD = 60;

export function matchTransferCandidate(
  linha: { tipo: 'RECEITA' | 'DESPESA'; valor: number; data: string; descricao: string },
  contaSel: string,
  candidates: TransferCandidate[],
  usedIds: Set<string>,
): TransferMatchResult | undefined {
  let best: TransferMatchResult | undefined;

  for (const c of candidates) {
    if (usedIds.has(`transfer-${c.id}`)) continue;

    // Linha de saída (DESPESA) só pode ser a perna de origem da transferência;
    // linha de entrada (RECEITA) só pode ser a perna de destino.
    const isOrigemLeg = linha.tipo === 'DESPESA' && c.conta_id === contaSel;
    const isDestinoLeg = linha.tipo === 'RECEITA' && c.conta_destino_id === contaSel;
    if (!isOrigemLeg && !isDestinoLeg) continue;

    const score = computeScore(linha.valor, linha.data, linha.descricao, c.valor, c.data_competencia, c.descricao || '');
    if (score === 0) continue;
    if (!best || score > best.score) best = { id: c.id, score };
  }

  return best && best.score >= TRANSFER_MATCH_THRESHOLD ? best : undefined;
}

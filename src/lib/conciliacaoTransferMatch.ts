import { fitidKey } from '@/lib/conciliacaoConciliados';
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

/**
 * Transferência de mesmo valor, próxima em data, que NÃO foi reconhecida
 * automaticamente como contrapartida desta linha. Serve só para avisar o
 * usuário antes que ele crie a segunda cópia da mesma transferência.
 */
export interface TransferWarning {
  id: string;
  valor: number;
  data: string;
  conta_id: string;
  conta_destino_id: string;
  diasDiferenca: number;
  /** true quando a transferência existente aponta na direção oposta à da linha
   *  (ex.: linha de entrada nesta conta, mas a transferência sai dela). Costuma
   *  indicar que a direção foi invertida no lançamento original. */
  direcaoInvertida: boolean;
}

const TRANSFER_MATCH_THRESHOLD = 60;

/** Mesma janela em que computeScore ainda considera duas datas relacionadas. */
const TRANSFER_WARNING_WINDOW_DAYS = 7;

const VALOR_EPSILON = 0.01;

function diffDias(dataA: string, dataB: string): number {
  const a = new Date(dataA).getTime();
  const b = new Date(dataB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs((a - b) / 86400000);
}

/**
 * Remove as transferências cuja perna NESTA conta já está amarrada, pelo FITID,
 * a uma linha do arquivo atual. Essa linha é reivindicada pelo fast-path de
 * FITID; oferecer a mesma transferência como contrapartida por valor/data fazia
 * ela cobrir também OUTRA linha do arquivo — que aparecia como "já conciliada" e
 * nunca virava lançamento (caso real: Pix de R$ 500 do Del Match em 05/10 casou
 * com a transferência de R$ 500 de 01/10, já vinculada à própria linha).
 *
 * Só exclui quando o FITID vinculado está no arquivo, igual a
 * buildConciliadosCounts: Santander e PagBank podem regenerar o FITID a cada
 * download, e aí este matcher é a única camada que reconhece a mesma linha
 * reimportada. O servidor (reconcile_auto_bind_transfer_counterparts) já exige a
 * ausência de vínculo nesta conta.
 *
 * `vinculos` precisa ser só os da conta selecionada.
 */
export function excluirTransferenciasVinculadasNoArquivo(
  candidates: TransferCandidate[],
  vinculos: ReadonlyArray<{ external_id: string; tipo: string; lancamento_id: string }>,
  fitidsNoArquivo: ReadonlySet<string>,
): TransferCandidate[] {
  const cobertas = new Set<string>();
  for (const v of vinculos) {
    if (v.lancamento_id && fitidsNoArquivo.has(fitidKey(v.tipo, v.external_id))) cobertas.add(v.lancamento_id);
  }
  return cobertas.size === 0 ? candidates : candidates.filter(c => !cobertas.has(c.id));
}

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

/**
 * Transferências de MESMO valor que tocam a conta selecionada dentro da janela
 * de datas, mas que não foram reconhecidas automaticamente (score abaixo do
 * limiar, direção invertida no lançamento original, ou já consumidas por outra
 * linha do mesmo extrato).
 *
 * Existe porque o reconhecimento automático é deliberadamente conservador: ele
 * só marca a linha como resolvida quando o candidato é inequívoco. Sem este
 * aviso, todo caso ambíguo cai silenciosamente no fluxo "criar nova" — que é
 * como a mesma transferência acabava lançada duas (e até três) vezes.
 *
 * Chamar somente quando matchTransferCandidate NÃO reconheceu a linha.
 */
export function findTransferWarnings(
  linha: { tipo: 'RECEITA' | 'DESPESA'; valor: number; data: string },
  contaSel: string,
  candidates: TransferCandidate[],
  usedIds: Set<string>,
  options?: { janelaDias?: number; limite?: number },
): TransferWarning[] {
  const janela = options?.janelaDias ?? TRANSFER_WARNING_WINDOW_DAYS;
  const limite = options?.limite ?? 3;
  const warnings: TransferWarning[] = [];

  for (const c of candidates) {
    const tocaConta = c.conta_id === contaSel || c.conta_destino_id === contaSel;
    if (!tocaConta) continue;

    // Só valor idêntico: aproximação de valor gera ruído demais num aviso que o
    // usuário lê linha a linha.
    if (Math.abs(Number(c.valor) - linha.valor) >= VALOR_EPSILON) continue;

    const dias = diffDias(linha.data, c.data_competencia);
    if (!(dias <= janela)) continue;

    const direcaoEsperada =
      (linha.tipo === 'DESPESA' && c.conta_id === contaSel) ||
      (linha.tipo === 'RECEITA' && c.conta_destino_id === contaSel);

    // Candidato já casado por outra linha deste mesmo extrato na direção certa
    // não é surpresa nenhuma — não vira aviso. Na direção invertida ele continua
    // relevante: é o sintoma de origem/destino trocados no lançamento original.
    if (usedIds.has(`transfer-${c.id}`) && direcaoEsperada) continue;

    warnings.push({
      id: c.id,
      valor: Number(c.valor),
      data: c.data_competencia,
      conta_id: c.conta_id,
      conta_destino_id: c.conta_destino_id,
      diasDiferenca: dias,
      direcaoInvertida: !direcaoEsperada,
    });
  }

  warnings.sort((a, b) => a.diasDiferenca - b.diasDiferenca);
  return warnings.slice(0, limite);
}

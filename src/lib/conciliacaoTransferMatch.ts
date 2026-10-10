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
  /** A perna desta conta já tem vínculo com um FITID que não está no arquivo —
   *  só a mesma linha reimportada com FITID regenerado pode ser ela. */
  vinculoForaDoArquivo?: boolean;
}

/** Linha do extrato ainda sem identidade resolvida, candidata a contrapartida. */
export interface LinhaContrapartida {
  indice: number;
  tipo: 'RECEITA' | 'DESPESA';
  valor: number;
  data: string;
  descricao: string;
}

export interface PeriodoArquivo {
  inicio: string;
  fim: string;
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

/**
 * Reimportação com FITID regenerado é a mesma linha, na mesma data. Com 1 dia de
 * folga, na virada entre dois extratos a linha do dia seguinte (outro Pix de
 * mesmo valor) ficava com a transferência da linha que estava no arquivo anterior.
 */
const VINCULO_FORA_DO_ARQUIVO_MAX_DIAS = 0;

/**
 * Transferência fora do período do arquivo tem a contrapartida fora dele — a
 * folga de 1 dia deixava outra linha de mesmo valor no 1º/2º dia do arquivo
 * ficar com ela. TED que cai no dia seguinte, na borda do arquivo, vira aviso.
 */
const PERIODO_ARQUIVO_FOLGA_DIAS = 0;

function diffDias(dataA: string, dataB: string): number {
  const a = new Date(dataA).getTime();
  const b = new Date(dataB).getTime();
  if (Number.isNaN(a) || Number.isNaN(b)) return Number.POSITIVE_INFINITY;
  return Math.abs((a - b) / 86400000);
}

export function periodoDoArquivo(datas: ReadonlyArray<string>): PeriodoArquivo | undefined {
  const validas = datas.map(d => d.slice(0, 10)).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d));
  if (validas.length === 0) return undefined;
  return {
    inicio: validas.reduce((min, d) => (d < min ? d : min)),
    fim: validas.reduce((max, d) => (d > max ? d : max)),
  };
}

/**
 * Prepara as transferências que tocam a conta para o reconhecimento de
 * contrapartida. `vinculos` precisa ser só os da conta selecionada.
 *
 * - Vínculo nesta conta com FITID NO arquivo: sai dos candidatos (e dos avisos).
 *   A própria linha já a reivindica pelo FITID; oferecê-la por valor/data fazia
 *   ela cobrir também OUTRA linha, que ficava "já conciliada" sem lançamento
 *   (Pix de R$ 500 do Del Match em 05/10 × transferência de R$ 500 de 01/10).
 * - Vínculo nesta conta com FITID FORA do arquivo: continua candidata, marcada
 *   `vinculoForaDoArquivo` — Santander e PagBank podem regenerar o FITID, e aí
 *   só este matcher reconhece a mesma linha reimportada; num arquivo que não a
 *   contém, a regra estrita de scoreContrapartida impede que capture outra.
 */
export function prepararCandidatosTransferencia(
  candidates: TransferCandidate[],
  vinculos: ReadonlyArray<{ external_id: string; tipo: string; lancamento_id: string }>,
  fitidsNoArquivo: ReadonlySet<string>,
): TransferCandidate[] {
  const noArquivo = new Set<string>();
  const foraDoArquivo = new Set<string>();
  for (const v of vinculos) {
    if (!v.lancamento_id) continue;
    if (fitidsNoArquivo.has(fitidKey(v.tipo, v.external_id))) noArquivo.add(v.lancamento_id);
    else foraDoArquivo.add(v.lancamento_id);
  }
  return candidates
    .filter(c => !noArquivo.has(c.id))
    .map(c => (foraDoArquivo.has(c.id) ? { ...c, vinculoForaDoArquivo: true } : c));
}

/** Score do par linha × transferência para reconhecimento automático; 0 = não reconhece. */
function scoreContrapartida(
  linha: Omit<LinhaContrapartida, 'indice'>,
  contaSel: string,
  c: TransferCandidate,
  periodo: PeriodoArquivo | undefined,
): number {
  // Linha de saída (DESPESA) só pode ser a perna de origem da transferência;
  // linha de entrada (RECEITA) só pode ser a perna de destino.
  const isOrigemLeg = linha.tipo === 'DESPESA' && c.conta_id === contaSel;
  const isDestinoLeg = linha.tipo === 'RECEITA' && c.conta_destino_id === contaSel;
  if (!isOrigemLeg && !isDestinoLeg) return 0;

  // As duas pernas de uma transferência têm o mesmo valor. A tolerância de 1–5%
  // do computeScore deixava a linha de R$ 497 "já conciliada" por uma
  // transferência de R$ 500, e o saldo ficava R$ 3 errado sem nenhum aviso.
  if (Math.abs(Number(c.valor) - linha.valor) >= VALOR_EPSILON) return 0;

  if (c.vinculoForaDoArquivo
    && diffDias(linha.data, c.data_competencia) > VINCULO_FORA_DO_ARQUIVO_MAX_DIAS) return 0;

  if (periodo) {
    const antes = c.data_competencia < periodo.inicio && diffDias(c.data_competencia, periodo.inicio) > PERIODO_ARQUIVO_FOLGA_DIAS;
    const depois = c.data_competencia > periodo.fim && diffDias(c.data_competencia, periodo.fim) > PERIODO_ARQUIVO_FOLGA_DIAS;
    if (antes || depois) return 0;
  }

  const score = computeScore(linha.valor, linha.data, linha.descricao, Number(c.valor), c.data_competencia, c.descricao || '');
  return score >= TRANSFER_MATCH_THRESHOLD ? score : 0;
}

/**
 * Atribui cada transferência a no máximo UMA linha, pelo melhor par do arquivo
 * inteiro, independente da ordem das linhas. Linha a linha, na ordem do arquivo
 * (OFX vem do mais novo ao mais antigo), uma linha de mesmo valor dias depois
 * pegava a transferência antes da contrapartida real, que ia para "criar nova".
 *
 * Os pares são decididos do maior score para o menor. Num mesmo score, se a
 * linha tem duas transferências livres ou a transferência tem duas linhas
 * livres, nenhum dos envolvidos é atribuído (nem depois, com score menor): o
 * empate fica para findTransferWarnings e para o usuário.
 *
 * `linhas` são só as que não se resolveram por ContaMax, FITID, conteúdo ou
 * ignorada. Retorna índice da linha → id da transferência.
 */
export function atribuirContrapartidasTransferencia(
  linhas: ReadonlyArray<LinhaContrapartida>,
  contaSel: string,
  candidates: ReadonlyArray<TransferCandidate>,
  periodo?: PeriodoArquivo,
): Map<number, string> {
  const pares: { indice: number; id: string; score: number }[] = [];
  for (const linha of linhas) {
    for (const c of candidates) {
      const score = scoreContrapartida(linha, contaSel, c, periodo);
      if (score > 0) pares.push({ indice: linha.indice, id: c.id, score });
    }
  }

  const atribuicao = new Map<number, string>();
  const linhasFechadas = new Set<number>();
  const transferenciasFechadas = new Set<string>();
  const niveis = [...new Set(pares.map(p => p.score))].sort((a, b) => b - a);

  for (const nivel of niveis) {
    const livres = pares.filter(p => p.score === nivel && !linhasFechadas.has(p.indice) && !transferenciasFechadas.has(p.id));
    const porLinha = new Map<number, number>();
    const porTransferencia = new Map<string, number>();
    for (const p of livres) {
      porLinha.set(p.indice, (porLinha.get(p.indice) || 0) + 1);
      porTransferencia.set(p.id, (porTransferencia.get(p.id) || 0) + 1);
    }
    for (const p of livres) {
      if (porLinha.get(p.indice) === 1 && porTransferencia.get(p.id) === 1) atribuicao.set(p.indice, p.id);
      linhasFechadas.add(p.indice);
      transferenciasFechadas.add(p.id);
    }
  }

  return atribuicao;
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
 * Chamar somente para linha sem transferência em atribuirContrapartidasTransferencia.
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

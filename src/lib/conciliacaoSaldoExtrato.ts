import { getConsolidatedBankDelta, isAutomaticInvestmentLine } from '@/lib/conciliacaoInvestimentoAutomatico';

/** Saldo final confirmado no upload do extrato, separado do saldo do razão. */
export interface SaldoExtratoRef {
  valor: number;
  data: string;
}

interface SaldoExtratoLinha {
  data: string;
  descricao?: string | null;
  tipo: string;
  valor: number;
  jaConciliada?: boolean;
  ignorada?: boolean;
}

/**
 * LEDGERBAL é confiável como saldo da conta descrita no OFX, mas alguns bancos
 * (Santander ContaMax) omitem o investimento automático. Nesses arquivos o valor
 * continua informativo, porém nunca pode preencher o total consolidado.
 */
export function classifySaldoArquivo(
  saldoArquivo: SaldoExtratoRef | undefined,
  linhas: ReadonlyArray<SaldoExtratoLinha>,
): {
  saldoSugerido?: SaldoExtratoRef;
  saldoContaCorrenteArquivo?: SaldoExtratoRef;
} {
  if (!saldoArquivo) return {};
  if (linhas.some(isAutomaticInvestmentLine)) {
    return { saldoContaCorrenteArquivo: saldoArquivo };
  }
  return { saldoSugerido: saldoArquivo };
}

/** Soma somente linhas pendentes cuja data pertence à âncora confirmada. */
export function getPendingDeltaAtReference(
  linhas: ReadonlyArray<SaldoExtratoLinha>,
  referenceDate: string,
): number {
  return getConsolidatedBankDelta(
    linhas.filter(linha => !linha.jaConciliada && !linha.ignorada && linha.data <= referenceDate),
  );
}

/**
 * Reconstrói o saldo bancário numa data anterior à âncora. Linhas posteriores à
 * própria âncora não podem contaminar o cálculo (caso real: fechamento 31/08 com
 * um Pix de 01/09 no mesmo arquivo).
 */
export function getBankBalanceAtDate(
  saldoExtrato: SaldoExtratoRef,
  linhas: ReadonlyArray<SaldoExtratoLinha>,
  date: string,
): number {
  return saldoExtrato.valor - getConsolidatedBankDelta(
    linhas.filter(linha => linha.data > date && linha.data <= saldoExtrato.data),
  );
}

/**
 * Saldo inicial que faz a conta bater com o extrato, para conta que ainda não
 * tem lançamento antes do período importado.
 *
 * Sem lançamento anterior, o saldo do sistema na véspera do período é o próprio
 * `saldo_inicial` — nenhum cálculo de saldo lê `data_saldo_inicial`. Então o
 * saldo inicial correto é o saldo do banco na véspera: o saldo informado menos
 * o que o extrato movimentou até a data dele. O erro típico é cadastrar a conta
 * com o saldo de hoje e depois conciliar um extrato de dias anteriores.
 */
export function sugerirSaldoInicial({ informado, deltaAteData }: {
  informado: number;
  deltaAteData: number;
}): number {
  return (Math.round(informado * 100) - Math.round(deltaAteData * 100)) / 100;
}

/** Dia seguinte em ISO `yyyy-MM-dd`, por componentes locais (nunca `new Date(iso)`, que é UTC). */
export function diaSeguinte(iso: string): string {
  const [y, m, d] = iso.split('-').map(Number);
  const dt = new Date(y, m - 1, d + 1);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
}

const saldoExtratoKey = (contaId: string) => `conciliacao_saldo_extrato_${contaId}`;

export function saveSaldoExtrato(contaId: string, saldo: SaldoExtratoRef) {
  try {
    sessionStorage.setItem(saldoExtratoKey(contaId), JSON.stringify(saldo));
  } catch (_) {
    // sessionStorage indisponível (modo privado/quota): mantém somente o estado React.
  }
}

export function loadSaldoExtrato(contaId: string): SaldoExtratoRef | null {
  try {
    const raw = sessionStorage.getItem(saldoExtratoKey(contaId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaldoExtratoRef>;
    return typeof parsed.valor === 'number' && typeof parsed.data === 'string'
      ? { valor: parsed.valor, data: parsed.data }
      : null;
  } catch (_) {
    return null;
  }
}

export function clearSaldoExtrato(contaId: string) {
  try {
    sessionStorage.removeItem(saldoExtratoKey(contaId));
  } catch (_) {
    // sessionStorage indisponível.
  }
}

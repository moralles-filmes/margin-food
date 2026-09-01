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

/** Saldo final confirmado no upload do extrato, separado do saldo do razão. */
export interface SaldoExtratoRef {
  valor: number;
  data: string;
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

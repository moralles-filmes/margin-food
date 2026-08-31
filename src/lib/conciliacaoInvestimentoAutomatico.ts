import { normalizeSearchText } from '@/lib/utils';

interface AutomaticInvestmentLine {
  descricao?: string | null;
  tipo: string;
}

interface AutomaticInvestmentLineState extends AutomaticInvestmentLine {
  jaConciliada?: boolean;
  ignorada?: boolean;
  matchId?: string;
  transferReconhecida?: boolean;
  movimentacaoInterna?: boolean;
}

/**
 * Santander ContaMax aparece no OFX como aplicação/resgate, mas o saldo exibido
 * ao cliente já consolida conta corrente + investimento automático. Portanto,
 * essas linhas são evidência de movimentação interna com efeito financeiro zero.
 */
export function isAutomaticInvestmentLine(line: AutomaticInvestmentLine): boolean {
  const description = normalizeSearchText(line.descricao || '').replace(/\s+/g, ' ');
  return (
    line.tipo === 'DESPESA' && /aplicacao.*contamax/.test(description)
  ) || (
    line.tipo === 'RECEITA' && /resgate.*contamax/.test(description)
  );
}

/** Linha ContaMax que ainda precisa ser persistida como movimentação interna. */
export function isPendingAutomaticInvestmentLine(
  line: AutomaticInvestmentLineState,
): boolean {
  return !line.jaConciliada
    && !line.ignorada
    && !line.matchId
    && !line.transferReconhecida
    && !line.movimentacaoInterna
    && isAutomaticInvestmentLine(line);
}

/** Soma somente movimentos externos; aplicação/resgate ContaMax vale zero. */
export function getConsolidatedBankDelta(
  lines: ReadonlyArray<AutomaticInvestmentLine & { valor: number }>,
): number {
  return lines.reduce((sum, line) => {
    if (isAutomaticInvestmentLine(line)) return sum;
    return sum + (line.tipo === 'RECEITA' ? line.valor : -line.valor);
  }, 0);
}

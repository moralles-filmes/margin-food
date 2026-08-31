import { normalizeSearchText } from '@/lib/utils';

export type AutomaticInvestmentDirection = 'to_investment' | 'from_investment';

interface AutomaticInvestmentLine {
  descricao?: string | null;
  tipo: string;
}

interface AccountOption {
  id: string;
  nome: string;
}

/**
 * Santander ContaMax aparece no OFX da conta corrente como aplicação/resgate,
 * mas economicamente é uma transferência para/de uma conta de investimento.
 * Ignorar essas linhas remove a contrapartida que fecha o saldo bancário diário.
 */
export function getAutomaticInvestmentDirection(
  line: AutomaticInvestmentLine,
): AutomaticInvestmentDirection | null {
  const description = normalizeSearchText(line.descricao || '');
  if (line.tipo === 'DESPESA' && description.includes('aplicacao contamax')) {
    return 'to_investment';
  }
  if (line.tipo === 'RECEITA' && description.includes('resgate contamax')) {
    return 'from_investment';
  }
  return null;
}

export function isAutomaticInvestmentLine(line: AutomaticInvestmentLine): boolean {
  return getAutomaticInvestmentDirection(line) !== null;
}

/** Sugere somente uma conta inequívoca; em caso de ambiguidade a UI exige escolha. */
export function findSuggestedInvestmentAccountId(
  accounts: AccountOption[],
  currentAccountId: string,
): string | undefined {
  const candidates = accounts.filter(account => {
    if (account.id === currentAccountId) return false;
    const name = normalizeSearchText(account.nome);
    return name === 'conta aplicacao' || name.includes('contamax');
  });
  return candidates.length === 1 ? candidates[0].id : undefined;
}

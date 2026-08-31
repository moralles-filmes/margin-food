import { describe, expect, it } from 'vitest';
import {
  findSuggestedInvestmentAccountId,
  getAutomaticInvestmentDirection,
  isAutomaticInvestmentLine,
} from './conciliacaoInvestimentoAutomatico';

describe('ContaMax automatic investment recognition', () => {
  it('recognizes applications and rescues with their transfer direction', () => {
    expect(getAutomaticInvestmentDirection({
      tipo: 'DESPESA',
      descricao: 'APLICACAO CONTAMAX',
    })).toBe('to_investment');
    expect(getAutomaticInvestmentDirection({
      tipo: 'RECEITA',
      descricao: 'RESGATE CONTAMAX AUTOMATICO',
    })).toBe('from_investment');
  });

  it('does not treat ContaMax yield as a transfer', () => {
    expect(isAutomaticInvestmentLine({
      tipo: 'RECEITA',
      descricao: 'RENDIMENTO LIQUIDO DE CONTAMAX',
    })).toBe(false);
  });

  it('suggests only an unambiguous investment account', () => {
    const accounts = [
      { id: 'bank', nome: 'Santander GM' },
      { id: 'investment', nome: 'CONTA APLICAÇÃO' },
    ];
    expect(findSuggestedInvestmentAccountId(accounts, 'bank')).toBe('investment');
    expect(findSuggestedInvestmentAccountId([
      ...accounts,
      { id: 'other', nome: 'ContaMax Reserva' },
    ], 'bank')).toBeUndefined();
  });
});

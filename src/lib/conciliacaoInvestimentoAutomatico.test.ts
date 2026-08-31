import { describe, expect, it } from 'vitest';
import {
  getConsolidatedBankDelta,
  isAutomaticInvestmentLine,
  isPendingAutomaticInvestmentLine,
} from './conciliacaoInvestimentoAutomatico';

describe('ContaMax automatic investment recognition', () => {
  it('recognizes applications and rescues as internal movements', () => {
    expect(isAutomaticInvestmentLine({
      tipo: 'DESPESA',
      descricao: 'APLICACAO CONTAMAX',
    })).toBe(true);
    expect(isAutomaticInvestmentLine({
      tipo: 'RECEITA',
      descricao: 'RESGATE   AUTOMATICO   CONTAMAX',
    })).toBe(true);
  });

  it('does not neutralize ContaMax yield', () => {
    expect(isAutomaticInvestmentLine({
      tipo: 'RECEITA',
      descricao: 'RENDIMENTO LIQUIDO DE CONTAMAX',
    })).toBe(false);
  });

  it('gives applications and rescues zero effect in the consolidated delta', () => {
    expect(getConsolidatedBankDelta([
      { tipo: 'RECEITA', valor: 500, descricao: 'PIX RECEBIDO' },
      { tipo: 'DESPESA', valor: 200, descricao: 'APLICACAO CONTAMAX' },
      { tipo: 'RECEITA', valor: 100, descricao: 'RESGATE CONTAMAX AUTOMATICO' },
      { tipo: 'RECEITA', valor: 0.34, descricao: 'RENDIMENTO CONTAMAX' },
      { tipo: 'DESPESA', valor: 50, descricao: 'PIX ENVIADO' },
    ])).toBeCloseTo(450.34, 2);
  });

  it('only neutralizes an unresolved ContaMax line', () => {
    const pending = { tipo: 'DESPESA', descricao: 'APLICACAO CONTAMAX' };
    expect(isPendingAutomaticInvestmentLine(pending)).toBe(true);
    expect(isPendingAutomaticInvestmentLine({ ...pending, jaConciliada: true })).toBe(false);
    expect(isPendingAutomaticInvestmentLine({ ...pending, matchId: 'existing' })).toBe(false);
    expect(isPendingAutomaticInvestmentLine({ ...pending, transferReconhecida: true })).toBe(false);
    expect(isPendingAutomaticInvestmentLine({ ...pending, movimentacaoInterna: true })).toBe(false);
  });
});

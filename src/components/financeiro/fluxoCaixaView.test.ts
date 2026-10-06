import { describe, expect, it } from 'vitest';
import { fluxoCaixaPeriodo, fluxoOrigem, isoToBR } from './fluxoCaixaView';

describe('fluxoCaixaPeriodo', () => {
  it('do dia 1 do mês atual ao último dia do mês seguinte', () => {
    expect(fluxoCaixaPeriodo(new Date(2026, 9, 4))).toEqual({ inicio: '2026-10-01', fim: '2026-11-30' });
    expect(fluxoCaixaPeriodo(new Date(2026, 0, 31))).toEqual({ inicio: '2026-01-01', fim: '2026-02-28' });
  });

  it('dezembro vira o ano', () => {
    expect(fluxoCaixaPeriodo(new Date(2026, 11, 15))).toEqual({ inicio: '2026-12-01', fim: '2027-01-31' });
  });
});

describe('isoToBR / fluxoOrigem', () => {
  it('formata sem fuso e escolhe o chip da origem', () => {
    expect(isoToBR('2026-02-01')).toBe('01/02/2026');
    expect(fluxoOrigem('conta_pagar_vencida').text).toBe('Pagar (Vencida)');
    expect(fluxoOrigem('desconhecida').text).toBe('Manual');
    expect(fluxoOrigem('conciliacao').className).not.toMatch(/\/\d/);
  });
});

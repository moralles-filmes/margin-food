import { describe, expect, it } from 'vitest';
import {
  getRecurrenceLimit,
  getRecurrenceValidationMessage,
  mensagemEdicaoSerie,
  mensagemErroEdicaoSerie,
  RECURRENCE_LIMITS,
  temParcelasSeguintes,
} from './recurrence';

describe('limites de recorrência financeira', () => {
  it('define os limites por frequência', () => {
    expect(RECURRENCE_LIMITS).toEqual({ mensal: 36, semanal: 144, quinzenal: 72 });
    expect(getRecurrenceLimit('invalida')).toBe(0);
  });

  it.each([
    ['mensal', 36],
    ['semanal', 144],
    ['quinzenal', 72],
  ])('aceita o limite de %s', (frequency, count) => {
    expect(getRecurrenceValidationMessage(frequency, count)).toBeNull();
  });

  it.each([
    ['mensal', 37, '36'],
    ['semanal', 145, '144'],
    ['quinzenal', 73, '72'],
  ])('recusa quantidade acima do limite de %s', (frequency, count, limit) => {
    expect(getRecurrenceValidationMessage(frequency, count)).toContain(limit);
  });

  it('não permite recorrência infinita nem quantidade fracionária', () => {
    expect(getRecurrenceValidationMessage('mensal', 0)).toContain('pelo menos 2');
    expect(getRecurrenceValidationMessage('mensal', 2.5)).toContain('inteira');
  });
});

describe('edição em série', () => {
  it.each([
    [{ parcela_atual: 1, parcela_total: 36 }, true],
    [{ parcela_atual: 14, parcela_total: 36 }, true],
    [{ parcela_atual: 36, parcela_total: 36 }, false],
    [{ parcela_atual: null, parcela_total: null }, false],
    [{ parcela_atual: 1, parcela_total: 1 }, false],
    [{}, false],
    [null, false],
  ])('temParcelasSeguintes(%j) = %s', (titulo, esperado) => {
    expect(temParcelasSeguintes(titulo)).toBe(esperado);
  });

  it('resume as parcelas alteradas e as quitadas que ficaram de fora', () => {
    expect(mensagemEdicaoSerie({ parcelas_atualizadas: 22, parcelas_ignoradas: 0 }, 'paga'))
      .toBe('Conta atualizada, junto com 22 parcelas seguintes.');
    expect(mensagemEdicaoSerie({ parcelas_atualizadas: 1, parcelas_ignoradas: 1 }, 'paga'))
      .toBe('Conta atualizada, junto com 1 parcela seguinte. 1 parcela já paga ou cancelada ficou como estava.');
    expect(mensagemEdicaoSerie({ parcelas_atualizadas: 0, parcelas_ignoradas: 2 }, 'recebida'))
      .toBe('Conta atualizada. 2 parcelas já recebidas ou canceladas ficaram como estavam.');
    expect(mensagemEdicaoSerie({ parcelas_atualizadas: 0, parcelas_ignoradas: 0 }, 'paga'))
      .toContain('Nada mudou');
  });

  it('traduz os erros próprios da série e deixa os demais para quem chamou', () => {
    expect(mensagemErroEdicaoSerie({ code: 'PGRST202', message: 'Could not find the function' })).toContain('ainda não está disponível');
    expect(mensagemErroEdicaoSerie({ code: '40P01', message: 'deadlock detected' })).toContain('Nada foi salvo');
    expect(mensagemErroEdicaoSerie({ message: 'SERIE_INVALIDA: a conta não tem parcelas seguintes' })).toContain('não tem parcelas seguintes');
    expect(mensagemErroEdicaoSerie({ message: 'SERIE_AMBIGUA: há parcelas repetidas' })).toContain('uma parcela de cada vez');
    expect(mensagemErroEdicaoSerie({ message: 'O registro foi alterado por outro usuário.' })).toBeNull();
  });
});

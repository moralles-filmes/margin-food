import { describe, expect, it } from 'vitest';
import {
  getRecurrenceLimit,
  getRecurrenceValidationMessage,
  RECURRENCE_LIMITS,
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

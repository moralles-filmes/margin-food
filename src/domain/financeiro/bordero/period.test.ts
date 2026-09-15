import { describe, expect, it } from 'vitest';
import {
  createInitialBorderoFilter,
  formatBorderoMonth,
  formatBorderoPeriod,
  localDateToISO,
  resolveBorderoPeriod,
  shiftBorderoFilter,
  shiftWeek,
  weekBounds,
  type BorderoFilterState,
} from './period';

const base: BorderoFilterState = {
  mode: 'week',
  weekAnchor: '2026-09-02',
  month: '2026-09',
  customStart: '2026-09-10',
  customEnd: '2026-09-25',
};

describe('Borderô — semana de segunda a domingo', () => {
  it('resolve 31/08 a 06/09 a partir de qualquer dia da semana', () => {
    for (const day of ['2026-08-31', '2026-09-02', '2026-09-06']) {
      expect(weekBounds(day)).toEqual({ start: '2026-08-31', end: '2026-09-06' });
    }
    expect(weekBounds('2026-09-07')).toEqual({ start: '2026-09-07', end: '2026-09-13' });
  });

  it('atravessa virada de ano e navega semana anterior/próxima', () => {
    expect(weekBounds('2026-12-31')).toEqual({ start: '2026-12-28', end: '2027-01-03' });
    expect(shiftWeek('2026-09-02', -1)).toBe('2026-08-24');
    expect(shiftWeek('2026-09-02', 1)).toBe('2026-09-07');
    expect(resolveBorderoPeriod(shiftBorderoFilter(base, 1))).toEqual({
      ok: true, period: { start: '2026-09-07', end: '2026-09-13' },
    });
  });

  it('semana atual parte de hoje (BR) e o calendário não sofre deslocamento de fuso', () => {
    const initial = createInitialBorderoFilter('2026-09-15');
    expect(initial.mode).toBe('week');
    expect(resolveBorderoPeriod(initial)).toEqual({ ok: true, period: { start: '2026-09-14', end: '2026-09-20' } });
    expect(localDateToISO(new Date(2026, 8, 5))).toBe('2026-09-05');
  });
});

describe('Borderô — mês e período personalizado', () => {
  it('mês cobre do dia 1 ao último dia, inclusive fevereiro bissexto', () => {
    expect(resolveBorderoPeriod({ ...base, mode: 'month' })).toEqual({
      ok: true, period: { start: '2026-09-01', end: '2026-09-30' },
    });
    expect(resolveBorderoPeriod({ ...base, mode: 'month', month: '2028-02' })).toEqual({
      ok: true, period: { start: '2028-02-01', end: '2028-02-29' },
    });
    expect(shiftBorderoFilter({ ...base, mode: 'month', month: '2026-12' }, 1).month).toBe('2027-01');
  });

  it('período personalizado mantém as duas datas inclusivas', () => {
    expect(resolveBorderoPeriod({ ...base, mode: 'custom' })).toEqual({
      ok: true, period: { start: '2026-09-10', end: '2026-09-25' },
    });
    expect(resolveBorderoPeriod({ ...base, mode: 'custom', customStart: '2026-09-06', customEnd: '2026-09-06' })).toEqual({
      ok: true, period: { start: '2026-09-06', end: '2026-09-06' },
    });
  });

  it('recusa período vazio, invertido, inválido ou maior que um ano (mesmo limite do backend)', () => {
    expect(resolveBorderoPeriod({ ...base, mode: 'custom', customEnd: '' }).ok).toBe(false);
    expect(resolveBorderoPeriod({ ...base, mode: 'custom', customStart: '2026-09-25', customEnd: '2026-09-10' }).ok).toBe(false);
    expect(resolveBorderoPeriod({ ...base, mode: 'custom', customStart: '2026-02-30' }).ok).toBe(false);
    // p_fim - p_inicio > 366 é recusado no SQL: 366 dias passa, 367 não.
    expect(resolveBorderoPeriod({ ...base, mode: 'custom', customStart: '2025-01-01', customEnd: '2026-01-03' }).ok).toBe(false);
    expect(resolveBorderoPeriod({ ...base, mode: 'custom', customStart: '2025-01-01', customEnd: '2026-01-02' }).ok).toBe(true);
  });

  it('formata período e mês no padrão brasileiro', () => {
    expect(formatBorderoPeriod({ start: '2026-08-31', end: '2026-09-06' })).toBe('31/08/2026 a 06/09/2026');
    expect(formatBorderoMonth('2026-09')).toBe('Setembro/2026');
  });
});

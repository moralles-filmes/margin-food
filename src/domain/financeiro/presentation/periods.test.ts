import { describe, expect, it } from 'vitest';
import type { AvailablePeriodBounds, PresentationPeriodFilter } from './contracts';
import {
  buildPresentationComparisons,
  formatMonthPeriodPtBR,
  formatPresentationPeriodLabelPtBR,
  normalizePresentationPeriod,
} from './periods';

const availableBounds: AvailablePeriodBounds = {
  minDate: '2023-01-01',
  maxDate: '2026-08-25',
};

describe('normalização de filtros com fim exclusivo', () => {
  it.each<[string, PresentationPeriodFilter, AvailablePeriodBounds | undefined, string, string]>([
    ['mês', { kind: 'month', month: '2026-02' }, undefined, '2026-02-01', '2026-03-01'],
    ['intervalo de meses', { kind: 'month-range', startMonth: '2025-11', endMonth: '2026-02' }, undefined, '2025-11-01', '2026-03-01'],
    ['ano', { kind: 'year', year: 2026 }, undefined, '2026-01-01', '2027-01-01'],
    ['acumulado do ano', { kind: 'year-to-date', year: 2026, through: '2026-08-25' }, undefined, '2026-01-01', '2026-08-26'],
    ['todo o período', { kind: 'all-time' }, availableBounds, '2023-01-01', '2026-08-26'],
    ['personalizado', { kind: 'custom', start: '2026-03-10', endInclusive: '2026-04-05' }, undefined, '2026-03-10', '2026-04-06'],
  ])('normaliza o filtro %s', (_name, filter, bounds, start, endExclusive) => {
    const period = normalizePresentationPeriod(filter, { availableBounds: bounds });

    expect(period).toMatchObject({ start, endExclusive, filterKind: filter.kind });
  });

  it('exige limites disponíveis para todo o período', () => {
    expect(() => normalizePresentationPeriod({ kind: 'all-time' })).toThrow('requires available period bounds');
  });

  it('recusa intervalos invertidos e datas inválidas', () => {
    expect(() => normalizePresentationPeriod({
      kind: 'month-range',
      startMonth: '2026-04',
      endMonth: '2026-03',
    })).toThrow();
    expect(() => normalizePresentationPeriod({
      kind: 'custom',
      start: '2026-02-30',
      endInclusive: '2026-03-01',
    })).toThrow();
  });

  it('atravessa corretamente a virada de mês e de ano', () => {
    expect(normalizePresentationPeriod({ kind: 'month', month: '2026-12' })).toMatchObject({
      start: '2026-12-01',
      endExclusive: '2027-01-01',
    });
    expect(normalizePresentationPeriod({
      kind: 'custom',
      start: '2026-12-31',
      endInclusive: '2027-01-01',
    })).toMatchObject({
      start: '2026-12-31',
      endExclusive: '2027-01-02',
    });
  });
});

describe('comparações de período', () => {
  it('usa o mês anterior e o mesmo mês do ano anterior no filtro mensal', () => {
    const filter = { kind: 'month', month: '2026-01' } as const;
    const current = normalizePresentationPeriod(filter);
    const comparisons = buildPresentationComparisons(filter, current);

    expect(comparisons.previousPeriod.range).toEqual({ start: '2025-12-01', endExclusive: '2026-01-01' });
    expect(comparisons.previousYear.range).toEqual({ start: '2025-01-01', endExclusive: '2025-02-01' });
  });

  it('usa o intervalo de meses imediatamente anterior com a mesma quantidade de meses', () => {
    const filter = { kind: 'month-range', startMonth: '2026-01', endMonth: '2026-03' } as const;
    const current = normalizePresentationPeriod(filter);
    const comparisons = buildPresentationComparisons(filter, current);

    expect(comparisons.previousPeriod).toMatchObject({
      alignment: 'equivalent-month-range',
      range: { start: '2025-10-01', endExclusive: '2026-01-01' },
    });
    expect(comparisons.previousYear.range).toEqual({ start: '2025-01-01', endExclusive: '2025-04-01' });
  });

  it('usa duração equivalente no intervalo personalizado inclusive na virada do ano', () => {
    const filter = { kind: 'custom', start: '2026-01-01', endInclusive: '2026-01-10' } as const;
    const current = normalizePresentationPeriod(filter);
    const comparisons = buildPresentationComparisons(filter, current);

    expect(comparisons.previousPeriod.range).toEqual({ start: '2025-12-22', endExclusive: '2026-01-01' });
  });

  it('alinha comparação anual incompleta pelo mesmo corte do calendário', () => {
    const filter = { kind: 'year-to-date', year: 2024, through: '2024-02-29' } as const;
    const current = normalizePresentationPeriod(filter);
    const comparisons = buildPresentationComparisons(filter, current);

    expect(current).toMatchObject({ start: '2024-01-01', endExclusive: '2024-03-01' });
    expect(comparisons.previousPeriod).toMatchObject({
      alignment: 'aligned-calendar-year',
      range: { start: '2023-01-01', endExclusive: '2023-03-01' },
    });
    expect(comparisons.previousYear.range).toEqual({ start: '2023-01-01', endExclusive: '2023-03-01' });
  });

  it('marca comparação fora dos limites como indisponível', () => {
    const filter = { kind: 'all-time' } as const;
    const current = normalizePresentationPeriod(filter, { availableBounds });
    const comparisons = buildPresentationComparisons(filter, current, availableBounds);

    expect(comparisons.previousPeriod.availability).toEqual({
      state: 'unavailable',
      reason: 'outside-available-period',
    });
  });
});

describe('rótulos pt-BR', () => {
  it('formata o nome do mês sem recuo de fuso', () => {
    expect(formatMonthPeriodPtBR('2026-03')).toBe('Março de 2026');
  });

  it.each<[PresentationPeriodFilter, string]>([
    [{ kind: 'month', month: '2026-03' }, 'Março de 2026'],
    [{ kind: 'month-range', startMonth: '2026-01', endMonth: '2026-03' }, 'Janeiro a março de 2026'],
    [{ kind: 'month-range', startMonth: '2025-11', endMonth: '2026-02' }, 'Novembro de 2025 a fevereiro de 2026'],
    [{ kind: 'year', year: 2026 }, 'Ano de 2026'],
    [{ kind: 'year-to-date', year: 2026, through: '2026-08-25' }, 'Acumulado do ano até 25/08/2026'],
    [{ kind: 'custom', start: '2026-03-10', endInclusive: '2026-04-05' }, '10/03/2026 a 05/04/2026'],
  ])('formata o período %# em português', (filter, expected) => {
    const period = normalizePresentationPeriod(filter);
    expect(formatPresentationPeriodLabelPtBR(filter, period)).toBe(expected);
  });

  it('inclui os limites reais no rótulo de todo o período', () => {
    const filter = { kind: 'all-time' } as const;
    const period = normalizePresentationPeriod(filter, { availableBounds });

    expect(formatPresentationPeriodLabelPtBR(filter, period)).toBe(
      'Todo o período — 01/01/2023 a 25/08/2026',
    );
  });
});

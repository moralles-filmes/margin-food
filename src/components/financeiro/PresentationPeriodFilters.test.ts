import { describe, expect, it } from 'vitest';
import {
  createPresentationFilterDraft,
  presentationFilterFromDraft,
  type PresentationFilterDraft,
} from '@/lib/presentationFilters';

const bounds = { minDate: '2023-01-01', maxDate: '2026-08-25' };
const base = createPresentationFilterDraft('2026-08-25');

describe('filtros da interface da Apresentação Sócios', () => {
  it.each<[string, Partial<PresentationFilterDraft>, object]>([
    ['mês', { kind: 'month', month: '2026-03' }, { kind: 'month', month: '2026-03' }],
    ['intervalo de meses', { kind: 'month-range', startMonth: '2026-01', endMonth: '2026-03' }, { kind: 'month-range', startMonth: '2026-01', endMonth: '2026-03' }],
    ['ano', { kind: 'year', year: '2026' }, { kind: 'year', year: 2026 }],
    ['acumulado do ano', { kind: 'year-to-date', year: '2026', through: '2026-08-25' }, { kind: 'year-to-date', year: 2026, through: '2026-08-25' }],
    ['todo o período', { kind: 'all-time' }, { kind: 'all-time' }],
    ['personalizado', { kind: 'custom', customStart: '2026-03-10', customEnd: '2026-04-05' }, { kind: 'custom', start: '2026-03-10', endInclusive: '2026-04-05' }],
  ])('produz o contrato da Fase 1 para %s', (_label, override, expected) => {
    expect(presentationFilterFromDraft({ ...base, ...override }, bounds)).toEqual(expected);
  });

  it('valida intervalo invertido e exige availableBounds para todo o período', () => {
    expect(() => presentationFilterFromDraft({
      ...base,
      kind: 'month-range',
      startMonth: '2026-04',
      endMonth: '2026-03',
    }, bounds)).toThrow();
    expect(() => presentationFilterFromDraft({ ...base, kind: 'all-time' })).toThrow();
  });
});

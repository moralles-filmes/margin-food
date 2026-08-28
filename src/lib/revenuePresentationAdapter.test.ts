import { describe, expect, it } from 'vitest';
import { createPresentationRevenueData } from '@/test/fixtures/presentationRevenue';
import {
  PresentationRevenuePayloadError,
  adaptPresentationRevenuePayload,
  createSafeRevenuePayloadDiagnostic,
} from '@/lib/revenuePresentationAdapter';

describe('contrato defensivo de Faturamento da Apresentação Sócios', () => {
  it('aceita o contrato versionado e preserva zero real distinto de ausência', () => {
    const parsed = adaptPresentationRevenuePayload(createPresentationRevenueData());
    expect(parsed.source).toEqual({
      relation: 'public.financeiro_fechamento_caixa',
      valueField: 'faturamento_bruto',
      dateField: 'data',
      label: 'Faturamento bruto — Fechamento de Caixa',
    });
    expect(parsed.weekdays[0]).toMatchObject({ state: 'available', total: 0, occurrences: 1 });
    expect(parsed.weekdays[2]).toMatchObject({ state: 'empty', total: 0, occurrences: 0 });
    expect(parsed.weekdays[0].average).toEqual({ state: 'available', value: 0 });
    expect(parsed.weekdays[2].average).toEqual({ state: 'unavailable', reason: 'no-occurrences' });
    expect(JSON.stringify(parsed)).not.toMatch(/Infinity|NaN/);
  });

  it('recusa ordem de dias, média recalculada e histórico fora de ordem', () => {
    const weekdayOrder = structuredClone(createPresentationRevenueData());
    const reversedWeekdays = [weekdayOrder.weekdays[1], weekdayOrder.weekdays[0], ...weekdayOrder.weekdays.slice(2)];
    expect(() => adaptPresentationRevenuePayload({ ...weekdayOrder, weekdays: reversedWeekdays }))
      .toThrow(PresentationRevenuePayloadError);

    const average = structuredClone(createPresentationRevenueData());
    average.weekdays[1].average = { state: 'available', value: 999 };
    expect(() => adaptPresentationRevenuePayload(average)).toThrow(/total dividido pelas ocorrências/);

    const history = structuredClone(createPresentationRevenueData());
    const reversedHistory = [history.history[1], history.history[0], ...history.history.slice(2)];
    expect(() => adaptPresentationRevenuePayload({ ...history, history: reversedHistory }))
      .toThrow(/ordenado por ano e mês/);
  });

  it('recusa números não finitos e diagnostica apenas a forma do payload', () => {
    const payload = structuredClone(createPresentationRevenueData());
    payload.current.total = Number.NaN;
    let caught: PresentationRevenuePayloadError | undefined;
    try {
      adaptPresentationRevenuePayload(payload);
    } catch (error) {
      caught = error as PresentationRevenuePayloadError;
    }
    expect(caught).toBeInstanceOf(PresentationRevenuePayloadError);
    expect(createSafeRevenuePayloadDiagnostic(payload, caught!)).toEqual({
      error: { name: 'PresentationRevenuePayloadError', path: 'payload.current.total' },
      payload: {
        type: 'object',
        contractVersionType: 'string',
        weekdayCount: 7,
        historyCount: 36,
      },
    });
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildCategoryRanking,
  buildProvisionedComposition,
  formatDashboardDatesLabel,
  formatDashboardRangeLabel,
  historyWindow,
  isDashboardRangeInProgress,
  kpiGridClassFor,
  previousDashboardRange,
} from './dashboardFinanceiroView';

describe('formatDashboardRangeLabel', () => {
  it('um dia', () => {
    expect(formatDashboardRangeLabel({ start: '2026-03-09', endExclusive: '2026-03-10' })).toBe('09/03/2026');
  });

  it('mês inteiro, inclusive dezembro → janeiro', () => {
    expect(formatDashboardRangeLabel({ start: '2026-06-01', endExclusive: '2026-07-01' })).toBe('Junho de 2026');
    expect(formatDashboardRangeLabel({ start: '2025-12-01', endExclusive: '2026-01-01' })).toBe('Dezembro de 2025');
  });

  it('intervalo livre mostra o fim inclusivo', () => {
    expect(formatDashboardRangeLabel({ start: '2026-06-01', endExclusive: '2026-06-16' })).toBe('01/06/2026 a 15/06/2026');
    // Dois meses inteiros não são "um mês".
    expect(formatDashboardRangeLabel({ start: '2026-05-01', endExclusive: '2026-07-01' })).toBe('01/05/2026 a 30/06/2026');
  });
});

describe('isDashboardRangeInProgress', () => {
  const range = { start: '2026-06-01', endExclusive: '2026-07-01' };
  it('hoje dentro do período', () => {
    expect(isDashboardRangeInProgress(range, '2026-06-01')).toBe(true);
    expect(isDashboardRangeInProgress(range, '2026-06-30')).toBe(true);
  });
  it('período já encerrado ou futuro', () => {
    expect(isDashboardRangeInProgress(range, '2026-07-01')).toBe(false);
    expect(isDashboardRangeInProgress(range, '2026-05-31')).toBe(false);
  });
});

describe('previousDashboardRange / formatDashboardDatesLabel', () => {
  it('mesma duração imediatamente antes, como a RPC (não é o mês civil anterior)', () => {
    const marco = previousDashboardRange({ start: '2026-03-01', endExclusive: '2026-04-01' });
    expect(marco).toEqual({ start: '2026-01-29', endExclusive: '2026-03-01' });
    expect(formatDashboardDatesLabel(marco)).toBe('29/01/2026 a 28/02/2026');
    expect(formatDashboardDatesLabel(previousDashboardRange({ start: '2026-10-01', endExclusive: '2026-11-01' }))).toBe('31/08/2026 a 30/09/2026');
  });

  it('um dia compara com o dia anterior', () => {
    const r = previousDashboardRange({ start: '2026-10-04', endExclusive: '2026-10-05' });
    expect(formatDashboardDatesLabel(r)).toBe('03/10/2026');
  });
});

describe('buildCategoryRanking', () => {
  it('percentual sobre a soma do Top N, não sobre a despesa total', () => {
    // Despesa realizada do período seria maior (há categorias fora do Top N); o ranking não sabe dela.
    const ranking = buildCategoryRanking([
      { nome: 'Insumos', valor: 600 },
      { nome: 'Pessoal', valor: 300 },
      { nome: 'Energia', valor: 100 },
    ]);
    expect(ranking.total).toBe(1000);
    expect(ranking.rows.map(r => r.share)).toEqual([60, 30, 10]);
    expect(ranking.rows.map(r => r.barPercent)).toEqual([100, 50, (100 / 600) * 100]);
    expect(ranking.rows.map(r => r.nome)).toEqual(['Insumos', 'Pessoal', 'Energia']);
  });

  it('lista vazia e soma zero não dividem por zero', () => {
    expect(buildCategoryRanking([])).toEqual({ total: 0, rows: [] });
    const zero = buildCategoryRanking([{ nome: 'A', valor: 0 }]);
    expect(zero.rows[0]).toMatchObject({ share: null, barPercent: 0 });
  });

  it('valor negativo não vira barra negativa', () => {
    const ranking = buildCategoryRanking([{ nome: 'A', valor: 50 }, { nome: 'Estorno', valor: -10 }]);
    expect(ranking.rows[1].barPercent).toBe(0);
    expect(ranking.total).toBe(40);
  });
});

describe('buildProvisionedComposition', () => {
  it('soma realizada + a pagar, sem terceira parcela', () => {
    const c = buildProvisionedComposition(250.5, 749.5);
    expect(c.total).toBe(1000);
    expect(c.realizadaPercent).toBeCloseTo(25.05);
    expect(c.aPagarPercent).toBeCloseTo(74.95);
  });

  it('total zero ou parcela negativa não desenha proporção', () => {
    expect(buildProvisionedComposition(0, 0)).toEqual({ total: 0, realizadaPercent: null, aPagarPercent: null });
    expect(buildProvisionedComposition(-5, 20)).toMatchObject({ total: 15, realizadaPercent: null, aPagarPercent: null });
  });
});

describe('kpiGridClassFor', () => {
  it('valor mais longo exige grupo mais largo para 2 e 4 colunas', () => {
    expect(kpiGridClassFor(6)).toContain('[@container(min-width:55rem)]:grid-cols-4');
    expect(kpiGridClassFor(12)).toContain('[@container(min-width:27rem)]:grid-cols-2');
    expect(kpiGridClassFor(15)).toContain('[@container(min-width:66rem)]:grid-cols-4');
    expect(kpiGridClassFor(17)).toContain('[@container(min-width:72rem)]:grid-cols-4');
  });

  it('valor fora da tabela nunca vai a quatro colunas', () => {
    const cls = kpiGridClassFor(19);
    expect(cls).not.toContain('grid-cols-4');
    expect(cls).toContain('grid-cols-1');
  });
});

describe('historyWindow', () => {
  it('últimos N meses até o mês atual', () => {
    const now = new Date(2026, 9, 3);
    expect(historyWindow(6, now)).toEqual({ startKey: '2026-05', endKey: '2026-10', label: 'mai/26 a out/26' });
    expect(historyWindow(3, now).label).toBe('ago/26 a out/26');
    expect(historyWindow(12, new Date(2026, 0, 15))).toMatchObject({ startKey: '2025-02', endKey: '2026-01' });
  });
});

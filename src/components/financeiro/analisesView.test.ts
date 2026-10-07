import { describe, expect, it } from 'vitest';
import { dataBR, deltaPercentual, deltaPontos, periodoDosKpis, variacaoCategoria } from './analisesView';

describe('analisesView — rótulos das análises (Fase 06A)', () => {
  it('janela dos KPIs: do 1º dia do mês inicial até hoje, como get_fin_kpis(p_meses)', () => {
    expect(periodoDosKpis(6, '2026-10-05')).toEqual({ inicio: '2026-05-01', fim: '2026-10-05', label: '01/05/2026 a 05/10/2026' });
    expect(periodoDosKpis(3, '2026-02-10').inicio).toBe('2025-12-01');
    expect(periodoDosKpis(12, '2026-01-31').inicio).toBe('2025-02-01');
    expect(dataBR('2026-03-09')).toBe('09/03/2026');
  });

  it('variação percentual: sem base quando o mês B é zero, nunca "0,00%"', () => {
    expect(deltaPercentual(0, false, 'vs B')).toMatchObject({ formatted: 'Sem base', direction: 'none', tone: 'neutral' });
    expect(deltaPercentual(0, true, 'vs B')).toMatchObject({ formatted: '0,00%', direction: 'flat' });
    expect(deltaPercentual(12.346, true, 'vs B')).toMatchObject({ formatted: '+12,35%', direction: 'up', tone: 'positive' });
    expect(deltaPercentual(-6.22, true, 'vs B')).toMatchObject({ formatted: '-6,22%', direction: 'down', tone: 'negative' });
    // Despesa (inverso): cair é bom, como a cor de antes.
    expect(deltaPercentual(-2.44, true, 'vs B', true)).toMatchObject({ formatted: '-2,44%', tone: 'positive' });
    expect(deltaPercentual(5, true, 'vs B', true)).toMatchObject({ tone: 'negative' });
  });

  it('margem varia em pontos percentuais', () => {
    expect(deltaPontos(-3.4, 'vs B')).toMatchObject({ formatted: '-3,4 p.p.', direction: 'down', tone: 'negative' });
    expect(deltaPontos(1.25, 'vs B').formatted).toBe('+1,3 p.p.');
    expect(deltaPontos(0, 'vs B')).toMatchObject({ formatted: '0,0 p.p.', direction: 'flat' });
  });

  it('variação por categoria: base zero vira "Sem base"; subir despesa é negativo', () => {
    expect(variacaoCategoria(0, 0)).toEqual({ texto: 'Sem base', tom: 'neutral' });
    expect(variacaoCategoria(0, 30000)).toEqual({ texto: '0,00%', tom: 'neutral' });
    expect(variacaoCategoria(14.2, 40000)).toEqual({ texto: '+14,20%', tom: 'negative' });
    expect(variacaoCategoria(-100, 2500)).toEqual({ texto: '-100,00%', tom: 'positive' });
  });
});

import { describe, expect, it } from 'vitest';
import {
  deslocarFiltro, diasNoIntervalo, filtroPadrao, gerarBuckets, granularidadeDe, intervaloAnterior,
  mesDe, quinzenaDe, resolverJanelas, semanaDe, trocarModo, validarFiltro, type CmvFiltro,
} from './period';

describe('CMV Financeiro — períodos', () => {
  it('abre na semana corrente, de segunda a domingo', () => {
    expect(filtroPadrao('2026-09-09')).toEqual({ modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' });
    expect(semanaDe('2026-09-13')).toEqual({ inicio: '2026-09-07', fim: '2026-09-13' });
    expect(semanaDe('2026-09-14')).toEqual({ inicio: '2026-09-14', fim: '2026-09-20' });
  });

  it('semana atravessa a virada de mês e de ano', () => {
    expect(semanaDe('2026-10-01')).toEqual({ inicio: '2026-09-28', fim: '2026-10-04' });
    expect(semanaDe('2027-01-01')).toEqual({ inicio: '2026-12-28', fim: '2027-01-03' });
  });

  it('quinzena é de calendário: 1–15 e 16–último dia, com as durações reais', () => {
    expect(quinzenaDe('2026-09-15')).toEqual({ inicio: '2026-09-01', fim: '2026-09-15' });
    expect(quinzenaDe('2026-09-16')).toEqual({ inicio: '2026-09-16', fim: '2026-09-30' });
    expect(diasNoIntervalo(quinzenaDe('2026-10-20'))).toBe(16);
    expect(diasNoIntervalo(quinzenaDe('2027-02-20'))).toBe(13);
    expect(diasNoIntervalo(quinzenaDe('2028-02-20'))).toBe(14);
  });

  it('mês respeita fevereiro e ano bissexto', () => {
    expect(mesDe('2027-02-10')).toEqual({ inicio: '2027-02-01', fim: '2027-02-28' });
    expect(mesDe('2028-02-10')).toEqual({ inicio: '2028-02-01', fim: '2028-02-29' });
    expect(mesDe('2026-12-31')).toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
  });

  it('período anterior segue o modo', () => {
    expect(intervaloAnterior({ modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' }))
      .toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
    expect(intervaloAnterior({ modo: 'quinzenal', inicio: '2026-09-01', fim: '2026-09-15' }))
      .toEqual({ inicio: '2026-08-16', fim: '2026-08-31' });
    expect(intervaloAnterior({ modo: 'quinzenal', inicio: '2026-09-16', fim: '2026-09-30' }))
      .toEqual({ inicio: '2026-09-01', fim: '2026-09-15' });
    expect(intervaloAnterior({ modo: 'mensal', inicio: '2026-03-01', fim: '2026-03-31' }))
      .toEqual({ inicio: '2026-02-01', fim: '2026-02-28' });
    expect(intervaloAnterior({ modo: 'mensal', inicio: '2027-01-01', fim: '2027-01-31' }))
      .toEqual({ inicio: '2026-12-01', fim: '2026-12-31' });
    // livre: mesma quantidade de dias, imediatamente antes
    expect(intervaloAnterior({ modo: 'periodo', inicio: '2026-09-10', fim: '2026-09-19' }))
      .toEqual({ inicio: '2026-08-31', fim: '2026-09-09' });
  });

  it('navega para o anterior e o próximo', () => {
    const semana: CmvFiltro = { modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' };
    expect(deslocarFiltro(semana, 1)).toEqual({ modo: 'semanal', inicio: '2026-09-14', fim: '2026-09-20' });
    expect(deslocarFiltro(semana, -1)).toEqual({ modo: 'semanal', inicio: '2026-08-31', fim: '2026-09-06' });
    expect(deslocarFiltro({ modo: 'quinzenal', inicio: '2026-09-16', fim: '2026-09-30' }, 1))
      .toEqual({ modo: 'quinzenal', inicio: '2026-10-01', fim: '2026-10-15' });
    expect(deslocarFiltro({ modo: 'mensal', inicio: '2026-12-01', fim: '2026-12-31' }, 1))
      .toEqual({ modo: 'mensal', inicio: '2027-01-01', fim: '2027-01-31' });
    expect(deslocarFiltro({ modo: 'periodo', inicio: '2026-09-10', fim: '2026-09-12' }, 1))
      .toEqual({ modo: 'periodo', inicio: '2026-09-13', fim: '2026-09-15' });
  });

  it('trocar de modo mantém a referência e não inverte datas em silêncio', () => {
    const semana: CmvFiltro = { modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' };
    expect(trocarModo(semana, 'mensal', '2026-09-09')).toEqual({ modo: 'mensal', inicio: '2026-09-01', fim: '2026-09-30' });
    expect(trocarModo(semana, 'periodo', '2026-09-09')).toEqual({ modo: 'periodo', inicio: '2026-09-07', fim: '2026-09-13' });
    expect(validarFiltro({ inicio: '2026-09-10', fim: '2026-09-01' })).toMatch(/anterior/);
    expect(validarFiltro({ inicio: '', fim: '2026-09-01' })).toMatch(/Informe/);
    expect(validarFiltro({ inicio: '2026-02-30', fim: '2026-03-01' })).toMatch(/inválida/);
    expect(validarFiltro({ inicio: '2025-01-01', fim: '2026-09-01' })).toMatch(/12 meses/);
    expect(validarFiltro({ inicio: '2026-09-01', fim: '2026-09-01' })).toBeNull();
  });

  describe('corte de período em andamento', () => {
    const semana: CmvFiltro = { modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' };

    it('período encerrado compara inteiro com inteiro', () => {
      const j = resolverJanelas(semana, '2026-09-20', false);
      expect(j.parcial).toBe(false);
      expect(j.efetivoAtual).toEqual({ inicio: '2026-09-07', fim: '2026-09-13' });
      expect(j.efetivoAnterior).toEqual({ inicio: '2026-08-31', fim: '2026-09-06' });
    });

    it('sem fechamento de hoje, corta em ontem e limita o anterior ao mesmo trecho', () => {
      const j = resolverJanelas(semana, '2026-09-10', false);
      expect(j).toMatchObject({ parcial: true, corte: '2026-09-09', diasEfetivos: 3, diasEfetivosAnterior: 3 });
      expect(j.efetivoAnterior).toEqual({ inicio: '2026-08-31', fim: '2026-09-02' });
    });

    it('com fechamento de hoje, o dia de hoje entra', () => {
      const j = resolverJanelas(semana, '2026-09-10', true);
      expect(j).toMatchObject({ corte: '2026-09-10', diasEfetivos: 4 });
    });

    it('último dia do período já fechado não é parcial', () => {
      expect(resolverJanelas(semana, '2026-09-13', true).parcial).toBe(false);
    });

    it('primeiro dia sem fechamento apura só hoje, sinalizado como parcial', () => {
      const j = resolverJanelas(semana, '2026-09-07', false);
      expect(j).toMatchObject({ parcial: true, corte: '2026-09-07', diasEfetivos: 1 });
    });

    it('período futuro não tem trecho efetivo (dia futuro não é zero realizado)', () => {
      const j = resolverJanelas(semana, '2026-09-01', false);
      expect(j).toMatchObject({ futuro: true, efetivoAtual: null, efetivoAnterior: null, diasEfetivos: 0 });
    });

    it('mês parcial contra mês anterior mais curto limita pelo tamanho disponível', () => {
      const marco: CmvFiltro = { modo: 'mensal', inicio: '2027-03-01', fim: '2027-03-31' };
      const j = resolverJanelas(marco, '2027-03-31', false);
      expect(j.diasEfetivos).toBe(30);
      expect(j.diasEfetivosAnterior).toBe(28);
      expect(j.efetivoAnterior).toEqual({ inicio: '2027-02-01', fim: '2027-02-28' });
    });

    it('meses completos mantêm o calendário e expõem as durações diferentes', () => {
      const j = resolverJanelas({ modo: 'mensal', inicio: '2027-03-01', fim: '2027-03-31' }, '2027-05-01', false);
      expect(j).toMatchObject({ parcial: false, diasEfetivos: 31, diasEfetivosAnterior: 28 });
    });
  });

  describe('granularidade e faixas do gráfico', () => {
    it('diária no semanal/quinzenal, semanal no mensal, adaptativa no livre', () => {
      expect(granularidadeDe({ modo: 'semanal', inicio: '2026-09-07', fim: '2026-09-13' })).toBe('dia');
      expect(granularidadeDe({ modo: 'quinzenal', inicio: '2026-09-16', fim: '2026-09-30' })).toBe('dia');
      expect(granularidadeDe({ modo: 'mensal', inicio: '2026-09-01', fim: '2026-09-30' })).toBe('semana');
      expect(granularidadeDe({ modo: 'periodo', inicio: '2026-09-01', fim: '2026-09-10' })).toBe('dia');
      expect(granularidadeDe({ modo: 'periodo', inicio: '2026-07-01', fim: '2026-09-10' })).toBe('semana');
      expect(granularidadeDe({ modo: 'periodo', inicio: '2026-01-01', fim: '2026-09-10' })).toBe('mes');
    });

    it('as faixas cobrem todos os dias, sem sobrepor e sem passar das bordas', () => {
      for (const [faixa, gran] of [
        [{ inicio: '2026-09-01', fim: '2026-09-30' }, 'semana'],
        [{ inicio: '2026-02-01', fim: '2026-02-28' }, 'semana'],
        [{ inicio: '2026-01-15', fim: '2026-09-10' }, 'mes'],
        [{ inicio: '2026-09-07', fim: '2026-09-13' }, 'dia'],
      ] as const) {
        const buckets = gerarBuckets(faixa, gran);
        expect(buckets[0].inicio).toBe(faixa.inicio);
        expect(buckets[buckets.length - 1].fim).toBe(faixa.fim);
        expect(buckets.reduce((s, b) => s + diasNoIntervalo(b), 0)).toBe(diasNoIntervalo(faixa));
        for (let i = 1; i < buckets.length; i += 1) expect(buckets[i].inicio > buckets[i - 1].fim).toBe(true);
      }
    });

    it('o número de semanas vem do período, nunca fixo em cinco', () => {
      expect(gerarBuckets({ inicio: '2026-09-01', fim: '2026-09-30' }, 'semana')).toHaveLength(5);
      // fev/2027 começa na segunda e tem 28 dias: exatamente 4 semanas
      expect(gerarBuckets({ inicio: '2027-02-01', fim: '2027-02-28' }, 'semana')).toHaveLength(4);
      // ago/2026 começa no sábado: 6 faixas
      expect(gerarBuckets({ inicio: '2026-08-01', fim: '2026-08-31' }, 'semana')).toHaveLength(6);
    });

    it('rótulo do dia não desloca por fuso', () => {
      const [segunda] = gerarBuckets({ inicio: '2026-09-07', fim: '2026-09-07' }, 'dia');
      expect(segunda.rotulo).toBe('Seg 07');
      expect(segunda.descricao).toBe('07/09/2026');
    });
  });
});

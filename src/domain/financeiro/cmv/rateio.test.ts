import { describe, expect, it } from 'vitest';
import { decisaoSugerida, dividirCentavos, paraCentavos, resumirBoleto } from './rateio';

describe('CMV Financeiro — decisão por rateio', () => {
  it('exemplo obrigatório: boleto de R$ 2.150,00 leva R$ 1.800,00 ao CMV e deixa R$ 350,00 fora', () => {
    const resumo = resumirBoleto(2150, [
      { valor: 1200, cmv_incluir: true },   // Peixes
      { valor: 350, cmv_incluir: false },   // Material de escritório
      { valor: 600, cmv_incluir: true },    // Bebidas
    ]);
    expect(resumo).toEqual({
      totalCentavos: 215000, incluidoCentavos: 180000, foraCentavos: 35000,
      pendenteCentavos: 0, naoRateadoCentavos: 0, linhasPendentes: 0,
    });
  });

  it('boleto de categoria única: Sim leva o valor inteiro, Não leva zero', () => {
    expect(resumirBoleto(99.9, [{ valor: 99.9, cmv_incluir: true }]).incluidoCentavos).toBe(9990);
    expect(resumirBoleto(99.9, [{ valor: 99.9, cmv_incluir: false }])).toMatchObject({ incluidoCentavos: 0, foraCentavos: 9990 });
  });

  it('linha sem decisão fica pendente — nunca é assumida como Sim', () => {
    const resumo = resumirBoleto(300, [{ valor: 100, cmv_incluir: true }, { valor: 200, cmv_incluir: null }]);
    expect(resumo).toMatchObject({ incluidoCentavos: 10000, pendenteCentavos: 20000, linhasPendentes: 1 });
  });

  it('soma em centavos: 0,10 + 0,20 fecha em 0,30 sem resíduo de ponto flutuante', () => {
    const resumo = resumirBoleto(0.3, [{ valor: 0.1, cmv_incluir: true }, { valor: 0.2, cmv_incluir: true }]);
    expect(resumo.incluidoCentavos).toBe(30);
    expect(resumo.naoRateadoCentavos).toBe(0);
    expect(paraCentavos(null)).toBe(0);
  });

  it('rateio que não fecha deixa o resto explícito como não rateado', () => {
    expect(resumirBoleto(100, [{ valor: 60, cmv_incluir: true }]).naoRateadoCentavos).toBe(4000);
  });

  it('divisão determinística: o resíduo vai um centavo por vez às primeiras linhas e a soma fecha', () => {
    expect(dividirCentavos(1000, 3)).toEqual([334, 333, 333]);
    expect(dividirCentavos(215000, 3).reduce((s, v) => s + v, 0)).toBe(215000);
    expect(dividirCentavos(100, 0)).toEqual([]);
  });

  it('padrão da categoria é só sugestão; sem padrão a decisão nasce pendente', () => {
    const padroes = new Map<string, boolean | null>([['peixes', true], ['escritorio', false], ['novo', null]]);
    expect(decisaoSugerida('peixes', padroes)).toBe(true);
    expect(decisaoSugerida('escritorio', padroes)).toBe(false);
    expect(decisaoSugerida('novo', padroes)).toBeNull();
    expect(decisaoSugerida('desconhecida', padroes)).toBeNull();
    expect(decisaoSugerida('', padroes)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import {
  composicaoPorTipo,
  conferenciaExtrato,
  contaDadosBancarios,
  somaSaldosContas,
  tipoContaLabel,
} from './contasBancariasView';

describe('somaSaldosContas', () => {
  it('soma todas as contas recebidas, inclusive saldo negativo', () => {
    const saldos = { a: 1500.25, b: -200.5, c: 10 };
    expect(somaSaldosContas([{ id: 'a' }, { id: 'b' }, { id: 'c' }], saldos)).toBeCloseTo(1309.75);
  });

  it('conta sem saldo carregado vale zero; lista vazia soma zero', () => {
    expect(somaSaldosContas([{ id: 'a' }, { id: 'x' }], { a: 42 })).toBe(42);
    expect(somaSaldosContas([], { a: 42 })).toBe(0);
  });
});

describe('composicaoPorTipo', () => {
  it('conta por tipo na ordem dos tipos conhecidos', () => {
    const contas = [
      { id: '1', tipo: 'caixa_fisico' },
      { id: '2', tipo: 'corrente' },
      { id: '3', tipo: 'corrente' },
      { id: '4', tipo: 'maquininha' },
    ];
    expect(composicaoPorTipo(contas)).toBe('Conta Corrente: 2 · Caixa Físico: 1 · Maquininha: 1');
  });

  it('tipo desconhecido aparece pelo próprio valor, no fim', () => {
    expect(composicaoPorTipo([{ id: '1', tipo: 'investimento' }, { id: '2', tipo: 'poupanca' }]))
      .toBe('Poupança: 1 · investimento: 1');
    expect(composicaoPorTipo([])).toBe('');
  });
});

describe('contaDadosBancarios / tipoContaLabel', () => {
  it('monta banco, agência e conta só quando há banco', () => {
    expect(contaDadosBancarios({ banco: 'Banco X', agencia: '0001', numero_conta: '123-4' })).toBe('Banco X | Ag. 0001 | CC 123-4');
    expect(contaDadosBancarios({ banco: 'Banco X', agencia: null, numero_conta: null })).toBe('Banco X');
    expect(contaDadosBancarios({ banco: null, agencia: '0001', numero_conta: '1' })).toBeNull();
  });

  it('rótulo do tipo', () => {
    expect(tipoContaLabel('caixa_fisico')).toBe('Caixa Físico');
    expect(tipoContaLabel('outro')).toBe('outro');
  });
});

describe('conferenciaExtrato', () => {
  it('confere abaixo de um centavo e mostra a diferença extrato − sistema', () => {
    expect(conferenciaExtrato(100, 100.004).confere).toBe(true);
    const pendente = conferenciaExtrato(100, 120);
    expect(pendente.confere).toBe(false);
    expect(pendente.diferenca).toBe(-20);
  });

  it('um centavo de diferença não confere, mesmo com erro de ponto flutuante', () => {
    const umCentavo = conferenciaExtrato(0.3, 0.29);
    expect(umCentavo.confere).toBe(false);
    expect(umCentavo.diferenca).toBe(0.01);
  });
});

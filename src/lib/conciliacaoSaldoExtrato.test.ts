import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifySaldoArquivo,
  clearSaldoExtrato,
  getBankBalanceAtDate,
  getPendingDeltaAtReference,
  loadSaldoExtrato,
  diaSeguinte,
  saveSaldoExtrato,
  sugerirSaldoInicial,
} from './conciliacaoSaldoExtrato';

describe('diaSeguinte', () => {
  it('vira mês e ano sem passar por UTC', () => {
    expect(diaSeguinte('2026-10-02')).toBe('2026-10-03');
    expect(diaSeguinte('2026-09-30')).toBe('2026-10-01');
    expect(diaSeguinte('2026-12-31')).toBe('2027-01-01');
    expect(diaSeguinte('2028-02-28')).toBe('2028-02-29');
  });
});

describe('sugerirSaldoInicial', () => {
  it('reconstrói o saldo da véspera quando a conta foi cadastrada com o saldo de hoje (caso Stone)', () => {
    expect(sugerirSaldoInicial({ informado: 299.47, deltaAteData: -65000 })).toBe(65299.47);
  });

  it('desconta as entradas do extrato', () => {
    expect(sugerirSaldoInicial({ informado: 1000, deltaAteData: 250.3 })).toBe(749.7);
  });

  it('trabalha em centavos para não carregar erro de ponto flutuante', () => {
    // 0.1 + 0.2 em float é 0.30000000000000004
    expect(sugerirSaldoInicial({ informado: 0.3, deltaAteData: 0.1 + 0.2 })).toBe(0);
    expect(sugerirSaldoInicial({ informado: -898.69, deltaAteData: -17901.99 - 7298.01 })).toBe(24301.31);
  });
});

describe('statement balance storage', () => {
  beforeEach(() => sessionStorage.clear());

  it('shares the confirmed bank balance between reconciliation and account cards', () => {
    saveSaldoExtrato('santander-gm', { valor: -898.69, data: '2026-08-31' });

    expect(loadSaldoExtrato('santander-gm')).toEqual({
      valor: -898.69,
      data: '2026-08-31',
    });

    clearSaldoExtrato('santander-gm');
    expect(loadSaldoExtrato('santander-gm')).toBeNull();
  });

  it('rejects malformed stored values', () => {
    sessionStorage.setItem('conciliacao_saldo_extrato_santander-gm', '{"valor":"zero"}');
    expect(loadSaldoExtrato('santander-gm')).toBeNull();
  });

  it('não usa LEDGERBAL da conta corrente como sugestão do total quando há ContaMax', () => {
    const saldoCorrente = { valor: 130.91, data: '2026-09-01' };
    const result = classifySaldoArquivo(saldoCorrente, [
      { data: '2026-08-31', descricao: 'APLICACAO CONTAMAX', tipo: 'DESPESA', valor: 327.41 },
      { data: '2026-09-01', descricao: 'PIX RECEBIDO', tipo: 'RECEITA', valor: 130.91 },
    ]);

    expect(result).toEqual({ saldoContaCorrenteArquivo: saldoCorrente });
    expect(result.saldoSugerido).toBeUndefined();
  });

  it('mantém LEDGERBAL como sugestão em extrato sem investimento automático', () => {
    const saldo = { valor: 98589.12, data: '2026-08-31' };
    expect(classifySaldoArquivo(saldo, [
      { data: '2026-08-31', descricao: 'VENDA', tipo: 'RECEITA', valor: 100 },
    ])).toEqual({ saldoSugerido: saldo });
  });

  it('limita projeção pendente e reconstrução bancária à data confirmada', () => {
    const linhas = [
      { data: '2026-08-31', descricao: 'VENDA', tipo: 'RECEITA', valor: 50 },
      { data: '2026-09-01', descricao: 'PIX RECEBIDO', tipo: 'RECEITA', valor: 130.91 },
      { data: '2026-08-31', descricao: 'APLICACAO CONTAMAX', tipo: 'DESPESA', valor: 327.41 },
      { data: '2026-08-30', descricao: 'JÁ RESOLVIDA', tipo: 'DESPESA', valor: 10, jaConciliada: true },
    ];

    expect(getPendingDeltaAtReference(linhas, '2026-08-31')).toBe(50);
    expect(getBankBalanceAtDate(
      { valor: 23289.29, data: '2026-08-31' },
      linhas,
      '2026-08-30',
    )).toBeCloseTo(23239.29, 2);
  });
});

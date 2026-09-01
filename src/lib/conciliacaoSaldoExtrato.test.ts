import { beforeEach, describe, expect, it } from 'vitest';
import {
  classifySaldoArquivo,
  clearSaldoExtrato,
  getBankBalanceAtDate,
  getPendingDeltaAtReference,
  loadSaldoExtrato,
  saveSaldoExtrato,
} from './conciliacaoSaldoExtrato';

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

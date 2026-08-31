import { beforeEach, describe, expect, it } from 'vitest';
import { clearSaldoExtrato, loadSaldoExtrato, saveSaldoExtrato } from './conciliacaoSaldoExtrato';

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
});

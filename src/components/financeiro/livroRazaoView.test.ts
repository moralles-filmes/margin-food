import { describe, expect, it } from 'vitest';
import {
  daySaldoLabel,
  formatLedgerPeriodLabel,
  ledgerOrigem,
  ledgerSaldoLabel,
  ledgerStatusBadge,
  ledgerTipoBadge,
} from './livroRazaoView';

describe('formatLedgerPeriodLabel', () => {
  it('intervalo, um dia, limites abertos e sem limite', () => {
    expect(formatLedgerPeriodLabel('2026-09-04', '2026-10-04')).toBe('04/09/2026 a 04/10/2026');
    expect(formatLedgerPeriodLabel('2026-10-04', '2026-10-04')).toBe('04/10/2026');
    expect(formatLedgerPeriodLabel('', '2026-10-04')).toBe('Até 04/10/2026');
    expect(formatLedgerPeriodLabel('2026-09-04', '')).toBe('Desde 04/09/2026');
    expect(formatLedgerPeriodLabel('', '')).toBe('Todo o período');
  });
});

describe('ledgerSaldoLabel', () => {
  it('com data é o saldo ao fim daquele dia; sem data, o saldo atual', () => {
    expect(ledgerSaldoLabel('2026-01-31')).toBe('Saldo em 31/01/2026');
    expect(ledgerSaldoLabel('')).toBe('Saldo atual');
  });
});

describe('daySaldoLabel', () => {
  it('filtros de linha mudam o significado do saldo do dia', () => {
    expect(daySaldoLabel(false)).toBe('Saldo no fim do dia');
    expect(daySaldoLabel(true)).toBe('Saldo após o último lançamento listado');
  });
});

describe('badges', () => {
  it('tipo e status com rótulo legível e variante semântica', () => {
    expect(ledgerTipoBadge('RECEITA')).toEqual({ label: 'Receita', status: 'success' });
    expect(ledgerTipoBadge('DESPESA')).toEqual({ label: 'Despesa', status: 'danger' });
    expect(ledgerTipoBadge('TRANSFERENCIA').label).toBe('Transferência');
    expect(ledgerStatusBadge('PREVISTO')).toEqual({ label: 'Previsto', status: 'warning' });
    expect(ledgerStatusBadge('OUTRO')).toEqual({ label: 'OUTRO', status: 'neutral' });
  });

  it('origem ausente segue a regra antiga e nenhuma classe usa opacidade', () => {
    expect(ledgerOrigem(null, 'TRANSFERENCIA').text).toBe('Transferência');
    expect(ledgerOrigem('', 'DESPESA').text).toBe('Manual');
    expect(ledgerOrigem('desconhecida', 'RECEITA').text).toBe('Manual');
    expect(ledgerOrigem('conciliacao', 'DESPESA').className).not.toMatch(/\/\d/);
  });
});

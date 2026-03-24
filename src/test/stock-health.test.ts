import { describe, it, expect } from 'vitest';
import {
  classifyStockHealth,
  countStockHealth,
  STOCK_HEALTH_CONFIG,
  type StockHealthStatus,
} from '@/domain/estoque/rules';

describe('classifyStockHealth', () => {
  // sem_estoque
  it('returns sem_estoque when saldo is 0', () => {
    expect(classifyStockHealth(0, 10)).toBe('sem_estoque');
  });
  it('returns sem_estoque when saldo is negative', () => {
    expect(classifyStockHealth(-5, 10)).toBe('sem_estoque');
  });

  // critico: saldo > 0 AND saldo <= min * 0.5 AND min > 0
  it('returns critico when saldo is at 50% of minimum', () => {
    expect(classifyStockHealth(5, 10)).toBe('critico');
  });
  it('returns critico when saldo is below 50% of minimum', () => {
    expect(classifyStockHealth(2, 10)).toBe('critico');
  });

  // atencao: saldo > 0 AND saldo <= min AND saldo > min * 0.5 AND min > 0
  it('returns atencao when saldo is between 50% and 100% of minimum', () => {
    expect(classifyStockHealth(7, 10)).toBe('atencao');
  });
  it('returns atencao when saldo equals minimum', () => {
    expect(classifyStockHealth(10, 10)).toBe('atencao');
  });

  // ok
  it('returns ok when saldo is above minimum', () => {
    expect(classifyStockHealth(15, 10)).toBe('ok');
  });
  it('returns ok when minimum is 0 and saldo > 0 (not monitored)', () => {
    expect(classifyStockHealth(5, 0)).toBe('ok');
  });
  it('returns ok when saldo is 1 and minimum is 0', () => {
    expect(classifyStockHealth(1, 0)).toBe('ok');
  });

  // Edge cases
  it('handles minimum = 1 correctly at boundary', () => {
    expect(classifyStockHealth(0.5, 1)).toBe('critico'); // 0.5 <= 1*0.5
    expect(classifyStockHealth(0.6, 1)).toBe('atencao'); // 0.6 > 0.5 but <= 1
    expect(classifyStockHealth(1.1, 1)).toBe('ok');
  });

  it('handles very small saldo', () => {
    expect(classifyStockHealth(0.001, 10)).toBe('critico');
  });
});

describe('countStockHealth', () => {
  it('counts items correctly', () => {
    const items = [
      { saldo: 0, estoqueMinimo: 10 },    // sem_estoque
      { saldo: 3, estoqueMinimo: 10 },    // critico
      { saldo: 7, estoqueMinimo: 10 },    // atencao
      { saldo: 15, estoqueMinimo: 10 },   // ok
      { saldo: 5, estoqueMinimo: 0 },     // ok (not monitored)
    ];
    const result = countStockHealth(items);
    expect(result).toEqual({ ok: 2, atencao: 1, critico: 1, sem_estoque: 1 });
  });

  it('returns all zeros for empty array', () => {
    expect(countStockHealth([])).toEqual({ ok: 0, atencao: 0, critico: 0, sem_estoque: 0 });
  });
});

describe('STOCK_HEALTH_CONFIG', () => {
  it('has config for all statuses', () => {
    const statuses: StockHealthStatus[] = ['ok', 'atencao', 'critico', 'sem_estoque'];
    for (const s of statuses) {
      expect(STOCK_HEALTH_CONFIG[s]).toBeDefined();
      expect(STOCK_HEALTH_CONFIG[s].label).toBeTruthy();
      expect(STOCK_HEALTH_CONFIG[s].colorClass).toBeTruthy();
    }
  });
});

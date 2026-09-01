import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260901135342_fix_santander_contamax_opening_balance_20260901.sql',
  ),
  'utf8',
);

describe('repair da abertura consolidada Santander ContaMax', () => {
  it('fecha o saldo bancário comprovado de 31/08/2026', () => {
    const openingBalance = 33164.29;
    const contamaxYield = 0.34;
    const externalDeltaThroughAugust = -9875.34;

    expect(openingBalance + contamaxYield + externalDeltaThroughAugust).toBeCloseTo(23289.29, 2);
  });

  it('falha fechado se a conta ou os valores auditados tiverem mudado', () => {
    expect(migration).toContain("c.banco = '033'");
    expect(migration).toContain("= '130117470'");
    expect(migration).toContain('v_account_count <> 1 OR v_actor_id IS NULL');
    expect(migration).toContain('v_initial_balance NOT IN (10202.41, 33164.29)');
    expect(migration).toContain('v_balance_before <> 327.41');
    expect(migration).toContain('v_balance_after <> 23289.29');
    expect(migration).toContain('FOR UPDATE');
  });

  it('restaura o principal ContaMax sem hardcodar ids gerados e deixa auditoria', () => {
    expect(migration).toContain('SET saldo_inicial = 33164.29');
    expect(migration).not.toContain('SET saldo_inicial = 10202.41');
    expect(migration).toContain("'corrigir_saldo_inicial_contamax_consolidado'");
    expect(migration).toContain("'saldo_em_2026_08_31', 23289.29");
    expect(migration).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i);
  });
});

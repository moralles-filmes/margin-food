import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260831160605_santander_contamax_reconciliation_hardening.sql'),
  'utf8',
);

describe('hardening da conciliação Santander ContaMax', () => {
  it('impede que aplicação ou resgate automático seja ignorado', () => {
    expect(migration).toContain('AUTOMATIC_INVESTMENT_REQUIRES_TRANSFER');
    expect(migration).toContain("LIKE '%aplicacao contamax%'");
    expect(migration).toContain("LIKE '%resgate contamax%'");
  });

  it('cria e vincula a transferência na mesma RPC idempotente', () => {
    expect(migration).toContain('CREATE OR REPLACE FUNCTION public.reconcile_create_transfer_from_extrato');
    expect(migration).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(migration).toContain('INSERT INTO public.fin_conciliacao_vinculos');
    expect(migration).toContain('EXTERNAL_ID_ALREADY_LINKED');
  });

  it('protege as RPCs por tenant, RBAC e grants mínimos', () => {
    expect(migration.match(/public\.assert_tenant\(\)/g)).toHaveLength(2);
    expect(migration.match(/public\.has_any_permission/g)).toHaveLength(2);
    expect(migration.match(/SET search_path = ''/g)).toHaveLength(2);
    expect(migration).toContain('FROM PUBLIC, anon');
    expect(migration).toContain('TO authenticated');
  });

  it('faz o reparo piloto com guardas de cardinalidade e valida o saldo final', () => {
    expect(migration).toContain('expected 20 or 0 ignored ContaMax rows');
    expect(migration).toContain('stale yields expected 4/R$0.34 or 0');
    expect(migration).toContain('unexpected Santander GM initial balance');
    expect(migration).toContain('Santander GM must close 2026-08-28 at R$0.00');
  });
});

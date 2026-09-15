import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915190000_fin_bordero.sql'),
  'utf8',
);
const ephemeral = readFileSync(
  resolve(process.cwd(), 'supabase/tests/database/bordero_ephemeral.sql'),
  'utf8',
);

const helperBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public._fin_bordero_payload'),
  migration.indexOf('REVOKE ALL ON FUNCTION public._fin_bordero_payload'),
);
const openPayablesCte = helperBody.slice(helperBody.indexOf('open_payables AS'), helperBody.indexOf('allocations AS'));

describe('contrato SQL do Borderô', () => {
  it('filtra contas a vencer exclusivamente por data_vencimento, com as duas pontas inclusivas', () => {
    expect(openPayablesCte).toContain('payable.data_vencimento >= p_start');
    expect(openPayablesCte).toContain('payable.data_vencimento <= p_end_inclusive');
    expect(openPayablesCte).not.toMatch(/data_competencia|data_pagamento|created_at/);
    expect(openPayablesCte).toContain("payable.status IN ('AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO')");
    expect(openPayablesCte).not.toMatch(/'PAGO'|'CANCELADO'|'RASCUNHO'/);
  });

  it('resolve tenant e permissão no backend, sem aceitar company_id do cliente', () => {
    const publicSignature = /CREATE OR REPLACE FUNCTION public\.get_fin_bordero\(p_inicio date, p_fim date\)/;
    expect(migration).toMatch(publicSignature);
    expect(migration).toContain('v_company_id := public.assert_tenant();');
    expect(migration).toContain("'financeiro:relatorio-socios:view'");
    expect(migration).toContain("ERRCODE = '42501'");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public._fin_bordero_payload(uuid, date, date)\n  FROM PUBLIC, anon, authenticated, service_role;');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_fin_bordero(date, date)\n  FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_fin_bordero(date, date)\n  TO authenticated, service_role;');
    expect(migration).toContain("'BORDERO_PERIODO_LONGO'");
  });

  it('reutiliza as fontes oficiais: rateio, categorias do tenant e cache de saldo', () => {
    expect(helperBody).toContain('public.fin_lancamento_rateios');
    expect(helperBody).toMatch(/WHERE NOT EXISTS \(\s*SELECT 1\s*FROM public\.fin_lancamento_rateios/);
    expect(helperBody).toContain('category.company_id = p_company_id');
    expect(helperBody).toContain("'00000000-0000-0000-0000-000000000102'");
    expect(helperBody).toContain('public.fin_contas_saldo_cache');
    expect(helperBody).toContain('account.ativo = true');
    expect(helperBody).toContain("'projectedFinalBalanceCents', totals.balance_cents - totals.payable_cents");
    expect(helperBody).not.toMatch(/fin_lancamentos\b/);
  });

  it('é aditiva: sem DDL destrutivo, sem alterar tabelas e sem tocar em DRE/DFC', () => {
    expect(migration).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE|INSERT INTO)\b/i);
    expect(migration).not.toMatch(/get_fin_dre_summary|get_fin_dfc_summary|relatorio_socios_resumo\s*\(/);
  });

  it('tem teste de integração efêmero cobrindo filtro, isolamento, permissão e saldo final', () => {
    expect(ephemeral).toContain('\\ir ../../migrations/20260915190000_fin_bordero.sql');
    for (const marker of ['TESTE 1', 'TESTE 2', 'TESTE 3', 'TESTE 4', 'TESTE 5', 'TESTE 6', 'TESTE 7', 'TESTE 8', 'TESTE 9', 'TESTE 13']) {
      expect(ephemeral).toContain(marker);
    }
    expect(ephemeral).toContain('COMPANY_ACCESS_DENIED');
  });
});

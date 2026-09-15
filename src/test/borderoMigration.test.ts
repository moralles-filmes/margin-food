import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915190000_fin_bordero.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const fullExpense = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915210000_fin_bordero_despesa_completa.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const paidByPayment = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260915220000_fin_bordero_pagas_por_pagamento.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const ephemeral = readFileSync(
  resolve(process.cwd(), 'supabase/tests/database/bordero_ephemeral.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const helperBody = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public._fin_bordero_payload'),
  migration.indexOf('REVOKE ALL ON FUNCTION public._fin_bordero_payload'),
);
const openPayablesCte = helperBody.slice(helperBody.indexOf('open_payables AS'), helperBody.indexOf('allocations AS'));

describe('contrato SQL do Borderô — pagas pela data do pagamento', () => {
  const body = paidByPayment.slice(
    paidByPayment.indexOf('CREATE OR REPLACE FUNCTION public._fin_bordero_payload'),
    paidByPayment.indexOf('REVOKE ALL ON FUNCTION public._fin_bordero_payload'),
  );
  const openPayables = body.slice(body.indexOf('open_payables AS'), body.indexOf('allocations AS'));
  const paidLedger = body.slice(body.indexOf('paid_ledger AS'), body.indexOf('paid_items AS'));

  it('toda despesa paga vem do razão pela regra de caixa do DFC, sem somar a CP de novo', () => {
    expect(body).not.toContain('paid_payables');
    expect(body).not.toMatch(/status = 'PAGO'/);
    expect(paidLedger).toContain('public._fin_dfc_effective_allocations(p_company_id, p_start, p_end_inclusive)');
    expect(paidLedger).toContain("effective.tipo = 'DESPESA'");
    expect(paidLedger).toMatch(/LEFT JOIN public\.fin_contas_pagar AS payable/);
    expect(paidLedger).toContain("COALESCE(effective.origem, '') <> 'ajuste_pagamento'");
  });

  it('contas a vencer continuam por data_vencimento e o contrato segue aditivo', () => {
    expect(openPayables).toContain("payable.status IN ('AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO')");
    expect(openPayables).toContain('payable.data_vencimento >= p_start');
    expect(body).toContain("'contractVersion', '1.0'");
    expect(body).toContain("'totalExpenseCents', totals.paid_cents + totals.payable_cents");
    expect(body).toContain("'projectedFinalBalanceCents', totals.balance_cents - totals.payable_cents");
    expect(paidByPayment).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE|INSERT INTO)\b/i);
  });
});

describe('contrato SQL do Borderô — despesa completa', () => {
  const body = fullExpense.slice(
    fullExpense.indexOf('CREATE OR REPLACE FUNCTION public._fin_bordero_payload'),
    fullExpense.indexOf('REVOKE ALL ON FUNCTION public._fin_bordero_payload'),
  );
  const paidPayablesCte = body.slice(body.indexOf('paid_payables AS'), body.indexOf('paid_payable_allocations AS'));
  const paidLedgerCte = body.slice(body.indexOf('paid_ledger AS'), body.indexOf('paid_items AS'));

  it('CP paga entra pela própria CP, por data_vencimento inclusiva — igual a Contas a Pagar', () => {
    expect(paidPayablesCte).toContain("payable.status = 'PAGO'");
    expect(paidPayablesCte).toContain('payable.data_vencimento >= p_start');
    expect(paidPayablesCte).toContain('payable.data_vencimento <= p_end_inclusive');
  });

  it('demais despesas usam a regra de caixa do DFC e nunca repetem a baixa de uma CP', () => {
    expect(paidLedgerCte).toContain('public._fin_dfc_effective_allocations(p_company_id, p_start, p_end_inclusive)');
    expect(paidLedgerCte).toContain("effective.tipo = 'DESPESA'");
    expect(paidLedgerCte).toContain("COALESCE(effective.origem, '') = 'espelho_cp'");
    expect(paidLedgerCte).toContain("COALESCE(ledger.referencia_modulo, '') = 'contas_pagar'");
    expect(paidLedgerCte).toContain("effective.origem = 'ajuste_pagamento'");
  });

  it('mantém o contrato aditivo e o saldo final descontando só as contas a vencer', () => {
    expect(body).toContain("'contractVersion', '1.0'");
    for (const key of ["'items'", "'totalPayableCents'", "'payableCount'", "'paidItems'", "'totalPaidCents'", "'paidCount'"]) {
      expect(body).toContain(key);
    }
    expect(body).toContain("'totalExpenseCents', totals.paid_cents + totals.payable_cents");
    expect(body).toContain("'projectedFinalBalanceCents', totals.balance_cents - totals.payable_cents");
    expect(fullExpense).toContain('REVOKE ALL ON FUNCTION public._fin_bordero_payload(uuid, date, date)\n  FROM PUBLIC, anon, authenticated, service_role;');
    expect(fullExpense).not.toMatch(/\b(DROP|TRUNCATE|DELETE|UPDATE|ALTER TABLE|INSERT INTO)\b/i);
  });
});

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
    expect(ephemeral).toContain('\\ir ../../migrations/20260915210000_fin_bordero_despesa_completa.sql');
    expect(ephemeral).toContain('\\ir ../../migrations/20260915220000_fin_bordero_pagas_por_pagamento.sql');
    for (const marker of ['TESTE 1', 'TESTE 2', 'TESTE 3', 'TESTE 4', 'TESTE 5', 'TESTE 6', 'TESTE 7', 'TESTE 8', 'TESTE 9', 'TESTE 13', 'TESTE 14', 'TESTE 15']) {
      expect(ephemeral).toContain(marker);
    }
    expect(ephemeral).toContain('COMPANY_ACCESS_DENIED');
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260831225448_santander_contamax_consolidated_balance.sql',
  ),
  'utf8',
);
const rlsInitPlanFix = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260831232225_fix_contamax_rls_initplan.sql',
  ),
  'utf8',
);

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('migração do saldo Santander ContaMax consolidado', () => {
  it('classifica movimentações internas separadamente das ignoradas manuais', () => {
    expect(migration).toContain(
      "ADD COLUMN IF NOT EXISTS tratamento text NOT NULL DEFAULT 'IGNORADA_MANUAL'",
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS occurrence_index integer');
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS external_id text');
    expect(migration).toContain(
      'ADD COLUMN IF NOT EXISTS lancamento_origem_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL',
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS descricao_unaccent text GENERATED ALWAYS AS');
    expect(migration).toContain("CHECK (tratamento IN ('IGNORADA_MANUAL', 'MOVIMENTACAO_INTERNA_CONTAMAX'))");
    expect(migration).toContain("tratamento <> 'MOVIMENTACAO_INTERNA_CONTAMAX'");
    expect(migration).toContain('occurrence_index IS NOT NULL AND occurrence_index >= 0');
    expect(migration).toContain('descricao_unaccent gin_trgm_ops');
    expect(migration).toContain('idx_fin_conciliacao_ignoradas_conta_id');
    expect(migration).toContain('idx_fin_conciliacao_ignoradas_ignorado_por');
    expect(migration).toContain('idx_fin_conciliacao_ignoradas_lancamento_origem_id');
  });

  it('aceita em lote somente aplicações e resgates ContaMax de conta Santander do tenant', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.reconcile_neutralize_contamax(',
      'REVOKE ALL ON FUNCTION public.reconcile_neutralize_contamax',
    );

    expect(rpc).toContain('v_company_id := public.assert_tenant()');
    expect(rpc).toContain('v_uid := auth.uid()');
    expect(rpc).toContain('public.has_any_permission');
    expect(rpc).toContain("jsonb_typeof(p_linhas) <> 'array'");
    expect(rpc).toContain('c.company_id = v_company_id');
    expect(rpc).toContain('c.ativo = true');
    expect(rpc).toContain("v_bank_digits <> '033' AND v_bank NOT LIKE '%santander%'");
    expect(rpc).toContain("v_tipo = 'DESPESA' AND v_descricao_normalizada LIKE '%aplicacao%contamax%'");
    expect(rpc).toContain("v_tipo = 'RECEITA' AND v_descricao_normalizada LIKE '%resgate%contamax%'");
    expect(rpc).toContain('RAISE EXCEPTION \'VALIDATION_ERROR: somente aplicação/resgate ContaMax');
    expect(rpc).not.toContain('INSERT INTO public.fin_lancamentos');
  });

  it('é idempotente por conteúdo e ocorrência, nunca pelo FITID instável', () => {
    const occurrenceIndex = section(
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_conciliacao_contamax_occurrence',
      'CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_conciliacao_contamax_origin',
    );
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.reconcile_neutralize_contamax(',
      'REVOKE ALL ON FUNCTION public.reconcile_neutralize_contamax',
    );

    expect(occurrenceIndex).toContain(
      'company_id, conta_id, data, valor, tipo, descricao_unaccent, occurrence_index',
    );
    expect(occurrenceIndex).toContain("WHERE tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX'");
    expect(occurrenceIndex).not.toContain('external_id');
    expect(rpc).toContain('pg_catalog.pg_advisory_xact_lock');
    expect(rpc).toContain('row_number() OVER');
    expect(rpc).toContain('ORDER BY ordinality');
    expect(rpc).toContain(') - 1 AS occurrence_index');
    expect(rpc).toContain("WHERE tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX'");
    expect(rpc).toContain('DO NOTHING');
    expect(rpc).toContain("'existing', v_processed - v_inserted");
    expect(migration).toContain('FITID apenas para auditoria; nunca é identidade única');
  });

  it('fecha escrita direta por RLS e expõe apenas a RPC autenticada', () => {
    const policy = section(
      'CREATE POLICY "fin_conciliacao_ignoradas_tenant_select"',
      '-- Table privileges expose SELECT through PostgREST',
    );

    expect(migration).toContain('ALTER TABLE public.fin_conciliacao_ignoradas FORCE ROW LEVEL SECURITY');
    expect(migration).toContain('DROP POLICY IF EXISTS "conciliacao_ignoradas_company_rls"');
    expect(migration).toContain('DROP POLICY IF EXISTS "conciliacao_ignoradas_superadmin"');
    expect(policy).toContain('FOR SELECT');
    expect(policy).toContain('TO authenticated');
    expect(policy).toContain('company_id = (SELECT public.get_current_company_id())');
    expect(policy).toContain('(SELECT public.has_any_permission(auth.uid()');
    expect(policy).not.toMatch(/FOR\s+(ALL|INSERT|UPDATE|DELETE)/);
    expect(migration).toContain(
      'REVOKE ALL ON FUNCTION public.reconcile_neutralize_contamax(uuid, jsonb) FROM PUBLIC, anon',
    );
    expect(migration).toContain(
      'GRANT EXECUTE ON FUNCTION public.reconcile_neutralize_contamax(uuid, jsonb) TO authenticated',
    );
    expect(migration.match(/SET search_path = ''/g)?.length).toBeGreaterThanOrEqual(4);
  });

  it('impede que clientes antigos ignorem ou reconsiderem a classificação automática', () => {
    const manualIgnore = section(
      'CREATE OR REPLACE FUNCTION public.reconcile_ignorar_lancamento(',
      'REVOKE ALL ON FUNCTION public.reconcile_ignorar_lancamento',
    );
    const reconsider = section(
      'CREATE OR REPLACE FUNCTION public.reconcile_reconsiderar_ignorada(',
      'REVOKE ALL ON FUNCTION public.reconcile_reconsiderar_ignorada',
    );

    expect(manualIgnore).toContain('c.company_id = v_company_id');
    expect(manualIgnore).toContain('AUTOMATIC_INVESTMENT_REQUIRES_NEUTRALIZATION');
    expect(manualIgnore).toContain("v_uid, 'IGNORADA_MANUAL'");
    expect(reconsider).toContain("v_tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX'");
    expect(reconsider).toContain('INTERNAL_MOVEMENT_CANNOT_BE_RECONSIDERED');
    expect(reconsider).toContain("tratamento = 'IGNORADA_MANUAL'");
  });

  it('bloqueia ContaMax no razão como última linha de defesa', () => {
    const triggerFunction = section(
      'CREATE OR REPLACE FUNCTION public.fin_block_contamax_ledger_entry()',
      'REVOKE ALL ON FUNCTION public.fin_block_contamax_ledger_entry()',
    );

    expect(triggerFunction).toContain("NEW.status NOT IN ('REALIZADO', 'CONCILIADO')");
    expect(triggerFunction).toContain("v_descricao NOT LIKE '%aplicacao%contamax%'");
    expect(triggerFunction).toContain("v_descricao NOT LIKE '%resgate%contamax%'");
    expect(triggerFunction).toContain('c.company_id = NEW.company_id');
    expect(triggerFunction).toContain('c.id IN (NEW.conta_id, NEW.conta_destino_id)');
    expect(triggerFunction).toContain('AUTOMATIC_INVESTMENT_IS_INTERNAL');
    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF tipo, status, descricao, conta_id, conta_destino_id',
    );
    expect(migration).toContain('EXECUTE FUNCTION public.fin_block_contamax_ledger_entry()');
  });

  it('migra somente os 20 transfers GM comprovados e preserva o histórico', () => {
    const repair = section('DO $repair$', 'DO $validation$');

    expect(repair).toContain("c.banco = '033'");
    expect(repair).toContain("= '130117470'");
    expect(repair).toContain("= 'conta aplicacao'");
    expect(repair).toContain("a.acao = 'repair_contamax_ignored'");
    expect(repair).toContain('v_repair_audit_count <> 20');
    expect(repair).toContain('v_application_total = 53363.87');
    expect(repair).toContain('v_rescue_total = 63566.62');
    expect(repair).toContain('v_active_transfer_count = 0 AND v_neutral_count = 20');
    expect(repair).toContain('row_number() OVER');
    expect(repair).toContain('v_transfer.neutral_occurrence');
    expect(repair).toContain('v_transfer.id');
    expect(repair).toContain("SET status = 'CANCELADO'");
    expect(repair).toContain('DELETE FROM public.fin_conciliacao_vinculos');
    expect(repair).not.toContain('DELETE FROM public.fin_lancamentos');
  });

  it('consolida rendimento e abertura, desativa a conta técnica e prova os saldos finais', () => {
    const repair = section('DO $repair$', 'DO $validation$');

    expect(repair).toContain('l.valor = 0.34');
    expect(repair).toContain("'consolidar_rendimento_contamax'");
    expect(repair).toContain('SET conta_id = v_source_id');
    expect(repair).toContain('v_source_initial NOT IN (0, 10202.41)');
    expect(repair).toContain('SET saldo_inicial = 10202.41');
    expect(repair).toContain("data_saldo_inicial = date '2026-08-01'");
    expect(repair).toContain('technical account still has % active ledger rows');
    expect(repair).toContain('SET ativo = false');
    expect(repair).toContain("<= date '2026-08-28'");
    expect(repair).toContain('v_neutral_count <> 20 OR v_active_transfer_count <> 0');
    expect(repair).toContain('v_source_balance <> 0 OR v_target_balance <> 0');
    expect(repair).toContain('CONTAMAX_CONSOLIDATION_ABORTED: final validation');
  });

  it('força a resolução das assinaturas críticas durante a própria migration', () => {
    const validation = migration.slice(migration.indexOf('DO $validation$'));

    expect(validation).toContain("to_regprocedure('public.reconcile_neutralize_contamax(uuid,jsonb)')");
    expect(validation).toContain("to_regprocedure('public.reconcile_ignorar_lancamento(uuid,date,numeric,text,text,uuid)')");
    expect(validation).toContain("to_regprocedure('public.reconcile_reconsiderar_ignorada(uuid)')");
    expect(validation).toContain("to_regprocedure('public.fin_block_contamax_ledger_entry()')");
  });

  it('mantém tenant e auth.uid como InitPlans na policy final', () => {
    expect(rlsInitPlanFix).toContain(
      'company_id = (SELECT public.get_current_company_id())',
    );
    expect(rlsInitPlanFix).toContain(
      '(SELECT public.has_any_permission((SELECT auth.uid()), ARRAY[',
    );
    expect(rlsInitPlanFix).toContain('FOR SELECT');
    expect(rlsInitPlanFix).toContain('TO authenticated');
  });
});

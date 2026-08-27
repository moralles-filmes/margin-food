import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260826190950_presentation_decisions_governance.sql'),
  'utf8',
);

describe('contrato SQL da governança da Apresentação Sócios', () => {
  it('cria persistência tenant-scoped, FORCE RLS, GRANTs e buscas indexadas', () => {
    expect(migration.match(/company_id uuid NOT NULL REFERENCES public\.companies\(id\)/g)?.length).toBe(3);
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)?.length).toBe(3);
    expect(migration.match(/GRANT ALL ON TABLE public\.fin_presentation_/g)?.length).toBe(3);
    expect(migration).toContain('title_unaccent text GENERATED ALWAYS AS');
    expect(migration).toContain('description_unaccent text GENERATED ALWAYS AS');
    expect(migration.match(/gin_trgm_ops/g)?.length).toBe(2);
    expect(migration).toContain('fin_presentation_decisions_company_status_period_idx');
    expect(migration).toContain('fin_presentation_decision_actions_company_due_idx');
  });

  it('permite leitura somente no tenant com view e deixa escrita exclusivamente nas RPCs', () => {
    const policies = migration.slice(
      migration.indexOf('CREATE POLICY fin_presentation_decisions_tenant_read'),
      migration.indexOf('REVOKE ALL ON TABLE public.fin_presentation_decisions'),
    );
    expect(policies.match(/CREATE POLICY fin_presentation_/g)?.length).toBe(3);
    expect(policies.match(/company_id = \(SELECT public\.get_current_company_id\(\)\)/g)?.length).toBe(3);
    expect(policies.match(/\(SELECT public\.has_any_permission/g)?.length).toBe(3);
    expect(policies).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/);
    expect(migration).toContain('financeiro:relatorio-socios:view');
    expect(migration).toContain('financeiro:relatorio-socios:manage');
    expect(migration).toContain('financeiro:relatorio-socios:approve');
    expect(migration).not.toMatch(/financeiro:(orcamento|conciliacao|lancamentos):/);
  });

  it('resolve tenant e responsável no banco sem aceitar company_id do cliente', () => {
    expect(migration.match(/public\.assert_tenant\(\)/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration).not.toMatch(/p_company_id/);
    expect(migration.match(/profile\.company_id = v_company/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration).toContain('RESPONSIBLE_OUT_OF_TENANT');
    expect(migration).toContain('REFERENCES auth.users(id) ON DELETE SET NULL');
    expect(migration).toContain('responsible_name_snapshot text NOT NULL');
  });

  it('valida snapshot versionado, tamanho, fórmulas, fontes, métricas e cenário explícito', () => {
    expect(migration).toContain('octet_length(p_snapshot::text) > 262144');
    expect(migration).toContain("presentation-decision-snapshot-v1.0");
    expect(migration).toContain("presentation-plan-v1.0");
    expect(migration).toContain("presentation-scenario-v1.0");
    expect(migration).toContain("managerial-result-v1.0");
    expect(migration).toContain("p_snapshot#>>'{sources,actual}' <> 'fin_lancamentos'");
    expect(migration).toContain("p_snapshot#>>'{sources,budget}' <> 'fin_orcamentos'");
    expect(migration).toContain("p_snapshot#>>'{sources,cmvTarget}' <> 'metas_cmv.meta_cmv_total'");
    expect(migration).toContain('SNAPSHOT_METRIC_MISSING');
    expect(migration).toContain('SNAPSHOT_METRIC_INCOMPATIBLE: zero revenue');
    expect(migration).toContain('SCENARIO_WITHOUT_EXPLICIT_LEVER');
    expect(migration).toContain("length(btrim(assumption->>'exactValue'))");
  });

  it('preserva revisões e histórico sem RPC de exclusão física', () => {
    expect(migration).toContain('UNIQUE (company_id, decision_id, revision_number)');
    expect(migration).toContain('current_revision_id uuid');
    expect(migration).toContain("v_current_revision.snapshot");
    expect(migration).toContain("v_event := 'DECISION_REOPENED'");
    expect(migration.match(/INSERT INTO public\.fin_audit_logs/g)?.length).toBeGreaterThanOrEqual(7);
    expect(migration).not.toMatch(/FUNCTION public\._guarded_delete_presentation/);
    expect(migration).not.toMatch(/UPDATE public\.fin_presentation_decision_revisions\s+SET snapshot/);
  });

  it('protege transições e ações com locks, estado esperado e justificativas', () => {
    expect(migration.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(8);
    expect(migration.match(/OPTIMISTIC_LOCK_REQUIRED/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration.match(/OPTIMISTIC_LOCK_CONFLICT/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain('JUSTIFICATION_REQUIRED');
    expect(migration).toContain('ACTIVE_ACTIONS_REMAIN');
    expect(migration).toContain('ACTION_REOPEN_REQUIRED');
    expect(migration).toContain("status = 'IN_PROGRESS'");
    expect(migration).not.toMatch(/progress(_percent|_percentage)|percentual_de_progresso/i);
  });

  it('restringe execução e força resolução das funções PL/pgSQL na migration', () => {
    expect(migration.match(/SET search_path = ''/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration.match(/REVOKE ALL ON FUNCTION/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration.match(/TO authenticated, service_role/g)?.length).toBeGreaterThanOrEqual(11);
    expect(migration).toContain('DO $migration_check$');
    expect(migration.match(/pg_catalog\.pg_get_functiondef/g)?.length).toBeGreaterThanOrEqual(9);
    expect(migration).toContain('WHERE false');
  });

  it('notifica somente após validar o responsável no tenant e preserva IDs auditáveis', () => {
    const firstProfileValidation = migration.indexOf('WHERE profile.id = p_responsible_user_id');
    const firstNotification = migration.indexOf('INSERT INTO public.notifications');
    expect(firstProfileValidation).toBeGreaterThan(-1);
    expect(firstNotification).toBeGreaterThan(firstProfileValidation);
    expect(migration).toContain("'actionId', v_action.id");
    expect(migration).toContain("'presentation_decision', p_decision_id");
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260826204351_presentation_executive_sessions.sql'),
  'utf8',
);

describe('contrato SQL do ritual executivo da Apresentação Sócios', () => {
  it('cria quatro estruturas tenant-scoped com RLS forçada, grants e índices de busca', () => {
    expect(migration.match(/CREATE TABLE public\.fin_presentation_/g)?.length).toBe(4);
    expect(migration.match(/company_id uuid NOT NULL REFERENCES public\.companies\(id\)/g)?.length).toBe(4);
    expect(migration.match(/FORCE ROW LEVEL SECURITY/g)?.length).toBe(4);
    expect(migration.match(/GRANT ALL ON TABLE public\.fin_presentation_/g)?.length).toBe(4);
    expect(migration.match(/title_unaccent text GENERATED ALWAYS AS/g)?.length).toBe(2);
    expect(migration.match(/gin_trgm_ops/g)?.length).toBe(2);
    expect(migration).toContain('fin_presentation_sessions_company_period_idx');
    expect(migration).toContain('fin_presentation_sessions_company_status_idx');
    expect(migration).toContain('fin_presentation_sessions_company_responsible_idx');
    expect(migration).toContain('fin_presentation_minutes_revisions_company_session_idx');
  });

  it('permite somente leitura tenant-scoped direta e deixa mutações nas RPCs', () => {
    const policySection = migration.slice(
      migration.indexOf('CREATE POLICY fin_presentation_sessions_tenant_read'),
      migration.indexOf('REVOKE ALL ON TABLE public.fin_presentation_sessions'),
    );
    expect(policySection.match(/CREATE POLICY fin_presentation_/g)?.length).toBe(4);
    expect(policySection.match(/company_id = \(SELECT public\.get_current_company_id\(\)\)/g)?.length).toBe(4);
    expect(policySection.match(/\(SELECT public\.has_any_permission/g)?.length).toBe(4);
    expect(policySection).not.toMatch(/FOR (INSERT|UPDATE|DELETE)/);
    expect(migration).toContain('financeiro:relatorio-socios:view');
    expect(migration).toContain('financeiro:relatorio-socios:manage');
    expect(migration).toContain('financeiro:relatorio-socios:approve');
    expect(migration).toContain('financeiro:relatorio-socios:export');
  });

  it('preserva histórico e não cria cópia canônica de decisões ou ações', () => {
    expect(migration).toContain('JOIN public.fin_presentation_decisions decision');
    expect(migration).toContain('FROM public.fin_presentation_decision_actions action');
    expect(migration).toContain('referenciadas por id/versao, nunca copiadas');
    expect(migration).toContain('UNIQUE (company_id, session_id, revision_number)');
    expect(migration).toContain('current_revision_id uuid');
    expect(migration).toContain('ON DELETE SET NULL');
    expect(migration).toContain('minutes_responsible_name_snapshot text NOT NULL');
    expect(migration).toContain('name_snapshot text NOT NULL');
    expect(migration).toContain('created_by_name_snapshot text NOT NULL');
    expect(migration).not.toMatch(/_guarded_delete_presentation_session/);
    expect(migration).not.toMatch(/UPDATE public\.fin_presentation_minutes_revisions\s+SET content/);
  });

  it('limita e valida snapshot, pauta e revisão sem usar os dados como fonte financeira', () => {
    expect(migration).toContain('octet_length(meeting_snapshot::text) <= 262144');
    expect(migration).toContain('octet_length(content::text) <= 524288');
    expect(migration).toContain('PAYLOAD_TOO_LARGE: agenda');
    expect(migration).toContain('presentation-meeting-snapshot-v1.0');
    expect(migration).toContain('presentation-plan-v1.0');
    expect(migration).toContain("p_snapshot#>>'{sources,actual}' <> 'fin_lancamentos'");
    expect(migration).toContain("p_snapshot#>>'{sources,budget}' <> 'fin_orcamentos'");
    expect(migration).toContain("p_snapshot#>>'{sources,cmvTarget}' <> 'metas_cmv.meta_cmv_total'");
    expect(migration).toContain('SNAPSHOT_METRIC_INCOMPATIBLE: zero revenue');
    expect(migration).not.toMatch(/UPDATE public\.(fin_lancamentos|fin_orcamentos|metas_cmv)/);
  });

  it('valida tenant, referências, estados, justificativa e locks otimistas', () => {
    expect(migration.match(/public\.assert_tenant\(\)/g)?.length).toBeGreaterThanOrEqual(8);
    const mutationSignatures = migration.match(/CREATE OR REPLACE FUNCTION public\._guarded_[^(]+\([\s\S]*?\)\r?\nRETURNS/g) ?? [];
    expect(mutationSignatures).toHaveLength(5);
    expect(mutationSignatures.join('\n')).not.toMatch(/p_company_id/);
    expect(migration).toContain('PARTICIPANT_OUT_OF_TENANT');
    expect(migration).toContain('RESPONSIBLE_OUT_OF_TENANT');
    expect(migration).toContain('REFERENCE_OUT_OF_TENANT_OR_PERIOD');
    expect(migration).toContain('SNAPSHOT_REFERENCE_MISSING');
    expect(migration.match(/OPTIMISTIC_LOCK_REQUIRED/g)?.length).toBeGreaterThanOrEqual(4);
    expect(migration.match(/OPTIMISTIC_LOCK_CONFLICT/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain('JUSTIFICATION_REQUIRED');
    expect(migration).toContain('TRANSITION_INVALID');
    expect(migration.match(/FOR UPDATE/g)?.length).toBeGreaterThanOrEqual(5);
  });

  it('restringe funções, registra antes/depois e isola falha de notificação', () => {
    expect(migration.match(/SET search_path = ''/g)?.length).toBe(10);
    expect(migration.match(/REVOKE ALL ON FUNCTION/g)?.length).toBe(10);
    expect(migration).toContain('TO authenticated, service_role');
    expect(migration.match(/INSERT INTO public\.fin_audit_logs/g)?.length).toBeGreaterThanOrEqual(5);
    expect(migration).toContain("'SESSION_CREATED'");
    expect(migration).toContain("'MINUTES_APPROVED'");
    expect(migration).toContain('EXCEPTION WHEN OTHERS THEN NULL');
    expect(migration).not.toMatch(/cron|pg_cron/i);
  });

  it('força resolução das funções e colunas em PostgreSQL real na própria migration', () => {
    expect(migration).toContain('DO $migration_check$');
    expect(migration.match(/pg_catalog\.pg_get_functiondef/g)?.length).toBe(8);
    expect(migration).toContain('WHERE false');
    expect(migration).toContain('session.current_revision_id');
    expect(migration).toContain('revision.revision_number');
  });
});

\set ON_ERROR_STOP on

DO $roles$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END;
$roles$;
CREATE SCHEMA auth;
CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS unaccent WITH SCHEMA public;
CREATE EXTENSION IF NOT EXISTS pg_trgm WITH SCHEMA public;

CREATE TABLE auth.users (id uuid PRIMARY KEY);
CREATE TABLE public.companies (id uuid PRIMARY KEY);
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  nome text NOT NULL,
  email text NOT NULL,
  avatar_url text
);
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_user_id uuid NOT NULL,
  type text NOT NULL,
  module text,
  title text NOT NULL,
  message text NOT NULL,
  entity_type text,
  entity_id uuid,
  link_path text,
  created_by uuid,
  metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE public.fin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  acao text NOT NULL,
  antes jsonb,
  depois jsonb,
  justificativa text,
  user_id uuid,
  company_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('test.user_id', true), '')::uuid $$;

CREATE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('test.company_id', true), '')::uuid $$;

CREATE FUNCTION public.assert_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE v_company uuid := public.get_current_company_id();
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND'; END IF;
  RETURN v_company;
END;
$$;

CREATE FUNCTION public.has_any_permission(p_user_id uuid, p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT COALESCE(current_setting('test.permissions', true), 'on') = 'on' AND p_user_id = auth.uid() $$;

CREATE FUNCTION public.immutable_unaccent(p_value text)
RETURNS text
LANGUAGE sql
IMMUTABLE
STRICT
SET search_path = ''
AS $$ SELECT public.unaccent('public.unaccent', p_value) $$;

CREATE FUNCTION public.trg_block_placeholder_company()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = ''
AS $$
BEGIN
  IF NEW.company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION 'PLACEHOLDER_COMPANY_BLOCKED';
  END IF;
  RETURN NEW;
END;
$$;

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT SELECT, DELETE ON auth.users TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_current_company_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_permission(uuid,text[]) TO authenticated, service_role;
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.fin_audit_logs TO authenticated;

\ir ../../migrations/20260826190950_presentation_decisions_governance.sql

INSERT INTO public.companies(id) VALUES
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
INSERT INTO auth.users(id) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc');
INSERT INTO public.profiles(id, company_id, nome, email) VALUES
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'Autor Empresa A', 'autor-a@test.local'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '11111111-1111-4111-8111-111111111111', 'Responsavel Empresa A', 'responsavel-a@test.local'),
  ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '22222222-2222-4222-8222-222222222222', 'Autor Empresa B', 'autor-b@test.local');

CREATE OR REPLACE FUNCTION public.run_presentation_decisions_ephemeral_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $test$
DECLARE
  v_snapshot jsonb := '{
    "contractVersion":"presentation-decision-snapshot-v1.0",
    "referenceType":"BASE",
    "sourceMode":"actual",
    "period":{"start":"2026-03-01","endExclusive":"2026-04-01"},
    "granularity":"month",
    "cutoffDate":"2026-03-20",
    "capturedAt":"2026-03-20T10:00:00-03:00",
    "formulaVersion":"presentation-plan-v1.0",
    "metricFormulaVersion":"managerial-result-v1.0",
    "sources":{"actual":"fin_lancamentos","budget":"fin_orcamentos","cmvTarget":"metas_cmv.meta_cmv_total","baseline":"actual"},
    "rules":{"regime":"competencia","openItemsIncluded":false},
    "metrics":{"revenue":1200,"expense":700,"result":500,"marginPercent":41.6667,"cmv":280,"cmvPercent":23.3333},
    "assumptions":[]
  }'::jsonb;
  v_created jsonb;
  v_result jsonb;
  v_decision_id uuid;
  v_action_id uuid;
  v_updated_at timestamptz;
  v_action_updated_at timestamptz;
  v_count integer;
  v_original_snapshot jsonb;
BEGIN
  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('test.permissions', 'on', false);

  BEGIN
    PERFORM public._guarded_create_presentation_decision(
      'Responsavel externo', 'Deve falhar antes do insert', DATE '2026-03-01', DATE '2026-04-01',
      'month', 'BASE', v_snapshot, 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
    );
    RAISE EXCEPTION 'TEST_FAILED: cross-tenant responsible accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%RESPONSIBLE_OUT_OF_TENANT%' THEN RAISE; END IF;
  END;

  v_created := public._guarded_create_presentation_decision(
    'Decisao executiva', 'Contexto informado explicitamente pelos socios.',
    DATE '2026-03-01', DATE '2026-04-01', 'month', 'BASE', v_snapshot,
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'
  );
  v_decision_id := (v_created->>'id')::uuid;
  v_updated_at := (v_created->>'updatedAt')::timestamptz;
  SELECT revision.snapshot INTO v_original_snapshot
  FROM public.fin_presentation_decision_revisions revision
  WHERE revision.id = (v_created->>'currentRevisionId')::uuid;

  IF (public.list_fin_presentation_decisions(DATE '2026-03-01', DATE '2026-04-01')->>'totalCount')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: list did not return created decision';
  END IF;
  IF public.get_fin_presentation_decision(v_decision_id)#>>'{decision,status}' <> 'DRAFT' THEN
    RAISE EXCEPTION 'TEST_FAILED: detail status';
  END IF;

  BEGIN
    INSERT INTO public.fin_presentation_decisions (
      company_id, title, context, period_start, period_end_exclusive, granularity,
      reference_type, created_by_name_snapshot, updated_by_name_snapshot
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'Direto', 'Sem RPC',
      DATE '2026-03-01', DATE '2026-04-01', 'month', 'BASE', 'Teste', 'Teste'
    );
    RAISE EXCEPTION 'TEST_FAILED: direct insert bypassed RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.fin_presentation_decisions SET title = 'Direto' WHERE id = v_decision_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'TEST_FAILED: direct update bypassed RLS'; END IF;
  DELETE FROM public.fin_presentation_decisions WHERE id = v_decision_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'TEST_FAILED: direct delete bypassed RLS'; END IF;

  v_result := public._guarded_update_presentation_decision_draft(
    v_decision_id, 'Decisao executiva revisada', 'Contexto local preservado.',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  BEGIN
    PERFORM public._guarded_update_presentation_decision_draft(
      v_decision_id, 'Stale', 'Deve falhar por concorrencia.', NULL,
      v_updated_at - interval '1 second'
    );
    RAISE EXCEPTION 'TEST_FAILED: stale update accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%OPTIMISTIC_LOCK_CONFLICT%' THEN RAISE; END IF;
  END;

  v_result := public._guarded_add_presentation_decision_revision(
    v_decision_id, 'BASE', jsonb_set(v_snapshot, '{capturedAt}', '"2026-03-21T10:00:00-03:00"'),
    'Nova referencia solicitada pelos socios.', 'DRAFT', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  SELECT count(*) INTO v_count FROM public.fin_presentation_decision_revisions WHERE decision_id = v_decision_id;
  IF v_count <> 2 THEN RAISE EXCEPTION 'TEST_FAILED: explicit revision count'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fin_presentation_decision_revisions
    WHERE decision_id = v_decision_id AND revision_number = 1 AND snapshot = v_original_snapshot
  ) THEN RAISE EXCEPTION 'TEST_FAILED: original snapshot changed'; END IF;

  v_result := public._guarded_transition_presentation_decision(
    v_decision_id, 'DRAFT', 'APPROVED', 'Aprovada apos revisao executiva.', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;

  v_result := public._guarded_create_presentation_decision_action(
    v_decision_id, 'Executar compromisso acordado.',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', 'APPROVED', v_updated_at,
    DATE '2026-04-10', 'HIGH'
  );
  v_action_id := (v_result->>'id')::uuid;
  v_action_updated_at := (v_result->>'updatedAt')::timestamptz;
  SELECT updated_at INTO v_updated_at FROM public.fin_presentation_decisions WHERE id = v_decision_id;

  v_result := public._guarded_update_presentation_decision_action(
    v_action_id, 'Executar compromisso acordado e revisado.',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', DATE '2026-04-11', 'HIGH',
    'PENDING', v_action_updated_at
  );
  v_action_updated_at := (v_result->>'updatedAt')::timestamptz;

  v_result := public._guarded_transition_presentation_decision_action(
    v_action_id, 'PENDING', 'IN_PROGRESS', NULL, v_action_updated_at
  );
  v_action_updated_at := (v_result->>'updatedAt')::timestamptz;
  IF v_result->>'decisionStatus' <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'TEST_FAILED: explicit action start'; END IF;

  v_result := public._guarded_transition_presentation_decision_action(
    v_action_id, 'IN_PROGRESS', 'COMPLETED', 'Entrega validada explicitamente.', v_action_updated_at
  );
  SELECT updated_at INTO v_updated_at FROM public.fin_presentation_decisions WHERE id = v_decision_id;
  v_result := public._guarded_transition_presentation_decision(
    v_decision_id, 'IN_PROGRESS', 'COMPLETED', 'Encerramento confirmado pelos socios.', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  v_result := public._guarded_transition_presentation_decision(
    v_decision_id, 'COMPLETED', 'DRAFT', 'Reabertura solicitada para nova revisao.', v_updated_at
  );
  SELECT count(*) INTO v_count FROM public.fin_presentation_decision_revisions WHERE decision_id = v_decision_id;
  IF v_count <> 3 THEN RAISE EXCEPTION 'TEST_FAILED: reopen did not clone revision'; END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.fin_audit_logs audit
    WHERE audit.entidade_id = v_decision_id AND audit.acao = 'DRAFT_UPDATED'
      AND audit.antes IS NOT NULL AND audit.depois IS NOT NULL
  ) THEN RAISE EXCEPTION 'TEST_FAILED: before/after audit missing'; END IF;

  DELETE FROM auth.users WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF NOT EXISTS (
    SELECT 1 FROM public.fin_presentation_decision_actions action
    WHERE action.id = v_action_id AND action.responsible_user_id IS NULL
      AND action.responsible_name_snapshot = 'Responsavel Empresa A'
  ) THEN RAISE EXCEPTION 'TEST_FAILED: removed user history lost'; END IF;

  PERFORM set_config('test.company_id', '22222222-2222-4222-8222-222222222222', false);
  PERFORM set_config('test.user_id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
  IF EXISTS (SELECT 1 FROM public.fin_presentation_decisions) THEN
    RAISE EXCEPTION 'TEST_FAILED: RLS leaked cross-tenant decision';
  END IF;
  IF (public.list_fin_presentation_decisions()->>'totalCount')::integer <> 0 THEN
    RAISE EXCEPTION 'TEST_FAILED: RPC leaked cross-tenant decision';
  END IF;
  BEGIN
    PERFORM public.get_fin_presentation_decision(v_decision_id);
    RAISE EXCEPTION 'TEST_FAILED: detail leaked cross-tenant decision';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_FOUND%' THEN RAISE; END IF;
  END;

  PERFORM set_config('test.permissions', 'off', false);
  BEGIN
    PERFORM public.list_fin_presentation_decisions();
    RAISE EXCEPTION 'TEST_FAILED: view without permission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERMISSION_DENIED%' THEN RAISE; END IF;
  END;
END;
$test$;

GRANT EXECUTE ON FUNCTION public.run_presentation_decisions_ephemeral_tests() TO authenticated;
SET ROLE authenticated;
SELECT public.run_presentation_decisions_ephemeral_tests();
RESET ROLE;

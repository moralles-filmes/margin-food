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

CREATE FUNCTION auth.uid()
RETURNS uuid
LANGUAGE sql
STABLE
AS $$ SELECT NULLIF(current_setting('test.user_id', true), '')::uuid $$;

CREATE FUNCTION public.assert_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SET search_path = ''
AS $$
DECLARE v_company uuid := NULLIF(current_setting('test.company_id', true), '')::uuid;
BEGIN
  IF v_company IS NULL THEN RAISE EXCEPTION 'TENANT_NOT_FOUND'; END IF;
  RETURN v_company;
END;
$$;

CREATE FUNCTION public.has_permission(p_user_id uuid, p_key text)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_user_id = auth.uid()
    AND p_key = 'financeiro:relatorio-socios:view'
    AND COALESCE(current_setting('test.permissions', true), 'on') = 'on'
$$;

CREATE TABLE public.financeiro_fechamento_caixa (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  data date NOT NULL,
  faturamento_bruto numeric NOT NULL,
  faturamento_liquido numeric,
  UNIQUE (company_id, data)
);

CREATE TABLE public.financeiro_fechamento_marca_valores (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  fechamento_id uuid NOT NULL,
  marca text NOT NULL,
  valor numeric NOT NULL
);

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;

\ir ../../migrations/20260828030748_presentation_revenue.sql

INSERT INTO public.financeiro_fechamento_caixa (
  id, company_id, data, faturamento_bruto, faturamento_liquido
) VALUES
  ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', '2024-05-10', 100, 90),
  ('10000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '2025-12-29', 100, 90),
  ('10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', '2025-12-30', 200, 180),
  ('10000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', '2026-01-01', 0, 0),
  ('10000000-0000-4000-8000-000000000005', '11111111-1111-4111-8111-111111111111', '2026-01-02', 600, 540),
  ('10000000-0000-4000-8000-000000000006', '11111111-1111-4111-8111-111111111111', '2026-01-05', 300, 270),
  ('10000000-0000-4000-8000-000000000007', '11111111-1111-4111-8111-111111111111', '2026-02-02', 0, 0),
  ('10000000-0000-4000-8000-000000000008', '11111111-1111-4111-8111-111111111111', '2026-03-02', 50, 45),
  ('10000000-0000-4000-8000-000000000009', '11111111-1111-4111-8111-111111111111', '2026-06-01', 80, 72),
  ('20000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', '2026-01-02', 9999, 1);

-- A decomposição soma exatamente o fechamento de R$ 600, mas não pode ser
-- agregada outra vez pela RPC do capítulo.
INSERT INTO public.financeiro_fechamento_marca_valores (
  company_id, fechamento_id, marca, valor
) VALUES
  ('11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000005', 'Marca A', 400),
  ('11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000005', 'Marca B', 200);

DO $privileges$
BEGIN
  IF has_function_privilege('anon', 'public.get_fin_presentation_revenue(text,integer[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: anon can execute presentation revenue';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_fin_presentation_revenue(text,integer[])', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: authenticated cannot execute presentation revenue';
  END IF;
END;
$privileges$;

CREATE OR REPLACE FUNCTION public.run_presentation_revenue_ephemeral_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $test$
DECLARE
  v_payload jsonb;
  v_year_months text[];
BEGIN
  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('test.permissions', 'on', false);

  v_payload := public.get_fin_presentation_revenue('2026-01', ARRAY[2026, 2024, 2025]);
  IF v_payload->>'contractVersion' <> '1.0'
     OR v_payload#>>'{source,relation}' <> 'public.financeiro_fechamento_caixa'
     OR v_payload#>>'{source,valueField}' <> 'faturamento_bruto'
     OR v_payload#>>'{source,dateField}' <> 'data' THEN
    RAISE EXCEPTION 'TEST_FAILED: versioned canonical source';
  END IF;
  IF v_payload->>'selectedMonth' <> '2026-01'
     OR v_payload->>'previousMonth' <> '2025-12'
     OR (v_payload#>>'{current,total}')::numeric <> 900
     OR (v_payload#>>'{current,closingCount}')::integer <> 3
     OR (v_payload#>>'{previous,total}')::numeric <> 300
     OR (v_payload#>>'{delta,absolute,value}')::numeric <> 600
     OR (v_payload#>>'{delta,percentage,value}')::numeric <> 200 THEN
    RAISE EXCEPTION 'TEST_FAILED: current previous or year boundary';
  END IF;
  IF (v_payload#>>'{current,total}')::numeric = 1500 THEN
    RAISE EXCEPTION 'TEST_FAILED: brand values duplicated the canonical gross revenue';
  END IF;

  IF jsonb_array_length(v_payload->'weekdays') <> 7
     OR v_payload#>>'{weekdays,0,label}' <> 'Segunda-feira'
     OR v_payload#>>'{weekdays,6,label}' <> 'Domingo'
     OR (v_payload#>>'{weekdays,0,total}')::numeric <> 300
     OR (v_payload#>>'{weekdays,0,occurrences}')::integer <> 1
     OR (v_payload#>>'{weekdays,0,average,value}')::numeric <> 300 THEN
    RAISE EXCEPTION 'TEST_FAILED: ordered weekday aggregation';
  END IF;
  IF v_payload#>>'{weekdays,3,state}' <> 'available'
     OR (v_payload#>>'{weekdays,3,total}')::numeric <> 0
     OR (v_payload#>>'{weekdays,3,occurrences}')::integer <> 1
     OR (v_payload#>>'{weekdays,3,average,value}')::numeric <> 0
     OR v_payload#>>'{weekdays,1,state}' <> 'empty'
     OR v_payload#>>'{weekdays,1,average,reason}' <> 'no-occurrences' THEN
    RAISE EXCEPTION 'TEST_FAILED: zero closing differs from absent weekday';
  END IF;

  IF v_payload->'requestedYears' <> '[2024, 2025, 2026]'::jsonb
     OR jsonb_array_length(v_payload->'history') <> 36 THEN
    RAISE EXCEPTION 'TEST_FAILED: three sorted history years';
  END IF;
  SELECT array_agg(point->>'yearMonth' ORDER BY ordinality)
  INTO v_year_months
  FROM jsonb_array_elements(v_payload->'history') WITH ORDINALITY AS item(point, ordinality);
  IF v_year_months[1] <> '2024-01' OR v_year_months[36] <> '2026-12' THEN
    RAISE EXCEPTION 'TEST_FAILED: deterministic history order';
  END IF;

  IF jsonb_array_length(public.get_fin_presentation_revenue('2026-01', ARRAY[2026])->'history') <> 12
     OR jsonb_array_length(public.get_fin_presentation_revenue('2026-01', ARRAY[2025, 2026])->'history') <> 24 THEN
    RAISE EXCEPTION 'TEST_FAILED: one or two history years';
  END IF;
  BEGIN
    PERFORM public.get_fin_presentation_revenue('2026-01', ARRAY[2023, 2024, 2025, 2026]);
    RAISE EXCEPTION 'TEST_FAILED: fourth history year accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_fin_presentation_revenue('2026-01', ARRAY[2026, 2026]);
    RAISE EXCEPTION 'TEST_FAILED: duplicated history year accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;
  BEGIN
    PERFORM public.get_fin_presentation_revenue('2026-13', ARRAY[2026]);
    RAISE EXCEPTION 'TEST_FAILED: invalid month accepted';
  EXCEPTION WHEN invalid_datetime_format THEN NULL;
  END;

  v_payload := public.get_fin_presentation_revenue('2026-03', ARRAY[2026]);
  IF v_payload#>>'{delta,percentage,state}' <> 'unavailable'
     OR v_payload#>>'{delta,percentage,reason}' <> 'zero-baseline'
     OR (v_payload#>>'{delta,absolute,value}')::numeric <> 50 THEN
    RAISE EXCEPTION 'TEST_FAILED: explicit zero baseline';
  END IF;

  v_payload := public.get_fin_presentation_revenue('2026-06', ARRAY[2026]);
  IF v_payload#>>'{delta,percentage,reason}' <> 'previous-period-absent'
     OR v_payload::text ~ '(Infinity|NaN)' THEN
    RAISE EXCEPTION 'TEST_FAILED: absent baseline or non-finite number';
  END IF;

  v_payload := public.get_fin_presentation_revenue('2026-05', ARRAY[2026]);
  IF v_payload#>>'{current,state}' <> 'empty'
     OR v_payload#>>'{current,coverage,state}' <> 'gap' THEN
    RAISE EXCEPTION 'TEST_FAILED: covered empty month';
  END IF;
  v_payload := public.get_fin_presentation_revenue('2027-01', ARRAY[2026]);
  IF v_payload#>>'{current,state}' <> 'unavailable'
     OR v_payload#>>'{current,coverage,state}' <> 'outside-range' THEN
    RAISE EXCEPTION 'TEST_FAILED: month outside coverage';
  END IF;

  PERFORM set_config('test.permissions', 'off', false);
  BEGIN
    PERFORM public.get_fin_presentation_revenue('2026-01', ARRAY[2026]);
    RAISE EXCEPTION 'TEST_FAILED: permission denied was ignored';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('test.permissions', 'on', false);

  PERFORM set_config('test.company_id', '22222222-2222-4222-8222-222222222222', false);
  v_payload := public.get_fin_presentation_revenue('2026-01', ARRAY[2026]);
  IF (v_payload#>>'{current,total}')::numeric <> 9999
     OR (v_payload#>>'{current,closingCount}')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: tenant B total or isolation';
  END IF;

  PERFORM set_config('test.company_id', '33333333-3333-4333-8333-333333333333', false);
  v_payload := public.get_fin_presentation_revenue('2026-01', ARRAY[2026]);
  IF v_payload->>'availability' <> 'unavailable'
     OR v_payload#>>'{coverage,state}' <> 'no-history'
     OR v_payload#>>'{current,coverage,state}' <> 'no-history' THEN
    RAISE EXCEPTION 'TEST_FAILED: tenant without canonical coverage';
  END IF;
END;
$test$;

GRANT EXECUTE ON FUNCTION public.run_presentation_revenue_ephemeral_tests() TO authenticated;
SET ROLE authenticated;
SELECT public.run_presentation_revenue_ephemeral_tests();
RESET ROLE;

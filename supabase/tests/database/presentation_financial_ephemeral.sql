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
AS $$ SELECT p_user_id = auth.uid() AND COALESCE(current_setting('test.permissions', true), 'on') = 'on' $$;

CREATE FUNCTION public.has_any_permission(p_user_id uuid, p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$ SELECT p_user_id = auth.uid() AND COALESCE(current_setting('test.permissions', true), 'on') = 'on' $$;

CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  parent_id uuid REFERENCES public.fin_categorias(id),
  nome text NOT NULL,
  tipo text NOT NULL,
  ordem integer DEFAULT 0,
  excluir_dos_totais boolean NOT NULL DEFAULT false,
  grupo text,
  linha_dre text
);

CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  tipo text NOT NULL,
  valor numeric NOT NULL,
  data_competencia date NOT NULL,
  data_pagamento date,
  conciliado_em timestamptz,
  categoria_id uuid,
  status text NOT NULL,
  origem text NOT NULL,
  conciliado boolean NOT NULL DEFAULT false,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false,
  descricao text
);

CREATE TABLE public.fin_lancamento_rateios (
  lancamento_id uuid NOT NULL,
  categoria_id uuid,
  valor numeric NOT NULL,
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_contas_pagar (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  descricao text NOT NULL,
  fornecedor text,
  status text NOT NULL,
  data_vencimento date NOT NULL,
  valor numeric NOT NULL,
  categoria_id uuid,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false
);

CREATE TABLE public.fin_contas_receber (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  descricao text NOT NULL,
  cliente text,
  status text NOT NULL,
  data_vencimento date NOT NULL,
  valor numeric NOT NULL,
  categoria_id uuid,
  excluir_dos_relatorios boolean NOT NULL DEFAULT false
);

CREATE TABLE public.fin_contas (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.fin_orcamentos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  categoria_id uuid NOT NULL,
  mes_ano text NOT NULL,
  valor_orcado numeric NOT NULL,
  created_by uuid,
  updated_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (company_id, categoria_id, mes_ano)
);

CREATE TABLE public.metas_cmv (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  mes_ano text NOT NULL,
  meta_cmv_total numeric NOT NULL
);

CREATE TABLE public.fin_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  acao text NOT NULL,
  entidade text NOT NULL,
  entidade_id uuid NOT NULL,
  user_id uuid,
  company_id uuid NOT NULL,
  antes jsonb,
  depois jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid,text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_permission(uuid,text[]) TO authenticated, service_role;

\ir ../../migrations/20260825212335_align_dashboard_cash_basis.sql
\ir ../../migrations/20260825212350_get_fin_presentation_socios.sql
\ir ../../migrations/20260825212536_restrict_dashboard_rpc_execution.sql
\ir ../../migrations/20260825213000_get_fin_presentation_category_metadata.sql
\ir ../../migrations/20260826005756_presentation_detail_drilldown.sql
\ir ../../migrations/20260826021702_presentation_socios_budget_projection.sql
\ir ../../migrations/20260826211500_harden_presentation_dashboard_search_path.sql
\ir ../../migrations/20260828171602_align_presentation_results_with_dashboard_cash_basis.sql

INSERT INTO public.fin_categorias (
  id, company_id, parent_id, nome, tipo, ordem, excluir_dos_totais, grupo, linha_dre
) VALUES
  ('10000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', NULL, 'Receitas', 'receita', 1, false, 'receita', 'Receita'),
  ('10000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000001', 'Vendas', 'receita', 1, false, NULL, 'Receita de vendas'),
  ('10000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', NULL, 'CMV', 'despesa', 2, false, 'cmv', 'CMV'),
  ('10000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', NULL, 'Não operacional', 'receita', 3, true, NULL, 'Fora do resultado'),
  ('20000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', NULL, 'Receita B', 'receita', 1, false, 'receita', 'Receita');

INSERT INTO public.fin_lancamentos (
  id, company_id, tipo, valor, data_competencia, data_pagamento, categoria_id,
  status, origem, conciliado, excluir_dos_relatorios, descricao
) VALUES
  ('30000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'RECEITA', 1200, '2026-03-10', '2026-04-02', '10000000-0000-4000-8000-000000000002', 'REALIZADO', 'manual', false, false, 'Venda março'),
  ('30000000-0000-4000-8000-000000000002', '11111111-1111-4111-8111-111111111111', 'DESPESA', 300, '2026-03-12', '2026-03-12', '10000000-0000-4000-8000-000000000003', 'REALIZADO', 'manual', false, false, 'Insumos'),
  ('30000000-0000-4000-8000-000000000003', '11111111-1111-4111-8111-111111111111', 'RECEITA', 700, '2026-03-15', '2026-03-15', '10000000-0000-4000-8000-000000000002', 'REALIZADO', 'conciliacao', false, false, 'Importação pendente'),
  ('30000000-0000-4000-8000-000000000004', '11111111-1111-4111-8111-111111111111', 'RECEITA', 500, '2026-03-18', '2026-03-18', '10000000-0000-4000-8000-000000000004', 'REALIZADO', 'manual', false, true, 'Não operacional'),
  ('40000000-0000-4000-8000-000000000001', '22222222-2222-4222-8222-222222222222', 'RECEITA', 9999, '2026-03-10', '2026-03-10', '20000000-0000-4000-8000-000000000001', 'REALIZADO', 'manual', false, false, 'Venda empresa B');

INSERT INTO public.fin_contas_pagar VALUES
  ('50000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Boleto aberto', 'Fornecedor', 'APROVADO', '2026-03-20', 250, '10000000-0000-4000-8000-000000000003', false),
  ('50000000-0000-4000-8000-000000000002', '22222222-2222-4222-8222-222222222222', 'Boleto B', 'Fornecedor B', 'APROVADO', '2026-03-20', 8000, '20000000-0000-4000-8000-000000000001', false);
INSERT INTO public.fin_contas_receber VALUES
  ('60000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 'Recebível aberto', 'Cliente', 'ABERTO', '2026-03-22', 400, '10000000-0000-4000-8000-000000000002', false);
INSERT INTO public.fin_contas VALUES
  ('70000000-0000-4000-8000-000000000001', '11111111-1111-4111-8111-111111111111', 100, true);
INSERT INTO public.fin_orcamentos (company_id, categoria_id, mes_ano, valor_orcado, created_by) VALUES
  ('11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000002', '2026-03', 1500, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),
  ('11111111-1111-4111-8111-111111111111', '10000000-0000-4000-8000-000000000003', '2026-03', 400, 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
INSERT INTO public.metas_cmv (company_id, mes_ano, meta_cmv_total) VALUES
  ('11111111-1111-4111-8111-111111111111', '2026-03', 25);

CREATE OR REPLACE FUNCTION public.run_presentation_financial_ephemeral_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $test$
DECLARE
  v_payload jsonb;
  v_budget_updated_at timestamptz;
  v_count integer;
BEGIN
  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('test.permissions', 'on', false);

  v_payload := public.get_fin_presentation_socios(
    DATE '2026-03-01', DATE '2026-04-01', DATE '2026-02-01', DATE '2026-03-01',
    DATE '2025-03-01', DATE '2025-04-01', 'month', 10
  );
  IF (v_payload#>>'{current,metrics,managerialResult,revenue}')::numeric <> 0
     OR (v_payload#>>'{current,metrics,managerialResult,expense}')::numeric <> 300 THEN
    RAISE EXCEPTION 'TEST_FAILED: presentation must match dashboard cash-basis totals';
  END IF;
  IF (v_payload#>>'{current,metrics,openItems,accountsPayableOpen,amount}')::numeric <> 250 THEN
    RAISE EXCEPTION 'TEST_FAILED: open payable separation';
  END IF;

  v_payload := public.get_fin_presentation_category_metadata();
  IF v_payload#>>'{10000000-0000-4000-8000-000000000003,group}' <> 'cmv'
     OR v_payload ? '20000000-0000-4000-8000-000000000001' THEN
    RAISE EXCEPTION 'TEST_FAILED: category metadata tenant isolation';
  END IF;

  v_payload := public.get_fin_presentation_detail_rows(
    DATE '2026-03-01', DATE '2026-04-01', 'ledger', 'RECEITA', NULL, NULL, 1, 25
  );
  IF jsonb_array_length(v_payload->'items') <> 0 THEN
    RAISE EXCEPTION 'TEST_FAILED: detail rows must follow dashboard cash period';
  END IF;
  v_payload := public.get_fin_presentation_detail_rows(
    DATE '2026-04-01', DATE '2026-05-01', 'ledger', 'RECEITA', NULL, NULL, 1, 25
  );
  IF jsonb_array_length(v_payload->'items') <> 1
     OR v_payload#>>'{items,0,id}' <> '30000000-0000-4000-8000-000000000001'
     OR v_payload#>>'{items,0,effectiveDate}' <> '2026-04-02' THEN
    RAISE EXCEPTION 'TEST_FAILED: detail rows effective date';
  END IF;
  v_payload := public.get_fin_presentation_detail_series(
    DATE '2026-03-01', DATE '2026-05-01', 'month', 'RECEITA', NULL, NULL
  );
  IF (v_payload#>>'{0,amount}')::numeric <> 0
     OR (v_payload#>>'{1,amount}')::numeric <> 1200 THEN
    RAISE EXCEPTION 'TEST_FAILED: detail series must follow dashboard cash period';
  END IF;
  BEGIN
    PERFORM public.get_fin_presentation_detail_rows(
      DATE '2026-03-01', DATE '2026-04-01', 'ledger', NULL,
      '20000000-0000-4000-8000-000000000001', NULL, 1, 25
    );
    RAISE EXCEPTION 'TEST_FAILED: cross tenant category accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  v_payload := public.get_fin_presentation_plan(
    DATE '2026-03-01', DATE '2026-04-01', 'month', NULL, NULL, NULL, 1, 25
  );
  IF (v_payload#>>'{actual,revenue}')::numeric <> 1200
     OR (v_payload#>>'{actual,expense}')::numeric <> 300
     OR (v_payload#>>'{budget,revenue}')::numeric <> 1500
     OR (v_payload#>>'{budget,expense}')::numeric <> 400
     OR (v_payload#>>'{budget,cmvTargetPercent}')::numeric <> 25 THEN
    RAISE EXCEPTION 'TEST_FAILED: presentation plan values';
  END IF;

  SELECT budget.updated_at INTO v_budget_updated_at
  FROM public.fin_orcamentos budget
  WHERE budget.company_id = '11111111-1111-4111-8111-111111111111'
    AND budget.categoria_id = '10000000-0000-4000-8000-000000000003';
  PERFORM public._guarded_upsert_orcamento(
    '10000000-0000-4000-8000-000000000003', '2026-03', 450, v_budget_updated_at
  );
  BEGIN
    PERFORM public._guarded_upsert_orcamento(
      '10000000-0000-4000-8000-000000000003', '2026-03', 500, v_budget_updated_at
    );
    RAISE EXCEPTION 'TEST_FAILED: stale budget update accepted';
  EXCEPTION WHEN serialization_failure THEN NULL;
  END;

  v_payload := public.get_fin_dashboard_summary(DATE '2026-03-01', DATE '2026-04-01');
  IF (v_payload->>'receita')::numeric <> 0 OR (v_payload->>'despesa')::numeric <> 300 THEN
    RAISE EXCEPTION 'TEST_FAILED: dashboard cash basis';
  END IF;
  SELECT count(*) INTO v_count
  FROM pg_catalog.pg_proc function_config
  JOIN pg_catalog.pg_namespace function_schema ON function_schema.oid = function_config.pronamespace
  WHERE function_schema.nspname = 'public'
    AND function_config.proname IN ('get_fin_dashboard_summary', 'get_fin_dashboard_charts')
    AND 'search_path=""' = ANY(function_config.proconfig);
  IF v_count <> 2 THEN RAISE EXCEPTION 'TEST_FAILED: dashboard search_path hardening'; END IF;

  PERFORM set_config('test.company_id', '22222222-2222-4222-8222-222222222222', false);
  v_payload := public.get_fin_presentation_socios(
    DATE '2026-03-01', DATE '2026-04-01', DATE '2026-02-01', DATE '2026-03-01',
    DATE '2025-03-01', DATE '2025-04-01', 'month', 10
  );
  IF (v_payload#>>'{current,metrics,managerialResult,revenue}')::numeric <> 9999 THEN
    RAISE EXCEPTION 'TEST_FAILED: company B totals';
  END IF;
END;
$test$;

GRANT EXECUTE ON FUNCTION public.run_presentation_financial_ephemeral_tests() TO authenticated;
SET ROLE authenticated;
SELECT public.run_presentation_financial_ephemeral_tests();
RESET ROLE;

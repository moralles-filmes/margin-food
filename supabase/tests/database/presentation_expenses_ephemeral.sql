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

CREATE FUNCTION public.has_any_permission(p_user_id uuid, p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $$
  SELECT p_user_id = auth.uid()
    AND COALESCE(current_setting('test.permissions', true), 'on') = 'on'
    AND p_keys && ARRAY['financeiro:fluxo:view', 'financeiro:relatorios:view']
$$;

CREATE TABLE public.fin_contas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  saldo_inicial numeric NOT NULL DEFAULT 0,
  ativo boolean NOT NULL DEFAULT true
);

CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY,
  nome text NOT NULL,
  codigo text,
  tipo text NOT NULL,
  parent_id uuid,
  ordem integer,
  ativo boolean NOT NULL DEFAULT true,
  grupo text,
  linha_dre text,
  centro_custo_padrao_id uuid,
  system_key text,
  excluir_dos_totais boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now(),
  company_id uuid NOT NULL
);

CREATE TABLE public.fin_lancamentos (
  id uuid PRIMARY KEY,
  tipo text NOT NULL,
  valor numeric NOT NULL,
  data_competencia date NOT NULL,
  data_pagamento date,
  categoria_id uuid,
  status text NOT NULL,
  descricao text,
  conciliado boolean,
  conciliado_em timestamptz,
  company_id uuid NOT NULL,
  origem text NOT NULL DEFAULT 'manual',
  excluir_dos_relatorios boolean NOT NULL DEFAULT false
);

CREATE TABLE public.fin_lancamento_rateios (
  id uuid PRIMARY KEY,
  lancamento_id uuid NOT NULL,
  categoria_id uuid,
  valor numeric NOT NULL,
  company_id uuid NOT NULL
);

GRANT USAGE ON SCHEMA public, auth TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION auth.uid() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.assert_tenant() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_any_permission(uuid, text[]) TO authenticated, service_role;

-- Snapshot literal da definição efetiva remota antes da Fase 3. A comparação
-- automatizada contra esta função prova que a refatoração do DFC não altera o
-- payload em nenhum dos períodos exercitados.
CREATE FUNCTION public.get_fin_dfc_summary_before_phase3(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_saldo_inicial numeric;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();
  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:fluxo:view', 'financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial
  FROM fin_contas WHERE company_id = v_company_id AND ativo = true;
  v_saldo_inicial := v_saldo_inicial + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE -valor END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_inicio
  ), 0);

  WITH effective_values AS (
    SELECT r.categoria_id, r.valor, l.tipo
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND r.company_id = v_company_id
    UNION ALL
    SELECT l.categoria_id, l.valor, l.tipo
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo != 'TRANSFERENCIA'
      AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
      AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) BETWEEN p_inicio AND p_fim
      AND NOT EXISTS (SELECT 1 FROM fin_lancamento_rateios r WHERE r.lancamento_id = l.id AND r.company_id = v_company_id)
  ), por_categoria AS (
    SELECT CASE
      WHEN categoria_id IS NOT NULL THEN categoria_id::text
      WHEN tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'
      ELSE '00000000-0000-0000-0000-000000000102'
    END cat_id, SUM(valor) total
    FROM effective_values GROUP BY 1
  ), categorias_resultado AS (
    SELECT c.id, c.nome, c.codigo, c.tipo, c.parent_id, c.ordem, c.ativo,
      c.grupo, c.linha_dre, c.centro_custo_padrao_id, c.system_key,
      c.excluir_dos_totais, c.updated_at
    FROM fin_categorias c WHERE c.company_id = v_company_id AND c.ativo = true
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000101'::uuid, 'Sem categoria — Receitas', 'S/C-R',
      'receita', NULL::uuid, 9980, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000101')
    UNION ALL
    SELECT '00000000-0000-0000-0000-000000000102'::uuid, 'Sem categoria — Despesas', 'S/C-D',
      'despesa', NULL::uuid, 9981, true, NULL, NULL, NULL::uuid, NULL, false, now()
    WHERE EXISTS (SELECT 1 FROM por_categoria WHERE cat_id = '00000000-0000-0000-0000-000000000102')
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_inicial,
    'categorias', COALESCE((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.ordem, c.codigo) FROM categorias_resultado c), '[]'::jsonb),
    'valores_por_categoria', COALESCE((SELECT jsonb_object_agg(cat_id, total) FROM por_categoria), '{}'::jsonb)
  ) INTO v_result;
  RETURN v_result;
END;
$function$;

\ir ../../migrations/20260828030805_presentation_expenses.sql

INSERT INTO public.fin_contas (company_id, saldo_inicial) VALUES
  ('11111111-1111-4111-8111-111111111111', 1000),
  ('22222222-2222-4222-8222-222222222222', 500);

INSERT INTO public.fin_categorias (
  id, nome, codigo, tipo, parent_id, ordem, excluir_dos_totais, company_id
) VALUES
  ('a0000000-0000-4000-8000-000000000001', 'Despesas operacionais', 'D', 'despesa', NULL, 10, false, '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000002', 'Insumos', 'D.01', 'despesa', 'a0000000-0000-4000-8000-000000000001', 20, false, '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000003', 'Despesas não operacionais', 'D.NO', 'despesa', NULL, 30, true, '11111111-1111-4111-8111-111111111111'),
  ('a0000000-0000-4000-8000-000000000004', 'Receitas', 'R', 'receita', NULL, 40, false, '11111111-1111-4111-8111-111111111111'),
  ('b0000000-0000-4000-8000-000000000001', 'Despesa tenant B', 'D', 'despesa', NULL, 10, false, '22222222-2222-4222-8222-222222222222');

INSERT INTO public.fin_lancamentos (
  id, tipo, valor, data_competencia, data_pagamento, categoria_id, status,
  descricao, conciliado, conciliado_em, company_id, origem
) VALUES
  -- fallback por data_competencia
  ('10000000-0000-4000-8000-000000000001', 'DESPESA', 100, '2025-11-10', NULL, 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Novembro', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  -- data_pagamento prevalece sobre competência
  ('10000000-0000-4000-8000-000000000002', 'DESPESA', 200, '2025-10-20', '2025-12-12', 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Dezembro pago', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  -- conciliado_em prevalece quando não há data_pagamento
  ('10000000-0000-4000-8000-000000000003', 'DESPESA', 300, '2025-12-15', NULL, 'a0000000-0000-4000-8000-000000000002', 'CONCILIADO', 'Janeiro conciliado', true, '2026-01-03 10:00:00+00', '11111111-1111-4111-8111-111111111111', 'conciliacao'),
  -- cabeçalho de R$ 1.000 deve ser ignorado porque há rateio 400 + 600
  ('10000000-0000-4000-8000-000000000004', 'DESPESA', 1000, '2026-01-05', '2026-01-05', 'a0000000-0000-4000-8000-000000000001', 'REALIZADO', 'Despesa rateada', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('10000000-0000-4000-8000-000000000005', 'DESPESA', 50, '2026-01-07', NULL, NULL, 'REALIZADO', 'Sem categoria', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  -- exclusões canônicas
  ('10000000-0000-4000-8000-000000000006', 'DESPESA', 999, '2026-01-08', NULL, 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Conciliação pendente', false, NULL, '11111111-1111-4111-8111-111111111111', 'conciliacao'),
  ('10000000-0000-4000-8000-000000000007', 'TRANSFERENCIA', 888, '2026-01-09', NULL, NULL, 'REALIZADO', 'Transferência', true, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('10000000-0000-4000-8000-000000000008', 'DESPESA', 777, '2026-01-10', NULL, 'a0000000-0000-4000-8000-000000000002', 'PENDENTE', 'Pendente', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('10000000-0000-4000-8000-000000000009', 'RECEITA', 500, '2026-01-11', NULL, 'a0000000-0000-4000-8000-000000000004', 'REALIZADO', 'Receita', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  -- zero real em fevereiro e valor em março para testar base zero
  ('10000000-0000-4000-8000-000000000010', 'DESPESA', 0, '2026-02-02', NULL, 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Despesa zero', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('10000000-0000-4000-8000-000000000011', 'DESPESA', 50, '2026-03-02', NULL, 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Março', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('10000000-0000-4000-8000-000000000012', 'DESPESA', 80, '2026-06-02', NULL, 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Junho', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('10000000-0000-4000-8000-000000000013', 'DESPESA', 25, '2024-05-02', NULL, 'a0000000-0000-4000-8000-000000000002', 'REALIZADO', 'Histórico 2024', false, NULL, '11111111-1111-4111-8111-111111111111', 'manual'),
  ('20000000-0000-4000-8000-000000000001', 'DESPESA', 9999, '2026-01-04', NULL, 'b0000000-0000-4000-8000-000000000001', 'REALIZADO', 'Tenant B', false, NULL, '22222222-2222-4222-8222-222222222222', 'manual');

INSERT INTO public.fin_lancamento_rateios (
  id, lancamento_id, categoria_id, valor, company_id
) VALUES
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000002', 400, '11111111-1111-4111-8111-111111111111'),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000004', 'a0000000-0000-4000-8000-000000000003', 600, '11111111-1111-4111-8111-111111111111');

DO $privileges$
BEGIN
  IF has_function_privilege('anon', 'public.get_fin_presentation_expenses(text,integer[])', 'EXECUTE')
     OR has_function_privilege('anon', 'public.get_fin_presentation_expense_details(text,uuid,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: anon can execute presentation expenses';
  END IF;
  IF NOT has_function_privilege('authenticated', 'public.get_fin_presentation_expenses(text,integer[])', 'EXECUTE')
     OR NOT has_function_privilege('authenticated', 'public.get_fin_presentation_expense_details(text,uuid,jsonb,integer)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: authenticated cannot execute presentation expenses';
  END IF;
  IF has_function_privilege('authenticated', 'public._fin_dfc_effective_allocations(uuid,date,date)', 'EXECUTE')
     OR has_function_privilege('anon', 'public._fin_dfc_effective_allocations(uuid,date,date)', 'EXECUTE')
     OR has_function_privilege('service_role', 'public._fin_dfc_effective_allocations(uuid,date,date)', 'EXECUTE') THEN
    RAISE EXCEPTION 'TEST_FAILED: internal DFC helper is executable by a Data API role';
  END IF;
END;
$privileges$;

CREATE FUNCTION public.run_presentation_expenses_ephemeral_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $test$
DECLARE
  v_payload jsonb;
  v_dfc jsonb;
  v_tree jsonb;
  v_history_months text[];
  v_page jsonb;
  v_cursor jsonb := NULL;
  v_page_total numeric;
  v_detail_total numeric := 0;
  v_detail_ids uuid[] := ARRAY[]::uuid[];
  v_page_ids uuid[];
  v_loop_count integer := 0;
BEGIN
  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('test.permissions', 'on', false);

  -- Equivalência exata do DFC antes/depois em períodos com rateio, virada de
  -- ano, data de pagamento, conciliação e mês vazio.
  IF public.get_fin_dfc_summary_before_phase3('2025-11-01', '2026-01-31')
     IS DISTINCT FROM public.get_fin_dfc_summary('2025-11-01', '2026-01-31')
     OR public.get_fin_dfc_summary_before_phase3('2026-01-01', '2026-01-31')
       IS DISTINCT FROM public.get_fin_dfc_summary('2026-01-01', '2026-01-31')
     OR public.get_fin_dfc_summary_before_phase3('2026-02-01', '2026-03-31')
       IS DISTINCT FROM public.get_fin_dfc_summary('2026-02-01', '2026-03-31') THEN
    RAISE EXCEPTION 'TEST_FAILED: DFC payload changed after shared-core refactor';
  END IF;

  v_payload := public.get_fin_presentation_expenses('2026-01', ARRAY[2026, 2024, 2025]);
  IF v_payload->>'contractVersion' <> '1.0'
     OR v_payload#>>'{source,report}' <> 'DFC'
     OR v_payload#>>'{source,regime}' <> 'caixa'
     OR v_payload->>'selectedMonth' <> '2026-01'
     OR v_payload->>'previousMonth' <> '2025-12' THEN
    RAISE EXCEPTION 'TEST_FAILED: versioned DFC source or year boundary';
  END IF;
  IF (v_payload#>>'{current,total}')::numeric <> 1350
     OR (v_payload#>>'{current,quantity}')::integer <> 3
     OR (v_payload#>>'{previous,total}')::numeric <> 200
     OR (v_payload#>>'{delta,absolute,value}')::numeric <> 1150
     OR (v_payload#>>'{delta,percentage,value}')::numeric <> 575
     OR v_payload#>>'{delta,meaning}' <> 'increase'
     OR v_payload#>>'{delta,favorability}' <> 'unfavorable' THEN
    RAISE EXCEPTION 'TEST_FAILED: current previous delta or inverse expense semantics';
  END IF;
  IF v_payload::text ~ '(Infinity|NaN)' THEN
    RAISE EXCEPTION 'TEST_FAILED: non-finite expense number';
  END IF;

  IF jsonb_array_length(v_payload->'rollingThreeMonths') <> 3
     OR v_payload#>>'{rollingThreeMonths,0,yearMonth}' <> '2025-11'
     OR (v_payload#>>'{rollingThreeMonths,0,total}')::numeric <> 100
     OR v_payload#>>'{rollingThreeMonths,1,yearMonth}' <> '2025-12'
     OR (v_payload#>>'{rollingThreeMonths,1,total}')::numeric <> 200
     OR v_payload#>>'{rollingThreeMonths,2,yearMonth}' <> '2026-01'
     OR (v_payload#>>'{rollingThreeMonths,2,total}')::numeric <> 1350 THEN
    RAISE EXCEPTION 'TEST_FAILED: rolling three months across year boundary';
  END IF;

  IF v_payload->'requestedYears' <> '[2024, 2025, 2026]'::jsonb
     OR jsonb_array_length(v_payload->'history') <> 36 THEN
    RAISE EXCEPTION 'TEST_FAILED: three sorted expense history years';
  END IF;
  SELECT array_agg(point->>'yearMonth' ORDER BY ordinality)
  INTO v_history_months
  FROM jsonb_array_elements(v_payload->'history') WITH ORDINALITY AS item(point, ordinality);
  IF v_history_months[1] <> '2024-01' OR v_history_months[36] <> '2026-12' THEN
    RAISE EXCEPTION 'TEST_FAILED: deterministic expense history order';
  END IF;
  IF jsonb_array_length(public.get_fin_presentation_expenses('2026-01', ARRAY[2026])->'history') <> 12
     OR jsonb_array_length(public.get_fin_presentation_expenses('2026-01', ARRAY[2025, 2026])->'history') <> 24 THEN
    RAISE EXCEPTION 'TEST_FAILED: one or two expense history years';
  END IF;
  BEGIN
    PERFORM public.get_fin_presentation_expenses('2026-01', ARRAY[2023, 2024, 2025, 2026]);
    RAISE EXCEPTION 'TEST_FAILED: fourth expense history year accepted';
  EXCEPTION WHEN invalid_parameter_value THEN NULL;
  END;

  v_tree := v_payload->'tree';
  IF jsonb_array_length(v_tree) <> 4
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_tree) AS node
       WHERE node->>'name' = 'Despesas operacionais'
         AND (node->>'directAmount')::numeric = 0
         AND (node->>'amount')::numeric = 700
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_tree) AS node
       WHERE node->>'name' = 'Insumos'
         AND (node->>'directAmount')::numeric = 700
         AND (node->>'amount')::numeric = 700
         AND node->>'parentId' = 'a0000000-0000-4000-8000-000000000001'
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_tree) AS node
       WHERE node->>'name' = 'Despesas não operacionais'
         AND node->>'operationalClass' = 'non-operational'
         AND (node->>'amount')::numeric = 600
     )
     OR NOT EXISTS (
       SELECT 1 FROM jsonb_array_elements(v_tree) AS node
       WHERE node->>'name' = 'Sem categoria — Despesas'
         AND node->>'categoryId' IS NULL
         AND (node->>'amount')::numeric = 50
     ) THEN
    RAISE EXCEPTION 'TEST_FAILED: expense hierarchy, allocation precedence, uncategorized or operational class';
  END IF;

  v_dfc := public.get_fin_dfc_summary('2026-01-01', '2026-01-31');
  IF (v_dfc#>>'{valores_por_categoria,a0000000-0000-4000-8000-000000000002}')::numeric <> 700
     OR (v_dfc#>>'{valores_por_categoria,a0000000-0000-4000-8000-000000000003}')::numeric <> 600
     OR (v_dfc#>>'{valores_por_categoria,00000000-0000-0000-0000-000000000102}')::numeric <> 50
     OR v_dfc#>>'{valores_por_categoria,a0000000-0000-4000-8000-000000000001}' IS NOT NULL THEN
    RAISE EXCEPTION 'TEST_FAILED: category totals differ from DFC or header survived rateio';
  END IF;

  v_payload := public.get_fin_presentation_expenses('2026-03', ARRAY[2026]);
  IF v_payload#>>'{delta,percentage,state}' <> 'unavailable'
     OR v_payload#>>'{delta,percentage,reason}' <> 'zero-baseline'
     OR (v_payload#>>'{delta,absolute,value}')::numeric <> 50 THEN
    RAISE EXCEPTION 'TEST_FAILED: explicit zero expense baseline';
  END IF;
  v_payload := public.get_fin_presentation_expenses('2026-06', ARRAY[2026]);
  IF v_payload#>>'{delta,percentage,reason}' <> 'previous-period-absent' THEN
    RAISE EXCEPTION 'TEST_FAILED: absent previous expense month';
  END IF;

  -- O cursor percorre todas as alocações uma única vez. A soma das páginas é
  -- exatamente o agregado do mês, inclusive rateios e sem categoria.
  LOOP
    v_page := public.get_fin_presentation_expense_details('2026-01', NULL, v_cursor, 2);
    SELECT COALESCE(sum((item->>'amount')::numeric), 0),
           COALESCE(array_agg((item->>'allocationId')::uuid), ARRAY[]::uuid[])
    INTO v_page_total, v_page_ids
    FROM jsonb_array_elements(v_page->'items') AS item;
    v_detail_total := v_detail_total + v_page_total;
    IF v_detail_ids && v_page_ids THEN
      RAISE EXCEPTION 'TEST_FAILED: deterministic cursor repeated an allocation';
    END IF;
    v_detail_ids := v_detail_ids || v_page_ids;
    v_loop_count := v_loop_count + 1;
    EXIT WHEN NOT (v_page->>'hasMore')::boolean;
    v_cursor := v_page->'nextCursor';
    IF v_cursor->>'state' <> 'available' OR v_loop_count > 10 THEN
      RAISE EXCEPTION 'TEST_FAILED: invalid or non-terminating expense cursor';
    END IF;
  END LOOP;
  IF v_detail_total <> 1350
     OR pg_catalog.cardinality(v_detail_ids) <> 4
     OR v_page#>>'{nextCursor,state}' <> 'end' THEN
    RAISE EXCEPTION 'TEST_FAILED: paginated drill-down does not sum to aggregate';
  END IF;

  v_page := public.get_fin_presentation_expense_details(
    '2026-01',
    'a0000000-0000-4000-8000-000000000001',
    NULL,
    100
  );
  IF (SELECT sum((item->>'amount')::numeric) FROM jsonb_array_elements(v_page->'items') AS item) <> 700
     OR jsonb_array_length(v_page->'items') <> 2 THEN
    RAISE EXCEPTION 'TEST_FAILED: parent category drill-down does not include descendants';
  END IF;

  BEGIN
    PERFORM public.get_fin_presentation_expense_details(
      '2026-01',
      'b0000000-0000-4000-8000-000000000001',
      NULL,
      25
    );
    RAISE EXCEPTION 'TEST_FAILED: category from another tenant accepted';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  PERFORM set_config('test.permissions', 'off', false);
  BEGIN
    PERFORM public.get_fin_presentation_expenses('2026-01', ARRAY[2026]);
    RAISE EXCEPTION 'TEST_FAILED: expense permission denied was ignored';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  PERFORM set_config('test.permissions', 'on', false);

  PERFORM set_config('test.company_id', '22222222-2222-4222-8222-222222222222', false);
  v_payload := public.get_fin_presentation_expenses('2026-01', ARRAY[2026]);
  IF (v_payload#>>'{current,total}')::numeric <> 9999
     OR (v_payload#>>'{current,quantity}')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: tenant B total or isolation';
  END IF;

  PERFORM set_config('test.company_id', '33333333-3333-4333-8333-333333333333', false);
  v_payload := public.get_fin_presentation_expenses('2026-01', ARRAY[2026]);
  IF v_payload->>'availability' <> 'unavailable'
     OR v_payload#>>'{coverage,state}' <> 'no-history'
     OR v_payload#>>'{current,coverage,state}' <> 'no-history' THEN
    RAISE EXCEPTION 'TEST_FAILED: tenant without DFC expense coverage';
  END IF;
END;
$test$;

GRANT EXECUTE ON FUNCTION public.run_presentation_expenses_ephemeral_tests() TO authenticated;
SET ROLE authenticated;
SELECT public.run_presentation_expenses_ephemeral_tests();
RESET ROLE;

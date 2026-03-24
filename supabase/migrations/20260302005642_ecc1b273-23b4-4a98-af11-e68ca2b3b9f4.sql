-- RBAC Lint Quick Mode: fast checks for Admin Panel (<10s)
CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report_quick(p_actor_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  _result jsonb := '{}'::jsonb;
  _fails int := 0;
  _section jsonb;
  _critical_tables text[] := ARRAY[
    'produtos','suppliers','movimentacoes_estoque','purchase_orders',
    'purchase_order_items','salmon_entries','fin_lancamentos'
  ];
BEGIN
  -- Permission guard
  IF NOT COALESCE(public.has_permission(p_actor_user_id, 'system:global:manage'), false) THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;

  -- 1) FORCE RLS on critical tables
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', c.relname,
    'rls_enabled', c.relrowsecurity,
    'force_rls', c.relforcerowsecurity
  ) ORDER BY c.relname), '[]'::jsonb) INTO _section
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r'
    AND c.relname = ANY(_critical_tables);

  -- Count failures: missing RLS or missing FORCE
  IF EXISTS (
    SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public' AND c.relkind = 'r'
      AND c.relname = ANY(_critical_tables)
      AND (NOT c.relrowsecurity OR NOT c.relforcerowsecurity)
  ) THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('force_rls_critical', _section);

  -- 2) Dangerous policies on critical tables (qual=true or missing company_id)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', p.tablename,
    'policy', p.policyname,
    'cmd', p.cmd,
    'qual_preview', left(p.qual::text, 120)
  ) ORDER BY p.tablename, p.policyname), '[]'::jsonb) INTO _section
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = ANY(_critical_tables)
    AND (
      p.qual::text = 'true'
      OR (p.cmd = 'SELECT' AND p.qual::text NOT ILIKE '%company_id%')
    );

  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('dangerous_policies', _section);

  -- 3) has_permission single-arg calls in policies of critical tables
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'table', p.tablename,
    'policy', p.policyname,
    'fragment', substring(p.qual::text from 'has_permission\([^,)]+\)')
  ) ORDER BY p.tablename), '[]'::jsonb) INTO _section
  FROM pg_policies p
  WHERE p.schemaname = 'public'
    AND p.tablename = ANY(_critical_tables)
    AND (
      p.qual::text ~ 'has_permission\([^,)]+\)'
      OR COALESCE(p.with_check::text, '') ~ 'has_permission\([^,)]+\)'
    );

  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('has_permission_single_arg', _section);

  -- 4) Extensions in public schema
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'extension', e.extname,
    'status', CASE WHEN e.extname = 'pg_net' THEN 'WARN' ELSE 'OK' END
  )), '[]'::jsonb) INTO _section
  FROM pg_extension e
  JOIN pg_namespace n ON n.oid = e.extnamespace
  WHERE n.nspname = 'public';

  _result := _result || jsonb_build_object('extensions_in_public', _section);

  -- Build final
  _result := jsonb_build_object(
    'status', CASE WHEN _fails = 0 THEN 'PASS' ELSE 'FAIL' END,
    'fail_count', _fails,
    'mode', 'quick'
  ) || _result;

  RETURN _result;
END;
$$;
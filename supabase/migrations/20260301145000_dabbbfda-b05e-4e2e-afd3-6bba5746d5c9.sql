
CREATE OR REPLACE FUNCTION public.rbac_sql_lint_report()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result jsonb := '{}'::jsonb;
  _fails int := 0;
  _section jsonb;

  _global_allowlist text[] := ARRAY[
    'companies','permissions','role_permissions','user_roles','profiles',
    'rbac_legacy_usage','dashboard_cache','schema_migrations',
    'spatial_ref_sys','geography_columns','geometry_columns',
    'audit_logs','audit_log','integration_logs'
  ];

  _force_rls_exceptions text[] := ARRAY[
    'profiles','companies','permissions','role_permissions','user_roles',
    'rbac_legacy_usage','dashboard_cache','audit_logs','audit_log','integration_logs'
  ];

  _rls_exceptions text[] := ARRAY[
    'spatial_ref_sys','geography_columns','geometry_columns',
    'dashboard_cache','schema_migrations'
  ];
BEGIN
  IF NOT has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden: requires system:global:manage';
  END IF;

  -- 1) Tables without RLS enabled
  SELECT jsonb_agg(c.relname ORDER BY c.relname)
  INTO _section
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND NOT c.relrowsecurity
    AND c.relname NOT LIKE 'pg_%'
    AND c.relname NOT LIKE '_pg_%'
    AND c.relname != ALL(_rls_exceptions);

  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('tables_without_rls', _section);

  -- 2) Tenantized tables without FORCE RLS
  SELECT jsonb_agg(c.relname ORDER BY c.relname)
  INTO _section
  FROM pg_class c
  JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public'
    AND c.relkind = 'r'
    AND c.relrowsecurity = true
    AND NOT c.relforcerowsecurity
    AND c.relname != ALL(_force_rls_exceptions)
    AND EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = c.relname
        AND col.column_name = 'company_id'
    );

  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('tables_without_force_rls', _section);

  -- 3) Business tables missing company_id
  SELECT jsonb_agg(t.table_name ORDER BY t.table_name)
  INTO _section
  FROM information_schema.tables t
  WHERE t.table_schema = 'public'
    AND t.table_type = 'BASE TABLE'
    AND t.table_name != ALL(_global_allowlist)
    AND t.table_name NOT LIKE 'pg_%'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.columns col
      WHERE col.table_schema = 'public'
        AND col.table_name = t.table_name
        AND col.column_name = 'company_id'
    );

  _section := COALESCE(_section, '[]'::jsonb);
  _result := _result || jsonb_build_object('business_tables_missing_company_id', _section);

  -- 4) Tables with company_id but no FK to companies
  SELECT jsonb_agg(col.table_name ORDER BY col.table_name)
  INTO _section
  FROM information_schema.columns col
  WHERE col.table_schema = 'public'
    AND col.column_name = 'company_id'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints tc
      JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name = col.table_name
        AND tc.constraint_type = 'FOREIGN KEY'
        AND ccu.table_name = 'companies'
        AND EXISTS (
          SELECT 1 FROM information_schema.key_column_usage kcu
          WHERE kcu.constraint_name = tc.constraint_name
            AND kcu.column_name = 'company_id'
        )
    );

  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('company_id_without_fk', _section);

  -- 5) SECURITY DEFINER functions without has_permission (heuristic)
  SELECT jsonb_agg(jsonb_build_object('name', p.proname, 'schema', n.nspname) ORDER BY p.proname)
  INTO _section
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND p.prosrc NOT LIKE '%has_permission%'
    AND p.proname NOT IN (
      'get_current_company_id','assert_tenant','has_permission','has_role',
      'get_default_company_id','get_effective_permissions',
      'handle_new_user','moddatetime'
    );

  _section := COALESCE(_section, '[]'::jsonb);
  _result := _result || jsonb_build_object('security_definer_without_guard', _section);

  -- 6) has_permission single-arg calls in functions and policies
  SELECT jsonb_agg(item ORDER BY item->>'type', item->>'name')
  INTO _section
  FROM (
    -- Functions: scan pg_get_functiondef for has_permission('<literal>')
    SELECT jsonb_build_object(
      'type', 'function',
      'schema', n.nspname,
      'name', p.proname,
      'signature', p.oid::regprocedure::text
    ) AS item
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND pg_get_functiondef(p.oid) ~ 'has_permission\s*\(\s*''[^'']*''\s*\)'

    UNION ALL

    -- Policies: scan qual and with_check for has_permission('<literal>')
    SELECT jsonb_build_object(
      'type', 'policy',
      'schema', schemaname,
      'name', policyname,
      'table', tablename
    ) AS item
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (
        qual ~ 'has_permission\s*\(\s*''[^'']*''\s*\)'
        OR with_check ~ 'has_permission\s*\(\s*''[^'']*''\s*\)'
      )
  ) sub;

  _section := COALESCE(_section, '[]'::jsonb);
  IF jsonb_array_length(_section) > 0 THEN _fails := _fails + 1; END IF;
  _result := _result || jsonb_build_object('has_permission_one_arg_calls', jsonb_build_object(
    'count', jsonb_array_length(_section),
    'items', _section
  ));

  -- Final status
  _result := jsonb_build_object(
    'status', CASE WHEN _fails = 0 THEN 'PASS' ELSE 'FAIL' END,
    'fail_count', _fails,
    'timestamp', now()
  ) || _result;

  RETURN _result;
END;
$function$;

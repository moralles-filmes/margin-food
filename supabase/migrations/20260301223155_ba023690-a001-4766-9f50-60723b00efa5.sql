
CREATE OR REPLACE FUNCTION public.admin_checkup_suite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor uuid;
  v_company uuid;
  v_result jsonb;
  v_sections jsonb := '{}'::jsonb;
  v_status text;
  v_details jsonb;
  v_profile_company uuid;
  v_current_company uuid;
  -- rls vars
  v_tables text[] := ARRAY['produtos','suppliers','movimentacoes_estoque','purchase_orders','purchase_order_items','salmon_entries','fin_lancamentos'];
  v_tbl text;
  v_rls_items jsonb := '[]'::jsonb;
  v_rls_ok boolean := true;
  v_rel_row boolean;
  v_rel_force boolean;
  -- policy vars
  v_pol_items jsonb := '[]'::jsonb;
  v_pol_ok boolean := true;
  -- estoque vars
  v_mov_count bigint;
  -- report vars
  v_rpc_items jsonb := '[]'::jsonb;
  v_rpc_ok boolean := true;
  v_rpc_err text;
  v_dummy jsonb;
BEGIN
  -- Guard
  v_actor := auth.uid();
  IF NOT public.has_permission(v_actor, 'system:global:manage') THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;
  v_company := public.assert_tenant();

  -- ===== A) tenant_identity =====
  SELECT company_id INTO v_profile_company FROM public.profiles WHERE id = v_actor;
  BEGIN
    SELECT public.get_current_company_id() INTO v_current_company;
  EXCEPTION WHEN OTHERS THEN
    v_current_company := NULL;
  END;

  IF v_profile_company IS NULL OR v_current_company IS NULL OR v_profile_company <> v_current_company THEN
    v_status := 'FAIL';
  ELSE
    v_status := 'PASS';
  END IF;
  v_sections := v_sections || jsonb_build_object('tenant_identity', jsonb_build_object(
    'status', v_status,
    'details', jsonb_build_object(
      'profile_company_id', v_profile_company,
      'get_current_company_id', v_current_company
    )
  ));

  -- ===== B) company_id_integrity =====
  DECLARE
    v_comp_exists boolean;
  BEGIN
    SELECT EXISTS(SELECT 1 FROM public.companies WHERE id = v_company) INTO v_comp_exists;
    IF v_comp_exists THEN
      v_status := 'PASS';
      v_details := jsonb_build_object('note', 'enforced by FK + trg_block_placeholder_company', 'company_exists', true);
    ELSE
      v_status := 'FAIL';
      v_details := jsonb_build_object('note', 'company_id not found in companies table', 'company_exists', false);
    END IF;
    v_sections := v_sections || jsonb_build_object('company_id_integrity', jsonb_build_object('status', v_status, 'details', v_details));
  END;

  -- ===== C) rls_force_rls =====
  FOR v_tbl IN SELECT unnest(v_tables) LOOP
    BEGIN
      SELECT relrowsecurity, relforcerowsecurity
      INTO v_rel_row, v_rel_force
      FROM pg_class
      WHERE relname = v_tbl AND relnamespace = 'public'::regnamespace;

      IF NOT FOUND THEN
        v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'SKIP', 'note', 'table not found');
      ELSIF NOT v_rel_row OR NOT v_rel_force THEN
        v_rls_ok := false;
        v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'FAIL', 'rls_enabled', v_rel_row, 'force_rls', v_rel_force);
      ELSE
        v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'PASS');
      END IF;
    EXCEPTION WHEN OTHERS THEN
      v_rls_items := v_rls_items || jsonb_build_object('table', v_tbl, 'status', 'FAIL', 'error', SQLERRM);
      v_rls_ok := false;
    END;
  END LOOP;
  v_sections := v_sections || jsonb_build_object('rls_force_rls', jsonb_build_object(
    'status', CASE WHEN v_rls_ok THEN 'PASS' ELSE 'FAIL' END,
    'details', jsonb_build_object('tables', v_rls_items)
  ));

  -- ===== D) policy_safety_scan =====
  BEGIN
    SELECT jsonb_agg(jsonb_build_object(
      'table', tablename,
      'policy', policyname,
      'cmd', cmd,
      'qual_preview', LEFT(qual::text, 120)
    ))
    INTO v_details
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = ANY(v_tables)
      AND cmd = 'SELECT'
      AND (qual::text = 'true' OR qual::text NOT ILIKE '%company_id%');

    IF v_details IS NOT NULL AND jsonb_array_length(v_details) > 0 THEN
      v_pol_ok := false;
      v_pol_items := v_details;
    ELSE
      v_pol_items := '[]'::jsonb;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    v_pol_ok := false;
    v_pol_items := jsonb_build_object('error', SQLERRM);
  END;
  v_sections := v_sections || jsonb_build_object('policy_safety_scan', jsonb_build_object(
    'status', CASE WHEN v_pol_ok THEN 'PASS' ELSE 'FAIL' END,
    'details', jsonb_build_object('suspicious_policies', v_pol_items)
  ));

  -- ===== E) estoque_sanity =====
  BEGIN
    SELECT count(*) INTO v_mov_count FROM public.movimentacoes_estoque WHERE company_id = v_company;
    v_details := jsonb_build_object('movimentacoes_count', v_mov_count);
    v_status := 'PASS';
  EXCEPTION WHEN OTHERS THEN
    v_details := jsonb_build_object('error', SQLERRM);
    v_status := 'FAIL';
  END;
  v_sections := v_sections || jsonb_build_object('estoque_sanity', jsonb_build_object('status', v_status, 'details', v_details));

  -- ===== F) relatorios_sanity =====
  -- Try calling report RPCs with small date range
  DECLARE
    v_rpc_names text[] := ARRAY['get_relatorios_kpis','get_relatorios_score','get_relatorios_tendencia','get_relatorios_compras'];
    v_rpc_name text;
  BEGIN
    FOR v_rpc_name IN SELECT unnest(v_rpc_names) LOOP
      BEGIN
        EXECUTE format(
          'SELECT to_jsonb(r) FROM %I($1, $2) r LIMIT 1',
          v_rpc_name
        ) INTO v_dummy
        USING (current_date - 7)::text, current_date::text;
        v_rpc_items := v_rpc_items || jsonb_build_object('rpc', v_rpc_name, 'status', 'PASS');
      EXCEPTION WHEN OTHERS THEN
        v_rpc_items := v_rpc_items || jsonb_build_object('rpc', v_rpc_name, 'status', 'FAIL', 'error', SQLERRM);
        v_rpc_ok := false;
      END;
    END LOOP;
  END;
  v_sections := v_sections || jsonb_build_object('relatorios_sanity', jsonb_build_object(
    'status', CASE WHEN v_rpc_ok THEN 'PASS' ELSE 'FAIL' END,
    'details', jsonb_build_object('rpcs', v_rpc_items)
  ));

  -- ===== G) rbac_sql_lint =====
  v_sections := v_sections || jsonb_build_object('rbac_sql_lint', jsonb_build_object(
    'status', 'SKIPPED',
    'details', jsonb_build_object('reason', 'run via Edge/CI when configured')
  ));

  -- Build final
  v_result := jsonb_build_object(
    'meta', jsonb_build_object(
      'ran_at', now(),
      'company_id', v_company,
      'actor_user_id', v_actor
    ),
    'sections', v_sections
  );

  RETURN v_result;
END;
$$;

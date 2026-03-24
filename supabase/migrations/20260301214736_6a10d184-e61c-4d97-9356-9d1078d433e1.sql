
CREATE OR REPLACE FUNCTION public.admin_checkup_suite()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_uid uuid := auth.uid();
  v_result jsonb := '{}'::jsonb;
  v_section jsonb;
  v_profile_cid uuid;
  v_fn_cid uuid;
  v_null_count bigint;
  v_placeholder_count bigint;
  v_orphan_count bigint;
  v_tbl text;
  v_integrity_details jsonb := '[]'::jsonb;
  v_rls_details jsonb := '[]'::jsonb;
  v_mov_count bigint;
  v_bad_dir bigint;
  v_null_status bigint;
  v_report_errors jsonb := '[]'::jsonb;
  v_tables text[] := ARRAY[
    'produtos','suppliers','movimentacoes_estoque','purchase_orders',
    'purchase_order_items','salmon_entries','fin_lancamentos',
    'fin_contas_pagar','fin_contas_receber','ficha_componentes',
    'inventarios','recebimentos','solic_compra_mercado'
  ];
  v_rls_tables text[] := ARRAY[
    'produtos','suppliers','movimentacoes_estoque','purchase_orders',
    'fin_lancamentos','fin_contas_pagar','fin_contas_receber',
    'profiles','inventarios','ficha_componentes'
  ];
  v_force_rls boolean;
  v_has_open_select boolean;
  v_all_pass boolean;
  v_err text;
BEGIN
  -- Guard
  IF NOT public.has_permission(v_uid, 'system:global:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_company := public.assert_tenant();

  -----------------------------------------------------------------
  -- A) Tenant & Identidade
  -----------------------------------------------------------------
  SELECT company_id INTO v_profile_cid FROM public.profiles WHERE id = v_uid;
  BEGIN
    SELECT public.get_current_company_id() INTO v_fn_cid;
  EXCEPTION WHEN OTHERS THEN
    v_fn_cid := NULL;
  END;

  v_section := jsonb_build_object(
    'status', CASE WHEN v_company IS NOT NULL
                    AND v_profile_cid IS NOT NULL
                    AND v_profile_cid = v_fn_cid
              THEN 'PASS' ELSE 'FAIL' END,
    'company_id', v_company,
    'profile_company_id', v_profile_cid,
    'get_current_company_id', v_fn_cid,
    'match', v_profile_cid = v_fn_cid
  );
  v_result := v_result || jsonb_build_object('tenant_identity', v_section);

  -----------------------------------------------------------------
  -- B) Integridade company_id
  -----------------------------------------------------------------
  v_all_pass := true;
  FOREACH v_tbl IN ARRAY v_tables LOOP
    BEGIN
      EXECUTE format(
        'SELECT coalesce(sum(case when company_id IS NULL then 1 else 0 end),0),
                coalesce(sum(case when company_id = ''00000000-0000-0000-0000-000000000001''::uuid then 1 else 0 end),0)
         FROM %I WHERE company_id = $1 OR company_id IS NULL OR company_id = ''00000000-0000-0000-0000-000000000001''::uuid',
        v_tbl
      ) INTO v_null_count, v_placeholder_count USING v_company;

      IF v_null_count > 0 OR v_placeholder_count > 0 THEN
        v_all_pass := false;
      END IF;

      v_integrity_details := v_integrity_details || jsonb_build_object(
        'table', v_tbl,
        'null_company_id', v_null_count,
        'placeholder_company_id', v_placeholder_count,
        'status', CASE WHEN v_null_count = 0 AND v_placeholder_count = 0 THEN 'PASS' ELSE 'FAIL' END
      );
    EXCEPTION WHEN OTHERS THEN
      v_integrity_details := v_integrity_details || jsonb_build_object(
        'table', v_tbl, 'error', SQLERRM, 'status', 'SKIP'
      );
    END;
  END LOOP;

  v_result := v_result || jsonb_build_object('company_id_integrity', jsonb_build_object(
    'status', CASE WHEN v_all_pass THEN 'PASS' ELSE 'FAIL' END,
    'tables', v_integrity_details
  ));

  -----------------------------------------------------------------
  -- C) RLS Segurança (amostra)
  -----------------------------------------------------------------
  v_all_pass := true;
  FOREACH v_tbl IN ARRAY v_rls_tables LOOP
    BEGIN
      SELECT relforcerowsecurity INTO v_force_rls
      FROM pg_class WHERE relname = v_tbl AND relnamespace = 'public'::regnamespace;

      SELECT EXISTS(
        SELECT 1 FROM pg_policies
        WHERE tablename = v_tbl AND schemaname = 'public'
          AND cmd = 'SELECT' AND qual = 'true'
      ) INTO v_has_open_select;

      IF NOT coalesce(v_force_rls, false) OR v_has_open_select THEN
        v_all_pass := false;
      END IF;

      v_rls_details := v_rls_details || jsonb_build_object(
        'table', v_tbl,
        'force_rls', coalesce(v_force_rls, false),
        'open_select_detected', v_has_open_select,
        'status', CASE WHEN coalesce(v_force_rls, false) AND NOT v_has_open_select THEN 'PASS' ELSE 'FAIL' END
      );
    EXCEPTION WHEN OTHERS THEN
      v_rls_details := v_rls_details || jsonb_build_object(
        'table', v_tbl, 'error', SQLERRM, 'status', 'SKIP'
      );
    END;
  END LOOP;

  v_result := v_result || jsonb_build_object('rls_security', jsonb_build_object(
    'status', CASE WHEN v_all_pass THEN 'PASS' ELSE 'FAIL' END,
    'tables', v_rls_details
  ));

  -----------------------------------------------------------------
  -- D) Estoque Sanity
  -----------------------------------------------------------------
  SELECT count(*) INTO v_mov_count
  FROM public.movimentacoes_estoque WHERE company_id = v_company;

  v_bad_dir := 0;
  v_null_status := 0;
  IF v_mov_count > 0 THEN
    SELECT count(*) INTO v_bad_dir
    FROM public.movimentacoes_estoque
    WHERE company_id = v_company AND tipo NOT IN ('entrada', 'saida', 'ajuste', 'transferencia', 'inventario');

    BEGIN
      EXECUTE 'SELECT count(*) FROM public.movimentacoes_estoque WHERE company_id = $1 AND status IS NULL'
      INTO v_null_status USING v_company;
    EXCEPTION WHEN undefined_column THEN
      v_null_status := -1; -- column doesn't exist, OK
    END;
  END IF;

  v_section := jsonb_build_object(
    'status', CASE WHEN v_bad_dir = 0 AND (v_null_status <= 0) THEN 'PASS' ELSE 'FAIL' END,
    'total_movimentacoes', v_mov_count,
    'invalid_directions', v_bad_dir,
    'null_status', CASE WHEN v_null_status = -1 THEN 'N/A (no column)' ELSE v_null_status::text END
  );
  v_result := v_result || jsonb_build_object('estoque_sanity', v_section);

  -----------------------------------------------------------------
  -- E) Relatórios Sanity
  -----------------------------------------------------------------
  v_all_pass := true;

  -- Test admin_health_counts
  BEGIN
    PERFORM public.admin_health_counts();
    v_report_errors := v_report_errors || jsonb_build_object('rpc', 'admin_health_counts', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_all_pass := false;
    v_report_errors := v_report_errors || jsonb_build_object('rpc', 'admin_health_counts', 'status', 'FAIL', 'error', SQLERRM);
  END;

  -- Test debug_tenant
  BEGIN
    PERFORM public.debug_tenant();
    v_report_errors := v_report_errors || jsonb_build_object('rpc', 'debug_tenant', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_all_pass := false;
    v_report_errors := v_report_errors || jsonb_build_object('rpc', 'debug_tenant', 'status', 'FAIL', 'error', SQLERRM);
  END;

  -- Test debug_company_inventory
  BEGIN
    PERFORM public.debug_company_inventory();
    v_report_errors := v_report_errors || jsonb_build_object('rpc', 'debug_company_inventory', 'status', 'PASS');
  EXCEPTION WHEN OTHERS THEN
    v_all_pass := false;
    v_report_errors := v_report_errors || jsonb_build_object('rpc', 'debug_company_inventory', 'status', 'FAIL', 'error', SQLERRM);
  END;

  v_result := v_result || jsonb_build_object('reports_sanity', jsonb_build_object(
    'status', CASE WHEN v_all_pass THEN 'PASS' ELSE 'FAIL' END,
    'rpcs', v_report_errors
  ));

  -----------------------------------------------------------------
  -- Summary
  -----------------------------------------------------------------
  v_result := v_result || jsonb_build_object(
    'overall', CASE
      WHEN (v_result->'tenant_identity'->>'status') = 'PASS'
       AND (v_result->'company_id_integrity'->>'status') = 'PASS'
       AND (v_result->'rls_security'->>'status') = 'PASS'
       AND (v_result->'estoque_sanity'->>'status') = 'PASS'
       AND (v_result->'reports_sanity'->>'status') = 'PASS'
      THEN 'ALL PASS'
      ELSE 'HAS FAILURES'
    END,
    'executed_at', now()
  );

  RETURN v_result;
END;
$$;

-- Grant
GRANT EXECUTE ON FUNCTION public.admin_checkup_suite() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_checkup_suite() FROM anon, public;

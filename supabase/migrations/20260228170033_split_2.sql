CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_start timestamptz; v_results jsonb := '[]'::jsonb; v_mv text; v_elapsed numeric;
BEGIN
  FOREACH v_mv IN ARRAY ARRAY['mv_fin_dre_mensal','mv_fin_fluxo_caixa_diario','mv_consumo_itens_semana','mv_giro_estoque','mv_pedidos_status_resumo'] LOOP
    v_start := clock_timestamp();
    EXECUTE 'REFRESH MATERIALIZED VIEW ' || v_mv;
    v_elapsed := EXTRACT(EPOCH FROM clock_timestamp() - v_start) * 1000;
    v_results := v_results || jsonb_build_object('view', v_mv, 'ms', round(v_elapsed::numeric, 1));
    IF v_elapsed > 800 THEN
      INSERT INTO audit_logs (source, module, entity, action, metadata, success)
      VALUES ('db', 'perf', v_mv, 'SLOW_QUERY', jsonb_build_object('type', 'mv_refresh', 'duration_ms', round(v_elapsed::numeric, 1)), true);
    END IF;
  END LOOP;
  DELETE FROM dashboard_cache WHERE expires_at < now();
  INSERT INTO audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'materialized_views', 'JOB_RUN', v_results, true);
  RETURN v_results;
END; $$;

-- E) CLEANUP RPC
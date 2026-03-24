
-- =============================================
-- GOVERNANCE FASE 2.1: Move MVs to private schema
-- =============================================

-- 1. Create private schema
CREATE SCHEMA IF NOT EXISTS reporting;

-- 2. Move MVs to reporting schema
ALTER MATERIALIZED VIEW IF EXISTS public.mv_consumo_itens_semana SET SCHEMA reporting;
ALTER MATERIALIZED VIEW IF EXISTS public.mv_fin_dre_mensal SET SCHEMA reporting;
ALTER MATERIALIZED VIEW IF EXISTS public.mv_fin_fluxo_caixa_diario SET SCHEMA reporting;
ALTER MATERIALIZED VIEW IF EXISTS public.mv_giro_estoque SET SCHEMA reporting;
ALTER MATERIALIZED VIEW IF EXISTS public.mv_pedidos_status_resumo SET SCHEMA reporting;

-- 3. Update refresh function to target new schema
CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_start timestamptz; 
  v_results jsonb := '[]'::jsonb; 
  v_mv text; 
  v_elapsed numeric;
  -- List now includes schema prefix
  v_views text[] := ARRAY[
    'reporting.mv_fin_dre_mensal',
    'reporting.mv_fin_fluxo_caixa_diario',
    'reporting.mv_consumo_itens_semana',
    'reporting.mv_giro_estoque',
    'reporting.mv_pedidos_status_resumo'
  ];
BEGIN
  FOREACH v_mv IN ARRAY v_views LOOP
    v_start := clock_timestamp();
    -- Dynamic SQL needs fully qualified names, which we provided in the array
    EXECUTE 'REFRESH MATERIALIZED VIEW ' || v_mv;
    v_elapsed := EXTRACT(EPOCH FROM clock_timestamp() - v_start) * 1000;
    
    v_results := v_results || jsonb_build_object('view', v_mv, 'ms', round(v_elapsed::numeric, 1));
    
    -- Log slow refreshes (>800ms)
    IF v_elapsed > 800 THEN
      INSERT INTO audit_logs (source, module, entity, action, metadata, success)
      VALUES ('db', 'perf', v_mv, 'SLOW_QUERY', jsonb_build_object('type', 'mv_refresh', 'duration_ms', round(v_elapsed::numeric, 1)), true);
    END IF;
  END LOOP;

  -- Clear cache
  DELETE FROM dashboard_cache WHERE expires_at < now();
  
  -- Log job completion
  INSERT INTO audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'materialized_views', 'JOB_RUN', v_results, true);
  
  RETURN v_results;
END; 
$function$;

-- 4. Revoke all access to the new schema from API roles
REVOKE ALL ON SCHEMA reporting FROM anon, authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA reporting FROM anon, authenticated;

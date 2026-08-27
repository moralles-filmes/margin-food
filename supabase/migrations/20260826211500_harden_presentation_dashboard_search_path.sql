-- Fechamento de segurança da Fase 7.
--
-- As versões implantadas em 20260825212335 são SECURITY DEFINER e foram
-- publicadas com search_path = public. Como o schema public permanece gravável
-- por papéis da API neste projeto, removemos o schema mutável da resolução de
-- nomes. As duas funções já qualificam explicitamente todas as relações e
-- helpers fora de pg_catalog.

ALTER FUNCTION public.get_fin_dashboard_summary(date, date)
  SET search_path = '';

ALTER FUNCTION public.get_fin_dashboard_charts(date, date)
  SET search_path = '';

DO $migration_check$
DECLARE
  v_summary_config text[];
  v_charts_config text[];
BEGIN
  SELECT function_config.proconfig
  INTO v_summary_config
  FROM pg_catalog.pg_proc function_config
  JOIN pg_catalog.pg_namespace function_schema
    ON function_schema.oid = function_config.pronamespace
  WHERE function_schema.nspname = 'public'
    AND function_config.proname = 'get_fin_dashboard_summary'
    AND function_config.proargtypes = '1082 1082'::pg_catalog.oidvector;

  SELECT function_config.proconfig
  INTO v_charts_config
  FROM pg_catalog.pg_proc function_config
  JOIN pg_catalog.pg_namespace function_schema
    ON function_schema.oid = function_config.pronamespace
  WHERE function_schema.nspname = 'public'
    AND function_config.proname = 'get_fin_dashboard_charts'
    AND function_config.proargtypes = '1082 1082'::pg_catalog.oidvector;

  IF v_summary_config IS NULL OR NOT ('search_path=""' = ANY(v_summary_config)) THEN
    RAISE EXCEPTION 'MIGRATION_CHECK_FAILED: get_fin_dashboard_summary search_path';
  END IF;
  IF v_charts_config IS NULL OR NOT ('search_path=""' = ANY(v_charts_config)) THEN
    RAISE EXCEPTION 'MIGRATION_CHECK_FAILED: get_fin_dashboard_charts search_path';
  END IF;
END;
$migration_check$;

COMMENT ON FUNCTION public.get_fin_dashboard_summary(date, date) IS
  'Dashboard financeiro em regime de caixa; SECURITY DEFINER com search_path imutável.';
COMMENT ON FUNCTION public.get_fin_dashboard_charts(date, date) IS
  'Gráficos financeiros em regime de caixa; SECURITY DEFINER com search_path imutável.';

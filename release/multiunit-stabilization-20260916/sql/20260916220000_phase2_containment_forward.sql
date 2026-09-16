-- Fase 2: contenção C01/C02; sem limpeza/refresh/backfill durante a aplicação.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
-- Preflight somente de leitura; aborta diante de drift. Não chama manutenção.
DO $preflight$
DECLARE v record;
BEGIN
 IF current_setting('server_version_num')::integer < 170000 THEN RAISE EXCEPTION 'PHASE2_REQUIRES_POSTGRES_17'; END IF;
 FOR v IN SELECT * FROM (VALUES
  ('public.cleanup_old_audit_logs(integer)','6675cad966ebc41b38198dd29052f002','{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.list_companies()','bd2071c2534a9aec4f6aba719594ae08','{=X/postgres,postgres=X/postgres,authenticated=X/postgres}'),
  ('public.list_my_companies()','bf98e746f2660558f709a5747ed01e17','{postgres=X/postgres,authenticated=X/postgres}'),
  ('public.onboard_new_company(text,text,uuid)','b8fc02fccc0e24b383a9a9ebde368871','{=X/postgres,postgres=X/postgres,authenticated=X/postgres}'),
  ('public.refresh_materialized_views()','6c3cf0451140358d1e54543ed021c2c5','{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.rpc_create_company(text,text)','99eb617eecda215482d743a246aa5df1','{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.rpc_set_user_company(uuid,uuid)','cc8d9fcdb578e088d1cc01f202200ead','{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.update_company(uuid,text,text,boolean)','1e83056ea4386049deeba4c1030bd7cc','{=X/postgres,postgres=X/postgres,authenticated=X/postgres}'),
  ('public.assert_tenant()','749e660df028d5848d78bcaa1ca6b75d','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.get_company_permissions(uuid,uuid)','3d525d50884f5330721625ce2db97c0b','{postgres=X/postgres,service_role=X/postgres}'),
  ('public.get_current_company_id()','a5e5953a3980f3cf00479ae0f66ed90f','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.get_effective_permissions(uuid)','51bfee6d3f51f2e2469a51ebba878254','{postgres=X/postgres,service_role=X/postgres,authenticated=X/postgres}'),
  ('public.has_permission(text)','0e016b55669c0a24f661f86e00424cfd',NULL::text),
  ('public.has_permission(uuid,text)','e2cd02acb98d4bfb7f381d91c6020cc4','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'),
  ('public.is_company_member(uuid,uuid)','4e351f8c65051fd3da9c94977b8be830','{postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}')
 ) expected(signature,definition_hash,acl) LOOP
  IF to_regprocedure(v.signature) IS NULL OR md5(pg_get_functiondef(to_regprocedure(v.signature))) IS DISTINCT FROM v.definition_hash OR (SELECT pg_get_userbyid(proowner) FROM pg_proc WHERE oid=to_regprocedure(v.signature)) IS DISTINCT FROM 'postgres' OR ARRAY(SELECT unnest(proacl)::text FROM pg_proc WHERE oid=to_regprocedure(v.signature) ORDER BY 1) IS DISTINCT FROM ARRAY(SELECT unnest(v.acl::aclitem[])::text ORDER BY 1) THEN
   RAISE EXCEPTION 'PHASE2_FUNCTION_DRIFT: %',v.signature;
  END IF;
 END LOOP;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('cleanup_old_audit_logs','refresh_materialized_views','rpc_create_company')) <> 3 THEN RAISE EXCEPTION 'PHASE2_SIGNATURE_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.companies'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}') THEN RAISE EXCEPTION 'PHASE2_COMPANIES_ACL_OR_RLS_DRIFT'; END IF;
 IF (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename='companies') <> 2 THEN RAISE EXCEPTION 'PHASE2_POLICY_COUNT_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='companies' AND policyname='companies_admin' AND cmd='ALL' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[] AND qual='( SELECT has_permission(auth.uid(), ''system:admin''::text) AS has_permission)' AND with_check IS NULL) THEN RAISE EXCEPTION 'PHASE2_POLICY_DRIFT: companies_admin'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='companies' AND policyname='companies_read' AND cmd='SELECT' AND permissive='PERMISSIVE' AND roles=ARRAY['authenticated']::name[] AND qual='(id = ( SELECT get_current_company_id() AS get_current_company_id))' AND with_check IS NULL) THEN RAISE EXCEPTION 'PHASE2_POLICY_DRIFT: companies_read'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('reporting.mv_fin_dre_mensal') AND relkind='m') THEN RAISE EXCEPTION 'PHASE2_REQUIRED_VIEW_MISSING: reporting.mv_fin_dre_mensal'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('reporting.mv_fin_fluxo_caixa_diario') AND relkind='m') THEN RAISE EXCEPTION 'PHASE2_REQUIRED_VIEW_MISSING: reporting.mv_fin_fluxo_caixa_diario'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('reporting.mv_consumo_itens_semana') AND relkind='m') THEN RAISE EXCEPTION 'PHASE2_REQUIRED_VIEW_MISSING: reporting.mv_consumo_itens_semana'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid=to_regclass('reporting.mv_giro_estoque') AND relkind='m') THEN RAISE EXCEPTION 'PHASE2_REQUIRED_VIEW_MISSING: reporting.mv_giro_estoque'; END IF;
 IF to_regclass('reporting.mv_pedidos_status_resumo') IS NOT NULL THEN RAISE EXCEPTION 'PHASE2_REVIEW_RESTORED_VIEW'; END IF;
 IF to_regclass('cron.job') IS NOT NULL THEN RAISE EXCEPTION 'PHASE2_REVIEW_NEW_CRON_CALLERS'; END IF;
 IF EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f' AND p.prosrc ~ '(cleanup_old_audit_logs|refresh_materialized_views)' AND p.proname NOT IN ('cleanup_old_audit_logs','refresh_materialized_views')) THEN RAISE EXCEPTION 'PHASE2_REVIEW_NEW_DATABASE_CALLERS'; END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public.cleanup_old_audit_logs(p_months integer DEFAULT 24)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE v_deleted int;
BEGIN
  -- Papel da conexão definido pelo gateway/SET ROLE, nunca um campo do body/JWT customizado.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND NOT (current_setting('role', true) = 'none' AND session_user = 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MAINTENANCE_SERVICE_ONLY';
  END IF;

  -- Piso preserva os 24 meses do scheduler; teto limita intervalos operacionais.
  IF p_months IS NULL OR p_months < 24 OR p_months > 120 THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'RETENTION_MONTHS_MUST_BE_24_TO_120';
  END IF;

  DELETE FROM public.audit_logs WHERE created_at < now() - make_interval(months => p_months);
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  INSERT INTO public.audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'audit_logs', 'JOB_CLEANUP', jsonb_build_object('deleted_count', v_deleted, 'retention_months', p_months), true);
  RETURN v_deleted;
END; $function$;

CREATE OR REPLACE FUNCTION public.refresh_materialized_views()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
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
    'reporting.mv_giro_estoque'
  ];
BEGIN
  -- Papel da conexão definido pelo gateway/SET ROLE, nunca um campo do body/JWT customizado.
  IF current_setting('role', true) IS DISTINCT FROM 'service_role'
     AND NOT (current_setting('role', true) = 'none' AND session_user = 'service_role') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'MAINTENANCE_SERVICE_ONLY';
  END IF;

  FOREACH v_mv IN ARRAY v_views LOOP
    v_start := clock_timestamp();
    -- Dynamic SQL needs fully qualified names, which we provided in the array
    EXECUTE 'REFRESH MATERIALIZED VIEW ' || v_mv;
    v_elapsed := EXTRACT(EPOCH FROM clock_timestamp() - v_start) * 1000;

    v_results := v_results || jsonb_build_object('view', v_mv, 'ms', round(v_elapsed::numeric, 1));

    -- Log slow refreshes (>800ms)
    IF v_elapsed > 800 THEN
      INSERT INTO public.audit_logs (source, module, entity, action, metadata, success)
      VALUES ('db', 'perf', v_mv, 'SLOW_QUERY', jsonb_build_object('type', 'mv_refresh', 'duration_ms', round(v_elapsed::numeric, 1)), true);
    END IF;
  END LOOP;

  -- Clear cache
  DELETE FROM public.dashboard_cache WHERE expires_at < now();

  -- Log job completion
  INSERT INTO public.audit_logs (source, module, entity, action, metadata, success)
  VALUES ('db', 'system', 'materialized_views', 'JOB_RUN', v_results, true);

  RETURN v_results;
END;
$function$;

CREATE OR REPLACE FUNCTION public.rpc_create_company(p_nome text, p_cnpj text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION USING ERRCODE = '42501', MESSAGE = 'PERMISSION_DENIED: system:global:manage';
  END IF;

  INSERT INTO public.companies (nome, cnpj)
  VALUES (p_nome, p_cnpj)
  RETURNING id INTO v_id;

  INSERT INTO public.audit_logs (module, action, entity, entity_id, actor_user_id, source, success, after)
  VALUES (
    'system', 'create_company', 'companies', v_id, auth.uid(), 'rpc', true,
    jsonb_build_object('nome', p_nome, 'cnpj', p_cnpj)
  );

  RETURN jsonb_build_object('id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.cleanup_old_audit_logs(integer), public.refresh_materialized_views() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_old_audit_logs(integer), public.refresh_materialized_views() TO service_role;
REVOKE ALL ON FUNCTION public.rpc_create_company(text,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rpc_create_company(text,text) TO authenticated, service_role;

-- RLS não cobre TRUNCATE, TRIGGER, REFERENCES ou MAINTAIN. CRUD global continua autorizado pela policy.
REVOKE ALL ON TABLE public.companies FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.companies TO authenticated;
DROP POLICY companies_admin ON public.companies;
CREATE POLICY companies_admin ON public.companies FOR ALL TO authenticated
 USING (id <> '00000000-0000-0000-0000-000000000001'::uuid
   AND (SELECT public.has_permission(auth.uid(), 'system:global:manage')))
 WITH CHECK (id <> '00000000-0000-0000-0000-000000000001'::uuid
   AND (SELECT public.has_permission(auth.uid(), 'system:global:manage')));
-- companies_read e list_my_companies preservam escopo atual e descoberta de memberships.

DO $verify$
BEGIN
 IF has_function_privilege('anon','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR has_function_privilege('anon','public.refresh_materialized_views()','EXECUTE')
 OR has_function_privilege('authenticated','public.refresh_materialized_views()','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.refresh_materialized_views()','EXECUTE')
 OR has_table_privilege('authenticated','public.companies','TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') THEN
  RAISE EXCEPTION 'PHASE2_ACL_POSTCONDITION_FAILED';
 END IF;
END;
$verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;

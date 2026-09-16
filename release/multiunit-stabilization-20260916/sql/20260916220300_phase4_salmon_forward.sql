-- Fase 4: apenas Salmão. Não aplica as Fases 2/3 nem classifica logs.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL search_path=public;
DO $preflight$
DECLARE r record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._salmon_cancel_entry_guarded(uuid,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='0c12273e1b367bcd5cb9bc561bdecd5b' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','_salmon_cancel_entry_guarded(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._salmon_cancel_manipulation_guarded(uuid,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='71a4b90f8bd0bc465bba847bab710ade' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','_salmon_cancel_manipulation_guarded(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='9a9c6a84d4b6920e8f7c655edfa537aa' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(NULL::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','_salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='ada0ccfb00c35163e19c8e3593238cf8' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','_salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._salmon_dashboard_guarded(text,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='46cc87e4198bd9a46fd787f36f916fa1' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','_salmon_dashboard_guarded(text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='75b37ebb797f45d8924e206d4ae1eaa8' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','cancel_salmon_entry_atomic(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='552d4b9896921dce796328c2beaf5e08' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','cancel_salmon_manipulation_atomic(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='1b4ea77aedd68b928f83b4b0f21a16bd' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(NULL::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='cc97629d6b24bd0d9c5a671fb9c1c01f' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.ensure_salmon_raw_product()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='69331eb6003fa0b0af91ad858f31f1d2' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','ensure_salmon_raw_product()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_salmon_dashboard_summary(date,date)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='bc1e7723566cbeef8fb1e231b2cbed80' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','get_salmon_dashboard_summary(date,date)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_salmon_inventory_adjustment_kg()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='be809426fbdb462daac9e8bffca7b50d' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','get_salmon_inventory_adjustment_kg()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_salmon_reconciliation_kpis()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='dc150f0b70de3327b18036c1bdda979a' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','get_salmon_reconciliation_kpis()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.upsert_salmon_leftover_atomic(date,numeric,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='0ce1ab02f1ee4889c724f1a5025acc56' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','upsert_salmon_leftover_atomic(date,numeric,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_salmon_entry()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='556ec046d4477d301fcc80e2235f091b' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','validate_salmon_entry()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_salmon_manipulation()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='00eda507d2eb6461a3937df6dea790e7' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','validate_salmon_manipulation()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.assert_requisicao_estoque_movement_consistency()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='b472edc24fdc843d4f9b3cd0df5d5692' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','assert_requisicao_estoque_movement_consistency()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_update_product_stock()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='9b2ae02b990ea48366eacc08056b19e4' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(NULL::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','fn_update_product_stock()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.generate_next_sku(text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='5c0fba787bd586068c6d8ffc2d3035bf' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','generate_next_sku(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.produtos_force_company_id()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='01d04fbe3a259c85242cb15e2a1b7c8d' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','produtos_force_company_id()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.set_stock_movement_direction()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='a126e95ebd0503a516c7b8d24bb36d96' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','set_stock_movement_direction()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.trg_block_placeholder_company()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='8c477702989856a5740ce082cdcf8d7f' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','trg_block_placeholder_company()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.update_produto_last_movement()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='8db8af53cd48ec3a587cdc129d2f7206' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','update_produto_last_movement()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.update_updated_at_column()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='3210625d1c794f6db7b3c3defc5984dd' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','update_updated_at_column()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_estorno_movement()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='1185b9d20417713f9c8b7ee0a27f0dc3' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','validate_estorno_movement()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_stock_movement()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='d2f22845b71d289db70e55262ef728b4' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{=X/postgres,postgres=X/postgres,authenticated=X/postgres,service_role=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','validate_stock_movement()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.fn_recompute_product_saldo(uuid,uuid)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='1e2d099b3ae7a6f746162c3ef55a7a71' AND pg_get_userbyid(proowner)='postgres' AND (SELECT array_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM (SELECT array_agg(a::text ORDER BY a::text) FROM unnest('{postgres=X/postgres}'::aclitem[]) a)) THEN RAISE EXCEPTION 'PHASE4_FUNCTION_DRIFT: %','fn_recompute_product_saldo(uuid,uuid)'; END IF;
 IF (SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE '%salmon%') IS DISTINCT FROM ARRAY['_salmon_cancel_entry_guarded(uuid,text)','_salmon_cancel_manipulation_guarded(uuid,text)','_salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)','_salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)','_salmon_dashboard_guarded(text,text)','cancel_salmon_entry_atomic(uuid,text)','cancel_salmon_manipulation_atomic(uuid,text)','create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)','create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)','ensure_salmon_raw_product()','get_salmon_dashboard_summary(date,date)','get_salmon_inventory_adjustment_kg()','get_salmon_reconciliation_kpis()','upsert_salmon_leftover_atomic(date,numeric,text)','validate_salmon_entry()','validate_salmon_manipulation()']::text[] THEN RAISE EXCEPTION 'PHASE4_OVERLOAD_DRIFT'; END IF;
 IF md5((select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,'force',c.relforcerowsecurity,'acl',c.relacl::text,'columns',(select jsonb_agg(jsonb_build_object('name',a.attname,'type',format_type(a.atttypid,a.atttypmod),'notnull',a.attnotnull,'generated',a.attgenerated,'default',pg_get_expr(d.adbin,d.adrelid),'acl',a.attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid=c.oid and a.attnum>0 and not a.attisdropped),'constraints',(select jsonb_agg(jsonb_build_object('name',conname,'def',pg_get_constraintdef(oid,true)) order by conname) from pg_constraint where conrelid=c.oid)) order by c.relname) from pg_class c where c.relnamespace='public'::regnamespace and c.relname=ANY(ARRAY['produtos','movimentacoes_estoque','salmon_entries','salmon_manipulations','stock_sku_counter','supplier_item_prices']))::text) IS DISTINCT FROM 'a24abb5414d33d26977fceb2891e8145' THEN RAISE EXCEPTION 'PHASE4_TABLE_DRIFT'; END IF;
 IF md5((SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) FROM pg_policies p WHERE schemaname='public' AND tablename=ANY(ARRAY['salmon_entries','salmon_manipulations','produtos','movimentacoes_estoque','stock_sku_counter']))::text) IS DISTINCT FROM '8bcd8ce05a4dfd83beaf74baf2aa8f14' THEN RAISE EXCEPTION 'PHASE4_POLICY_DRIFT'; END IF;
 IF md5((SELECT jsonb_agg(to_jsonb(i) ORDER BY tablename,indexname) FROM pg_indexes i WHERE schemaname='public' AND tablename=ANY(ARRAY['salmon_entries','salmon_manipulations','produtos','movimentacoes_estoque','stock_sku_counter']))::text) IS DISTINCT FROM 'bd0205edf6b5a83ee192309ee2fea914' THEN RAISE EXCEPTION 'PHASE4_INDEX_DRIFT'; END IF;
 IF md5((SELECT jsonb_agg(jsonb_build_object('table',c.relname,'name',t.tgname,'enabled',t.tgenabled,'definition',pg_get_triggerdef(t.oid,true)) ORDER BY c.relname,t.tgname) FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE c.relnamespace='public'::regnamespace AND c.relname=ANY(ARRAY['produtos','movimentacoes_estoque','salmon_entries','salmon_manipulations','stock_sku_counter','supplier_item_prices']) AND NOT t.tgisinternal)::text) IS DISTINCT FROM '5c936db500387023aa5fb1930a93d1cb' THEN RAISE EXCEPTION 'PHASE4_TRIGGER_DRIFT'; END IF;
 IF (SELECT array_agg(p.oid::regprocedure::text ORDER BY p.oid::regprocedure::text) FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.prokind='f' AND p.prosrc ~ '(ensure_salmon_raw_product|create_salmon_entry_atomic|cancel_salmon_entry_atomic|create_salmon_manipulation_atomic|cancel_salmon_manipulation_atomic)') IS DISTINCT FROM ARRAY['_salmon_cancel_entry_guarded(uuid,text)','_salmon_cancel_manipulation_guarded(uuid,text)','_salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)','_salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)','create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)','create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)']::text[] THEN RAISE EXCEPTION 'PHASE4_CALLER_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM public.produtos WHERE ativo AND is_salmon_raw_linked GROUP BY company_id HAVING count(*)>1) THEN RAISE EXCEPTION 'PHASE4_DUPLICATE_RAW_PRODUCT'; END IF;
 IF to_regclass('public.produtos_one_active_salmon_raw') IS NOT NULL THEN RAISE EXCEPTION 'PHASE4_INDEX_ALREADY_EXISTS'; END IF;
END;
$preflight$;

CREATE OR REPLACE FUNCTION public._salmon_cancel_entry_guarded(p_entry_id uuid, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['salmon:entradas:delete','salmon:entries:delete','salmon:delete','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:entradas:delete' USING ERRCODE='42501';
  END IF;
  RETURN public.cancel_salmon_entry_atomic(p_entry_id, p_reason);
END;
$function$
;

CREATE OR REPLACE FUNCTION public._salmon_cancel_manipulation_guarded(p_manip_id uuid, p_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:delete','salmon:delete','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:manipulacao:delete' USING ERRCODE='42501';
  END IF;
  RETURN public.cancel_salmon_manipulation_atomic(p_manip_id, p_reason);
END;
$function$
;

CREATE OR REPLACE FUNCTION public._salmon_create_entry_guarded(p_entry_date text, p_lot text, p_sif text, p_supplier_name text, p_boxes integer, p_units integer, p_gross_kg numeric, p_total_value numeric, p_notes text DEFAULT ''::text, p_expiration_date text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['salmon:entradas:create','salmon:entries:create','salmon:write','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:entradas:create' USING ERRCODE='42501';
  END IF;
  RETURN public.create_salmon_entry_atomic(
    p_entry_date::date, p_lot, p_sif, p_supplier_name,
    p_boxes, p_units, p_gross_kg, p_total_value, p_notes,
    NULLIF(p_expiration_date, '')::date
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public._salmon_create_manipulation_guarded(p_entry_id uuid, p_manipulation_date text, p_fish_count integer, p_gross_out_kg numeric, p_clean_in_kg numeric, p_leftover_kg numeric, p_notes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['salmon:manipulacao:create','salmon:manipulation:create','salmon:write','system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: salmon:manipulacao:create' USING ERRCODE='42501';
  END IF;
  RETURN public.create_salmon_manipulation_atomic(
    p_entry_id, p_manipulation_date::date, p_fish_count,
    p_gross_out_kg, p_clean_in_kg, p_leftover_kg, p_notes
  );
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_salmon_entry_atomic(p_entry_id uuid, p_reason text DEFAULT 'Cancelamento de entrada'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  SELECT * INTO v_entry FROM salmon_entries
  WHERE id = p_entry_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;
  IF v_entry.status = 'CANCELLED' THEN RAISE EXCEPTION 'Entrada já cancelada.'; END IF;

  IF EXISTS (SELECT 1 FROM salmon_manipulations
             WHERE entry_id = p_entry_id AND status = 'ACTIVE' AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'Existem manipulações ativas vinculadas. Cancele-as primeiro.';
  END IF;

  UPDATE salmon_entries SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_entry_id AND company_id = v_company_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = p_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    IF v_mov.source_module IS DISTINCT FROM 'salmon' OR NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id=v_mov.produto_id AND p.company_id=v_company_id
    ) THEN
      RAISE EXCEPTION 'SALMON_MOVEMENT_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    -- Insere o estorno ANTES de cancelar o original (trg_validate_estorno recusa
    -- estorno_de_id que já esteja CANCELADO).
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_ENTRY', v_mov.reference_id || '_ESTORNO', false, 'salmon', v_mov.salmon_lot_id, v_company_id
    ) RETURNING id INTO v_estorno_id;

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', p_entry_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_kg', v_entry.gross_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'entry_id', p_entry_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.cancel_salmon_manipulation_atomic(p_manip_id uuid, p_reason text DEFAULT 'Cancelamento de manipulação'::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_manip RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  SELECT * INTO v_manip FROM salmon_manipulations
  WHERE id = p_manip_id AND company_id = v_company_id
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'Manipulação não encontrada ou sem permissão.'; END IF;
  IF v_manip.status = 'CANCELLED' THEN RAISE EXCEPTION 'Manipulação já cancelada.'; END IF;

  UPDATE salmon_manipulations SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_manip_id AND company_id = v_company_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = p_manip_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    IF v_mov.source_module IS DISTINCT FROM 'salmon' OR NOT EXISTS (
      SELECT 1 FROM public.produtos p WHERE p.id=v_mov.produto_id AND p.company_id=v_company_id
    ) THEN
      RAISE EXCEPTION 'SALMON_MOVEMENT_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    -- Insere o estorno ANTES de cancelar o original (trg_validate_estorno recusa
    -- estorno_de_id que já esteja CANCELADO).
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor, company_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'SAIDA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_MANIPULATION', v_mov.reference_id || '_ESTORNO', true, 'salmon', v_mov.salmon_lot_id, v_mov.setor, v_company_id
    ) RETURNING id INTO v_estorno_id;

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id AND company_id = v_company_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', p_manip_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_out_kg', v_manip.gross_out_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'manipulation_id', p_manip_id, 'estorno_id', v_estorno_id, 'company_id', v_company_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.create_salmon_entry_atomic(p_entry_date date, p_lot text, p_sif text, p_supplier_name text, p_boxes integer, p_units integer, p_gross_kg numeric, p_total_value numeric, p_notes text DEFAULT ''::text, p_expiration_date date DEFAULT NULL::date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_supplier_uuid uuid;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  -- Multi-tenant enforcement
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_kg <= 0 THEN RAISE EXCEPTION 'gross_kg deve ser > 0'; END IF;
  IF p_total_value < 0 THEN RAISE EXCEPTION 'total_value não pode ser negativo'; END IF;
  IF p_expiration_date IS NOT NULL AND p_expiration_date < p_entry_date THEN
    RAISE EXCEPTION 'Validade (%) não pode ser anterior à data de entrada (%).', p_expiration_date, p_entry_date;
  END IF;

  v_cost_per_kg := CASE WHEN p_gross_kg > 0 THEN ROUND(p_total_value / p_gross_kg, 4) ELSE 0 END;

  -- 1. Insert salmon_entries
  INSERT INTO salmon_entries (
    entry_date, lot, sif, supplier_name, boxes, units, gross_kg, total_value, notes, created_by, company_id,
    expiration_date
  ) VALUES (
    p_entry_date, COALESCE(p_lot,''), COALESCE(p_sif,''), COALESCE(p_supplier_name,''),
    COALESCE(p_boxes,0), COALESCE(p_units,0), p_gross_kg, p_total_value,
    COALESCE(p_notes,''), v_caller, v_company_id,
    p_expiration_date
  ) RETURNING id INTO v_entry_id;

  -- 2. Ensure salmon raw product (v_produto_id is global reference but logically belongs to the tenant)
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  -- 3. Mirror to stock (ENTRADA)
  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = v_entry_id::text
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      data = p_entry_date,
      observacao = 'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,'')
        || CASE WHEN p_expiration_date IS NULL THEN '' ELSE ' — Val: ' || to_char(p_expiration_date, 'DD/MM/YYYY') END,
      editado_em = now(), editado_por = v_caller,
      salmon_lot_id = p_lot
    WHERE id = v_mov_id AND company_id = v_company_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, company_id
    ) VALUES (
      v_produto_id, p_entry_date, 'ENTRADA', p_gross_kg, v_cost_per_kg,
      ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão',
      'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,'')
        || CASE WHEN p_expiration_date IS NULL THEN '' ELSE ' — Val: ' || to_char(p_expiration_date, 'DD/MM/YYYY') END,
      v_caller, 'ATIVO', 'SALMON_ENTRY', v_entry_id::text, false, 'salmon', p_lot, v_company_id
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- 4. Update produto cost (Global but context of company insert)
  IF v_cost_per_kg > 0 THEN
    UPDATE produtos SET
      last_cost_purchase_unit = v_cost_per_kg, last_cost_base_unit = v_cost_per_kg,
      last_purchase_date = p_entry_date::text, last_supplier = p_supplier_name,
      custo_padrao = CASE WHEN custo_padrao = 0 THEN v_cost_per_kg ELSE custo_padrao END,
      default_cost_purchase_unit = CASE WHEN default_cost_purchase_unit = 0 THEN v_cost_per_kg ELSE default_cost_purchase_unit END,
      default_cost_base_unit = CASE WHEN default_cost_base_unit = 0 THEN v_cost_per_kg ELSE default_cost_base_unit END
    WHERE id = v_produto_id AND company_id = v_company_id;
  END IF;

  -- 5. Upsert supplier + supplier_item_prices
  IF p_supplier_name IS NOT NULL AND p_supplier_name != '' THEN
    INSERT INTO suppliers (name, company_id) VALUES (p_supplier_name, v_company_id)
    ON CONFLICT (name, company_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;

    IF v_supplier_uuid IS NOT NULL THEN
      INSERT INTO supplier_item_prices (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, last_updated_at, source, company_id)
      VALUES (p_supplier_name, v_supplier_uuid, v_produto_id, v_cost_per_kg, 'KG', now(), 'salmon', v_company_id)
      ON CONFLICT (supplier_id, stock_item_id, company_id) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost, supplier_uuid = EXCLUDED.supplier_uuid,
        last_updated_at = EXCLUDED.last_updated_at, source = 'salmon';
    END IF;
  END IF;

  -- 6. Audit (includes company_id)
  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', v_entry_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object('gross_kg', p_gross_kg, 'total_value', p_total_value, 'lot', p_lot,
      'supplier', p_supplier_name, 'mov_id', v_mov_id, 'expiration_date', p_expiration_date));

  RETURN jsonb_build_object('entry_id', v_entry_id, 'movement_id', v_mov_id, 'unit_cost', v_cost_per_kg,
    'expiration_date', p_expiration_date, 'company_id', v_company_id);
END;
$function$
;

CREATE OR REPLACE FUNCTION public.ensure_salmon_raw_product()
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_id uuid;
  v_sku text;
  v_company_id uuid;
BEGIN
  -- Enforcement
  v_company_id := assert_tenant();

  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  -- Serializa a primeira criação por empresa; o índice cobre outros writers.
  PERFORM pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('salmon_raw:' || v_company_id::text, 0));

  -- 1. Look for existing linked product within company context
  SELECT id INTO v_id FROM produtos
  WHERE is_salmon_raw_linked = true
    AND ativo = true
    AND company_id = v_company_id
  LIMIT 1 FOR UPDATE;

  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  -- 2. Generate SKU (will use get_current_company_id fallback which is now dynamic)
  SELECT generate_next_sku('SALM') INTO v_sku;

  -- 3. Create product if missing for this company
  INSERT INTO produtos (
    nome_produto, sku, categoria, unidade_medida, unidade_compra,
    fator_conversao_padrao, custo_padrao, default_cost_purchase_unit, default_cost_base_unit,
    estoque_minimo, estoque_ideal, ativo, is_salmon_raw_linked, observacoes, company_id
  ) VALUES (
    'Salmão Fresco', v_sku, 'Pescados', 'KG', 'KG',
    1, 0, 0, 0,
    0, 0, true, true, 'Item vinculado automaticamente ao Controle de Salmão. Não editar unidades.',
    v_company_id
  )
  RETURNING id INTO v_id;

  -- 4. Audit with correct metadata
  PERFORM public.log_audit('rpc', 'salmon', 'produtos', v_id, 'ENSURE_RAW_PRODUCT', NULL,
    jsonb_build_object('sku', v_sku, 'created', true, 'company_id', v_company_id));

  RETURN v_id;
END;
$function$
;

CREATE OR REPLACE FUNCTION public.upsert_salmon_leftover_atomic(p_record_date date, p_leftover_kg numeric, p_note text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_result     jsonb;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_any_permission(v_user_id, ARRAY[
    'salmon:manipulacao:create',
    'salmon:write',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Forbidden';
  END IF;

  INSERT INTO salmon_daily_records (company_id, record_date, leftover_kg, leftover_note, created_by, updated_at)
  VALUES (v_company_id, p_record_date, p_leftover_kg, COALESCE(p_note, ''), v_user_id, now())
  ON CONFLICT (company_id, record_date)
  DO UPDATE SET
    leftover_kg   = EXCLUDED.leftover_kg,
    leftover_note = EXCLUDED.leftover_note,
    updated_at    = now();

  SELECT jsonb_build_object(
    'success', true,
    'id', id,
    'record_date', record_date,
    'leftover_kg', leftover_kg,
    'leftover_note', leftover_note
  ) INTO v_result
  FROM salmon_daily_records
  WHERE company_id = v_company_id AND record_date = p_record_date;

  RETURN COALESCE(v_result, jsonb_build_object('success', false, 'error', 'Row not found after upsert'));

EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'upsert_salmon_leftover_atomic error: %', SQLERRM;
  RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$function$
;

CREATE UNIQUE INDEX produtos_one_active_salmon_raw ON public.produtos(company_id) WHERE ativo AND is_salmon_raw_linked;

REVOKE ALL ON FUNCTION public._salmon_cancel_entry_guarded(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._salmon_cancel_manipulation_guarded(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public._salmon_dashboard_guarded(text,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_salmon_entry_atomic(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.cancel_salmon_manipulation_atomic(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.ensure_salmon_raw_product() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_salmon_dashboard_summary(date,date) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_salmon_inventory_adjustment_kg() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_salmon_reconciliation_kpis() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.upsert_salmon_leftover_atomic(date,numeric,text) FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_salmon_entry() FROM PUBLIC, anon, authenticated, service_role;
REVOKE ALL ON FUNCTION public.validate_salmon_manipulation() FROM PUBLIC, anon, authenticated, service_role;
DO $acl$ DECLARE r record; a record; BEGIN
 FOR r IN SELECT p.oid,p.proowner FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname LIKE '%salmon%' LOOP
  FOR a IN SELECT DISTINCT grantee FROM aclexplode((SELECT proacl FROM pg_proc WHERE oid=r.oid)) WHERE grantee<>r.proowner AND grantee<>0 LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %I',r.oid::regprocedure,pg_get_userbyid(a.grantee));
  END LOOP;
 END LOOP;
END $acl$;
GRANT EXECUTE ON FUNCTION public._salmon_cancel_entry_guarded(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._salmon_cancel_manipulation_guarded(uuid,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public._salmon_dashboard_guarded(text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salmon_inventory_adjustment_kg() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_salmon_reconciliation_kpis() TO authenticated;
GRANT EXECUTE ON FUNCTION public.upsert_salmon_leftover_atomic(date,numeric,text) TO authenticated;
DO $verify$ DECLARE f text; r text; BEGIN
 FOREACH f IN ARRAY ARRAY['public.cancel_salmon_entry_atomic(uuid,text)','public.cancel_salmon_manipulation_atomic(uuid,text)','public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)','public.create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)','public.ensure_salmon_raw_product()','public.get_salmon_dashboard_summary(date,date)','public.validate_salmon_entry()','public.validate_salmon_manipulation()'] LOOP
  FOREACH r IN ARRAY ARRAY['anon','authenticated','service_role'] LOOP
   IF has_function_privilege(r,f,'EXECUTE') THEN RAISE EXCEPTION 'PHASE4_INTERNAL_ACL: % %',r,f; END IF;
  END LOOP;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['public._salmon_cancel_entry_guarded(uuid,text)','public._salmon_cancel_manipulation_guarded(uuid,text)','public._salmon_create_entry_guarded(text,text,text,text,integer,integer,numeric,numeric,text,text)','public._salmon_create_manipulation_guarded(uuid,text,integer,numeric,numeric,numeric,text)','public._salmon_dashboard_guarded(text,text)','public.get_salmon_inventory_adjustment_kg()','public.get_salmon_reconciliation_kpis()','public.upsert_salmon_leftover_atomic(date,numeric,text)'] LOOP
  IF NOT has_function_privilege('authenticated',f,'EXECUTE') OR has_function_privilege('anon',f,'EXECUTE') OR has_function_privilege('service_role',f,'EXECUTE') THEN RAISE EXCEPTION 'PHASE4_PUBLIC_ACL: %',f; END IF;
 END LOOP;
END $verify$;
NOTIFY pgrst, 'reload schema';
COMMIT;

BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF current_user<>'postgres' THEN RAISE EXCEPTION 'PHASE3_MIGRATION_REQUIRES_POSTGRES'; END IF; END $$;
DO $preflight$
DECLARE r record; actual jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.handle_first_admin()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='198eb0e188889228a30595da4b3ee1a4' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','handle_first_admin()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='4bfd1b10fad566394a388214cea10362' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM NULL::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.cancel_salmon_entry_atomic(uuid,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='1782d37555a645020636444181fca0d7' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','cancel_salmon_entry_atomic(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.cancel_salmon_manipulation_atomic(uuid,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='d0a15ca28c66c94f07526d34712decde' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','cancel_salmon_manipulation_atomic(uuid,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.ensure_salmon_raw_product()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='69331eb6003fa0b0af91ad858f31f1d2' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','ensure_salmon_raw_product()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.update_company(uuid,text,text,boolean)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='1e83056ea4386049deeba4c1030bd7cc' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','update_company(uuid,text,text,boolean)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.log_integration_error(text,text,text,text,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='f745050252d9dfa10754d24ab3aada97' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','log_integration_error(text,text,text,text,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.receive_market_order_atomic(uuid,jsonb,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='362a129ee109b27ed135af0299c3f8ec' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','receive_market_order_atomic(uuid,jsonb,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.log_audit(text,text,text,text,text,jsonb,jsonb,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='841885508b2f38ec2336bcfd0cc10e5d' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','log_audit(text,text,text,text,text,jsonb,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='26322b53f62d1d1ccc824c759300cc39' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','receive_purchase_order_atomic(uuid,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='b26eb4adf9e4f1a2422dafb90ba98734' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.audit_trigger_fn()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='7050f2c7eaebfc670d7ff12476e1d71b' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','audit_trigger_fn()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.aprovar_ferias(uuid,uuid)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='cc921267a0d38e524db4e623341881b2' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','aprovar_ferias(uuid,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public._guarded_list_fin_audit_logs(text,text,text,integer,timestamp with time zone,uuid,integer)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='f25c4d8650f6f2486f2e9d6dda9661fd' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','_guarded_list_fin_audit_logs(text,text,text,integer,timestamp with time zone,uuid,integer)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.mark_all_notifications_read()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='2593645c43be89341a97b3a047733216' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','mark_all_notifications_read()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.rpc_recebimentos_close(uuid,boolean,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='641fde95377056d579e71abb1233830b' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','rpc_recebimentos_close(uuid,boolean,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.rbac_sql_lint_report_internal()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='b47d5408b5f843bb7d5fbeb9690e56dc' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','rbac_sql_lint_report_internal()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='cc97629d6b24bd0d9c5a671fb9c1c01f' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','create_salmon_manipulation_atomic(uuid,date,integer,numeric,numeric,numeric,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.stock_insert_movement_atomic(uuid,numeric,text,text,text,text,text,text,text,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='56774860b7bf79dfb2eff0186f87d083' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','stock_insert_movement_atomic(uuid,numeric,text,text,text,text,text,text,text,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='f2c3a9bd7c29b8488eaa82d64d5fba3f' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.stock_transfer_between_locations(uuid,text,text,numeric,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='612a69553ba0f7e02fee09fb9b684069' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','stock_transfer_between_locations(uuid,text,text,numeric,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_quick_inventory_atomic(jsonb,text,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='6fddbb29af31218709522eaaf7a6b5a5' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','create_quick_inventory_atomic(jsonb,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.edit_purchase_order_atomic(uuid,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='01f845d1f73fa9f8ee9fba51c830a8a1' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','edit_purchase_order_atomic(uuid,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_purchase_order_atomic(jsonb,uuid)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='b93addea8a750814736e1a1690c11ab5' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','create_purchase_order_atomic(jsonb,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.attend_requisicao_item_atomic(uuid,uuid,numeric)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='0a254b542f113ed0705e36243f34cb83' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','attend_requisicao_item_atomic(uuid,uuid,numeric)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.receive_conta_receber(uuid,text,date)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='3daae02376fe172ac6b93a02e64fb886' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','receive_conta_receber(uuid,text,date)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.create_purchase_orders_from_cotacao_atomic(uuid,timestamp with time zone)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='7a783cc28dd7f67627a881ee6a55068c' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','create_purchase_orders_from_cotacao_atomic(uuid,timestamp with time zone)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pay_conta_pagar(uuid,text,date,uuid)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='c0d2f14706d467cbde1376ec9de5a4a5' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM NULL::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','pay_conta_pagar(uuid,text,date,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.upsert_supplier(text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='ea5e790b1608da95c56d2731f8ddb9ac' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','upsert_supplier(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.storno_purchase_order_stock(uuid)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='ddb806614e9d97e4a68a3a4b2c8df0d2' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a) IS NOT DISTINCT FROM '["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_FUNCTION_DRIFT: %','storno_purchase_order_stock(uuid)'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname IN ('log_audit','audit_log_write','log_integration_error'))<>4 THEN RAISE EXCEPTION 'PHASE3_OVERLOAD_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.audit_log'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres' AND to_jsonb(relacl)='["postgres=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_TABLE_DRIFT: audit_log'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.audit_logs'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres' AND to_jsonb(relacl)='["postgres=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_TABLE_DRIFT: audit_logs'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.integration_logs'::regclass AND relrowsecurity AND NOT relforcerowsecurity AND pg_get_userbyid(relowner)='postgres' AND to_jsonb(relacl)='["postgres=arwdDxtm/postgres","authenticated=arwdDxtm/postgres","service_role=arwdDxtm/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE3_TABLE_DRIFT: integration_logs'; END IF;
 SELECT jsonb_agg(to_jsonb(p) ORDER BY tablename,policyname) INTO actual FROM pg_policies p WHERE schemaname='public' AND tablename IN ('audit_log','audit_logs','integration_logs');
 IF actual IS DISTINCT FROM '[{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"audit_log","permissive":"PERMISSIVE","policyname":"Authenticated can insert audit","schemaname":"public","with_check":"(( SELECT auth.uid() AS uid) = user_id)"},{"cmd":"SELECT","qual":"( SELECT has_any_permission(auth.uid(), ARRAY[''configuracoes:auditoria-seguranca:view''::text, ''system:read''::text, ''system:global:manage''::text]) AS has_any_permission)","roles":["authenticated"],"tablename":"audit_log","permissive":"PERMISSIVE","policyname":"perm_audit_log_select","schemaname":"public","with_check":null},{"cmd":"INSERT","qual":null,"roles":["authenticated"],"tablename":"audit_logs","permissive":"PERMISSIVE","policyname":"audit_logs_insert_tenant","schemaname":"public","with_check":"(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"},{"cmd":"SELECT","qual":"(company_id = ( SELECT get_current_company_id() AS get_current_company_id))","roles":["authenticated"],"tablename":"audit_logs","permissive":"PERMISSIVE","policyname":"audit_logs_select_tenant","schemaname":"public","with_check":null},{"cmd":"ALL","qual":"((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) OR (( SELECT (NULLIF(current_setting(''request.headers''::text, true), ''''::text) IS NULL)) AND is_company_member(( SELECT auth.uid() AS uid), company_id)))","roles":["authenticated"],"tablename":"audit_logs","permissive":"RESTRICTIVE","policyname":"multiunit_scope_boundary","schemaname":"public","with_check":"(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"},{"cmd":"SELECT","qual":"( SELECT has_permission(auth.uid(), ''system:read''::text) AS has_permission)","roles":["authenticated"],"tablename":"audit_logs","permissive":"PERMISSIVE","policyname":"perm_audit_logs_select","schemaname":"public","with_check":null},{"cmd":"SELECT","qual":"( SELECT has_permission(auth.uid(), ''system:read''::text) AS has_permission)","roles":["authenticated"],"tablename":"integration_logs","permissive":"PERMISSIVE","policyname":"perm_integration_logs_select","schemaname":"public","with_check":null}]'::jsonb THEN RAISE EXCEPTION 'PHASE3_POLICY_DRIFT'; END IF;
 SELECT jsonb_agg(jsonb_build_object('table_name',table_name,'column_name',column_name,'udt_name',udt_name,'is_nullable',is_nullable,'column_default',column_default,'generation_expression',generation_expression) ORDER BY table_name,ordinal_position) INTO actual FROM information_schema.columns WHERE table_schema='public' AND table_name IN ('audit_log','audit_logs','integration_logs');
 IF actual IS DISTINCT FROM '[{"table_name":"audit_log","column_name":"id","udt_name":"uuid","is_nullable":"NO","column_default":"gen_random_uuid()","generation_expression":null},{"table_name":"audit_log","column_name":"tabela","udt_name":"text","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"audit_log","column_name":"registro_id","udt_name":"uuid","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"audit_log","column_name":"acao","udt_name":"text","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"audit_log","column_name":"campo","udt_name":"text","is_nullable":"YES","column_default":"''''::text","generation_expression":null},{"table_name":"audit_log","column_name":"valor_anterior","udt_name":"text","is_nullable":"YES","column_default":"''''::text","generation_expression":null},{"table_name":"audit_log","column_name":"valor_novo","udt_name":"text","is_nullable":"YES","column_default":"''''::text","generation_expression":null},{"table_name":"audit_log","column_name":"user_id","udt_name":"uuid","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_log","column_name":"created_at","udt_name":"timestamptz","is_nullable":"NO","column_default":"now()","generation_expression":null},{"table_name":"audit_logs","column_name":"id","udt_name":"uuid","is_nullable":"NO","column_default":"gen_random_uuid()","generation_expression":null},{"table_name":"audit_logs","column_name":"created_at","udt_name":"timestamptz","is_nullable":"NO","column_default":"now()","generation_expression":null},{"table_name":"audit_logs","column_name":"actor_user_id","udt_name":"uuid","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"actor_email","udt_name":"text","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"actor_role","udt_name":"text","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"source","udt_name":"text","is_nullable":"NO","column_default":"''db''::text","generation_expression":null},{"table_name":"audit_logs","column_name":"module","udt_name":"text","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"entity","udt_name":"text","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"entity_id","udt_name":"uuid","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"action","udt_name":"text","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"before","udt_name":"jsonb","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"after","udt_name":"jsonb","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"metadata","udt_name":"jsonb","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"success","udt_name":"bool","is_nullable":"NO","column_default":"true","generation_expression":null},{"table_name":"audit_logs","column_name":"company_id","udt_name":"uuid","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"audit_logs","column_name":"severity","udt_name":"text","is_nullable":"NO","column_default":"''INFO''::text","generation_expression":null},{"table_name":"audit_logs","column_name":"entity_unaccent","udt_name":"text","is_nullable":"YES","column_default":null,"generation_expression":"lower(immutable_unaccent(entity))"},{"table_name":"integration_logs","column_name":"id","udt_name":"uuid","is_nullable":"NO","column_default":"gen_random_uuid()","generation_expression":null},{"table_name":"integration_logs","column_name":"module","udt_name":"text","is_nullable":"NO","column_default":"''salmon_to_stock''::text","generation_expression":null},{"table_name":"integration_logs","column_name":"action","udt_name":"text","is_nullable":"NO","column_default":null,"generation_expression":null},{"table_name":"integration_logs","column_name":"reference_id","udt_name":"text","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"integration_logs","column_name":"status","udt_name":"text","is_nullable":"NO","column_default":"''ERROR''::text","generation_expression":null},{"table_name":"integration_logs","column_name":"error_message","udt_name":"text","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"integration_logs","column_name":"payload","udt_name":"jsonb","is_nullable":"YES","column_default":null,"generation_expression":null},{"table_name":"integration_logs","column_name":"created_at","udt_name":"timestamptz","is_nullable":"NO","column_default":"now()","generation_expression":null}]'::jsonb THEN RAISE EXCEPTION 'PHASE3_COLUMN_DRIFT'; END IF;
 SELECT jsonb_agg(pg_get_triggerdef(oid) ORDER BY pg_get_triggerdef(oid)) INTO actual FROM pg_trigger WHERE tgfoid='public.audit_trigger_fn()'::regprocedure AND tgenabled='O';
 IF actual IS DISTINCT FROM '["CREATE TRIGGER audit_fin_contas AFTER INSERT OR DELETE OR UPDATE ON public.fin_contas FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''financeiro'', ''fin_contas'')","CREATE TRIGGER audit_fin_contas_pagar AFTER INSERT OR DELETE OR UPDATE ON public.fin_contas_pagar FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''financeiro'', ''fin_contas_pagar'')","CREATE TRIGGER audit_fin_contas_receber AFTER INSERT OR DELETE OR UPDATE ON public.fin_contas_receber FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''financeiro'', ''fin_contas_receber'')","CREATE TRIGGER audit_fin_lancamento_rateios AFTER INSERT OR DELETE OR UPDATE ON public.fin_lancamento_rateios FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''financeiro'', ''fin_lancamento_rateios'')","CREATE TRIGGER audit_fin_lancamentos AFTER INSERT OR DELETE OR UPDATE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''financeiro'', ''fin_lancamentos'')","CREATE TRIGGER audit_inventario_itens AFTER INSERT OR DELETE OR UPDATE ON public.inventario_itens FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''inventario'', ''inventario_itens'')","CREATE TRIGGER audit_inventarios AFTER INSERT OR DELETE OR UPDATE ON public.inventarios FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''inventario'', ''inventarios'')","CREATE TRIGGER audit_planning_metas AFTER INSERT OR DELETE OR UPDATE ON public.planning_metas_compra FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''planning'', ''planning_metas_compra'')","CREATE TRIGGER audit_purchase_order_items AFTER INSERT OR DELETE OR UPDATE ON public.purchase_order_items FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''compras'', ''purchase_order_items'')","CREATE TRIGGER audit_purchase_orders AFTER INSERT OR DELETE OR UPDATE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''compras'', ''purchase_orders'')","CREATE TRIGGER audit_recebimento_itens AFTER INSERT OR DELETE OR UPDATE ON public.recebimento_itens FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''compras'', ''recebimento_itens'')","CREATE TRIGGER audit_recebimentos AFTER INSERT OR DELETE OR UPDATE ON public.recebimentos FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''compras'', ''recebimentos'')","CREATE TRIGGER audit_solic_compra_mercado AFTER INSERT OR DELETE OR UPDATE ON public.solic_compra_mercado FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''compras'', ''solic_compra_mercado'')","CREATE TRIGGER audit_solic_compra_mercado_item AFTER INSERT OR DELETE OR UPDATE ON public.solic_compra_mercado_item FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''compras'', ''solic_compra_mercado_item'')","CREATE TRIGGER trg_audit_movimentacoes_estoque AFTER INSERT OR DELETE OR UPDATE ON public.movimentacoes_estoque FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''estoque'', ''movimentacoes_estoque'')","CREATE TRIGGER trg_audit_produtos AFTER INSERT OR DELETE OR UPDATE ON public.produtos FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''estoque'', ''produtos'')","CREATE TRIGGER trg_audit_salmon_config AFTER INSERT OR DELETE OR UPDATE ON public.salmon_config FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''salmon'', ''salmon_config'')","CREATE TRIGGER trg_audit_salmon_daily AFTER INSERT OR DELETE OR UPDATE ON public.salmon_daily_records FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''salmon'', ''salmon_daily_records'')","CREATE TRIGGER trg_audit_salmon_entries AFTER INSERT OR DELETE OR UPDATE ON public.salmon_entries FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''salmon'', ''salmon_entries'')","CREATE TRIGGER trg_audit_salmon_manipulations AFTER INSERT OR DELETE OR UPDATE ON public.salmon_manipulations FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''salmon'', ''salmon_manipulations'')","CREATE TRIGGER trg_audit_salmon_targets AFTER INSERT OR DELETE OR UPDATE ON public.salmon_purchase_targets FOR EACH ROW EXECUTE FUNCTION audit_trigger_fn(''salmon'', ''salmon_purchase_targets'')"]'::jsonb OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgfoid='public.handle_first_admin()'::regprocedure) OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid IN ('public.audit_log'::regclass,'public.audit_logs'::regclass,'public.integration_logs'::regclass) AND NOT tgisinternal) THEN RAISE EXCEPTION 'PHASE3_TRIGGER_DRIFT'; END IF;
 IF to_regnamespace('log_private') IS NOT NULL THEN RAISE EXCEPTION 'PHASE3_ALREADY_INSTALLED_OR_SCHEMA_DRIFT'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_object('table',conrelid::regclass::text,'name',conname,'definition',pg_get_constraintdef(oid)) ORDER BY conname) FROM pg_constraint WHERE conrelid IN ('public.audit_log'::regclass,'public.audit_logs'::regclass,'public.integration_logs'::regclass)) IS DISTINCT FROM '[{"name":"audit_log_pkey","table":"audit_log","definition":"PRIMARY KEY (id)"},{"name":"audit_log_user_id_fkey","table":"audit_log","definition":"FOREIGN KEY (user_id) REFERENCES auth.users(id)"},{"name":"audit_logs_company_id_fkey","table":"audit_logs","definition":"FOREIGN KEY (company_id) REFERENCES companies(id)"},{"name":"audit_logs_pkey","table":"audit_logs","definition":"PRIMARY KEY (id)"},{"name":"integration_logs_pkey","table":"integration_logs","definition":"PRIMARY KEY (id)"}]'::jsonb THEN RAISE EXCEPTION 'PHASE3_CONSTRAINT_DRIFT'; END IF;
 IF EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid IN ('public.audit_log'::regclass,'public.audit_logs'::regclass,'public.integration_logs'::regclass) AND attacl IS NOT NULL) THEN RAISE EXCEPTION 'PHASE3_COLUMN_ACL_DRIFT'; END IF;
END $preflight$;
DO $$ BEGIN
 IF has_function_privilege('anon','public.cleanup_old_audit_logs(integer)','EXECUTE') OR has_function_privilege('authenticated','public.cleanup_old_audit_logs(integer)','EXECUTE') OR has_function_privilege('anon','public.refresh_materialized_views()','EXECUTE') OR has_function_privilege('authenticated','public.refresh_materialized_views()','EXECUTE') THEN RAISE EXCEPTION 'PHASE3_REQUIRES_PHASE2_CONTAINMENT'; END IF;
END $$;
CREATE SCHEMA log_private;
REVOKE ALL ON SCHEMA log_private FROM PUBLIC, anon, authenticated, service_role;

-- NULL é ausência de atribuição, nunca prova de evento global.
ALTER TABLE public.audit_log ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.integration_logs ADD COLUMN company_id uuid REFERENCES public.companies(id);
ALTER TABLE public.integration_logs ADD COLUMN actor_user_id uuid;
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['audit_log','audit_logs','integration_logs'] LOOP
  EXECUTE format('ALTER TABLE public.%I ADD COLUMN log_scope text NOT NULL DEFAULT ''AMBIGUOUS'', ADD COLUMN scope_reason text NOT NULL DEFAULT ''legacy_pending''',t);
  EXECUTE format('ALTER TABLE public.%I ADD CONSTRAINT %I CHECK (log_scope IN (''TENANT'',''GLOBAL'',''AMBIGUOUS'') AND (log_scope <> ''TENANT'' OR (company_id IS NOT NULL AND company_id <> ''00000000-0000-0000-0000-000000000001''::uuid)) AND (log_scope <> ''GLOBAL'' OR company_id IS NULL))',t,t||'_scope_check');
  EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE public.%I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON public.%I FROM PUBLIC, anon, authenticated',t);
  EXECUTE format('GRANT SELECT ON public.%I TO authenticated',t);
  EXECUTE format('CREATE INDEX %I ON public.%I(company_id,created_at DESC,id DESC) WHERE log_scope=''TENANT''',t||'_tenant_page',t);
  EXECUTE format('CREATE INDEX %I ON public.%I(created_at DESC,id DESC) WHERE log_scope<>''TENANT''',t||'_restricted_page',t);
 END LOOP;
END $$;

CREATE FUNCTION log_private.is_service() RETURNS boolean LANGUAGE sql STABLE SET search_path='' AS $$
 SELECT COALESCE(NULLIF(current_setting('role',true),'none'),session_user::text)='service_role'
$$;
CREATE FUNCTION log_private.uuid_or_null(value text) RETURNS uuid LANGUAGE plpgsql IMMUTABLE SET search_path='' AS $$
BEGIN RETURN value::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN NULL; END $$;

-- Lista fechada: nunca interpolar uma tabela arbitrária informada pelo cliente.
CREATE FUNCTION log_private.resource_company(entity text, resource_id uuid) RETURNS uuid
LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid;
BEGIN
 IF resource_id IS NULL OR entity IS NULL OR entity <> ALL(ARRAY[
 'fin_lancamentos','fin_lancamento_rateios','fin_contas','fin_contas_pagar','fin_contas_receber',
 'purchase_orders','purchase_order_items','solic_compra_mercado','solic_compra_mercado_item','recebimentos','recebimento_itens',
 'inventarios','inventario_itens','movimentacoes_estoque','produtos','planning_metas_compra',
 'salmon_entries','salmon_manipulations','salmon_daily_records','salmon_config','salmon_purchase_targets',
 'stock_categories','stock_locations','stock_sectors','notifications','suppliers','rh_ferias_afastamentos',
 'requisicao_estoque_itens','requisicoes_estoque','alertas_falta_estoque',
 'ficha_componentes','ficha_componente_itens','canais_venda','precificacao_canal','cenarios_simulacao','config_precificacao'
 ]) THEN RETURN NULL; END IF;
 EXECUTE format('SELECT company_id FROM public.%I WHERE id=$1 FOR SHARE',entity) INTO company USING resource_id;
 RETURN company;
END $$;

-- INVOKER é intencional: identifica o writer SQL real, antes de qualquer elevação.
-- ACL impede INSERT cliente; esta guarda continua fechada mesmo com GRANT acidental.
CREATE FUNCTION log_private.stamp_log() RETURNS trigger LANGUAGE plpgsql SET search_path='' AS $$
DECLARE company uuid; actor uuid; service boolean:=log_private.is_service();
BEGIN
 IF current_user NOT IN ('postgres','service_role') THEN RAISE EXCEPTION 'LOG_WRITER_DENIED' USING ERRCODE='42501'; END IF;
 actor:=CASE WHEN service THEN NULL ELSE auth.uid() END;
 IF TG_TABLE_NAME='audit_log' THEN
  IF NEW.scope_reason='db_trigger' THEN company:=NEW.company_id;
  ELSE company:=log_private.resource_company(NEW.tabela,NEW.registro_id); END IF;
  NEW.user_id:=actor;
 ELSIF TG_TABLE_NAME='audit_logs' THEN
  -- Serviços da Fase 2 têm contrato explícito e nunca dependem do header do browser.
  IF service AND ((NEW.module='system' AND NEW.action IN ('JOB_RUN','JOB_CLEANUP') AND NEW.entity IN ('materialized_views','audit_logs','scheduled-jobs'))
     OR (NEW.module='perf' AND NEW.action='SLOW_QUERY' AND NEW.entity LIKE 'reporting.mv_%')) THEN
   NEW.company_id:=NULL; NEW.log_scope:='GLOBAL'; NEW.scope_reason:='service_job';
   NEW.actor_user_id:=NULL; NEW.actor_email:=NULL; NEW.actor_role:=NULL; NEW.source:='service'; RETURN NEW;
  END IF;
  IF NEW.entity='companies' AND NEW.action IN ('COMPANY_UPDATED','create_company','COMPANY_CREATED') THEN
   IF NOT service AND (actor IS NULL OR NOT public.has_permission(actor,'system:global:manage')) THEN RAISE EXCEPTION 'GLOBAL_LOG_DENIED' USING ERRCODE='42501'; END IF;
   IF NOT EXISTS(SELECT 1 FROM public.companies WHERE id=NEW.entity_id) THEN RAISE EXCEPTION 'LOG_RESOURCE_NOT_FOUND' USING ERRCODE='23514'; END IF;
   NEW.company_id:=NULL; NEW.log_scope:='GLOBAL'; NEW.scope_reason:='company_administration'; NEW.actor_user_id:=actor; RETURN NEW;
  END IF;
  IF NEW.scope_reason IN ('db_trigger','service_event') THEN company:=NEW.company_id;
  ELSIF NEW.entity='notifications' AND NEW.action='MARK_ALL_READ' AND NEW.entity_id IS NULL THEN company:=public.assert_tenant();
  ELSIF NEW.action='STOCK_TRANSFER' AND NEW.entity='movimentacoes_estoque' THEN
   SELECT (array_agg(DISTINCT m.company_id))[1] INTO company FROM public.movimentacoes_estoque m
   WHERE m.reference_type='INTERNAL_TRANSFER' AND m.reference_id=NEW.entity_id::text HAVING count(DISTINCT m.company_id)=1;
  ELSE company:=log_private.resource_company(NEW.entity,NEW.entity_id); END IF;
  IF NEW.scope_reason<>'service_event' THEN NEW.actor_user_id:=actor; NEW.actor_email:=NULL; NEW.actor_role:=NULL; END IF;
 ELSIF TG_TABLE_NAME='integration_logs' THEN
  company:=NEW.company_id; NEW.actor_user_id:=actor;
 END IF;
 IF company IS NULL OR company='00000000-0000-0000-0000-000000000001'::uuid OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=company) THEN
  RAISE EXCEPTION 'LOG_RESOURCE_TENANT_REQUIRED' USING ERRCODE='23514';
 END IF;
 IF NEW.company_id IS NOT NULL AND NEW.company_id<>company THEN RAISE EXCEPTION 'LOG_COMPANY_MISMATCH' USING ERRCODE='42501'; END IF;
 IF NOT service AND actor IS NOT NULL AND public.assert_tenant()<>company THEN RAISE EXCEPTION 'LOG_COMPANY_MISMATCH' USING ERRCODE='42501'; END IF;
 NEW.company_id:=company; NEW.log_scope:='TENANT';
 IF NEW.scope_reason='legacy_pending' THEN NEW.scope_reason:='internal_rpc'; END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER stamp_log BEFORE INSERT ON public.audit_log FOR EACH ROW EXECUTE FUNCTION log_private.stamp_log();
CREATE TRIGGER stamp_log BEFORE INSERT ON public.audit_logs FOR EACH ROW EXECUTE FUNCTION log_private.stamp_log();
CREATE TRIGGER stamp_log BEFORE INSERT ON public.integration_logs FOR EACH ROW EXECUTE FUNCTION log_private.stamp_log();

CREATE OR REPLACE FUNCTION public.audit_trigger_fn() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE before_row jsonb; after_row jsonb; company uuid; resource_id uuid;
BEGIN
 IF TG_OP<>'INSERT' THEN before_row:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN after_row:=to_jsonb(NEW); END IF;
 company:=(COALESCE(after_row,before_row)->>'company_id')::uuid;
 resource_id:=(COALESCE(after_row,before_row)->>'id')::uuid;
 IF TG_OP='UPDATE' AND (before_row->>'company_id') IS DISTINCT FROM (after_row->>'company_id') THEN RAISE EXCEPTION 'LOG_RESOURCE_COMPANY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(company_id,actor_user_id,source,module,entity,entity_id,action,before,after,scope_reason)
 VALUES(company,auth.uid(),'db',TG_ARGV[0],TG_TABLE_NAME,resource_id,CASE TG_OP WHEN 'INSERT' THEN 'CREATE' ELSE TG_OP END,
 before_row-ARRAY['cpf','senha','password','token','card_number','secret'],after_row-ARRAY['cpf','senha','password','token','card_number','secret'],'db_trigger');
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;

-- Auditoria atômica dos antigos INSERTs feitos pelo browser e pela Edge de inventário.
CREATE FUNCTION log_private.audit_resource() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE b jsonb; a jsonb; action text; key text;
BEGIN
 IF TG_OP<>'INSERT' THEN b:=to_jsonb(OLD); END IF;
 IF TG_OP<>'DELETE' THEN a:=to_jsonb(NEW); END IF;
 IF TG_OP='UPDATE' AND b->>'company_id' IS DISTINCT FROM a->>'company_id' THEN RAISE EXCEPTION 'LOG_RESOURCE_COMPANY_IMMUTABLE' USING ERRCODE='42501'; END IF;
 action:=TG_OP;
 IF TG_TABLE_NAME='inventarios' AND a->>'status'='FINALIZADO' AND b->>'status' IS DISTINCT FROM 'FINALIZADO' THEN action:='INVENTARIO_FINALIZADO'; END IF;
 FOR key IN SELECT jsonb_object_keys(COALESCE(a,b)) LOOP
  IF key NOT IN ('name','description','is_active','sort_order','status','title','score_risco','flag_risco') THEN CONTINUE; END IF;
  IF TG_OP='UPDATE' AND b->key IS NOT DISTINCT FROM a->key THEN CONTINUE; END IF;
  INSERT INTO public.audit_log(tabela,registro_id,acao,campo,valor_anterior,valor_novo,company_id,scope_reason)
  VALUES(TG_TABLE_NAME,(COALESCE(a,b)->>'id')::uuid,action,key,b->>key,a->>key,(COALESCE(a,b)->>'company_id')::uuid,'db_trigger');
 END LOOP;
 IF TG_OP='DELETE' THEN RETURN OLD; ELSE RETURN NEW; END IF;
END $$;
CREATE TRIGGER audit_resource AFTER INSERT OR UPDATE OR DELETE ON public.stock_categories FOR EACH ROW EXECUTE FUNCTION log_private.audit_resource();
CREATE TRIGGER audit_resource AFTER INSERT OR UPDATE OR DELETE ON public.stock_locations FOR EACH ROW EXECUTE FUNCTION log_private.audit_resource();
CREATE TRIGGER audit_resource AFTER INSERT OR UPDATE OR DELETE ON public.stock_sectors FOR EACH ROW EXECUTE FUNCTION log_private.audit_resource();
CREATE TRIGGER audit_resource AFTER INSERT OR UPDATE OR DELETE ON public.purchase_orders FOR EACH ROW EXECUTE FUNCTION log_private.audit_resource();
CREATE TRIGGER audit_resource AFTER INSERT OR UPDATE OR DELETE ON public.inventarios FOR EACH ROW EXECUTE FUNCTION log_private.audit_resource();

CREATE OR REPLACE FUNCTION public.log_audit(p_source text,p_module text,p_entity text,p_entity_id uuid,p_action text,p_before jsonb DEFAULT NULL,p_after jsonb DEFAULT NULL,p_metadata jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 INSERT INTO public.audit_logs(source,module,entity,entity_id,action,before,after,metadata)
 VALUES('rpc',p_module,p_entity,p_entity_id,p_action,p_before,p_after,p_metadata);
END $$;
CREATE OR REPLACE FUNCTION public.log_audit(p_source text,p_module text,p_entity text,p_entity_id text,p_action text,p_before jsonb DEFAULT NULL,p_after jsonb DEFAULT NULL,p_metadata jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF p_entity_id IS NOT NULL AND log_private.uuid_or_null(p_entity_id) IS NULL THEN RAISE EXCEPTION 'LOG_INVALID_RESOURCE_ID' USING ERRCODE='22023'; END IF;
 PERFORM public.log_audit(p_source,p_module,p_entity,log_private.uuid_or_null(p_entity_id),p_action,p_before,p_after,p_metadata);
END $$;
CREATE OR REPLACE FUNCTION public.audit_log_write(_module text,_action text,_entity_type text,_entity_id text DEFAULT NULL,_before jsonb DEFAULT NULL,_after jsonb DEFAULT NULL,_metadata jsonb DEFAULT NULL,_severity text DEFAULT 'INFO')
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_tenant();
 IF _entity_id IS NOT NULL AND log_private.uuid_or_null(_entity_id) IS NULL THEN RAISE EXCEPTION 'LOG_INVALID_RESOURCE_ID' USING ERRCODE='22023'; END IF;
 INSERT INTO public.audit_logs(company_id,actor_user_id,source,module,entity,entity_id,action,before,after,metadata,severity)
 VALUES(public.assert_tenant(),auth.uid(),'rpc',_module,_entity_type,log_private.uuid_or_null(_entity_id),_action,_before,_after,_metadata,_severity);
END $$;
REVOKE ALL ON FUNCTION public.log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb), public.log_audit(text,text,text,text,text,jsonb,jsonb,jsonb), public.audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text),public.handle_first_admin(),public.audit_trigger_fn() FROM PUBLIC,anon,authenticated,service_role;

-- Substitui a antiga API genérica por entrada exclusiva das Edges autenticadas.
CREATE FUNCTION public.service_write_audit(p_company_id uuid,p_actor_id uuid,p_module text,p_action text,p_entity text,p_entity_id uuid DEFAULT NULL,p_before jsonb DEFAULT NULL,p_after jsonb DEFAULT NULL,p_metadata jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid;
BEGIN
 IF NOT log_private.is_service() THEN RAISE EXCEPTION 'SERVICE_ONLY' USING ERRCODE='42501'; END IF;
 IF p_actor_id IS NULL OR NOT public.is_company_member(p_actor_id,p_company_id) THEN RAISE EXCEPTION 'COMPANY_ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF p_module IS NULL OR p_module NOT IN ('ficha_tecnica','estoque','inventario','compras') THEN RAISE EXCEPTION 'LOG_MODULE_DENIED' USING ERRCODE='22023'; END IF;
 company:=log_private.resource_company(p_entity,p_entity_id);
 -- Eventos agregados possuem contrato explícito, sem fingir um recurso individual.
 IF p_entity_id IS NULL AND ((p_entity='config_precificacao' AND p_action IN ('UPDATE','SYNC_AUTO')) OR (p_entity='ficha_componentes' AND p_action='RECALCULATE_ALL')) AND p_module='ficha_tecnica' THEN company:=p_company_id; END IF;
 IF company IS DISTINCT FROM p_company_id THEN RAISE EXCEPTION 'LOG_RESOURCE_COMPANY_MISMATCH' USING ERRCODE='42501'; END IF;
 INSERT INTO public.audit_logs(company_id,actor_user_id,source,module,entity,entity_id,action,before,after,metadata,scope_reason)
 VALUES(company,p_actor_id,'edge_service',p_module,p_entity,p_entity_id,p_action,p_before,p_after,p_metadata,'service_event');
END $$;
REVOKE ALL ON FUNCTION public.service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.log_integration_error(p_module text,p_action text,p_reference_id text,p_error_message text,p_payload jsonb DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE company uuid; other_company uuid;
BEGIN
 IF p_module<>'salmon_to_stock' THEN RAISE EXCEPTION 'LOG_MODULE_DENIED' USING ERRCODE='22023'; END IF;
 company:=log_private.resource_company('salmon_entries',log_private.uuid_or_null(p_reference_id));
 other_company:=log_private.resource_company('salmon_manipulations',log_private.uuid_or_null(p_reference_id));
 IF company IS NOT NULL AND other_company IS NOT NULL AND company<>other_company THEN RAISE EXCEPTION 'LOG_RESOURCE_CONFLICT' USING ERRCODE='23514'; END IF;
 company:=COALESCE(company,other_company);
 INSERT INTO public.integration_logs(company_id,module,action,reference_id,error_message,payload,scope_reason)
 VALUES(company,p_module,p_action,p_reference_id,p_error_message,p_payload,'internal_rpc');
END $$;
REVOKE ALL ON FUNCTION public.log_integration_error(text,text,text,text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- As duas fronteiras são RESTRICTIVE: uma policy permissiva futura não as contorna.
DO $$ DECLARE r record; t text; permission text; BEGIN
 FOR r IN SELECT tablename,policyname FROM pg_policies WHERE schemaname='public' AND tablename IN ('audit_log','audit_logs','integration_logs') LOOP EXECUTE format('DROP POLICY %I ON public.%I',r.policyname,r.tablename); END LOOP;
 FOREACH t IN ARRAY ARRAY['audit_log','audit_logs','integration_logs'] LOOP
  permission:=CASE WHEN t='audit_log' THEN 'configuracoes:auditoria-seguranca:view' ELSE 'configuracoes:auditoria-sistema:view' END;
  EXECUTE format('CREATE POLICY log_read ON public.%I FOR SELECT TO authenticated USING(true)',t);
  EXECUTE format('CREATE POLICY log_tenant_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING(log_scope=''TENANT'' AND company_id=(SELECT public.get_current_company_id()))',t);
  EXECUTE format('CREATE POLICY log_permission_boundary ON public.%I AS RESTRICTIVE FOR SELECT TO authenticated USING((SELECT public.has_any_permission(auth.uid(),ARRAY[%L,''system:read'',''system:global:manage'']))%s)',t,permission,CASE WHEN t='audit_logs' THEN ' OR (module=''perf'' AND (SELECT public.has_permission(auth.uid(),''configuracoes:performance:view''))) OR (module=''financeiro'' AND (SELECT public.has_permission(auth.uid(),''financeiro:auditoria:view'')))' ELSE '' END);
 END LOOP;
END $$;

-- Caminho global explícito: nunca usa system:admin, nunca alarga SELECT direto.
CREATE FUNCTION public.list_restricted_logs(p_table text,p_scope text DEFAULT 'GLOBAL',p_limit integer DEFAULT 50,p_cursor_at timestamptz DEFAULT NULL,p_cursor_id uuid DEFAULT NULL,p_module text DEFAULT NULL,p_action text DEFAULT NULL,p_entity text DEFAULT NULL)
RETURNS SETOF jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 PERFORM public.assert_tenant();
 IF NOT public.has_permission(auth.uid(),'system:global:manage') THEN RAISE EXCEPTION 'GLOBAL_LOG_DENIED' USING ERRCODE='42501'; END IF;
 IF p_table IS NULL OR p_table NOT IN ('audit_log','audit_logs','integration_logs') OR p_scope IS NULL OR p_scope NOT IN ('GLOBAL','AMBIGUOUS') OR p_limit IS NULL OR p_limit NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'LOG_INVALID_FILTER' USING ERRCODE='22023'; END IF;
 RETURN QUERY EXECUTE format('SELECT to_jsonb(l) FROM public.%I l WHERE log_scope=$1 AND ($2::timestamptz IS NULL OR (created_at,id)<($2,$3)) AND ($5::text IS NULL OR to_jsonb(l)->>''module''=$5) AND ($6::text IS NULL OR COALESCE(to_jsonb(l)->>''action'',to_jsonb(l)->>''acao'')=$6) AND ($7::text IS NULL OR COALESCE(to_jsonb(l)->>''entity'',to_jsonb(l)->>''tabela'')=$7) ORDER BY created_at DESC,id DESC LIMIT $4',p_table) USING p_scope,p_cursor_at,p_cursor_id,p_limit,p_module,p_action,p_entity;
END $$;
REVOKE ALL ON FUNCTION public.list_restricted_logs(text,text,integer,timestamptz,uuid,text,text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.list_restricted_logs(text,text,integer,timestamptz,uuid,text,text,text) TO authenticated;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA log_private FROM PUBLIC,anon,authenticated,service_role;
-- stamp_log INVOKER precisa dos helpers apenas no caminho direto do serviço.
GRANT USAGE ON SCHEMA log_private TO service_role;
GRANT EXECUTE ON FUNCTION log_private.is_service(),log_private.resource_company(text,uuid) TO service_role;

CREATE OR REPLACE FUNCTION public._guarded_list_fin_audit_logs(p_entidade text DEFAULT NULL::text, p_acao text DEFAULT NULL::text, p_search text DEFAULT NULL::text, p_dias integer DEFAULT 30, p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone, p_cursor_id uuid DEFAULT NULL::uuid, p_limit integer DEFAULT 50)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_desde timestamptz;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:auditoria:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_desde := (now() AT TIME ZONE 'America/Sao_Paulo') - make_interval(days => p_dias);

  WITH unified_logs AS (
    -- fin_audit_logs
    SELECT
      f.id,
      f.created_at,
      f.acao,
      f.entidade,
      f.entidade_id::text AS entidade_id,
      f.justificativa,
      f.antes,
      f.depois,
      f.user_id,
      'fin_audit_logs'::text AS origem_log,
      NULL::jsonb AS metadata
    FROM fin_audit_logs f
    WHERE f.company_id = v_company_id
      AND f.created_at >= v_desde

    UNION ALL

    -- audit_logs where module = financeiro or entity starts with fin_
    SELECT
      a.id,
      a.created_at,
      a.action AS acao,
      a.entity AS entidade,
      a.entity_id::text AS entidade_id,
      NULL::text AS justificativa,
      a.before AS antes,
      a.after AS depois,
      a.actor_user_id AS user_id,
      'audit_logs'::text AS origem_log,
      a.metadata
    FROM audit_logs a
    WHERE a.log_scope = 'TENANT' AND a.company_id = v_company_id
      AND a.created_at >= v_desde
      AND (a.module = 'financeiro' OR a.entity LIKE 'fin_%')
  ),
  filtered AS (
    SELECT
      ul.*,
      p.nome AS user_nome,
      p.email AS user_email
    FROM unified_logs ul
    LEFT JOIN profiles p ON p.id = ul.user_id
    WHERE
      (p_entidade IS NULL OR ul.entidade = p_entidade)
      AND (p_acao IS NULL OR ul.acao = p_acao)
      AND (p_search IS NULL OR (
        ul.entidade ILIKE '%' || p_search || '%'
        OR ul.acao ILIKE '%' || p_search || '%'
        OR ul.justificativa ILIKE '%' || p_search || '%'
        OR p.nome ILIKE '%' || p_search || '%'
        OR p.email ILIKE '%' || p_search || '%'
        OR ul.entidade_id ILIKE '%' || p_search || '%'
      ))
      AND (
        p_cursor_created_at IS NULL
        OR (ul.created_at, ul.id) < (p_cursor_created_at, p_cursor_id)
      )
    ORDER BY ul.created_at DESC, ul.id DESC
    LIMIT p_limit + 1
  ),
  page AS (
    SELECT * FROM filtered LIMIT p_limit
  ),
  summary AS (
    SELECT
      COUNT(*) FILTER (WHERE TRUE) AS total,
      COUNT(*) FILTER (WHERE acao = 'INSERT') AS inserts,
      COUNT(*) FILTER (WHERE acao = 'UPDATE') AS updates,
      COUNT(*) FILTER (WHERE acao = 'DELETE') AS deletes,
      COUNT(DISTINCT user_id) AS usuarios_ativos
    FROM unified_logs ul
    WHERE
      (p_entidade IS NULL OR ul.entidade = p_entidade)
      AND (p_acao IS NULL OR ul.acao = p_acao)
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', pg.id,
        'created_at', pg.created_at,
        'acao', pg.acao,
        'entidade', pg.entidade,
        'entidade_id', pg.entidade_id,
        'justificativa', pg.justificativa,
        'antes', pg.antes,
        'depois', pg.depois,
        'user_id', pg.user_id,
        'user_nome', pg.user_nome,
        'user_email', pg.user_email,
        'origem_log', pg.origem_log,
        'metadata', pg.metadata
      ) ORDER BY pg.created_at DESC, pg.id DESC)
      FROM page pg
    ), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) FROM filtered) > p_limit,
    'next_cursor_created_at', (SELECT created_at FROM page ORDER BY created_at ASC, id ASC LIMIT 1),
    'next_cursor_id', (SELECT id FROM page ORDER BY created_at ASC, id ASC LIMIT 1),
    'summary', (SELECT jsonb_build_object(
      'total', total,
      'inserts', inserts,
      'updates', updates,
      'deletes', deletes,
      'usuarios_ativos', usuarios_ativos
    ) FROM summary)
  ) INTO v_result;

  RETURN v_result;
END;
$function$
;
CREATE OR REPLACE FUNCTION public.rpc_recebimentos_close(p_recebimento_id uuid, p_enviar_ao_estoque boolean DEFAULT false, p_observacoes text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_rec recebimentos%ROWTYPE;
BEGIN
  -- Auth check
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Permission guard
  IF NOT has_permission(v_user_id, 'compras:recebimentos:close') THEN
    RAISE EXCEPTION 'Sem permissão (compras:recebimentos:close)';
  END IF;

  -- Get recebimento
  SELECT * INTO v_rec FROM recebimentos WHERE id = p_recebimento_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Recebimento não encontrado';
  END IF;

  IF v_rec.status <> 'AGUARDANDO_RECEBIMENTO' THEN
    RAISE EXCEPTION 'Recebimento não está aguardando (status: %)', v_rec.status;
  END IF;

  -- Check all items are confirmed
  IF EXISTS (
    SELECT 1 FROM recebimento_itens
    WHERE recebimento_id = p_recebimento_id AND recebido = false
  ) THEN
    RAISE EXCEPTION 'Confirme todos os itens antes de fechar o recebimento';
  END IF;

  -- Update recebimento status
  UPDATE recebimentos SET
    status = 'RECEBIDO_CONFIRMADO',
    recebido_por = v_user_id,
    recebido_em = now(),
    enviar_ao_estoque = p_enviar_ao_estoque,
    observacoes = p_observacoes,
    updated_at = now()
  WHERE id = p_recebimento_id;

  -- Update linked solicitation
  UPDATE solic_compra_mercado SET
    status = 'RECEBIDO_CONFIRMADO',
    updated_at = now()
  WHERE id = v_rec.solicitacao_id;

  -- Create confirmation event
  INSERT INTO confirmacoes_recebimento (
    recebimento_id, solicitacao_id, mensagem, criado_por, responsavel_compra_id
  )
  SELECT
    p_recebimento_id,
    v_rec.solicitacao_id,
    'Recebimento confirmado via RPC — ' || COALESCE(p_observacoes, ''),
    v_user_id,
    s.responsavel_user_id
  FROM solic_compra_mercado s
  WHERE s.id = v_rec.solicitacao_id;

  -- Audit
  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('recebimentos', p_recebimento_id, 'RECEBIMENTO_CONFIRMADO', v_user_id);

  RETURN jsonb_build_object(
    'success', true,
    'recebimento_id', p_recebimento_id,
    'enviar_ao_estoque', p_enviar_ao_estoque
  );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.stock_transfer_between_locations(p_product_id uuid, p_from_location text, p_to_location text, p_quantity numeric, p_reason text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id uuid;
    v_company_id uuid;
    v_product record;
    v_saldo numeric;
    v_cost_base numeric;
    v_transfer_group uuid;
    v_mov_out_id uuid;
    v_mov_in_id uuid;
    v_today text;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'P0001';
    END IF;

    v_company_id := public.assert_tenant();

    IF v_company_id IS NULL OR v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = 'P0001';
    END IF;

    IF NOT public.has_any_permission(v_actor_id, ARRAY['estoque:transferencias:create', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Permissão negada: estoque:transferencias:create necessário' USING ERRCODE = 'P0001';
    END IF;

    IF p_from_location IS NULL OR trim(p_from_location) = '' THEN
        RAISE EXCEPTION 'Local de origem é obrigatório';
    END IF;
    IF p_to_location IS NULL OR trim(p_to_location) = '' THEN
        RAISE EXCEPTION 'Local de destino é obrigatório';
    END IF;
    IF trim(lower(p_from_location)) = trim(lower(p_to_location)) THEN
        RAISE EXCEPTION 'Local de origem e destino devem ser diferentes';
    END IF;
    IF p_quantity IS NULL OR p_quantity <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser maior que zero';
    END IF;

    SELECT * INTO v_product
    FROM public.produtos
    WHERE id = p_product_id AND company_id = v_company_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Produto não encontrado';
    END IF;
    IF NOT v_product.ativo THEN
        RAISE EXCEPTION 'Produto inativo';
    END IF;

    SELECT COALESCE(SUM(
        CASE WHEN direction = 'IN' THEN quantidade ELSE -quantidade END
    ), 0) INTO v_saldo
    FROM public.movimentacoes_estoque
    WHERE produto_id = p_product_id
      AND company_id = v_company_id
      AND status = 'ATIVO';

    IF v_saldo < p_quantity THEN
        RAISE EXCEPTION 'Saldo insuficiente. Disponível: % %', round(v_saldo, 2), v_product.unidade_medida;
    END IF;

    v_cost_base := COALESCE(NULLIF(v_product.avg30_cost_base_unit, 0),
                            NULLIF(v_product.last_cost_base_unit, 0),
                            NULLIF(v_product.default_cost_base_unit, 0),
                            0);

    v_transfer_group := gen_random_uuid();
    v_today := to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

    INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, quantidade,
        custo_unitario, custo_total, origem, observacao,
        created_by, setor, reference_type, reference_id,
        internal_transfer, source_module, direction
    ) VALUES (
        p_product_id, v_company_id, v_today, 'SAIDA', p_quantity,
        round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
        'Transferência Interna',
        format('Transferência: %s → %s. %s', trim(p_from_location), trim(p_to_location), COALESCE(p_reason, '')),
        v_actor_id, trim(p_from_location), 'INTERNAL_TRANSFER', v_transfer_group::text,
        true, 'estoque', 'OUT'
    )
    RETURNING id INTO v_mov_out_id;

    INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, quantidade,
        custo_unitario, custo_total, origem, observacao,
        created_by, setor, reference_type, reference_id,
        internal_transfer, source_module, direction
    ) VALUES (
        p_product_id, v_company_id, v_today, 'ENTRADA', p_quantity,
        round(v_cost_base, 4), round(p_quantity * v_cost_base, 2),
        'Transferência Interna',
        format('Transferência: %s → %s. %s', trim(p_from_location), trim(p_to_location), COALESCE(p_reason, '')),
        v_actor_id, trim(p_to_location), 'INTERNAL_TRANSFER', v_transfer_group::text,
        true, 'estoque', 'IN'
    )
    RETURNING id INTO v_mov_in_id;

    INSERT INTO public.audit_logs (
        action, entity, entity_id, module, actor_user_id, company_id,
        severity, source, success, metadata
    ) VALUES (
        'STOCK_TRANSFER', 'movimentacoes_estoque', v_transfer_group,
        'estoque', v_actor_id, v_company_id,
        'info', 'rpc', true,
        jsonb_build_object(
            'product_id', p_product_id,
            'product_name', v_product.nome_produto,
            'from_location', trim(p_from_location),
            'to_location', trim(p_to_location),
            'quantity', p_quantity,
            'unit', v_product.unidade_medida,
            'cost_unit', round(v_cost_base, 4),
            'cost_total', round(p_quantity * v_cost_base, 2),
            'reason', COALESCE(p_reason, ''),
            'mov_out_id', v_mov_out_id,
            'mov_in_id', v_mov_in_id
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'transfer_group_id', v_transfer_group,
        'mov_out_id', v_mov_out_id,
        'mov_in_id', v_mov_in_id,
        'quantity', p_quantity,
        'from_location', trim(p_from_location),
        'to_location', trim(p_to_location),
        'cost_total', round(p_quantity * v_cost_base, 2)
    );
END;
$function$
;
CREATE OR REPLACE FUNCTION public.create_quick_inventory_atomic(p_items jsonb, p_observacao text DEFAULT NULL::text, p_idempotency_key text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
    v_actor_id       uuid;
    v_company_id     uuid;
    v_inv_id         uuid;
    v_item           jsonb;
    v_product        record;
    v_saldo          numeric;
    v_counted        numeric;
    v_diff           numeric;
    v_diff_pct       numeric;
    v_cost_base      numeric;
    v_impact         numeric;
    v_today          text;
    v_now            timestamptz;
    v_total_items    int := 0;
    v_adjusted       int := 0;
    v_total_impact   numeric := 0;
    v_acuracia_sum   numeric := 0;
    v_acuracia_count int := 0;
    v_turno_id       uuid;
BEGIN
    v_actor_id := auth.uid();
    IF v_actor_id IS NULL THEN
        RAISE EXCEPTION 'Não autenticado' USING ERRCODE = 'P0001';
    END IF;

    IF NOT has_any_permission(v_actor_id, ARRAY['inventario:rapido:create', 'inventario:criar:create', 'system:global:manage']) THEN
        RAISE EXCEPTION 'Forbidden: inventario:rapido:create required';
    END IF;

    v_company_id := public.assert_tenant();

    IF v_company_id IS NULL OR v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
        RAISE EXCEPTION 'Tenant inválido' USING ERRCODE = 'P0001';
    END IF;

    IF p_idempotency_key IS NOT NULL AND p_idempotency_key <> '' THEN
        IF EXISTS (
            SELECT 1 FROM public.inventarios
            WHERE company_id = v_company_id
              AND idempotency_key = p_idempotency_key
        ) THEN
            RETURN jsonb_build_object('success', false, 'reason', 'duplicate', 'message', 'Inventário rápido já registrado');
        END IF;
    END IF;

    IF p_items IS NULL OR jsonb_array_length(p_items) = 0 THEN
        RAISE EXCEPTION 'Nenhum item informado para contagem';
    END IF;

    v_now := now();
    v_today := to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM-DD');

    SELECT id INTO v_turno_id
    FROM public.turnos
    WHERE company_id = v_company_id
    ORDER BY created_at ASC
    LIMIT 1;

    v_inv_id := gen_random_uuid();
    BEGIN
        INSERT INTO public.inventarios (
            id, company_id, tipo, status, data, hora,
            responsavel_user_id, observacao, idempotency_key, turno_id
        ) VALUES (
            v_inv_id, v_company_id, 'rapido', 'EM_CONTAGEM', v_today,
            to_char(v_now AT TIME ZONE 'America/Sao_Paulo', 'HH24:MI:SS'),
            v_actor_id, COALESCE(p_observacao, 'Inventário Rápido'),
            COALESCE(NULLIF(p_idempotency_key, ''), gen_random_uuid()::text),
            v_turno_id
        );
    EXCEPTION WHEN unique_violation THEN
        RETURN jsonb_build_object('success', false, 'reason', 'duplicate', 'message', 'Inventário rápido já registrado');
    END;

    FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
    LOOP
        v_counted := COALESCE((v_item->>'counted_quantity')::numeric, 0);
        IF v_counted < 0 THEN
            RAISE EXCEPTION 'Quantidade negativa não permitida para produto %', v_item->>'product_id';
        END IF;

        SELECT * INTO v_product
        FROM public.produtos
        WHERE id = (v_item->>'product_id')::uuid
          AND company_id = v_company_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Produto não encontrado: %', v_item->>'product_id';
        END IF;
        IF NOT v_product.ativo THEN
            RAISE EXCEPTION 'Produto inativo: %', v_product.nome_produto;
        END IF;

        SELECT COALESCE(SUM(
            CASE WHEN direction = 'IN' THEN quantidade ELSE -quantidade END
        ), 0) INTO v_saldo
        FROM public.movimentacoes_estoque
        WHERE produto_id = v_product.id
          AND company_id = v_company_id
          AND status = 'ATIVO';

        v_diff := v_counted - v_saldo;
        v_diff_pct := CASE WHEN v_saldo > 0 THEN round((v_diff / v_saldo) * 100, 2) ELSE 0 END;

        v_cost_base := COALESCE(NULLIF(v_product.avg30_cost_base_unit, 0),
                                NULLIF(v_product.last_cost_base_unit, 0),
                                NULLIF(v_product.default_cost_base_unit, 0), 0);
        v_impact := round(abs(v_diff) * v_cost_base, 2);

        INSERT INTO public.inventario_itens (
            inventario_id, company_id, produto_id, tipo_item,
            saldo_teorico, contagem_fisica,
            diferenca_qtd, diferenca_percent,
            custo_snapshot, impacto_financeiro,
            classificacao, contado_por, contagem_inicio, contagem_fim
        ) VALUES (
            v_inv_id, v_company_id, v_product.id, 'geral',
            v_saldo, v_counted,
            v_diff, v_diff_pct,
            v_cost_base, v_impact,
            CASE
                WHEN abs(v_diff_pct) > 10 OR v_impact > 500 THEN 'CRITICO'
                WHEN abs(v_diff_pct) > 5 OR v_impact > 100 THEN 'ALERTA'
                ELSE 'NORMAL'
            END,
            v_actor_id, v_now, v_now
        );

        v_total_items := v_total_items + 1;
        v_total_impact := v_total_impact + v_impact;

        IF v_saldo > 0 THEN
            v_acuracia_sum := v_acuracia_sum + LEAST(v_counted / v_saldo, 1.0);
            v_acuracia_count := v_acuracia_count + 1;
        ELSIF v_counted = 0 THEN
            v_acuracia_sum := v_acuracia_sum + 1.0;
            v_acuracia_count := v_acuracia_count + 1;
        END IF;

        IF v_diff <> 0 THEN
            INSERT INTO public.movimentacoes_estoque (
                produto_id, company_id, data, tipo, quantidade,
                custo_unitario, custo_total, origem, observacao,
                created_by, reference_type, reference_id,
                source_module, direction
            ) VALUES (
                v_product.id, v_company_id, v_today,
                CASE WHEN v_diff > 0 THEN 'ENTRADA' ELSE 'SAIDA' END,
                abs(v_diff),
                round(v_cost_base, 4),
                round(abs(v_diff) * v_cost_base, 2),
                'Inventário Rápido',
                format('Ajuste inventário rápido: %s (%s → %s %s)',
                    v_product.nome_produto,
                    round(v_saldo, 2)::text,
                    round(v_counted, 2)::text,
                    v_product.unidade_medida),
                v_actor_id,
                'QUICK_INVENTORY', v_inv_id::text,
                'inventario',
                CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END
            );
            v_adjusted := v_adjusted + 1;
        END IF;
    END LOOP;

    UPDATE public.inventarios
    SET status = 'FINALIZADO',
        finalizado_em = v_now,
        finalizado_por = v_actor_id,
        acuracia_percent = CASE WHEN v_acuracia_count > 0
            THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2)
            ELSE 100 END,
        drift_total_valor = v_total_impact,
        updated_at = v_now
    WHERE id = v_inv_id;

    INSERT INTO public.audit_logs (
        action, entity, entity_id, module, actor_user_id, company_id,
        severity, source, success, metadata
    ) VALUES (
        'QUICK_INVENTORY', 'inventarios', v_inv_id,
        'inventario', v_actor_id, v_company_id,
        CASE WHEN v_total_impact > 500 THEN 'warning' ELSE 'info' END,
        'rpc', true,
        jsonb_build_object(
            'total_items', v_total_items,
            'adjusted', v_adjusted,
            'total_impact', v_total_impact,
            'acuracia', CASE WHEN v_acuracia_count > 0
                THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2)
                ELSE 100 END
        )
    );

    RETURN jsonb_build_object(
        'success', true,
        'inventory_id', v_inv_id,
        'total_items', v_total_items,
        'adjusted', v_adjusted,
        'total_impact', v_total_impact
    );
END;
$function$
;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT DISTINCT tgrelid::regclass::text AS entity FROM pg_trigger WHERE tgfoid='public.audit_trigger_fn()'::regprocedure LOOP
  PERFORM log_private.resource_company(replace(r.entity,'public.',''),'00000000-0000-0000-0000-000000000003'::uuid);
 END LOOP;
 PERFORM company_id, log_scope FROM public.audit_logs LIMIT 0;
 PERFORM company_id, entidade_id FROM public.fin_audit_logs LIMIT 0;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

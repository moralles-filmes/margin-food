BEGIN TRANSACTION READ ONLY;
SELECT policyname,permissive,cmd,roles,qual,with_check FROM pg_policies WHERE schemaname='public' AND tablename='produtos' ORDER BY policyname;
SELECT p.oid::regprocedure::text AS signature,pg_get_userbyid(proowner) AS owner,prosecdef,proconfig,
 has_function_privilege('anon',p.oid,'EXECUTE') AS anon,
 has_function_privilege('authenticated',p.oid,'EXECUTE') AS authenticated,
 has_function_privilege('service_role',p.oid,'EXECUTE') AS service
FROM pg_proc p WHERE pronamespace='public'::regnamespace AND proname IN ('deactivate_produto','generate_next_sku','produtos_force_company_id','recalc_product_costs','ensure_salmon_raw_product','fn_recompute_product_saldo');
DO $$ BEGIN
 IF has_function_privilege('anon','public.deactivate_produto(uuid)','EXECUTE') OR has_function_privilege('service_role','public.deactivate_produto(uuid)','EXECUTE') OR NOT has_function_privilege('authenticated','public.deactivate_produto(uuid)','EXECUTE') OR has_function_privilege('authenticated','public.recalc_product_costs(uuid)','EXECUTE') OR has_table_privilege('authenticated','public.produtos','TRUNCATE') THEN RAISE EXCEPTION 'PHASE6_ACL_INVALID'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='supplier_prices_product_tenant_fk' AND convalidated) OR NOT EXISTS(SELECT 1 FROM pg_indexes WHERE indexname='produtos_one_active_salmon_raw') THEN RAISE EXCEPTION 'PHASE6_DEPENDENCY_MISSING'; END IF;
 IF EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='produtos' AND policyname IN ('tenant_insert','tenant_update','tenant_delete')) THEN RAISE EXCEPTION 'PHASE6_PARALLEL_POLICY'; END IF;
END $$;
ROLLBACK;

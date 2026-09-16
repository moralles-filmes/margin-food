BEGIN;
SET LOCAL lock_timeout='5s';
DO $preflight$
DECLARE r record;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.receive_purchase_order_atomic(uuid,jsonb,jsonb)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='26322b53f62d1d1ccc824c759300cc39' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a)='["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE5_FUNCTION_DRIFT: receive_purchase_order_atomic(uuid,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.validate_supplier_item_price()') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='136331a3edc3c3a053dc9920933e8b8f' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a)='["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE5_FUNCTION_DRIFT: validate_supplier_item_price()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.upsert_supplier(text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='ea5e790b1608da95c56d2731f8ddb9ac' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a)='["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE5_FUNCTION_DRIFT: upsert_supplier(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.get_supplier_ranking(uuid,text,integer,integer,text)') AND md5(replace(pg_get_functiondef(oid),chr(13),''))='b6cecd23c7303fd4bf3e1ab6f3857f92' AND pg_get_userbyid(proowner)='postgres' AND (SELECT jsonb_agg(a::text ORDER BY a::text) FROM unnest(proacl) a)='["=X/postgres","authenticated=X/postgres","postgres=X/postgres","service_role=X/postgres"]'::jsonb) THEN RAISE EXCEPTION 'PHASE5_FUNCTION_DRIFT: get_supplier_ranking(uuid,text,integer,integer,text)'; END IF;
 IF (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname=ANY(ARRAY['upsert_supplier','validate_supplier_item_price','get_supplier_ranking','receive_purchase_order_atomic']))<>4 OR to_regprocedure('public.upsert_supplier_price(text,uuid,numeric,text)') IS NOT NULL THEN RAISE EXCEPTION 'PHASE5_OVERLOAD_DRIFT'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='suppliers') <> $expected$[["id","uuid","NO","gen_random_uuid()"],["name","text","NO",null],["is_active","bool","NO","true"],["contact_info","jsonb","YES","'{}'::jsonb"],["created_at","timestamptz","NO","now()"],["updated_at","timestamptz","NO","now()"],["company_id","uuid","NO","get_current_company_id()"],["minimum_order_value","numeric","NO","0"],["minimum_order_quantity","numeric","NO","0"],["delivery_days","int4","YES",null],["payment_terms","text","YES",null],["whatsapp_number","text","YES",null],["categories_served","_text","NO","'{}'::text[]"],["cotacao_notes","text","YES",null]]$expected$::jsonb THEN RAISE EXCEPTION 'PHASE5_COLUMN_DRIFT: suppliers'; END IF;
 IF NOT ((SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check)) FROM pg_policies WHERE schemaname='public' AND tablename='suppliers') @> $expected$[["compras:fornecedores:view suppliers","PERMISSIVE",["authenticated"],"SELECT","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view'::text, 'compras:lista:view'::text, 'compras:pedidos:view'::text, 'system:global:manage'::text]) AS has_any_permission))",null],["multiunit_scope_boundary","RESTRICTIVE",["authenticated"],"ALL","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) OR (( SELECT (NULLIF(current_setting('request.headers'::text, true), ''::text) IS NULL)) AND is_company_member(( SELECT auth.uid() AS uid), company_id)))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"],["suppliers_perm_delete","PERMISSIVE",["authenticated"],"DELETE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:delete'::text, 'system:global:manage'::text]) AS has_any_permission))",null],["suppliers_perm_insert","PERMISSIVE",["authenticated"],"INSERT",null,"((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:create'::text, 'system:global:manage'::text]) AS has_any_permission))"],["suppliers_perm_update","PERMISSIVE",["authenticated"],"UPDATE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"]]$expected$::jsonb AND (SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check)) FROM pg_policies WHERE schemaname='public' AND tablename='suppliers') <@ $expected$[["compras:fornecedores:view suppliers","PERMISSIVE",["authenticated"],"SELECT","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view'::text, 'compras:lista:view'::text, 'compras:pedidos:view'::text, 'system:global:manage'::text]) AS has_any_permission))",null],["multiunit_scope_boundary","RESTRICTIVE",["authenticated"],"ALL","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) OR (( SELECT (NULLIF(current_setting('request.headers'::text, true), ''::text) IS NULL)) AND is_company_member(( SELECT auth.uid() AS uid), company_id)))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"],["suppliers_perm_delete","PERMISSIVE",["authenticated"],"DELETE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:delete'::text, 'system:global:manage'::text]) AS has_any_permission))",null],["suppliers_perm_insert","PERMISSIVE",["authenticated"],"INSERT",null,"((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:create'::text, 'system:global:manage'::text]) AS has_any_permission))"],["suppliers_perm_update","PERMISSIVE",["authenticated"],"UPDATE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"]]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_POLICY_DRIFT: suppliers'; END IF;
 IF NOT ((SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND NOT tgisinternal) @> $expected$["CREATE TRIGGER trg_block_placeholder_company BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION trg_block_placeholder_company()"]$expected$::jsonb AND (SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND NOT tgisinternal) <@ $expected$["CREATE TRIGGER trg_block_placeholder_company BEFORE INSERT OR UPDATE ON public.suppliers FOR EACH ROW EXECUTE FUNCTION trg_block_placeholder_company()"]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_TRIGGER_DRIFT: suppliers'; END IF;
 IF NOT ((SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='public' AND tablename='suppliers') @> $expected$["CREATE INDEX idx_suppliers_company_id ON public.suppliers USING btree (company_id)","CREATE UNIQUE INDEX suppliers_name_company_key ON public.suppliers USING btree (name, company_id)","CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)"]$expected$::jsonb AND (SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='public' AND tablename='suppliers') <@ $expected$["CREATE INDEX idx_suppliers_company_id ON public.suppliers USING btree (company_id)","CREATE UNIQUE INDEX suppliers_name_company_key ON public.suppliers USING btree (name, company_id)","CREATE UNIQUE INDEX suppliers_pkey ON public.suppliers USING btree (id)"]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_INDEX_DRIFT: suppliers'; END IF;
 IF NOT ((SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.suppliers'::regclass) @> $expected$[["suppliers_company_fk","FOREIGN KEY (company_id) REFERENCES companies(id)"],["suppliers_name_company_key","UNIQUE (name, company_id)"],["suppliers_pkey","PRIMARY KEY (id)"]]$expected$::jsonb AND (SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.suppliers'::regclass) <@ $expected$[["suppliers_company_fk","FOREIGN KEY (company_id) REFERENCES companies(id)"],["suppliers_name_company_key","UNIQUE (name, company_id)"],["suppliers_pkey","PRIMARY KEY (id)"]]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_CONSTRAINT_DRIFT: suppliers'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.suppliers'::regclass AND relrowsecurity AND relforcerowsecurity AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}') OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.suppliers'::regclass AND attacl IS NOT NULL) OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.suppliers'::regclass AND NOT tgisinternal AND tgenabled<>'O') THEN RAISE EXCEPTION 'PHASE5_ACL_TRIGGER_DRIFT: suppliers'; END IF;
 IF (SELECT jsonb_agg(jsonb_build_array(column_name,udt_name,is_nullable,column_default) ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='public' AND table_name='supplier_item_prices') <> $expected$[["id","uuid","NO","gen_random_uuid()"],["supplier_id","text","NO",null],["stock_item_id","uuid","NO",null],["purchase_unit","text","NO","'UN'::text"],["unit_cost","numeric","NO","0"],["last_updated_at","timestamptz","NO","now()"],["source","text","NO","'manual'::text"],["company_id","uuid","NO","get_current_company_id()"],["supplier_uuid","uuid","YES",null]]$expected$::jsonb THEN RAISE EXCEPTION 'PHASE5_COLUMN_DRIFT: supplier_item_prices'; END IF;
 IF NOT ((SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check)) FROM pg_policies WHERE schemaname='public' AND tablename='supplier_item_prices') @> $expected$[["multiunit_scope_boundary","RESTRICTIVE",["authenticated"],"ALL","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) OR (( SELECT (NULLIF(current_setting('request.headers'::text, true), ''::text) IS NULL)) AND is_company_member(( SELECT auth.uid() AS uid), company_id)))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"],["perm_supplier_prices_select","PERMISSIVE",["authenticated"],"SELECT","( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view'::text, 'compras:lista:view'::text, 'system:global:manage'::text]) AS has_any_permission)",null],["sip_perm_delete","PERMISSIVE",["authenticated"],"DELETE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))",null],["sip_perm_insert","PERMISSIVE",["authenticated"],"INSERT",null,"((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))"],["sip_perm_update","PERMISSIVE",["authenticated"],"UPDATE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"]]$expected$::jsonb AND (SELECT jsonb_agg(jsonb_build_array(policyname,permissive,roles,cmd,qual,with_check)) FROM pg_policies WHERE schemaname='public' AND tablename='supplier_item_prices') <@ $expected$[["multiunit_scope_boundary","RESTRICTIVE",["authenticated"],"ALL","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) OR (( SELECT (NULLIF(current_setting('request.headers'::text, true), ''::text) IS NULL)) AND is_company_member(( SELECT auth.uid() AS uid), company_id)))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"],["perm_supplier_prices_select","PERMISSIVE",["authenticated"],"SELECT","( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:view'::text, 'compras:lista:view'::text, 'system:global:manage'::text]) AS has_any_permission)",null],["sip_perm_delete","PERMISSIVE",["authenticated"],"DELETE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))",null],["sip_perm_insert","PERMISSIVE",["authenticated"],"INSERT",null,"((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))"],["sip_perm_update","PERMISSIVE",["authenticated"],"UPDATE","((company_id = ( SELECT get_current_company_id() AS get_current_company_id)) AND ( SELECT has_any_permission(auth.uid(), ARRAY['compras:fornecedores:edit'::text, 'system:global:manage'::text]) AS has_any_permission))","(company_id = ( SELECT get_current_company_id() AS get_current_company_id))"]]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_POLICY_DRIFT: supplier_item_prices'; END IF;
 IF NOT ((SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgrelid='public.supplier_item_prices'::regclass AND NOT tgisinternal) @> $expected$["CREATE TRIGGER trg_block_placeholder_company BEFORE INSERT OR UPDATE ON public.supplier_item_prices FOR EACH ROW EXECUTE FUNCTION trg_block_placeholder_company()","CREATE TRIGGER trg_validate_sip BEFORE INSERT OR UPDATE ON public.supplier_item_prices FOR EACH ROW EXECUTE FUNCTION validate_supplier_item_price()"]$expected$::jsonb AND (SELECT jsonb_agg(pg_get_triggerdef(oid)) FROM pg_trigger WHERE tgrelid='public.supplier_item_prices'::regclass AND NOT tgisinternal) <@ $expected$["CREATE TRIGGER trg_block_placeholder_company BEFORE INSERT OR UPDATE ON public.supplier_item_prices FOR EACH ROW EXECUTE FUNCTION trg_block_placeholder_company()","CREATE TRIGGER trg_validate_sip BEFORE INSERT OR UPDATE ON public.supplier_item_prices FOR EACH ROW EXECUTE FUNCTION validate_supplier_item_price()"]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_TRIGGER_DRIFT: supplier_item_prices'; END IF;
 IF NOT ((SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='public' AND tablename='supplier_item_prices') @> $expected$["CREATE INDEX idx_supplier_item_prices_company_id ON public.supplier_item_prices USING btree (company_id)","CREATE UNIQUE INDEX idx_supplier_item_company_unique ON public.supplier_item_prices USING btree (supplier_id, stock_item_id, company_id)","CREATE UNIQUE INDEX supplier_item_prices_pkey ON public.supplier_item_prices USING btree (id)"]$expected$::jsonb AND (SELECT jsonb_agg(indexdef) FROM pg_indexes WHERE schemaname='public' AND tablename='supplier_item_prices') <@ $expected$["CREATE INDEX idx_supplier_item_prices_company_id ON public.supplier_item_prices USING btree (company_id)","CREATE UNIQUE INDEX idx_supplier_item_company_unique ON public.supplier_item_prices USING btree (supplier_id, stock_item_id, company_id)","CREATE UNIQUE INDEX supplier_item_prices_pkey ON public.supplier_item_prices USING btree (id)"]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_INDEX_DRIFT: supplier_item_prices'; END IF;
 IF NOT ((SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.supplier_item_prices'::regclass) @> $expected$[["supplier_item_prices_company_fk","FOREIGN KEY (company_id) REFERENCES companies(id)"],["supplier_item_prices_pkey","PRIMARY KEY (id)"],["supplier_item_prices_stock_item_id_fkey","FOREIGN KEY (stock_item_id) REFERENCES produtos(id)"]]$expected$::jsonb AND (SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.supplier_item_prices'::regclass) <@ $expected$[["supplier_item_prices_company_fk","FOREIGN KEY (company_id) REFERENCES companies(id)"],["supplier_item_prices_pkey","PRIMARY KEY (id)"],["supplier_item_prices_stock_item_id_fkey","FOREIGN KEY (stock_item_id) REFERENCES produtos(id)"]]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_CONSTRAINT_DRIFT: supplier_item_prices'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.supplier_item_prices'::regclass AND relrowsecurity AND relforcerowsecurity AND relacl::text='{postgres=arwdDxtm/postgres,authenticated=arwdDxtm/postgres,service_role=arwdDxtm/postgres}') OR EXISTS(SELECT 1 FROM pg_attribute WHERE attrelid='public.supplier_item_prices'::regclass AND attacl IS NOT NULL) OR EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.supplier_item_prices'::regclass AND NOT tgisinternal AND tgenabled<>'O') THEN RAISE EXCEPTION 'PHASE5_ACL_TRIGGER_DRIFT: supplier_item_prices'; END IF;
 IF NOT ((SELECT jsonb_agg(p.oid::regprocedure::text) FROM pg_proc p WHERE pronamespace='public'::regnamespace AND prokind='f' AND prosrc ~ '(suppliers|supplier_item_prices)') @> $expected$["create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)","receive_purchase_order_atomic(uuid,jsonb,jsonb)","validate_supplier_item_price()","debug_company_inventory()","admin_health_counts()","rbac_sql_lint_report_quick(uuid)","admin_checkup_suite()","get_fin_kpis(integer)","get_relatorios_score(date,date)","upsert_supplier(text)","get_supplier_ranking(uuid,text,integer,integer,text)"]$expected$::jsonb AND (SELECT jsonb_agg(p.oid::regprocedure::text) FROM pg_proc p WHERE pronamespace='public'::regnamespace AND prokind='f' AND prosrc ~ '(suppliers|supplier_item_prices)') <@ $expected$["create_salmon_entry_atomic(date,text,text,text,integer,integer,numeric,numeric,text,date)","receive_purchase_order_atomic(uuid,jsonb,jsonb)","validate_supplier_item_price()","debug_company_inventory()","admin_health_counts()","rbac_sql_lint_report_quick(uuid)","admin_checkup_suite()","get_fin_kpis(integer)","get_relatorios_score(date,date)","upsert_supplier(text)","get_supplier_ranking(uuid,text,integer,integer,text)"]$expected$::jsonb) THEN RAISE EXCEPTION 'PHASE5_CALLER_DRIFT'; END IF;
 IF NOT ((SELECT jsonb_agg(jsonb_build_array(conname,pg_get_constraintdef(oid))) FROM pg_constraint WHERE conrelid='public.cotacao_fornecedores'::regclass) @> $expected$[["cotacao_fornecedores_company_id_fkey","FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE"],["cotacao_fornecedores_cotacao_id_fkey","FOREIGN KEY (cotacao_id) REFERENCES cotacoes(id) ON DELETE CASCADE"],["cotacao_fornecedores_pkey","PRIMARY KEY (id)"],["cotacao_fornecedores_status_check","CHECK ((status = ANY (ARRAY['AGUARDANDO'::text, 'ENVIADO'::text, 'RESPONDIDO'::text, 'RECUSADO'::text, 'NEGOCIANDO'::text, 'FECHADO'::text])))"],["cotacao_fornecedores_supplier_id_fkey","FOREIGN KEY (supplier_id) REFERENCES suppliers(id) ON DELETE SET NULL"]]$expected$::jsonb) OR (SELECT count(*) FROM pg_constraint WHERE conrelid='public.cotacao_fornecedores'::regclass)<>5 THEN RAISE EXCEPTION 'PHASE5_CONSTRAINT_DRIFT: cotacao'; END IF;
 IF EXISTS(SELECT 1 FROM public.cotacao_fornecedores f LEFT JOIN public.suppliers s ON s.id=f.supplier_id WHERE f.supplier_id IS NOT NULL AND (s.id IS NULL OR s.company_id<>f.company_id)) THEN RAISE EXCEPTION 'PHASE5_DATA_REVIEW_REQUIRED: cotacao'; END IF;
 IF EXISTS(SELECT 1 FROM public.supplier_item_prices t LEFT JOIN public.suppliers s ON s.id=t.supplier_uuid LEFT JOIN public.produtos p ON p.id=t.stock_item_id WHERE t.supplier_uuid IS NULL OR s.id IS NULL OR p.id IS NULL OR s.company_id<>t.company_id OR p.company_id<>t.company_id) THEN RAISE EXCEPTION 'PHASE5_DATA_REVIEW_REQUIRED'; END IF;
END $preflight$;
-- Pré-requisitos locais de auditoria/Salmão; nunca conceder logs genéricos para contornar isto.
DO $$ BEGIN
 IF to_regnamespace('log_private') IS NULL
 OR has_function_privilege('authenticated','public.log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)','EXECUTE')
 OR has_function_privilege('authenticated','public.ensure_salmon_raw_product()','EXECUTE')
 THEN RAISE EXCEPTION 'PHASE5_RELEASE_PREREQUISITES: publicar Fases 2/3/4 reconciliadas antes'; END IF;
END $$;

-- Não recria UNIQUE(name,company_id). Índices compostos permitem FKs com tenant.
CREATE UNIQUE INDEX suppliers_id_company_price_fk ON public.suppliers(id,company_id);
CREATE UNIQUE INDEX produtos_id_company_price_fk ON public.produtos(id,company_id);
ALTER TABLE public.supplier_item_prices
 ADD CONSTRAINT supplier_prices_supplier_tenant_fk FOREIGN KEY(supplier_uuid,company_id) REFERENCES public.suppliers(id,company_id),
 ADD CONSTRAINT supplier_prices_product_tenant_fk FOREIGN KEY(stock_item_id,company_id) REFERENCES public.produtos(id,company_id);
CREATE INDEX supplier_prices_supplier_tenant ON public.supplier_item_prices(supplier_uuid,company_id);
CREATE INDEX supplier_prices_product_tenant ON public.supplier_item_prices(stock_item_id,company_id);
-- Cotação guarda UUID opcional e snapshots históricos; rejeita vínculo de outra empresa.
ALTER TABLE public.cotacao_fornecedores ADD CONSTRAINT cotacao_supplier_tenant_fk
 FOREIGN KEY(supplier_id,company_id) REFERENCES public.suppliers(id,company_id) ON DELETE SET NULL (supplier_id);
CREATE INDEX cotacao_supplier_tenant ON public.cotacao_fornecedores(supplier_id,company_id);

CREATE OR REPLACE FUNCTION public.validate_supplier_item_price()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
BEGIN
 IF NEW.unit_cost < 0 OR NEW.unit_cost='NaN'::numeric THEN
  RAISE EXCEPTION 'unit_cost inválido em supplier_item_prices' USING ERRCODE='22023';
 END IF;
 IF NEW.supplier_uuid IS NULL THEN RAISE EXCEPTION 'SUPPLIER_REQUIRED' USING ERRCODE='23502'; END IF;
 IF TG_OP='UPDATE' AND NEW.company_id IS DISTINCT FROM OLD.company_id THEN
  RAISE EXCEPTION 'PRICE_COMPANY_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 IF TG_OP='UPDATE' AND (NEW.supplier_uuid IS DISTINCT FROM OLD.supplier_uuid OR NEW.stock_item_id IS DISTINCT FROM OLD.stock_item_id) THEN
  RAISE EXCEPTION 'PRICE_IDENTITY_IMMUTABLE' USING ERRCODE='42501';
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION public.validate_supplier_item_price() FROM PUBLIC,anon,authenticated,service_role;

CREATE OR REPLACE FUNCTION public.upsert_supplier(p_name text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_company uuid := public.assert_tenant(); v_id uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
  'compras:fornecedores:create','compras:fornecedores:edit','suppliers:edit','system:global:manage'
 ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: fornecedores' USING ERRCODE='42501'; END IF;
 IF p_name IS NULL OR btrim(p_name)='' THEN RAISE EXCEPTION 'Nome obrigatório' USING ERRCODE='22023'; END IF;
 INSERT INTO public.suppliers(name,company_id) VALUES(btrim(p_name),v_company)
 ON CONFLICT(name,company_id) DO UPDATE SET updated_at=now() RETURNING id INTO v_id;
 PERFORM public.log_audit('rpc','purchases','suppliers',v_id,'UPSERT',NULL,jsonb_build_object('name',btrim(p_name)));
 RETURN v_id;
END $$;
REVOKE ALL ON FUNCTION public.upsert_supplier(text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.upsert_supplier(text) TO authenticated;

-- O servidor usa o UUID retornado, e fornecedor+preço são uma única transação.
CREATE FUNCTION public.upsert_supplier_price(p_name text,p_stock_item_id uuid,p_unit_cost numeric,p_purchase_unit text DEFAULT 'UN')
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE v_company uuid := public.assert_tenant(); v_supplier uuid; v_price uuid;
BEGIN
 IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
  'compras:fornecedores:edit','suppliers:edit','system:global:manage'
 ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: fornecedores:edit' USING ERRCODE='42501'; END IF;
 IF p_unit_cost IS NULL OR p_unit_cost<=0 OR p_unit_cost='NaN'::numeric OR p_purchase_unit IS NULL OR btrim(p_purchase_unit)='' THEN
  RAISE EXCEPTION 'Preço/unidade inválidos' USING ERRCODE='22023';
 END IF;
 PERFORM 1 FROM public.produtos WHERE id=p_stock_item_id AND company_id=v_company FOR KEY SHARE;
 IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
 v_supplier := public.upsert_supplier(p_name);
 INSERT INTO public.supplier_item_prices(supplier_id,supplier_uuid,stock_item_id,unit_cost,purchase_unit,company_id,source,last_updated_at)
 VALUES(btrim(p_name),v_supplier,p_stock_item_id,p_unit_cost,p_purchase_unit,v_company,'manual',now())
 ON CONFLICT(supplier_id,stock_item_id,company_id) DO UPDATE SET
  supplier_uuid=EXCLUDED.supplier_uuid,unit_cost=EXCLUDED.unit_cost,purchase_unit=EXCLUDED.purchase_unit,
  source=EXCLUDED.source,last_updated_at=EXCLUDED.last_updated_at RETURNING id INTO v_price;
 -- Recurso de auditoria é o fornecedor validado; ator/origem nunca vêm do formulário.
 PERFORM public.log_audit('rpc','purchases','suppliers',v_supplier,'PRICE_UPSERT',NULL,
  jsonb_build_object('price_id',v_price,'stock_item_id',p_stock_item_id,'unit_cost',p_unit_cost,'purchase_unit',p_purchase_unit));
 RETURN v_price;
END $$;
REVOKE ALL ON FUNCTION public.upsert_supplier_price(text,uuid,numeric,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.upsert_supplier_price(text,uuid,numeric,text) TO authenticated;
-- Único writer público de preço passa pela RPC; serviço e atômicas internas continuam funcionando.
REVOKE INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.supplier_item_prices FROM authenticated;
REVOKE TRUNCATE,REFERENCES,TRIGGER,MAINTAIN ON public.suppliers FROM authenticated;

REVOKE ALL ON FUNCTION public.get_supplier_ranking(uuid,text,integer,integer,text) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_supplier_ranking(uuid,text,integer,integer,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(p_order_id uuid, p_items jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_company uuid := public.assert_tenant();
  v_order RECORD;
  v_item jsonb;
  v_oi RECORD;
  v_conv numeric;
  v_qty_base numeric;
  v_cost_base numeric;
  v_mov_id uuid;
  v_items_received int := 0;
  v_items_not_delivered int := 0;
  v_total_confirmed numeric := 0;
  v_new_status text;
  v_ref_id text;
  v_caller uuid;
  v_supplier_uuid uuid;
  v_qty_received numeric;
  v_qty_shortfall numeric;
  v_shortfall_item_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  IF NOT has_any_permission(v_caller, ARRAY[
    'purchases:receiving:manage',
    'compras:recebimentos:edit',
    'compras:recebimentos:close',
    'compras:recebimentos:create',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão para receber pedidos.';
  END IF;

  SELECT * INTO v_order FROM purchase_orders WHERE id = p_order_id AND company_id = v_company AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id; END IF;
  IF v_order.status = 'COMPLETED' THEN
    RETURN jsonb_build_object('status','COMPLETED','items_received',0,'items_not_delivered',0,'total_confirmed',0);
  END IF;
  IF v_order.status NOT IN ('IN_RECEIVING', 'OPEN', 'SHOPPING_OK', 'PARTIAL') THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_order.status;
  END IF;

  -- Mesma ordem dos writers de preço/Salmão: produto antes de fornecedor.
  PERFORM p.id FROM public.produtos p
  JOIN public.purchase_order_items oi ON oi.stock_item_id=p.id
  WHERE oi.order_id=p_order_id AND oi.company_id=v_company AND p.company_id=v_company
    AND oi.id IN (SELECT (x->>'order_item_id')::uuid FROM jsonb_array_elements(p_items) x)
  ORDER BY p.id FOR UPDATE OF p;

  IF v_order.supplier_name IS NOT NULL AND v_order.supplier_name != '' THEN
    INSERT INTO suppliers (name, company_id) VALUES (v_order.supplier_name, v_company)
    ON CONFLICT (name, company_id) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM purchase_order_items
    WHERE id = (v_item->>'order_item_id')::uuid AND order_id = p_order_id AND company_id = v_company AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % não pertence ao pedido %', v_item->>'order_item_id', p_order_id;
    END IF;

    IF v_oi.stock_item_id IS NOT NULL AND EXISTS(
      SELECT 1 FROM public.movimentacoes_estoque WHERE reference_type='PURCHASE_ORDER_ITEM'
      AND reference_id='POI:'||v_oi.id::text AND company_id=v_company AND status='ATIVO'
    ) THEN CONTINUE; END IF; -- Cliente já marca RECEIVED antes da confirmação; o espelho confirma a baixa.
    IF v_oi.stock_item_id IS NOT NULL THEN
      PERFORM 1 FROM public.produtos WHERE id=v_oi.stock_item_id AND company_id=v_company FOR UPDATE;
      IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501'; END IF;
    END IF;
    IF (v_item->>'status') = 'NOT_DELIVERED' THEN
      UPDATE purchase_order_items SET
        received_status = 'NOT_DELIVERED',
        not_delivered_reason = COALESCE(v_item->>'reason', 'Não entregue'),
        received_at = now(), received_by = v_caller, updated_at = now()
      WHERE id = v_oi.id;
      v_items_not_delivered := v_items_not_delivered + 1;
    ELSE
      v_qty_received := COALESCE((v_item->>'qty_received')::numeric, 0);
      IF v_qty_received <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser > 0 para item %', v_oi.name_snapshot;
      END IF;

      -- Detect partial receipt: qty_received < qty_requested
      v_qty_shortfall := v_oi.qty_requested - v_qty_received;

      UPDATE purchase_order_items SET
        qty_received = v_qty_received,
        received_status = 'RECEIVED', received_at = now(),
        received_by = v_caller, updated_at = now()
      WHERE id = v_oi.id;

      -- If there's a shortfall, create a new NOT_DELIVERED item for the difference
      IF v_qty_shortfall > 0.001 THEN
        INSERT INTO purchase_order_items (
          order_id, stock_item_id, name_snapshot, unit_snapshot,
          estimated_unit_value, qty_requested, qty_received,
          received_status, not_delivered_reason, received_at, received_by,
          shopping_status, shopping_note,
          purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot, company_id
        ) VALUES (
          p_order_id, v_oi.stock_item_id, v_oi.name_snapshot, v_oi.unit_snapshot,
          v_oi.estimated_unit_value, v_qty_shortfall, 0,
          'NOT_DELIVERED',
          'Item marcado como comprado no Checklist, porém no recebimento foi informada quantidade inferior à prevista. Previsto: ' || v_oi.qty_requested || ' ' || v_oi.unit_snapshot || ', Recebido: ' || v_qty_received || ' ' || v_oi.unit_snapshot || '.',
          now(), v_caller,
          v_oi.shopping_status, v_oi.shopping_note,
          v_oi.purchase_unit_snapshot, v_oi.purchase_unit_cost_snapshot, v_oi.conversion_factor_snapshot, v_company
        ) RETURNING id INTO v_shortfall_item_id;

        v_items_not_delivered := v_items_not_delivered + 1;
      END IF;

      -- Stock entry logic
      IF v_oi.stock_item_id IS NOT NULL THEN
        v_conv := COALESCE(v_oi.conversion_factor_snapshot, 1);
        v_qty_base := v_qty_received * v_conv;
        v_cost_base := CASE WHEN v_conv > 0
          THEN COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value) / v_conv
          ELSE COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value)
        END;

        v_ref_id := 'POI:' || v_oi.id::text;

        IF NOT EXISTS (
          SELECT 1 FROM movimentacoes_estoque
          WHERE reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id = v_ref_id AND status = 'ATIVO' AND company_id = v_company
        ) THEN
          INSERT INTO movimentacoes_estoque (
            produto_id, data, tipo, quantidade, custo_unitario, custo_total,
            origem, observacao, created_by, status,
            reference_type, reference_id, internal_transfer, source_module, company_id
          ) VALUES (
            v_oi.stock_item_id,
            COALESCE((v_item->>'movement_date')::date, CURRENT_DATE),
            'ENTRADA', v_qty_base, ROUND(v_cost_base::numeric, 4),
            ROUND((v_qty_base * v_cost_base)::numeric, 2),
            'Recebimento Pedido/Compra',
            'Recebimento atômico — Pedido ' || p_order_id::text || ' Item ' || v_oi.name_snapshot,
            v_caller, 'ATIVO', 'PURCHASE_ORDER_ITEM', v_ref_id, false, 'purchases', v_company
          ) RETURNING id INTO v_mov_id;

          UPDATE produtos SET
            last_cost_purchase_unit = COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
            last_cost_base_unit = ROUND(v_cost_base::numeric, 4),
            last_purchase_date = CURRENT_DATE::text,
            last_supplier = v_order.supplier_name
          WHERE id = v_oi.stock_item_id AND company_id = v_company;

          IF v_supplier_uuid IS NOT NULL AND v_oi.stock_item_id IS NOT NULL THEN
            INSERT INTO public.supplier_item_prices
              (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, company_id, source, last_updated_at)
            VALUES (v_order.supplier_name, v_supplier_uuid, v_oi.stock_item_id,
              COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
              COALESCE(v_oi.purchase_unit_snapshot, v_oi.unit_snapshot), v_company, 'purchases', now())
            ON CONFLICT (supplier_id, stock_item_id, company_id) DO UPDATE SET
              supplier_uuid=EXCLUDED.supplier_uuid, unit_cost=EXCLUDED.unit_cost,
              purchase_unit=EXCLUDED.purchase_unit, source=EXCLUDED.source,
              last_updated_at=EXCLUDED.last_updated_at;
          END IF;
        END IF;
      END IF;

      v_total_confirmed := v_total_confirmed + (v_qty_received * COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value));
      v_items_received := v_items_received + 1;
    END IF;
  END LOOP;

  -- Determine new order status based on ALL items in the order (not just current batch)
  IF EXISTS (
    SELECT 1 FROM purchase_order_items
    WHERE order_id = p_order_id AND deleted_at IS NULL AND received_status = 'PENDING'
  ) THEN
    v_new_status := 'IN_RECEIVING';
  ELSIF EXISTS (
    SELECT 1 FROM purchase_order_items
    WHERE order_id = p_order_id AND deleted_at IS NULL AND received_status = 'NOT_DELIVERED'
  ) THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'COMPLETED';
  END IF;

  UPDATE purchase_orders SET
    status = v_new_status,
    total_confirmed = COALESCE(total_confirmed, 0) + v_total_confirmed,
    concluded_at = CASE WHEN v_new_status = 'COMPLETED' THEN now() ELSE concluded_at END,
    updated_at = now()
  WHERE id = p_order_id;

  PERFORM public.log_audit('rpc', 'purchases', 'purchase_orders', p_order_id,
    'RECEBIMENTO_ATOMICO', NULL,
    jsonb_build_object('status',v_new_status,'received',v_items_received,'not_delivered',v_items_not_delivered));

  RETURN jsonb_build_object(
    'status', v_new_status,
    'items_received', v_items_received,
    'items_not_delivered', v_items_not_delivered,
    'total_confirmed', v_total_confirmed
  );
END;
$function$
;

REVOKE ALL ON FUNCTION public.receive_purchase_order_atomic(uuid,jsonb,jsonb) FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_atomic(uuid,jsonb,jsonb) TO authenticated;
-- Resolve colunas/joins críticos durante a migration, sem criar fixtures em produção.
DO $$ BEGIN
 PERFORM s.id,s.name,s.company_id,p.id,p.company_id,t.supplier_id,t.supplier_uuid,
  t.stock_item_id,t.purchase_unit,t.unit_cost,t.last_updated_at,t.source,t.company_id
 FROM public.supplier_item_prices t JOIN public.suppliers s ON s.id=t.supplier_uuid
 JOIN public.produtos p ON p.id=t.stock_item_id LIMIT 0;
 PERFORM oi.id,oi.order_id,oi.stock_item_id,oi.company_id,oi.deleted_at,
  oi.conversion_factor_snapshot,oi.purchase_unit_snapshot,po.supplier_name,po.company_id,po.deleted_at
 FROM public.purchase_order_items oi JOIN public.purchase_orders po ON po.id=oi.order_id LIMIT 0;
END $$;
NOTIFY pgrst,'reload schema';
COMMIT;

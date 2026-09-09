BEGIN;
-- Keep the audited production function bodies (financial logic is unchanged).
-- Each replacement checks its expected pattern and aborts on schema drift.
DO $legacy$
DECLARE r record; v_def text; v_before text; v_pattern text;
BEGIN
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname=ANY(ARRAY[
   'receive_market_order_atomic','get_stock_predictive_analysis_v2','get_stock_predictive_analysis',
   'list_stock_transfers','_planning_upsert_meta_guarded','_planning_delete_meta_guarded',
   '_planning_spend_summary_guarded','reject_ponto_record','get_inactive_stock_items',
   'seed_default_categories','stock_transfer_between_locations','create_quick_inventory_atomic',
   'batch_reorder_fin_categorias']) LOOP
   v_before:=pg_get_functiondef(r.oid);
   v_def:=regexp_replace(v_before,
     'SELECT (p\.)?company_id INTO (v_company|v_company_id|v_cid|_company_id)\s+FROM (public\.)?profiles( p)?\s+WHERE [^;]+;',
     '\2 := public.assert_tenant();','g');
   IF v_def=v_before THEN RAISE EXCEPTION 'MULTIUNIT_FUNCTION_DRIFT: %',r.proname; END IF;
   EXECUTE v_def;
 END LOOP;
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND (p.proname LIKE '%presentation%') AND p.prosrc LIKE '%profile.company_id%' LOOP
   v_before:=pg_get_functiondef(r.oid);
   v_def:=regexp_replace(v_before,'profile\.company_id = (v_company|p_company_id)','public.is_company_member(profile.id, \1)','g');
   IF v_def=v_before THEN RAISE EXCEPTION 'MULTIUNIT_PRESENTATION_DRIFT: %',r.proname; END IF;
   EXECUTE v_def;
 END LOOP;
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.proname IN ('finalize_inventory_atomic','create_inventory_atomic','soft_delete_inventory','reopen_inventory','audit_log_write') LOOP
   v_def:=pg_get_functiondef(r.oid);
   v_def:=replace(v_def,'FROM user_roles WHERE user_id = v_user_id','FROM user_roles WHERE user_id = v_user_id AND company_id = public.assert_tenant()');
   v_def:=replace(v_def,'FROM user_roles ur WHERE ur.user_id = v_user_id','FROM user_roles ur WHERE ur.user_id = v_user_id AND ur.company_id = public.assert_tenant()');
   v_def:=replace(v_def,'SELECT p.company_id, p.email INTO v_company_id, v_email','SELECT public.assert_tenant(), p.email INTO v_company_id, v_email');
   EXECUTE v_def;
 END LOOP;
 SELECT pg_get_functiondef('public.get_catalog_counts()'::regprocedure) INTO v_before;
 v_def:=replace(v_before,'(SELECT company_id FROM public.profiles WHERE id = auth.uid())','public.assert_tenant()');
 IF v_def=v_before THEN RAISE EXCEPTION 'MULTIUNIT_FUNCTION_DRIFT: get_catalog_counts'; END IF;
 EXECUTE v_def;
 SELECT pg_get_functiondef('public.count_requisicoes_with_pending_items()'::regprocedure) INTO v_before;
 v_def:=regexp_replace(v_before,'SELECT p.company_id FROM profiles p WHERE p.id = auth.uid\(\)','SELECT public.assert_tenant()','g');
 IF v_def=v_before THEN RAISE EXCEPTION 'MULTIUNIT_FUNCTION_DRIFT: count_requisicoes_with_pending_items'; END IF;
 EXECUTE v_def;
 SELECT pg_get_functiondef('public.reorder_fin_categoria(uuid,text)'::regprocedure) INTO v_before;
 v_def:=replace(v_before,'SELECT 1 FROM profiles WHERE id = v_user_id AND company_id = v_company_id',
   'SELECT 1 WHERE v_company_id = public.assert_tenant()');
 IF v_def=v_before THEN RAISE EXCEPTION 'MULTIUNIT_FUNCTION_DRIFT: reorder_fin_categoria'; END IF;
 EXECUTE v_def;
END;
$legacy$;

CREATE OR REPLACE FUNCTION public.list_profiles_minimal(p_search text DEFAULT '',p_limit integer DEFAULT 50)
RETURNS TABLE(id uuid,nome text,email text,avatar_url text) LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_company uuid := public.assert_tenant();
BEGIN
 IF NOT public.has_any_permission(auth.uid(),ARRAY['financeiro:relatorio-socios:view','configuracoes:usuarios:view',
   'configuracoes:usuarios:manage','estoque:requisicoes:view','inventario:lista:view','inventario:conferentes:manage',
   'rh:colaboradores:view','rh:tarefas:view','rh:mural:view','configuracoes:auditoria-sistema:view',
   'users:manage','system:global:manage']) THEN
   RAISE EXCEPTION USING ERRCODE='42501',MESSAGE='PERMISSION_DENIED';
 END IF;
 RETURN QUERY SELECT p.id,p.nome,p.email,p.avatar_url FROM public.profiles p
 JOIN public.company_memberships m ON m.user_id=p.id AND m.company_id=v_company AND m.status='active'
 WHERE p.nome NOT ILIKE '[EXCLUÍDO]%' AND (p_search='' OR
   public.immutable_unaccent(p.nome) ILIKE '%'||public.immutable_unaccent(p_search)||'%' OR
   public.immutable_unaccent(p.email) ILIKE '%'||public.immutable_unaccent(p_search)||'%')
 ORDER BY p.nome,p.id LIMIT greatest(1,least(p_limit,200));
END;
$$;
REVOKE ALL ON FUNCTION public.list_profiles_minimal(text,integer) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.list_profiles_minimal(text,integer) TO authenticated;

-- Realtime verifies membership and permission for each row; HTTP requests never
-- enter this policy. No synthetic tenant JWT and no shared active-company setting.
CREATE OR REPLACE FUNCTION public.can_receive_company_change(p_company_id uuid,p_permissions text[])
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
 SELECT auth.uid() IS NOT NULL AND NULLIF(current_setting('request.headers',true),'') IS NULL
   AND public.is_company_member(auth.uid(),p_company_id)
   AND (cardinality(p_permissions)=0 OR public.get_company_permissions(auth.uid(),p_company_id) && p_permissions);
$$;
REVOKE ALL ON FUNCTION public.can_receive_company_change(uuid,text[]) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_receive_company_change(uuid,text[]) TO authenticated;
CREATE POLICY company_realtime_read ON public.movimentacoes_estoque FOR SELECT TO authenticated
 USING(public.can_receive_company_change(company_id,ARRAY['estoque:movimentacoes:view','estoque:preditivo:view','stock:read','system:global:manage']));
CREATE POLICY company_realtime_read ON public.produtos FOR SELECT TO authenticated
 USING(public.can_receive_company_change(company_id,ARRAY['estoque:catalogo:view','stock:read','system:global:manage']));
CREATE POLICY company_realtime_read ON public.purchase_orders FOR SELECT TO authenticated
 USING(public.can_receive_company_change(company_id,ARRAY['compras:pedidos:view','purchases:read','system:global:manage']));
CREATE POLICY company_realtime_read ON public.notifications FOR SELECT TO authenticated
 USING(public.can_receive_company_change(company_id,ARRAY[]::text[]) AND recipient_user_id=(SELECT auth.uid()));
CREATE POLICY company_realtime_read ON public.cotacoes FOR SELECT TO authenticated
 USING(public.can_receive_company_change(company_id,ARRAY['compras:cotacao:view','system:global:manage']));
CREATE POLICY company_realtime_read ON public.cotacao_fornecedores FOR SELECT TO authenticated
 USING(public.can_receive_company_change(company_id,ARRAY['compras:cotacao:view','system:global:manage']));
DO $publication$
DECLARE v_table text;
BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime') THEN
   FOREACH v_table IN ARRAY ARRAY['cotacoes','cotacao_fornecedores'] LOOP
     IF NOT EXISTS(SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table) THEN
       EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
     END IF;
   END LOOP;
 END IF;
END;
$publication$;
COMMIT;

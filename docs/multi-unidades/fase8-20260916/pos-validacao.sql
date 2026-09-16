BEGIN TRANSACTION READ ONLY;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime' AND (pubdelete OR pubtruncate OR NOT pubinsert OR NOT pubupdate))
   OR NOT EXISTS(SELECT 1 FROM pg_publication WHERE pubname='supabase_realtime')
 THEN RAISE EXCEPTION 'PHASE8_REALTIME_NOT_CONTAINED'; END IF;
 IF has_function_privilege('anon','public.can_access_company_document(text,text)','EXECUTE')
    OR has_function_privilege('service_role','public.can_access_company_document(text,text)','EXECUTE')
    OR NOT has_function_privilege('authenticated','public.can_access_company_document(text,text)','EXECUTE')
 THEN RAISE EXCEPTION 'PHASE8_STORAGE_ACL'; END IF;
 IF md5(pg_get_functiondef('public.can_access_company_document(text,text)'::regprocedure))<>'338b9b2076f28dbfdb12442fd3d27def'
    OR NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rh-documentos' AND NOT public)
 THEN RAISE EXCEPTION 'PHASE8_STORAGE_NOT_CONTAINED'; END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY policyname)::text) FROM pg_policies p
     WHERE schemaname='storage' AND tablename='objects') IS DISTINCT FROM '2eb0e220e747ba50dca65853e840cebd'
 THEN RAISE EXCEPTION 'PHASE8_STORAGE_POLICY_DRIFT'; END IF;
 IF (SELECT array_agg(schemaname||'.'||tablename ORDER BY schemaname,tablename)
     FROM pg_publication_tables WHERE pubname='supabase_realtime') IS DISTINCT FROM
    ARRAY['public.cotacao_fornecedores','public.cotacoes','public.movimentacoes_estoque','public.notifications','public.produtos','public.purchase_orders']
 THEN RAISE EXCEPTION 'PHASE8_REALTIME_TABLE_DRIFT'; END IF;
END $$;
ROLLBACK;

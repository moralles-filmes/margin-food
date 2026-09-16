BEGIN;
SET LOCAL lock_timeout='5s';
DO $guard$
DECLARE f record; expected record;
BEGIN
 FOR expected IN SELECT * FROM (VALUES
 ('can_access_company_document(text,text)','c9ad5b642ab6215407a42149df4a77a4'),
 ('is_company_member(uuid,uuid)','4e351f8c65051fd3da9c94977b8be830'),
 ('get_company_permissions(uuid,uuid)','3d525d50884f5330721625ce2db97c0b'),
 ('get_current_company_id()','a5e5953a3980f3cf00479ae0f66ed90f')
 ) x(signature,hash) LOOP
  IF to_regprocedure('public.'||expected.signature) IS NULL OR
    md5(pg_get_functiondef(to_regprocedure('public.'||expected.signature))) <> expected.hash
  THEN RAISE EXCEPTION 'PHASE8_FUNCTION_DRIFT: %',expected.signature; END IF;
 END LOOP;
 SELECT * INTO f FROM pg_proc WHERE oid='public.can_access_company_document(text,text)'::regprocedure;
 IF f.proowner <> 'postgres'::regrole OR
    (SELECT count(*) FROM pg_proc WHERE pronamespace='public'::regnamespace AND proname='can_access_company_document')<>1 OR
    (SELECT array_agg(grantee::regrole::text||':'||privilege_type ORDER BY grantee::regrole::text) FROM aclexplode(f.proacl))
       IS DISTINCT FROM ARRAY['authenticated:EXECUTE','postgres:EXECUTE']
 THEN RAISE EXCEPTION 'PHASE8_ACL_OVERLOAD_DRIFT'; END IF;
 IF (SELECT md5(jsonb_agg(to_jsonb(p) ORDER BY policyname)::text) FROM pg_policies p
     WHERE schemaname='storage' AND tablename='objects') IS DISTINCT FROM '2eb0e220e747ba50dca65853e840cebd' OR EXISTS(
   SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects'
    AND (policyname NOT IN ('company_documents_read','company_documents_insert','company_documents_update','company_documents_delete')
      OR roles IS DISTINCT FROM ARRAY['authenticated']::name[]
      OR permissive<>'PERMISSIVE'
      OR coalesce(qual,'')||coalesce(with_check,'') NOT LIKE '%can_access_company_document%')
 ) THEN RAISE EXCEPTION 'PHASE8_STORAGE_POLICY_DRIFT'; END IF;
 IF NOT EXISTS(SELECT 1 FROM storage.buckets WHERE id='rh-documentos' AND NOT public)
 THEN RAISE EXCEPTION 'PHASE8_PRIVATE_BUCKET_REQUIRED'; END IF;
 IF EXISTS(SELECT 1 FROM storage.objects WHERE bucket_id='rh-documentos' AND
   (name !~ '^[0-9a-fA-F-]{36}/[^/]+$' OR name ~ '(^|/)[.][.]?(/|$)|%|\\|[[:cntrl:]]'))
 THEN RAISE EXCEPTION 'PHASE8_PATH_REVIEW_REQUIRED'; END IF;
END $guard$;
CREATE OR REPLACE FUNCTION public.can_access_company_document(p_path text,p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path='' AS $function$
DECLARE v_collaborator uuid; v_company uuid; v_permissions text[];
BEGIN
 IF auth.uid() IS NULL OR p_action IS NULL OR p_action NOT IN ('view','create','edit','delete')
    OR p_path IS NULL OR p_path !~ '^[0-9a-fA-F-]{36}/[^/]+$'
    OR p_path ~ '(^|/)[.][.]?(/|$)|%|\\|[[:cntrl:]]' THEN RETURN false; END IF;
 BEGIN
  v_collaborator:=split_part(p_path,'/',1)::uuid;
  v_company:=public.get_current_company_id();
 EXCEPTION WHEN invalid_text_representation OR insufficient_privilege THEN RETURN false; END;
 IF v_company IS NULL OR NOT EXISTS(
   SELECT 1 FROM public.rh_colaboradores c WHERE c.id=v_collaborator AND c.company_id=v_company
 ) THEN RETURN false; END IF;
 v_permissions:=public.get_company_permissions(auth.uid(),v_company);
 RETURN coalesce(v_permissions && ARRAY['rh:documentos:'||p_action,'rh:documentos:manage','rh:manage','system:global:manage'],false);
END $function$;
REVOKE ALL ON FUNCTION public.can_access_company_document(text,text) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.can_access_company_document(text,text) TO authenticated;
-- Resolve as colunas mesmo quando a sessão de migration não tem auth.uid().
DO $$ BEGIN
 PERFORM c.id,c.company_id FROM public.rh_colaboradores c WHERE false;
 PERFORM public.get_company_permissions(NULL::uuid,NULL::uuid),public.get_current_company_id() WHERE false;
 PERFORM public.can_access_company_document(NULL,NULL);
END $$;
COMMIT;

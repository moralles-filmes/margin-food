BEGIN;
-- Internal helpers accept explicit tenants for nested calls. Do not expose them
-- as a parallel API that bypasses the canonical guarded entry points.
REVOKE ALL ON FUNCTION public.get_consumo_por_produto(uuid,date,text[],uuid[]),
 public._planning_spend_summary_inner(uuid,integer,integer,text,text),
 public.fn_recompute_product_saldo(uuid,uuid),public.fin_categoria_fora_do_resultado(uuid,uuid),
 public.fin_get_limite_aprovacao(uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.get_consumo_por_produto(uuid,date,text[],uuid[]) TO service_role;

CREATE FUNCTION public.can_access_company_document(p_path text,p_action text)
RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = '' AS $$
DECLARE v_collaborator uuid; v_company uuid; v_requested text; v_permissions text[];
BEGIN
 IF auth.uid() IS NULL OR p_action NOT IN ('view','create','edit','delete') THEN RETURN false; END IF;
 BEGIN v_collaborator:=split_part(p_path,'/',1)::uuid; EXCEPTION WHEN invalid_text_representation THEN RETURN false; END;
 SELECT company_id INTO v_company FROM public.rh_colaboradores WHERE id=v_collaborator;
 IF NOT public.is_company_member(auth.uid(),v_company) THEN RETURN false; END IF;
 v_requested:=NULLIF(current_setting('request.headers',true),'')::jsonb->>'x-company-id';
 IF v_requested IS NOT NULL AND v_requested<>v_company::text THEN RETURN false; END IF;
 v_permissions:=public.get_company_permissions(auth.uid(),v_company);
 RETURN v_permissions && ARRAY['rh:documentos:'||p_action,'rh:documentos:manage','rh:manage','system:global:manage'];
END;
$$;
REVOKE ALL ON FUNCTION public.can_access_company_document(text,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.can_access_company_document(text,text) TO authenticated;
DO $storage$
BEGIN
 IF to_regclass('storage.objects') IS NOT NULL THEN
   EXECUTE 'DROP POLICY IF EXISTS perm_rh_docs_storage ON storage.objects';
   EXECUTE $policy$CREATE POLICY company_documents_read ON storage.objects FOR SELECT TO authenticated
     USING(bucket_id='rh-documentos' AND public.can_access_company_document(name,'view'))$policy$;
   EXECUTE $policy$CREATE POLICY company_documents_insert ON storage.objects FOR INSERT TO authenticated
     WITH CHECK(bucket_id='rh-documentos' AND public.can_access_company_document(name,'create'))$policy$;
   EXECUTE $policy$CREATE POLICY company_documents_update ON storage.objects FOR UPDATE TO authenticated
     USING(bucket_id='rh-documentos' AND public.can_access_company_document(name,'edit'))
     WITH CHECK(bucket_id='rh-documentos' AND public.can_access_company_document(name,'edit'))$policy$;
   EXECUTE $policy$CREATE POLICY company_documents_delete ON storage.objects FOR DELETE TO authenticated
     USING(bucket_id='rh-documentos' AND public.can_access_company_document(name,'delete'))$policy$;
 END IF;
END;
$storage$;
COMMIT;

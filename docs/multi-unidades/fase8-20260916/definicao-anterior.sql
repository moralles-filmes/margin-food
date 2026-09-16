-- Evidência apenas; não executar como recuo (reabriria acesso sem escopo).
CREATE OR REPLACE FUNCTION public.can_access_company_document(p_path text, p_action text)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
$function$

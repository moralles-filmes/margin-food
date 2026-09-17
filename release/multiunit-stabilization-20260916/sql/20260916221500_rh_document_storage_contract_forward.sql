BEGIN;
SET LOCAL lock_timeout = '5s';

DO $preflight$
BEGIN
  IF to_regprocedure('public.can_access_company_document(text,text)') IS NULL
     OR NOT EXISTS (
       SELECT 1
       FROM information_schema.columns
       WHERE table_schema = 'public'
         AND table_name = 'rh_documentos'
         AND column_name = 'storage_state'
     )
  THEN
    RAISE EXCEPTION 'RH_DOCUMENT_STORAGE_PREREQUISITE_MISSING';
  END IF;

  IF (SELECT count(*) FROM pg_policies
      WHERE schemaname = 'storage' AND tablename = 'objects'
        AND policyname IN (
          'company_documents_read', 'company_documents_insert',
          'company_documents_update', 'company_documents_delete'
        )) <> 4
  THEN
    RAISE EXCEPTION 'RH_DOCUMENT_STORAGE_POLICY_DRIFT';
  END IF;
END;
$preflight$;

-- The application stores new objects as company/collaborator/file. Keep the
-- former collaborator/file form readable during a rolling deployment.
CREATE OR REPLACE FUNCTION public.can_access_company_document(p_path text, p_action text)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_parts text[];
  v_collaborator uuid;
  v_path_company uuid;
  v_company uuid;
  v_permissions text[];
BEGIN
  IF auth.uid() IS NULL
     OR p_action IS NULL
     OR p_action NOT IN ('view', 'create', 'edit', 'delete')
     OR p_path IS NULL
     OR p_path ~ '(^|/)[.][.]?(/|$)|%|\\|[[:cntrl:]]'
  THEN
    RETURN false;
  END IF;

  v_parts := string_to_array(p_path, '/');
  IF array_length(v_parts, 1) NOT IN (2, 3)
     OR v_parts[array_length(v_parts, 1)] = ''
  THEN
    RETURN false;
  END IF;

  BEGIN
    v_company := public.get_current_company_id();
    IF array_length(v_parts, 1) = 3 THEN
      v_path_company := v_parts[1]::uuid;
      v_collaborator := v_parts[2]::uuid;
      IF v_path_company IS DISTINCT FROM v_company THEN RETURN false; END IF;
    ELSE
      v_collaborator := v_parts[1]::uuid;
    END IF;
  EXCEPTION
    WHEN invalid_text_representation OR insufficient_privilege THEN RETURN false;
  END;

  IF v_company IS NULL OR NOT EXISTS (
    SELECT 1
    FROM public.rh_colaboradores c
    WHERE c.id = v_collaborator AND c.company_id = v_company
  ) THEN
    RETURN false;
  END IF;

  v_permissions := public.get_company_permissions(auth.uid(), v_company);
  RETURN coalesce(v_permissions && ARRAY[
    'rh:documentos:' || p_action,
    'rh:documentos:manage',
    'rh:manage',
    'system:global:manage'
  ], false);
END;
$function$;

REVOKE ALL ON FUNCTION public.can_access_company_document(text,text)
  FROM PUBLIC, anon, service_role;
GRANT EXECUTE ON FUNCTION public.can_access_company_document(text,text)
  TO authenticated;

-- The saga needs each guarded state transition and final metadata delete to
-- affect exactly one visible row. Granular actions remain usable alongside
-- the existing manage permission.
DROP POLICY IF EXISTS rh_documentos_select ON public.rh_documentos;
CREATE POLICY rh_documentos_select ON public.rh_documentos
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission((SELECT auth.uid()), ARRAY[
      'rh:documentos:view', 'rh:documentos:manage', 'rh:manage', 'system:global:manage'
    ]))
  );

DROP POLICY IF EXISTS rh_documentos_insert ON public.rh_documentos;
CREATE POLICY rh_documentos_insert ON public.rh_documentos
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission((SELECT auth.uid()), ARRAY[
      'rh:documentos:create', 'rh:documentos:manage', 'rh:manage', 'system:global:manage'
    ]))
  );

DROP POLICY IF EXISTS rh_documentos_update ON public.rh_documentos;
CREATE POLICY rh_documentos_update ON public.rh_documentos
  FOR UPDATE TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission((SELECT auth.uid()), ARRAY[
      'rh:documentos:edit', 'rh:documentos:manage', 'rh:manage', 'system:global:manage'
    ]))
  )
  WITH CHECK (company_id = (SELECT public.get_current_company_id()));

DROP POLICY IF EXISTS rh_documentos_delete ON public.rh_documentos;
CREATE POLICY rh_documentos_delete ON public.rh_documentos
  FOR DELETE TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission((SELECT auth.uid()), ARRAY[
      'rh:documentos:delete', 'rh:documentos:manage', 'rh:manage', 'system:global:manage'
    ]))
  );

DO $resolve$
BEGIN
  PERFORM public.can_access_company_document(NULL, NULL);
  PERFORM storage_state FROM public.rh_documentos LIMIT 0;
END;
$resolve$;

COMMIT;

CREATE OR REPLACE FUNCTION public.assert_tenant()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid;
  v_company_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION '403: Usuário não autenticado';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles WHERE id = v_uid;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '403: Tenant inválido — perfil sem empresa vinculada.';
  END IF;

  IF v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '403: Tenant inválido (placeholder) — empresa não configurada.';
  END IF;

  RETURN v_company_id;
END;
$function$;
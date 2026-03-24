CREATE OR REPLACE FUNCTION public.get_current_company_id_strict()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION '403: Usuário não autenticado — faça login novamente.';
  END IF;

  SELECT p.company_id INTO v_company_id
  FROM public.profiles p
  WHERE p.id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION '403: Sua conta não está vinculada a uma empresa. Contate o administrador.';
  END IF;

  IF v_company_id = '00000000-0000-0000-0000-000000000001'::uuid THEN
    RAISE EXCEPTION '403: Tenant inválido (placeholder) — empresa não configurada. Faça logout/login ou contate o administrador.';
  END IF;

  RETURN v_company_id;
END;
$$;
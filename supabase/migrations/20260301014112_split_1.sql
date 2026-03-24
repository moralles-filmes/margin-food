CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_company_id uuid;
  v_default_co uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  -- Se não houver usuário (ex: migrações), retorna a empresa padrão
  IF auth.uid() IS NULL THEN
    RETURN v_default_co;
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  -- Se não encontrar perfil ou empresa, tenta retornar a padrão como fallback
  RETURN COALESCE(v_company_id, v_default_co);
END;
$$;

-- ============================================================
-- 4) Onboarding RPCs
-- ============================================================

-- 4a) Create company (admin only)
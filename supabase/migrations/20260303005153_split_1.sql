CREATE OR REPLACE FUNCTION public.get_current_company_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN public.get_current_company_id_strict();
END;
$$;

-- Harden trigger function:
-- 1) SECURITY INVOKER (safer surface)
-- 2) always set company_id from strict resolver for INSERT/UPDATE
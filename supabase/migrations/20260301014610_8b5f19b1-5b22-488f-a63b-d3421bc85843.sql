
-- ============================================================
-- BATCH 0: Foundation + assert_tenant()
-- ============================================================

-- 1) Create assert_tenant() utility
CREATE OR REPLACE FUNCTION public.assert_tenant()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_uid uuid;
  v_company_id uuid;
BEGIN
  v_uid := auth.uid();
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'assert_tenant: not authenticated';
  END IF;

  SELECT company_id INTO v_company_id
  FROM public.profiles WHERE id = v_uid;

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'assert_tenant: no profile/company for user %', v_uid;
  END IF;

  RETURN v_company_id;
END;
$$;

COMMENT ON FUNCTION public.assert_tenant() IS 'Fail-closed tenant guard. Returns company_id or raises exception. Use in all SECURITY DEFINER RPCs.';

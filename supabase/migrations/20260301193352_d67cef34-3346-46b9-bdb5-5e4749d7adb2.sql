
CREATE OR REPLACE FUNCTION public.debug_tenant()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_uid uuid;
  v_company uuid;
  v_email text;
  v_profile_company uuid;
BEGIN
  v_uid := auth.uid();

  SELECT p.email, p.company_id
    INTO v_email, v_profile_company
    FROM public.profiles p
   WHERE p.id = v_uid;

  BEGIN
    v_company := get_current_company_id();
  EXCEPTION WHEN OTHERS THEN
    v_company := null;
  END;

  RETURN jsonb_build_object(
    'auth_uid', v_uid,
    'get_current_company_id', v_company,
    'profile_email', v_email,
    'profile_company_id', v_profile_company
  );
END;
$$;

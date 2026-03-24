CREATE OR REPLACE FUNCTION public.admin_list_users()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_result jsonb;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'system:global:manage') THEN
    RAISE EXCEPTION 'forbidden';
  END IF;
  v_company := public.assert_tenant();

  SELECT coalesce(jsonb_agg(
    jsonb_build_object(
      'id', p.id,
      'email', p.email,
      'name', p.name,
      'is_super_admin', EXISTS(
        SELECT 1 FROM public.user_permissions up
        WHERE up.user_id = p.id AND up.permission_key = 'system:global:manage' AND up.effect = 'grant'
      )
    ) ORDER BY p.email
  ), '[]'::jsonb)
  INTO v_result
  FROM public.profiles p
  WHERE p.company_id = v_company;

  RETURN v_result;
END;
$$;

GRANT EXECUTE ON FUNCTION public.admin_list_users() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.admin_list_users() FROM anon, public;

-- 3) admin_set_super_admin RPC
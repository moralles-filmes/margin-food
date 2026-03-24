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
      'name', p.nome,
      'is_super_admin', public.has_permission(p.id, 'system:global:manage')
    ) ORDER BY p.email
  ), '[]'::jsonb)
  INTO v_result
  FROM public.profiles p
  WHERE p.company_id = v_company;

  RETURN v_result;
END;
$$;

-- Fix admin_set_super_admin: use has_permission() for current status check + block self-demotion
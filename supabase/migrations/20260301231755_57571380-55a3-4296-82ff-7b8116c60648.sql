
CREATE OR REPLACE FUNCTION public.admin_has_permission(p_user_id uuid, p_permission text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT COALESCE(public.has_permission(p_user_id, p_permission), false);
$$;

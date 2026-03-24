
CREATE OR REPLACE FUNCTION public.admin_has_permission(
  p_user_id UUID,
  p_permission TEXT
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  IF p_user_id IS NULL THEN
    RETURN FALSE;
  END IF;
  RETURN public.has_permission(p_user_id, p_permission);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_has_permission(UUID, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_has_permission(UUID, TEXT) TO authenticated;

-- Re-asserting RBAC functions to ensure they are in the PostgREST schema cache
CREATE OR REPLACE FUNCTION public.get_effective_permissions(_user_id UUID)
RETURNS TEXT[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH role_perms AS (
    SELECT rp.permission_key
    FROM user_roles ur
    JOIN role_permissions rp ON rp.role = ur.role::text
    WHERE ur.user_id = _user_id
  ),
  user_allows AS (
    SELECT permission_key FROM user_permissions
    WHERE user_id = _user_id AND effect = 'ALLOW'
  ),
  user_denies AS (
    SELECT permission_key FROM user_permissions
    WHERE user_id = _user_id AND effect = 'DENY'
  ),
  combined AS (
    SELECT permission_key FROM role_perms
    UNION
    SELECT permission_key FROM user_allows
  )
  SELECT COALESCE(array_agg(permission_key ORDER BY permission_key), ARRAY[]::TEXT[])
  FROM combined
  WHERE permission_key NOT IN (SELECT permission_key FROM user_denies)
$$;

GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID) TO service_role;

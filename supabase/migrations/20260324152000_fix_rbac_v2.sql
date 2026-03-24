-- DROP and RECREATE with different param name to force a clean cache entry
DROP FUNCTION IF EXISTS public.get_effective_permissions(UUID);

CREATE OR REPLACE FUNCTION public.get_effective_permissions(p_user_id UUID)
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
    WHERE ur.user_id = p_user_id
  ),
  user_allows AS (
    SELECT permission_key FROM user_permissions
    WHERE user_id = p_user_id AND effect = 'ALLOW'
  ),
  user_denies AS (
    SELECT permission_key FROM user_permissions
    WHERE user_id = p_user_id AND effect = 'DENY'
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
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID) TO anon;

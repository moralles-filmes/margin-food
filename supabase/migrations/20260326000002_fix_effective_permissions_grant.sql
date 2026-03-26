-- Ensure authenticated role can execute get_effective_permissions
-- This was missing after some migration recreated the function
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_effective_permissions(UUID) TO anon;

NOTIFY pgrst, 'reload schema';

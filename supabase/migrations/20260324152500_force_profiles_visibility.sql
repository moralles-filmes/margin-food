-- Ensure profiles table is visible and accessible to the API
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT ON public.profiles TO anon;
GRANT SELECT ON public.profiles TO service_role;

-- Hard refresh schema cache
NOTIFY pgrst, 'reload schema';

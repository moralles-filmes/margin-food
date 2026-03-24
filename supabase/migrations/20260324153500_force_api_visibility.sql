-- Broad permission grant to ensure the API can see everything it needs
GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA public TO authenticated;

-- Force metadata update on core objects
COMMENT ON TABLE public.profiles IS 'MarginPro Profiles Table';
COMMENT ON FUNCTION public.get_effective_permissions(UUID) IS 'MarginPro RBAC Function';

-- Hard notify
NOTIFY pgrst, 'reload schema';

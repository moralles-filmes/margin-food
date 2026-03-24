-- DIANOSTIC MIGRATION (will fail if objects are missing)
DO $$
DECLARE
  v_count INT;
  v_perms TEXT[];
BEGIN
  -- Check table
  SELECT count(*) INTO v_count FROM public.profiles;
  RAISE NOTICE 'Profiles count: %', v_count;

  -- Check function
  v_perms := public.get_effective_permissions('00000000-0000-0000-0000-000000000000'::UUID);
  RAISE NOTICE 'Perms count: %', array_length(v_perms, 1);
END $$;

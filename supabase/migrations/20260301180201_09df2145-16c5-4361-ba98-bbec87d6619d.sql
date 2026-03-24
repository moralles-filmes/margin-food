
-- The ACLs show =X/supabase_admin (PUBLIC execute granted by supabase_admin)
-- We need to revoke from PUBLIC role which is the catch-all
-- Use ALTER FUNCTION to revoke execute from PUBLIC
DO $$
DECLARE
  fn record;
BEGIN
  FOR fn IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) AS args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'net'
  LOOP
    -- Revoke from PUBLIC (the pseudo-role that all roles inherit from)
    EXECUTE format('REVOKE EXECUTE ON FUNCTION net.%I(%s) FROM PUBLIC', fn.proname, fn.args);
  END LOOP;
END;
$$;

-- Also revoke USAGE on net schema from PUBLIC
REVOKE USAGE ON SCHEMA net FROM PUBLIC;
REVOKE USAGE ON SCHEMA net FROM anon;
REVOKE USAGE ON SCHEMA net FROM authenticated;


-- Revoke pg_net functions individually from public role (inherited by anon/authenticated)
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
    EXECUTE format('REVOKE ALL ON FUNCTION net.%I(%s) FROM PUBLIC', fn.proname, fn.args);
    EXECUTE format('REVOKE ALL ON FUNCTION net.%I(%s) FROM anon', fn.proname, fn.args);
    EXECUTE format('REVOKE ALL ON FUNCTION net.%I(%s) FROM authenticated', fn.proname, fn.args);
  END LOOP;
END;
$$;

-- Also revoke default privileges so new functions don't get grants
ALTER DEFAULT PRIVILEGES IN SCHEMA net REVOKE ALL ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA net REVOKE ALL ON FUNCTIONS FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA net REVOKE ALL ON FUNCTIONS FROM authenticated;

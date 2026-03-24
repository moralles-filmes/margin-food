
-- Governance Phase 2.2: Revoke pg_net HTTP functions from API roles

-- Revoke EXECUTE on all dangerous functions from PUBLIC/anon/authenticated
REVOKE EXECUTE ON FUNCTION net.http_get(text, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION net.http_post(text, jsonb, jsonb, jsonb, integer) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION net.http_delete(text, jsonb, jsonb, integer, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION net.http_collect_response(bigint, boolean) FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION net._http_collect_response(bigint, boolean) FROM PUBLIC, anon, authenticated;

-- Revoke schema USAGE
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;

-- Re-grant to service_role
GRANT USAGE ON SCHEMA net TO service_role;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA net TO service_role;

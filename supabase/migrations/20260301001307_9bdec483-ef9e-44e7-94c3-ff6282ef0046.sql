
-- Governance Phase 2.2: Harden pg_net access
-- pg_net does not support SET SCHEMA, so we revoke all access from API roles instead.

-- Revoke schema usage from API roles
REVOKE USAGE ON SCHEMA net FROM anon, authenticated;

-- Revoke all on functions in net schema
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM anon, authenticated;

-- Revoke all on tables/sequences in net schema
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM anon, authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA net FROM anon, authenticated;

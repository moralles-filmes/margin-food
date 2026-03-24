
-- Governance Phase 2.2: Revoke pg_net access from PUBLIC role (inherited by anon/authenticated)

-- Revoke schema usage
REVOKE USAGE ON SCHEMA net FROM PUBLIC;

-- Revoke all functions
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA net FROM PUBLIC;

-- Revoke all tables/sequences
REVOKE ALL ON ALL TABLES IN SCHEMA net FROM PUBLIC;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA net FROM PUBLIC;

-- Re-grant to postgres (superuser needs access for SECURITY DEFINER functions)
GRANT USAGE ON SCHEMA net TO postgres, service_role;
GRANT ALL ON ALL FUNCTIONS IN SCHEMA net TO postgres, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA net TO postgres, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA net TO postgres, service_role;

\set ON_ERROR_STOP on
-- Execute only with the application/Edge Functions paused, after a verified
-- full backup. Restore the previous app and Edge versions before reopening.
BEGIN;
SET LOCAL lock_timeout='10s';
SET LOCAL statement_timeout='120s';
LOCK TABLE public.profiles,public.user_roles,public.user_permissions,public.company_memberships IN ACCESS EXCLUSIVE MODE;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.company_id<>'00000000-0000-0000-0000-000000000001'::uuid
   AND NOT EXISTS(SELECT 1 FROM public.company_memberships m WHERE m.user_id=p.id AND m.company_id=p.company_id AND m.status='active')) THEN
   RAISE EXCEPTION 'ROLLBACK_BLOCKED: legacy home access was removed or never provisioned; resolve identity access before reverting';
 END IF;
END; $$;
-- Preserve all current multi-unit assignments, including post-launch changes.
-- CREATE TABLE intentionally fails on a repeated rollback instead of overwriting.
CREATE TABLE multiunit_private.roles_at_rollback AS TABLE public.user_roles;
CREATE TABLE multiunit_private.permissions_at_rollback AS TABLE public.user_permissions;
CREATE TABLE multiunit_private.memberships_at_rollback AS TABLE public.company_memberships;

-- Restore policies while the added columns still exist.
DO $$ DECLARE r record; v_roles text; BEGIN
 FOR r IN SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') LOOP
   EXECUTE format('DROP POLICY %I ON %I.%I',r.policyname,r.schemaname,r.tablename);
 END LOOP;
 FOR r IN SELECT * FROM multiunit_private.policies_before LOOP
   SELECT string_agg(CASE WHEN item='public' THEN 'PUBLIC' ELSE quote_ident(item) END,',') INTO v_roles FROM unnest(r.roles) item;
   EXECUTE format('CREATE POLICY %I ON %I.%I AS %s FOR %s TO %s%s%s',r.policyname,r.schemaname,r.tablename,r.permissive,r.cmd,v_roles,
    CASE WHEN r.qual IS NULL THEN '' ELSE ' USING ('||r.qual||')' END,
    CASE WHEN r.with_check IS NULL THEN '' ELSE ' WITH CHECK ('||r.with_check||')' END);
 END LOOP;
 -- New APIs are retained as historical objects but no longer callable by clients.
 FOR r IN SELECT p.oid::regprocedure AS signature FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public' AND p.prokind='f' AND NOT EXISTS(
   SELECT 1 FROM multiunit_private.definitions_before b WHERE b.signature=p.oid::regprocedure::text) LOOP
   EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC,anon,authenticated,service_role',r.signature);
 END LOOP;
 FOR r IN SELECT * FROM multiunit_private.definitions_before LOOP EXECUTE r.definition; END LOOP;
END; $$;
DROP TRIGGER protect_profile_identity_scope ON public.profiles;
DO $$ DECLARE r record; BEGIN
 FOR r IN SELECT * FROM multiunit_private.triggers_before WHERE tgname='on_first_admin_assignment' LOOP EXECUTE r.definition; END LOOP;
END; $$;
-- Additional-company grants were archived above. Preserve the latest original
-- company grants, rather than restoring a stale pre-launch permission snapshot.
SET LOCAL session_replication_role=replica;
DELETE FROM public.user_roles r USING public.profiles p WHERE p.id=r.user_id AND r.company_id<>p.company_id;
DELETE FROM public.user_permissions r USING public.profiles p WHERE p.id=r.user_id AND r.company_id<>p.company_id;
SET LOCAL session_replication_role=origin;
ALTER TABLE public.user_roles DROP COLUMN company_id;
ALTER TABLE public.user_permissions DROP COLUMN company_id;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_user_id_role_key UNIQUE(user_id,role);
ALTER TABLE public.user_permissions ADD CONSTRAINT user_permissions_user_id_permission_key_key UNIQUE(user_id,permission_key);
REVOKE ALL ON TABLE public.company_memberships FROM anon,authenticated,service_role;

-- Restore the exact function ACLs, table RLS flags and Realtime publication.
DO $$ DECLARE r record; a record; v_grantee text; BEGIN
 FOR r IN SELECT * FROM multiunit_private.definitions_before LOOP
   FOR a IN SELECT DISTINCT grantee FROM aclexplode(COALESCE((SELECT proacl FROM pg_proc WHERE oid=r.signature::regprocedure),acldefault('f',(SELECT oid FROM pg_roles WHERE rolname=current_user)))) LOOP
     v_grantee:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
     EXECUTE format('REVOKE ALL ON FUNCTION %s FROM %s',r.signature,v_grantee);
   END LOOP;
   FOR a IN SELECT * FROM aclexplode(COALESCE(r.acl,acldefault('f',(SELECT oid FROM pg_roles WHERE rolname=current_user)))) LOOP
     v_grantee:=CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE quote_ident(pg_get_userbyid(a.grantee)) END;
     EXECUTE format('GRANT %s ON FUNCTION %s TO %s%s',a.privilege_type,r.signature,v_grantee,CASE WHEN a.is_grantable THEN ' WITH GRANT OPTION' ELSE '' END);
   END LOOP;
 END LOOP;
 FOR r IN SELECT * FROM multiunit_private.relations_before LOOP
   EXECUTE format('ALTER TABLE %I.%I %s ROW LEVEL SECURITY',r.schema_name,r.table_name,CASE WHEN r.relrowsecurity THEN 'ENABLE' ELSE 'DISABLE' END);
   EXECUTE format('ALTER TABLE %I.%I %s ROW LEVEL SECURITY',r.schema_name,r.table_name,CASE WHEN r.relforcerowsecurity THEN 'FORCE' ELSE 'NO FORCE' END);
 END LOOP;
 FOR r IN SELECT * FROM pg_publication_tables p WHERE pubname='supabase_realtime' AND NOT EXISTS(
   SELECT 1 FROM multiunit_private.publication_before b WHERE b.schemaname=p.schemaname AND b.tablename=p.tablename) LOOP
   EXECUTE format('ALTER PUBLICATION supabase_realtime DROP TABLE %I.%I',r.schemaname,r.tablename);
 END LOOP;
 FOR r IN SELECT tablename FROM pg_tables WHERE schemaname='multiunit_private' LOOP
   EXECUTE format('ALTER TABLE multiunit_private.%I ENABLE ROW LEVEL SECURITY',r.tablename);
   EXECUTE format('ALTER TABLE multiunit_private.%I FORCE ROW LEVEL SECURITY',r.tablename);
 END LOOP;
END; $$;
REVOKE ALL ON ALL TABLES IN SCHEMA multiunit_private FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
COMMIT;

BEGIN;
-- Defense against permissive legacy policies (which PostgreSQL combines by OR).
-- HTTP scope is mandatory for new clients; headerless single-company calls retain
-- the validated original company. Realtime has its own per-row membership check.
DO $tenant_boundary$
DECLARE r record;
BEGIN
 FOR r IN SELECT DISTINCT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 JOIN pg_attribute a ON a.attrelid=c.oid AND a.attname='company_id' AND NOT a.attisdropped
 WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relrowsecurity
 AND c.relname NOT IN ('profiles','company_memberships') LOOP
   EXECUTE format($policy$CREATE POLICY multiunit_scope_boundary ON public.%I AS RESTRICTIVE FOR ALL TO authenticated
     USING(company_id=(SELECT public.get_current_company_id()) OR
       ((SELECT NULLIF(current_setting('request.headers',true),'') IS NULL) AND public.is_company_member((SELECT auth.uid()),company_id)))
     WITH CHECK(company_id=(SELECT public.get_current_company_id()))$policy$,r.relname);
 END LOOP;
 FOR r IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='multiunit_private' AND c.relkind='r' LOOP
   EXECUTE format('ALTER TABLE multiunit_private.%I ENABLE ROW LEVEL SECURITY',r.relname);
   EXECUTE format('ALTER TABLE multiunit_private.%I FORCE ROW LEVEL SECURITY',r.relname);
 END LOOP;
END;
$tenant_boundary$;

DO $resolve_columns$
BEGIN
 -- PL/pgSQL resolves column names on first execution. These joins force all new
 -- membership/profile/role references to be resolved during deployment.
 PERFORM p.id,p.nome,p.email,m.id,m.company_id,m.status,m.job_role_id,m.sector,c.nome,c.ativo,r.role,u.effect
 FROM public.profiles p JOIN public.company_memberships m ON m.user_id=p.id
 JOIN public.companies c ON c.id=m.company_id
 LEFT JOIN public.user_roles r ON r.user_id=m.user_id AND r.company_id=m.company_id
 LEFT JOIN public.user_permissions u ON u.user_id=m.user_id AND u.company_id=m.company_id LIMIT 1;
 IF EXISTS(SELECT 1 FROM public.company_memberships m JOIN public.job_roles j ON j.id=m.job_role_id WHERE j.company_id<>m.company_id) THEN
   RAISE EXCEPTION 'MULTIUNIT_JOB_ROLE_COMPANY_MISMATCH';
 END IF;
 IF EXISTS(SELECT 1 FROM public.profiles p WHERE p.company_id<>'00000000-0000-0000-0000-000000000001'::uuid
   AND NOT EXISTS(SELECT 1 FROM public.company_memberships m WHERE m.user_id=p.id AND m.company_id=p.company_id)) THEN
   RAISE EXCEPTION 'MULTIUNIT_ORIGINAL_MEMBERSHIP_MISSING';
 END IF;
END;
$resolve_columns$;
NOTIFY pgrst, 'reload schema';
COMMIT;

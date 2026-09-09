\set ON_ERROR_STOP on
SELECT admin_upsert_company_membership('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222',
 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','operador',ARRAY['financeiro:relatorio-socios:view'],'active',NULL,NULL,true);
\i supabase/rollback/multiunit_to_single_company.sql
DO $$ BEGIN
 IF (SELECT count(*) FROM auth.users)<>2 THEN RAISE EXCEPTION 'identity loss'; END IF;
 IF (SELECT count(*) FROM multiunit_private.memberships_at_rollback)<>3 THEN RAISE EXCEPTION 'membership archive loss'; END IF;
 IF (SELECT count(*) FROM multiunit_private.roles_at_rollback)<>3 THEN RAISE EXCEPTION 'role archive loss'; END IF;
 IF (SELECT count(*) FROM public.user_roles)<>2 THEN RAISE EXCEPTION 'original roles not restored'; END IF;
 IF EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='user_roles' AND column_name='company_id') THEN RAISE EXCEPTION 'legacy shape not restored'; END IF;
 IF EXISTS(SELECT 1 FROM multiunit_private.definitions_before b WHERE pg_get_functiondef(b.signature::regprocedure)<>b.definition) THEN RAISE EXCEPTION 'function drift'; END IF;
 IF EXISTS(SELECT * FROM multiunit_private.policies_before EXCEPT SELECT * FROM pg_policies WHERE schemaname IN ('public','storage')) THEN RAISE EXCEPTION 'policy drift'; END IF;
 IF EXISTS(SELECT * FROM pg_policies WHERE schemaname IN ('public','storage') EXCEPT SELECT * FROM multiunit_private.policies_before) THEN RAISE EXCEPTION 'new policy left behind'; END IF;
END; $$;

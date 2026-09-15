-- Leitura somente. Não invoca limpeza nem refresh.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT p.oid::regprocedure AS function,r.rolname,
 has_function_privilege(r.oid,p.oid,'EXECUTE') AS effective_execute,
 pg_get_userbyid(p.proowner) AS owner,p.proconfig
FROM pg_proc p CROSS JOIN pg_roles r
WHERE p.oid IN ('public.cleanup_old_audit_logs(integer)'::regprocedure,
 'public.refresh_materialized_views()'::regprocedure,'public.rpc_create_company(text,text)'::regprocedure)
AND r.rolname IN ('anon','authenticated','service_role');
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='companies';
SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='companies';
DO $$ BEGIN
 IF has_function_privilege('anon','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR has_function_privilege('authenticated','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR has_function_privilege('anon','public.refresh_materialized_views()','EXECUTE')
 OR has_function_privilege('authenticated','public.refresh_materialized_views()','EXECUTE')
 OR has_function_privilege('anon','public.rpc_create_company(text,text)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.cleanup_old_audit_logs(integer)','EXECUTE')
 OR NOT has_function_privilege('service_role','public.refresh_materialized_views()','EXECUTE')
 OR has_table_privilege('authenticated','public.companies','TRUNCATE,TRIGGER,REFERENCES,MAINTAIN') THEN
  RAISE EXCEPTION 'PHASE2_POSTVALIDATION_FAILED';
 END IF;
END $$;
ROLLBACK;
-- Executar também ../auditoria-20260915/sondagem-admin-leitura.sql:
-- esperado: companies_visible=1, companies_without_membership=0,
-- real_companies_without_membership=0, local_admin=true, global_admin=false.

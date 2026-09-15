-- Inventário específico Fase 2, sem manutenção, payloads de logs ou dados de identidade.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout='15s';
SELECT current_setting('server_version') AS server_version;
SELECT p.oid::regprocedure::text signature,pg_get_userbyid(p.proowner) owner,p.proacl,p.proconfig,
 pg_get_functiondef(p.oid) definition
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname='public' AND p.proname IN ('cleanup_old_audit_logs','refresh_materialized_views',
 'rpc_create_company','list_my_companies','list_companies','update_company','onboard_new_company',
 'rpc_set_user_company','has_permission','get_effective_permissions','get_company_permissions',
 'get_current_company_id','assert_tenant','is_company_member');
SELECT p.oid::regprocedure::text signature,r.rolname,has_function_privilege(r.oid,p.oid,'EXECUTE') effective_execute
FROM pg_proc p CROSS JOIN pg_roles r WHERE p.oid IN (
 'public.cleanup_old_audit_logs(integer)'::regprocedure,'public.refresh_materialized_views()'::regprocedure,
 'public.rpc_create_company(text,text)'::regprocedure) AND r.rolname IN ('anon','authenticated','service_role');
SELECT relacl,relrowsecurity,relforcerowsecurity FROM pg_class WHERE oid='public.companies'::regclass;
SELECT * FROM pg_policies WHERE schemaname='public' AND tablename='companies';
SELECT grantee,privilege_type FROM information_schema.role_table_grants WHERE table_schema='public' AND table_name='companies';
SELECT p.oid::regprocedure::text AS caller,pg_get_functiondef(p.oid)
FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE n.nspname NOT IN ('pg_catalog','information_schema') AND p.prokind='f'
 AND p.prosrc ~ '(cleanup_old_audit_logs|refresh_materialized_views)'
 AND p.proname NOT IN ('cleanup_old_audit_logs','refresh_materialized_views');
SELECT extname FROM pg_extension;
SELECT to_regclass('cron.job') AS cron_job;
SELECT schemaname,matviewname,definition FROM pg_matviews WHERE schemaname IN ('public','reporting');
SELECT source,action,entity,success,count(*),max(created_at) AS latest
FROM public.audit_logs WHERE entity IN ('scheduled-jobs','materialized_views') OR action='JOB_CLEANUP'
GROUP BY source,action,entity,success;
ROLLBACK;
-- Se cron.job passar a existir, revisar comandos/agendamentos por canal seguro antes de prosseguir.
-- Não exportar cron.command integralmente: pode conter credenciais antigas.

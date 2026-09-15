-- Inventário somente de leitura; não é migration. Rodar com acesso administrativo.
-- Resultados contêm metadados do schema; não publicar payloads de registros.
BEGIN TRANSACTION READ ONLY;
SET LOCAL statement_timeout = '15s';

-- Flags das tabelas; presença de company_id não é prova de isolamento.
SELECT c.relname AS table_name, c.relrowsecurity AS rls, c.relforcerowsecurity AS force_rls,
 EXISTS(SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='company_id' AND NOT a.attisdropped) AS has_company_id,
 (SELECT count(*) FROM pg_policy p WHERE p.polrelid=c.oid) AS policies,
 EXISTS(SELECT 1 FROM pg_policy p WHERE p.polrelid=c.oid AND p.polname='multiunit_scope_boundary') AS boundary
FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname;

-- Distribuição histórica do log legado, sem payloads ou identidade dos atores.
SELECT tabela, count(*) AS rows, count(*) FILTER(WHERE user_id IS NULL) AS no_actor
FROM public.audit_log GROUP BY tabela ORDER BY tabela;

SELECT module, action, count(*) AS rows, count(*) FILTER(WHERE reference_id IS NULL) AS no_reference
FROM public.integration_logs GROUP BY module,action ORDER BY module,action;

-- log_schema
select table_name,column_name,data_type,is_nullable,column_default from information_schema.columns where table_schema='public' and table_name in ('audit_log','audit_logs','integration_logs','suppliers','z_canary_test') order by table_name,ordinal_position;

-- object_metadata
select 'constraint' as kind,c.conrelid::regclass::text as object,c.conname as name,pg_get_constraintdef(c.oid) as definition from pg_constraint c where c.conrelid in ('public.audit_log'::regclass,'public.audit_logs'::regclass,'public.integration_logs'::regclass,'public.suppliers'::regclass) union all select 'index',tablename,indexname,indexdef from pg_indexes where schemaname='public' and tablename in ('audit_log','audit_logs','integration_logs','suppliers') union all select 'trigger',t.tgrelid::regclass::text,t.tgname,pg_get_triggerdef(t.oid) from pg_trigger t where not t.tgisinternal and t.tgrelid in ('public.audit_log'::regclass,'public.audit_logs'::regclass,'public.integration_logs'::regclass,'public.suppliers'::regclass) order by kind,object,name;

-- policies
select schemaname,tablename,policyname,permissive,roles,cmd,qual,with_check from pg_policies where schemaname in ('public','storage') order by schemaname,tablename,policyname;

-- function_inventory
select p.oid::regprocedure::text as signature,p.prosecdef as security_definer,p.proconfig,pg_get_userbyid(p.proowner) as owner,has_function_privilege('authenticated',p.oid,'EXECUTE') as authenticated_execute,has_function_privilege('anon',p.oid,'EXECUTE') as anon_execute,p.prosrc ~ 'assert_tenant|get_current_company_id' as mentions_tenant,p.prosrc ~ 'has_permission|has_any_permission|assert_permission' as mentions_permission from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' order by signature;

-- migrations
select version,name from supabase_migrations.schema_migrations order by version;

-- storage_realtime
select jsonb_build_object('buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public)) from storage.buckets),'realtime',(select jsonb_agg(tablename) from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'),'grants',(select jsonb_agg(jsonb_build_object('table',table_name,'role',grantee,'privilege',privilege_type)) from information_schema.role_table_grants where table_schema='public' and table_name in ('audit_log','audit_logs','integration_logs','z_canary_test') and grantee in ('anon','authenticated'))) as inventory;

-- table_details
select c.relname as table_name,a.attnotnull as company_not_null,pg_get_expr(d.adbin,d.adrelid) as company_default,
(select jsonb_agg(jsonb_build_object('name',k.conname,'definition',pg_get_constraintdef(k.oid))) from pg_constraint k where k.conrelid=c.oid) as constraints,
(select jsonb_agg(jsonb_build_object('name',ic.relname,'definition',pg_get_indexdef(i.indexrelid),'valid',i.indisvalid)) from pg_index i join pg_class ic on ic.oid=i.indexrelid where i.indrelid=c.oid) as indexes,
(select jsonb_agg(jsonb_build_object('name',t.tgname,'definition',pg_get_triggerdef(t.oid))) from pg_trigger t where t.tgrelid=c.oid and not t.tgisinternal) as triggers,
(select jsonb_agg(jsonb_build_object('role',g.grantee,'privilege',g.privilege_type)) from information_schema.role_table_grants g where g.table_schema='public' and g.table_name=c.relname and g.grantee in ('anon','authenticated','service_role')) as grants
from pg_class c join pg_namespace n on n.oid=c.relnamespace left join pg_attribute a on a.attrelid=c.oid and a.attname='company_id' and not a.attisdropped left join pg_attrdef d on d.adrelid=c.oid and d.adnum=a.attnum where n.nspname='public' and c.relkind in ('r','p') order by c.relname;

-- log_triggers
select t.tgrelid::regclass::text as table_name,t.tgname,pg_get_triggerdef(t.oid) as definition from pg_trigger t where not t.tgisinternal and t.tgfoid in (select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind='f' and (p.prosrc like '%audit_log%' or p.prosrc like '%integration_logs%')) order by table_name,t.tgname;

-- audit_hints
with hints as (select company_id, "before"->>'company_id' as b,"after"->>'company_id' as a,metadata->>'company_id' as m from public.audit_logs)
select count(*) as total,count(*) filter(where company_id is null) as null_company,count(*) filter(where company_id is not null) as assigned,count(*) filter(where company_id is null and coalesce(a,b,m) is not null) as null_with_hint,count(*) filter(where company_id is null and coalesce(a,b,m) is null) as null_without_hint,count(*) filter(where a is not null and b is not null and a<>b) as conflicting_before_after from hints;

ROLLBACK;

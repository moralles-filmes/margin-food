begin read only; select jsonb_build_object(
'captured_at',now(),
'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'execute'),'authenticated',has_function_privilege('authenticated',p.oid,'execute'),'service',has_function_privilege('service_role',p.oid,'execute'))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reporting') and p.prokind='f'),
'buckets',(select jsonb_agg(jsonb_build_object('id',id,'public',public,'limit',file_size_limit,'mime',allowed_mime_types)) from storage.buckets),
'storage_policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname in ('storage','realtime')),
'realtime_policies',(select jsonb_agg(to_jsonb(p)) from pg_policies p where schemaname='public' and tablename in('produtos','movimentacoes_estoque','notifications','purchase_orders','cotacoes','cotacao_fornecedores')),
'storage_acl',(select jsonb_agg(jsonb_build_object('relation',c.oid::regclass::text,'acl',c.relacl::text,'rls',c.relrowsecurity,'owner',pg_get_userbyid(c.relowner))) from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='storage' and relname in ('objects','buckets')),
'publications',(select jsonb_agg(to_jsonb(p)) from pg_publication_tables p where schemaname='public'),
'replication',(select jsonb_agg(jsonb_build_object('name',c.relname,'replica_identity',c.relreplident)) from pg_class c where c.oid in(select prrelid from pg_publication_rel)),
'extensions',(select jsonb_agg(extname) from pg_extension),
'cron',to_regclass('cron.job'),
'net_callers',(select jsonb_agg(jsonb_build_object('name',p.oid::regprocedure::text,'md5',md5(pg_get_functiondef(p.oid)))) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname in ('public','reporting') and prokind='f' and pg_get_functiondef(p.oid) ~ 'net[.]|http_post|http_get'),
'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations where version>='20260909000000')) as catalog; rollback;

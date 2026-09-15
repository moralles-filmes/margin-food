select jsonb_build_object(
'captured_at',now(),'server_version',current_setting('server_version'),
'functions',(select jsonb_agg(jsonb_build_object('signature',p.oid::regprocedure::text,'name',p.proname,'definition',pg_get_functiondef(p.oid),'md5',md5(pg_get_functiondef(p.oid)),'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'acl',p.proacl::text,'anon',has_function_privilege('anon',p.oid,'EXECUTE'),'authenticated',has_function_privilege('authenticated',p.oid,'EXECUTE'),'service',has_function_privilege('service_role',p.oid,'EXECUTE')) order by p.oid::regprocedure::text) from pg_proc p join pg_language l on l.oid=p.prolang where pronamespace='public'::regnamespace and prokind='f' and l.lanname in ('sql','plpgsql')),
'policies',(select jsonb_agg(to_jsonb(p) order by schemaname,tablename,policyname) from pg_policies p where schemaname in ('public','storage')),
'product_columns',(select jsonb_agg(jsonb_build_array(attname,format_type(atttypid,atttypmod),attnotnull,pg_get_expr(d.adbin,d.adrelid),attacl::text) order by a.attnum) from pg_attribute a left join pg_attrdef d on d.adrelid=a.attrelid and d.adnum=a.attnum where a.attrelid='public.produtos'::regclass and attnum>0 and not attisdropped),
'product_constraints',(select jsonb_agg(jsonb_build_array(conname,conrelid::regclass::text,pg_get_constraintdef(oid),convalidated) order by conname) from pg_constraint where conrelid='public.produtos'::regclass or confrelid='public.produtos'::regclass),
'product_indexes',(select jsonb_agg(indexdef order by indexname) from pg_indexes where schemaname='public' and tablename='produtos'),
'product_triggers',(select jsonb_agg(jsonb_build_array(tgname,pg_get_triggerdef(oid),tgenabled) order by tgname) from pg_trigger where tgrelid='public.produtos'::regclass and not tgisinternal),
'product_table',(select jsonb_build_object('rls',relrowsecurity,'force',relforcerowsecurity,'acl',relacl::text,'owner',pg_get_userbyid(relowner)) from pg_class where oid='public.produtos'::regclass),
'role_memberships',(select jsonb_agg(jsonb_build_array(pg_get_userbyid(roleid),pg_get_userbyid(member),admin_option)) from pg_auth_members),
'migrations',(select jsonb_agg(version order by version) from supabase_migrations.schema_migrations where version>='20260909000000')
) as catalog;

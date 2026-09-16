-- Metadados de plataforma; não consulta Auth.users, objetos Storage ou payloads privados.
BEGIN READ ONLY;
SELECT jsonb_build_object(
 'captured_at',now(),'timezone',current_setting('timezone'),
 'functions',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'identity',p.oid::regprocedure::text,'args',pg_get_function_arguments(p.oid),'result',pg_get_function_result(p.oid),'kind',p.prokind,'volatility',p.provolatile,'strict',p.proisstrict,'parallel',p.proparallel,'owner',pg_get_userbyid(p.proowner),'definer',p.prosecdef,'config',p.proconfig,'language',l.lanname,'acl',p.proacl::text,'effective_acl',(SELECT jsonb_agg(jsonb_build_object('grantee',CASE WHEN a.grantee=0 THEN 'PUBLIC' ELSE pg_get_userbyid(a.grantee) END,'grantor',pg_get_userbyid(a.grantor),'privilege',a.privilege_type,'grantable',a.is_grantable) ORDER BY a.grantee,a.privilege_type) FROM aclexplode(coalesce(p.proacl,acldefault('f',p.proowner))) a)) ORDER BY n.nspname,p.oid::regprocedure::text) FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace JOIN pg_language l ON l.oid=p.prolang WHERE n.nspname NOT LIKE 'pg_%' AND n.nspname<>'information_schema'),
 'sequences',(SELECT jsonb_agg(jsonb_build_object('schema',n.nspname,'name',c.relname,'owner',pg_get_userbyid(c.relowner),'acl',c.relacl::text,'type',s.seqtypid::regtype::text,'start',s.seqstart,'min',s.seqmin,'max',s.seqmax,'increment',s.seqincrement,'cycle',s.seqcycle,'cache',s.seqcache)) FROM pg_sequence s JOIN pg_class c ON c.oid=s.seqrelid JOIN pg_namespace n ON n.oid=c.relnamespace),
 'event_triggers',(SELECT jsonb_agg(jsonb_build_object('name',evtname,'event',evtevent,'owner',pg_get_userbyid(evtowner),'function',evtfoid::regprocedure::text,'enabled',evtenabled,'tags',evttags)) FROM pg_event_trigger),
 'extensions',(SELECT jsonb_agg(jsonb_build_object('name',e.extname,'version',e.extversion,'schema',n.nspname,'owner',pg_get_userbyid(e.extowner))) FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace),
 'publications',(SELECT jsonb_agg(jsonb_build_object('name',pubname,'owner',pg_get_userbyid(pubowner),'all',puballtables,'insert',pubinsert,'update',pubupdate,'delete',pubdelete,'truncate',pubtruncate,'via_root',pubviaroot)) FROM pg_publication),
 'publication_tables',(SELECT jsonb_agg(to_jsonb(t)) FROM pg_publication_tables t),
 'replica_identity',(SELECT jsonb_agg(jsonb_build_object('table',c.oid::regclass::text,'identity',c.relreplident)) FROM pg_class c JOIN pg_publication_rel p ON p.prrelid=c.oid),
 'buckets',(SELECT jsonb_agg(jsonb_build_object('id',id,'public',public,'limit',file_size_limit,'mime',allowed_mime_types)) FROM storage.buckets),
 'history_columns',(SELECT jsonb_agg(column_name ORDER BY ordinal_position) FROM information_schema.columns WHERE table_schema='supabase_migrations' AND table_name='schema_migrations')
) evidence;
ROLLBACK;

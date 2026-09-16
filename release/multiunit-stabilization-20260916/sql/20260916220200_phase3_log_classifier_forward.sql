BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('audit_trigger_fn()') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='2c8e96a4f8e6d8afb6e06cced6656b7e') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: audit_trigger_fn()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='cc1dac531033feb7d48b2be90fe8d129') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_audit(text,text,text,text,text,jsonb,jsonb,jsonb)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='144db59764fda78ccb81d3cff2d15d36') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_audit(text,text,text,text,text,jsonb,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='5334eb25e4e4e9ee62c75e3bf1c54c01') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_private.resource_company(text,uuid)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='cd02bc6fde7b24baa3d28328a88acf67') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_private.resource_company(text,uuid)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='51c2598957d8f65f87ec07fdab2f9362') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('list_restricted_logs(text,text,integer,timestamp with time zone,uuid,text,text,text)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='3f277bbe8e49629e2beadc527d56eccd') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: list_restricted_logs(text,text,integer,timestamp with time zone,uuid,text,text,text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_private.uuid_or_null(text)') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='405c0a0f64ecbc8221654c4755a41417') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_private.uuid_or_null(text)'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_private.stamp_log()') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='089b2bb74d8952b02cfdff9342080628') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_private.stamp_log()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_private.audit_resource()') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='60527e09df55cc4ff78c4513fe83cdf0') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_private.audit_resource()'; END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('log_private.is_service()') AND pg_get_userbyid(proowner)='postgres' AND md5(replace(pg_get_functiondef(oid),chr(13),''))='8b6d9157d0e079793347919af735d57c') THEN RAISE EXCEPTION 'PHASE3_BACKFILL_DEFINITION_DRIFT: log_private.is_service()'; END IF;
 IF to_regprocedure('log_private.stamp_log()') IS NULL OR to_regprocedure('log_private.resource_company(text,uuid)') IS NULL
 OR has_table_privilege('authenticated','public.audit_logs','INSERT')
 OR has_function_privilege('authenticated','public.audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)','EXECUTE')
 OR (SELECT count(*) FROM pg_trigger WHERE tgname='stamp_log' AND tgenabled='O' AND tgrelid IN ('public.audit_log'::regclass,'public.audit_logs'::regclass,'public.integration_logs'::regclass))<>3
 THEN RAISE EXCEPTION 'PHASE3_WRITERS_NOT_READY'; END IF;
END $$;

-- Atribuição de tenant não certifica a autoria/conteúdo dos writers antigos.
-- Nunca consulta profiles, memberships atuais ou preferência de navegação.
CREATE FUNCTION log_private.classify_legacy(p_table text,r jsonb)
RETURNS TABLE(target_company uuid,reason text) LANGUAGE plpgsql VOLATILE SECURITY DEFINER SET search_path='' AS $$
DECLARE entity text; resource_id uuid; hint text; hint_company uuid; other_company uuid;
BEGIN
 IF p_table='audit_log' THEN entity:=r->>'tabela'; resource_id:=log_private.uuid_or_null(r->>'registro_id');
 ELSIF p_table='audit_logs' THEN entity:=r->>'entity'; resource_id:=log_private.uuid_or_null(r->>'entity_id');
 ELSIF p_table='integration_logs' AND r->>'module'='salmon_to_stock' THEN entity:='salmon_entries'; resource_id:=log_private.uuid_or_null(r->>'reference_id');
 ELSE reason:='unknown_source'; RETURN NEXT; RETURN; END IF;
 IF entity IN ('auth.users','profiles','user_roles','company_memberships','companies') THEN reason:='identity_or_global_unproven'; RETURN NEXT; RETURN; END IF;
 IF resource_id IS NULL THEN reason:='invalid_or_missing_resource_id'; RETURN NEXT; RETURN; END IF;
 target_company:=log_private.resource_company(entity,resource_id);
 IF p_table='integration_logs' THEN
  other_company:=log_private.resource_company('salmon_manipulations',resource_id);
  IF target_company IS NOT NULL AND other_company IS NOT NULL AND target_company<>other_company THEN target_company:=NULL; reason:='conflicting_resource'; RETURN NEXT; RETURN; END IF;
  target_company:=COALESCE(target_company,other_company);
 END IF;
 IF target_company IS NULL THEN reason:='resource_absent_or_unsupported'; RETURN NEXT; RETURN; END IF;
 IF target_company='00000000-0000-0000-0000-000000000001'::uuid OR NOT EXISTS(SELECT 1 FROM public.companies WHERE id=target_company) THEN target_company:=NULL; reason:='invalid_resource_company'; RETURN NEXT; RETURN; END IF;
 FOREACH hint IN ARRAY ARRAY[r->>'company_id',r#>>'{before,company_id}',r#>>'{after,company_id}',r#>>'{metadata,company_id}',r#>>'{payload,company_id}'] LOOP
  IF hint IS NULL THEN CONTINUE; END IF;
  hint_company:=log_private.uuid_or_null(hint);
  IF hint_company IS NULL THEN target_company:=NULL; reason:='invalid_company_hint'; RETURN NEXT; RETURN; END IF;
  IF hint_company<>target_company THEN target_company:=NULL; reason:='conflicting_company_hint'; RETURN NEXT; RETURN; END IF;
 END LOOP;
 FOREACH hint IN ARRAY ARRAY[r#>>'{before,id}',r#>>'{after,id}'] LOOP
  IF hint IS NOT NULL AND log_private.uuid_or_null(hint) IS DISTINCT FROM resource_id THEN target_company:=NULL; reason:='conflicting_resource_hint'; RETURN NEXT; RETURN; END IF;
 END LOOP;
 reason:='legacy_resource_correlated'; RETURN NEXT;
END $$;
REVOKE ALL ON FUNCTION log_private.classify_legacy(text,jsonb) FROM PUBLIC,anon,authenticated,service_role;

-- Uma chamada = um lote/uma transação. Default dry-run; concorrência usa SKIP LOCKED.
-- scope_reason final impede reprocessamento, inclusive das ambiguidades preservadas.
CREATE FUNCTION public.backfill_log_scope(p_table text,p_batch_size integer DEFAULT 500,p_dry_run boolean DEFAULT true)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path='' AS $$
DECLARE r record; c record; scanned integer:=0; assigned integer:=0; counts jsonb:='{}';
BEGIN
 IF NOT log_private.is_service() THEN RAISE EXCEPTION 'SERVICE_ONLY' USING ERRCODE='42501'; END IF;
 IF p_table IS NULL OR p_table NOT IN ('audit_log','audit_logs','integration_logs') OR p_batch_size IS NULL OR p_batch_size NOT BETWEEN 1 AND 2000 OR p_dry_run IS NULL THEN RAISE EXCEPTION 'LOG_INVALID_BATCH' USING ERRCODE='22023'; END IF;
 FOR r IN EXECUTE format('SELECT id,to_jsonb(l) row_data FROM public.%I l WHERE scope_reason=''legacy_pending'' ORDER BY id LIMIT $1 FOR UPDATE SKIP LOCKED',p_table) USING p_batch_size LOOP
  SELECT * INTO c FROM log_private.classify_legacy(p_table,r.row_data);
  scanned:=scanned+1;
  IF c.target_company IS NOT NULL THEN assigned:=assigned+1; END IF;
  counts:=jsonb_set(counts,ARRAY[c.reason],to_jsonb(COALESCE((counts->>c.reason)::integer,0)+1));
  IF NOT p_dry_run THEN
   EXECUTE format('UPDATE public.%I SET company_id=COALESCE($1,company_id),log_scope=CASE WHEN $1::uuid IS NULL THEN ''AMBIGUOUS'' ELSE ''TENANT'' END,scope_reason=$2 WHERE id=$3 AND scope_reason=''legacy_pending''',p_table) USING c.target_company,c.reason,r.id;
  END IF;
 END LOOP;
 RETURN jsonb_build_object('scanned',scanned,'tenant',assigned,'ambiguous',scanned-assigned,'dry_run',p_dry_run,'reasons',counts);
END $$;
REVOKE ALL ON FUNCTION public.backfill_log_scope(text,integer,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.backfill_log_scope(text,integer,boolean) TO service_role;
CREATE INDEX audit_log_pending_scope ON public.audit_log(id) WHERE scope_reason='legacy_pending';
CREATE INDEX audit_logs_pending_scope ON public.audit_logs(id) WHERE scope_reason='legacy_pending';
CREATE INDEX integration_logs_pending_scope ON public.integration_logs(id) WHERE scope_reason='legacy_pending';
-- Instala somente o mecanismo revisável. Nenhum histórico é reatribuído nesta migration.
NOTIFY pgrst,'reload schema';
COMMIT;

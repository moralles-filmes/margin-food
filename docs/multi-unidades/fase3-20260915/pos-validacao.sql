BEGIN TRANSACTION READ ONLY;
DO $$ DECLARE t text; f text; BEGIN
 FOREACH t IN ARRAY ARRAY['audit_log','audit_logs','integration_logs'] LOOP
  IF NOT (SELECT relrowsecurity AND relforcerowsecurity FROM pg_class WHERE oid=('public.'||t)::regclass)
  OR has_table_privilege('anon','public.'||t,'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR has_table_privilege('authenticated','public.'||t,'INSERT,UPDATE,DELETE,TRUNCATE,TRIGGER,REFERENCES,MAINTAIN')
  OR NOT has_table_privilege('authenticated','public.'||t,'SELECT')
  OR (SELECT count(*) FROM pg_policies WHERE schemaname='public' AND tablename=t AND permissive='RESTRICTIVE' AND policyname IN ('log_tenant_boundary','log_permission_boundary'))<>2
  THEN RAISE EXCEPTION 'PHASE3_POSTCHECK_TABLE_FAILED: %',t; END IF;
 END LOOP;
 FOREACH f IN ARRAY ARRAY['log_audit(text,text,text,uuid,text,jsonb,jsonb,jsonb)','log_audit(text,text,text,text,text,jsonb,jsonb,jsonb)','audit_log_write(text,text,text,text,jsonb,jsonb,jsonb,text)','log_integration_error(text,text,text,text,jsonb)'] LOOP
  IF has_function_privilege('anon','public.'||f,'EXECUTE') OR has_function_privilege('authenticated','public.'||f,'EXECUTE') OR has_function_privilege('service_role','public.'||f,'EXECUTE') THEN RAISE EXCEPTION 'PHASE3_POSTCHECK_WRITER_FAILED: %',f; END IF;
 END LOOP;
 IF has_function_privilege('authenticated','public.service_write_audit(uuid,uuid,text,text,text,uuid,jsonb,jsonb,jsonb)','EXECUTE') OR has_function_privilege('authenticated','public.backfill_log_scope(text,integer,boolean)','EXECUTE') THEN RAISE EXCEPTION 'PHASE3_POSTCHECK_SERVICE_FAILED'; END IF;
END $$;
SELECT 'audit_log' AS log_table,log_scope,scope_reason,count(*) records FROM public.audit_log GROUP BY log_scope,scope_reason
UNION ALL SELECT 'audit_logs',log_scope,scope_reason,count(*) FROM public.audit_logs GROUP BY log_scope,scope_reason
UNION ALL SELECT 'integration_logs',log_scope,scope_reason,count(*) FROM public.integration_logs GROUP BY log_scope,scope_reason
ORDER BY log_table,log_scope,scope_reason;
ROLLBACK;

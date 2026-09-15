-- Recuo de contenção: preserva dados, classificações, writers e manutenção da Fase 2.
-- Suspende readers de cliente e backfill; não restaura ACLs/policies vulneráveis.
BEGIN;
REVOKE SELECT ON public.audit_log,public.audit_logs,public.integration_logs FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.list_restricted_logs(text,text,integer,timestamptz,uuid,text,text,text),public._guarded_list_fin_audit_logs(text,text,text,integer,timestamptz,uuid,integer) FROM PUBLIC,anon,authenticated;
REVOKE EXECUTE ON FUNCTION public.backfill_log_scope(text,integer,boolean) FROM PUBLIC,anon,authenticated,service_role;
NOTIFY pgrst,'reload schema';
COMMIT;

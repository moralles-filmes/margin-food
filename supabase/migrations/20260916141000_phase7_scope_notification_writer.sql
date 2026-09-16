-- Marcar como lidas somente notificações próprias na unidade ativa.
BEGIN;
SET LOCAL lock_timeout='5s';
DO $$ BEGIN IF (select jsonb_agg(jsonb_build_array(p.oid::regprocedure::text,md5(pg_get_functiondef(p.oid)),p.proacl::text,pg_get_userbyid(p.proowner)) order by p.oid::regprocedure::text) from pg_proc p where pronamespace='public'::regnamespace and proname='mark_all_notifications_read') IS DISTINCT FROM $expected$[["mark_all_notifications_read()", "2593645c43be89341a97b3a047733216", "{postgres=X/postgres,=X/postgres,authenticated=X/postgres,service_role=X/postgres}", "postgres"]]$expected$::jsonb THEN RAISE EXCEPTION 'PHASE7_NOTIFICATION_DRIFT'; END IF; END $$;
CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_count INT;
  v_company uuid;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  v_company := public.assert_tenant();

  UPDATE public.notifications
  SET read_at = now()
  WHERE recipient_user_id = auth.uid()
    AND company_id = v_company
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;

  IF v_count > 0 THEN
    PERFORM log_audit(
      'rpc', 'notifications', 'notifications', NULL::uuid,
      'MARK_ALL_READ', NULL,
      jsonb_build_object('count', v_count, 'timestamp', now())
    );
  END IF;

  RETURN v_count;
END;
$function$;
NOTIFY pgrst, 'reload schema';
COMMIT;

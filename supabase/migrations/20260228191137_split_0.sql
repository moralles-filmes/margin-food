CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
  RETURNS integer
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  UPDATE notifications
  SET read_at = now()
  WHERE recipient_user_id = auth.uid()
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
$$;

-- 4) RPC upsert_supplier
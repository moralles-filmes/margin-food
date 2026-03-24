CREATE OR REPLACE FUNCTION public.mark_all_notifications_read()
  RETURNS INT
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path TO 'public'
AS $fn$
DECLARE
  v_count INT;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  UPDATE notifications
  SET read_at = now()
  WHERE recipient_user_id = auth.uid()::text
    AND read_at IS NULL;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$fn$;
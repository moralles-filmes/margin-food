CREATE OR REPLACE FUNCTION public.log_integration_error(
  p_module TEXT,
  p_action TEXT,
  p_reference_id TEXT,
  p_error_message TEXT,
  p_payload JSONB DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  INSERT INTO integration_logs (module, action, reference_id, status, error_message, payload)
  VALUES (p_module, p_action, p_reference_id, 'ERROR', p_error_message, p_payload);
END;
$fn$;
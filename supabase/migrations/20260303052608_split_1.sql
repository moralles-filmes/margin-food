CREATE OR REPLACE FUNCTION public._salmon_dashboard_guarded(p_start text, p_end text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'salmon:dashboard:view',
    'salmon:dashboard:read',
    'salmon:read',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão (salmon:dashboard:view/read)';
  END IF;

  RETURN public.get_salmon_dashboard_summary(p_start::date, p_end::date);
END;
$$;
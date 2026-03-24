CREATE OR REPLACE FUNCTION public._salmon_dashboard_guarded(p_start text, p_end text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('salmon:dashboard:view') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:dashboard:view)';
  END IF;
  RETURN public.get_salmon_dashboard_summary(p_start::date, p_end::date);
END;
$$;

-- Add permission guards to salmon atomic RPCs
-- create_salmon_entry_atomic
CREATE OR REPLACE FUNCTION public._salmon_dashboard_guarded(p_start text, p_end text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:dashboard:view') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:dashboard:view)';
  END IF;
  RETURN public.get_salmon_dashboard_summary(p_start::date, p_end::date);
END;
$$;

-- 6) _simulate_relatorios_guarded
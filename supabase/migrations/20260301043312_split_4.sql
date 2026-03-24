CREATE OR REPLACE FUNCTION public._simulate_relatorios_guarded(p_start text, p_end text, p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT has_permission('relatorios:score:simulate') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:score:simulate)';
  END IF;
  RETURN public.simulate_relatorios_score(p_start::date, p_end::date, p_params);
END;
$$;
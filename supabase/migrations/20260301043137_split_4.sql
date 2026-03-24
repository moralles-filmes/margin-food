CREATE OR REPLACE FUNCTION public.simulate_relatorios_score(p_start text, p_end text, p_params jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT has_permission('relatorios:score:simulate') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:score:simulate)';
  END IF;

  SELECT public._simulate_relatorios_score_impl(p_start, p_end, p_params) INTO result;
  RETURN result;
END;
$$;
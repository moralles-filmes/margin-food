CREATE OR REPLACE FUNCTION public.get_relatorios_score(p_start text, p_end text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT has_permission('relatorios:score:view') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:score:view)';
  END IF;

  SELECT public._get_relatorios_score_impl(p_start, p_end) INTO result;
  RETURN result;
END;
$$;

-- 5. simulate_relatorios_score
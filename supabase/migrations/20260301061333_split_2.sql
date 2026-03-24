CREATE OR REPLACE FUNCTION public._relatorios_score_guarded(p_start text, p_end text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'relatorios:score:view') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:score:view)';
  END IF;
  RETURN public.get_relatorios_score(p_start::date, p_end::date);
END;
$$;

-- 4) _relatorios_tendencia_guarded
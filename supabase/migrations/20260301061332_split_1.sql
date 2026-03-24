CREATE OR REPLACE FUNCTION public._relatorios_kpis_guarded(p_start text, p_end text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT (has_permission(auth.uid(), 'relatorios:cmv:view') OR has_permission(auth.uid(), 'relatorios:estoque:view')) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:cmv:view ou relatorios:estoque:view)';
  END IF;
  RETURN public.get_relatorios_kpis(p_start::date, p_end::date);
END;
$$;

-- 3) _relatorios_score_guarded
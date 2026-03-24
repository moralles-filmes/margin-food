CREATE OR REPLACE FUNCTION public._relatorios_tendencia_guarded(p_start text, p_end text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'relatorios:tendencia:view') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:tendencia:view)';
  END IF;
  RETURN public.get_relatorios_tendencia(p_start::date, p_end::date);
END;
$$;

-- 5) _salmon_dashboard_guarded
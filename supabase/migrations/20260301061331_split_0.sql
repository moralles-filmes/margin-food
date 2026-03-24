CREATE OR REPLACE FUNCTION public._relatorios_compras_guarded(p_start text, p_end text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = 'public' AS $$
BEGIN
  IF NOT has_permission(auth.uid(), 'relatorios:compras:view') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:compras:view)';
  END IF;
  RETURN public.get_relatorios_compras(p_start::date, p_end::date);
END;
$$;

-- 2) _relatorios_kpis_guarded
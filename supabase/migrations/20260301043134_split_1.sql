CREATE OR REPLACE FUNCTION public.get_relatorios_tendencia(p_start text, p_end text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT has_permission('relatorios:tendencia:view') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:tendencia:view)';
  END IF;

  SELECT public._get_relatorios_tendencia_impl(p_start, p_end) INTO result;
  RETURN result;
END;
$$;

-- 3. get_relatorios_compras
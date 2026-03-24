CREATE OR REPLACE FUNCTION public.get_relatorios_compras(p_start text, p_end text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  IF NOT has_permission('relatorios:compras:view') THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:compras:view)';
  END IF;

  SELECT public._get_relatorios_compras_impl(p_start, p_end) INTO result;
  RETURN result;
END;
$$;

-- 4. get_relatorios_score
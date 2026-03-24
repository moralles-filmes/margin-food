CREATE OR REPLACE FUNCTION public.get_relatorios_kpis(p_start text, p_end text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  -- Require at least one relatorios view permission
  IF NOT (
    has_permission('relatorios:cmv:view') OR
    has_permission('relatorios:estoque:view')
  ) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:cmv:view ou relatorios:estoque:view)';
  END IF;

  -- Delegate to existing implementation
  SELECT public._get_relatorios_kpis_impl(p_start, p_end) INTO result;
  RETURN result;
END;
$$;

-- 2. get_relatorios_tendencia
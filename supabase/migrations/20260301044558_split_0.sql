CREATE OR REPLACE FUNCTION public._planning_spend_summary_guarded(
  p_year int,
  p_month int,
  p_source text DEFAULT NULL,
  p_categoria text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  IF NOT has_permission(v_uid, 'planning:meta-compras:view')
     AND NOT has_permission(v_uid, 'planning:projecao:view')
     AND NOT has_permission(v_uid, 'planning:ritmo:view')
     AND NOT has_permission(v_uid, 'planning:pressao:view')
     AND NOT has_permission(v_uid, 'planning:radar:view')
  THEN
    RAISE EXCEPTION 'Sem permissão para acessar resumo de planejamento';
  END IF;

  SELECT get_planning_spend_summary(p_year, p_month, p_source, p_categoria) INTO v_result;
  RETURN v_result;
END;
$$;

-- 2. Guarded upsert meta
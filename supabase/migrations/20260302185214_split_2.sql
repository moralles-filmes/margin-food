CREATE OR REPLACE FUNCTION public._planning_spend_summary_guarded(
  p_year integer,
  p_month integer,
  p_source text DEFAULT NULL::text,
  p_categoria text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid;
  v_result jsonb;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Resolve tenant
  SELECT company_id INTO v_cid FROM profiles WHERE id = v_uid;
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  IF NOT has_permission(v_uid, 'planning:meta-compras:view')
     AND NOT has_permission(v_uid, 'planning:projecao:view')
     AND NOT has_permission(v_uid, 'planning:ritmo:view')
     AND NOT has_permission(v_uid, 'planning:pressao:view')
     AND NOT has_permission(v_uid, 'planning:radar:view')
  THEN
    RAISE EXCEPTION 'Sem permissão para acessar resumo de planejamento';
  END IF;

  -- Pass company_id to the inner function
  SELECT _planning_spend_summary_inner(v_cid, p_year, p_month, p_source, p_categoria) INTO v_result;
  RETURN v_result;
END;
$function$;

-- 8) Create new tenant-scoped inner function (replaces get_planning_spend_summary)
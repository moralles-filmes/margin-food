CREATE OR REPLACE FUNCTION public._planning_delete_meta_guarded(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid;
  v_before jsonb;
  v_found boolean;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Não autenticado';
  END IF;

  -- Resolve tenant
  SELECT company_id INTO v_cid FROM profiles WHERE id = v_uid;
  IF v_cid IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  IF NOT has_permission(v_uid, 'planning:meta-compras:edit') THEN
    RAISE EXCEPTION 'Sem permissão para remover metas de compras';
  END IF;

  -- Capture before state and verify tenant ownership
  SELECT jsonb_build_object(
    'id', id, 'year', year, 'month', month, 'categoria', categoria,
    'target_value', target_value, 'ativo', ativo
  ), true
  INTO v_before, v_found
  FROM planning_metas_compra
  WHERE id = p_id AND company_id = v_cid;

  IF NOT COALESCE(v_found, false) THEN
    RAISE EXCEPTION 'Meta não encontrada ou não pertence ao tenant';
  END IF;

  -- Soft delete with tracking
  UPDATE planning_metas_compra
  SET ativo = false, updated_at = now(), deleted_at = now(), deleted_by = v_uid
  WHERE id = p_id AND company_id = v_cid;

  -- Audit trail
  PERFORM audit_log_write(
    'planning',
    'delete_meta',
    'planning_metas_compra',
    p_id::text,
    v_before,
    jsonb_build_object('ativo', false, 'deleted_at', now(), 'deleted_by', v_uid),
    NULL
  );

  RETURN jsonb_build_object('success', true);
END;
$function$;

-- 7) Fix RPC: _planning_spend_summary_guarded — add tenant resolution
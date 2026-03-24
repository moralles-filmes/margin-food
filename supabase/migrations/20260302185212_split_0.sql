CREATE OR REPLACE FUNCTION public._planning_upsert_meta_guarded(
  p_year integer,
  p_month integer,
  p_categoria text,
  p_target_value numeric,
  p_alerta_amarelo numeric DEFAULT 80,
  p_alerta_vermelho numeric DEFAULT 100
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid;
  v_before jsonb;
  v_after jsonb;
  v_result_id uuid;
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
    RAISE EXCEPTION 'Sem permissão para editar metas de compras';
  END IF;

  -- Capture before state (for audit)
  SELECT jsonb_build_object(
    'id', id, 'target_value', target_value,
    'alerta_amarelo_percent', alerta_amarelo_percent,
    'alerta_vermelho_percent', alerta_vermelho_percent,
    'ativo', ativo
  ) INTO v_before
  FROM planning_metas_compra
  WHERE company_id = v_cid AND year = p_year AND month = p_month AND categoria = p_categoria;

  -- Upsert with explicit company_id
  INSERT INTO planning_metas_compra (company_id, year, month, categoria, target_value, alerta_amarelo_percent, alerta_vermelho_percent, ativo, created_by)
  VALUES (v_cid, p_year, p_month, p_categoria, p_target_value, p_alerta_amarelo, p_alerta_vermelho, true, v_uid)
  ON CONFLICT (company_id, year, month, categoria) DO UPDATE SET
    target_value = EXCLUDED.target_value,
    alerta_amarelo_percent = EXCLUDED.alerta_amarelo_percent,
    alerta_vermelho_percent = EXCLUDED.alerta_vermelho_percent,
    ativo = true,
    updated_at = now()
  RETURNING id INTO v_result_id;

  -- Capture after state
  SELECT jsonb_build_object(
    'id', id, 'target_value', target_value,
    'alerta_amarelo_percent', alerta_amarelo_percent,
    'alerta_vermelho_percent', alerta_vermelho_percent,
    'ativo', ativo
  ) INTO v_after
  FROM planning_metas_compra
  WHERE id = v_result_id;

  -- Audit trail
  PERFORM audit_log_write(
    'planning', 
    CASE WHEN v_before IS NULL THEN 'create_meta' ELSE 'update_meta' END,
    'planning_metas_compra',
    v_result_id::text,
    v_before,
    v_after,
    jsonb_build_object('year', p_year, 'month', p_month, 'categoria', p_categoria)
  );

  RETURN jsonb_build_object('success', true, 'id', v_result_id);
END;
$function$;

-- 6) Fix RPC: _planning_delete_meta_guarded — add tenant guard + audit
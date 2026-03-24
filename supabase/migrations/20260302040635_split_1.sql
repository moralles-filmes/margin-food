CREATE OR REPLACE FUNCTION public.soft_delete_inventory(p_id uuid, p_justificativa text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv record;
  v_before jsonb;
  v_deleted_moves int := 0;
  v_deleted_items int;
BEGIN
  v_tenant := assert_tenant();
  v_user_id := auth.uid();

  -- Permission: granular OR system admin
  IF NOT has_any_permission(v_user_id, ARRAY['inventario:lista:delete', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Forbidden: inventario:lista:delete required';
  END IF;

  SELECT * INTO v_inv
    FROM inventarios
   WHERE id = p_id AND company_id = v_tenant AND deleted_at IS NULL
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Inventário não encontrado';
  END IF;

  v_before := jsonb_build_object('status', v_inv.status, 'finalizado_em', v_inv.finalizado_em);

  IF v_inv.status = 'FINALIZADO' THEN
    DELETE FROM movimentacoes_estoque
     WHERE reference_type = 'INVENTARIO_AJUSTE' AND reference_id = p_id AND company_id = v_tenant;
    GET DIAGNOSTICS v_deleted_moves = ROW_COUNT;
  END IF;

  UPDATE inventarios SET deleted_at = now(), deleted_by = v_user_id, updated_at = now()
   WHERE id = p_id AND company_id = v_tenant;

  UPDATE inventario_itens SET deleted_at = now(), deleted_by = v_user_id
   WHERE inventario_id = p_id AND deleted_at IS NULL;
  GET DIAGNOSTICS v_deleted_items = ROW_COUNT;

  INSERT INTO audit_inventario_log (inventario_id, user_id, user_role, acao, antes, depois, ip_address)
  VALUES (p_id, v_user_id, COALESCE((SELECT role FROM profiles WHERE id = v_user_id), 'unknown'), 'DELETE_SOFT', v_before,
    jsonb_build_object('justificativa', p_justificativa, 'movimentacoes_revertidas', v_deleted_moves, 'itens_deletados', v_deleted_items), '');

  RETURN jsonb_build_object('success', true, 'movimentacoes_revertidas', v_deleted_moves, 'itens_deletados', v_deleted_items);
END;
$$;
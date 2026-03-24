CREATE OR REPLACE FUNCTION public.reopen_inventory(p_id uuid, p_justificativa text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant uuid; v_user_id uuid; v_inv record; v_before jsonb; v_after jsonb; v_deleted_moves int;
BEGIN
  v_tenant := assert_tenant(); v_user_id := auth.uid();
  IF NOT has_any_permission(v_user_id, ARRAY['inventario:auditoria:edit', 'system:global:manage']) THEN RAISE EXCEPTION 'Forbidden: inventario:auditoria:edit required'; END IF;
  SELECT * INTO v_inv FROM inventarios WHERE id = p_id AND company_id = v_tenant AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Inventário não encontrado'; END IF;
  IF v_inv.status NOT IN ('FINALIZADO', 'SOB_ANALISE') THEN RAISE EXCEPTION 'Só é possível reabrir inventários FINALIZADO ou SOB_ANALISE (atual: %)', v_inv.status; END IF;
  v_before := jsonb_build_object('status', v_inv.status, 'finalizado_em', v_inv.finalizado_em, 'finalizado_por', v_inv.finalizado_por);
  
  -- Revert ALL inventory-related movements (both standard and quick inventory)
  DELETE FROM movimentacoes_estoque 
  WHERE reference_id = p_id::text 
    AND reference_type IN ('INVENTARIO_AJUSTE', 'QUICK_INVENTORY')
    AND company_id = v_tenant;
  GET DIAGNOSTICS v_deleted_moves = ROW_COUNT;
  
  UPDATE inventarios SET status = 'EM_REVISAO', finalizado_em = NULL, finalizado_por = NULL, aprovado_por = NULL, aprovacao_admin_em = NULL, updated_at = now() WHERE id = p_id AND company_id = v_tenant;
  v_after := jsonb_build_object('status', 'EM_REVISAO', 'movimentacoes_revertidas', v_deleted_moves);
  INSERT INTO audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, antes, depois, ip_address)
  VALUES (v_tenant, p_id, v_user_id, COALESCE((SELECT string_agg(role::text, ',') FROM user_roles WHERE user_id = v_user_id), 'unknown'), 'REOPEN', v_before, v_after || jsonb_build_object('justificativa', p_justificativa), '');
  RETURN jsonb_build_object('success', true, 'movimentacoes_revertidas', v_deleted_moves);
END;
$function$;

-- FIX 3: Update soft_delete_inventory to also revert QUICK_INVENTORY movements
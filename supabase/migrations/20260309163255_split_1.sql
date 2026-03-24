CREATE OR REPLACE FUNCTION cancel_salmon_entry_atomic(p_entry_id uuid, p_reason text DEFAULT '')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_entry RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
  v_produto_id uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT has_permission(v_caller, 'salmon:edit') AND NOT has_permission(v_caller, 'salmon:delete') THEN
    RAISE EXCEPTION 'Sem permissão para cancelar entrada de salmão.';
  END IF;

  SELECT * INTO v_entry FROM salmon_entries WHERE id = p_entry_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada: %', p_entry_id; END IF;
  IF v_entry.status = 'CANCELLED' THEN RAISE EXCEPTION 'Entrada já cancelada.'; END IF;

  IF EXISTS (SELECT 1 FROM salmon_manipulations WHERE entry_id = p_entry_id AND status = 'ACTIVE') THEN
    RAISE EXCEPTION 'Existem manipulações ativas vinculadas. Cancele-as primeiro.';
  END IF;

  UPDATE salmon_entries SET status = 'CANCELLED', updated_at = now() WHERE id = p_entry_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = p_entry_id::text AND status = 'ATIVO'
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    v_produto_id := v_mov.produto_id;

    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id;

    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'ENTRADA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_ENTRY', v_mov.reference_id || '_ESTORNO', false, 'salmon', v_mov.salmon_lot_id
    ) RETURNING id INTO v_estorno_id;

    PERFORM recalc_product_costs(v_produto_id);
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', p_entry_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_kg', v_entry.gross_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'entry_id', p_entry_id, 'estorno_id', v_estorno_id);
END;
$$;

-- 3. Update storno_purchase_order_stock
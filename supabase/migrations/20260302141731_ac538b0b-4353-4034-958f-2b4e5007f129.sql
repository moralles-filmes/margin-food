
-- 1) Drop the dangerous single-arg overload that skips ledger reversal
DROP FUNCTION IF EXISTS public._salmon_cancel_manipulation_guarded(uuid);

-- 2) Fix permission check in cancel_salmon_manipulation_atomic to use registry keys
CREATE OR REPLACE FUNCTION public.cancel_salmon_manipulation_atomic(
  p_manip_id uuid,
  p_reason text DEFAULT 'Cancelamento de manipulação'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  v_manip RECORD;
  v_mov RECORD;
  v_estorno_id uuid;
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;

  -- Use correct registry permission key
  IF NOT has_permission(v_caller, 'salmon:manipulacao:delete')
     AND NOT has_permission(v_caller, 'system:global:manage') THEN
    RAISE EXCEPTION 'Sem permissão para cancelar manipulação.';
  END IF;

  SELECT * INTO v_manip FROM salmon_manipulations WHERE id = p_manip_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Manipulação não encontrada.'; END IF;
  IF v_manip.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('already_cancelled', true, 'manipulation_id', p_manip_id);
  END IF;

  UPDATE salmon_manipulations SET status = 'CANCELLED', updated_at = now() WHERE id = p_manip_id;

  SELECT * INTO v_mov FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = p_manip_id::text AND status = 'ATIVO'
    FOR UPDATE;

  IF v_mov.id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_caller,
      justificativa_cancelamento = p_reason
    WHERE id = v_mov.id;

    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status, estorno_de_id,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor
    ) VALUES (
      v_mov.produto_id, CURRENT_DATE, 'SAIDA_ESTORNO', v_mov.quantidade,
      v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO',
      'Estorno — ' || p_reason, v_caller, 'ATIVO', v_mov.id,
      'SALMON_MANIPULATION', v_mov.reference_id || '_ESTORNO', true, 'salmon', v_mov.salmon_lot_id, v_mov.setor
    ) RETURNING id INTO v_estorno_id;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', p_manip_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'gross_out_kg', v_manip.gross_out_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'manipulation_id', p_manip_id, 'estorno_id', v_estorno_id);
END;
$$;

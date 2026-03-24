CREATE OR REPLACE FUNCTION public.cancel_salmon_mirror(p_action text, p_reference_id text, p_cancelled_by text DEFAULT NULL, p_justificativa text DEFAULT 'Cancelamento no Controle de Salmão')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reference_type TEXT;
  v_mov RECORD;
  v_estorno_tipo TEXT;
  v_canceller UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'salmon:entries:create') AND NOT public.has_permission(auth.uid(), 'stock:edit') THEN
    RAISE EXCEPTION 'Sem permissão para cancelar espelhamento de salmão.';
  END IF;

  BEGIN v_canceller := p_cancelled_by::uuid; EXCEPTION WHEN OTHERS THEN v_canceller := NULL; END;

  IF p_action = 'entry' THEN v_reference_type := 'SALMON_ENTRY';
  ELSIF p_action = 'manipulation' THEN v_reference_type := 'SALMON_MANIPULATION';
  ELSE RAISE EXCEPTION 'Invalid action: %', p_action; END IF;

  SELECT * INTO v_mov FROM movimentacoes_estoque WHERE reference_type = v_reference_type AND reference_id = p_reference_id AND status = 'ATIVO' LIMIT 1;
  IF v_mov IS NULL THEN RETURN; END IF;

  UPDATE movimentacoes_estoque SET status = 'CANCELADO', cancelado_em = now(), cancelado_por = v_canceller, justificativa_cancelamento = p_justificativa WHERE id = v_mov.id;

  IF v_mov.tipo LIKE 'ENTRADA%' THEN v_estorno_tipo := 'ENTRADA_ESTORNO'; ELSE v_estorno_tipo := 'SAIDA_ESTORNO'; END IF;

  INSERT INTO movimentacoes_estoque (produto_id, data, tipo, quantidade, custo_unitario, custo_total, origem, observacao, created_by, status, estorno_de_id, reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor)
  VALUES (v_mov.produto_id, CURRENT_DATE, v_estorno_tipo, v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total, 'ESTORNO', 'Estorno automático — ' || p_justificativa, v_canceller, 'ATIVO', v_mov.id, v_mov.reference_type, v_mov.reference_id || '_ESTORNO', v_mov.internal_transfer, 'salmon', v_mov.salmon_lot_id, v_mov.setor);

  PERFORM public.log_audit('rpc', 'salmon', 'movimentacoes_estoque', v_mov.id, 'CANCEL_MIRROR',
    jsonb_build_object('action', p_action, 'reference_id', p_reference_id, 'quantidade', v_mov.quantidade),
    jsonb_build_object('justificativa', p_justificativa));
END;
$$;

-- Update storno_purchase_order_stock to log
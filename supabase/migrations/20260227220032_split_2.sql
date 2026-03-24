CREATE OR REPLACE FUNCTION public.cancel_salmon_mirror(
  p_action TEXT,        -- 'entry' or 'manipulation'
  p_reference_id TEXT,
  p_cancelled_by TEXT DEFAULT NULL,
  p_justificativa TEXT DEFAULT 'Cancelamento no Controle de Salmão'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_reference_type TEXT;
  v_mov RECORD;
  v_estorno_tipo TEXT;
BEGIN
  IF p_action = 'entry' THEN
    v_reference_type := 'SALMON_ENTRY';
  ELSIF p_action = 'manipulation' THEN
    v_reference_type := 'SALMON_MANIPULATION';
  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Find the active mirror movement
  SELECT * INTO v_mov
  FROM movimentacoes_estoque
  WHERE reference_type = v_reference_type
    AND reference_id = p_reference_id
    AND status = 'ATIVO'
  LIMIT 1;

  IF v_mov IS NULL THEN
    RETURN; -- No mirror to cancel
  END IF;

  -- Mark original as CANCELADO
  UPDATE movimentacoes_estoque
  SET status = 'CANCELADO',
      cancelado_em = now(),
      cancelado_por = p_cancelled_by,
      justificativa_cancelamento = p_justificativa
  WHERE id = v_mov.id;

  -- Create estorno (reversal) movement
  IF v_mov.tipo LIKE 'ENTRADA%' THEN
    v_estorno_tipo := 'ENTRADA_ESTORNO';
  ELSE
    v_estorno_tipo := 'SAIDA_ESTORNO';
  END IF;

  INSERT INTO movimentacoes_estoque (
    produto_id, data, tipo, quantidade, custo_unitario, custo_total,
    origem, observacao, created_by, status, estorno_de_id,
    reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor
  ) VALUES (
    v_mov.produto_id, to_char(now(), 'YYYY-MM-DD'), v_estorno_tipo,
    v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total,
    'ESTORNO', 'Estorno automático — ' || p_justificativa,
    p_cancelled_by, 'ATIVO', v_mov.id,
    v_mov.reference_type, v_mov.reference_id || '_ESTORNO',
    v_mov.internal_transfer, 'salmon', v_mov.salmon_lot_id, v_mov.setor
  );
END;
$$;
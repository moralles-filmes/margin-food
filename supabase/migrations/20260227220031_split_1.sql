CREATE OR REPLACE FUNCTION public.mirror_salmon_to_stock(
  p_action TEXT,           -- 'entry' or 'manipulation'
  p_reference_id TEXT,     -- salmon entry or manipulation ID
  p_qty_kg NUMERIC,        -- kg bruto
  p_cost_per_kg NUMERIC,   -- custo/kg do lote
  p_lot_id TEXT DEFAULT NULL,
  p_supplier TEXT DEFAULT NULL,
  p_date TEXT DEFAULT NULL,
  p_created_by TEXT DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_produto_id uuid;
  v_reference_type TEXT;
  v_tipo TEXT;
  v_internal BOOLEAN;
  v_observacao TEXT;
  v_mov_id uuid;
  v_existing uuid;
  v_use_date TEXT;
BEGIN
  -- Get or create the salmon raw product
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  -- Determine movement type
  IF p_action = 'entry' THEN
    v_reference_type := 'SALMON_ENTRY';
    v_tipo := 'ENTRADA';
    v_internal := false;
    v_observacao := 'Entrada Salmão Bruto (Controle de Salmão)';
    IF p_supplier IS NOT NULL THEN
      v_observacao := v_observacao || ' — Forn: ' || p_supplier;
    END IF;
    IF p_lot_id IS NOT NULL THEN
      v_observacao := v_observacao || ' — Lote: ' || p_lot_id;
    END IF;
  ELSIF p_action = 'manipulation' THEN
    v_reference_type := 'SALMON_MANIPULATION';
    v_tipo := 'SAIDA';
    v_internal := true;
    v_observacao := 'Saída para Manipulação (Salmão Bruto)';
    IF p_lot_id IS NOT NULL THEN
      v_observacao := v_observacao || ' — Lote: ' || p_lot_id;
    END IF;
  ELSE
    RAISE EXCEPTION 'Invalid action: %', p_action;
  END IF;

  -- Check for duplicate (non-duplication rule)
  SELECT id INTO v_existing
  FROM movimentacoes_estoque
  WHERE reference_type = v_reference_type
    AND reference_id = p_reference_id
    AND status = 'ATIVO';
  IF v_existing IS NOT NULL THEN
    RETURN v_existing; -- Already mirrored, skip
  END IF;

  v_use_date := COALESCE(p_date, to_char(now(), 'YYYY-MM-DD'));

  INSERT INTO movimentacoes_estoque (
    produto_id, data, tipo, quantidade, custo_unitario, custo_total,
    origem, observacao, created_by, status,
    reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor
  ) VALUES (
    v_produto_id, v_use_date, v_tipo, p_qty_kg,
    ROUND(p_cost_per_kg::numeric, 4),
    ROUND((p_qty_kg * p_cost_per_kg)::numeric, 2),
    'Controle de Salmão', v_observacao, p_created_by, 'ATIVO',
    v_reference_type, p_reference_id, v_internal, 'salmon', p_lot_id,
    CASE WHEN p_action = 'manipulation' THEN 'Sushi' ELSE NULL END
  )
  RETURNING id INTO v_mov_id;

  -- Update product last_cost if entry
  IF p_action = 'entry' AND p_cost_per_kg > 0 THEN
    UPDATE produtos SET
      last_cost_purchase_unit = p_cost_per_kg,
      last_cost_base_unit = p_cost_per_kg,
      last_purchase_date = v_use_date,
      last_supplier = p_supplier,
      custo_padrao = CASE WHEN custo_padrao = 0 THEN p_cost_per_kg ELSE custo_padrao END,
      default_cost_purchase_unit = CASE WHEN default_cost_purchase_unit = 0 THEN p_cost_per_kg ELSE default_cost_purchase_unit END,
      default_cost_base_unit = CASE WHEN default_cost_base_unit = 0 THEN p_cost_per_kg ELSE default_cost_base_unit END
    WHERE id = v_produto_id;
  END IF;

  RETURN v_mov_id;
END;
$$;

-- 6) Function: cancel salmon mirror when entry/manipulation is deleted
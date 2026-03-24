CREATE OR REPLACE FUNCTION public.mirror_salmon_to_stock(p_action text, p_reference_id text, p_qty_kg numeric, p_cost_per_kg numeric, p_lot_id text DEFAULT NULL, p_supplier text DEFAULT NULL, p_date text DEFAULT NULL, p_created_by text DEFAULT NULL)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_produto_id UUID;
  v_reference_type TEXT;
  v_tipo TEXT;
  v_internal BOOLEAN;
  v_observacao TEXT;
  v_mov_id UUID;
  v_existing UUID;
  v_use_date DATE;
  v_creator UUID;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'salmon:entries:create') AND NOT public.has_permission(auth.uid(), 'stock:edit') THEN
    RAISE EXCEPTION 'Sem permissão para espelhar salmão no estoque.';
  END IF;

  SELECT ensure_salmon_raw_product() INTO v_produto_id;
  BEGIN v_creator := p_created_by::uuid; EXCEPTION WHEN OTHERS THEN v_creator := NULL; END;

  PERFORM 1 FROM produtos WHERE id = v_produto_id AND ativo = true AND unidade_medida = 'KG' AND COALESCE(fator_conversao_padrao, 1) = 1;
  IF NOT FOUND THEN
    UPDATE produtos SET ativo = true, unidade_medida = 'KG', unidade_compra = 'KG', fator_conversao_padrao = 1 WHERE id = v_produto_id;
  END IF;

  IF p_action = 'entry' THEN
    v_reference_type := 'SALMON_ENTRY'; v_tipo := 'ENTRADA'; v_internal := false;
    v_observacao := 'Entrada Salmão Bruto (Controle de Salmão)';
    IF p_supplier IS NOT NULL THEN v_observacao := v_observacao || ' — Forn: ' || p_supplier; END IF;
    IF p_lot_id IS NOT NULL THEN v_observacao := v_observacao || ' — Lote: ' || p_lot_id; END IF;
  ELSIF p_action = 'manipulation' THEN
    v_reference_type := 'SALMON_MANIPULATION'; v_tipo := 'SAIDA'; v_internal := true;
    v_observacao := 'Saída para Manipulação (Salmão Bruto)';
    IF p_lot_id IS NOT NULL THEN v_observacao := v_observacao || ' — Lote: ' || p_lot_id; END IF;
  ELSE RAISE EXCEPTION 'Invalid action: %', p_action; END IF;

  v_use_date := COALESCE(p_date::date, CURRENT_DATE);

  SELECT id INTO v_existing FROM movimentacoes_estoque WHERE reference_type = v_reference_type AND reference_id = p_reference_id AND status = 'ATIVO';
  IF v_existing IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET quantidade = p_qty_kg, custo_unitario = ROUND(p_cost_per_kg::numeric, 4), custo_total = ROUND((p_qty_kg * p_cost_per_kg)::numeric, 2), data = v_use_date, observacao = v_observacao, editado_em = now(), editado_por = v_creator, justificativa_edicao = 'Atualização automática via Controle de Salmão', salmon_lot_id = p_lot_id WHERE id = v_existing;
    RETURN v_existing;
  END IF;

  INSERT INTO movimentacoes_estoque (produto_id, data, tipo, quantidade, custo_unitario, custo_total, origem, observacao, created_by, status, reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor)
  VALUES (v_produto_id, v_use_date, v_tipo, p_qty_kg, ROUND(p_cost_per_kg::numeric, 4), ROUND((p_qty_kg * p_cost_per_kg)::numeric, 2), 'Controle de Salmão', v_observacao, v_creator, 'ATIVO', v_reference_type, p_reference_id, v_internal, 'salmon', p_lot_id, CASE WHEN p_action = 'manipulation' THEN 'Sushi' ELSE NULL END)
  RETURNING id INTO v_mov_id;

  IF p_action = 'entry' AND p_cost_per_kg > 0 THEN
    UPDATE produtos SET last_cost_purchase_unit = p_cost_per_kg, last_cost_base_unit = p_cost_per_kg, last_purchase_date = v_use_date::text, last_supplier = p_supplier, custo_padrao = CASE WHEN custo_padrao = 0 THEN p_cost_per_kg ELSE custo_padrao END, default_cost_purchase_unit = CASE WHEN default_cost_purchase_unit = 0 THEN p_cost_per_kg ELSE default_cost_purchase_unit END, default_cost_base_unit = CASE WHEN default_cost_base_unit = 0 THEN p_cost_per_kg ELSE default_cost_base_unit END WHERE id = v_produto_id;
  END IF;

  PERFORM public.log_audit('rpc', 'salmon', 'movimentacoes_estoque', v_mov_id, 'MIRROR', NULL,
    jsonb_build_object('action', p_action, 'qty_kg', p_qty_kg, 'cost_per_kg', p_cost_per_kg, 'lot_id', p_lot_id, 'supplier', p_supplier));

  RETURN v_mov_id;
END;
$$;

-- Update cancel_salmon_mirror to log
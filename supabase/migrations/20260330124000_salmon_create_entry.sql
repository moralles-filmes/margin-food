CREATE OR REPLACE FUNCTION public.create_salmon_entry_atomic(
  p_entry_date date,
  p_lot text,
  p_sif text,
  p_supplier_name text,
  p_boxes int,
  p_units int,
  p_gross_kg numeric,
  p_total_value numeric,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_supplier_uuid uuid;
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_kg <= 0 THEN RAISE EXCEPTION 'gross_kg deve ser > 0'; END IF;
  IF p_total_value < 0 THEN RAISE EXCEPTION 'total_value não pode ser negativo'; END IF;

  v_cost_per_kg := CASE WHEN p_gross_kg > 0 THEN ROUND(p_total_value / p_gross_kg, 4) ELSE 0 END;

  INSERT INTO salmon_entries (entry_date, lot, sif, supplier_name, boxes, units, gross_kg, total_value, notes, created_by)
  VALUES (p_entry_date, COALESCE(p_lot,''), COALESCE(p_sif,''), COALESCE(p_supplier_name,''), COALESCE(p_boxes,0), COALESCE(p_units,0), p_gross_kg, p_total_value, COALESCE(p_notes,''), v_caller)
  RETURNING id INTO v_entry_id;

  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_ENTRY' AND reference_id = v_entry_id::text AND status = 'ATIVO'
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      data = p_entry_date,
      observacao = 'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,''),
      editado_em = now(), editado_por = v_caller,
      salmon_lot_id = p_lot
    WHERE id = v_mov_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id
    ) VALUES (
      v_produto_id, p_entry_date, 'ENTRADA', p_gross_kg, v_cost_per_kg,
      ROUND((p_gross_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão',
      'Entrada Salmão Bruto — Lote: ' || COALESCE(p_lot,'') || ' — Forn: ' || COALESCE(p_supplier_name,''),
      v_caller, 'ATIVO', 'SALMON_ENTRY', v_entry_id::text, false, 'salmon', p_lot
    ) RETURNING id INTO v_mov_id;
  END IF;

  IF v_cost_per_kg > 0 THEN
    UPDATE produtos SET
      last_cost_purchase_unit = v_cost_per_kg, last_cost_base_unit = v_cost_per_kg,
      last_purchase_date = p_entry_date::text, last_supplier = p_supplier_name,
      custo_padrao = CASE WHEN custo_padrao = 0 THEN v_cost_per_kg ELSE custo_padrao END,
      default_cost_purchase_unit = CASE WHEN default_cost_purchase_unit = 0 THEN v_cost_per_kg ELSE default_cost_purchase_unit END,
      default_cost_base_unit = CASE WHEN default_cost_base_unit = 0 THEN v_cost_per_kg ELSE default_cost_base_unit END
    WHERE id = v_produto_id;
  END IF;

  IF p_supplier_name IS NOT NULL AND p_supplier_name != '' THEN
    INSERT INTO suppliers (name) VALUES (p_supplier_name)
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;

    IF v_supplier_uuid IS NOT NULL THEN
      INSERT INTO supplier_item_prices (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, last_updated_at, source)
      VALUES (p_supplier_name, v_supplier_uuid, v_produto_id, v_cost_per_kg, 'KG', now(), 'salmon')
      ON CONFLICT (supplier_id, stock_item_id) DO UPDATE SET
        unit_cost = EXCLUDED.unit_cost, supplier_uuid = EXCLUDED.supplier_uuid,
        last_updated_at = EXCLUDED.last_updated_at, source = 'salmon';
    END IF;
  END IF;

  PERFORM log_audit('rpc', 'salmon', 'salmon_entries', v_entry_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object('gross_kg', p_gross_kg, 'total_value', p_total_value, 'lot', p_lot, 'supplier', p_supplier_name, 'mov_id', v_mov_id));

  RETURN jsonb_build_object('entry_id', v_entry_id, 'movement_id', v_mov_id, 'unit_cost', v_cost_per_kg);
END;
$function$;

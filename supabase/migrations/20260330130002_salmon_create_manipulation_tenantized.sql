-- 3) create_salmon_manipulation_atomic
CREATE OR REPLACE FUNCTION public.create_salmon_manipulation_atomic(
  p_entry_id uuid,
  p_manipulation_date date,
  p_fish_count int,
  p_gross_out_kg numeric,
  p_clean_in_kg numeric,
  p_leftover_kg numeric DEFAULT 0,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_entry RECORD;
  v_manip_id uuid;
  v_mov_id uuid;
  v_produto_id uuid;
  v_cost_per_kg numeric;
  v_caller uuid;
  v_company_id uuid;
BEGIN
  v_company_id := assert_tenant();
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF p_gross_out_kg <= 0 THEN RAISE EXCEPTION 'gross_out_kg deve ser > 0'; END IF;
  IF p_clean_in_kg < 0 THEN RAISE EXCEPTION 'clean_in_kg não pode ser negativo'; END IF;

  -- Lock parent entry by company_id
  SELECT * INTO v_entry FROM salmon_entries 
  WHERE id = p_entry_id AND company_id = v_company_id 
  FOR UPDATE;
  
  IF NOT FOUND THEN RAISE EXCEPTION 'Entrada não encontrada ou sem permissão.'; END IF;
  IF v_entry.status != 'ACTIVE' THEN RAISE EXCEPTION 'Entrada não está ativa (status: %)', v_entry.status; END IF;

  v_cost_per_kg := CASE WHEN v_entry.gross_kg > 0 THEN ROUND(v_entry.total_value / v_entry.gross_kg, 4) ELSE 0 END;

  -- 1. Insert manipulation
  INSERT INTO salmon_manipulations (
    entry_id, manipulation_date, lot, sif, supplier_name, fish_count,
    gross_out_kg, clean_in_kg, leftover_kg, cost_per_kg_gross, notes, created_by, company_id
  ) VALUES (
    p_entry_id, p_manipulation_date, v_entry.lot, v_entry.sif, v_entry.supplier_name,
    COALESCE(p_fish_count, 0), p_gross_out_kg, p_clean_in_kg,
    COALESCE(p_leftover_kg, 0), v_cost_per_kg, COALESCE(p_notes,''), v_caller, v_company_id
  ) RETURNING id INTO v_manip_id;

  -- 2. Mirror to stock (SAIDA for gross)
  SELECT ensure_salmon_raw_product() INTO v_produto_id;

  SELECT id INTO v_mov_id FROM movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' AND reference_id = v_manip_id::text 
      AND status = 'ATIVO' AND company_id = v_company_id
    FOR UPDATE;

  IF v_mov_id IS NOT NULL THEN
    UPDATE movimentacoes_estoque SET
      quantidade = p_gross_out_kg, custo_unitario = v_cost_per_kg,
      custo_total = ROUND((p_gross_out_kg * v_cost_per_kg)::numeric, 2),
      data = p_manipulation_date,
      observacao = 'Saída Manipulação — Lote: ' || v_entry.lot,
      editado_em = now(), editado_por = v_caller, salmon_lot_id = v_entry.lot
    WHERE id = v_mov_id AND company_id = v_company_id;
  ELSE
    INSERT INTO movimentacoes_estoque (
      produto_id, data, tipo, quantidade, custo_unitario, custo_total,
      origem, observacao, created_by, status,
      reference_type, reference_id, internal_transfer, source_module, salmon_lot_id, setor, company_id
    ) VALUES (
      v_produto_id, p_manipulation_date, 'SAIDA', p_gross_out_kg, v_cost_per_kg,
      ROUND((p_gross_out_kg * v_cost_per_kg)::numeric, 2),
      'Controle de Salmão', 'Saída Manipulação — Lote: ' || v_entry.lot,
      v_caller, 'ATIVO', 'SALMON_MANIPULATION', v_manip_id::text, true, 'salmon', v_entry.lot, 'Sushi', v_company_id
    ) RETURNING id INTO v_mov_id;
  END IF;

  -- 3. Audit
  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', v_manip_id, 'CREATE_ATOMIC', NULL,
    jsonb_build_object(
      'entry_id', p_entry_id, 'gross_out_kg', p_gross_out_kg, 'clean_in_kg', p_clean_in_kg,
      'cost_per_kg', v_cost_per_kg, 'mov_id', v_mov_id
    ));

  RETURN jsonb_build_object(
    'manipulation_id', v_manip_id, 'movement_id', v_mov_id,
    'waste_kg', GREATEST(p_gross_out_kg - p_clean_in_kg, 0),
    'yield_percent', CASE WHEN p_gross_out_kg > 0 THEN ROUND(p_clean_in_kg / p_gross_out_kg * 100, 2) ELSE 0 END,
    'cost_per_kg_gross', v_cost_per_kg,
    'company_id', v_company_id
  );
END;
$function$;

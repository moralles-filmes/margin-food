CREATE OR REPLACE FUNCTION public.cancel_salmon_manipulation_atomic(
  p_manip_id uuid,
  p_reason text DEFAULT 'USER_CANCEL'
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_manip record;
  v_mov record;
  v_estorno_id uuid;
  v_produto_id uuid;
BEGIN
  v_company := assert_tenant();

  -- Get and lock manipulation
  SELECT *
  INTO v_manip
  FROM public.salmon_manipulations
  WHERE id = p_manip_id AND company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Manipulação não encontrada';
  END IF;

  IF v_manip.status = 'CANCELLED' THEN
    RETURN jsonb_build_object('already_cancelled', true);
  END IF;

  -- 1. Mark as cancelled
  UPDATE public.salmon_manipulations
  SET status = 'CANCELLED', updated_at = now()
  WHERE id = p_manip_id;

  -- 2. Estorno in stocks
  FOR v_mov IN 
    SELECT * 
    FROM public.movimentacoes_estoque
    WHERE reference_type = 'SALMON_MANIPULATION' 
      AND reference_id = p_manip_id::text
      AND status = 'ATIVO'
      AND company_id = v_company
  LOOP
    v_produto_id := v_mov.produto_id;
    
    -- Inverter direction for estorno
    INSERT INTO public.movimentacoes_estoque (
      produto_id, tipo, direction, quantidade, custo_unitario, custo_total,
      origem, reference_type, reference_id, observacao, created_by,
      company_id, status, module, salmon_lot_id
    ) VALUES (
      v_produto_id, 'ESTORNO', 
      CASE WHEN v_mov.direction = 'IN' THEN 'OUT' ELSE 'IN' END,
      v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total,
      'SYSTEM', 'SALMON_MANIPULATION', v_mov.reference_id || '_ESTORNO', false, 'salmon', v_mov.salmon_lot_id
    ) RETURNING id INTO v_estorno_id;

    PERFORM recalc_product_costs(v_produto_id);
  END LOOP;

  PERFORM log_audit('rpc', 'salmon', 'salmon_manipulations', p_manip_id, 'CANCEL_ATOMIC',
    jsonb_build_object('status_anterior', 'ACTIVE', 'clean_kg', v_manip.clean_kg, 'gross_kg', v_manip.gross_kg),
    jsonb_build_object('reason', p_reason, 'estorno_id', v_estorno_id));

  RETURN jsonb_build_object('cancelled', true, 'manipulation_id', p_manip_id, 'estorno_id', v_estorno_id);
END;
$$;
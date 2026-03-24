CREATE OR REPLACE FUNCTION public.stock_insert_movement_atomic(
  p_produto_id uuid,
  p_qty numeric,
  p_tipo text,
  p_direction text,
  p_origem text DEFAULT 'MANUAL',
  p_ref_type text DEFAULT NULL,
  p_ref_id text DEFAULT NULL,
  p_note text DEFAULT NULL,
  p_setor text DEFAULT NULL,
  p_metadata jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_company uuid;
  v_produto record;
  v_saldo numeric;
  v_cost_unit numeric;
  v_cost_total numeric;
  v_new_id uuid;
  v_new_saldo numeric;
BEGIN
  v_company := assert_tenant();

  -- RBAC check
  IF NOT has_any_permission(auth.uid(), ARRAY[
    'estoque:movimentacoes:create', 'estoque:movimentacoes:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION '403RBAC: Sem permissão para criar movimentações';
  END IF;

  -- Validate produto belongs to tenant (with lock)
  SELECT id, avg30_cost_base_unit, last_cost_base_unit, default_cost_base_unit,
         custo_padrao, fator_conversao_padrao, nome_produto
  INTO v_produto
  FROM produtos
  WHERE id = p_produto_id AND company_id = v_company AND ativo = true
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION '404: Produto não encontrado no tenant';
  END IF;

  -- Calculate current balance
  SELECT COALESCE(SUM(
    CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END
  ), 0)
  INTO v_saldo
  FROM movimentacoes_estoque m
  WHERE m.produto_id = p_produto_id AND m.status = 'ATIVO' AND m.company_id = v_company;

  -- Block negative balance for OUT
  IF p_direction = 'OUT' AND v_saldo < p_qty THEN
    RAISE EXCEPTION '400: Saldo insuficiente. Disponível: %, Solicitado: %', v_saldo, p_qty;
  END IF;

  -- Determine cost
  v_cost_unit := COALESCE(
    NULLIF(v_produto.avg30_cost_base_unit, 0),
    NULLIF(v_produto.last_cost_base_unit, 0),
    NULLIF(v_produto.default_cost_base_unit, 0),
    CASE WHEN COALESCE(v_produto.fator_conversao_padrao, 1) > 0
         THEN COALESCE(v_produto.custo_padrao, 0) / COALESCE(v_produto.fator_conversao_padrao, 1)
         ELSE 0 END
  );
  v_cost_total := ROUND(p_qty * v_cost_unit, 2);

  -- Idempotency: if ref_type + ref_id exists, return existing
  IF p_ref_type IS NOT NULL AND p_ref_id IS NOT NULL THEN
    SELECT id INTO v_new_id
    FROM movimentacoes_estoque
    WHERE reference_type = p_ref_type AND reference_id = p_ref_id
      AND status = 'ATIVO' AND company_id = v_company;
    IF FOUND THEN
      RETURN jsonb_build_object('success', true, 'id', v_new_id, 'idempotent', true);
    END IF;
  END IF;

  -- Insert movement
  INSERT INTO movimentacoes_estoque (
    produto_id, tipo, direction, quantidade, custo_unitario, custo_total,
    origem, reference_type, reference_id, observacao, created_by,
    company_id, setor, status, data
  ) VALUES (
    p_produto_id, p_tipo, p_direction, p_qty, ROUND(v_cost_unit, 2), v_cost_total,
    p_origem, p_ref_type, p_ref_id, p_note, auth.uid(),
    v_company, p_setor, 'ATIVO', CURRENT_DATE
  )
  RETURNING id INTO v_new_id;

  v_new_saldo := v_saldo + CASE WHEN p_direction = 'IN' THEN p_qty ELSE -p_qty END;

  -- Audit
  PERFORM log_audit(
    p_source := 'rpc',
    p_module := 'estoque',
    p_entity := 'movimentacoes_estoque',
    p_entity_id := v_new_id::text,
    p_action := 'INSERT_MOVEMENT_ATOMIC',
    p_before := jsonb_build_object('saldo', v_saldo),
    p_after := jsonb_build_object('saldo', v_new_saldo, 'qty', p_qty, 'direction', p_direction)
  );

  RETURN jsonb_build_object(
    'success', true,
    'id', v_new_id,
    'saldo_anterior', v_saldo,
    'saldo_novo', v_new_saldo,
    'custo_unitario', ROUND(v_cost_unit, 2),
    'custo_total', v_cost_total
  );
END;
$$;
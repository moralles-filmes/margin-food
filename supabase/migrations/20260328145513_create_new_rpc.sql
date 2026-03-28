-- Migration: New Inventory Create RPC
CREATE OR REPLACE FUNCTION public.create_inventory_atomic(
  p_tipo text,
  p_data date,
  p_hora text,
  p_turno_id uuid,
  p_categorias text[] DEFAULT '{}',
  p_observacao text DEFAULT '',
  p_idempotency_key text DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv_id uuid;
  v_itens_count int := 0;
BEGIN
  -- Validate authentication and tenant
  BEGIN
    v_tenant := assert_tenant();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro de Tenant: %', SQLERRM;
  END;
  
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  -- Verify permissions
  IF NOT has_any_permission(v_user_id, ARRAY['inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permissão negada: inventario:criar:create necessário';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_inv_id FROM inventarios WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_inv_id; END IF;
  END IF;

  -- Create inventory record
  INSERT INTO inventarios (
    company_id, tipo, data, hora, turno_id, categorias,
    responsavel_user_id, observacao, status, idempotency_key
  ) VALUES (
    v_tenant, p_tipo, p_data, p_hora::time, p_turno_id, COALESCE(p_categorias, '{}'),
    v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', p_idempotency_key
  ) RETURNING id INTO v_inv_id;

  -- Populate items for 'completo' inventory
  -- OPTIMIZATION: Use pre-calculated p.saldo_atual instead of lateral join to solve timeout
  IF p_tipo = 'completo' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(p.saldo_atual, 0)),
      COALESCE(NULLIF(p.default_cost_base_unit, 0), p.custo_padrao, 0)
    FROM produtos p
    WHERE p.ativo = true AND p.company_id = v_tenant;

    GET DIAGNOSTICS v_itens_count = ROW_COUNT;
  END IF;

  -- Create log
  INSERT INTO audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, depois)
  VALUES (
    v_tenant, v_inv_id, v_user_id,
    COALESCE((SELECT string_agg(role::text, ',') FROM user_roles WHERE user_id = v_user_id), 'unknown'),
    'CRIACAO',
    jsonb_build_object('tipo', p_tipo, 'turno_id', p_turno_id, 'itens_count', v_itens_count)
  );

  RETURN v_inv_id;
END;
$$;


-- Fix create_inventory_atomic: get_saldo_produtos doesn't return custo_medio
-- Use custo_padrao from produtos table instead

CREATE OR REPLACE FUNCTION public.create_inventory_atomic(
  p_tipo text,
  p_data date,
  p_hora time,
  p_turno_id uuid,
  p_categorias text[] DEFAULT '{}',
  p_observacao text DEFAULT '',
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_tenant uuid;
  v_user_id uuid;
  v_inv_id uuid;
  v_existing_id uuid;
  v_itens_count int := 0;
BEGIN
  v_tenant := assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT has_any_permission(v_user_id, ARRAY['inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Forbidden: inventario:criar:create required';
  END IF;

  -- Idempotency check
  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_existing_id
    FROM inventarios
    WHERE company_id = v_tenant
      AND idempotency_key = p_idempotency_key
      AND deleted_at IS NULL;

    IF FOUND THEN
      RETURN jsonb_build_object(
        'inventario_id', v_existing_id,
        'idempotent', true,
        'itens_count', (SELECT count(*) FROM inventario_itens WHERE inventario_id = v_existing_id AND deleted_at IS NULL)
      );
    END IF;
  END IF;

  -- Create inventory
  INSERT INTO inventarios (
    company_id, tipo, data, hora, turno_id, categorias,
    responsavel_user_id, observacao, status, idempotency_key
  ) VALUES (
    v_tenant, p_tipo, p_data, p_hora, p_turno_id, COALESCE(p_categorias, '{}'),
    v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', p_idempotency_key
  )
  RETURNING id INTO v_inv_id;

  -- Bulk insert items: join produtos with saldo from movimentacoes_estoque
  IF p_tipo = 'completo' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(s.saldo, 0)),
      COALESCE(p.custo_padrao, 0)
    FROM produtos p
    LEFT JOIN LATERAL (
      SELECT ROUND(COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END), 0), 4) as saldo
      FROM movimentacoes_estoque m
      WHERE m.produto_id = p.id AND m.status = 'ATIVO' AND m.company_id = v_tenant
    ) s ON true
    WHERE p.ativo = true AND p.company_id = v_tenant;
    GET DIAGNOSTICS v_itens_count = ROW_COUNT;

  ELSIF p_tipo = 'parcial' AND array_length(p_categorias, 1) > 0 THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(s.saldo, 0)),
      COALESCE(p.custo_padrao, 0)
    FROM produtos p
    LEFT JOIN LATERAL (
      SELECT ROUND(COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END), 0), 4) as saldo
      FROM movimentacoes_estoque m
      WHERE m.produto_id = p.id AND m.status = 'ATIVO' AND m.company_id = v_tenant
    ) s ON true
    WHERE p.ativo = true AND p.company_id = v_tenant AND p.categoria = ANY(p_categorias);
    GET DIAGNOSTICS v_itens_count = ROW_COUNT;

  ELSIF p_tipo = 'ciclico' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, sub.id, 'geral',
      GREATEST(0, COALESCE(sub.saldo, 0)),
      COALESCE(sub.custo_padrao, 0)
    FROM (
      SELECT p.id, p.custo_padrao,
        (SELECT ROUND(COALESCE(SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END), 0), 4)
         FROM movimentacoes_estoque m WHERE m.produto_id = p.id AND m.status = 'ATIVO' AND m.company_id = v_tenant
        ) as saldo
      FROM produtos p
      WHERE p.ativo = true AND p.company_id = v_tenant
      ORDER BY COALESCE(p.custo_padrao, 0) DESC
      LIMIT 20
    ) sub;
    GET DIAGNOSTICS v_itens_count = ROW_COUNT;
  END IF;

  -- Audit
  INSERT INTO audit_inventario_log (company_id, inventario_id, user_id, user_role, acao, depois)
  VALUES (
    v_tenant, v_inv_id, v_user_id,
    COALESCE((SELECT string_agg(role::text, ',') FROM user_roles WHERE user_id = v_user_id), 'unknown'),
    'CRIACAO',
    jsonb_build_object('tipo', p_tipo, 'turno_id', p_turno_id, 'itens_count', v_itens_count)
  );

  RETURN jsonb_build_object('inventario_id', v_inv_id, 'idempotent', false, 'itens_count', v_itens_count);
END;
$$;

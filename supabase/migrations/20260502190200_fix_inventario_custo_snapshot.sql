-- Fix create_inventory_atomic: fallback for custo_snapshot was using custo_padrao
-- (stored per purchase unit, e.g. R$89/Galão) as if it were per base unit (R$/L),
-- inflating impacto_financeiro by fator_conversao_padrao for any dual-unit product
-- with default_cost_base_unit = 0.
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
  BEGIN
    v_tenant := assert_tenant();
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'Erro de Tenant: %', SQLERRM;
  END;

  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;

  IF NOT has_any_permission(v_user_id, ARRAY['inventario:criar:create', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Permissão negada: inventario:criar:create necessário';
  END IF;

  IF p_idempotency_key IS NOT NULL THEN
    SELECT id INTO v_inv_id FROM inventarios WHERE idempotency_key = p_idempotency_key;
    IF FOUND THEN RETURN v_inv_id; END IF;
  END IF;

  INSERT INTO inventarios (
    company_id, tipo, data, hora, turno_id, categorias,
    responsavel_user_id, observacao, status, idempotency_key
  ) VALUES (
    v_tenant, p_tipo, p_data, p_hora::time, p_turno_id, COALESCE(p_categorias, '{}'),
    v_user_id, COALESCE(p_observacao, ''), 'RASCUNHO', p_idempotency_key
  ) RETURNING id INTO v_inv_id;

  IF p_tipo = 'completo' THEN
    INSERT INTO inventario_itens (company_id, inventario_id, produto_id, tipo_item, saldo_teorico, custo_snapshot)
    SELECT
      v_tenant, v_inv_id, p.id, 'geral',
      GREATEST(0, COALESCE(p.saldo_atual, 0)),
      -- Use default_cost_base_unit (per base unit) as primary.
      -- Fallback divides custo_padrao (per purchase unit) by fator to get per-base-unit cost.
      COALESCE(
        NULLIF(p.default_cost_base_unit, 0),
        CASE
          WHEN COALESCE(p.fator_conversao_padrao, 0) > 0
            THEN p.custo_padrao / p.fator_conversao_padrao
          ELSE p.custo_padrao
        END,
        0
      )
    FROM produtos p
    WHERE p.ativo = true AND p.company_id = v_tenant;

    GET DIAGNOSTICS v_itens_count = ROW_COUNT;
  END IF;

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

-- Force column resolution validation on push (pattern from migration 20260502151400).
DO $$
BEGIN
  PERFORM pg_get_functiondef(oid) FROM pg_proc WHERE proname = 'create_inventory_atomic';
END $$;

-- ─────────────────────────────────────────────────────────────────────────────
-- Recalculate custo_snapshot and impacto_financeiro for all non-finalized
-- inventories that were created with the wrong fallback.
-- Does NOT touch FINALIZADO inventories (their ledger adjustments already ran).
-- ─────────────────────────────────────────────────────────────────────────────

-- Step 1: fix custo_snapshot for all items in non-finalized inventories
UPDATE inventario_itens ii
SET custo_snapshot = COALESCE(
  NULLIF(p.default_cost_base_unit, 0),
  CASE
    WHEN COALESCE(p.fator_conversao_padrao, 0) > 0
      THEN p.custo_padrao / p.fator_conversao_padrao
    ELSE p.custo_padrao
  END,
  0
)
FROM produtos p,
     inventarios inv
WHERE ii.produto_id = p.id
  AND ii.inventario_id = inv.id
  AND inv.status <> 'FINALIZADO'
  AND inv.deleted_at IS NULL
  AND ii.deleted_at IS NULL;

-- Step 2: recompute diferenca_qtd, diferenca_percent, impacto_financeiro, classificacao
-- only for items already counted (contagem_fisica IS NOT NULL)
UPDATE inventario_itens ii
SET
  diferenca_qtd       = ii.contagem_fisica - ii.saldo_teorico,
  diferenca_percent   = CASE
    WHEN ii.saldo_teorico <> 0
      THEN ((ii.contagem_fisica - ii.saldo_teorico) / ii.saldo_teorico) * 100
    WHEN ii.contagem_fisica > 0 THEN 100
    ELSE 0
  END,
  impacto_financeiro  = (ii.contagem_fisica - ii.saldo_teorico) * COALESCE(ii.custo_snapshot, 0),
  classificacao       = CASE
    WHEN abs(
      CASE WHEN ii.saldo_teorico <> 0
        THEN ((ii.contagem_fisica - ii.saldo_teorico) / ii.saldo_teorico) * 100
        ELSE (CASE WHEN ii.contagem_fisica > 0 THEN 100 ELSE 0 END)
      END
    ) > 6 THEN 'CRITICO'
    WHEN abs(
      CASE WHEN ii.saldo_teorico <> 0
        THEN ((ii.contagem_fisica - ii.saldo_teorico) / ii.saldo_teorico) * 100
        ELSE (CASE WHEN ii.contagem_fisica > 0 THEN 100 ELSE 0 END)
      END
    ) > 2 THEN 'ALERTA'
    ELSE 'NORMAL'
  END
FROM inventarios inv
WHERE ii.inventario_id = inv.id
  AND inv.status <> 'FINALIZADO'
  AND inv.deleted_at IS NULL
  AND ii.deleted_at IS NULL
  AND ii.contagem_fisica IS NOT NULL;

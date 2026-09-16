BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '120s';

-- Residual forward fixes after F2-F8. This migration is intentionally
-- state-based: it advances both the clean local sequence and the isolated
-- production release sequence without editing historical candidates.

-- -------------------------------------------------------------------------
-- Tenant-safe relationships and scoped conflict keys
-- -------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM public.requisicao_estoque_itens i
    LEFT JOIN public.requisicoes_estoque r ON r.id = i.requisicao_id
    WHERE r.id IS NULL OR r.company_id IS DISTINCT FROM i.company_id
  ) THEN
    RAISE EXCEPTION 'STABILIZATION_INTEGRITY_REQUIRED: requisicao_estoque_itens.requisicao_id';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.requisicao_estoque_itens i
    LEFT JOIN public.produtos p ON p.id = i.produto_id
    WHERE p.id IS NULL OR p.company_id IS DISTINCT FROM i.company_id
  ) THEN
    RAISE EXCEPTION 'STABILIZATION_INTEGRITY_REQUIRED: requisicao_estoque_itens.produto_id';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.salmon_purchase_targets
    GROUP BY company_id, year_num, month_num, category HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'STABILIZATION_INTEGRITY_REQUIRED: salmon_purchase_targets';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_requisition_items i
    LEFT JOIN public.purchase_requisitions r ON r.id = i.requisition_id
    WHERE r.id IS NULL OR r.company_id IS DISTINCT FROM i.company_id
  ) THEN
    RAISE EXCEPTION 'STABILIZATION_INTEGRITY_REQUIRED: purchase_requisition_items.requisition_id';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_requisition_items i
    JOIN public.produtos p ON p.id = i.produto_id
    WHERE p.company_id IS DISTINCT FROM i.company_id
  ) THEN
    RAISE EXCEPTION 'STABILIZATION_INTEGRITY_REQUIRED: purchase_requisition_items.produto_id';
  END IF;
  IF EXISTS (
    SELECT 1
    FROM public.purchase_requisition_audit a
    LEFT JOIN public.purchase_requisitions r ON r.id = a.requisition_id
    WHERE r.id IS NULL OR r.company_id IS DISTINCT FROM a.company_id
  ) THEN
    RAISE EXCEPTION 'STABILIZATION_INTEGRITY_REQUIRED: purchase_requisition_audit.requisition_id';
  END IF;
END $$;

ALTER TABLE public.requisicoes_estoque
  ADD CONSTRAINT stabilization_requisicoes_company_id_unique UNIQUE (company_id, id);
ALTER TABLE public.requisicao_estoque_itens
  ADD CONSTRAINT stabilization_requisicao_itens_requisicao_tenant_fk
  FOREIGN KEY (company_id, requisicao_id)
  REFERENCES public.requisicoes_estoque(company_id, id) ON DELETE CASCADE;
ALTER TABLE public.requisicao_estoque_itens
  ADD CONSTRAINT stabilization_requisicao_itens_produto_tenant_fk
  FOREIGN KEY (company_id, produto_id)
  REFERENCES public.produtos(company_id, id);
ALTER TABLE public.requisicao_estoque_itens
  DROP CONSTRAINT IF EXISTS requisicao_estoque_itens_requisicao_id_fkey,
  DROP CONSTRAINT IF EXISTS requisicao_estoque_itens_produto_id_fkey;

ALTER TABLE public.purchase_requisitions
  ADD CONSTRAINT stabilization_purchase_requisitions_company_id_unique UNIQUE (company_id, id);
ALTER TABLE public.purchase_requisition_items
  ADD CONSTRAINT stabilization_purchase_requisition_items_parent_tenant_fk
  FOREIGN KEY (company_id, requisition_id)
  REFERENCES public.purchase_requisitions(company_id, id) ON DELETE CASCADE;
ALTER TABLE public.purchase_requisition_items
  ADD CONSTRAINT stabilization_purchase_requisition_items_product_tenant_fk
  FOREIGN KEY (company_id, produto_id)
  REFERENCES public.produtos(company_id, id) ON DELETE SET NULL;
ALTER TABLE public.purchase_requisition_items
  DROP CONSTRAINT IF EXISTS purchase_requisition_items_requisition_id_fkey,
  DROP CONSTRAINT IF EXISTS purchase_requisition_items_produto_id_fkey;
ALTER TABLE public.purchase_requisition_audit
  ADD CONSTRAINT stabilization_purchase_requisition_audit_parent_tenant_fk
  FOREIGN KEY (company_id, requisition_id)
  REFERENCES public.purchase_requisitions(company_id, id) ON DELETE CASCADE;
ALTER TABLE public.purchase_requisition_audit
  DROP CONSTRAINT IF EXISTS purchase_requisition_audit_requisition_id_fkey;

ALTER TABLE public.purchase_order_items
  DROP CONSTRAINT IF EXISTS purchase_order_items_order_id_fkey,
  DROP CONSTRAINT IF EXISTS purchase_order_items_stock_item_id_fkey;
ALTER TABLE public.inventarios
  DROP CONSTRAINT IF EXISTS inventarios_turno_id_fkey;

ALTER TABLE public.salmon_purchase_targets
  ADD CONSTRAINT stabilization_salmon_purchase_targets_tenant_key
  UNIQUE (company_id, year_num, month_num, category);
ALTER TABLE public.salmon_purchase_targets
  DROP CONSTRAINT salmon_purchase_targets_year_num_month_num_category_key;

-- -------------------------------------------------------------------------
-- Storage metadata/object saga state
-- -------------------------------------------------------------------------
ALTER TABLE public.rh_documentos
  ADD COLUMN storage_state text NOT NULL DEFAULT 'ACTIVE';
ALTER TABLE public.rh_documentos
  ADD CONSTRAINT rh_documentos_storage_state_check
  CHECK (storage_state IN ('PENDING_UPLOAD', 'ACTIVE', 'DELETING'));
CREATE INDEX rh_documentos_storage_pending_idx
  ON public.rh_documentos(company_id, storage_state, created_at)
  WHERE storage_state <> 'ACTIVE';

-- -------------------------------------------------------------------------
-- Planning delete: the live table has no deleted_at/deleted_by columns.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._planning_delete_meta_guarded(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_before jsonb;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'planning:meta-compras:edit', 'planning:write', 'planning:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: planning:meta-compras:edit' USING ERRCODE='42501';
  END IF;

  SELECT to_jsonb(m) INTO v_before
  FROM public.planning_metas_compra m
  WHERE m.id = p_id AND m.company_id = v_cid
  FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  UPDATE public.planning_metas_compra
  SET ativo = false, updated_at = now()
  WHERE id = p_id AND company_id = v_cid;

  PERFORM public.log_audit('rpc', 'planning', 'planning_metas_compra', p_id,
    'DELETE_META', v_before, jsonb_build_object('ativo', false));
  RETURN jsonb_build_object('success', true, 'id', p_id);
END $$;
REVOKE ALL ON FUNCTION public._planning_delete_meta_guarded(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._planning_delete_meta_guarded(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- Salmon edits: cancel + recreate are one transaction. The guarded create
-- keeps the current expiration-date TEXT wrapper and the inner DATE contract.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public._salmon_replace_entry_guarded(
  p_entry_id uuid,
  p_entry_date text,
  p_lot text,
  p_sif text,
  p_supplier_name text,
  p_boxes integer,
  p_units integer,
  p_gross_kg numeric,
  p_total_value numeric,
  p_notes text DEFAULT '',
  p_expiration_date text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public._salmon_cancel_entry_guarded(p_entry_id, 'Edição de entrada');
  v_result := public._salmon_create_entry_guarded(
    p_entry_date, p_lot, p_sif, p_supplier_name, p_boxes, p_units,
    p_gross_kg, p_total_value, p_notes, p_expiration_date
  );
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public._salmon_replace_entry_guarded(uuid,text,text,text,text,integer,integer,numeric,numeric,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._salmon_replace_entry_guarded(uuid,text,text,text,text,integer,integer,numeric,numeric,text,text)
  TO authenticated;

CREATE OR REPLACE FUNCTION public._salmon_replace_manipulation_guarded(
  p_manip_id uuid,
  p_entry_id uuid,
  p_manipulation_date text,
  p_fish_count integer,
  p_gross_out_kg numeric,
  p_clean_in_kg numeric,
  p_leftover_kg numeric,
  p_notes text DEFAULT ''
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_result jsonb;
BEGIN
  PERFORM public._salmon_cancel_manipulation_guarded(p_manip_id, 'Edição de manipulação');
  v_result := public._salmon_create_manipulation_guarded(
    p_entry_id, p_manipulation_date, p_fish_count, p_gross_out_kg,
    p_clean_in_kg, p_leftover_kg, p_notes
  );
  RETURN v_result;
END $$;
REVOKE ALL ON FUNCTION public._salmon_replace_manipulation_guarded(uuid,uuid,text,integer,numeric,numeric,numeric,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public._salmon_replace_manipulation_guarded(uuid,uuid,text,integer,numeric,numeric,numeric,text)
  TO authenticated;

-- -------------------------------------------------------------------------
-- External stock cancellation, reversal, Salmon cascade and audit are atomic.
-- The reversal must be inserted before the original is marked CANCELLED.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.cancel_stock_movement_atomic(
  p_movement_id uuid,
  p_reason text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_mov public.movimentacoes_estoque%ROWTYPE;
  v_reversal_type text;
  v_reversal_direction text;
  v_reversal_id uuid;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF btrim(coalesce(p_reason, '')) = '' THEN RAISE EXCEPTION 'REASON_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'estoque:movimentacoes:cancel', 'estoque:movimentacoes:edit',
    'estoque:movimentacoes:manage', 'stock:movements:cancel', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: estoque:movimentacoes:cancel' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_mov
  FROM public.movimentacoes_estoque
  WHERE id = p_movement_id AND company_id = v_cid
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_mov.status <> 'ATIVO' OR EXISTS (
    SELECT 1 FROM public.movimentacoes_estoque
    WHERE company_id = v_cid AND estorno_de_id = p_movement_id AND status = 'ATIVO'
  ) THEN
    RAISE EXCEPTION 'ALREADY_CANCELLED';
  END IF;
  IF v_mov.estorno_de_id IS NOT NULL OR v_mov.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN
    RAISE EXCEPTION 'REVERSAL_NOT_ALLOWED';
  END IF;
  IF v_mov.origem = 'INVENTARIO' AND v_mov.referencia_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.inventarios
    WHERE id::text = v_mov.referencia_id AND company_id = v_cid AND status = 'FINALIZADO'
  ) THEN
    RAISE EXCEPTION 'INVENTORY_CLOSED';
  END IF;

  v_reversal_type := CASE
    WHEN coalesce(v_mov.direction, CASE WHEN v_mov.tipo IN ('ENTRADA','AJUSTE_ENTRADA') THEN 'IN' ELSE 'OUT' END) = 'IN'
      THEN 'ENTRADA_ESTORNO' ELSE 'SAIDA_ESTORNO' END;
  v_reversal_direction := CASE WHEN v_reversal_type = 'ENTRADA_ESTORNO' THEN 'OUT' ELSE 'IN' END;

  INSERT INTO public.movimentacoes_estoque (
    produto_id, data, tipo, direction, quantidade, custo_unitario, custo_total,
    origem, referencia_id, observacao, created_by, status, estorno_de_id, setor,
    reference_type, reference_id, internal_transfer, source_module, company_id
  ) VALUES (
    v_mov.produto_id, v_mov.data, v_reversal_type, v_reversal_direction,
    v_mov.quantidade, v_mov.custo_unitario, v_mov.custo_total,
    'ESTORNO', p_movement_id::text,
    format('Estorno de %s #%s — %s', v_mov.tipo, left(p_movement_id::text, 8), btrim(p_reason)),
    v_uid, 'ATIVO', p_movement_id, v_mov.setor,
    v_mov.reference_type,
    coalesce(v_mov.reference_id, p_movement_id::text) || '_ESTORNO',
    false, coalesce(v_mov.source_module, 'estoque'), v_cid
  ) RETURNING id INTO v_reversal_id;

  UPDATE public.movimentacoes_estoque
  SET status = 'CANCELADO', cancelado_por = v_uid, cancelado_em = now(),
      justificativa_cancelamento = btrim(p_reason)
  WHERE id = p_movement_id AND company_id = v_cid;

  IF v_mov.source_module = 'salmon' AND v_mov.reference_id IS NOT NULL
     AND v_mov.reference_id !~ '_ESTORNO$' THEN
    IF v_mov.reference_type = 'SALMON_ENTRY' THEN
      UPDATE public.salmon_entries
      SET status = 'CANCELLED', updated_at = now()
      WHERE id = v_mov.reference_id::uuid AND company_id = v_cid;
      IF NOT FOUND THEN RAISE EXCEPTION 'SALMON_ENTRY_NOT_FOUND'; END IF;
    ELSIF v_mov.reference_type = 'SALMON_MANIPULATION' THEN
      UPDATE public.salmon_manipulations
      SET status = 'CANCELLED', updated_at = now()
      WHERE id = v_mov.reference_id::uuid AND company_id = v_cid;
      IF NOT FOUND THEN RAISE EXCEPTION 'SALMON_MANIPULATION_NOT_FOUND'; END IF;
    END IF;
  END IF;

  PERFORM public.log_audit('rpc', 'estoque', 'movimentacoes_estoque', p_movement_id,
    'CANCEL_MOVEMENT', to_jsonb(v_mov),
    jsonb_build_object('status','CANCELADO','reason',btrim(p_reason),'reversal_id',v_reversal_id));
  RETURN jsonb_build_object('success', true, 'reversal_id', v_reversal_id);
END $$;
REVOKE ALL ON FUNCTION public.cancel_stock_movement_atomic(uuid,text) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_stock_movement_atomic(uuid,text) TO authenticated;

-- -------------------------------------------------------------------------
-- Quick inventory: valid type, cached balance source and idempotent replay.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.create_quick_inventory_atomic(
  p_items jsonb,
  p_observacao text DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_actor_id uuid := auth.uid();
  v_company_id uuid := public.assert_tenant();
  v_inv_id uuid;
  v_existing record;
  v_item jsonb;
  v_product record;
  v_saldo numeric;
  v_counted numeric;
  v_diff numeric;
  v_diff_pct numeric;
  v_cost_base numeric;
  v_impact numeric;
  v_now timestamptz := now();
  v_total_items int := 0;
  v_adjusted int := 0;
  v_total_impact numeric := 0;
  v_acuracia_sum numeric := 0;
  v_acuracia_count int := 0;
  v_turno_id uuid;
BEGIN
  IF v_actor_id IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_actor_id, ARRAY[
    'inventario:rapido:create', 'inventario:criar:create', 'inventory:create', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: inventario:rapido:create' USING ERRCODE='42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_INVENTORY';
  END IF;

  IF nullif(p_idempotency_key, '') IS NOT NULL THEN
    SELECT i.id,
           count(ii.id)::int AS total_items,
           count(ii.id) FILTER (WHERE ii.diferenca_qtd <> 0)::int AS adjusted,
           coalesce(sum(ii.impacto_financeiro), 0) AS total_impact
    INTO v_existing
    FROM public.inventarios i
    LEFT JOIN public.inventario_itens ii
      ON ii.inventario_id = i.id AND ii.company_id = i.company_id
    WHERE i.company_id = v_company_id AND i.idempotency_key = p_idempotency_key
    GROUP BY i.id;
    IF v_existing.id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true, 'idempotent', true, 'inventory_id', v_existing.id,
        'total_items', v_existing.total_items, 'adjusted', v_existing.adjusted,
        'total_impact', v_existing.total_impact
      );
    END IF;
  END IF;

  SELECT id INTO v_turno_id
  FROM public.turnos
  WHERE company_id = v_company_id AND ativo = true
  ORDER BY created_at, id LIMIT 1;

  v_inv_id := gen_random_uuid();
  BEGIN
    INSERT INTO public.inventarios (
      id, company_id, tipo, status, data, hora, responsavel_user_id,
      observacao, idempotency_key, turno_id
    ) VALUES (
      v_inv_id, v_company_id, 'parcial', 'EM_CONTAGEM',
      (v_now AT TIME ZONE 'America/Sao_Paulo')::date,
      (v_now AT TIME ZONE 'America/Sao_Paulo')::time,
      v_actor_id, coalesce(p_observacao, 'Inventário Rápido'),
      coalesce(nullif(p_idempotency_key, ''), gen_random_uuid()::text), v_turno_id
    );
  EXCEPTION WHEN unique_violation THEN
    SELECT i.id,
           count(ii.id)::int AS total_items,
           count(ii.id) FILTER (WHERE ii.diferenca_qtd <> 0)::int AS adjusted,
           coalesce(sum(ii.impacto_financeiro), 0) AS total_impact
    INTO v_existing
    FROM public.inventarios i
    LEFT JOIN public.inventario_itens ii
      ON ii.inventario_id = i.id AND ii.company_id = i.company_id
    WHERE i.company_id = v_company_id AND i.idempotency_key = p_idempotency_key
    GROUP BY i.id;
    RETURN jsonb_build_object(
      'success', true, 'idempotent', true, 'inventory_id', v_existing.id,
      'total_items', v_existing.total_items, 'adjusted', v_existing.adjusted,
      'total_impact', v_existing.total_impact
    );
  END;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF nullif(v_item->>'product_id', '') IS NULL OR nullif(v_item->>'counted_quantity', '') IS NULL THEN
      RAISE EXCEPTION 'INVALID_INVENTORY_ITEM';
    END IF;
    v_counted := (v_item->>'counted_quantity')::numeric;
    IF v_counted < 0 THEN RAISE EXCEPTION 'NEGATIVE_COUNT'; END IF;

    SELECT * INTO v_product
    FROM public.produtos
    WHERE id = (v_item->>'product_id')::uuid AND company_id = v_company_id
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND: %', v_item->>'product_id'; END IF;
    IF NOT v_product.ativo THEN RAISE EXCEPTION 'PRODUCT_INACTIVE: %', v_product.nome_produto; END IF;

    v_saldo := coalesce(v_product.saldo_atual, 0);
    v_diff := v_counted - v_saldo;
    v_diff_pct := CASE WHEN v_saldo <> 0 THEN round((v_diff / abs(v_saldo)) * 100, 2) ELSE 0 END;
    v_cost_base := coalesce(nullif(v_product.avg30_cost_base_unit, 0),
      nullif(v_product.last_cost_base_unit, 0), nullif(v_product.default_cost_base_unit, 0), 0);
    v_impact := round(abs(v_diff) * v_cost_base, 2);

    INSERT INTO public.inventario_itens (
      inventario_id, company_id, produto_id, tipo_item, saldo_teorico,
      contagem_fisica, diferenca_qtd, diferenca_percent, custo_snapshot,
      impacto_financeiro, classificacao, contado_por, contagem_inicio, contagem_fim
    ) VALUES (
      v_inv_id, v_company_id, v_product.id, 'geral', v_saldo, v_counted,
      v_diff, v_diff_pct, v_cost_base, v_impact,
      CASE WHEN abs(v_diff_pct) > 10 OR v_impact > 500 THEN 'CRITICO'
           WHEN abs(v_diff_pct) > 5 OR v_impact > 100 THEN 'ALERTA' ELSE 'NORMAL' END,
      v_actor_id, v_now, v_now
    );

    v_total_items := v_total_items + 1;
    v_total_impact := v_total_impact + v_impact;
    IF v_saldo > 0 THEN
      v_acuracia_sum := v_acuracia_sum + greatest(0, least(v_counted / v_saldo, 1));
      v_acuracia_count := v_acuracia_count + 1;
    ELSIF v_counted = 0 THEN
      v_acuracia_sum := v_acuracia_sum + 1;
      v_acuracia_count := v_acuracia_count + 1;
    END IF;

    IF v_diff <> 0 THEN
      INSERT INTO public.movimentacoes_estoque (
        produto_id, company_id, data, tipo, direction, quantidade,
        custo_unitario, custo_total, origem, observacao, created_by,
        status, reference_type, reference_id, source_module
      ) VALUES (
        v_product.id, v_company_id, (v_now AT TIME ZONE 'America/Sao_Paulo')::date,
        CASE WHEN v_diff > 0 THEN 'ENTRADA' ELSE 'SAIDA' END,
        CASE WHEN v_diff > 0 THEN 'IN' ELSE 'OUT' END,
        abs(v_diff), round(v_cost_base, 4), round(abs(v_diff) * v_cost_base, 2),
        'Inventário Rápido',
        format('Ajuste inventário rápido: %s (%s → %s %s)', v_product.nome_produto,
          round(v_saldo, 2), round(v_counted, 2), v_product.unidade_medida),
        v_actor_id, 'ATIVO', 'QUICK_INVENTORY', v_inv_id::text, 'inventario'
      );
      v_adjusted := v_adjusted + 1;
    END IF;
  END LOOP;

  UPDATE public.inventarios
  SET status = 'FINALIZADO', finalizado_em = v_now, finalizado_por = v_actor_id,
      acuracia_percent = CASE WHEN v_acuracia_count > 0
        THEN round((v_acuracia_sum / v_acuracia_count) * 100, 2) ELSE 100 END,
      drift_total_valor = v_total_impact, updated_at = v_now
  WHERE id = v_inv_id AND company_id = v_company_id;

  PERFORM public.log_audit('rpc', 'inventario', 'inventarios', v_inv_id,
    'QUICK_INVENTORY', NULL,
    jsonb_build_object('total_items',v_total_items,'adjusted',v_adjusted,'total_impact',v_total_impact));
  RETURN jsonb_build_object(
    'success', true, 'idempotent', false, 'inventory_id', v_inv_id,
    'total_items', v_total_items, 'adjusted', v_adjusted,
    'total_impact', v_total_impact
  );
END $$;
REVOKE ALL ON FUNCTION public.create_quick_inventory_atomic(jsonb,text,text)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_quick_inventory_atomic(jsonb,text,text) TO authenticated;

-- -------------------------------------------------------------------------
-- Purchase requisition mutations keep parent, children, totals and audit in
-- one transaction. Child ids are always constrained by parent and tenant.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.mutate_purchase_requisition_atomic(
  p_action text,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_id uuid;
  v_item jsonb;
  v_item_id uuid;
  v_product_id uuid;
  v_quantity numeric;
  v_price numeric;
  v_total numeric := 0;
  v_current public.purchase_requisitions%ROWTYPE;
  v_ignored boolean;
  v_reason text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_action NOT IN ('criar','editar','ignorar_item','converter') THEN
    RAISE EXCEPTION 'INVALID_ACTION';
  END IF;
  IF NOT public.has_any_permission(v_uid, CASE p_action
    WHEN 'criar' THEN ARRAY['compras:lista:create','purchases:create','system:global:manage']
    WHEN 'converter' THEN ARRAY['compras:checklist:approve','purchases:approve','system:global:manage']
    ELSE ARRAY['compras:lista:edit','purchases:edit','system:global:manage']
  END) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: %', CASE p_action
      WHEN 'criar' THEN 'compras:lista:create'
      WHEN 'converter' THEN 'compras:checklist:approve'
      ELSE 'compras:lista:edit'
    END USING ERRCODE='42501';
  END IF;

  IF p_action = 'criar' THEN
    IF coalesce(jsonb_typeof(p_payload->'itens'),'null') <> 'array'
       OR jsonb_array_length(p_payload->'itens') = 0 THEN
      RAISE EXCEPTION 'ITEMS_REQUIRED';
    END IF;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'itens') LOOP
      v_product_id := nullif(v_item->>'produto_id','')::uuid;
      IF v_product_id IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.produtos WHERE id=v_product_id AND company_id=v_cid
      ) THEN RAISE EXCEPTION 'PRODUCT_NOT_FOUND'; END IF;
      v_quantity := coalesce(nullif(v_item->>'quantidade_escolhida','')::numeric,
                             nullif(v_item->>'quantidade_sugerida','')::numeric,0);
      v_price := coalesce(nullif(v_item->>'preco_referencia','')::numeric,0);
      IF v_quantity < 0 OR v_price < 0 THEN RAISE EXCEPTION 'INVALID_ITEM_VALUE'; END IF;
      v_total := v_total + v_quantity * v_price;
    END LOOP;

    INSERT INTO public.purchase_requisitions(
      company_id,tipo,observacao,total_estimado,created_by
    ) VALUES (
      v_cid,coalesce(nullif(p_payload->>'tipo',''),'manual'),coalesce(p_payload->>'observacao',''),
      v_total,v_uid
    ) RETURNING id INTO v_id;

    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'itens') LOOP
      v_quantity := coalesce(nullif(v_item->>'quantidade_escolhida','')::numeric,
                             nullif(v_item->>'quantidade_sugerida','')::numeric,0);
      v_price := coalesce(nullif(v_item->>'preco_referencia','')::numeric,0);
      INSERT INTO public.purchase_requisition_items(
        company_id,requisition_id,produto_id,produto_nome,quantidade_sugerida,
        quantidade_escolhida,unidade,preco_referencia,subtotal,prioridade,motivo
      ) VALUES (
        v_cid,v_id,nullif(v_item->>'produto_id','')::uuid,coalesce(v_item->>'produto_nome',''),
        coalesce(nullif(v_item->>'quantidade_sugerida','')::numeric,0),v_quantity,
        coalesce(nullif(v_item->>'unidade',''),'UN'),v_price,v_quantity*v_price,
        coalesce(nullif(v_item->>'prioridade',''),'media'),coalesce(v_item->>'motivo','')
      );
    END LOOP;

    INSERT INTO public.purchase_requisition_audit(
      requisition_id,acao,valor_novo,user_id,company_id
    ) VALUES (
      v_id,'CRIADA',jsonb_build_object('tipo',coalesce(p_payload->>'tipo','manual'),
        'itens',jsonb_array_length(p_payload->'itens'))::text,v_uid,v_cid
    );
    RETURN jsonb_build_object('success',true,'id',v_id,'codigo',(
      SELECT codigo FROM public.purchase_requisitions WHERE id=v_id AND company_id=v_cid
    ));
  END IF;

  IF p_action = 'ignorar_item' THEN
    v_item_id := nullif(p_payload->>'item_id','')::uuid;
    IF v_item_id IS NULL THEN RAISE EXCEPTION 'ITEM_ID_REQUIRED'; END IF;
    v_ignored := coalesce((p_payload->>'ignored')::boolean,false);
    v_reason := nullif(p_payload->>'reason','');

    SELECT r.* INTO v_current
    FROM public.purchase_requisition_items i
    JOIN public.purchase_requisitions r
      ON r.id=i.requisition_id AND r.company_id=i.company_id
    WHERE i.id=v_item_id AND i.company_id=v_cid
    FOR UPDATE OF i,r;
    IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
    IF v_current.status='CONVERTIDA' THEN RAISE EXCEPTION 'REQUISITION_ALREADY_CONVERTED'; END IF;

    UPDATE public.purchase_requisition_items SET
      is_ignored=v_ignored,ignored_by=CASE WHEN v_ignored THEN v_uid END,
      ignored_at=CASE WHEN v_ignored THEN now() END,
      ignored_reason=CASE WHEN v_ignored THEN v_reason END
    WHERE id=v_item_id AND requisition_id=v_current.id AND company_id=v_cid;

    SELECT coalesce(sum(subtotal) FILTER(WHERE NOT is_ignored),0) INTO v_total
    FROM public.purchase_requisition_items
    WHERE requisition_id=v_current.id AND company_id=v_cid;
    UPDATE public.purchase_requisitions
    SET total_estimado=v_total,updated_by=v_uid
    WHERE id=v_current.id AND company_id=v_cid;
    INSERT INTO public.purchase_requisition_audit(
      requisition_id,acao,campo,valor_novo,user_id,company_id
    ) VALUES (
      v_current.id,CASE WHEN v_ignored THEN 'ITEM_IGNORADO' ELSE 'ITEM_RESTAURADO' END,
      'item',jsonb_build_object('item_id',v_item_id,'reason',v_reason)::text,v_uid,v_cid
    );
    RETURN jsonb_build_object('success',true,'id',v_current.id,'total_estimado',v_total);
  END IF;

  v_id := nullif(p_payload->>'id','')::uuid;
  IF v_id IS NULL THEN RAISE EXCEPTION 'ID_REQUIRED'; END IF;
  SELECT * INTO v_current FROM public.purchase_requisitions
  WHERE id=v_id AND company_id=v_cid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF p_action = 'converter' THEN
    IF v_current.status='CONVERTIDA' THEN
      RETURN jsonb_build_object('success',true,'id',v_id,'idempotent',true);
    END IF;
    UPDATE public.purchase_requisitions
    SET status='CONVERTIDA',updated_by=v_uid
    WHERE id=v_id AND company_id=v_cid;
    INSERT INTO public.purchase_requisition_audit(
      requisition_id,acao,valor_anterior,valor_novo,user_id,company_id
    ) VALUES (v_id,'CONVERTIDA_EM_PEDIDO',v_current.status,'CONVERTIDA',v_uid,v_cid);
    RETURN jsonb_build_object('success',true,'id',v_id,'idempotent',false);
  END IF;

  IF v_current.status='CONVERTIDA' THEN RAISE EXCEPTION 'REQUISITION_ALREADY_CONVERTED'; END IF;
  UPDATE public.purchase_requisitions SET
    observacao=CASE WHEN p_payload ? 'observacao' THEN p_payload->>'observacao' ELSE observacao END,
    status=CASE WHEN nullif(p_payload->>'status','') IS NOT NULL THEN p_payload->>'status' ELSE status END,
    updated_by=v_uid
  WHERE id=v_id AND company_id=v_cid;

  IF p_payload ? 'itens' THEN
    IF coalesce(jsonb_typeof(p_payload->'itens'),'null') <> 'array' THEN RAISE EXCEPTION 'INVALID_ITEMS'; END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'itens') LOOP
      v_item_id := nullif(v_item->>'id','')::uuid;
      IF v_item_id IS NULL THEN RAISE EXCEPTION 'ITEM_ID_REQUIRED'; END IF;
      UPDATE public.purchase_requisition_items SET
        quantidade_escolhida=CASE WHEN v_item ? 'quantidade_escolhida'
          THEN (v_item->>'quantidade_escolhida')::numeric ELSE quantidade_escolhida END,
        preco_referencia=CASE WHEN v_item ? 'preco_referencia'
          THEN (v_item->>'preco_referencia')::numeric ELSE preco_referencia END,
        subtotal=(CASE WHEN v_item ? 'quantidade_escolhida'
          THEN (v_item->>'quantidade_escolhida')::numeric ELSE quantidade_escolhida END)
          * (CASE WHEN v_item ? 'preco_referencia'
          THEN (v_item->>'preco_referencia')::numeric ELSE preco_referencia END)
      WHERE id=v_item_id AND requisition_id=v_id AND company_id=v_cid;
      IF NOT FOUND THEN RAISE EXCEPTION 'REQUISITION_ITEM_NOT_FOUND'; END IF;
    END LOOP;
  END IF;

  SELECT coalesce(sum(subtotal) FILTER(WHERE NOT is_ignored),0) INTO v_total
  FROM public.purchase_requisition_items WHERE requisition_id=v_id AND company_id=v_cid;
  UPDATE public.purchase_requisitions SET total_estimado=v_total
  WHERE id=v_id AND company_id=v_cid;
  INSERT INTO public.purchase_requisition_audit(
    requisition_id,acao,campo,valor_anterior,valor_novo,user_id,company_id
  ) VALUES (
    v_id,'EDITADA',CASE WHEN nullif(p_payload->>'status','') IS NOT NULL THEN 'status' ELSE 'itens' END,
    v_current.status,coalesce(nullif(p_payload->>'status',''),'itens atualizados'),v_uid,v_cid
  );
  RETURN jsonb_build_object('success',true,'id',v_id,'total_estimado',v_total);
END $$;
REVOKE ALL ON FUNCTION public.mutate_purchase_requisition_atomic(text,jsonb)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.mutate_purchase_requisition_atomic(text,jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- Purchase checklist and receipt batches
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.confirm_purchase_shopping_atomic(
  p_order_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_order record;
  v_item jsonb;
  v_total int;
  v_ok int := 0;
  v_unavailable int := 0;
  v_sender text;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'compras:checklist:edit', 'compras:checklist:approve',
    'purchases:market:edit', 'purchases:approve', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:checklist:edit' USING ERRCODE='42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_CHECKLIST';
  END IF;

  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id AND company_id = v_cid AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_order.status = 'IN_RECEIVING' THEN
    RETURN jsonb_build_object('status','idempotent','order_id',p_order_id);
  END IF;
  IF v_order.status <> 'PENDING' OR v_order.type NOT IN ('MERCADO','SAZONAL') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_order.status;
  END IF;

  SELECT count(*) INTO v_total
  FROM public.purchase_order_items
  WHERE order_id = p_order_id AND company_id = v_cid AND deleted_at IS NULL;
  IF v_total <> jsonb_array_length(p_items)
     OR (SELECT count(DISTINCT value->>'order_item_id') FROM jsonb_array_elements(p_items)) <> v_total THEN
    RAISE EXCEPTION 'CHECKLIST_INCOMPLETE';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    IF (v_item->>'shopping_status') NOT IN ('OK','NOT_AVAILABLE') THEN
      RAISE EXCEPTION 'INVALID_CHECKLIST_STATUS';
    END IF;
    UPDATE public.purchase_order_items
    SET shopping_status = v_item->>'shopping_status',
        shopping_note = coalesce(v_item->>'note',''),
        received_status = CASE WHEN (v_item->>'shopping_status') = 'NOT_AVAILABLE'
          THEN 'NOT_DELIVERED' ELSE 'PENDING' END,
        not_delivered_reason = CASE WHEN (v_item->>'shopping_status') = 'NOT_AVAILABLE'
          THEN coalesce(nullif(btrim(v_item->>'note'),''),'Indisponível na compra') ELSE NULL END,
        received_at = CASE WHEN (v_item->>'shopping_status') = 'NOT_AVAILABLE' THEN now() ELSE NULL END,
        received_by = CASE WHEN (v_item->>'shopping_status') = 'NOT_AVAILABLE' THEN v_uid ELSE NULL END,
        updated_at = now()
    WHERE id = (v_item->>'order_item_id')::uuid
      AND order_id = p_order_id AND company_id = v_cid AND deleted_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_TENANT_MISMATCH'; END IF;
    IF (v_item->>'shopping_status') = 'OK' THEN v_ok := v_ok + 1;
    ELSE v_unavailable := v_unavailable + 1; END IF;
  END LOOP;
  IF v_ok = 0 THEN RAISE EXCEPTION 'NO_PURCHASED_ITEMS'; END IF;

  UPDATE public.purchase_orders
  SET status = 'IN_RECEIVING', shopping_done_at = now(), shopping_done_by = v_uid, updated_at = now()
  WHERE id = p_order_id AND company_id = v_cid;

  IF v_order.created_by <> v_uid AND NOT EXISTS (
    SELECT 1 FROM public.notifications
    WHERE company_id = v_cid AND recipient_user_id = v_order.created_by
      AND entity_type = 'purchase_order' AND entity_id = p_order_id
      AND type = 'PURCHASE_SHOPPING_COMPLETED' AND read_at IS NULL
  ) THEN
    SELECT coalesce(nome, 'Responsável') INTO v_sender FROM public.profiles WHERE id = v_uid;
    INSERT INTO public.notifications (
      recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, company_id, metadata
    ) VALUES (
      v_order.created_by, 'PURCHASE_SHOPPING_COMPLETED', 'purchases',
      'Compra realizada — pronto para conferência',
      format('@%s concluiu a compra de "%s". %s', v_sender, v_order.title,
        CASE WHEN v_unavailable > 0 THEN v_unavailable || ' item(ns) indisponível(is).'
             ELSE 'Todos os itens OK.' END),
      'purchase_order', p_order_id, '/compras', v_uid, v_cid,
      jsonb_build_object('unavailable_items',v_unavailable)
    );
  END IF;

  PERFORM public.log_audit('rpc','purchases','purchase_orders',p_order_id,
    'SHOPPING_CONFIRMED',to_jsonb(v_order),
    jsonb_build_object('status','IN_RECEIVING','ok_items',v_ok,'unavailable_items',v_unavailable));
  RETURN jsonb_build_object('status','IN_RECEIVING','ok_items',v_ok,'unavailable_items',v_unavailable);
END $$;
REVOKE ALL ON FUNCTION public.confirm_purchase_shopping_atomic(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.confirm_purchase_shopping_atomic(uuid,jsonb) TO authenticated;

CREATE TABLE public.purchase_receipt_batches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  order_id uuid NOT NULL,
  idempotency_key uuid NOT NULL,
  response jsonb NOT NULL,
  created_by uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT purchase_receipt_batches_tenant_key UNIQUE(company_id, idempotency_key),
  CONSTRAINT purchase_receipt_batches_order_tenant_fk
    FOREIGN KEY(company_id, order_id)
    REFERENCES public.purchase_orders(company_id, id) ON DELETE CASCADE
);
ALTER TABLE public.purchase_receipt_batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.purchase_receipt_batches FORCE ROW LEVEL SECURITY;
REVOKE ALL ON public.purchase_receipt_batches FROM PUBLIC, anon, authenticated;
GRANT SELECT ON public.purchase_receipt_batches TO authenticated;
GRANT ALL ON public.purchase_receipt_batches TO service_role;
CREATE POLICY purchase_receipt_batches_select ON public.purchase_receipt_batches
  FOR SELECT TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'compras:recebimentos:view','compras:recebimentos:create',
      'compras:recebimentos:edit','compras:lista:approve','system:global:manage'
    ]))
  );

CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(
  p_order_id uuid,
  p_items jsonb,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company uuid := public.assert_tenant();
  v_caller uuid := auth.uid();
  v_order record;
  v_item jsonb;
  v_oi record;
  v_batch_key uuid;
  v_response jsonb;
  v_supplier_uuid uuid;
  v_conv numeric;
  v_qty_base numeric;
  v_cost_purchase numeric;
  v_cost_base numeric;
  v_qty_received numeric;
  v_qty_shortfall numeric;
  v_items_received int := 0;
  v_items_not_delivered int := 0;
  v_total_confirmed numeric := 0;
  v_new_status text;
  v_ref_id text;
BEGIN
  IF v_caller IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_caller, ARRAY[
    'compras:recebimentos:create','compras:recebimentos:edit',
    'compras:recebimentos:close','purchases:receiving:manage','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:recebimentos:create' USING ERRCODE='42501';
  END IF;
  IF NOT public.has_any_permission(v_caller, ARRAY[
    'compras:lista:approve','purchases:approve','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:lista:approve' USING ERRCODE='42501';
  END IF;
  BEGIN
    v_batch_key := nullif(p_metadata->>'idempotency_key','')::uuid;
  EXCEPTION WHEN invalid_text_representation THEN
    RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY';
  END;
  IF v_batch_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'EMPTY_RECEIPT';
  END IF;
  IF (SELECT count(DISTINCT value->>'order_item_id') FROM jsonb_array_elements(p_items))
     <> jsonb_array_length(p_items) THEN
    RAISE EXCEPTION 'DUPLICATE_RECEIPT_ITEM';
  END IF;

  SELECT * INTO v_order
  FROM public.purchase_orders
  WHERE id = p_order_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT response INTO v_response
  FROM public.purchase_receipt_batches
  WHERE company_id = v_company AND idempotency_key = v_batch_key;
  IF FOUND THEN RETURN v_response || jsonb_build_object('idempotent',true); END IF;

  IF v_order.status NOT IN ('IN_RECEIVING','OPEN','SHOPPING_OK','PARTIAL','COMPLETED') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_order.status;
  END IF;

  PERFORM p.id
  FROM public.produtos p
  JOIN public.purchase_order_items oi
    ON oi.stock_item_id = p.id AND oi.company_id = p.company_id
  WHERE oi.order_id = p_order_id AND oi.company_id = v_company
    AND oi.id IN (SELECT (value->>'order_item_id')::uuid FROM jsonb_array_elements(p_items))
  ORDER BY p.id FOR UPDATE OF p;

  IF nullif(btrim(coalesce(v_order.supplier_name,'')),'') IS NOT NULL THEN
    INSERT INTO public.suppliers(name,company_id)
    VALUES (btrim(v_order.supplier_name),v_company)
    ON CONFLICT (name,company_id) DO UPDATE SET updated_at=now()
    RETURNING id INTO v_supplier_uuid;
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi
    FROM public.purchase_order_items
    WHERE id=(v_item->>'order_item_id')::uuid AND order_id=p_order_id
      AND company_id=v_company AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_ITEM_TENANT_MISMATCH'; END IF;
    IF (v_item->>'status') NOT IN ('RECEIVED','NOT_DELIVERED') THEN
      RAISE EXCEPTION 'INVALID_RECEIPT_STATUS';
    END IF;
    IF v_oi.received_status = 'RECEIVED' THEN CONTINUE; END IF;

    IF (v_item->>'status') = 'NOT_DELIVERED' THEN
      UPDATE public.purchase_order_items
      SET qty_received=0, received_status='NOT_DELIVERED',
          not_delivered_reason=coalesce(nullif(btrim(v_item->>'reason'),''),'Não entregue'),
          received_at=now(), received_by=v_caller, updated_at=now()
      WHERE id=v_oi.id AND company_id=v_company;
      v_items_not_delivered := v_items_not_delivered + 1;
      CONTINUE;
    END IF;

    v_qty_received := coalesce((v_item->>'qty_received')::numeric,0);
    IF v_qty_received <= 0 OR v_qty_received > v_oi.qty_requested THEN
      RAISE EXCEPTION 'INVALID_RECEIPT_QUANTITY: %', v_oi.name_snapshot;
    END IF;
    v_cost_purchase := coalesce((v_item->>'unit_cost')::numeric,v_oi.estimated_unit_value);
    IF v_cost_purchase < 0 THEN RAISE EXCEPTION 'INVALID_UNIT_COST'; END IF;
    v_qty_shortfall := v_oi.qty_requested-v_qty_received;

    UPDATE public.purchase_order_items
    SET qty_received=v_qty_received, estimated_unit_value=v_cost_purchase,
        received_status='RECEIVED', not_delivered_reason=NULL,
        received_at=now(), received_by=v_caller, updated_at=now()
    WHERE id=v_oi.id AND company_id=v_company;

    IF v_qty_shortfall > 0.001 THEN
      INSERT INTO public.purchase_order_items(
        order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,
        qty_requested,qty_received,received_status,not_delivered_reason,
        received_at,received_by,shopping_status,shopping_note,
        purchase_unit_snapshot,purchase_unit_cost_snapshot,conversion_factor_snapshot,company_id
      ) VALUES (
        p_order_id,v_oi.stock_item_id,v_oi.name_snapshot,v_oi.unit_snapshot,v_cost_purchase,
        v_qty_shortfall,0,'NOT_DELIVERED',
        format('Recebimento parcial. Previsto: %s %s; recebido: %s %s.',
          v_oi.qty_requested,v_oi.unit_snapshot,v_qty_received,v_oi.unit_snapshot),
        now(),v_caller,v_oi.shopping_status,v_oi.shopping_note,
        v_oi.purchase_unit_snapshot,v_cost_purchase,v_oi.conversion_factor_snapshot,v_company
      );
      v_items_not_delivered := v_items_not_delivered + 1;
    END IF;

    IF v_oi.stock_item_id IS NOT NULL THEN
      v_conv := coalesce(nullif(v_oi.conversion_factor_snapshot,0),1);
      v_qty_base := v_qty_received*v_conv;
      v_cost_base := v_cost_purchase/v_conv;
      v_ref_id := 'POI:'||v_oi.id::text;
      INSERT INTO public.movimentacoes_estoque(
        produto_id,data,tipo,direction,quantidade,custo_unitario,custo_total,
        origem,observacao,created_by,status,reference_type,reference_id,
        internal_transfer,source_module,company_id
      ) VALUES (
        v_oi.stock_item_id,current_date,'ENTRADA','IN',v_qty_base,round(v_cost_base,4),
        round(v_qty_base*v_cost_base,2),'Recebimento Pedido/Compra',
        format('Recebimento atômico — Pedido %s Item %s',p_order_id,v_oi.name_snapshot),
        v_caller,'ATIVO','PURCHASE_ORDER_ITEM',v_ref_id,false,'purchases',v_company
      ) ON CONFLICT DO NOTHING;

      UPDATE public.produtos
      SET last_cost_purchase_unit=v_cost_purchase,last_cost_base_unit=round(v_cost_base,4),
          last_purchase_date=current_date::text,last_supplier=v_order.supplier_name
      WHERE id=v_oi.stock_item_id AND company_id=v_company;

      IF v_supplier_uuid IS NOT NULL THEN
        INSERT INTO public.supplier_item_prices(
          supplier_id,supplier_uuid,stock_item_id,unit_cost,purchase_unit,company_id,source,last_updated_at
        ) VALUES (
          v_order.supplier_name,v_supplier_uuid,v_oi.stock_item_id,v_cost_purchase,
          coalesce(v_oi.purchase_unit_snapshot,v_oi.unit_snapshot),v_company,'purchases',now()
        ) ON CONFLICT (supplier_id,stock_item_id,company_id) DO UPDATE SET
          supplier_uuid=excluded.supplier_uuid,unit_cost=excluded.unit_cost,
          purchase_unit=excluded.purchase_unit,source=excluded.source,last_updated_at=excluded.last_updated_at;
      END IF;
    END IF;
    v_items_received := v_items_received+1;
  END LOOP;

  IF EXISTS (SELECT 1 FROM public.purchase_order_items
    WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL AND received_status='PENDING') THEN
    v_new_status := 'IN_RECEIVING';
  ELSIF EXISTS (SELECT 1 FROM public.purchase_order_items
    WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL AND received_status='NOT_DELIVERED') THEN
    v_new_status := 'PARTIAL';
  ELSE v_new_status := 'COMPLETED'; END IF;

  SELECT coalesce(sum(qty_received*estimated_unit_value),0)
  INTO v_total_confirmed
  FROM public.purchase_order_items
  WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL
    AND received_status='RECEIVED';

  UPDATE public.purchase_orders
  SET status=v_new_status,total_confirmed=v_total_confirmed,
      concluded_at=CASE WHEN v_new_status='COMPLETED' THEN coalesce(concluded_at,now()) ELSE NULL END,
      updated_at=now()
  WHERE id=p_order_id AND company_id=v_company;

  IF v_new_status='PARTIAL' AND NOT EXISTS (
    SELECT 1 FROM public.notifications WHERE company_id=v_company
      AND recipient_user_id=v_order.created_by AND entity_type='purchase_order'
      AND entity_id=p_order_id AND type='NOT_DELIVERED_ACK_REQUIRED' AND read_at IS NULL
  ) THEN
    INSERT INTO public.notifications(
      recipient_user_id,type,module,title,message,entity_type,entity_id,
      link_path,created_by,company_id
    ) VALUES (
      v_order.created_by,'NOT_DELIVERED_ACK_REQUIRED','purchases','Confirmação necessária',
      format('Há itens não entregues no pedido "%s". Confirme ciência.',v_order.title),
      'purchase_order',p_order_id,'/compras',v_caller,v_company
    );
  END IF;

  v_response := jsonb_build_object(
    'status',v_new_status,'items_received',v_items_received,
    'items_not_delivered',v_items_not_delivered,'total_confirmed',v_total_confirmed,
    'idempotent',false
  );
  INSERT INTO public.purchase_receipt_batches(company_id,order_id,idempotency_key,response,created_by)
  VALUES (v_company,p_order_id,v_batch_key,v_response,v_caller);
  PERFORM public.log_audit('rpc','purchases','purchase_orders',p_order_id,
    'RECEBIMENTO_ATOMICO',to_jsonb(v_order),v_response);
  RETURN v_response;
END $$;
REVOKE ALL ON FUNCTION public.receive_purchase_order_atomic(uuid,jsonb,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_purchase_order_atomic(uuid,jsonb,jsonb) TO authenticated;

-- Serialize the first create for an idempotency key. A concurrent retry waits
-- and then returns the winning order instead of surfacing SQLSTATE 23505.
CREATE OR REPLACE FUNCTION public.create_purchase_order_atomic(
  p_payload jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.assert_tenant();
  v_order_id uuid;
  v_title text;
  v_type text;
  v_status text;
  v_total numeric := 0;
  v_item jsonb;
  v_is_mercado boolean;
  v_shopping_status text;
  v_responsible uuid;
  v_sender_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_idempotency_key IS NULL THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED'; END IF;
  IF NOT public.has_any_permission(v_user,ARRAY[
    'compras:pedidos:create','compras:lista:create','purchases:create',
    'compras:write','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:pedidos:create' USING ERRCODE='42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtextextended(v_company::text||':'||p_idempotency_key::text,0));
  SELECT id INTO v_order_id FROM public.purchase_orders
  WHERE company_id=v_company AND idempotency_key=p_idempotency_key;
  IF FOUND THEN RETURN jsonb_build_object('status','idempotent','order_id',v_order_id); END IF;

  v_title := btrim(p_payload->>'title');
  v_type := p_payload->>'type';
  IF v_title='' OR v_type NOT IN ('FORNECEDOR','MERCADO','SAZONAL')
     OR jsonb_typeof(p_payload->'items') <> 'array'
     OR jsonb_array_length(p_payload->'items')=0 THEN
    RAISE EXCEPTION 'INVALID_PURCHASE_ORDER';
  END IF;
  v_is_mercado := v_type IN ('MERCADO','SAZONAL');
  v_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OPEN' END;
  v_shopping_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END;
  v_responsible := nullif(p_payload->>'responsible_user_id','')::uuid;
  IF v_responsible IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_memberships
    WHERE user_id=v_responsible AND company_id=v_company AND status='active'
  ) THEN
    RAISE EXCEPTION 'RESPONSIBLE_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items')
  LOOP
    IF coalesce((v_item->>'qty_requested')::numeric,0) <= 0
       OR coalesce((v_item->>'estimated_unit_value')::numeric,0) < 0 THEN
      RAISE EXCEPTION 'INVALID_PURCHASE_ORDER_ITEM';
    END IF;
    IF nullif(v_item->>'stock_item_id','') IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.produtos
      WHERE id=(v_item->>'stock_item_id')::uuid AND company_id=v_company AND ativo=true
    ) THEN
      RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501';
    END IF;
    v_total := v_total+(v_item->>'qty_requested')::numeric*(v_item->>'estimated_unit_value')::numeric;
  END LOOP;

  INSERT INTO public.purchase_orders(
    title,type,priority,category,supplier_name,payment_type,need_by_date,
    delivery_forecast_date,responsible_user_id,notes,status,total_estimated,
    created_by,company_id,idempotency_key,origin,origin_ref
  ) VALUES (
    v_title,v_type,coalesce(p_payload->>'priority','MEDIA'),coalesce(p_payload->>'category',''),
    nullif(p_payload->>'supplier_name',''),nullif(p_payload->>'payment_type',''),
    nullif(p_payload->>'need_by_date','')::date,nullif(p_payload->>'delivery_forecast_date','')::date,
    v_responsible,coalesce(p_payload->>'notes',''),
    v_status,v_total,v_user,v_company,p_idempotency_key,
    coalesce(nullif(p_payload->>'origin',''),'MANUAL'),nullif(p_payload->>'origin_ref','')
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.purchase_order_items(
    order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,
    qty_requested,purchase_unit_snapshot,purchase_unit_cost_snapshot,
    conversion_factor_snapshot,shopping_status,company_id
  )
  SELECT v_order_id,nullif(item->>'stock_item_id','')::uuid,item->>'name_snapshot',
    item->>'unit_snapshot',(item->>'estimated_unit_value')::numeric,
    (item->>'qty_requested')::numeric,
    coalesce(nullif(item->>'purchase_unit_snapshot',''),item->>'unit_snapshot'),
    coalesce((item->>'purchase_unit_cost_snapshot')::numeric,(item->>'estimated_unit_value')::numeric),
    coalesce((item->>'conversion_factor_snapshot')::numeric,1),v_shopping_status,v_company
  FROM jsonb_array_elements(p_payload->'items') item;

  IF v_responsible IS NOT NULL AND v_responsible<>v_user THEN
    SELECT coalesce(nullif(nome,''),'Alguém') INTO v_sender_name
    FROM public.profiles WHERE id=v_user;
    INSERT INTO public.notifications(
      recipient_user_id,type,module,title,message,entity_type,entity_id,
      link_path,created_by,company_id
    ) VALUES (
      v_responsible,'MENTION','purchases',
      CASE WHEN v_is_mercado THEN 'Checklist de compra atribuído a você'
           ELSE 'Você foi mencionado em um pedido/compra' END,
      '@'||coalesce(v_sender_name,'Alguém')||' atribuiu você como responsável: "'||v_title||'"',
      'purchase_order',v_order_id,
      '/compras?subtab=pedidos-compras&order='||v_order_id::text,v_user,v_company
    );
  END IF;

  PERFORM public.log_audit('rpc','purchases','purchase_orders',v_order_id,
    'CREATE',NULL,jsonb_build_object('total_estimated',v_total,'idempotency_key',p_idempotency_key));
  RETURN jsonb_build_object('status','created','order_id',v_order_id);
END $$;
REVOKE ALL ON FUNCTION public.create_purchase_order_atomic(jsonb,uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_purchase_order_atomic(jsonb,uuid) TO authenticated;

-- Keep assignment notification, item replacement and order changes in the same
-- transaction. A failed notification/audit must roll the edit back.
CREATE OR REPLACE FUNCTION public.edit_purchase_order_atomic(
  p_order_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.assert_tenant();
  v_order public.purchase_orders%ROWTYPE;
  v_item jsonb;
  v_type text;
  v_title text;
  v_is_mercado boolean;
  v_total numeric := 0;
  v_responsible uuid;
  v_sender_name text;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_user,ARRAY[
    'compras:pedidos:edit','compras:lista:edit','purchases:edit',
    'purchases:market:edit','compras:write','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:pedidos:edit' USING ERRCODE='42501';
  END IF;

  SELECT * INTO v_order FROM public.purchase_orders
  WHERE id=p_order_id AND company_id=v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  v_title := coalesce(nullif(btrim(p_payload->>'title'),''),v_order.title);
  v_type := coalesce(nullif(p_payload->>'type',''),v_order.type::text);
  IF v_type NOT IN ('FORNECEDOR','MERCADO','SAZONAL') THEN
    RAISE EXCEPTION 'INVALID_PURCHASE_ORDER';
  END IF;
  v_is_mercado := v_type IN ('MERCADO','SAZONAL');
  v_responsible := CASE WHEN p_payload ? 'responsible_user_id'
    THEN nullif(p_payload->>'responsible_user_id','')::uuid
    ELSE v_order.responsible_user_id END;
  IF v_responsible IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.company_memberships
    WHERE user_id=v_responsible AND company_id=v_company AND status='active'
  ) THEN
    RAISE EXCEPTION 'RESPONSIBLE_TENANT_MISMATCH' USING ERRCODE='42501';
  END IF;

  UPDATE public.purchase_orders SET
    title=v_title,type=v_type,
    priority=coalesce(nullif(p_payload->>'priority',''),priority),
    category=CASE WHEN p_payload ? 'category' THEN coalesce(p_payload->>'category','') ELSE category END,
    supplier_name=CASE WHEN p_payload ? 'supplier_name' THEN nullif(p_payload->>'supplier_name','') ELSE supplier_name END,
    payment_type=CASE WHEN p_payload ? 'payment_type' THEN nullif(p_payload->>'payment_type','') ELSE payment_type END,
    need_by_date=CASE WHEN p_payload ? 'need_by_date' THEN nullif(p_payload->>'need_by_date','')::date ELSE need_by_date END,
    delivery_forecast_date=CASE WHEN p_payload ? 'delivery_forecast_date' THEN nullif(p_payload->>'delivery_forecast_date','')::date ELSE delivery_forecast_date END,
    responsible_user_id=v_responsible,
    notes=CASE WHEN p_payload ? 'notes' THEN coalesce(p_payload->>'notes','') ELSE notes END,
    updated_at=now()
  WHERE id=p_order_id AND company_id=v_company;

  IF p_payload ? 'items' THEN
    IF jsonb_typeof(p_payload->'items') <> 'array'
       OR jsonb_array_length(p_payload->'items')=0 THEN
      RAISE EXCEPTION 'INVALID_PURCHASE_ORDER_ITEMS';
    END IF;
    FOR v_item IN SELECT value FROM jsonb_array_elements(p_payload->'items')
    LOOP
      IF coalesce((v_item->>'qty_requested')::numeric,0)<=0
         OR coalesce((v_item->>'estimated_unit_value')::numeric,0)<0 THEN
        RAISE EXCEPTION 'INVALID_PURCHASE_ORDER_ITEM';
      END IF;
      IF nullif(v_item->>'stock_item_id','') IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM public.produtos
        WHERE id=(v_item->>'stock_item_id')::uuid AND company_id=v_company AND ativo=true
      ) THEN
        RAISE EXCEPTION 'PRODUCT_TENANT_MISMATCH' USING ERRCODE='42501';
      END IF;
    END LOOP;

    UPDATE public.purchase_order_items SET deleted_at=now(),deleted_by=v_user
    WHERE order_id=p_order_id AND company_id=v_company
      AND received_status='PENDING' AND shopping_status='PENDING' AND deleted_at IS NULL;

    INSERT INTO public.purchase_order_items(
      order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,
      qty_requested,purchase_unit_snapshot,purchase_unit_cost_snapshot,
      conversion_factor_snapshot,shopping_status,company_id
    )
    SELECT p_order_id,nullif(item->>'stock_item_id','')::uuid,item->>'name_snapshot',
      item->>'unit_snapshot',(item->>'estimated_unit_value')::numeric,
      (item->>'qty_requested')::numeric,
      coalesce(nullif(item->>'purchase_unit_snapshot',''),item->>'unit_snapshot'),
      coalesce((item->>'purchase_unit_cost_snapshot')::numeric,(item->>'estimated_unit_value')::numeric),
      coalesce((item->>'conversion_factor_snapshot')::numeric,1),
      CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END,v_company
    FROM jsonb_array_elements(p_payload->'items') item;

    SELECT coalesce(sum(qty_requested*estimated_unit_value),0) INTO v_total
    FROM public.purchase_order_items
    WHERE order_id=p_order_id AND company_id=v_company AND deleted_at IS NULL;
    UPDATE public.purchase_orders SET total_estimated=v_total
    WHERE id=p_order_id AND company_id=v_company;
  END IF;

  IF v_responsible IS NOT NULL AND v_responsible<>v_user
     AND v_responsible IS DISTINCT FROM v_order.responsible_user_id THEN
    SELECT coalesce(nullif(nome,''),'Alguém') INTO v_sender_name
    FROM public.profiles WHERE id=v_user;
    INSERT INTO public.notifications(
      recipient_user_id,type,module,title,message,entity_type,entity_id,
      link_path,created_by,company_id
    ) VALUES (
      v_responsible,'MENTION','purchases','Você foi mencionado em um pedido/compra',
      '@'||coalesce(v_sender_name,'Alguém')||' atualizou e atribuiu você como responsável: "'||v_title||'"',
      'purchase_order',p_order_id,
      '/compras?subtab=pedidos-compras&order='||p_order_id::text,v_user,v_company
    );
  END IF;

  PERFORM public.log_audit('rpc','purchases','purchase_orders',p_order_id,
    'EDIT',to_jsonb(v_order),jsonb_build_object('title',v_title,'responsible_user_id',v_responsible));
  RETURN jsonb_build_object('status','updated','order_id',p_order_id);
END $$;
REVOKE ALL ON FUNCTION public.edit_purchase_order_atomic(uuid,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.edit_purchase_order_atomic(uuid,jsonb) TO authenticated;

-- Concurrent conversion is a successful replay, not a 23505/status error. Each
-- supplier order gets a deterministic tenant-scoped idempotency key.
CREATE OR REPLACE FUNCTION public.create_purchase_orders_from_cotacao_atomic(
  p_cotacao_id uuid,
  p_expected_updated_at timestamptz DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_company uuid := public.assert_tenant();
  v_user uuid := auth.uid();
  v_cot record;
  v_forn record;
  v_order_id uuid;
  v_order_key uuid;
  v_total numeric;
  v_items int;
  v_orders int := 0;
  v_total_items int := 0;
  v_order_ids uuid[] := '{}';
  v_sel_count int;
  v_created boolean;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_user,ARRAY[
    'compras:cotacao:close','compras:cotacao:manage','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:cotacao:close' USING ERRCODE='42501';
  END IF;

  SELECT id,codigo,titulo,status,updated_at INTO v_cot
  FROM public.cotacoes
  WHERE id=p_cotacao_id AND company_id=v_company AND deleted_at IS NULL
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  IF v_cot.status='CONVERTIDA' THEN
    SELECT coalesce(array_agg(id ORDER BY created_at),'{}'::uuid[]),count(*)
      INTO v_order_ids,v_orders
    FROM public.purchase_orders
    WHERE company_id=v_company AND origin='COTACAO'
      AND origin_ref=p_cotacao_id::text AND deleted_at IS NULL;
    SELECT count(*) INTO v_total_items
    FROM public.purchase_order_items i
    JOIN public.purchase_orders o ON o.id=i.order_id AND o.company_id=i.company_id
    WHERE o.company_id=v_company AND o.origin='COTACAO'
      AND o.origin_ref=p_cotacao_id::text AND o.deleted_at IS NULL
      AND i.deleted_at IS NULL;
    RETURN jsonb_build_object('success',true,'idempotent',true,
      'orders',v_orders,'items',v_total_items,'order_ids',to_jsonb(v_order_ids));
  END IF;
  IF v_cot.status IN ('CANCELADA','ENCERRADA') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: % (cotação encerrada)',v_cot.status;
  END IF;
  IF p_expected_updated_at IS NOT NULL AND v_cot.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  SELECT count(*) INTO v_sel_count
  FROM public.cotacao_respostas r
  JOIN public.cotacao_fornecedores f
    ON f.id=r.cotacao_fornecedor_id AND f.company_id=r.company_id
  WHERE f.cotacao_id=p_cotacao_id AND f.company_id=v_company
    AND r.selecionado=true AND r.disponivel=true AND r.preco_unitario IS NOT NULL;
  IF v_sel_count=0 THEN
    RAISE EXCEPTION 'VALIDATION: nenhuma resposta selecionada — gere e salve a sugestão antes de converter';
  END IF;

  FOR v_forn IN
    SELECT f.id,f.supplier_nome_snapshot,f.condicao_pagamento
    FROM public.cotacao_fornecedores f
    WHERE f.cotacao_id=p_cotacao_id AND f.company_id=v_company
      AND EXISTS (
        SELECT 1 FROM public.cotacao_respostas r
        WHERE r.cotacao_fornecedor_id=f.id AND r.company_id=v_company
          AND r.selecionado=true AND r.disponivel=true AND r.preco_unitario IS NOT NULL
      )
    ORDER BY f.id
  LOOP
    SELECT coalesce(sum(r.preco_unitario*i.quantidade),0) INTO v_total
    FROM public.cotacao_respostas r
    JOIN public.cotacao_itens i
      ON i.id=r.cotacao_item_id AND i.company_id=r.company_id
    WHERE r.cotacao_fornecedor_id=v_forn.id AND r.company_id=v_company
      AND r.selecionado=true AND r.disponivel=true AND r.preco_unitario IS NOT NULL;

    v_order_key := md5('cotacao-order:'||v_company::text||':'||p_cotacao_id::text||':'||v_forn.id::text)::uuid;
    v_order_id := NULL;
    INSERT INTO public.purchase_orders(
      title,type,priority,category,supplier_name,payment_type,notes,status,
      total_estimated,created_by,company_id,idempotency_key,origin,origin_ref
    ) VALUES (
      v_cot.codigo||' — '||v_forn.supplier_nome_snapshot,'FORNECEDOR','MEDIA','',
      v_forn.supplier_nome_snapshot,nullif(btrim(coalesce(v_forn.condicao_pagamento,'')),''),
      'Gerado da cotação '||v_cot.codigo||' ('||v_cot.titulo||')','OPEN',
      v_total,v_user,v_company,v_order_key,'COTACAO',p_cotacao_id::text
    )
    ON CONFLICT (company_id,idempotency_key) WHERE idempotency_key IS NOT NULL DO NOTHING
    RETURNING id INTO v_order_id;
    v_created := v_order_id IS NOT NULL;
    IF NOT v_created THEN
      SELECT id INTO v_order_id FROM public.purchase_orders
      WHERE company_id=v_company AND idempotency_key=v_order_key;
    END IF;
    IF v_order_id IS NULL THEN RAISE EXCEPTION 'COTACAO_ORDER_IDEMPOTENCY_FAILED'; END IF;

    IF v_created THEN
      INSERT INTO public.purchase_order_items(
        order_id,stock_item_id,name_snapshot,unit_snapshot,estimated_unit_value,
        qty_requested,purchase_unit_snapshot,purchase_unit_cost_snapshot,
        conversion_factor_snapshot,shopping_status,company_id
      )
      SELECT v_order_id,i.produto_id,i.produto_nome_snapshot,
        coalesce(nullif(i.unidade_snapshot,''),'UN'),r.preco_unitario,i.quantidade,
        coalesce(nullif(i.purchase_unit_snapshot,''),nullif(i.unidade_snapshot,''),'UN'),
        r.preco_unitario,coalesce(i.conversion_factor_snapshot,1),'OK',v_company
      FROM public.cotacao_respostas r
      JOIN public.cotacao_itens i
        ON i.id=r.cotacao_item_id AND i.company_id=r.company_id
      WHERE r.cotacao_fornecedor_id=v_forn.id AND r.company_id=v_company
        AND r.selecionado=true AND r.disponivel=true AND r.preco_unitario IS NOT NULL;
      GET DIAGNOSTICS v_items=ROW_COUNT;
      INSERT INTO public.audit_log(tabela,registro_id,acao,user_id)
      VALUES ('purchase_orders',v_order_id,'CRIACAO',v_user);
    ELSE
      SELECT count(*) INTO v_items FROM public.purchase_order_items
      WHERE order_id=v_order_id AND company_id=v_company AND deleted_at IS NULL;
    END IF;
    v_total_items := v_total_items+v_items;
    v_orders := v_orders+1;
    v_order_ids := array_append(v_order_ids,v_order_id);
    UPDATE public.cotacao_fornecedores SET status='FECHADO'
    WHERE id=v_forn.id AND company_id=v_company;
  END LOOP;

  UPDATE public.cotacoes SET status='CONVERTIDA'
  WHERE id=p_cotacao_id AND company_id=v_company;
  UPDATE public.cotacao_sugestoes s
  SET dados_json=coalesce(s.dados_json,'{}'::jsonb)
    ||jsonb_build_object('generated_order_ids',to_jsonb(v_order_ids))
  WHERE s.id=(SELECT id FROM public.cotacao_sugestoes
    WHERE cotacao_id=p_cotacao_id AND company_id=v_company
    ORDER BY created_at DESC LIMIT 1);

  RETURN jsonb_build_object('success',true,'idempotent',false,
    'orders',v_orders,'items',v_total_items,'order_ids',to_jsonb(v_order_ids));
END $$;
REVOKE ALL ON FUNCTION public.create_purchase_orders_from_cotacao_atomic(uuid,timestamptz)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.create_purchase_orders_from_cotacao_atomic(uuid,timestamptz) TO authenticated;

-- -------------------------------------------------------------------------
-- RH batch persistence and audit are a single transaction.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.replace_rh_banco_horas_period_atomic(
  p_periodo text,
  p_rows jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_row jsonb;
  v_count int := 0;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF p_periodo !~ '^20[0-9]{2}-(0[1-9]|1[0-2])$' THEN RAISE EXCEPTION 'INVALID_PERIOD'; END IF;
  IF jsonb_typeof(p_rows) <> 'array' THEN RAISE EXCEPTION 'INVALID_ROWS'; END IF;
  IF NOT public.has_any_permission(v_uid,ARRAY[
    'rh:banco-horas:reconcile','rh:banco-horas:manage','rh:manage','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: rh:banco-horas:reconcile' USING ERRCODE='42501';
  END IF;

  FOR v_row IN SELECT value FROM jsonb_array_elements(p_rows)
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM public.rh_colaboradores
      WHERE id=(v_row->>'colaborador_id')::uuid AND company_id=v_cid AND status='ativo'
    ) THEN
      RAISE EXCEPTION 'COLLABORATOR_TENANT_MISMATCH';
    END IF;
    INSERT INTO public.rh_banco_horas(
      colaborador_id,company_id,periodo,horas_trabalhadas,horas_escaladas,
      horas_extras,banco_horas_saldo,atrasos_min,faltas,dias_trabalhados,
      calculado_por,calculado_em,updated_at
    ) VALUES (
      (v_row->>'colaborador_id')::uuid,v_cid,p_periodo,
      coalesce((v_row->>'horas_trabalhadas')::numeric,0),
      coalesce((v_row->>'horas_escaladas')::numeric,0),
      coalesce((v_row->>'horas_extras')::numeric,0),
      coalesce((v_row->>'banco_horas_saldo')::numeric,0),
      coalesce((v_row->>'atrasos_min')::numeric,0),
      coalesce((v_row->>'faltas')::integer,0),
      coalesce((v_row->>'dias_trabalhados')::integer,0),v_uid,now(),now()
    ) ON CONFLICT (colaborador_id,periodo) DO UPDATE SET
      company_id=excluded.company_id,horas_trabalhadas=excluded.horas_trabalhadas,
      horas_escaladas=excluded.horas_escaladas,horas_extras=excluded.horas_extras,
      banco_horas_saldo=excluded.banco_horas_saldo,atrasos_min=excluded.atrasos_min,
      faltas=excluded.faltas,dias_trabalhados=excluded.dias_trabalhados,
      calculado_por=excluded.calculado_por,calculado_em=excluded.calculado_em,
      updated_at=excluded.updated_at;
    v_count := v_count+1;
  END LOOP;

  INSERT INTO public.rh_audit_log(acao,entidade,company_id,depois,user_id)
  VALUES ('calcular_banco_horas','banco_horas',v_cid,
    jsonb_build_object('periodo',p_periodo,'resultados',v_count),v_uid);
  RETURN jsonb_build_object('success',true,'persisted',v_count);
END $$;
REVOKE ALL ON FUNCTION public.replace_rh_banco_horas_period_atomic(text,jsonb)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.replace_rh_banco_horas_period_atomic(text,jsonb) TO authenticated;

-- -------------------------------------------------------------------------
-- Purchase reversal and soft-delete are one transaction.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.storno_purchase_order_stock(p_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid := public.assert_tenant();
  v_mov public.movimentacoes_estoque%ROWTYPE;
  v_count int := 0;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_user,ARRAY[
    'compras:pedidos:delete','compras:lista:delete','estoque:movimentacoes:cancel',
    'purchases:delete','stock:movements:cancel','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:pedidos:delete' USING ERRCODE='42501';
  END IF;
  PERFORM 1 FROM public.purchase_orders
  WHERE id=p_order_id AND company_id=v_company AND deleted_at IS NULL FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  FOR v_mov IN
    SELECT m.* FROM public.movimentacoes_estoque m
    WHERE m.company_id=v_company AND m.status='ATIVO'
      AND m.estorno_de_id IS NULL
      AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
      AND (
        (m.reference_type='PURCHASE_ORDER' AND m.reference_id=p_order_id::text)
        OR (m.reference_type='PURCHASE_ORDER_ITEM' AND EXISTS (
          SELECT 1 FROM public.purchase_order_items i
          WHERE i.order_id=p_order_id AND i.company_id=v_company
            AND m.reference_id='POI:'||i.id::text
        ))
      )
    ORDER BY m.id FOR UPDATE
  LOOP
    INSERT INTO public.movimentacoes_estoque(
      produto_id,data,tipo,direction,quantidade,custo_unitario,custo_total,
      origem,referencia_id,observacao,created_by,status,estorno_de_id,setor,
      reference_type,reference_id,internal_transfer,source_module,company_id
    ) VALUES (
      v_mov.produto_id,current_date,
      CASE WHEN coalesce(v_mov.direction,'IN')='IN' THEN 'ENTRADA_ESTORNO' ELSE 'SAIDA_ESTORNO' END,
      CASE WHEN coalesce(v_mov.direction,'IN')='IN' THEN 'OUT' ELSE 'IN' END,
      v_mov.quantidade,v_mov.custo_unitario,v_mov.custo_total,'ESTORNO',v_mov.id::text,
      'Estorno automático — exclusão pedido '||p_order_id::text,v_user,'ATIVO',v_mov.id,v_mov.setor,
      v_mov.reference_type,coalesce(v_mov.reference_id,v_mov.id::text)||'_ESTORNO',
      false,'purchases',v_company
    );
    UPDATE public.movimentacoes_estoque
    SET status='CANCELADO',cancelado_em=now(),cancelado_por=v_user,
        justificativa_cancelamento='Exclusão de pedido de compra'
    WHERE id=v_mov.id AND company_id=v_company;
    v_count := v_count+1;
  END LOOP;

  PERFORM public.log_audit('rpc','purchases','purchase_orders',p_order_id,
    'STORNO',NULL,jsonb_build_object('movimentacoes_estornadas',v_count));
END $$;
REVOKE ALL ON FUNCTION public.storno_purchase_order_stock(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.storno_purchase_order_stock(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.delete_purchase_order_atomic(p_order_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_cid uuid := public.assert_tenant();
  v_before jsonb;
  v_reversed int;
BEGIN
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED' USING ERRCODE='42501'; END IF;
  IF NOT public.has_any_permission(v_uid,ARRAY[
    'compras:pedidos:delete','compras:lista:delete','purchases:delete','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: compras:pedidos:delete' USING ERRCODE='42501';
  END IF;
  SELECT to_jsonb(o) INTO v_before FROM public.purchase_orders o
  WHERE o.id=p_order_id AND o.company_id=v_cid AND o.deleted_at IS NULL FOR UPDATE;
  IF v_before IS NULL THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT count(*) INTO v_reversed
  FROM public.movimentacoes_estoque m
  WHERE m.company_id=v_cid AND m.status='ATIVO' AND m.estorno_de_id IS NULL
    AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
    AND (m.reference_type='PURCHASE_ORDER' AND m.reference_id=p_order_id::text
      OR m.reference_type='PURCHASE_ORDER_ITEM' AND EXISTS (
        SELECT 1 FROM public.purchase_order_items i
        WHERE i.order_id=p_order_id AND i.company_id=v_cid AND m.reference_id='POI:'||i.id::text
      ));
  PERFORM public.storno_purchase_order_stock(p_order_id);

  UPDATE public.purchase_order_items
  SET deleted_at=now(),deleted_by=v_uid,updated_at=now()
  WHERE order_id=p_order_id AND company_id=v_cid AND deleted_at IS NULL;
  UPDATE public.purchase_orders
  SET deleted_at=now(),deleted_by=v_uid,status='CANCELLED',updated_at=now()
  WHERE id=p_order_id AND company_id=v_cid;
  PERFORM public.log_audit('rpc','purchases','purchase_orders',p_order_id,
    'DELETE',v_before,jsonb_build_object('status','CANCELLED','reversed_count',v_reversed));
  RETURN jsonb_build_object('success',true,'reversed_count',v_reversed);
END $$;
REVOKE ALL ON FUNCTION public.delete_purchase_order_atomic(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_purchase_order_atomic(uuid) TO authenticated;

-- -------------------------------------------------------------------------
-- Reader contracts: explicit tenant + RBAC + narrow EXECUTE grants.
-- -------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_catalog_counts()
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_cid uuid := public.assert_tenant(); v_total int; v_active int; v_inactive int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'estoque:catalogo:view','estoque:cadastros:view','stock:read','system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: estoque:catalogo:view' USING ERRCODE='42501'; END IF;
  SELECT count(*)::int,count(*) FILTER(WHERE ativo)::int,count(*) FILTER(WHERE NOT ativo)::int
  INTO v_total,v_active,v_inactive FROM public.produtos WHERE company_id=v_cid;
  RETURN json_build_object('total',v_total,'active',v_active,'inactive',v_inactive);
END $$;
REVOKE ALL ON FUNCTION public.get_catalog_counts() FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_catalog_counts() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_saldo_produtos(p_produto_ids uuid[])
RETURNS TABLE(produto_id uuid, saldo numeric)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_cid uuid := public.assert_tenant();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'estoque:saldo:view','estoque:catalogo:view','estoque:movimentacoes:view',
    'inventario:rapido:view','inventario:rapido:create','stock:read','inventory:read',
    'system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: estoque:saldo:view' USING ERRCODE='42501'; END IF;
  RETURN QUERY SELECT p.id,p.saldo_atual FROM public.produtos p
  WHERE p.company_id=v_cid AND p.id=ANY(p_produto_ids);
END $$;
REVOKE ALL ON FUNCTION public.get_saldo_produtos(uuid[]) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_saldo_produtos(uuid[]) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_saldo_conta(p_conta_id uuid)
RETURNS numeric
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_saldo numeric; v_cid uuid := public.assert_tenant();
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'financeiro:contas:view','financeiro:dashboard:view','financeiro:conciliacao:view',
    'finance:read','system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:contas:view' USING ERRCODE='42501'; END IF;
  SELECT saldo_inicial INTO v_saldo FROM public.fin_contas
  WHERE id=p_conta_id AND company_id=v_cid;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  SELECT coalesce(v_saldo,0)+coalesce(sum(CASE
    WHEN tipo='TRANSFERENCIA' AND conta_id=p_conta_id THEN -valor
    WHEN tipo='TRANSFERENCIA' AND conta_destino_id=p_conta_id THEN valor
    WHEN tipo='RECEITA' AND conta_id=p_conta_id THEN valor
    WHEN tipo='DESPESA' AND conta_id=p_conta_id THEN -valor ELSE 0 END),0)
  INTO v_saldo FROM public.fin_lancamentos
  WHERE company_id=v_cid AND status='REALIZADO'
    AND (conta_id=p_conta_id OR conta_destino_id=p_conta_id);
  RETURN round(v_saldo,2);
END $$;
REVOKE ALL ON FUNCTION public.get_saldo_conta(uuid) FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_saldo_conta(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.count_requisicoes_with_pending_items()
RETURNS integer
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_cid uuid := public.assert_tenant(); v_count int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'estoque:requisicoes:view','stock:requisitions:read','stock:read','system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: estoque:requisicoes:view' USING ERRCODE='42501'; END IF;
  SELECT count(DISTINCT r.id)::int INTO v_count
  FROM public.requisicoes_estoque r
  JOIN public.requisicao_estoque_itens i
    ON i.requisicao_id=r.id AND i.company_id=r.company_id
  WHERE r.company_id=v_cid AND r.status IN ('SOLICITADA','PARCIALMENTE_ATENDIDA')
    AND i.status='SOLICITADO';
  RETURN coalesce(v_count,0);
END $$;
REVOKE ALL ON FUNCTION public.count_requisicoes_with_pending_items()
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.count_requisicoes_with_pending_items() TO authenticated;

CREATE OR REPLACE FUNCTION public.compute_requisicao_status_agregado(p_requisicao_id uuid)
RETURNS text
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE v_cid uuid := public.assert_tenant(); v_total int; v_atendidos int; v_recusados int; v_solicitados int;
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'estoque:requisicoes:view','estoque:requisicoes:approve','estoque:requisicoes:close',
    'stock:requisitions:read','stock:read','system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: estoque:requisicoes:view' USING ERRCODE='42501'; END IF;
  IF NOT EXISTS(SELECT 1 FROM public.requisicoes_estoque
    WHERE id=p_requisicao_id AND company_id=v_cid) THEN RETURN NULL; END IF;
  SELECT count(*)::int,count(*) FILTER(WHERE status='ATENDIDO')::int,
    count(*) FILTER(WHERE status='RECUSADO')::int,count(*) FILTER(WHERE status='SOLICITADO')::int
  INTO v_total,v_atendidos,v_recusados,v_solicitados
  FROM public.requisicao_estoque_itens
  WHERE requisicao_id=p_requisicao_id AND company_id=v_cid;
  IF v_total=0 THEN RETURN 'SOLICITADA'; END IF;
  IF v_recusados=v_total THEN RETURN 'NEGADA'; END IF;
  IF v_atendidos=v_total THEN RETURN 'ATENDIDA'; END IF;
  IF v_atendidos>0 THEN RETURN 'PARCIALMENTE_ATENDIDA'; END IF;
  RETURN 'SOLICITADA';
END $$;
REVOKE ALL ON FUNCTION public.compute_requisicao_status_agregado(uuid)
  FROM PUBLIC, anon, authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_requisicao_status_agregado(uuid) TO authenticated;

ALTER FUNCTION public.get_stock_consumption_history(date,date,text,uuid,text)
  RENAME TO _stabilization_stock_consumption_history_inner;
REVOKE ALL ON FUNCTION public._stabilization_stock_consumption_history_inner(date,date,text,uuid,text)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.get_stock_consumption_history(
  p_start date,p_end date,p_category text DEFAULT NULL,p_product_id uuid DEFAULT NULL,p_search text DEFAULT NULL
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'estoque:movimentacoes:view','estoque:dashboard:view','stock:read','system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: estoque:movimentacoes:view' USING ERRCODE='42501'; END IF;
  RETURN public._stabilization_stock_consumption_history_inner(p_start,p_end,p_category,p_product_id,p_search);
END $$;
REVOKE ALL ON FUNCTION public.get_stock_consumption_history(date,date,text,uuid,text)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_consumption_history(date,date,text,uuid,text) TO authenticated;

ALTER FUNCTION public.get_stock_predictive_analysis(text,uuid,integer,integer,boolean)
  RENAME TO _stabilization_stock_predictive_analysis_inner;
REVOKE ALL ON FUNCTION public._stabilization_stock_predictive_analysis_inner(text,uuid,integer,integer,boolean)
  FROM PUBLIC, anon, authenticated, service_role;
CREATE FUNCTION public.get_stock_predictive_analysis(
  p_category text DEFAULT NULL,p_product_id uuid DEFAULT NULL,
  p_window_days integer DEFAULT 30,p_horizon_days integer DEFAULT 30,p_only_active boolean DEFAULT true
)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $$ BEGIN
  PERFORM public.assert_tenant();
  IF auth.uid() IS NULL OR NOT public.has_any_permission(auth.uid(),ARRAY[
    'estoque:preditivo:view','estoque:dashboard:view','stock:read','system:global:manage'
  ]) THEN RAISE EXCEPTION 'PERMISSION_DENIED: estoque:preditivo:view' USING ERRCODE='42501'; END IF;
  RETURN public._stabilization_stock_predictive_analysis_inner(
    p_category,p_product_id,p_window_days,p_horizon_days,p_only_active);
END $$;
REVOKE ALL ON FUNCTION public.get_stock_predictive_analysis(text,uuid,integer,integer,boolean)
  FROM PUBLIC,anon,authenticated,service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_predictive_analysis(text,uuid,integer,integer,boolean) TO authenticated;

DROP FUNCTION IF EXISTS public.get_relatorios_kpis(text,text);
DROP FUNCTION IF EXISTS public.get_relatorios_score(text,text);
DROP FUNCTION IF EXISTS public.get_relatorios_tendencia(text,text);
DROP FUNCTION IF EXISTS public.simulate_relatorios_score(text,text,jsonb);
REVOKE ALL ON FUNCTION public.get_relatorios_kpis(date,date) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.get_relatorios_score(date,date) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.get_relatorios_tendencia(date,date) FROM PUBLIC,anon,service_role;
REVOKE ALL ON FUNCTION public.simulate_relatorios_score(date,date,jsonb) FROM PUBLIC,anon,service_role;
GRANT EXECUTE ON FUNCTION public.get_relatorios_kpis(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_relatorios_score(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_relatorios_tendencia(date,date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.simulate_relatorios_score(date,date,jsonb) TO authenticated;

-- Debug helpers are not Data API contracts.
DO $$ DECLARE r record;
BEGIN
  FOR r IN SELECT p.oid::regprocedure AS signature
    FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
    WHERE n.nspname='public' AND p.proname LIKE 'debug_%'
  LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon, authenticated, service_role',r.signature);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role',r.signature);
  END LOOP;
END $$;

-- Registry-aligned turno writers. Keep the hotfix SELECT policies untouched.
DROP POLICY IF EXISTS tenant_insert_turnos ON public.turnos;
DROP POLICY IF EXISTS tenant_update_turnos ON public.turnos;
DROP POLICY IF EXISTS tenant_delete_turnos ON public.turnos;
CREATE POLICY tenant_insert_turnos ON public.turnos FOR INSERT TO authenticated
WITH CHECK (
  company_id=(SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(),ARRAY[
    'configuracoes:geral:manage','settings:manage','system:global:manage'
  ]))
);
CREATE POLICY tenant_update_turnos ON public.turnos FOR UPDATE TO authenticated
USING (
  company_id=(SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(),ARRAY[
    'configuracoes:geral:manage','settings:manage','system:global:manage'
  ]))
)
WITH CHECK (company_id=(SELECT public.get_current_company_id()));
CREATE POLICY tenant_delete_turnos ON public.turnos FOR DELETE TO authenticated
USING (
  company_id=(SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(),ARRAY[
    'configuracoes:geral:manage','settings:manage','system:global:manage'
  ]))
);

-- Resolve newly referenced objects during migration execution.
DO $$ BEGIN
  PERFORM storage_state FROM public.rh_documentos LIMIT 0;
  PERFORM response FROM public.purchase_receipt_batches LIMIT 0;
  PERFORM saldo_atual FROM public.produtos LIMIT 0;
  PERFORM company_id,requisicao_id,produto_id FROM public.requisicao_estoque_itens LIMIT 0;
END $$;

NOTIFY pgrst,'reload schema';
COMMIT;

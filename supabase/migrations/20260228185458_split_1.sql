CREATE OR REPLACE FUNCTION public.receive_purchase_order_atomic(p_order_id uuid, p_items jsonb, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order RECORD;
  v_item jsonb;
  v_oi RECORD;
  v_conv numeric;
  v_qty_base numeric;
  v_cost_base numeric;
  v_mov_id uuid;
  v_items_received int := 0;
  v_items_not_delivered int := 0;
  v_total_confirmed numeric := 0;
  v_new_status text;
  v_ref_id text;
  v_caller uuid;
  v_supplier_uuid uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT has_permission(v_caller, 'purchases:receiving:manage') THEN
    RAISE EXCEPTION 'Sem permissão para receber pedidos (purchases:receiving:manage).';
  END IF;

  SELECT * INTO v_order FROM purchase_orders WHERE id = p_order_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Pedido não encontrado: %', p_order_id; END IF;
  IF v_order.status NOT IN ('IN_RECEIVING', 'OPEN', 'SHOPPING_OK', 'PARTIAL') THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_order.status;
  END IF;

  -- Resolve supplier UUID (ensure supplier exists)
  IF v_order.supplier_name IS NOT NULL AND v_order.supplier_name != '' THEN
    INSERT INTO suppliers (name) VALUES (v_order.supplier_name)
    ON CONFLICT (name) DO UPDATE SET updated_at = now()
    RETURNING id INTO v_supplier_uuid;
  END IF;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items)
  LOOP
    SELECT * INTO v_oi FROM purchase_order_items
    WHERE id = (v_item->>'order_item_id')::uuid AND order_id = p_order_id FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item % não pertence ao pedido %', v_item->>'order_item_id', p_order_id;
    END IF;

    IF (v_item->>'status') = 'NOT_DELIVERED' THEN
      UPDATE purchase_order_items SET
        received_status = 'NOT_DELIVERED',
        not_delivered_reason = COALESCE(v_item->>'reason', 'Não entregue'),
        received_at = now(), received_by = v_caller, updated_at = now()
      WHERE id = v_oi.id;
      v_items_not_delivered := v_items_not_delivered + 1;
    ELSE
      IF COALESCE((v_item->>'qty_received')::numeric, 0) <= 0 THEN
        RAISE EXCEPTION 'Quantidade deve ser > 0 para item %', v_oi.name_snapshot;
      END IF;

      UPDATE purchase_order_items SET
        qty_received = (v_item->>'qty_received')::numeric,
        received_status = 'RECEIVED', received_at = now(),
        received_by = v_caller, updated_at = now()
      WHERE id = v_oi.id;

      IF v_oi.stock_item_id IS NOT NULL THEN
        v_conv := COALESCE(v_oi.conversion_factor_snapshot, 1);
        v_qty_base := (v_item->>'qty_received')::numeric * v_conv;
        v_cost_base := CASE WHEN v_conv > 0
          THEN COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value) / v_conv
          ELSE COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value)
        END;

        v_ref_id := 'POI:' || v_oi.id::text;

        IF NOT EXISTS (
          SELECT 1 FROM movimentacoes_estoque
          WHERE reference_type = 'PURCHASE_ORDER_ITEM' AND reference_id = v_ref_id AND status = 'ATIVO'
        ) THEN
          INSERT INTO movimentacoes_estoque (
            produto_id, data, tipo, quantidade, custo_unitario, custo_total,
            origem, observacao, created_by, status,
            reference_type, reference_id, internal_transfer, source_module
          ) VALUES (
            v_oi.stock_item_id,
            COALESCE((v_item->>'movement_date')::date, CURRENT_DATE),
            'ENTRADA', v_qty_base, ROUND(v_cost_base::numeric, 4),
            ROUND((v_qty_base * v_cost_base)::numeric, 2),
            'Recebimento Pedido/Compra',
            'Recebimento atômico — Pedido ' || p_order_id::text || ' Item ' || v_oi.name_snapshot,
            v_caller, 'ATIVO', 'PURCHASE_ORDER_ITEM', v_ref_id, false, 'purchases'
          ) RETURNING id INTO v_mov_id;

          UPDATE produtos SET
            last_cost_purchase_unit = COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
            last_cost_base_unit = ROUND(v_cost_base::numeric, 4),
            last_purchase_date = CURRENT_DATE::text,
            last_supplier = v_order.supplier_name
          WHERE id = v_oi.stock_item_id;

          -- Upsert supplier_item_prices for ranking
          IF v_supplier_uuid IS NOT NULL AND v_oi.stock_item_id IS NOT NULL THEN
            INSERT INTO supplier_item_prices (supplier_id, supplier_uuid, stock_item_id, unit_cost, purchase_unit, last_updated_at, source)
            VALUES (
              v_order.supplier_name,
              v_supplier_uuid,
              v_oi.stock_item_id,
              COALESCE((v_item->>'unit_cost')::numeric, v_oi.estimated_unit_value),
              COALESCE(v_oi.purchase_unit_snapshot, v_oi.unit_snapshot),
              now(),
              'receiving'
            )
            ON CONFLICT (supplier_id, stock_item_id) DO UPDATE SET
              unit_cost = EXCLUDED.unit_cost,
              supplier_uuid = EXCLUDED.supplier_uuid,
              purchase_unit = EXCLUDED.purchase_unit,
              last_updated_at = EXCLUDED.last_updated_at,
              source = 'receiving';
          END IF;
        END IF;
      END IF;

      v_items_received := v_items_received + 1;
      v_total_confirmed := v_total_confirmed + (v_item->>'qty_received')::numeric * v_oi.estimated_unit_value;
    END IF;
  END LOOP;

  IF EXISTS (
    SELECT 1 FROM purchase_order_items WHERE order_id = p_order_id AND received_status = 'PENDING' AND shopping_status = 'OK'
  ) THEN
    v_new_status := 'IN_RECEIVING';
  ELSIF EXISTS (
    SELECT 1 FROM purchase_order_items WHERE order_id = p_order_id
      AND (received_status = 'NOT_DELIVERED' OR shopping_status = 'NOT_AVAILABLE')
  ) THEN
    v_new_status := 'PARTIAL';
  ELSE
    v_new_status := 'COMPLETED';
  END IF;

  UPDATE purchase_orders SET
    status = v_new_status,
    total_confirmed = COALESCE(total_confirmed, 0) + v_total_confirmed,
    concluded_at = CASE WHEN v_new_status = 'COMPLETED' THEN now() ELSE concluded_at END,
    updated_at = now()
  WHERE id = p_order_id;

  PERFORM log_audit('rpc', 'purchases', 'purchase_orders', p_order_id, 'RECEIVE_ATOMIC', NULL,
    jsonb_build_object(
      'items_received', v_items_received, 'items_not_delivered', v_items_not_delivered,
      'total_confirmed', v_total_confirmed, 'new_status', v_new_status, 'metadata', p_metadata
    ));

  RETURN jsonb_build_object(
    'status', v_new_status, 'items_received', v_items_received,
    'items_not_delivered', v_items_not_delivered, 'total_confirmed', v_total_confirmed
  );
END;
$function$;
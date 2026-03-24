CREATE OR REPLACE FUNCTION public.edit_purchase_order_atomic(
  p_order_id uuid,
  p_payload jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_order record;
  v_is_mercado boolean;
  v_total numeric := 0;
  v_item jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_company := assert_tenant();

  SELECT * INTO v_order
  FROM purchase_orders
  WHERE id = p_order_id AND company_id = v_company AND deleted_at IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

  v_is_mercado := v_order.type IN ('MERCADO','SAZONAL');

  UPDATE purchase_orders SET
    title = COALESCE(NULLIF(p_payload->>'title',''), title),
    type = COALESCE(NULLIF(p_payload->>'type',''), type),
    priority = COALESCE(NULLIF(p_payload->>'priority',''), priority),
    category = COALESCE(p_payload->>'category', category),
    supplier_name = NULLIF(p_payload->>'supplier_name',''),
    payment_type = NULLIF(p_payload->>'payment_type',''),
    need_by_date = NULLIF(p_payload->>'need_by_date','')::date,
    delivery_forecast_date = NULLIF(p_payload->>'delivery_forecast_date','')::date,
    responsible_user_id = NULLIF(p_payload->>'responsible_user_id','')::uuid,
    notes = COALESCE(p_payload->>'notes', notes),
    updated_at = now()
  WHERE id = p_order_id;

  IF p_payload ? 'items' AND jsonb_array_length(p_payload->'items') > 0 THEN
    UPDATE purchase_order_items SET
      deleted_at = now(), deleted_by = v_user
    WHERE order_id = p_order_id
      AND company_id = v_company
      AND received_status = 'PENDING'
      AND shopping_status = 'PENDING'
      AND deleted_at IS NULL;

    v_is_mercado := COALESCE(NULLIF(p_payload->>'type',''), v_order.type::text) IN ('MERCADO','SAZONAL');

    INSERT INTO purchase_order_items (
      order_id, stock_item_id, name_snapshot, unit_snapshot,
      estimated_unit_value, qty_requested,
      purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot,
      shopping_status, company_id
    )
    SELECT
      p_order_id,
      NULLIF(item->>'stock_item_id','')::uuid,
      item->>'name_snapshot',
      item->>'unit_snapshot',
      (item->>'estimated_unit_value')::numeric,
      (item->>'qty_requested')::numeric,
      COALESCE(NULLIF(item->>'purchase_unit_snapshot',''), item->>'unit_snapshot'),
      COALESCE((item->>'purchase_unit_cost_snapshot')::numeric, (item->>'estimated_unit_value')::numeric),
      COALESCE((item->>'conversion_factor_snapshot')::numeric, 1),
      CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END,
      v_company
    FROM jsonb_array_elements(p_payload->'items') AS item;

    SELECT COALESCE(SUM(qty_requested * estimated_unit_value), 0) INTO v_total
    FROM purchase_order_items
    WHERE order_id = p_order_id AND company_id = v_company AND deleted_at IS NULL;

    UPDATE purchase_orders SET total_estimated = v_total WHERE id = p_order_id;
  END IF;

  -- Fix: use p_order_id directly (UUID), not ::text
  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('purchase_orders', p_order_id, 'EDICAO', v_user);

  RETURN jsonb_build_object('status','updated','order_id', p_order_id);
END;
$$;
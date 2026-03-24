CREATE OR REPLACE FUNCTION public.create_purchase_order_atomic(
  p_payload jsonb,
  p_idempotency_key uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_company uuid;
  v_order_id uuid;
  v_title text;
  v_type text;
  v_status text;
  v_total numeric := 0;
  v_item jsonb;
  v_is_mercado boolean;
  v_shopping_status text;
  v_existing_id uuid;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  v_company := assert_tenant();

  SELECT id INTO v_existing_id
  FROM purchase_orders
  WHERE company_id = v_company AND idempotency_key = p_idempotency_key;

  IF v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status','idempotent','order_id', v_existing_id);
  END IF;

  v_title := p_payload->>'title';
  v_type  := p_payload->>'type';
  v_is_mercado := v_type IN ('MERCADO','SAZONAL');
  v_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OPEN' END;
  v_shopping_status := CASE WHEN v_is_mercado THEN 'PENDING' ELSE 'OK' END;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_payload->'items')
  LOOP
    v_total := v_total + (v_item->>'qty_requested')::numeric * (v_item->>'estimated_unit_value')::numeric;
  END LOOP;

  INSERT INTO purchase_orders (
    title, type, priority, category, supplier_name, payment_type,
    need_by_date, delivery_forecast_date, responsible_user_id, notes,
    status, total_estimated, created_by, company_id, idempotency_key,
    origin, origin_ref
  ) VALUES (
    v_title, v_type,
    COALESCE(p_payload->>'priority','MEDIA'),
    COALESCE(p_payload->>'category',''),
    NULLIF(p_payload->>'supplier_name',''),
    NULLIF(p_payload->>'payment_type',''),
    NULLIF(p_payload->>'need_by_date','')::date,
    NULLIF(p_payload->>'delivery_forecast_date','')::date,
    NULLIF(p_payload->>'responsible_user_id','')::uuid,
    COALESCE(p_payload->>'notes',''),
    v_status, v_total, v_user, v_company, p_idempotency_key,
    COALESCE(NULLIF(p_payload->>'origin',''), 'MANUAL'),
    NULLIF(p_payload->>'origin_ref','')
  ) RETURNING id INTO v_order_id;

  INSERT INTO purchase_order_items (
    order_id, stock_item_id, name_snapshot, unit_snapshot,
    estimated_unit_value, qty_requested,
    purchase_unit_snapshot, purchase_unit_cost_snapshot, conversion_factor_snapshot,
    shopping_status, company_id
  )
  SELECT
    v_order_id,
    NULLIF(item->>'stock_item_id','')::uuid,
    item->>'name_snapshot',
    item->>'unit_snapshot',
    (item->>'estimated_unit_value')::numeric,
    (item->>'qty_requested')::numeric,
    COALESCE(NULLIF(item->>'purchase_unit_snapshot',''), item->>'unit_snapshot'),
    COALESCE((item->>'purchase_unit_cost_snapshot')::numeric, (item->>'estimated_unit_value')::numeric),
    COALESCE((item->>'conversion_factor_snapshot')::numeric, 1),
    v_shopping_status,
    v_company
  FROM jsonb_array_elements(p_payload->'items') AS item;

  INSERT INTO audit_log (tabela, registro_id, acao, user_id)
  VALUES ('purchase_orders', v_order_id, 'CRIACAO', v_user);

  RETURN jsonb_build_object('status','created','order_id', v_order_id);
END;
$$;
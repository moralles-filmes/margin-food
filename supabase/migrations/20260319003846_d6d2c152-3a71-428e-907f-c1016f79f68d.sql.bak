
-- Fix: origin_ref column is TEXT not UUID, so the return type must match
-- Also fix the create RPC to include origin/origin_ref

DROP FUNCTION IF EXISTS public.list_purchase_orders_cursor(integer, timestamptz, uuid, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.list_purchase_orders_cursor(
  p_limit integer DEFAULT 50,
  p_cursor_created_at timestamptz DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_type text DEFAULT NULL,
  p_priority text DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_responsible text DEFAULT NULL
)
RETURNS TABLE(
  id uuid, title text, type text, priority text, category text,
  supplier_name text, payment_type text, need_by_date date,
  delivery_forecast_date date, responsible_user_id text, notes text,
  status text, total_estimated numeric, total_confirmed numeric,
  concluded_at timestamptz, shopping_done_at timestamptz, shopping_done_by text,
  not_delivered_ack_at timestamptz, not_delivered_ack_by text,
  created_by text, created_at timestamptz, updated_at timestamptz,
  origin text, origin_ref text,
  has_more boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_limit int := LEAST(COALESCE(p_limit, 50), 200);
  v_company uuid := assert_tenant();
BEGIN
  IF NOT has_permission(auth.uid(), 'purchases:read') THEN
    RAISE EXCEPTION 'Sem permissão (purchases:read).';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      po.id, po.title, po.type, po.priority, po.category,
      po.supplier_name, po.payment_type, po.need_by_date,
      po.delivery_forecast_date, po.responsible_user_id::text AS responsible_user_id, po.notes,
      po.status, po.total_estimated, po.total_confirmed,
      po.concluded_at, po.shopping_done_at, po.shopping_done_by::text AS shopping_done_by,
      po.not_delivered_ack_at, po.not_delivered_ack_by::text AS not_delivered_ack_by,
      po.created_by::text AS created_by, po.created_at, po.updated_at,
      po.origin, po.origin_ref
    FROM purchase_orders po
    WHERE
      po.company_id = v_company
      AND po.deleted_at IS NULL
      AND (p_status IS NULL OR po.status = p_status)
      AND (p_type IS NULL OR po.type = p_type)
      AND (p_priority IS NULL OR po.priority = p_priority)
      AND (p_responsible IS NULL OR po.responsible_user_id::text = p_responsible)
      AND (
        p_search IS NULL 
        OR unaccent(po.title) ILIKE '%' || unaccent(p_search) || '%' 
        OR unaccent(COALESCE(po.supplier_name,'')) ILIKE '%' || unaccent(p_search) || '%'
      )
      AND (
        p_cursor_created_at IS NULL
        OR (po.created_at, po.id) < (p_cursor_created_at, COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
      )
    ORDER BY po.created_at DESC, po.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    f.id, f.title, f.type, f.priority, f.category,
    f.supplier_name, f.payment_type, f.need_by_date,
    f.delivery_forecast_date, f.responsible_user_id, f.notes,
    f.status, f.total_estimated, f.total_confirmed,
    f.concluded_at, f.shopping_done_at, f.shopping_done_by,
    f.not_delivered_ack_at, f.not_delivered_ack_by,
    f.created_by, f.created_at, f.updated_at,
    f.origin, f.origin_ref,
    (ROW_NUMBER() OVER () > v_limit) AS has_more
  FROM filtered f
  LIMIT v_limit;
END;
$function$;

-- Fix create_purchase_order_atomic to include origin/origin_ref
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

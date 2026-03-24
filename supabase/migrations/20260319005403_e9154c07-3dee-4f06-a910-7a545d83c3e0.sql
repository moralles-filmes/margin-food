CREATE OR REPLACE FUNCTION public.list_purchase_orders_cursor(
  p_limit integer DEFAULT 50,
  p_cursor_created_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_cursor_id uuid DEFAULT NULL::uuid,
  p_status text DEFAULT NULL::text,
  p_type text DEFAULT NULL::text,
  p_priority text DEFAULT NULL::text,
  p_search text DEFAULT NULL::text,
  p_responsible text DEFAULT NULL::text
)
RETURNS TABLE(
  id uuid,
  title text,
  type text,
  priority text,
  category text,
  supplier_name text,
  payment_type text,
  need_by_date date,
  delivery_forecast_date date,
  responsible_user_id text,
  notes text,
  status text,
  total_estimated numeric,
  total_confirmed numeric,
  concluded_at timestamp with time zone,
  shopping_done_at timestamp with time zone,
  shopping_done_by text,
  not_delivered_ack_at timestamp with time zone,
  not_delivered_ack_by text,
  created_by text,
  created_at timestamp with time zone,
  updated_at timestamp with time zone,
  origin text,
  origin_ref text,
  has_more boolean
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $$
DECLARE
  v_limit int := LEAST(COALESCE(p_limit, 50), 200);
  v_company uuid := assert_tenant();
BEGIN
  -- Alinhar a função à mesma source of truth de visibilidade usada pelo RLS do módulo Compras.
  -- Isso evita divergência entre create/list/detail para usuários com permissões granulares.
  IF NOT has_compras_view(auth.uid()) THEN
    RAISE EXCEPTION 'Sem permissão (compras:view).';
  END IF;

  RETURN QUERY
  WITH filtered AS (
    SELECT
      po.id,
      po.title,
      po.type,
      po.priority,
      po.category,
      po.supplier_name,
      po.payment_type,
      po.need_by_date,
      po.delivery_forecast_date,
      po.responsible_user_id::text AS responsible_user_id,
      po.notes,
      po.status,
      po.total_estimated,
      po.total_confirmed,
      po.concluded_at,
      po.shopping_done_at,
      po.shopping_done_by::text AS shopping_done_by,
      po.not_delivered_ack_at,
      po.not_delivered_ack_by::text AS not_delivered_ack_by,
      po.created_by::text AS created_by,
      po.created_at,
      po.updated_at,
      po.origin,
      po.origin_ref
    FROM public.purchase_orders po
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
        OR unaccent(COALESCE(po.supplier_name, '')) ILIKE '%' || unaccent(p_search) || '%'
      )
      AND (
        p_cursor_created_at IS NULL
        OR (po.created_at, po.id) < (
          p_cursor_created_at,
          COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid)
        )
      )
    ORDER BY po.created_at DESC, po.id DESC
    LIMIT v_limit + 1
  )
  SELECT
    f.id,
    f.title,
    f.type,
    f.priority,
    f.category,
    f.supplier_name,
    f.payment_type,
    f.need_by_date,
    f.delivery_forecast_date,
    f.responsible_user_id,
    f.notes,
    f.status,
    f.total_estimated,
    f.total_confirmed,
    f.concluded_at,
    f.shopping_done_at,
    f.shopping_done_by,
    f.not_delivered_ack_at,
    f.not_delivered_ack_by,
    f.created_by,
    f.created_at,
    f.updated_at,
    f.origin,
    f.origin_ref,
    (ROW_NUMBER() OVER () > v_limit) AS has_more
  FROM filtered f
  LIMIT v_limit;
END;
$$;
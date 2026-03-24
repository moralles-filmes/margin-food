CREATE OR REPLACE FUNCTION public.get_supplier_ranking(
  p_stock_item_id UUID DEFAULT NULL,
  p_category TEXT DEFAULT NULL,
  p_limit INT DEFAULT 50,
  p_offset INT DEFAULT 0,
  p_sort TEXT DEFAULT 'cheapest'
)
RETURNS TABLE(
  supplier_id TEXT,
  supplier_uuid UUID,
  supplier_name TEXT,
  avg_unit_cost NUMERIC,
  min_unit_cost NUMERIC,
  max_unit_cost NUMERIC,
  last_price NUMERIC,
  last_updated_at TIMESTAMPTZ,
  items_count BIGINT,
  rank_position BIGINT,
  has_more BOOLEAN
)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $fn$
DECLARE
  v_limit INT := LEAST(COALESCE(p_limit, 50), 200);
BEGIN
  IF NOT has_permission(auth.uid(), 'purchases:read') THEN
    RAISE EXCEPTION 'Sem permissão (purchases:read).';
  END IF;

  RETURN QUERY
  WITH base AS (
    SELECT
      sip.supplier_id AS sid,
      sip.supplier_uuid AS suuid,
      COALESCE(s.name, sip.supplier_id) AS sname,
      sip.unit_cost,
      sip.last_updated_at AS lua,
      sip.stock_item_id
    FROM supplier_item_prices sip
    LEFT JOIN suppliers s ON s.id = sip.supplier_uuid
    WHERE
      (p_stock_item_id IS NULL OR sip.stock_item_id = p_stock_item_id)
      AND (p_category IS NULL OR EXISTS (
        SELECT 1 FROM produtos p WHERE p.id = sip.stock_item_id AND p.categoria = p_category
      ))
  ),
  agg AS (
    SELECT
      b.sid,
      b.suuid,
      b.sname,
      ROUND(AVG(b.unit_cost)::numeric, 4) AS avg_cost,
      ROUND(MIN(b.unit_cost)::numeric, 4) AS min_cost,
      ROUND(MAX(b.unit_cost)::numeric, 4) AS max_cost,
      COUNT(DISTINCT b.stock_item_id) AS cnt,
      MAX(b.lua) AS last_ua
    FROM base b
    GROUP BY b.sid, b.suuid, b.sname
  ),
  ranked AS (
    SELECT
      a.*,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN p_sort = 'cheapest' THEN a.avg_cost END ASC,
          CASE WHEN p_sort = 'expensive' THEN a.avg_cost END DESC,
          a.sname ASC
      ) AS rn
    FROM agg a
  ),
  with_last AS (
    SELECT
      r.*,
      (SELECT b2.unit_cost FROM base b2 WHERE b2.sid = r.sid ORDER BY b2.lua DESC LIMIT 1) AS lp
    FROM ranked r
    WHERE r.rn > p_offset
    ORDER BY r.rn
    LIMIT v_limit + 1
  )
  SELECT
    wl.sid,
    wl.suuid,
    wl.sname,
    wl.avg_cost,
    wl.min_cost,
    wl.max_cost,
    wl.lp,
    wl.last_ua,
    wl.cnt,
    wl.rn,
    (ROW_NUMBER() OVER () > v_limit) AS has_more
  FROM with_last wl
  LIMIT v_limit;
END;
$fn$;

-- 8) Update receive_purchase_order_atomic to upsert supplier_item_prices
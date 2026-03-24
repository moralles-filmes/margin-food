CREATE OR REPLACE FUNCTION public.get_relatorios_compras(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_result jsonb;
  v_total_geral numeric;
  v_semanas numeric;
  v_prev_start date;
  v_prev_end date;
  v_period_days int;
BEGIN
  v_company := assert_tenant();

  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  v_period_days := (p_end - p_start) + 1;
  v_semanas := GREATEST(v_period_days / 7.0, 1);
  v_prev_end := p_start - 1;
  v_prev_start := v_prev_end - v_period_days + 1;

  SELECT COALESCE(SUM(val), 0) INTO v_total_geral
  FROM (
    SELECT SUM(poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value)) AS val
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    WHERE poi.received_at::date BETWEEN p_start AND p_end
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
      AND po.company_id = v_company
    UNION ALL
    SELECT SUM(se.total_value) AS val
    FROM salmon_entries se
    WHERE se.company_id = v_company
      AND se.status = 'ACTIVE'
      AND se.entry_date BETWEEN p_start AND p_end
  ) combined;

  WITH purchase_base AS (
    SELECT
      COALESCE(po.supplier_name, 'Sem fornecedor') AS supplier,
      po.id AS order_id,
      poi.id AS item_id,
      poi.qty_received,
      COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS unit_cost,
      poi.received_at::date AS received_date,
      poi.unit_snapshot
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    WHERE poi.received_at::date BETWEEN p_start AND p_end
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
      AND po.company_id = v_company
  ),
  salmon_base AS (
    SELECT
      COALESCE(NULLIF(se.supplier_name, ''), 'Salmão (sem fornecedor)') AS supplier,
      se.id AS order_id,
      se.id AS item_id,
      se.gross_kg AS qty_received,
      CASE WHEN se.gross_kg > 0 THEN se.total_value / se.gross_kg ELSE 0 END AS unit_cost,
      se.entry_date AS received_date,
      'KG'::text AS unit_snapshot
    FROM salmon_entries se
    WHERE se.company_id = v_company
      AND se.status = 'ACTIVE'
      AND se.entry_date BETWEEN p_start AND p_end
  ),
  all_base AS (
    SELECT supplier, order_id, item_id, qty_received, unit_cost, received_date, unit_snapshot FROM purchase_base
    UNION ALL
    SELECT supplier, order_id, item_id, qty_received, unit_cost, received_date, unit_snapshot FROM salmon_base
  ),
  prev_purchase AS (
    SELECT
      COALESCE(po.supplier_name, 'Sem fornecedor') AS supplier,
      COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS unit_cost
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    WHERE poi.received_at::date BETWEEN v_prev_start AND v_prev_end
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
      AND po.company_id = v_company
  ),
  prev_salmon AS (
    SELECT
      COALESCE(NULLIF(se.supplier_name, ''), 'Salmão (sem fornecedor)') AS supplier,
      CASE WHEN se.gross_kg > 0 THEN se.total_value / se.gross_kg ELSE 0 END AS unit_cost
    FROM salmon_entries se
    WHERE se.company_id = v_company
      AND se.status = 'ACTIVE'
      AND se.entry_date BETWEEN v_prev_start AND v_prev_end
  ),
  all_prev AS (
    SELECT supplier, unit_cost FROM prev_purchase
    UNION ALL
    SELECT supplier, unit_cost FROM prev_salmon
  ),
  agg AS (
    SELECT
      supplier,
      COUNT(DISTINCT order_id) AS total_orders,
      COUNT(item_id) AS total_items,
      ROUND(SUM(qty_received * unit_cost)::numeric, 2) AS total_value,
      CASE
        WHEN SUM(qty_received) FILTER (WHERE LOWER(unit_snapshot) IN ('kg','kilo','quilo')) > 0
        THEN ROUND(
          SUM(qty_received * unit_cost) FILTER (WHERE LOWER(unit_snapshot) IN ('kg','kilo','quilo'))
          / SUM(qty_received) FILTER (WHERE LOWER(unit_snapshot) IN ('kg','kilo','quilo'))
        , 4)
        ELSE NULL
      END AS preco_medio_kg
    FROM all_base
    GROUP BY supplier
  ),
  avg_curr AS (
    SELECT supplier, AVG(unit_cost) AS curr_avg
    FROM all_base
    GROUP BY supplier
  ),
  avg_prev AS (
    SELECT supplier, AVG(unit_cost) AS prev_avg
    FROM all_prev
    GROUP BY supplier
  ),
  final_data AS (
    SELECT
      a.supplier,
      a.total_orders,
      a.total_items,
      a.total_value,
      a.preco_medio_kg,
      CASE
        WHEN ap.prev_avg > 0 AND ac.curr_avg > 0
        THEN ROUND(((ac.curr_avg - ap.prev_avg) / ap.prev_avg * 100)::numeric, 2)
        ELSE NULL
      END AS variacao
    FROM agg a
    LEFT JOIN avg_curr ac ON ac.supplier = a.supplier
    LEFT JOIN avg_prev ap ON ap.supplier = a.supplier
  )
  SELECT jsonb_build_object(
    'fonte', 'purchase_order_items + salmon_entries',
    'total_compras_periodo', v_total_geral,
    'total_fornecedores_ativos', (SELECT COUNT(*) FROM agg),
    'fornecedores', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'supplier_name', f.supplier,
          'total_orders', f.total_orders,
          'total_items', f.total_items,
          'total_value', f.total_value,
          'ticket_medio', CASE WHEN f.total_orders > 0 THEN ROUND(f.total_value / f.total_orders, 2) ELSE 0 END,
          'freq_semanal', ROUND(f.total_orders / v_semanas, 2),
          'preco_medio_por_kg', f.preco_medio_kg,
          'variacao_preco_percent', f.variacao,
          'impacto_financeiro_percent', CASE WHEN v_total_geral > 0 THEN ROUND(f.total_value / v_total_geral * 100, 2) ELSE 0 END
        ) ORDER BY f.total_value DESC
      )
      FROM final_data f
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;


-- =====================================================
-- FIX 3: get_relatorios_tendencia — include salmon in comparativo compras
-- =====================================================
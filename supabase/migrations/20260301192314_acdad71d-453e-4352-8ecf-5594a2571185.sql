CREATE OR REPLACE FUNCTION public.get_relatorios_compras(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
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

  SELECT COALESCE(SUM(
    poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value)
  ), 0) INTO v_total_geral
  FROM purchase_order_items poi
  JOIN purchase_orders po ON po.id = poi.order_id
  WHERE poi.received_at::date BETWEEN p_start AND p_end
    AND poi.qty_received > 0
    AND poi.received_status = 'RECEIVED'
    AND po.status NOT IN ('CANCELLED','DELETED')
    AND po.company_id = v_company;

  SELECT jsonb_build_object(
    'fonte', 'purchase_order_items (received_at + qty_received > 0)',
    'total_compras_periodo', v_total_geral,
    'total_fornecedores_ativos', (
      SELECT COUNT(DISTINCT COALESCE(po.supplier_name, 'Sem fornecedor'))
      FROM purchase_order_items poi
      JOIN purchase_orders po ON po.id = poi.order_id
      WHERE poi.received_at::date BETWEEN p_start AND p_end
        AND poi.qty_received > 0 AND poi.received_status = 'RECEIVED'
        AND po.status NOT IN ('CANCELLED','DELETED')
        AND po.company_id = v_company
    ),
    'fornecedores', COALESCE((
      SELECT jsonb_agg(sub ORDER BY sub.total_value DESC)
      FROM (
        SELECT
          jsonb_build_object(
            'supplier_name', forn,
            'total_orders', total_orders,
            'total_items', total_items,
            'total_value', total_value,
            'ticket_medio', CASE WHEN total_orders > 0 THEN ROUND(total_value / total_orders, 2) ELSE 0 END,
            'freq_semanal', ROUND(total_orders / v_semanas, 2),
            'preco_medio_por_kg', preco_medio_kg,
            'variacao_preco_percent', variacao,
            'impacto_financeiro_percent', CASE WHEN v_total_geral > 0 THEN ROUND(total_value / v_total_geral * 100, 2) ELSE 0 END
          ) AS sub
        FROM (
          SELECT
            COALESCE(po.supplier_name, 'Sem fornecedor') AS forn,
            COUNT(DISTINCT po.id) AS total_orders,
            COUNT(poi.id) AS total_items,
            ROUND(SUM(poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value))::numeric, 2) AS total_value,
            CASE WHEN SUM(poi.qty_received) FILTER (WHERE LOWER(poi.unit_snapshot) IN ('kg','kilo','quilo')) > 0
              THEN ROUND(
                SUM(poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value))
                  FILTER (WHERE LOWER(poi.unit_snapshot) IN ('kg','kilo','quilo'))
                / SUM(poi.qty_received) FILTER (WHERE LOWER(poi.unit_snapshot) IN ('kg','kilo','quilo'))
              , 4)
              ELSE NULL
            END AS preco_medio_kg,
            (SELECT
              CASE WHEN prev_avg > 0 AND curr_avg > 0
                THEN ROUND(((curr_avg - prev_avg) / prev_avg * 100)::numeric, 2)
                ELSE NULL
              END
            FROM (
              SELECT
                AVG(poi2.qty_received * COALESCE(NULLIF(poi2.purchase_unit_cost_snapshot, 0), poi2.estimated_unit_value) / NULLIF(poi2.qty_received, 0))
                  FILTER (WHERE poi2.received_at::date BETWEEN p_start AND p_end) AS curr_avg,
                AVG(poi2.qty_received * COALESCE(NULLIF(poi2.purchase_unit_cost_snapshot, 0), poi2.estimated_unit_value) / NULLIF(poi2.qty_received, 0))
                  FILTER (WHERE poi2.received_at::date BETWEEN v_prev_start AND v_prev_end) AS prev_avg
              FROM purchase_order_items poi2
              JOIN purchase_orders po2 ON po2.id = poi2.order_id
              WHERE COALESCE(po2.supplier_name, 'Sem fornecedor') = COALESCE(po.supplier_name, 'Sem fornecedor')
                AND poi2.qty_received > 0 AND poi2.received_status = 'RECEIVED'
                AND po2.status NOT IN ('CANCELLED','DELETED')
                AND po2.company_id = v_company
            ) x) AS variacao
          FROM purchase_order_items poi
          JOIN purchase_orders po ON po.id = poi.order_id
          WHERE poi.received_at::date BETWEEN p_start AND p_end
            AND poi.qty_received > 0
            AND poi.received_status = 'RECEIVED'
            AND po.status NOT IN ('CANCELLED','DELETED')
            AND po.company_id = v_company
          GROUP BY COALESCE(po.supplier_name, 'Sem fornecedor')
        ) agg
      ) wrapped
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;
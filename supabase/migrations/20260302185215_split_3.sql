CREATE OR REPLACE FUNCTION public._planning_spend_summary_inner(
  p_company_id uuid,
  p_year integer,
  p_month integer,
  p_source text DEFAULT NULL::text,
  p_categoria text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_start_date date;
  v_end_date date;
  v_metas jsonb;
  v_realizado jsonb;
  v_realizado_total numeric;
  v_comparativo jsonb;
  v_weekly jsonb;
BEGIN
  v_start_date := make_date(p_year, p_month, 1);
  v_end_date := (date_trunc('month', v_start_date) + interval '1 month' - interval '1 day')::date;

  -- Metas do mês (TENANT SCOPED)
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', pm.id,
    'categoria', pm.categoria,
    'target_value', pm.target_value,
    'alerta_amarelo_percent', pm.alerta_amarelo_percent,
    'alerta_vermelho_percent', pm.alerta_vermelho_percent
  )), '[]'::jsonb)
  INTO v_metas
  FROM planning_metas_compra pm
  WHERE pm.company_id = p_company_id
    AND pm.year = p_year AND pm.month = p_month AND pm.ativo = true;

  -- Realizado por categoria (TENANT SCOPED via purchase_orders.company_id)
  WITH received_items AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS item_value,
      (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date AS received_date
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE po.company_id = p_company_id
      AND (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
  ),
  cat_totals AS (
    SELECT cat, ROUND(SUM(item_value)::numeric, 2) AS spent_value
    FROM received_items
    GROUP BY cat
  )
  SELECT
    COALESCE(jsonb_agg(jsonb_build_object('categoria', cat, 'spent_value', spent_value)), '[]'::jsonb),
    COALESCE(SUM(spent_value), 0)
  INTO v_realizado, v_realizado_total
  FROM cat_totals
  WHERE (p_categoria IS NULL OR cat = p_categoria);

  -- Weekly breakdown W1-W5 (TENANT SCOPED + TZ corrected)
  WITH received_items AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value) AS item_value,
      EXTRACT(DAY FROM (poi.received_at AT TIME ZONE 'America/Sao_Paulo'))::int AS day_num
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE po.company_id = p_company_id
      AND (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0
      AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
      AND (p_categoria IS NULL OR COALESCE(prod.categoria, 'Sem Categoria') = p_categoria)
  ),
  weekly AS (
    SELECT
      CASE
        WHEN day_num <= 7 THEN 'W1'
        WHEN day_num <= 14 THEN 'W2'
        WHEN day_num <= 21 THEN 'W3'
        WHEN day_num <= 28 THEN 'W4'
        ELSE 'W5'
      END AS week_label,
      ROUND(SUM(item_value)::numeric, 2) AS total
    FROM received_items
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_object_agg(week_label, total), '{}'::jsonb)
  INTO v_weekly
  FROM weekly;

  -- Comparativo metas vs realizado (TENANT SCOPED)
  WITH all_cats AS (
    SELECT categoria AS cat, target_value, alerta_amarelo_percent, alerta_vermelho_percent
    FROM planning_metas_compra
    WHERE company_id = p_company_id
      AND year = p_year AND month = p_month AND ativo = true
  ),
  cat_spent AS (
    SELECT
      COALESCE(prod.categoria, 'Sem Categoria') AS cat,
      ROUND(SUM(poi.qty_received * COALESCE(NULLIF(poi.purchase_unit_cost_snapshot, 0), poi.estimated_unit_value))::numeric, 2) AS spent
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.order_id
    LEFT JOIN produtos prod ON prod.id = poi.stock_item_id
    WHERE po.company_id = p_company_id
      AND (poi.received_at AT TIME ZONE 'America/Sao_Paulo')::date BETWEEN v_start_date AND v_end_date
      AND poi.qty_received > 0 AND poi.received_status = 'RECEIVED'
      AND po.status NOT IN ('CANCELLED','DELETED')
    GROUP BY 1
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'categoria', COALESCE(ac.cat, cs.cat),
    'target_value', COALESCE(ac.target_value, 0),
    'spent_value', COALESCE(cs.spent, 0),
    'delta_value', COALESCE(ac.target_value, 0) - COALESCE(cs.spent, 0),
    'percent_of_target', CASE 
      WHEN COALESCE(ac.target_value, 0) > 0 
      THEN ROUND((COALESCE(cs.spent, 0) / ac.target_value * 100)::numeric, 2) 
      ELSE 0 END
  )), '[]'::jsonb)
  INTO v_comparativo
  FROM all_cats ac
  FULL OUTER JOIN cat_spent cs ON ac.cat = cs.cat
  WHERE (p_categoria IS NULL OR COALESCE(ac.cat, cs.cat) = p_categoria);

  RETURN jsonb_build_object(
    'period', jsonb_build_object('year', p_year, 'month', p_month, 'start_date', v_start_date, 'end_date', v_end_date),
    'metas', v_metas,
    'realizado_por_categoria', v_realizado,
    'realizado_total', COALESCE(v_realizado_total, 0),
    'weekly_breakdown', v_weekly,
    'comparativo', v_comparativo,
    'computed_at', now()
  );
END;
$function$;
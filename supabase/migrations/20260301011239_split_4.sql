CREATE OR REPLACE FUNCTION public.get_relatorios_score(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_period_days int;
  v_weeks numeric;
  v_total_value_geral numeric;
  v_custo_consumido numeric;
  v_faturamento numeric;
  v_meta_cmv numeric;
  v_avg_weekly_cost numeric;
BEGIN
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  v_period_days := GREATEST((p_end - p_start) + 1, 1);
  v_weeks := GREATEST(v_period_days / 7.0, 1);

  SELECT COALESCE(SUM(poi.qty_received * COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)), 0)
  INTO v_total_value_geral
  FROM purchase_order_items poi JOIN purchase_orders po ON po.id = poi.order_id
  WHERE poi.received_status = 'RECEIVED' AND poi.qty_received > 0
    AND po.status NOT IN ('CANCELLED', 'DELETED') AND poi.received_at BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_consumido
  FROM movimentacoes_estoque m
  WHERE m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;

  -- Faturamento from canonical source
  SELECT COALESCE(SUM(fc.faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa fc WHERE fc.data BETWEEN p_start AND p_end;

  SELECT COALESCE(mc.meta_cmv_total, 35) INTO v_meta_cmv FROM metas_cmv mc ORDER BY mc.mes_ano DESC LIMIT 1;

  SELECT COALESCE(AVG(sub.weekly_cost), 0) INTO v_avg_weekly_cost
  FROM (
    SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
      SUM(m.custo_total) AS weekly_cost
    FROM movimentacoes_estoque m
    WHERE m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
      AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
    GROUP BY 1 HAVING SUM(m.custo_total) > 0
  ) sub;

  IF v_avg_weekly_cost = 0 THEN
    SELECT COALESCE(SUM(m.custo_total) / GREATEST(COUNT(DISTINCT EXTRACT(WEEK FROM m.data)), 1), 0)
    INTO v_avg_weekly_cost
    FROM movimentacoes_estoque m
    WHERE m.status = 'ATIVO' AND m.data >= CURRENT_DATE - 28
      AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;
  END IF;

  SELECT jsonb_build_object(
    'suppliers', COALESCE((
      SELECT jsonb_agg(sub ORDER BY sub.score_total DESC)
      FROM (
        SELECT s.id AS supplier_id, s.name AS supplier_name,
          COUNT(DISTINCT poi.order_id) AS total_orders, SUM(poi.qty_received) AS total_items,
          ROUND(SUM(poi.qty_received * COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0))::numeric, 2) AS total_value,
          ROUND(AVG(COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0))::numeric, 4) AS avg_unit_cost,
          ROUND(COALESCE(STDDEV(COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)), 0)::numeric, 4) AS stddev_cost,
          ROUND(GREATEST(0, LEAST(100, 100 - (CASE WHEN ga.global_avg > 0 THEN (AVG(COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)) / ga.global_avg - 1) * 200 ELSE 0 END)))::numeric, 1) AS price_score,
          ROUND(GREATEST(0, LEAST(100, CASE WHEN ga.global_stddev > 0 THEN 100 - (COALESCE(STDDEV(COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)), 0) / ga.global_stddev * 50) ELSE 80 END))::numeric, 1) AS stability_score,
          ROUND(GREATEST(0, LEAST(100, CASE WHEN SUM(poi.quantity) > 0 THEN (SUM(poi.qty_received) / SUM(poi.quantity)) * 100 ELSE 50 END))::numeric, 1) AS delivery_score,
          ROUND(GREATEST(0, LEAST(100, CASE WHEN v_total_value_geral > 0 THEN 100 - ABS(SUM(poi.qty_received * COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)) / v_total_value_geral * 100 - 25) * 2 ELSE 50 END))::numeric, 1) AS impact_score,
          ROUND((
            GREATEST(0, LEAST(100, 100 - (CASE WHEN ga.global_avg > 0 THEN (AVG(COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)) / ga.global_avg - 1) * 200 ELSE 0 END))) * 0.40 +
            GREATEST(0, LEAST(100, CASE WHEN ga.global_stddev > 0 THEN 100 - (COALESCE(STDDEV(COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)), 0) / ga.global_stddev * 50) ELSE 80 END)) * 0.20 +
            GREATEST(0, LEAST(100, CASE WHEN SUM(poi.quantity) > 0 THEN (SUM(poi.qty_received) / SUM(poi.quantity)) * 100 ELSE 50 END)) * 0.20 +
            GREATEST(0, LEAST(100, CASE WHEN v_total_value_geral > 0 THEN 100 - ABS(SUM(poi.qty_received * COALESCE(NULLIF(poi.unit_cost, 0), poi.estimated_unit_value, 0)) / v_total_value_geral * 100 - 25) * 2 ELSE 50 END)) * 0.20
          )::numeric, 0) AS score_total,
          ROUND(LEAST(1, (COUNT(*)::numeric / 20))::numeric, 2) AS confidence
        FROM purchase_order_items poi
        JOIN purchase_orders po ON po.id = poi.order_id
        JOIN suppliers s ON s.id = poi.supplier_id
        CROSS JOIN (
          SELECT COALESCE(AVG(COALESCE(NULLIF(x.unit_cost, 0), x.estimated_unit_value, 0)), 1) AS global_avg,
            COALESCE(STDDEV(COALESCE(NULLIF(x.unit_cost, 0), x.estimated_unit_value, 0)), 1) AS global_stddev
          FROM purchase_order_items x JOIN purchase_orders xo ON xo.id = x.order_id
          WHERE x.received_status = 'RECEIVED' AND x.qty_received > 0
            AND xo.status NOT IN ('CANCELLED', 'DELETED') AND x.received_at BETWEEN p_start AND p_end
        ) ga
        WHERE poi.received_status = 'RECEIVED' AND poi.qty_received > 0
          AND po.status NOT IN ('CANCELLED', 'DELETED') AND poi.received_at BETWEEN p_start AND p_end
        GROUP BY s.id, s.name, ga.global_avg, ga.global_stddev
      ) sub
    ), '[]'::jsonb),
    'projecao_4_semanas', (
      SELECT jsonb_agg(jsonb_build_object('week_number', w, 'week_start', (CURRENT_DATE + ((w - 1) * 7))::text,
        'projected_cost', ROUND(v_avg_weekly_cost::numeric, 2),
        'projected_cmv_percent', CASE WHEN v_faturamento > 0 AND v_weeks > 0
          THEN ROUND(((v_avg_weekly_cost) / (v_faturamento / v_weeks) * 100)::numeric, 2) ELSE NULL END,
        'scenario', 'base'))
      FROM generate_series(1, 4) AS w
    ),
    'custo_consumido', v_custo_consumido, 'faturamento', v_faturamento, 'meta_cmv', v_meta_cmv,
    'avg_weekly_cost', ROUND(v_avg_weekly_cost::numeric, 2),
    'perdas_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
      WHERE m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
      AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 5d) simulate_relatorios_score: use fechamento_caixa
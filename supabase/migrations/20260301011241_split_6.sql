CREATE OR REPLACE FUNCTION public.get_salmon_dashboard_summary(p_date_from date DEFAULT NULL::date, p_date_to date DEFAULT NULL::date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_result jsonb;
  v_produto_id uuid;
  v_saldo_bruto numeric;
  v_total_entries numeric;
  v_total_value numeric;
  v_avg_cost numeric;
  v_total_manip_gross numeric;
  v_total_clean numeric;
  v_avg_yield numeric;
  v_avg_loss numeric;
  v_manip_count int;
  v_avg_daily_consumption numeric;
  v_days_remaining numeric;
  v_from date;
  v_to date;
  v_perda_kg numeric;
  v_perda_valor numeric;
  v_consumido_kg numeric;
  v_revenue numeric;
  v_cmv_salmon numeric;
  v_estoque_limpo numeric;
  v_config RECORD;
  v_fifo jsonb;
  v_stale jsonb;
BEGIN
  IF NOT has_permission(auth.uid(), 'salmon:read') AND NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (salmon:read ou reports:read).';
  END IF;

  v_from := COALESCE(p_date_from, CURRENT_DATE - INTERVAL '30 days');
  v_to := COALESCE(p_date_to, CURRENT_DATE);

  SELECT id INTO v_produto_id FROM produtos WHERE is_salmon_raw_linked = true AND ativo = true LIMIT 1;

  IF v_produto_id IS NOT NULL THEN
    SELECT COALESCE(SUM(CASE WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
      WHEN direction = 'IN' THEN quantidade ELSE -quantidade END), 0) INTO v_saldo_bruto
    FROM movimentacoes_estoque WHERE produto_id = v_produto_id AND status = 'ATIVO';
  ELSE
    v_saldo_bruto := 0;
  END IF;

  SELECT COALESCE(SUM(gross_kg), 0), COALESCE(SUM(total_value), 0)
  INTO v_total_entries, v_total_value
  FROM salmon_entries WHERE status = 'ACTIVE' AND entry_date BETWEEN v_from AND v_to;

  v_avg_cost := CASE WHEN v_total_entries > 0 THEN ROUND(v_total_value / v_total_entries, 4) ELSE 0 END;

  SELECT COALESCE(SUM(gross_out_kg), 0), COALESCE(SUM(clean_in_kg), 0),
    COALESCE(AVG(CASE WHEN gross_out_kg > 0 THEN clean_in_kg / gross_out_kg * 100 ELSE NULL END), 0),
    COALESCE(AVG(CASE WHEN gross_out_kg > 0 THEN (gross_out_kg - clean_in_kg) / gross_out_kg * 100 ELSE NULL END), 0),
    COUNT(*)
  INTO v_total_manip_gross, v_total_clean, v_avg_yield, v_avg_loss, v_manip_count
  FROM salmon_manipulations WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

  SELECT COALESCE(SUM(gross_out_kg - clean_in_kg), 0),
    COALESCE(SUM((gross_out_kg - clean_in_kg) * CASE WHEN gross_out_kg > 0 THEN cost_per_kg_gross ELSE 0 END), 0)
  INTO v_perda_kg, v_perda_valor
  FROM salmon_manipulations WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

  SELECT COALESCE(SUM(clean_in_kg - COALESCE(leftover_kg, 0)), 0) INTO v_consumido_kg
  FROM salmon_manipulations WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

  -- Revenue from canonical source
  SELECT COALESCE(SUM(faturamento_bruto), 0) INTO v_revenue
  FROM financeiro_fechamento_caixa WHERE data BETWEEN v_from AND v_to;

  DECLARE v_custo_consumo numeric;
  BEGIN
    SELECT COALESCE(SUM((clean_in_kg - COALESCE(leftover_kg, 0)) * cost_per_kg_gross), 0) INTO v_custo_consumo
    FROM salmon_manipulations WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;
    v_cmv_salmon := CASE WHEN v_revenue > 0 THEN ROUND(v_custo_consumo / v_revenue * 100, 2) ELSE NULL END;
  END;

  SELECT COALESCE(SUM(clean_in_kg - COALESCE(leftover_kg, 0)) / GREATEST(COUNT(DISTINCT manipulation_date), 1), 0)
  INTO v_avg_daily_consumption FROM salmon_manipulations
  WHERE status = 'ACTIVE' AND manipulation_date >= CURRENT_DATE - 30;

  v_days_remaining := CASE WHEN v_avg_daily_consumption > 0
    THEN ROUND(GREATEST(v_saldo_bruto, 0) / v_avg_daily_consumption, 1) ELSE -1 END;

  SELECT COALESCE(SUM(CASE WHEN leftover_kg > 0 THEN leftover_kg ELSE clean_in_kg END), 0)
  INTO v_estoque_limpo FROM salmon_manipulations WHERE status = 'ACTIVE';

  SELECT COALESCE(expiration_days, 2), COALESCE(expiration_alert_days, 1),
    COALESCE(stale_days_limit, 7), COALESCE(min_gross_kg, 50), COALESCE(min_clean_kg, 30)
  INTO v_config FROM salmon_config LIMIT 1;

  IF v_config IS NULL THEN v_config := ROW(2, 1, 7, 50, 30); END IF;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb) INTO v_fifo
  FROM (
    SELECT e.id AS entry_id, e.lot, e.sif, e.supplier_name AS supplier, e.entry_date,
      ROUND((e.gross_kg - COALESCE(manip.total_gross, 0))::numeric, 2) AS balance_kg,
      CASE WHEN e.gross_kg > 0 THEN ROUND(e.total_value / e.gross_kg, 4) ELSE 0 END AS cost_per_kg
    FROM salmon_entries e
    LEFT JOIN LATERAL (SELECT SUM(gross_out_kg) AS total_gross FROM salmon_manipulations WHERE entry_id = e.id AND status = 'ACTIVE') manip ON true
    WHERE e.status = 'ACTIVE' AND (e.gross_kg - COALESCE(manip.total_gross, 0)) > 0.01
    ORDER BY e.entry_date ASC LIMIT 3
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb) INTO v_stale
  FROM (
    SELECT e.id AS entry_id, e.lot, e.supplier_name AS supplier,
      ROUND((e.gross_kg - COALESCE(manip.total_gross, 0))::numeric, 2) AS balance_kg,
      COALESCE(manip.last_date, e.entry_date) AS last_movement_date,
      (CURRENT_DATE - COALESCE(manip.last_date, e.entry_date))::int AS days_since_movement
    FROM salmon_entries e
    LEFT JOIN LATERAL (
      SELECT SUM(gross_out_kg) AS total_gross, MAX(manipulation_date) AS last_date
      FROM salmon_manipulations WHERE entry_id = e.id AND status = 'ACTIVE'
    ) manip ON true
    WHERE e.status = 'ACTIVE'
      AND (e.gross_kg - COALESCE(manip.total_gross, 0)) > 0.01
      AND (CURRENT_DATE - COALESCE(manip.last_date, e.entry_date))::int >= v_config.stale_days_limit
    ORDER BY (CURRENT_DATE - COALESCE(manip.last_date, e.entry_date))::int DESC
    LIMIT 5
  ) sub;

  v_result := jsonb_build_object(
    'saldo_bruto_kg', ROUND(GREATEST(v_saldo_bruto, 0)::numeric, 2),
    'total_entries_kg', ROUND(v_total_entries::numeric, 2),
    'total_value', ROUND(v_total_value::numeric, 2),
    'avg_cost_per_kg', ROUND(v_avg_cost::numeric, 4),
    'total_manip_gross_kg', ROUND(v_total_manip_gross::numeric, 2),
    'total_clean_kg', ROUND(v_total_clean::numeric, 2),
    'avg_yield_percent', ROUND(v_avg_yield::numeric, 2),
    'avg_loss_percent', ROUND(v_avg_loss::numeric, 2),
    'manip_count', v_manip_count,
    'avg_daily_consumption_kg', ROUND(v_avg_daily_consumption::numeric, 2),
    'days_remaining', v_days_remaining,
    'perda_kg', ROUND(v_perda_kg::numeric, 2),
    'perda_valor', ROUND(v_perda_valor::numeric, 2),
    'consumido_kg', ROUND(v_consumido_kg::numeric, 2),
    'revenue', ROUND(v_revenue::numeric, 2),
    'cmv_salmon_percent', v_cmv_salmon,
    'estoque_limpo_kg', ROUND(v_estoque_limpo::numeric, 2),
    'low_gross', v_saldo_bruto < v_config.min_gross_kg,
    'low_clean', v_estoque_limpo < v_config.min_clean_kg,
    'fifo_recomendados', v_fifo,
    'lotes_parados', v_stale,
    'computed_at', now()
  );

  RETURN v_result;
END;
$fn$;
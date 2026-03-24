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
  -- New fields
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

  -- Get salmon product
  SELECT id INTO v_produto_id FROM produtos WHERE is_salmon_raw_linked = true AND ativo = true LIMIT 1;

  -- Gross balance from ledger
  IF v_produto_id IS NOT NULL THEN
    SELECT COALESCE(SUM(
      CASE
        WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN direction = 'IN' THEN quantidade
        ELSE -quantidade
      END
    ), 0) INTO v_saldo_bruto
    FROM movimentacoes_estoque
    WHERE produto_id = v_produto_id AND status = 'ATIVO';
  ELSE
    v_saldo_bruto := 0;
  END IF;

  -- Entries summary (period-filtered)
  SELECT COALESCE(SUM(gross_kg), 0), COALESCE(SUM(total_value), 0)
  INTO v_total_entries, v_total_value
  FROM salmon_entries
  WHERE status = 'ACTIVE' AND entry_date BETWEEN v_from AND v_to;

  v_avg_cost := CASE WHEN v_total_entries > 0 THEN ROUND(v_total_value / v_total_entries, 4) ELSE 0 END;

  -- Manipulations summary
  SELECT
    COALESCE(SUM(gross_out_kg), 0),
    COALESCE(SUM(clean_in_kg), 0),
    COALESCE(AVG(CASE WHEN gross_out_kg > 0 THEN clean_in_kg / gross_out_kg * 100 ELSE NULL END), 0),
    COALESCE(AVG(CASE WHEN gross_out_kg > 0 THEN (gross_out_kg - clean_in_kg) / gross_out_kg * 100 ELSE NULL END), 0),
    COUNT(*)
  INTO v_total_manip_gross, v_total_clean, v_avg_yield, v_avg_loss, v_manip_count
  FROM salmon_manipulations
  WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

  -- Perda (kg and valor)
  SELECT
    COALESCE(SUM(gross_out_kg - clean_in_kg), 0),
    COALESCE(SUM(
      (gross_out_kg - clean_in_kg) *
      CASE WHEN gross_out_kg > 0 THEN cost_per_kg_gross ELSE 0 END
    ), 0)
  INTO v_perda_kg, v_perda_valor
  FROM salmon_manipulations
  WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

  -- Consumido (clean - leftover)
  SELECT COALESCE(SUM(clean_in_kg - COALESCE(leftover_kg, 0)), 0)
  INTO v_consumido_kg
  FROM salmon_manipulations
  WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

  -- Revenue for CMV
  SELECT COALESCE(SUM(revenue), 0) INTO v_revenue
  FROM salmon_daily_records
  WHERE record_date BETWEEN v_from AND v_to;

  -- CMV salmon: custo do consumo / revenue
  DECLARE v_custo_consumo numeric;
  BEGIN
    SELECT COALESCE(SUM(
      (clean_in_kg - COALESCE(leftover_kg, 0)) * cost_per_kg_gross
    ), 0) INTO v_custo_consumo
    FROM salmon_manipulations
    WHERE status = 'ACTIVE' AND manipulation_date BETWEEN v_from AND v_to;

    v_cmv_salmon := CASE WHEN v_revenue > 0 THEN ROUND(v_custo_consumo / v_revenue * 100, 2) ELSE NULL END;
  END;

  -- Avg daily consumption (last 30 days)
  SELECT COALESCE(
    SUM(clean_in_kg - COALESCE(leftover_kg, 0)) / GREATEST(COUNT(DISTINCT manipulation_date), 1),
    0
  ) INTO v_avg_daily_consumption
  FROM salmon_manipulations
  WHERE status = 'ACTIVE' AND manipulation_date >= CURRENT_DATE - 30;

  v_days_remaining := CASE WHEN v_avg_daily_consumption > 0
    THEN ROUND(GREATEST(v_saldo_bruto, 0) / v_avg_daily_consumption, 1)
    ELSE -1 END;

  -- Estoque limpo: sum of leftover from active manipulations that still have stock
  -- This is approximate; we sum clean_in_kg for non-leftover-recorded + leftover_kg for recorded
  SELECT COALESCE(SUM(
    CASE WHEN leftover_kg > 0 THEN leftover_kg ELSE clean_in_kg END
  ), 0) INTO v_estoque_limpo
  FROM salmon_manipulations
  WHERE status = 'ACTIVE';
  -- Note: this is a simplified calculation; the real clean stock depends on consumption tracking

  -- Config for expiry
  SELECT
    COALESCE(expiration_days, 2) AS expiration_days,
    COALESCE(expiration_alert_days, 1) AS alert_days,
    COALESCE(stale_days_limit, 7) AS stale_days,
    COALESCE(min_gross_kg, 50) AS min_gross,
    COALESCE(min_clean_kg, 30) AS min_clean
  INTO v_config
  FROM salmon_config
  LIMIT 1;

  IF v_config IS NULL THEN
    v_config := ROW(2, 1, 7, 50, 30);
  END IF;

  -- FIFO recommended lots (top 3 with balance > 0)
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_fifo
  FROM (
    SELECT
      e.id AS entry_id,
      e.lot,
      e.sif,
      e.supplier_name AS supplier,
      e.entry_date,
      ROUND((e.gross_kg - COALESCE(manip.total_gross, 0))::numeric, 2) AS balance_kg,
      CASE WHEN e.gross_kg > 0 THEN ROUND(e.total_value / e.gross_kg, 4) ELSE 0 END AS cost_per_kg
    FROM salmon_entries e
    LEFT JOIN LATERAL (
      SELECT SUM(gross_out_kg) AS total_gross
      FROM salmon_manipulations
      WHERE entry_id = e.id AND status = 'ACTIVE'
    ) manip ON true
    WHERE e.status = 'ACTIVE'
      AND (e.gross_kg - COALESCE(manip.total_gross, 0)) > 0.01
    ORDER BY e.entry_date ASC
    LIMIT 3
  ) sub;

  -- Stale lots (balance > 0, no manipulation in stale_days_limit)
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_stale
  FROM (
    SELECT
      e.id AS entry_id,
      e.lot,
      e.supplier_name AS supplier,
      ROUND((e.gross_kg - COALESCE(manip.total_gross, 0))::numeric, 2) AS balance_kg,
      COALESCE(manip.last_date, e.entry_date) AS last_movement_date,
      (CURRENT_DATE - COALESCE(manip.last_date, e.entry_date))::int AS days_since_movement
    FROM salmon_entries e
    LEFT JOIN LATERAL (
      SELECT SUM(gross_out_kg) AS total_gross, MAX(manipulation_date) AS last_date
      FROM salmon_manipulations
      WHERE entry_id = e.id AND status = 'ACTIVE'
    ) manip ON true
    WHERE e.status = 'ACTIVE'
      AND (e.gross_kg - COALESCE(manip.total_gross, 0)) > 0.01
      AND (CURRENT_DATE - COALESCE(manip.last_date, e.entry_date)) >= v_config.stale_days
    ORDER BY (CURRENT_DATE - COALESCE(manip.last_date, e.entry_date)) DESC
    LIMIT 5
  ) sub;

  v_result := jsonb_build_object(
    'period', jsonb_build_object('from', v_from, 'to', v_to),
    -- Stock
    'saldo_bruto_kg', ROUND(GREATEST(v_saldo_bruto, 0)::numeric, 2),
    'estoque_limpo_kg', ROUND(GREATEST(v_estoque_limpo, 0)::numeric, 2),
    'low_gross', GREATEST(v_saldo_bruto, 0) <= v_config.min_gross,
    'low_clean', GREATEST(v_estoque_limpo, 0) <= v_config.min_clean,
    'min_gross_kg', v_config.min_gross,
    'min_clean_kg', v_config.min_clean,
    -- Entries
    'total_entries_kg', ROUND(v_total_entries::numeric, 2),
    'total_value', ROUND(v_total_value::numeric, 2),
    'avg_cost_per_kg', v_avg_cost,
    'entries_count', (SELECT COUNT(*) FROM salmon_entries WHERE status = 'ACTIVE' AND entry_date BETWEEN v_from AND v_to),
    -- Manipulations
    'total_manipulated_kg', ROUND(v_total_manip_gross::numeric, 2),
    'total_clean_kg', ROUND(v_total_clean::numeric, 2),
    'consumido_kg', ROUND(v_consumido_kg::numeric, 2),
    'avg_yield_percent', ROUND(v_avg_yield::numeric, 2),
    'avg_loss_percent', ROUND(v_avg_loss::numeric, 2),
    'manipulation_count', v_manip_count,
    -- Loss
    'perda_kg', ROUND(v_perda_kg::numeric, 2),
    'perda_valor', ROUND(v_perda_valor::numeric, 2),
    -- Consumption & forecast
    'avg_daily_consumption_kg', ROUND(v_avg_daily_consumption::numeric, 2),
    'days_remaining', v_days_remaining,
    -- Revenue & CMV
    'revenue', ROUND(v_revenue::numeric, 2),
    'cmv_salmon_percent', v_cmv_salmon,
    -- FIFO & stale
    'fifo_recomendados', v_fifo,
    'lotes_parados', v_stale,
    -- Auditoria (localStorage-based, not available server-side)
    'auditoria_compras_overrides', null,
    'computed_at', now()
  );

  RETURN v_result;
END;
$fn$;
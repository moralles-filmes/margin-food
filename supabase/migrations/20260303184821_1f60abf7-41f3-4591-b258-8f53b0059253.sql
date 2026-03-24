
CREATE OR REPLACE FUNCTION public.get_salmon_dashboard_summary(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_result jsonb;
  v_company uuid;
  v_entries_count int;
  v_total_entries_kg numeric;
  v_total_value numeric;
  v_avg_cost_per_kg numeric;
  v_manipulation_count int;
  v_total_manipulated_kg numeric;
  v_total_clean_kg numeric;
  v_total_waste_kg numeric;
  v_avg_yield_percent numeric;
  v_avg_loss_percent numeric;
  v_saldo_bruto_kg numeric;
  v_estoque_limpo_kg numeric;
  v_consumido_kg numeric;
  v_min_gross_kg numeric;
  v_min_clean_kg numeric;
  v_faturamento numeric;
  v_cmv_salmon_cost numeric;
  v_cmv_salmon_percent numeric;
  v_custo_medio_kg_limpo numeric;
  v_fifo jsonb;
  v_lotes_parados jsonb;
  v_avg_daily_consumption numeric;
  v_days_remaining numeric;
  v_perda_valor numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY[
    'salmon:dashboard:view','salmon:dashboard:read','salmon:read','system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Sem permissão (salmon:dashboard:view/read ou salmon:read).';
  END IF;

  -- 1. Entries in period
  SELECT COUNT(*), COALESCE(SUM(gross_kg),0), COALESCE(SUM(total_value),0),
         COALESCE(AVG(CASE WHEN unit_cost>0 THEN unit_cost END),0)
  INTO v_entries_count, v_total_entries_kg, v_total_value, v_avg_cost_per_kg
  FROM salmon_entries
  WHERE company_id=v_company AND status='ACTIVE' AND entry_date BETWEEN p_start AND p_end;

  -- 2. Manipulations in period
  SELECT COUNT(*), COALESCE(SUM(gross_out_kg),0), COALESCE(SUM(clean_in_kg),0),
         COALESCE(SUM(waste_kg),0), COALESCE(AVG(yield_percent),0), COALESCE(AVG(loss_percent),0)
  INTO v_manipulation_count, v_total_manipulated_kg, v_total_clean_kg, v_total_waste_kg,
       v_avg_yield_percent, v_avg_loss_percent
  FROM salmon_manipulations
  WHERE company_id=v_company AND status='ACTIVE' AND manipulation_date BETWEEN p_start AND p_end;

  -- 3. Saldo bruto (all-time ledger)
  SELECT COALESCE(SUM(CASE
    WHEN tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
    WHEN direction='IN' THEN quantidade ELSE -quantidade END),0)
  INTO v_saldo_bruto_kg
  FROM movimentacoes_estoque
  WHERE company_id=v_company AND status='ATIVO' AND source_module='salmon';

  -- 4. Estoque limpo (all-time clean produced)
  SELECT COALESCE(SUM(clean_in_kg),0) INTO v_estoque_limpo_kg
  FROM salmon_manipulations WHERE company_id=v_company AND status='ACTIVE';

  v_consumido_kg := v_total_clean_kg;

  -- 5. Config
  SELECT COALESCE(min_gross_kg,50), COALESCE(min_clean_kg,30)
  INTO v_min_gross_kg, v_min_clean_kg
  FROM salmon_config WHERE company_id=v_company LIMIT 1;
  IF NOT FOUND THEN v_min_gross_kg:=50; v_min_clean_kg:=30; END IF;

  -- 6. Perda valor
  SELECT COALESCE(SUM(waste_kg*cost_per_kg_gross),0) INTO v_perda_valor
  FROM salmon_manipulations
  WHERE company_id=v_company AND status='ACTIVE' AND manipulation_date BETWEEN p_start AND p_end;

  -- 7. Custo médio/kg limpo
  v_custo_medio_kg_limpo := CASE WHEN v_total_clean_kg>0 THEN ROUND(
    (SELECT COALESCE(SUM(gross_out_kg*cost_per_kg_gross),0) FROM salmon_manipulations
     WHERE company_id=v_company AND status='ACTIVE' AND manipulation_date BETWEEN p_start AND p_end
    ) / v_total_clean_kg, 2) ELSE 0 END;

  -- 8. Revenue & CMV
  SELECT COALESCE(SUM(faturamento_bruto),0) INTO v_faturamento
  FROM financeiro_fechamento_caixa WHERE company_id=v_company AND data BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(custo_total),0) INTO v_cmv_salmon_cost
  FROM movimentacoes_estoque
  WHERE company_id=v_company AND data BETWEEN p_start AND p_end AND status='ATIVO'
    AND source_module='salmon' AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') AND direction='OUT';

  v_cmv_salmon_percent := CASE WHEN v_faturamento>0 THEN ROUND(v_cmv_salmon_cost/v_faturamento*100,2) ELSE NULL END;

  -- 9. Avg daily consumption (last 30 days)
  SELECT COALESCE(AVG(daily_clean),0) INTO v_avg_daily_consumption
  FROM (SELECT manipulation_date, SUM(clean_in_kg) as daily_clean
        FROM salmon_manipulations
        WHERE company_id=v_company AND status='ACTIVE' AND manipulation_date>=CURRENT_DATE-30
        GROUP BY manipulation_date) sub;

  v_days_remaining := CASE WHEN v_avg_daily_consumption>0 THEN ROUND(v_saldo_bruto_kg/v_avg_daily_consumption,1) ELSE -1 END;

  -- 10. FIFO recomendados
  SELECT COALESCE(jsonb_agg(row_to_json(f)::jsonb),'[]'::jsonb) INTO v_fifo
  FROM (
    SELECT e.id as entry_id, e.lot, e.sif, e.supplier_name as supplier,
           e.entry_date::text as entry_date,
           ROUND(e.gross_kg - COALESCE(SUM(m.gross_out_kg),0), 2) as balance_kg,
           e.unit_cost as cost_per_kg
    FROM salmon_entries e
    LEFT JOIN salmon_manipulations m ON m.entry_id=e.id AND m.status='ACTIVE'
    WHERE e.company_id=v_company AND e.status='ACTIVE'
    GROUP BY e.id, e.lot, e.sif, e.supplier_name, e.entry_date, e.gross_kg, e.unit_cost
    HAVING (e.gross_kg - COALESCE(SUM(m.gross_out_kg),0)) > 0.01
    ORDER BY e.entry_date ASC
    LIMIT 5
  ) f;

  -- 11. Lotes parados
  SELECT COALESCE(jsonb_agg(row_to_json(lp)::jsonb),'[]'::jsonb) INTO v_lotes_parados
  FROM (
    SELECT e.id as entry_id, e.lot, e.supplier_name as supplier,
           ROUND(e.gross_kg - COALESCE(SUM(m.gross_out_kg),0), 2) as balance_kg,
           COALESCE(MAX(m.manipulation_date)::text, e.entry_date::text) as last_movement_date,
           CURRENT_DATE - COALESCE(MAX(m.manipulation_date), e.entry_date) as days_since_movement
    FROM salmon_entries e
    LEFT JOIN salmon_manipulations m ON m.entry_id=e.id AND m.status='ACTIVE'
    WHERE e.company_id=v_company AND e.status='ACTIVE'
    GROUP BY e.id, e.lot, e.supplier_name, e.entry_date, e.gross_kg
    HAVING (e.gross_kg - COALESCE(SUM(m.gross_out_kg),0)) > 0.01
       AND (CURRENT_DATE - COALESCE(MAX(m.manipulation_date), e.entry_date)) >= 3
    ORDER BY (CURRENT_DATE - COALESCE(MAX(m.manipulation_date), e.entry_date)) DESC
    LIMIT 5
  ) lp;

  v_result := jsonb_build_object(
    'saldo_bruto_kg', ROUND(v_saldo_bruto_kg,2),
    'estoque_limpo_kg', ROUND(v_estoque_limpo_kg,2),
    'low_gross', v_saldo_bruto_kg < v_min_gross_kg,
    'low_clean', v_estoque_limpo_kg < v_min_clean_kg,
    'min_gross_kg', v_min_gross_kg,
    'min_clean_kg', v_min_clean_kg,
    'total_entries_kg', ROUND(v_total_entries_kg,2),
    'total_value', ROUND(v_total_value,2),
    'avg_cost_per_kg', ROUND(v_avg_cost_per_kg,2),
    'entries_count', v_entries_count,
    'total_manipulated_kg', ROUND(v_total_manipulated_kg,2),
    'total_clean_kg', ROUND(v_total_clean_kg,2),
    'consumido_kg', ROUND(v_consumido_kg,2),
    'avg_yield_percent', ROUND(v_avg_yield_percent,2),
    'avg_loss_percent', ROUND(v_avg_loss_percent,2),
    'manipulation_count', v_manipulation_count,
    'perda_kg', ROUND(v_total_waste_kg,2),
    'perda_valor', ROUND(v_perda_valor,2),
    'avg_daily_consumption_kg', ROUND(v_avg_daily_consumption,2),
    'days_remaining', v_days_remaining,
    'revenue', ROUND(v_faturamento,2),
    'cmv_salmon_percent', v_cmv_salmon_percent,
    'custo_medio_kg_limpo', v_custo_medio_kg_limpo,
    'fifo_recomendados', v_fifo,
    'lotes_parados', v_lotes_parados
  );

  RETURN v_result;
END;
$function$;

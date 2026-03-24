
-- ============================================================
-- BATCH 1 PART D.5: Tenant-aware get_relatorios_score (remove non-tenantized compras dependencies)
-- ============================================================

CREATE OR REPLACE FUNCTION public.get_relatorios_score(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_period_days int;
  v_weeks numeric;
  v_custo_consumido numeric;
  v_faturamento numeric;
  v_meta_cmv numeric;
  v_avg_weekly_cost numeric;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  v_period_days := GREATEST((p_end - p_start) + 1, 1);
  v_weeks := GREATEST(v_period_days / 7.0, 1);

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_consumido
  FROM movimentacoes_estoque m
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;

  SELECT COALESCE(SUM(fc.faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa fc
  WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end;

  -- metas_cmv is not tenantized yet; use safe default
  v_meta_cmv := 35;

  SELECT COALESCE(AVG(sub.weekly_cost), 0) INTO v_avg_weekly_cost
  FROM (
    SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
      SUM(m.custo_total) AS weekly_cost
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
      AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
    GROUP BY 1 HAVING SUM(m.custo_total) > 0
  ) sub;

  IF v_avg_weekly_cost = 0 THEN
    SELECT COALESCE(SUM(m.custo_total) / GREATEST(COUNT(DISTINCT EXTRACT(WEEK FROM m.data)), 1), 0)
    INTO v_avg_weekly_cost
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO' AND m.data >= CURRENT_DATE - 28
      AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;
  END IF;

  SELECT jsonb_build_object(
    -- Supplier scoring depends on compras tables not tenantized yet → fail-closed output
    'suppliers', '[]'::jsonb,
    'projecao_4_semanas', (
      SELECT jsonb_agg(jsonb_build_object(
        'week_number', w,
        'week_start', (CURRENT_DATE + ((w - 1) * 7))::text,
        'projected_cost', ROUND(v_avg_weekly_cost::numeric, 2),
        'projected_cmv_percent', CASE WHEN v_faturamento > 0 AND v_weeks > 0
          THEN ROUND(((v_avg_weekly_cost) / (v_faturamento / v_weeks) * 100)::numeric, 2) ELSE NULL END,
        'scenario', 'base'
      ))
      FROM generate_series(1, 4) AS w
    ),
    'custo_consumido', v_custo_consumido,
    'faturamento', v_faturamento,
    'meta_cmv', v_meta_cmv,
    'avg_weekly_cost', ROUND(v_avg_weekly_cost::numeric, 2),
    'perdas_valor', COALESCE((
      SELECT ROUND(SUM(m.custo_total)::numeric, 2)
      FROM movimentacoes_estoque m
      WHERE m.company_id = v_company
        AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
        AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
    ), 0)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

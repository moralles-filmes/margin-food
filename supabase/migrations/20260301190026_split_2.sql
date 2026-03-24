CREATE OR REPLACE FUNCTION public.simulate_relatorios_score(p_start date, p_end date, p_params jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_custo_consumido numeric;
  v_faturamento numeric;
  v_perdas_valor numeric;
  v_meta_cmv numeric;
  v_period_days int;
  v_weeks numeric;
  v_reduzir_desperdicio numeric;
  v_reduzir_consumo numeric;
  v_target_cmv numeric;
  v_novo_perdas numeric;
  v_novo_custo numeric;
  v_novo_cmv numeric;
  v_nova_margem numeric;
  v_economia numeric;
  v_avg_weekly_cost numeric;
  v_explain jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  v_reduzir_desperdicio := COALESCE((p_params->>'reduzir_perdas_percent')::numeric, 0);
  v_reduzir_consumo := COALESCE((p_params->>'reduzir_consumo_percent')::numeric, 0);
  v_target_cmv := COALESCE((p_params->>'target_cmv_percent')::numeric, 0);
  v_period_days := GREATEST((p_end - p_start) + 1, 1);
  v_weeks := GREATEST(v_period_days / 7.0, 1);

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_consumido
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false;

  SELECT COALESCE(SUM(fc.faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa fc WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_perdas_valor
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
    AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO');

  SELECT COALESCE(mc.meta_cmv_total, 35) INTO v_meta_cmv FROM metas_cmv mc WHERE mc.company_id = v_company ORDER BY mc.mes_ano DESC LIMIT 1;
  IF v_meta_cmv IS NULL THEN v_meta_cmv := 35; END IF;

  v_novo_perdas := v_perdas_valor * (1 - v_reduzir_desperdicio / 100.0);
  v_novo_custo := v_custo_consumido - (v_perdas_valor - v_novo_perdas);
  v_novo_custo := v_novo_custo * (1 - v_reduzir_consumo / 100.0);
  v_novo_cmv := CASE WHEN v_faturamento > 0 THEN ROUND((v_novo_custo / v_faturamento * 100)::numeric, 2) ELSE NULL END;
  v_nova_margem := CASE WHEN v_faturamento > 0 THEN ROUND(((v_faturamento - v_novo_custo) / v_faturamento * 100)::numeric, 2) ELSE NULL END;
  v_economia := v_custo_consumido - v_novo_custo;
  v_avg_weekly_cost := v_novo_custo / v_weeks;

  v_explain := '[]'::jsonb;
  IF v_reduzir_desperdicio > 0 THEN
    v_explain := v_explain || jsonb_build_array(jsonb_build_object(
      'variavel', 'Redução desperdício', 'de', ROUND(v_perdas_valor::numeric, 2),
      'para', ROUND(v_novo_perdas::numeric, 2), 'impacto_r$', ROUND((v_perdas_valor - v_novo_perdas)::numeric, 2)));
  END IF;
  IF v_reduzir_consumo > 0 THEN
    v_explain := v_explain || jsonb_build_array(jsonb_build_object(
      'variavel', 'Redução consumo', 'percent', v_reduzir_consumo,
      'impacto_r$', ROUND((v_custo_consumido * v_reduzir_consumo / 100.0)::numeric, 2)));
  END IF;

  RETURN jsonb_build_object(
    'novo_cmv_percent', v_novo_cmv, 'nova_margem_percent', v_nova_margem,
    'economia_mensal_estimativa', ROUND(v_economia::numeric, 2),
    'novo_custo_consumido', ROUND(v_novo_custo::numeric, 2),
    'nova_margem_abs', CASE WHEN v_faturamento > 0 THEN ROUND((v_faturamento - v_novo_custo)::numeric, 2) ELSE NULL END,
    'faturamento', ROUND(v_faturamento::numeric, 2), 'meta_cmv', v_meta_cmv,
    'projecao_4_semanas', (
      SELECT jsonb_agg(jsonb_build_object('week_number', w, 'week_start', (CURRENT_DATE + ((w - 1) * 7))::text,
        'projected_cost', ROUND(v_avg_weekly_cost::numeric, 2),
        'projected_cmv_percent', CASE WHEN v_faturamento > 0 AND v_weeks > 0
          THEN ROUND((v_avg_weekly_cost / (v_faturamento / v_weeks) * 100)::numeric, 2) ELSE NULL END,
        'scenario', 'simulated'))
      FROM generate_series(1, 4) AS w
    ),
    'explain', v_explain
  );
END;
$function$;

-- 4) get_relatorios_tendencia
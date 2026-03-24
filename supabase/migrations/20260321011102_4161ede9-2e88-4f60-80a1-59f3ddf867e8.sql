CREATE OR REPLACE FUNCTION public.get_relatorios_kpis(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_faturamento numeric;
  v_custo_total numeric;
  v_custo_salmon numeric;
  v_cmv_geral numeric;
  v_cmv_salmon numeric;
  v_margem numeric;
  v_impacto numeric;
  v_cmv_categorias jsonb;
  v_tendencia jsonb;
  v_valor_estoque numeric;
  v_abaixo_minimo jsonb;
  v_maiores_perdas jsonb;
  v_ruptura numeric;
  v_total_ativos int;
  v_count_abaixo int;
  v_giro numeric;
  v_cobertura numeric;
  v_consumo_periodo numeric;
  v_semanas_periodo numeric;
  v_parado_percent numeric;
  v_count_parados int;
  v_company uuid;
  v_salmon_bruto_kg numeric;
  v_salmon_limpo_kg numeric;
  v_salmon_valor_estoque numeric;
  v_salmon_compras_valor numeric;
  v_salmon_compras_kg numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  SELECT COALESCE(SUM(faturamento_bruto), 0)
  INTO v_faturamento
  FROM financeiro_fechamento_caixa
  WHERE company_id = v_company
    AND data BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(m.custo_total), 0)
  INTO v_custo_total
  FROM movimentacoes_estoque m
  JOIN produtos p
    ON p.id = m.produto_id
   AND p.company_id = v_company
   AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO'
    AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND m.direction = 'OUT';

  SELECT COALESCE(SUM(m.custo_total), 0)
  INTO v_custo_salmon
  FROM movimentacoes_estoque m
  JOIN produtos p
    ON p.id = m.produto_id
   AND p.company_id = v_company
   AND p.conta_no_cmv = true
  WHERE m.company_id = v_company
    AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO'
    AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND m.direction = 'OUT'
    AND m.source_module = 'salmon';

  v_cmv_geral := CASE WHEN v_faturamento > 0 THEN ROUND(v_custo_total / v_faturamento * 100, 2) ELSE NULL END;
  v_cmv_salmon := CASE WHEN v_faturamento > 0 THEN ROUND(v_custo_salmon / v_faturamento * 100, 2) ELSE NULL END;
  v_margem := CASE WHEN v_cmv_geral IS NOT NULL THEN ROUND(100 - v_cmv_geral, 2) ELSE NULL END;
  v_impacto := CASE WHEN v_custo_total > 0 THEN ROUND(v_custo_salmon / v_custo_total * 100, 2) ELSE NULL END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.custo_consumido DESC), '[]'::jsonb)
  INTO v_cmv_categorias
  FROM (
    SELECT
      COALESCE(p.categoria, 'Outros') AS categoria,
      ROUND(SUM(m.custo_total)::numeric, 2) AS custo_consumido,
      CASE WHEN v_custo_total > 0 THEN ROUND(SUM(m.custo_total) / v_custo_total * 100, 2) ELSE 0 END AS percent_do_total
    FROM movimentacoes_estoque m
    JOIN produtos p
      ON p.id = m.produto_id
     AND p.company_id = v_company
     AND p.conta_no_cmv = true
    WHERE m.company_id = v_company
      AND m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
      AND m.direction = 'OUT'
    GROUP BY p.categoria
    HAVING SUM(m.custo_total) > 0
  ) sub;

  WITH monthly_cost AS (
    SELECT
      EXTRACT(YEAR FROM m.data)::int AS ano,
      EXTRACT(MONTH FROM m.data)::int AS mes,
      ROUND(SUM(m.custo_total)::numeric, 2) AS custo
    FROM movimentacoes_estoque m
    JOIN produtos p
      ON p.id = m.produto_id
     AND p.company_id = v_company
     AND p.conta_no_cmv = true
    WHERE m.company_id = v_company
      AND m.data BETWEEN (p_start - INTERVAL '3 months') AND p_end
      AND m.status = 'ATIVO'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
      AND m.direction = 'OUT'
    GROUP BY EXTRACT(YEAR FROM m.data)::int, EXTRACT(MONTH FROM m.data)::int
  ),
  monthly_revenue AS (
    SELECT
      EXTRACT(YEAR FROM f.data)::int AS ano,
      EXTRACT(MONTH FROM f.data)::int AS mes,
      ROUND(SUM(f.faturamento_bruto)::numeric, 2) AS faturamento
    FROM financeiro_fechamento_caixa f
    WHERE f.company_id = v_company
      AND f.data BETWEEN (p_start - INTERVAL '3 months') AND p_end
    GROUP BY EXTRACT(YEAR FROM f.data)::int, EXTRACT(MONTH FROM f.data)::int
  )
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.ano, sub.mes), '[]'::jsonb)
  INTO v_tendencia
  FROM (
    SELECT
      mc.ano,
      mc.mes,
      COALESCE(mr.faturamento, 0) AS faturamento,
      mc.custo,
      CASE
        WHEN COALESCE(mr.faturamento, 0) > 0 THEN ROUND(mc.custo / mr.faturamento * 100, 2)
        ELSE NULL
      END AS cmv_percent
    FROM monthly_cost mc
    LEFT JOIN monthly_revenue mr
      ON mr.ano = mc.ano
     AND mr.mes = mc.mes
  ) sub;

  SELECT COALESCE(SUM(p.saldo * p.custo_unitario), 0)
  INTO v_valor_estoque
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true;

  SELECT COUNT(*)
  INTO v_total_ativos
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true;

  SELECT COUNT(*)
  INTO v_count_abaixo
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true
    AND p.saldo < p.estoque_minimo;

  v_ruptura := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_abaixo::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.diff DESC), '[]'::jsonb)
  INTO v_abaixo_minimo
  FROM (
    SELECT
      p.id AS produto_id,
      p.nome,
      p.saldo,
      p.estoque_minimo AS minimo,
      (p.estoque_minimo - p.saldo) AS diff
    FROM produtos p
    WHERE p.company_id = v_company
      AND p.ativo = true
      AND p.saldo < p.estoque_minimo
    ORDER BY diff DESC
    LIMIT 5
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.perda_valor DESC), '[]'::jsonb)
  INTO v_maiores_perdas
  FROM (
    SELECT
      m.produto_id,
      p.nome,
      ROUND(SUM(m.quantidade)::numeric, 3) AS perda_kg,
      ROUND(SUM(m.custo_total)::numeric, 2) AS perda_valor
    FROM movimentacoes_estoque m
    JOIN produtos p
      ON p.id = m.produto_id
     AND p.company_id = v_company
    WHERE m.company_id = v_company
      AND m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO'
      AND m.tipo IN ('PERDA', 'VENCIMENTO')
    GROUP BY m.produto_id, p.nome
    ORDER BY perda_valor DESC
    LIMIT 5
  ) sub;

  SELECT COALESCE(SUM(m.custo_total), 0)
  INTO v_consumo_periodo
  FROM movimentacoes_estoque m
  WHERE m.company_id = v_company
    AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO'
    AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND m.direction = 'OUT';

  v_semanas_periodo := GREATEST(EXTRACT(EPOCH FROM (p_end - p_start)) / 604800, 1);
  v_giro := CASE WHEN v_valor_estoque > 0 THEN ROUND(v_consumo_periodo / v_valor_estoque, 2) ELSE 0 END;
  v_cobertura := CASE WHEN v_consumo_periodo > 0 THEN ROUND(v_valor_estoque / (v_consumo_periodo / v_semanas_periodo), 1) ELSE 0 END;

  SELECT COUNT(*)
  INTO v_count_parados
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true
    AND p.saldo > 0
    AND NOT EXISTS (
      SELECT 1
      FROM movimentacoes_estoque m
      WHERE m.company_id = v_company
        AND m.produto_id = p.id
        AND m.status = 'ATIVO'
        AND m.created_at >= (CURRENT_DATE - 28)
    );

  v_parado_percent := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_parados::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(SUM(
    se.gross_kg - COALESCE((
      SELECT SUM(sm.gross_out_kg)
      FROM salmon_manipulations sm
      WHERE sm.entry_id = se.id
        AND sm.company_id = v_company
        AND sm.status = 'ACTIVE'
    ), 0)
  ), 0)
  INTO v_salmon_bruto_kg
  FROM salmon_entries se
  WHERE se.company_id = v_company
    AND se.status = 'ACTIVE';

  SELECT COALESCE(SUM(sll.kg_restante), 0)
  INTO v_salmon_limpo_kg
  FROM salmon_lotes_limpos sll
  WHERE sll.company_id = v_company
    AND sll.status IN ('FRESCO', 'VENCE_HOJE');

  SELECT COALESCE(SUM(se.total_value), 0), COALESCE(SUM(se.gross_kg), 0)
  INTO v_salmon_compras_valor, v_salmon_compras_kg
  FROM salmon_entries se
  WHERE se.company_id = v_company
    AND se.status = 'ACTIVE'
    AND se.entry_date BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(sub.balance_kg * sub.cost_per_kg), 0)
  INTO v_salmon_valor_estoque
  FROM (
    SELECT
      se.id,
      se.gross_kg - COALESCE((
        SELECT SUM(sm.gross_out_kg)
        FROM salmon_manipulations sm
        WHERE sm.entry_id = se.id
          AND sm.company_id = v_company
          AND sm.status = 'ACTIVE'
      ), 0) AS balance_kg,
      CASE WHEN se.gross_kg > 0 THEN se.total_value / se.gross_kg ELSE 0 END AS cost_per_kg
    FROM salmon_entries se
    WHERE se.company_id = v_company
      AND se.status = 'ACTIVE'
  ) sub
  WHERE sub.balance_kg > 0.01;

  v_result := jsonb_build_object(
    'faturamento_total', ROUND(v_faturamento::numeric, 2),
    'faturamento_source', 'financeiro_fechamento_caixa',
    'custo_consumido_total', ROUND(v_custo_total::numeric, 2),
    'custo_salmon', ROUND(v_custo_salmon::numeric, 2),
    'cmv_geral_percent', v_cmv_geral,
    'cmv_salmon_percent', v_cmv_salmon,
    'margem_bruta_percent', v_margem,
    'impacto_salmon_percent', v_impacto,
    'meta_cmv', COALESCE((SELECT (value::numeric) FROM app_config WHERE key = 'meta_cmv'), 35),
    'cmv_por_categoria', v_cmv_categorias,
    'tendencia_cmv_3_meses', v_tendencia,
    'valor_total_estoque', ROUND(v_valor_estoque::numeric, 2),
    'itens_abaixo_minimo_count', v_count_abaixo,
    'itens_abaixo_minimo_top5', v_abaixo_minimo,
    'maiores_perdas_top5', v_maiores_perdas,
    'ruptura_percent', v_ruptura,
    'giro_estoque', v_giro,
    'cobertura_semanas', v_cobertura,
    'parado_percent', v_parado_percent,
    'parado_count', v_count_parados,
    'total_ativos', v_total_ativos,
    'perdas_kg', COALESCE((SELECT ROUND(SUM(m.quantidade)::numeric, 3) FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')), 0),
    'perdas_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')), 0),
    'salmon_bruto_kg', ROUND(v_salmon_bruto_kg::numeric, 3),
    'salmon_limpo_kg', ROUND(v_salmon_limpo_kg::numeric, 3),
    'salmon_valor_estoque', ROUND(v_salmon_valor_estoque::numeric, 2),
    'salmon_compras_valor', ROUND(v_salmon_compras_valor::numeric, 2),
    'salmon_compras_kg', ROUND(v_salmon_compras_kg::numeric, 3)
  );

  RETURN v_result;
END;
$$;
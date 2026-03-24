CREATE OR REPLACE FUNCTION public.get_relatorios_kpis(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
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
BEGIN
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  -- ═══ FATURAMENTO from canonical source ═══
  SELECT COALESCE(SUM(faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa
  WHERE data BETWEEN p_start AND p_end;

  -- Custo consumido total
  SELECT COALESCE(SUM(custo_total), 0) INTO v_custo_total
  FROM movimentacoes_estoque
  WHERE data BETWEEN p_start AND p_end
    AND status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND direction = 'OUT';

  SELECT COALESCE(SUM(custo_total), 0) INTO v_custo_salmon
  FROM movimentacoes_estoque
  WHERE data BETWEEN p_start AND p_end
    AND status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND direction = 'OUT'
    AND source_module = 'salmon';

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
      CASE WHEN v_custo_total > 0
        THEN ROUND(SUM(m.custo_total) / v_custo_total * 100, 2)
        ELSE 0 END AS percent_do_total
    FROM movimentacoes_estoque m
    LEFT JOIN produtos p ON p.id = m.produto_id
    WHERE m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
      AND m.direction = 'OUT'
    GROUP BY COALESCE(p.categoria, 'Outros')
  ) sub;

  -- Tendência CMV 3 meses using fechamento_caixa
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.ano, sub.mes), '[]'::jsonb)
  INTO v_tendencia
  FROM (
    SELECT
      g.ano, g.mes,
      COALESCE(rev.total, 0) AS faturamento,
      COALESCE(cost.total, 0) AS custo,
      CASE WHEN COALESCE(rev.total, 0) > 0
        THEN ROUND(COALESCE(cost.total, 0) / rev.total * 100, 2)
        ELSE 0 END AS cmv_percent
    FROM (
      SELECT EXTRACT(YEAR FROM d)::int AS ano, EXTRACT(MONTH FROM d)::int AS mes,
             date_trunc('month', d)::date AS m_start,
             (date_trunc('month', d) + INTERVAL '1 month' - INTERVAL '1 day')::date AS m_end
      FROM generate_series(
        date_trunc('month', CURRENT_DATE - INTERVAL '2 months')::date,
        date_trunc('month', CURRENT_DATE)::date,
        '1 month'::interval
      ) d
    ) g
    LEFT JOIN LATERAL (
      SELECT SUM(faturamento_bruto) AS total FROM financeiro_fechamento_caixa
      WHERE data BETWEEN g.m_start AND g.m_end
    ) rev ON true
    LEFT JOIN LATERAL (
      SELECT SUM(custo_total) AS total FROM movimentacoes_estoque
      WHERE data BETWEEN g.m_start AND g.m_end
        AND status = 'ATIVO'
        AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
        AND direction = 'OUT'
    ) cost ON true
  ) sub;

  -- ═══ ESTOQUE TAB ═══
  SELECT COALESCE(SUM(sub.saldo * sub.unit_cost), 0)
  INTO v_valor_estoque
  FROM (
    SELECT
      p.id,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
            WHEN m.direction = 'IN' THEN m.quantidade
            ELSE -m.quantidade
          END
        )
        FROM movimentacoes_estoque m
        WHERE m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) AS saldo,
      COALESCE(
        NULLIF(p.avg30_cost_base_unit, 0),
        NULLIF(p.last_cost_base_unit, 0),
        NULLIF(p.default_cost_base_unit, 0),
        CASE WHEN COALESCE(p.fator_conversao_padrao, 1) > 0
          THEN p.custo_padrao / COALESCE(NULLIF(p.fator_conversao_padrao, 0), 1)
          ELSE 0 END
      ) AS unit_cost
    FROM produtos p
    WHERE p.ativo = true
  ) sub
  WHERE sub.saldo > 0;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_abaixo_minimo
  FROM (
    SELECT p.id AS produto_id, p.nome_produto AS nome,
      COALESCE(s.saldo, 0) AS saldo, p.estoque_minimo AS minimo
    FROM produtos p
    LEFT JOIN LATERAL (
      SELECT SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
        WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo
      FROM movimentacoes_estoque m WHERE m.produto_id = p.id AND m.status = 'ATIVO'
    ) s ON true
    WHERE p.ativo = true AND p.estoque_minimo > 0 AND COALESCE(s.saldo, 0) < p.estoque_minimo
    ORDER BY (p.estoque_minimo - COALESCE(s.saldo, 0)) DESC LIMIT 5
  ) sub;

  SELECT COUNT(*) INTO v_total_ativos FROM produtos WHERE ativo = true;
  SELECT COUNT(*) INTO v_count_abaixo
  FROM produtos p
  WHERE p.ativo = true AND p.estoque_minimo > 0
    AND COALESCE((SELECT SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
      WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
      FROM movimentacoes_estoque m WHERE m.produto_id = p.id AND m.status = 'ATIVO'), 0) < p.estoque_minimo;

  v_ruptura := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_abaixo::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb), '[]'::jsonb)
  INTO v_maiores_perdas
  FROM (
    SELECT p.id AS produto_id, p.nome_produto AS nome,
      ROUND(SUM(m.quantidade)::numeric, 2) AS perda_kg,
      ROUND(SUM(m.custo_total)::numeric, 2) AS perda_valor
    FROM movimentacoes_estoque m JOIN produtos p ON p.id = m.produto_id
    WHERE m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO'
      AND m.tipo IN ('BAIXA_PERDA') AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    GROUP BY p.id, p.nome_produto HAVING SUM(m.custo_total) > 0
    ORDER BY SUM(m.custo_total) DESC LIMIT 5
  ) sub;

  v_semanas_periodo := GREATEST(1, EXTRACT(EPOCH FROM (p_end - p_start)) / (7 * 86400));
  SELECT COALESCE(SUM(custo_total), 0) INTO v_consumo_periodo
  FROM movimentacoes_estoque
  WHERE data BETWEEN p_start AND p_end AND status = 'ATIVO'
    AND tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND direction = 'OUT' AND tipo = 'SAIDA';

  v_giro := CASE WHEN v_valor_estoque > 0 THEN ROUND(v_custo_total / v_valor_estoque, 2) ELSE 0 END;

  DECLARE v_consumo_semanal numeric;
  BEGIN
    v_consumo_semanal := v_consumo_periodo / v_semanas_periodo;
    v_cobertura := CASE WHEN v_consumo_semanal > 0 THEN ROUND(v_valor_estoque / v_consumo_semanal, 1) ELSE 0 END;
  END;

  SELECT COUNT(*) INTO v_count_parados
  FROM produtos p
  WHERE p.ativo = true
    AND COALESCE((SELECT SUM(CASE WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
      WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
      FROM movimentacoes_estoque m WHERE m.produto_id = p.id AND m.status = 'ATIVO'), 0) > 0
    AND NOT EXISTS (SELECT 1 FROM movimentacoes_estoque m
      WHERE m.produto_id = p.id AND m.status = 'ATIVO' AND m.created_at >= (CURRENT_DATE - 28));

  v_parado_percent := CASE WHEN v_total_ativos > 0
    THEN ROUND(v_count_parados::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  v_result := jsonb_build_object(
    'faturamento_total', ROUND(v_faturamento::numeric, 2),
    'faturamento_source', 'financeiro_fechamento_caixa',
    'custo_consumido_total', ROUND(v_custo_total::numeric, 2),
    'custo_salmon', ROUND(v_custo_salmon::numeric, 2),
    'cmv_geral_percent', v_cmv_geral,
    'cmv_salmon_percent', v_cmv_salmon,
    'margem_bruta_percent', v_margem,
    'impacto_salmon_percent', v_impacto,
    'meta_cmv', 35,
    'cmv_por_categoria', v_cmv_categorias,
    'tendencia_cmv_3_meses', v_tendencia,
    'valor_total_estoque', ROUND(v_valor_estoque::numeric, 2),
    'custo_source', 'avg30 > last > default > custo_padrao/fator',
    'itens_abaixo_minimo_count', v_count_abaixo,
    'itens_abaixo_minimo_top5', v_abaixo_minimo,
    'maiores_perdas_top5', v_maiores_perdas,
    'ruptura_percent', v_ruptura,
    'giro_estoque', v_giro,
    'cobertura_semanas', v_cobertura,
    'parado_percent', v_parado_percent,
    'parado_count', v_count_parados,
    'total_ativos', v_total_ativos,
    'perdas_kg', (SELECT COALESCE(SUM(quantidade), 0) FROM movimentacoes_estoque
      WHERE data BETWEEN p_start AND p_end AND status = 'ATIVO' AND tipo = 'BAIXA_PERDA'),
    'perdas_valor', (SELECT COALESCE(SUM(custo_total), 0) FROM movimentacoes_estoque
      WHERE data BETWEEN p_start AND p_end AND status = 'ATIVO' AND tipo = 'BAIXA_PERDA'),
    'computed_at', now()
  );

  RETURN v_result;
END;
$fn$;

-- 5b) get_relatorios_tendencia: use fechamento_caixa
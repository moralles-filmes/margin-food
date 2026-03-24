CREATE OR REPLACE FUNCTION public.get_relatorios_tendencia(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_prev_start date;
  v_prev_end date;
  v_period_days int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  v_period_days := (p_end - p_start) + 1;
  v_prev_end := p_start - 1;
  v_prev_start := v_prev_end - v_period_days + 1;

  SELECT jsonb_build_object(
    'custo_por_semana', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('label', sub.label, 'custo', sub.custo_total) ORDER BY sub.wk)
      FROM (
        SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
          'W' || CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS label,
          ROUND(SUM(m.custo_total)::numeric, 2) AS custo_total
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
        GROUP BY 1
      ) sub
    ), '[]'::jsonb),

    'cmv_por_semana', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'label', sub.label, 'faturamento', sub.faturamento, 'custo', sub.custo,
        'cmv', CASE WHEN sub.faturamento > 0 THEN ROUND((sub.custo / sub.faturamento * 100)::numeric, 2) ELSE NULL END
      ) ORDER BY sub.wk)
      FROM (
        SELECT wk, 'W' || wk AS label, COALESCE(c.custo, 0) AS custo, COALESCE(r.faturamento, 0) AS faturamento
        FROM (
          SELECT CEIL(EXTRACT(DAY FROM m.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
            ROUND(SUM(m.custo_total)::numeric, 2) AS custo
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
            AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.internal_transfer = false
          GROUP BY 1
        ) c
        FULL OUTER JOIN (
          SELECT CEIL(EXTRACT(DAY FROM fc.data::timestamp - p_start::timestamp + INTERVAL '1 day') / 7.0)::int AS wk,
            ROUND(SUM(fc.faturamento_bruto)::numeric, 2) AS faturamento
          FROM financeiro_fechamento_caixa fc
          WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end
          GROUP BY 1
        ) r USING (wk)
      ) sub
    ), '[]'::jsonb),

    'comparativo_mes', jsonb_build_object(
      'current', jsonb_build_object(
        'compras_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')), 0),
        'consumo_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO', 'BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
          AND m.internal_transfer = false), 0),
        'faturamento', COALESCE((SELECT ROUND(SUM(fc.faturamento_bruto)::numeric, 2) FROM financeiro_fechamento_caixa fc
          WHERE fc.company_id = v_company AND fc.data BETWEEN p_start AND p_end), 0),
        'perdas_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')), 0)
      ),
      'previous', jsonb_build_object(
        'compras_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN v_prev_start AND v_prev_end AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')), 0),
        'consumo_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN v_prev_start AND v_prev_end AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO', 'BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
          AND m.internal_transfer = false), 0),
        'faturamento', COALESCE((SELECT ROUND(SUM(fc.faturamento_bruto)::numeric, 2) FROM financeiro_fechamento_caixa fc
          WHERE fc.company_id = v_company AND fc.data BETWEEN v_prev_start AND v_prev_end), 0),
        'perdas_valor', COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m
          WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN v_prev_start AND v_prev_end
          AND m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')), 0)
      )
    ),

    'volatilidade', jsonb_build_object(
      -- Replace untenantized salmon_entries with stock ledger (tenant-aware)
      'stddev_salmon', COALESCE((SELECT ROUND(STDDEV(m.custo_unitario)::numeric, 4)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
          AND m.source_module = 'salmon'
          AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.custo_unitario > 0), 0),
      'stddev_geral', COALESCE((SELECT ROUND(STDDEV(m.custo_unitario)::numeric, 4)
        FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
        AND m.direction = 'IN' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.custo_unitario > 0), 0)
    ),

    'heatmap_dia_semana', COALESCE((
      SELECT jsonb_agg(jsonb_build_object('dow', sub.dow, 'label', sub.label,
        'custo_total', sub.custo_total, 'consumo_qtd', sub.consumo_qtd, 'perdas_valor', sub.perdas_valor) ORDER BY sub.dow)
      FROM (
        SELECT d.dow,
          CASE d.dow WHEN 0 THEN 'Dom' WHEN 1 THEN 'Seg' WHEN 2 THEN 'Ter'
            WHEN 3 THEN 'Qua' WHEN 4 THEN 'Qui' WHEN 5 THEN 'Sex' WHEN 6 THEN 'Sáb' END AS label,
          COALESCE(SUM(m.custo_total) FILTER (WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') AND m.internal_transfer = false), 0) AS custo_total,
          COALESCE(SUM(m.quantidade) FILTER (WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') AND m.internal_transfer = false), 0) AS consumo_qtd,
          COALESCE(SUM(m.custo_total) FILTER (WHERE m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')), 0) AS perdas_valor
        FROM generate_series(0, 6) AS d(dow)
        LEFT JOIN movimentacoes_estoque m ON m.company_id = v_company AND EXTRACT(DOW FROM m.data) = d.dow AND m.status = 'ATIVO' AND m.data BETWEEN p_start AND p_end
        GROUP BY d.dow
      ) sub
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
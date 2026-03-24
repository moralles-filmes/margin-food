CREATE OR REPLACE FUNCTION public.get_report_items_summary(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  WITH item_data AS (
    SELECT
      p.id,
      p.nome_produto,
      p.categoria,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.internal_transfer = false
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS custo_consumido,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.internal_transfer = false
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS consumo_qtd,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_qtd,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_valor,
      COALESCE((
        SELECT CASE WHEN prev.cu > 0 THEN ROUND(((last.cu - prev.cu) / prev.cu * 100)::numeric, 1) ELSE 0 END
        FROM (
          SELECT custo_unitario AS cu FROM movimentacoes_estoque
          WHERE company_id = v_company
            AND produto_id = p.id AND status = 'ATIVO' AND direction = 'IN'
            AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          ORDER BY data DESC, created_at DESC LIMIT 1
        ) last,
        (
          SELECT custo_unitario AS cu FROM movimentacoes_estoque
          WHERE company_id = v_company
            AND produto_id = p.id AND status = 'ATIVO' AND direction = 'IN'
            AND tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          ORDER BY data DESC, created_at DESC LIMIT 1 OFFSET 1
        ) prev
      ), 0) AS variacao_preco,
      COALESCE((
        SELECT SUM(CASE
          WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) AS saldo,
      CASE WHEN COALESCE((
        SELECT SUM(CASE
          WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
          WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) > 0 THEN
        ROUND((COALESCE((
          SELECT SUM(m.quantidade)
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.produto_id = p.id AND m.status = 'ATIVO'
            AND m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
            AND m.internal_transfer = false AND m.data BETWEEN p_start AND p_end
        ), 0) / GREATEST(COALESCE((
          SELECT SUM(CASE
            WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
            WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END)
          FROM movimentacoes_estoque m
          WHERE m.company_id = v_company
            AND m.produto_id = p.id AND m.status = 'ATIVO'
        ), 0), 0.01))::numeric, 2)
      ELSE 0 END AS giro
    FROM produtos p
    WHERE p.ativo = true
      AND p.company_id = v_company
  ),
  total AS (SELECT COALESCE(SUM(custo_consumido), 0) AS total_custo FROM item_data),
  with_pct AS (
    SELECT d.*, CASE WHEN t.total_custo > 0 THEN ROUND((d.custo_consumido / t.total_custo * 100)::numeric, 1) ELSE 0 END AS pct_cmv
    FROM item_data d, total t
  )
  SELECT jsonb_build_object(
    'total_itens_ativos', (SELECT COUNT(*) FROM with_pct),
    'total_custo_consumido', (SELECT total_custo FROM total),
    'total_perdas_valor', (SELECT COALESCE(SUM(perdas_valor), 0) FROM with_pct),
    'maior_cmv', (SELECT jsonb_build_object('nome', nome_produto, 'valor', pct_cmv) FROM with_pct ORDER BY pct_cmv DESC LIMIT 1),
    'maior_aumento', (SELECT jsonb_build_object('nome', nome_produto, 'valor', variacao_preco) FROM with_pct WHERE variacao_preco > 0 ORDER BY variacao_preco DESC LIMIT 1),
    'menor_giro', (SELECT jsonb_build_object('nome', nome_produto, 'valor', giro) FROM with_pct WHERE consumo_qtd > 0 ORDER BY giro ASC LIMIT 1),
    'maior_desperdicio', (SELECT jsonb_build_object('nome', nome_produto, 'valor', CASE WHEN (consumo_qtd + perdas_qtd) > 0 THEN ROUND((perdas_qtd / (consumo_qtd + perdas_qtd) * 100)::numeric, 1) ELSE 0 END) FROM with_pct WHERE perdas_qtd > 0 ORDER BY perdas_qtd DESC LIMIT 1),
    'top_custo', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome_produto, 'valor', custo_consumido)) FROM (SELECT * FROM with_pct ORDER BY custo_consumido DESC LIMIT 10) s), '[]'::jsonb),
    'top_variacao', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome_produto, 'valor', variacao_preco)) FROM (SELECT * FROM with_pct WHERE variacao_preco > 0 ORDER BY variacao_preco DESC LIMIT 10) s), '[]'::jsonb),
    'top_cmv', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome_produto, 'valor', pct_cmv)) FROM (SELECT * FROM with_pct ORDER BY pct_cmv DESC LIMIT 10) s), '[]'::jsonb),
    'top_menor_giro', COALESCE((SELECT jsonb_agg(jsonb_build_object('nome', nome_produto, 'valor', giro)) FROM (SELECT * FROM with_pct WHERE consumo_qtd > 0 ORDER BY giro ASC LIMIT 10) s), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
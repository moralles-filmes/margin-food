CREATE OR REPLACE FUNCTION public.get_report_items_summary(p_start date, p_end date)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
      AND p.conta_no_cmv = true
  ),
  total AS (SELECT COALESCE(SUM(custo_consumido), 0) AS total_custo FROM item_data),
  with_pct AS (
    SELECT d.*,
      CASE WHEN t.total_custo > 0 THEN ROUND((d.custo_consumido / t.total_custo * 100)::numeric, 1) ELSE 0 END AS pct_custo,
      CASE WHEN (d.consumo_qtd + d.perdas_qtd) > 0
        THEN ROUND((d.perdas_qtd / (d.consumo_qtd + d.perdas_qtd) * 100)::numeric, 1) ELSE 0 END AS desperdicio_pct
    FROM item_data d, total t
  )
  SELECT jsonb_build_object(
    'total_custo', (SELECT total_custo FROM total),
    'total_itens', (SELECT COUNT(*) FROM with_pct),
    'top_10_custo', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome_produto, 'categoria', categoria,
      'custo_consumido', ROUND(custo_consumido::numeric, 2),
      'pct_custo', pct_custo, 'consumo_qtd', ROUND(consumo_qtd::numeric, 2),
      'perdas_qtd', ROUND(perdas_qtd::numeric, 2), 'perdas_valor', ROUND(perdas_valor::numeric, 2),
      'variacao_preco', variacao_preco, 'saldo', ROUND(saldo::numeric, 2),
      'giro', giro, 'desperdicio_pct', desperdicio_pct
    )), '[]'::jsonb) FROM (SELECT * FROM with_pct ORDER BY custo_consumido DESC LIMIT 10) sub),
    'top_5_desperdicio', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'id', id, 'nome', nome_produto, 'categoria', categoria,
      'perdas_qtd', ROUND(perdas_qtd::numeric, 2), 'perdas_valor', ROUND(perdas_valor::numeric, 2),
      'desperdicio_pct', desperdicio_pct
    )), '[]'::jsonb) FROM (SELECT * FROM with_pct WHERE perdas_qtd > 0 ORDER BY desperdicio_pct DESC LIMIT 5) sub),
    'categorias', (SELECT COALESCE(jsonb_agg(jsonb_build_object(
      'categoria', categoria, 'custo', ROUND(custo::numeric, 2),
      'pct', CASE WHEN (SELECT total_custo FROM total) > 0
        THEN ROUND((custo / (SELECT total_custo FROM total) * 100)::numeric, 1)
        ELSE 0 END
    )), '[]'::jsonb) FROM (
      SELECT categoria, SUM(custo_consumido) AS custo FROM with_pct GROUP BY categoria ORDER BY custo DESC
    ) sub)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- 6) list_report_items_cursor
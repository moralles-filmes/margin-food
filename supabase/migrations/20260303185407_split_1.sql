CREATE OR REPLACE FUNCTION public.list_report_items_cursor(
  p_start date, p_end date,
  p_limit integer DEFAULT 20,
  p_cursor_created_at timestamp with time zone DEFAULT NULL,
  p_cursor_id uuid DEFAULT NULL,
  p_search text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_sort_key text DEFAULT 'consumo',
  p_sort_asc boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_actual_limit int := LEAST(COALESCE(p_limit, 20), 100);
  v_result jsonb;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  WITH item_metrics AS (
    SELECT
      p.id AS produto_id,
      p.nome_produto,
      p.categoria,
      p.unidade_medida,
      COALESCE((
        SELECT SUM(
          CASE
            WHEN m.tipo IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO') THEN 0
            WHEN m.direction = 'IN' THEN m.quantidade
            ELSE -m.quantidade
          END
        )
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), 0) AS saldo_atual,
      COALESCE(NULLIF(p.avg30_cost_base_unit, 0), NULLIF(p.last_cost_base_unit, 0), NULLIF(p.default_cost_base_unit, 0), 0) AS custo_base,
      COALESCE((
        SELECT CASE WHEN SUM(m.quantidade) > 0 THEN SUM(m.custo_total) / SUM(m.quantidade) ELSE NULL END
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), NULLIF(p.last_cost_purchase_unit, 0)) AS custo_medio_periodo,
      COALESCE((
        SELECT m.custo_unitario
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
        ORDER BY m.data DESC, m.created_at DESC
        LIMIT 1
      ), NULLIF(p.last_cost_purchase_unit, 0), 0) AS ultimo_preco,
      -- consumo_periodo: all OUT movements (including salmon internal transfers)
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS consumo_periodo,
      COALESCE((
        SELECT SUM(m.custo_total)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS custo_consumido,
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.tipo IN ('BAIXA_PERDA','SAIDA_PERDA','SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS perdas_qtd,
      COALESCE((
        SELECT MAX(m.created_at)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
      ), p.created_at) AS last_movement_at
    FROM produtos p
    WHERE p.ativo = true
      AND p.company_id = v_company
      AND p.conta_no_cmv = true
      AND (p_search IS NULL OR p.nome_produto ILIKE '%' || p_search || '%')
      AND (p_categoria IS NULL OR p.categoria = p_categoria)
  ),
  enriched AS (
    SELECT
      im.*,
      ROUND((im.saldo_atual * im.custo_base)::numeric, 2) AS valor_estoque,
      CASE WHEN im.custo_medio_periodo IS NOT NULL AND im.custo_medio_periodo > 0
        THEN ROUND(((im.ultimo_preco - im.custo_medio_periodo) / im.custo_medio_periodo * 100)::numeric, 1)
        ELSE 0 END AS variacao_percent,
      CASE WHEN (im.consumo_periodo + im.perdas_qtd) > 0
        THEN ROUND((im.perdas_qtd / (im.consumo_periodo + im.perdas_qtd) * 100)::numeric, 1)
        ELSE 0 END AS desperdicio_percent,
      CASE WHEN im.saldo_atual > 0 AND im.consumo_periodo > 0
        THEN ROUND((im.consumo_periodo / im.saldo_atual)::numeric, 2)
        ELSE 0 END AS giro
    FROM item_metrics im
  ),
  sorted AS (
    SELECT * FROM enriched
    WHERE CASE
      WHEN p_cursor_created_at IS NOT NULL AND p_cursor_id IS NOT NULL THEN
        CASE WHEN p_sort_asc THEN
          (last_movement_at, produto_id) > (p_cursor_created_at, p_cursor_id)
        ELSE
          (last_movement_at, produto_id) < (p_cursor_created_at, p_cursor_id)
        END
      ELSE true
    END
    ORDER BY
      CASE WHEN p_sort_key = 'consumo' AND NOT p_sort_asc THEN custo_consumido END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'consumo' AND p_sort_asc THEN custo_consumido END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND NOT p_sort_asc THEN perdas_qtd END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND p_sort_asc THEN perdas_qtd END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND NOT p_sort_asc THEN giro END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND p_sort_asc THEN giro END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND NOT p_sort_asc THEN variacao_percent END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND p_sort_asc THEN variacao_percent END ASC NULLS LAST,
      last_movement_at DESC, produto_id DESC
    LIMIT v_actual_limit + 1
  )
  SELECT jsonb_build_object(
    'items', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'produto_id', s.produto_id,
      'nome', s.nome_produto,
      'categoria', s.categoria,
      'unidade', s.unidade_medida,
      'saldo', ROUND(s.saldo_atual::numeric, 2),
      'custo_base', ROUND(s.custo_base::numeric, 4),
      'custo_medio_periodo', ROUND(COALESCE(s.custo_medio_periodo, 0)::numeric, 4),
      'ultimo_preco', ROUND(s.ultimo_preco::numeric, 4),
      'consumo_periodo', ROUND(s.consumo_periodo::numeric, 3),
      'custo_consumido', ROUND(s.custo_consumido::numeric, 2),
      'perdas_qtd', ROUND(s.perdas_qtd::numeric, 3),
      'valor_estoque', s.valor_estoque,
      'variacao_percent', s.variacao_percent,
      'desperdicio_percent', s.desperdicio_percent,
      'giro', s.giro,
      'cursor_created_at', s.last_movement_at,
      'cursor_id', s.produto_id
    ) ORDER BY
      CASE WHEN p_sort_key = 'consumo' AND NOT p_sort_asc THEN s.custo_consumido END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'consumo' AND p_sort_asc THEN s.custo_consumido END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND NOT p_sort_asc THEN s.perdas_qtd END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'perda' AND p_sort_asc THEN s.perdas_qtd END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND NOT p_sort_asc THEN s.giro END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND p_sort_asc THEN s.giro END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND NOT p_sort_asc THEN s.variacao_percent END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND p_sort_asc THEN s.variacao_percent END ASC NULLS LAST,
      s.last_movement_at DESC, s.produto_id DESC
    ) FROM (SELECT * FROM sorted LIMIT v_actual_limit) s), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) > v_actual_limit FROM sorted)
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

-- Fix get_report_items_summary: include all OUT movements for consumo
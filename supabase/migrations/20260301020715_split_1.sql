CREATE OR REPLACE FUNCTION public.list_report_items_cursor(
  p_start date,
  p_end date,
  p_limit integer DEFAULT 20,
  p_cursor_created_at timestamptz DEFAULT NULL,
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
AS $$
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
      p.updated_at AS p_updated_at,
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
      COALESCE((
        SELECT SUM(m.quantidade)
        FROM movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.produto_id = p.id AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO','SAIDA_ESTORNO')
          AND m.internal_transfer = false
          AND m.data BETWEEN p_start AND p_end
      ), 0) AS consumo_periodo,
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
        ELSE 0 END AS giro,
      CASE WHEN im.consumo_periodo > 0
        THEN ROUND((im.saldo_atual / (im.consumo_periodo / GREATEST(
          EXTRACT(EPOCH FROM (p_end::timestamp - p_start::timestamp)) / 604800, 1
        )))::numeric, 1)
        ELSE 0 END AS cobertura_semanas
    FROM item_metrics im
  ),
  total_custo AS (SELECT COALESCE(SUM(custo_consumido), 0) AS total FROM enriched),
  with_cmv AS (
    SELECT e.*, CASE WHEN t.total > 0 THEN ROUND((e.custo_consumido / t.total * 100)::numeric, 1) ELSE 0 END AS percent_cmv
    FROM enriched e, total_custo t
  ),
  sorted AS (
    SELECT * FROM with_cmv
    ORDER BY
      CASE WHEN p_sort_key = 'nome' AND NOT p_sort_asc THEN nome_produto END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'nome' AND p_sort_asc THEN nome_produto END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'consumo' AND NOT p_sort_asc THEN consumo_periodo END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'consumo' AND p_sort_asc THEN consumo_periodo END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'custoMedio' AND NOT p_sort_asc THEN custo_medio_periodo END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'custoMedio' AND p_sort_asc THEN custo_medio_periodo END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND NOT p_sort_asc THEN variacao_percent END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'variacao' AND p_sort_asc THEN variacao_percent END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND NOT p_sort_asc THEN giro END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'giro' AND p_sort_asc THEN giro END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'percentCMV' AND NOT p_sort_asc THEN percent_cmv END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'percentCMV' AND p_sort_asc THEN percent_cmv END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'desperdicio' AND NOT p_sort_asc THEN desperdicio_percent END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'desperdicio' AND p_sort_asc THEN desperdicio_percent END ASC NULLS LAST,
      CASE WHEN p_sort_key = 'cobertura' AND NOT p_sort_asc THEN cobertura_semanas END DESC NULLS LAST,
      CASE WHEN p_sort_key = 'cobertura' AND p_sort_asc THEN cobertura_semanas END ASC NULLS LAST,
      last_movement_at DESC NULLS LAST, produto_id DESC
  ),
  paginated AS (
    SELECT *
    FROM sorted
    WHERE (
      p_cursor_created_at IS NULL
      OR (last_movement_at, produto_id) < (p_cursor_created_at, COALESCE(p_cursor_id, '00000000-0000-0000-0000-000000000000'::uuid))
    )
    LIMIT v_actual_limit + 1
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', produto_id,
        'nome_produto', nome_produto,
        'categoria', categoria,
        'unidade_medida', unidade_medida,
        'saldo_atual', saldo_atual,
        'valor_estoque', valor_estoque,
        'custo_medio_periodo', COALESCE(custo_medio_periodo, 0),
        'ultimo_preco', ultimo_preco,
        'variacao_percent', variacao_percent,
        'consumo_periodo', consumo_periodo,
        'custo_consumido', custo_consumido,
        'desperdicio_percent', desperdicio_percent,
        'giro', giro,
        'cobertura_semanas', cobertura_semanas,
        'percent_cmv', percent_cmv,
        'perdas_qtd', perdas_qtd,
        'last_movement_at', last_movement_at
      ))
      FROM (SELECT * FROM paginated LIMIT v_actual_limit) sub
    ), '[]'::jsonb),
    'has_more', (SELECT COUNT(*) FROM paginated) > v_actual_limit,
    'total_count', (SELECT COUNT(*) FROM with_cmv)
  ) INTO v_result;

  RETURN v_result;
END;
$$;
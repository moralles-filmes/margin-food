-- Relatórios → Análise por Item: listagem paginada por OFFSET com ordenação real.
--
-- Substitui `list_report_items_cursor`, que tinha 3 defeitos:
--   1. só ordenava por consumo/perda/giro/variacao — a tela envia também nome,
--      custoMedio, cobertura, percentCMV (padrão) e desperdicio, que caíam em
--      "última movimentação";
--   2. o cursor era (last_movement_at, produto_id) mesmo quando a ordem era por
--      outra métrica, então "Carregar mais" pulava/repetia itens;
--   3. % CMV era calculado no client sobre a página carregada, não sobre o total.
-- Também passa a ler o saldo de `produtos.saldo_atual` (fonte única da verdade)
-- e a busca usa `nome_produto_unaccent` (sem acento).
--
-- A função antiga é mantida só enquanto o frontend anterior estiver no ar.

CREATE OR REPLACE FUNCTION public.list_report_items_page(
  p_start date,
  p_end date,
  p_limit integer DEFAULT 20,
  p_offset integer DEFAULT 0,
  p_search text DEFAULT NULL,
  p_categoria text DEFAULT NULL,
  p_sort_key text DEFAULT 'percentCMV',
  p_sort_asc boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_limit int := LEAST(GREATEST(COALESCE(p_limit, 20), 1), 100);
  v_offset int := GREATEST(COALESCE(p_offset, 0), 0);
  -- Semanas do período, para "cobertura em semanas" (mín. 1 dia).
  v_weeks numeric := GREATEST((p_end - p_start + 1)::numeric, 1) / 7;
  v_search text := NULLIF(btrim(lower(public.immutable_unaccent(COALESCE(p_search, '')))), '');
  v_sort text := CASE
    WHEN p_sort_key IN ('nome', 'consumo', 'custoMedio', 'variacao', 'giro', 'percentCMV', 'desperdicio', 'cobertura')
      THEN p_sort_key
    ELSE 'percentCMV'
  END;
  v_asc boolean := COALESCE(p_sort_asc, false);
  v_company uuid;
  v_result jsonb;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['relatorios:itens:view', 'reports:read', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (relatorios:itens:view).';
  END IF;

  IF v_search IS NOT NULL THEN
    v_search := replace(replace(replace(v_search, '\', '\\'), '%', '\%'), '_', '\_');
  END IF;

  WITH base AS (
    SELECT
      p.id,
      p.nome_produto,
      p.nome_produto_unaccent,
      p.categoria,
      p.unidade_medida,
      COALESCE(p.saldo_atual, 0) AS saldo_atual,
      COALESCE(NULLIF(p.avg30_cost_base_unit, 0), NULLIF(p.last_cost_base_unit, 0), NULLIF(p.default_cost_base_unit, 0), 0) AS custo_base,
      NULLIF(p.last_cost_purchase_unit, 0) AS last_cost_purchase_unit,
      p.created_at
    FROM produtos p
    WHERE p.company_id = v_company
      AND p.ativo = true
      AND p.conta_no_cmv = true
  ),
  mov AS (
    SELECT
      m.produto_id,
      SUM(m.quantidade) FILTER (
        WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS consumo_periodo,
      SUM(m.custo_total) FILTER (
        WHERE m.direction = 'OUT' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS custo_consumido,
      SUM(m.quantidade) FILTER (
        WHERE m.tipo IN ('BAIXA_PERDA', 'SAIDA_PERDA', 'SAIDA_VENCIMENTO')
          AND m.data BETWEEN p_start AND p_end
      ) AS perdas_qtd,
      SUM(m.quantidade) FILTER (
        WHERE m.direction = 'IN' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS qtd_entrada,
      SUM(m.custo_total) FILTER (
        WHERE m.direction = 'IN' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.data BETWEEN p_start AND p_end
      ) AS custo_entrada,
      MAX(m.created_at) AS last_movement_at
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO'
    GROUP BY m.produto_id
  ),
  ultimo AS (
    SELECT DISTINCT ON (m.produto_id) m.produto_id, m.custo_unitario
    FROM movimentacoes_estoque m
    WHERE m.company_id = v_company
      AND m.status = 'ATIVO'
      AND m.direction = 'IN'
      AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    ORDER BY m.produto_id, m.data DESC, m.created_at DESC
  ),
  metrics AS (
    SELECT
      b.*,
      COALESCE(mv.consumo_periodo, 0) AS consumo_periodo,
      COALESCE(mv.custo_consumido, 0) AS custo_consumido,
      COALESCE(mv.perdas_qtd, 0) AS perdas_qtd,
      COALESCE(
        CASE WHEN mv.qtd_entrada > 0 THEN mv.custo_entrada / mv.qtd_entrada END,
        b.last_cost_purchase_unit
      ) AS custo_medio_periodo,
      COALESCE(u.custo_unitario, b.last_cost_purchase_unit, 0) AS ultimo_preco,
      COALESCE(mv.last_movement_at, b.created_at) AS last_movement_at
    FROM base b
    LEFT JOIN mov mv ON mv.produto_id = b.id
    LEFT JOIN ultimo u ON u.produto_id = b.id
  ),
  -- % CMV é a fatia do item no custo consumido de TODOS os itens do CMV,
  -- independente da busca/categoria aplicada na tela.
  total AS (
    SELECT COALESCE(SUM(custo_consumido), 0) AS total_custo FROM metrics
  ),
  enriched AS (
    SELECT
      m.*,
      ROUND((m.saldo_atual * m.custo_base)::numeric, 2) AS valor_estoque,
      CASE WHEN m.custo_medio_periodo > 0
        THEN ROUND(((m.ultimo_preco - m.custo_medio_periodo) / m.custo_medio_periodo * 100)::numeric, 1)
        ELSE 0 END AS variacao_percent,
      CASE WHEN (m.consumo_periodo + m.perdas_qtd) > 0
        THEN ROUND((m.perdas_qtd / (m.consumo_periodo + m.perdas_qtd) * 100)::numeric, 1)
        ELSE 0 END AS desperdicio_percent,
      CASE WHEN m.saldo_atual > 0 AND m.consumo_periodo > 0
        THEN ROUND((m.consumo_periodo / m.saldo_atual)::numeric, 2)
        ELSE 0 END AS giro,
      CASE WHEN m.saldo_atual > 0 AND m.consumo_periodo > 0
        THEN ROUND((m.saldo_atual / (m.consumo_periodo / v_weeks))::numeric, 1)
        ELSE 0 END AS cobertura_semanas,
      CASE WHEN t.total_custo > 0
        THEN (m.custo_consumido / t.total_custo * 100)
        ELSE 0 END AS percent_cmv
    FROM metrics m
    CROSS JOIN total t
    WHERE (v_search IS NULL OR m.nome_produto_unaccent LIKE '%' || v_search || '%')
      AND (p_categoria IS NULL OR m.categoria = p_categoria)
  ),
  ranked AS (
    SELECT
      e.*,
      COUNT(*) OVER () AS total_count,
      ROW_NUMBER() OVER (
        ORDER BY
          CASE WHEN v_sort = 'nome' AND v_asc THEN e.nome_produto END ASC,
          CASE WHEN v_sort = 'nome' AND NOT v_asc THEN e.nome_produto END DESC,
          CASE WHEN v_asc THEN (CASE v_sort
            WHEN 'consumo' THEN e.consumo_periodo
            WHEN 'custoMedio' THEN e.custo_medio_periodo
            WHEN 'variacao' THEN e.variacao_percent
            WHEN 'giro' THEN e.giro
            WHEN 'percentCMV' THEN e.percent_cmv
            WHEN 'desperdicio' THEN e.desperdicio_percent
            WHEN 'cobertura' THEN e.cobertura_semanas
          END) END ASC NULLS LAST,
          CASE WHEN NOT v_asc THEN (CASE v_sort
            WHEN 'consumo' THEN e.consumo_periodo
            WHEN 'custoMedio' THEN e.custo_medio_periodo
            WHEN 'variacao' THEN e.variacao_percent
            WHEN 'giro' THEN e.giro
            WHEN 'percentCMV' THEN e.percent_cmv
            WHEN 'desperdicio' THEN e.desperdicio_percent
            WHEN 'cobertura' THEN e.cobertura_semanas
          END) END DESC NULLS LAST,
          -- Desempate estável (paginação por OFFSET não pode repetir/pular itens).
          e.nome_produto ASC,
          e.id ASC
      ) AS rn
    FROM enriched e
  )
  SELECT jsonb_build_object(
    'items', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'produto_id', r.id,
        'nome', r.nome_produto,
        'categoria', r.categoria,
        'unidade', r.unidade_medida,
        'saldo', ROUND(r.saldo_atual::numeric, 2),
        'custo_base', ROUND(r.custo_base::numeric, 4),
        'custo_medio_periodo', ROUND(COALESCE(r.custo_medio_periodo, 0)::numeric, 4),
        'ultimo_preco', ROUND(r.ultimo_preco::numeric, 4),
        'consumo_periodo', ROUND(r.consumo_periodo::numeric, 3),
        'custo_consumido', ROUND(r.custo_consumido::numeric, 2),
        'perdas_qtd', ROUND(r.perdas_qtd::numeric, 3),
        'valor_estoque', r.valor_estoque,
        'variacao_percent', r.variacao_percent,
        'desperdicio_percent', r.desperdicio_percent,
        'giro', r.giro,
        'cobertura_semanas', r.cobertura_semanas,
        'percent_cmv', ROUND(r.percent_cmv::numeric, 2),
        'last_movement_at', r.last_movement_at
      ) ORDER BY r.rn)
      FROM ranked r
      WHERE r.rn > v_offset AND r.rn <= v_offset + v_limit
    ), '[]'::jsonb),
    'total_count', COALESCE((SELECT MAX(total_count) FROM ranked), 0),
    'has_more', COALESCE((SELECT MAX(total_count) FROM ranked), 0) > v_offset + v_limit
  ) INTO v_result;

  RETURN v_result;
END;
$function$;

REVOKE ALL ON FUNCTION public.list_report_items_page(date, date, integer, integer, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_report_items_page(date, date, integer, integer, text, text, text, boolean) TO authenticated, service_role;

-- PL/pgSQL só resolve colunas na 1ª execução: força a checagem aqui, no deploy.
DO $check$
BEGIN
  PERFORM p.id, p.nome_produto, p.nome_produto_unaccent, p.categoria, p.unidade_medida, p.saldo_atual,
          p.avg30_cost_base_unit, p.last_cost_base_unit, p.default_cost_base_unit,
          p.last_cost_purchase_unit, p.created_at, p.ativo, p.conta_no_cmv, p.company_id
  FROM public.produtos p LIMIT 0;
  PERFORM m.produto_id, m.quantidade, m.custo_total, m.custo_unitario, m.direction, m.tipo,
          m.data, m.created_at, m.status, m.company_id
  FROM public.movimentacoes_estoque m LIMIT 0;
END;
$check$;

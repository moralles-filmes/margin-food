
CREATE OR REPLACE FUNCTION public.get_stock_top_consumed(
    p_start_date date DEFAULT (now() - interval '30 days')::date,
    p_end_date date DEFAULT now()::date,
    p_category text DEFAULT NULL,
    p_rank_by text DEFAULT 'quantity',  -- 'quantity' or 'cost'
    p_limit integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
    v_result jsonb;
    v_days integer;
BEGIN
    v_company := public.assert_tenant();
    v_days := GREATEST((p_end_date - p_start_date + 1), 1);

    WITH saldos AS (
        SELECT
            m.produto_id,
            SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
        GROUP BY m.produto_id
    ),
    consumo AS (
        SELECT
            m.produto_id,
            ROUND(SUM(m.quantidade)::numeric, 4) AS consumo_total,
            ROUND(SUM(m.quantidade * m.custo_unitario)::numeric, 2) AS custo_total,
            COUNT(*)::int AS total_saidas,
            MAX(m.created_at) AS ultima_saida
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
        GROUP BY m.produto_id
    ),
    ranked AS (
        SELECT
            p.id AS produto_id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.estoque_minimo,
            COALESCE(s.saldo, 0) AS saldo_atual,
            COALESCE(c.consumo_total, 0) AS consumo_total,
            COALESCE(c.custo_total, 0) AS custo_total,
            COALESCE(c.total_saidas, 0) AS total_saidas,
            c.ultima_saida,
            ROUND(COALESCE(c.consumo_total, 0) / v_days, 4) AS media_diaria,
            CASE
                WHEN COALESCE(c.consumo_total, 0) > 0 AND COALESCE(s.saldo, 0) > 0
                THEN ROUND((COALESCE(s.saldo, 0) / (COALESCE(c.consumo_total, 0) / v_days))::numeric, 1)
                ELSE NULL
            END AS cobertura_dias,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS custo_efetivo,
            CASE
                WHEN COALESCE(s.saldo, 0) <= 0 THEN 'sem_estoque'
                WHEN p.estoque_minimo > 0 AND COALESCE(s.saldo, 0) <= (p.estoque_minimo * 0.5) THEN 'critico'
                WHEN p.estoque_minimo > 0 AND COALESCE(s.saldo, 0) <= p.estoque_minimo THEN 'atencao'
                ELSE 'ok'
            END AS status_estoque,
            CASE
                WHEN COALESCE(
                    NULLIF(p.avg30_cost_base_unit, 0),
                    NULLIF(p.last_cost_base_unit, 0),
                    NULLIF(p.default_cost_base_unit, 0), 0
                ) = 0 THEN true ELSE false
            END AS sem_custo
        FROM consumo c
        JOIN public.produtos p ON p.id = c.produto_id AND p.company_id = v_company AND p.ativo = true
        LEFT JOIN saldos s ON s.produto_id = p.id
        WHERE (p_category IS NULL OR p.categoria = p_category)
        ORDER BY
            CASE WHEN p_rank_by = 'cost' THEN c.custo_total ELSE c.consumo_total END DESC NULLS LAST
        LIMIT p_limit
    ),
    items_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', r.produto_id,
            'nome_produto', r.nome_produto,
            'categoria', r.categoria,
            'unidade_medida', r.unidade_medida,
            'consumo_total', r.consumo_total,
            'custo_total', r.custo_total,
            'media_diaria', r.media_diaria,
            'saldo_atual', r.saldo_atual,
            'estoque_minimo', r.estoque_minimo,
            'cobertura_dias', r.cobertura_dias,
            'status_estoque', r.status_estoque,
            'sem_custo', r.sem_custo,
            'total_saidas', r.total_saidas,
            'ultima_saida', r.ultima_saida
        )), '[]'::jsonb) AS data
        FROM ranked r
    ),
    -- Alerts: high consumption + critical/low stock
    alertas AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', r.produto_id,
            'nome_produto', r.nome_produto,
            'status_estoque', r.status_estoque,
            'sem_custo', r.sem_custo,
            'consumo_total', r.consumo_total,
            'saldo_atual', r.saldo_atual,
            'cobertura_dias', r.cobertura_dias,
            'unidade_medida', r.unidade_medida
        )), '[]'::jsonb) AS data
        FROM ranked r
        WHERE r.status_estoque IN ('critico', 'sem_estoque', 'atencao') OR r.sem_custo = true
    ),
    -- Category summary
    cat_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', sub.categoria,
            'consumo_total', sub.consumo_total,
            'custo_total', sub.custo_total,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.consumo_total DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(r.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(r.consumo_total)::numeric, 4) AS consumo_total,
                ROUND(SUM(r.custo_total)::numeric, 2) AS custo_total,
                COUNT(*)::int AS qtd_itens
            FROM ranked r
            GROUP BY 1
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(r.consumo_total), 0)::numeric, 4) AS consumo_total,
            ROUND(COALESCE(SUM(r.custo_total), 0)::numeric, 2) AS custo_total,
            COUNT(*) FILTER (WHERE r.status_estoque = 'critico' OR r.status_estoque = 'sem_estoque')::int AS itens_criticos,
            COUNT(*) FILTER (WHERE r.sem_custo)::int AS itens_sem_custo
        FROM ranked r
    )
    SELECT jsonb_build_object(
        'items', ij.data,
        'alertas', al.data,
        'categorias', cs.data,
        'consumo_total', t.consumo_total,
        'custo_total', t.custo_total,
        'itens_criticos', t.itens_criticos,
        'itens_sem_custo', t.itens_sem_custo,
        'dias_periodo', v_days
    ) INTO v_result
    FROM items_json ij, alertas al, cat_summary cs, totals t;

    RETURN v_result;
END;
$function$;

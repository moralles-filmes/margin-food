CREATE OR REPLACE FUNCTION public.get_stock_consumption_history(
    p_start_date date,
    p_end_date date,
    p_group_by text DEFAULT 'daily',
    p_product_id uuid DEFAULT NULL,
    p_category text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company uuid;
    v_result jsonb;
BEGIN
    v_company := public.assert_tenant();

    WITH filtered_mov AS (
        SELECT
            m.produto_id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            m.quantidade,
            m.custo_unitario,
            m.created_at::date AS mov_date
        FROM public.movimentacoes_estoque m
        JOIN public.produtos p ON p.id = m.produto_id AND p.company_id = v_company
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
          AND (p_product_id IS NULL OR m.produto_id = p_product_id)
          AND (p_category IS NULL OR p.categoria = p_category)
    ),
    timeline AS (
        SELECT
            CASE p_group_by
                WHEN 'weekly' THEN date_trunc('week', fm.mov_date)::date
                WHEN 'monthly' THEN date_trunc('month', fm.mov_date)::date
                ELSE fm.mov_date
            END AS period,
            ROUND(SUM(fm.quantidade)::numeric, 4) AS total_qty,
            ROUND(SUM(fm.quantidade * fm.custo_unitario)::numeric, 2) AS total_cost
        FROM filtered_mov fm
        GROUP BY 1
        ORDER BY 1
    ),
    timeline_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'period', t.period,
            'total_qty', t.total_qty,
            'total_cost', t.total_cost
        ) ORDER BY t.period), '[]'::jsonb) AS data
        FROM timeline t
    ),
    product_summary AS (
        SELECT
            fm.produto_id,
            fm.nome_produto,
            fm.categoria,
            fm.unidade_medida,
            ROUND(SUM(fm.quantidade)::numeric, 4) AS consumo_total,
            ROUND(SUM(fm.quantidade * fm.custo_unitario)::numeric, 2) AS custo_total,
            COUNT(DISTINCT fm.mov_date) AS dias_com_consumo,
            MIN(fm.mov_date) AS primeiro_consumo,
            MAX(fm.mov_date) AS ultimo_consumo
        FROM filtered_mov fm
        GROUP BY fm.produto_id, fm.nome_produto, fm.categoria, fm.unidade_medida
    ),
    product_enriched AS (
        SELECT
            ps.*,
            ROUND(ps.consumo_total / GREATEST((p_end_date - p_start_date + 1), 1), 4) AS media_diaria,
            ROUND(ps.consumo_total / GREATEST(CEIL((p_end_date - p_start_date + 1)::numeric / 7), 1), 4) AS media_semanal
        FROM product_summary ps
    ),
    products_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', pe.produto_id,
            'nome_produto', pe.nome_produto,
            'categoria', pe.categoria,
            'unidade_medida', pe.unidade_medida,
            'consumo_total', pe.consumo_total,
            'custo_total', pe.custo_total,
            'dias_com_consumo', pe.dias_com_consumo,
            'media_diaria', pe.media_diaria,
            'media_semanal', pe.media_semanal,
            'ultimo_consumo', pe.ultimo_consumo
        ) ORDER BY pe.consumo_total DESC), '[]'::jsonb) AS data
        FROM product_enriched pe
    ),
    top10_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'nome_produto', pe.nome_produto,
            'consumo_total', pe.consumo_total,
            'unidade_medida', pe.unidade_medida,
            'custo_total', pe.custo_total
        ) ORDER BY pe.consumo_total DESC), '[]'::jsonb) AS data
        FROM (SELECT * FROM product_enriched ORDER BY consumo_total DESC LIMIT 10) pe
    ),
    cat_json AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', sub.categoria,
            'consumo_total', sub.consumo_total,
            'custo_total', sub.custo_total,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.consumo_total DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(pe.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(pe.consumo_total)::numeric, 4) AS consumo_total,
                ROUND(SUM(pe.custo_total)::numeric, 2) AS custo_total,
                COUNT(*)::int AS qtd_itens
            FROM product_enriched pe
            GROUP BY 1
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(fm.quantidade), 0)::numeric, 4) AS consumo_total,
            ROUND(COALESCE(SUM(fm.quantidade * fm.custo_unitario), 0)::numeric, 2) AS custo_total,
            COUNT(DISTINCT fm.produto_id)::int AS itens_distintos,
            COUNT(DISTINCT fm.mov_date)::int AS dias_com_consumo
        FROM filtered_mov fm
    )
    SELECT jsonb_build_object(
        'consumo_total', tt.consumo_total,
        'custo_total', tt.custo_total,
        'itens_distintos', tt.itens_distintos,
        'dias_com_consumo', tt.dias_com_consumo,
        'timeline', tl.data,
        'produtos', pj.data,
        'top10', t10.data,
        'categorias', cj.data
    ) INTO v_result
    FROM totals tt, timeline_json tl, products_json pj, top10_json t10, cat_json cj;

    RETURN v_result;
END;
$$;
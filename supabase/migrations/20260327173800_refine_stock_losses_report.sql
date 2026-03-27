
-- Refine Stock Losses Report RPC
-- 1. Default frontend filter to 'all_losses'
-- 2. Remove 'baixa' from default loss keywords as it's too generic for Portuguese stock exits
-- 3. Ensure typo_perda classification is consistent

CREATE OR REPLACE FUNCTION public.get_stock_losses_report(
    p_start_date date DEFAULT (now() - interval '30 days')::date,
    p_end_date date DEFAULT now()::date,
    p_category text DEFAULT NULL,
    p_product_id uuid DEFAULT NULL,
    p_loss_type text DEFAULT NULL,
    p_order_by text DEFAULT 'quantity',
    p_group_by text DEFAULT 'daily'
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
    -- Refinement: Removed 'baixa' from loss keywords as it incorrectly captures normal stock exits
    v_loss_keywords text[] := ARRAY['perda','descarte','vencimento','avaria','quebra','desperdicio','desperdício','dano','danificad','estrago','validade'];
BEGIN
    v_company := public.assert_tenant();
    v_days := GREATEST((p_end_date - p_start_date + 1), 1);

    WITH loss_mov AS (
        SELECT
            m.id,
            m.produto_id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.ativo AS produto_ativo,
            m.quantidade,
            m.custo_unitario,
            m.custo_total,
            m.observacao,
            m.created_at,
            m.created_at::date AS mov_date,
            CASE
                WHEN lower(m.observacao) ~ 'venciment|validade' THEN 'Vencimento'
                WHEN lower(m.observacao) ~ 'descart' THEN 'Descarte'
                WHEN lower(m.observacao) ~ 'avaria|dano|danificad' THEN 'Avaria'
                WHEN lower(m.observacao) ~ 'quebra' THEN 'Quebra'
                WHEN lower(m.observacao) ~ 'desperdic' THEN 'Desperdício'
                WHEN lower(m.observacao) ~ 'perd' THEN 'Perda'
                ELSE 'Baixa/Saída'
            END AS tipo_perda
        FROM public.movimentacoes_estoque m
        JOIN public.produtos p ON p.id = m.produto_id AND p.company_id = v_company
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('SAIDA_ESTORNO', 'ENTRADA_ESTORNO')
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
          AND (p_product_id IS NULL OR m.produto_id = p_product_id)
          AND (p_category IS NULL OR p.categoria = p_category)
          AND (
            p_loss_type IS NULL
            OR (p_loss_type = 'all_losses' AND EXISTS (
                SELECT 1 FROM unnest(v_loss_keywords) kw WHERE lower(m.observacao) LIKE '%' || kw || '%'
            ))
            OR (p_loss_type IS NOT NULL AND p_loss_type != 'all_losses' AND lower(m.observacao) LIKE '%' || lower(p_loss_type) || '%')
          )
    ),
    timeline AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'period', sub.period,
            'total_qty', sub.total_qty,
            'total_cost', sub.total_cost
        ) ORDER BY sub.period), '[]'::jsonb) AS data
        FROM (
            SELECT
                CASE p_group_by
                    WHEN 'weekly' THEN date_trunc('week', lm.mov_date)::date
                    WHEN 'monthly' THEN date_trunc('month', lm.mov_date)::date
                    ELSE lm.mov_date
                END AS period,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS total_qty,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS total_cost
            FROM loss_mov lm
            GROUP BY 1
            ORDER BY 1
        ) sub
    ),
    prod_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'produto_id', sub.produto_id,
            'nome_produto', sub.nome_produto,
            'categoria', sub.categoria,
            'unidade_medida', sub.unidade_medida,
            'produto_ativo', sub.produto_ativo,
            'quantidade_perdida', sub.quantidade_perdida,
            'valor_perdido', sub.valor_perdido,
            'total_registros', sub.total_registros,
            'ultimo_registro', sub.ultimo_registro,
            'sem_custo', sub.sem_custo,
            'tipos_perda', sub.tipos_perda
        ) ORDER BY
            CASE WHEN p_order_by = 'cost' THEN sub.valor_perdido ELSE sub.quantidade_perdida END DESC
        ), '[]'::jsonb) AS data
        FROM (
            SELECT
                lm.produto_id,
                lm.nome_produto,
                lm.categoria,
                lm.unidade_medida,
                bool_and(lm.produto_ativo) AS produto_ativo,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade_perdida,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor_perdido,
                COUNT(*)::int AS total_registros,
                MAX(lm.created_at) AS ultimo_registro,
                bool_or(lm.custo_unitario = 0 OR lm.custo_unitario IS NULL) AS sem_custo,
                array_agg(DISTINCT lm.tipo_perda) AS tipos_perda
            FROM loss_mov lm
            GROUP BY lm.produto_id, lm.nome_produto, lm.categoria, lm.unidade_medida
        ) sub
    ),
    cat_summary AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', sub.categoria,
            'quantidade_perdida', sub.quantidade_perdida,
            'valor_perdido', sub.valor_perdido,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.valor_perdido DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(lm.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade_perdida,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor_perdido,
                COUNT(DISTINCT lm.produto_id)::int AS qtd_itens
            FROM loss_mov lm
            GROUP BY 1
        ) sub
    ),
    type_breakdown AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'tipo', sub.tipo_perda,
            'quantidade', sub.quantidade,
            'valor', sub.valor,
            'registros', sub.registros
        ) ORDER BY sub.valor DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                lm.tipo_perda,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor,
                COUNT(*)::int AS registros
            FROM loss_mov lm
            GROUP BY lm.tipo_perda
        ) sub
    ),
    top10 AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'nome_produto', sub.nome_produto,
            'quantidade_perdida', sub.quantidade_perdida,
            'valor_perdido', sub.valor_perdido,
            'unidade_medida', sub.unidade_medida
        ) ORDER BY
            CASE WHEN p_order_by = 'cost' THEN sub.valor_perdido ELSE sub.quantidade_perdida END DESC
        ), '[]'::jsonb) AS data
        FROM (
            SELECT
                lm.nome_produto,
                lm.unidade_medida,
                ROUND(SUM(lm.quantidade)::numeric, 4) AS quantidade_perdida,
                ROUND(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario))::numeric, 2) AS valor_perdido
            FROM loss_mov lm
            GROUP BY lm.nome_produto, lm.unidade_medida
            ORDER BY CASE WHEN p_order_by = 'cost' THEN SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario)) ELSE SUM(lm.quantidade) END DESC
            LIMIT 10
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(lm.quantidade), 0)::numeric, 4) AS quantidade_total,
            ROUND(COALESCE(SUM(COALESCE(lm.custo_total, lm.quantidade * lm.custo_unitario)), 0)::numeric, 2) AS valor_total,
            COUNT(DISTINCT lm.produto_id)::int AS itens_distintos,
            COUNT(*)::int AS total_registros,
            COUNT(*) FILTER (WHERE lm.custo_unitario = 0 OR lm.custo_unitario IS NULL)::int AS registros_sem_custo
        FROM loss_mov lm
    )
    SELECT jsonb_build_object(
        'quantidade_total', t.quantidade_total,
        'valor_total', t.valor_total,
        'itens_distintos', t.itens_distintos,
        'total_registros', t.total_registros,
        'registros_sem_custo', t.registros_sem_custo,
        'dias_periodo', v_days,
        'timeline', tl.data,
        'produtos', ps.data,
        'categorias', cs.data,
        'tipos_perda', tb.data,
        'top10', t10.data
    ) INTO v_result
    FROM totals t, timeline tl, prod_summary ps, cat_summary cs, type_breakdown tb, top10 t10;

    RETURN v_result;
END;
$function$;

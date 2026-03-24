CREATE OR REPLACE FUNCTION public.get_stock_dashboard(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
    v_result jsonb;
    v_cutoff timestamptz;
BEGIN
    v_company := public.assert_tenant();
    v_cutoff := now() - (p_days || ' days')::interval;

    WITH saldos AS (
        SELECT
            m.produto_id,
            SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) AS saldo
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
        GROUP BY m.produto_id
    ),
    ledger_value AS (
        SELECT COALESCE(ROUND(SUM(
            CASE WHEN m.direction = 'IN'
                 THEN m.quantidade * m.custo_unitario
                 ELSE -m.quantidade * m.custo_unitario
            END
        )::numeric, 2), 0) AS valor_total
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
    ),
    produto_saldos AS (
        SELECT
            p.id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.estoque_minimo,
            COALESCE(s.saldo, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS custo_efetivo
        FROM public.produtos p
        LEFT JOIN saldos s ON s.produto_id = p.id
        WHERE p.company_id = v_company AND p.ativo = true
    ),
    cat_dist AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'categoria', COALESCE(sub.categoria, 'Sem Categoria'),
            'valor', sub.valor,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.valor DESC), '[]'::jsonb) AS data
        FROM (
            SELECT
                COALESCE(NULLIF(ps.categoria, ''), 'Sem Categoria') AS categoria,
                ROUND(SUM(ps.saldo * ps.custo_efetivo)::numeric, 2) AS valor,
                COUNT(*)::int AS qtd_itens
            FROM produto_saldos ps
            WHERE ps.saldo > 0
            GROUP BY 1
        ) sub
    ),
    status_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND (ps.saldo > ps.estoque_minimo OR ps.estoque_minimo = 0)) AS ok,
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND ps.saldo <= ps.estoque_minimo AND ps.saldo > (ps.estoque_minimo * 0.5) AND ps.estoque_minimo > 0) AS atencao,
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND ps.saldo <= (ps.estoque_minimo * 0.5) AND ps.estoque_minimo > 0) AS critico,
            COUNT(*) FILTER (WHERE ps.saldo <= 0) AS sem_estoque,
            COUNT(*) FILTER (WHERE ps.custo_efetivo = 0) AS sem_custo
        FROM produto_saldos ps
    ),
    recent_mov AS (
        SELECT COALESCE(jsonb_agg(sub.row_data ORDER BY sub.rn), '[]'::jsonb) AS data
        FROM (
            SELECT
                ROW_NUMBER() OVER (ORDER BY m.created_at DESC) AS rn,
                jsonb_build_object(
                    'id', m.id,
                    'data', m.created_at,
                    'produto', p.nome_produto,
                    'tipo', m.tipo,
                    'quantidade', m.quantidade,
                    'custo_unitario', m.custo_unitario,
                    'unidade', p.unidade_medida,
                    'usuario', pr.nome
                ) AS row_data
            FROM public.movimentacoes_estoque m
            JOIN public.produtos p ON p.id = m.produto_id
            LEFT JOIN public.profiles pr ON pr.id = m.created_by
            WHERE m.company_id = v_company AND m.status = 'ATIVO'
              AND m.created_at >= v_cutoff
            ORDER BY m.created_at DESC
            LIMIT 10
        ) sub
    ),
    totals AS (
        SELECT
            lv.valor_total,
            COUNT(*)::int AS total_produtos,
            COUNT(*) FILTER (WHERE ps.saldo > 0)::int AS produtos_com_saldo
        FROM produto_saldos ps
        CROSS JOIN ledger_value lv
        GROUP BY lv.valor_total
    )
    SELECT jsonb_build_object(
        'valor_total', COALESCE(t.valor_total, 0),
        'total_produtos', COALESCE(t.total_produtos, 0),
        'produtos_com_saldo', COALESCE(t.produtos_com_saldo, 0),
        'ok', COALESCE(sc.ok, 0),
        'atencao', COALESCE(sc.atencao, 0),
        'critico', COALESCE(sc.critico, 0),
        'sem_estoque', COALESCE(sc.sem_estoque, 0),
        'sem_custo', COALESCE(sc.sem_custo, 0),
        'categorias', COALESCE(cd.data, '[]'::jsonb),
        'movimentacoes', COALESCE(rm.data, '[]'::jsonb)
    ) INTO v_result
    FROM totals t, status_counts sc, cat_dist cd, recent_mov rm;

    RETURN COALESCE(v_result, jsonb_build_object(
        'valor_total', 0, 'total_produtos', 0, 'produtos_com_saldo', 0,
        'ok', 0, 'atencao', 0, 'critico', 0, 'sem_estoque', 0, 'sem_custo', 0,
        'categorias', '[]'::jsonb, 'movimentacoes', '[]'::jsonb
    ));
END;
$function$;
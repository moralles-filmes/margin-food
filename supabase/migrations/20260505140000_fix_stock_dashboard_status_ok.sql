-- =========================================================
-- FIX: get_stock_dashboard — bucket "ok" incluía saldo=0 quando estoque_minimo=0
-- Data: 2026-05-05
-- Causa: a condição "OR COALESCE(ps.estoque_minimo, 0) = 0" no FILTER do bucket ok
--   fazia qualquer produto com estoque_minimo NULL/0 cair em ok, mesmo com saldo zero.
--   Como os FILTERs eram independentes, o mesmo produto entrava em ok E em sem_estoque.
--   Confirmado em produção: Ren Sushi, 1 produto com estoque_minimo=0 e saldo=0 → ok=1.
-- Correção: exigir saldo > 0 em todos os buckets positivos (ok, atencao, critico)
--   e torná-los mutuamente exclusivos.
-- =========================================================

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

    WITH produto_saldos AS (
        SELECT
            p.id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.estoque_minimo,
            COALESCE(p.saldo_atual, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS custo_efetivo
        FROM public.produtos p
        WHERE p.company_id = v_company AND p.ativo = true
    ),
    -- Distribuição por categoria (valor)
    cat_dist AS (
        SELECT jsonb_agg(jsonb_build_object(
            'categoria', COALESCE(sub.categoria, 'Sem Categoria'),
            'valor', sub.valor,
            'qtd_itens', sub.qtd_itens
        ) ORDER BY sub.valor DESC) AS data
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
    -- Contagem por status — buckets mutuamente exclusivos; saldo zero nunca é OK
    status_counts AS (
        SELECT
            COUNT(*) FILTER (
                WHERE ps.saldo > 0
                  AND (COALESCE(ps.estoque_minimo, 0) = 0 OR ps.saldo > ps.estoque_minimo)
            ) AS ok,
            COUNT(*) FILTER (
                WHERE ps.saldo > 0
                  AND ps.estoque_minimo > 0
                  AND ps.saldo <= ps.estoque_minimo
                  AND ps.saldo > (ps.estoque_minimo * 0.5)
            ) AS atencao,
            COUNT(*) FILTER (
                WHERE ps.saldo > 0
                  AND ps.estoque_minimo > 0
                  AND ps.saldo <= (ps.estoque_minimo * 0.5)
            ) AS critico,
            COUNT(*) FILTER (WHERE ps.saldo <= 0) AS sem_estoque,
            COUNT(*) FILTER (WHERE ps.custo_efetivo = 0) AS sem_custo
        FROM produto_saldos ps
    ),
    -- Movimentações recentes
    recent_mov AS (
        SELECT jsonb_agg(sub.row_data ORDER BY sub.rn) AS data
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
    -- Totais
    totals AS (
        SELECT
            ROUND(SUM(ps.saldo * ps.custo_efetivo)::numeric, 2) AS valor_total,
            COUNT(*)::int AS total_produtos,
            COUNT(*) FILTER (WHERE ps.saldo > 0)::int AS produtos_com_saldo
        FROM produto_saldos ps
    )
    SELECT jsonb_build_object(
        'valor_total', COALESCE(t.valor_total, 0),
        'total_produtos', t.total_produtos,
        'produtos_com_saldo', t.produtos_com_saldo,
        'ok', sc.ok,
        'atencao', sc.atencao,
        'critico', sc.critico,
        'sem_estoque', sc.sem_estoque,
        'sem_custo', sc.sem_custo,
        'categorias', COALESCE(cd.data, '[]'::jsonb),
        'movimentacoes', COALESCE(rm.data, '[]'::jsonb)
    ) INTO v_result
    FROM totals t, status_counts sc, cat_dist cd, recent_mov rm;

    RETURN v_result;
END;
$function$;

-- Blindagem: força o parser a resolver m.created_by e pr.nome agora,
-- em vez de na primeira execução em produção. LIMIT 0 = zero rows retornadas.
DO $$
BEGIN
    PERFORM 1
    FROM public.movimentacoes_estoque m
    LEFT JOIN public.profiles pr ON pr.id = m.created_by
    WHERE pr.nome IS NOT NULL
    LIMIT 0;
END$$;

NOTIFY pgrst, 'reload schema';

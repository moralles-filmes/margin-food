-- =========================================================
-- FIX: get_stock_dashboard usa produtos.saldo_atual (cache)
-- Data: 2026-05-01
-- Problema: A CTE `saldos` somava direction=IN/OUT de TODAS movimentações
--   ATIVAS, incluindo ENTRADA_ESTORNO/SAIDA_ESTORNO. Isso quebrava os
--   contadores ok/atencao/critico/sem_estoque do dashboard de Estoque,
--   pois saldo recalculado divergia do `produtos.saldo_atual` mantido
--   pelo trigger canônico (que ignora estornos).
-- Fix: Trocar a CTE saldos por leitura direta de p.saldo_atual em
--   produto_saldos. Os contadores continuam intactos pois operam sobre
--   ps.saldo, agora vindo do cache em sync com Estoque Geral/Catálogo.
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
    -- Contagem por status (saldo agora vem do cache; defensivo: estoque_minimo > 0)
    status_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE ps.saldo > ps.estoque_minimo OR COALESCE(ps.estoque_minimo, 0) = 0) AS ok,
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND ps.saldo <= ps.estoque_minimo AND ps.estoque_minimo > 0) AS atencao,
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND ps.saldo <= (ps.estoque_minimo * 0.5) AND ps.estoque_minimo > 0) AS critico,
            COUNT(*) FILTER (WHERE ps.saldo <= 0) AS sem_estoque,
            COUNT(*) FILTER (WHERE ps.custo_efetivo = 0) AS sem_custo
        FROM produto_saldos ps
    ),
    -- Movimentações recentes (inalterado)
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
                    'usuario', pr.name
                ) AS row_data
            FROM public.movimentacoes_estoque m
            JOIN public.produtos p ON p.id = m.produto_id
            LEFT JOIN public.profiles pr ON pr.id = m.user_id
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

NOTIFY pgrst, 'reload schema';

-- =========================================================
-- CORREÇÃO: UNIFICAÇÃO DA LÓGICA DE VALOR DE ESTOQUE
-- Data: 2026-03-27
-- Objetivo: Garantir que todas as métricas de valor financeiro
--           utilizem a soma das movimentações (Cumulative Ledger)
--           em vez da reconstrução de saldo (Asset Reconstruction).
-- =========================================================

-- 1. Atualizar RPC get_stock_summary
CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(total_stock_value numeric, items_count integer, missing_cost_items_count integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_company uuid;
BEGIN
    v_company := public.assert_tenant();

    IF NOT public.has_any_permission(auth.uid(), ARRAY[
      'estoque:geral:view', 'estoque:movimentacoes:view', 'system:global:manage'
    ]) THEN
        RAISE EXCEPTION 'Insufficient permissions';
    END IF;

    RETURN QUERY
    WITH product_data AS (
        SELECT
            p.id,
            COALESCE(p.saldo_atual, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS effective_cost
        FROM public.produtos p
        WHERE p.company_id = v_company
          AND p.ativo = true
    ),
    ledger_value AS (
        SELECT COALESCE(SUM(
            CASE 
                WHEN m.direction = 'IN' THEN m.custo_total
                ELSE -m.custo_total
            END
        ), 0)::numeric AS total_val
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company 
          AND m.status = 'ATIVO'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    ),
    active_totals AS (
        SELECT 
            COUNT(*)::integer AS cnt,
            COALESCE(COUNT(CASE WHEN pd.effective_cost = 0 THEN 1 END), 0)::integer AS missing_costs
        FROM product_data pd
    )
    SELECT
        lv.total_val AS total_stock_value,
        at.cnt AS items_count,
        at.missing_costs AS missing_cost_items_count,
        now() AS updated_at
    FROM ledger_value lv, active_totals at;
END;
$function$;

-- 2. Atualizar RPC get_stock_dashboard
CREATE OR REPLACE FUNCTION public.get_stock_dashboard(
    p_days integer DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company uuid;
    v_result jsonb;
    v_cutoff timestamptz;
BEGIN
    v_company := public.assert_tenant();
    v_cutoff := now() - (p_days || ' days')::interval;

    WITH ledgers AS (
        SELECT 
            m.produto_id,
            SUM(CASE WHEN m.direction = 'IN' THEN m.quantidade ELSE -m.quantidade END) as saldo_qtd,
            SUM(CASE WHEN m.direction = 'IN' THEN m.custo_total ELSE -m.custo_total END) as saldo_vlr
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company 
          AND m.status = 'ATIVO'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
        GROUP BY m.produto_id
    ),
    ledger_value AS (
        SELECT COALESCE(SUM(saldo_vlr)::numeric, 0) AS valor_total
        FROM ledgers
    ),
    produto_saldos AS (
        SELECT
            p.id,
            p.nome_produto,
            p.categoria,
            p.unidade_medida,
            p.estoque_minimo,
            COALESCE(l.saldo_qtd, 0) AS saldo,
            COALESCE(
                NULLIF(p.avg30_cost_base_unit, 0),
                NULLIF(p.last_cost_base_unit, 0),
                NULLIF(p.default_cost_base_unit, 0),
                0
            ) AS custo_efetivo
        FROM public.produtos p
        LEFT JOIN ledgers l ON l.produto_id = p.id
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
                ROUND(SUM(l.saldo_vlr)::numeric, 2) AS valor,
                COUNT(DISTINCT ps.id)::int AS qtd_itens
            FROM produto_saldos ps
            JOIN ledgers l ON l.produto_id = ps.id
            WHERE l.saldo_qtd > 0
            GROUP BY 1
        ) sub
    ),
    status_counts AS (
        SELECT
            COUNT(*)::int AS total,
            COUNT(CASE WHEN ps.saldo > ps.estoque_minimo AND ps.estoque_minimo > 0 THEN 1
                       WHEN ps.estoque_minimo = 0 AND ps.saldo > 0 THEN 1 END)::int AS ok,
            COUNT(CASE WHEN ps.estoque_minimo > 0 AND ps.saldo > 0
                       AND ps.saldo <= ps.estoque_minimo AND ps.saldo > (ps.estoque_minimo * 0.5) THEN 1 END)::int AS atencao,
            COUNT(CASE WHEN ps.estoque_minimo > 0 AND ps.saldo > 0
                       AND ps.saldo <= (ps.estoque_minimo * 0.5) THEN 1 END)::int AS critico,
            COUNT(CASE WHEN ps.saldo <= 0 THEN 1 END)::int AS sem_estoque,
            COUNT(CASE WHEN ps.custo_efetivo = 0 THEN 1 END)::int AS sem_custo
        FROM produto_saldos ps
    ),
    recent_mov AS (
        SELECT COALESCE(jsonb_agg(jsonb_build_object(
            'id', sub.id,
            'produto_nome', sub.nome_produto,
            'tipo', sub.tipo,
            'direction', sub.direction,
            'quantidade', sub.quantidade,
            'custo_total', sub.custo_total,
            'created_at', sub.created_at
        ) ORDER BY sub.created_at DESC), '[]'::jsonb) AS data
        FROM (
            SELECT m.id, p.nome_produto, m.tipo, m.direction, m.quantidade, m.custo_total, m.created_at
            FROM public.movimentacoes_estoque m
            JOIN public.produtos p ON p.id = m.produto_id
            WHERE m.company_id = v_company AND m.status = 'ATIVO'
              AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
              AND m.created_at >= v_cutoff
            ORDER BY m.created_at DESC
            LIMIT 10
        ) sub
    ),
    entradas_periodo AS (
        SELECT
            COALESCE(ROUND(SUM(m.custo_total)::numeric, 2), 0) AS valor,
            COUNT(*)::int AS qtd
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
          AND m.direction = 'IN'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.created_at >= v_cutoff
    ),
    saidas_periodo AS (
        SELECT
            COALESCE(ROUND(SUM(m.custo_total)::numeric, 2), 0) AS valor,
            COUNT(*)::int AS qtd
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.created_at >= v_cutoff
    )
    SELECT jsonb_build_object(
        'valor_total_estoque', lv.valor_total,
        'categorias', cd.data,
        'status', jsonb_build_object(
            'total', sc.total,
            'ok', sc.ok,
            'atencao', sc.atencao,
            'critico', sc.critico,
            'sem_estoque', sc.sem_estoque,
            'sem_custo', sc.sem_custo
        ),
        'movimentacoes_recentes', rm.data,
        'entradas_periodo', jsonb_build_object('valor', ep.valor, 'qtd', ep.qtd),
        'saidas_periodo', jsonb_build_object('valor', sp.valor, 'qtd', sp.qtd),
        'dias_periodo', p_days
    ) INTO v_result
    FROM ledger_value lv, cat_dist cd, status_counts sc, recent_mov rm, entradas_periodo ep, saidas_periodo sp;

    RETURN v_result;
END;
$$;

NOTIFY pgrst, 'reload schema';

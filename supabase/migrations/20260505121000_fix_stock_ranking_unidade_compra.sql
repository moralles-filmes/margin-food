-- =========================================================
-- FIX: get_stock_top_consumed — exibir em unidade de compra
-- Data: 2026-05-05
-- Causa: a RPC retornava quantidades em unidade base (unidade_medida, ex.: L)
--   porque movimentacoes_estoque.quantidade é sempre gravado em base.
--   O usuário raciocina em unidade de compra (ex.: Galão), então o Ranking
--   exibia "20,00 L" quando o correto seria "1,00 Galão" para Vinagre de Arroz
--   (fator_conversao_padrao = 20).
-- Solução: na CTE full_ranked, dividir todas as quantidades pelo
--   fator_conversao_padrao e devolver unidade_compra no campo unidade_medida
--   (nome mantido para compatibilidade com o front sem breaking change).
--   Produtos sem dual-unit (unidade_compra NULL ou igual à base, ou fator = 0)
--   mantêm comportamento idêntico ao anterior.
--   Valores monetários (custo_total) e cobertura_dias são invariantes.
--   status_estoque é avaliado em base (antes da conversão) para preservar
--   os thresholds originais.
-- =========================================================

CREATE OR REPLACE FUNCTION public.get_stock_top_consumed(
    p_start_date date,
    p_end_date date,
    p_rank_by text DEFAULT 'quantity',
    p_limit integer DEFAULT 20,
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
    v_days integer;
BEGIN
    v_company := public.assert_tenant();
    v_days := GREATEST((p_end_date - p_start_date + 1), 1);

    WITH saldos AS (
        SELECT
            m.produto_id,
            SUM(
              CASE
                WHEN m.tipo IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') THEN 0
                WHEN m.direction = 'IN' THEN m.quantidade
                ELSE -m.quantidade
              END
            ) AS saldo
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company AND m.status = 'ATIVO'
        GROUP BY m.produto_id
    ),
    consumo AS (
        SELECT
            m.produto_id,
            -- agregação em base; conversão para unidade de compra ocorre em full_ranked
            ROUND(SUM(m.quantidade)::numeric, 4) AS consumo_total,
            ROUND(SUM(m.quantidade * m.custo_unitario)::numeric, 2) AS custo_total,
            COUNT(*)::int AS total_saidas,
            MAX(m.created_at) AS ultima_saida
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.direction = 'OUT'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
          AND m.created_at::date >= p_start_date
          AND m.created_at::date <= p_end_date
        GROUP BY m.produto_id
    ),
    -- Full dataset (no LIMIT) for category summary
    full_ranked AS (
        SELECT
            p.id AS produto_id,
            p.nome_produto,
            p.categoria,

            -- Unidade de exibição: unidade_compra quando dual-unit válido, senão unidade_medida.
            -- Mantém nome de coluna "unidade_medida" para compatibilidade com o front sem breaking change.
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN p.unidade_compra
                ELSE p.unidade_medida
            END AS unidade_medida,

            -- Estoque mínimo convertido (base armazenada → compra para display)
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(p.estoque_minimo, 0) / p.fator_conversao_padrao)::numeric, 4)
                ELSE COALESCE(p.estoque_minimo, 0)
            END AS estoque_minimo,

            -- Saldo convertido para unidade de compra
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(s.saldo, 0) / p.fator_conversao_padrao)::numeric, 4)
                ELSE COALESCE(s.saldo, 0)
            END AS saldo_atual,

            -- Consumo convertido para unidade de compra
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(c.consumo_total, 0) / p.fator_conversao_padrao)::numeric, 4)
                ELSE COALESCE(c.consumo_total, 0)
            END AS consumo_total,

            COALESCE(c.custo_total, 0) AS custo_total,  -- R$: não converte
            COALESCE(c.total_saidas, 0) AS total_saidas,
            c.ultima_saida,

            -- Média diária convertida (consumo convertido / dias)
            CASE
                WHEN p.unidade_compra IS NOT NULL
                 AND p.unidade_compra <> p.unidade_medida
                 AND COALESCE(p.fator_conversao_padrao, 0) > 0
                THEN ROUND((COALESCE(c.consumo_total, 0) / p.fator_conversao_padrao / v_days)::numeric, 4)
                ELSE ROUND((COALESCE(c.consumo_total, 0) / v_days)::numeric, 4)
            END AS media_diaria,

            -- Cobertura em dias: invariante sob conversão (saldo/fator ÷ consumo/fator/v_days = saldo*v_days/consumo).
            -- Calculado em base para simplicidade.
            CASE
                WHEN COALESCE(c.consumo_total, 0) > 0 AND COALESCE(s.saldo, 0) > 0
                THEN ROUND((COALESCE(s.saldo, 0) / (COALESCE(c.consumo_total, 0) / v_days))::numeric, 1)
                ELSE NULL
            END AS cobertura_dias,

            -- Status de estoque avaliado em base para preservar thresholds originais
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
    ),
    ranked AS (
        SELECT *
        FROM full_ranked
        ORDER BY
            CASE WHEN p_rank_by = 'cost' THEN custo_total ELSE consumo_total END DESC NULLS LAST
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
    -- Category summary from FULL dataset (not limited)
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
            FROM full_ranked r
            GROUP BY 1
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(r.consumo_total), 0)::numeric, 4) AS consumo_total,
            ROUND(COALESCE(SUM(r.custo_total), 0)::numeric, 2) AS custo_total,
            COUNT(CASE WHEN r.status_estoque IN ('critico','sem_estoque') THEN 1 END)::int AS itens_criticos,
            COUNT(CASE WHEN r.sem_custo THEN 1 END)::int AS itens_sem_custo
        FROM full_ranked r
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
$$;

-- Blindagem: força resolução das colunas unidade_compra e fator_conversao_padrao
-- em produtos agora, no push, em vez de silenciosamente em runtime.
DO $$
BEGIN
    PERFORM 1
    FROM public.produtos p
    WHERE p.unidade_compra IS NOT NULL
      AND p.fator_conversao_padrao > 0
    LIMIT 0;
END$$;

NOTIFY pgrst, 'reload schema';

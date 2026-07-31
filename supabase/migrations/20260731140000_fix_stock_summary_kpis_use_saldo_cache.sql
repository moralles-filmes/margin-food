-- =========================================================
-- FIX: get_stock_summary e get_relatorios_kpis voltam a usar
--      produtos.saldo_atual (cache) em vez do ledger cumulativo
--      de movimentacoes_estoque.
-- Data: 2026-07-31
--
-- Contexto: a migration 20260502190000_fix_stock_value_use_ledger.sql
-- unificou get_stock_summary, get_stock_dashboard e get_relatorios_kpis
-- para usar SUM(custo_total) sobre o ledger. Em 20260505140000, o
-- get_stock_dashboard foi revertido para o padrão de cache
-- (saldo_atual x custo_efetivo) ao corrigir o bug do bucket "ok",
-- mas get_stock_summary e get_relatorios_kpis ficaram esquecidos
-- no ledger. Resultado: "Saldo Total em Estoque" (get_stock_summary)
-- voltou a divergir de "Valor em Estoque" no Dashboard
-- (get_stock_dashboard) -- confirmado em produção: empresa Moralles,
-- ledger=R$6.361,17 vs cache=R$6.345,79 (diferença R$15,38).
--
-- Motivo para NUNCA recalcular sobre o ledger (ver CLAUDE.md,
-- princípio "produtos.saldo_atual é fonte única da verdade"):
-- cancelar uma movimentação insere estorno (ENTRADA_ESTORNO/
-- SAIDA_ESTORNO, status ATIVO) que o trigger de saldo_atual ignora
-- por design -- somar o ledger inteiro sem replicar essa exclusão
-- produz valores fantasmas divergentes do cache (caso confirmado:
-- Vinagre de Arroz Ren Sushi, bug de R$173,55 em 2026-05-05).
--
-- Esta migration alinha get_stock_summary e get_relatorios_kpis ao
-- mesmo padrão de get_stock_dashboard/get_stock_predictive_analysis_v2:
-- SUM(saldo_atual x custo_efetivo) com fallback avg30->last->default,
-- filtrando produtos ativos.
-- =========================================================

-- 1. get_stock_summary -> cache (saldo_atual x custo_efetivo)
CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(total_stock_value numeric, items_count integer, missing_cost_items_count integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
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
    active_totals AS (
        SELECT
            COALESCE(SUM(pd.saldo * pd.effective_cost), 0)::numeric AS total_val,
            COUNT(*)::integer AS cnt,
            COALESCE(COUNT(*) FILTER (WHERE pd.effective_cost = 0), 0)::integer AS missing_costs
        FROM product_data pd
    )
    SELECT
        ROUND(at.total_val, 2) AS total_stock_value,
        at.cnt AS items_count,
        at.missing_costs AS missing_cost_items_count,
        now() AS updated_at
    FROM active_totals at;
END;
$function$;

-- =========================================================
-- 2. get_relatorios_kpis(date, date) -> v_valor_estoque via cache
--    (chamada real do cliente é _relatorios_kpis_guarded(text,text)
--    -> get_relatorios_kpis(p_start::date, p_end::date))
--    Apenas o cálculo de v_valor_estoque muda; resto da função
--    é idêntico à definição vigente em produção.
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_relatorios_kpis(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_result              jsonb;
  v_faturamento         numeric;
  v_custo_total         numeric;
  v_custo_salmon        numeric;
  v_cmv_geral           numeric;
  v_cmv_salmon          numeric;
  v_margem              numeric;
  v_impacto             numeric;
  v_cmv_categorias      jsonb;
  v_tendencia           jsonb;
  v_valor_estoque       numeric;
  v_abaixo_minimo       jsonb;
  v_maiores_perdas      jsonb;
  v_ruptura             numeric;
  v_total_ativos        int;
  v_count_abaixo        int;
  v_giro                numeric;
  v_cobertura           numeric;
  v_consumo_periodo     numeric;
  v_semanas_periodo     numeric;
  v_parado_percent      numeric;
  v_count_parados       int;
  v_company             uuid;
  v_salmon_bruto_kg     numeric;
  v_salmon_limpo_kg     numeric;
  v_salmon_valor_estoque numeric;
  v_salmon_compras_valor numeric;
  v_salmon_compras_kg   numeric;
BEGIN
  v_company := public.assert_tenant();
  IF NOT has_permission(auth.uid(), 'reports:read') THEN
    RAISE EXCEPTION 'Sem permissão (reports:read).';
  END IF;

  SELECT COALESCE(SUM(faturamento_bruto), 0) INTO v_faturamento
  FROM financeiro_fechamento_caixa
  WHERE company_id = v_company AND data BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_total
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT';

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_custo_salmon
  FROM movimentacoes_estoque m
  JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
  WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    AND m.direction = 'OUT' AND m.source_module = 'salmon';

  v_cmv_geral  := CASE WHEN v_faturamento > 0 THEN ROUND(v_custo_total / v_faturamento * 100, 2) ELSE NULL END;
  v_cmv_salmon := CASE WHEN v_faturamento > 0 THEN ROUND(v_custo_salmon / v_faturamento * 100, 2) ELSE NULL END;
  v_margem     := CASE WHEN v_cmv_geral IS NOT NULL THEN ROUND(100 - v_cmv_geral, 2) ELSE NULL END;
  v_impacto    := CASE WHEN v_custo_total > 0 THEN ROUND(v_custo_salmon / v_custo_total * 100, 2) ELSE NULL END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.custo_consumido DESC), '[]'::jsonb)
  INTO v_cmv_categorias
  FROM (
    SELECT COALESCE(p.categoria, 'Outros') AS categoria,
      ROUND(SUM(m.custo_total)::numeric, 2) AS custo_consumido,
      CASE WHEN v_custo_total > 0 THEN ROUND(SUM(m.custo_total) / v_custo_total * 100, 2) ELSE 0 END AS percent_do_total
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
    WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT'
    GROUP BY p.categoria HAVING SUM(m.custo_total) > 0
  ) sub;

  WITH monthly_cost AS (
    SELECT EXTRACT(YEAR FROM m.data)::int AS ano, EXTRACT(MONTH FROM m.data)::int AS mes,
      ROUND(SUM(m.custo_total)::numeric, 2) AS custo
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company AND p.conta_no_cmv = true
    WHERE m.company_id = v_company AND m.data BETWEEN (p_start - INTERVAL '3 months') AND p_end
      AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT'
    GROUP BY 1, 2
  ),
  monthly_revenue AS (
    SELECT EXTRACT(YEAR FROM f.data)::int AS ano, EXTRACT(MONTH FROM f.data)::int AS mes,
      ROUND(SUM(f.faturamento_bruto)::numeric, 2) AS faturamento
    FROM financeiro_fechamento_caixa f
    WHERE f.company_id = v_company AND f.data BETWEEN (p_start - INTERVAL '3 months') AND p_end
    GROUP BY 1, 2
  )
  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.ano, sub.mes), '[]'::jsonb)
  INTO v_tendencia
  FROM (
    SELECT mc.ano, mc.mes, COALESCE(mr.faturamento, 0) AS faturamento, mc.custo,
      CASE WHEN COALESCE(mr.faturamento, 0) > 0 THEN ROUND(mc.custo / mr.faturamento * 100, 2) ELSE NULL END AS cmv_percent
    FROM monthly_cost mc LEFT JOIN monthly_revenue mr ON mr.ano = mc.ano AND mr.mes = mc.mes
  ) sub;

  -- ===== CACHE: saldo_atual x custo_efetivo, mesma base que get_stock_dashboard =====
  SELECT COALESCE(SUM(
    COALESCE(p.saldo_atual, 0) * COALESCE(
      NULLIF(p.avg30_cost_base_unit, 0),
      NULLIF(p.last_cost_base_unit, 0),
      NULLIF(p.default_cost_base_unit, 0),
      0
    )
  ), 0) INTO v_valor_estoque
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true;

  SELECT COUNT(*) INTO v_total_ativos FROM produtos p WHERE p.company_id = v_company AND p.ativo = true;

  SELECT COUNT(*) INTO v_count_abaixo
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true
    AND COALESCE(p.estoque_minimo, 0) > 0
    AND COALESCE(p.saldo_atual, 0) < p.estoque_minimo;

  v_ruptura := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_abaixo::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.diff DESC), '[]'::jsonb)
  INTO v_abaixo_minimo
  FROM (
    SELECT p.id AS produto_id,
           p.nome_produto AS nome,
           COALESCE(p.saldo_atual, 0) AS saldo,
           p.estoque_minimo AS minimo,
           (p.estoque_minimo - COALESCE(p.saldo_atual, 0)) AS diff
    FROM produtos p
    WHERE p.company_id = v_company
      AND p.ativo = true
      AND COALESCE(p.estoque_minimo, 0) > 0
      AND COALESCE(p.saldo_atual, 0) < p.estoque_minimo
    ORDER BY (p.estoque_minimo - COALESCE(p.saldo_atual, 0)) DESC
    LIMIT 5
  ) sub;

  SELECT COALESCE(jsonb_agg(row_to_json(sub)::jsonb ORDER BY sub.perda_valor DESC), '[]'::jsonb)
  INTO v_maiores_perdas
  FROM (
    SELECT m.produto_id, p.nome_produto AS nome,
      ROUND(SUM(m.quantidade)::numeric, 3) AS perda_kg,
      ROUND(SUM(m.custo_total)::numeric, 2) AS perda_valor
    FROM movimentacoes_estoque m
    JOIN produtos p ON p.id = m.produto_id AND p.company_id = v_company
    WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
      AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')
    GROUP BY m.produto_id, p.nome_produto ORDER BY perda_valor DESC LIMIT 5
  ) sub;

  SELECT COALESCE(SUM(m.custo_total), 0) INTO v_consumo_periodo
  FROM movimentacoes_estoque m
  WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end
    AND m.status = 'ATIVO' AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO') AND m.direction = 'OUT';

  v_semanas_periodo := GREATEST((p_end - p_start)::numeric / 7.0, 1);
  v_giro     := CASE WHEN v_valor_estoque > 0 THEN ROUND(v_consumo_periodo / v_valor_estoque, 2) ELSE 0 END;
  v_cobertura := CASE WHEN v_consumo_periodo > 0 THEN ROUND(v_valor_estoque / (v_consumo_periodo / v_semanas_periodo), 1) ELSE 0 END;

  SELECT COUNT(*) INTO v_count_parados
  FROM produtos p
  WHERE p.company_id = v_company
    AND p.ativo = true
    AND COALESCE(p.saldo_atual, 0) > 0
    AND NOT EXISTS (
      SELECT 1 FROM movimentacoes_estoque m
      WHERE m.company_id = v_company
        AND m.produto_id = p.id
        AND m.status = 'ATIVO'
        AND m.created_at >= (CURRENT_DATE - 28)
    );

  v_parado_percent := CASE WHEN v_total_ativos > 0 THEN ROUND(v_count_parados::numeric / v_total_ativos * 100, 2) ELSE 0 END;

  SELECT COALESCE(SUM(se.gross_kg - COALESCE((
    SELECT SUM(sm.gross_out_kg) FROM salmon_manipulations sm
    WHERE sm.entry_id = se.id AND sm.company_id = v_company AND sm.status = 'ACTIVE'), 0)), 0)
  INTO v_salmon_bruto_kg
  FROM salmon_entries se WHERE se.company_id = v_company AND se.status = 'ACTIVE';

  SELECT COALESCE(SUM(sm.clean_in_kg), 0) INTO v_salmon_limpo_kg
  FROM salmon_manipulations sm
  WHERE sm.company_id = v_company AND sm.status = 'ACTIVE';

  SELECT COALESCE(SUM(se.total_value), 0), COALESCE(SUM(se.gross_kg), 0)
  INTO v_salmon_compras_valor, v_salmon_compras_kg
  FROM salmon_entries se
  WHERE se.company_id = v_company AND se.status = 'ACTIVE' AND se.entry_date BETWEEN p_start AND p_end;

  SELECT COALESCE(SUM(sub.balance_kg * sub.cost_per_kg), 0) INTO v_salmon_valor_estoque
  FROM (
    SELECT se.id,
      se.gross_kg - COALESCE((SELECT SUM(sm.gross_out_kg) FROM salmon_manipulations sm
        WHERE sm.entry_id = se.id AND sm.company_id = v_company AND sm.status = 'ACTIVE'), 0) AS balance_kg,
      CASE WHEN se.gross_kg > 0 THEN se.total_value / se.gross_kg ELSE 0 END AS cost_per_kg
    FROM salmon_entries se WHERE se.company_id = v_company AND se.status = 'ACTIVE'
  ) sub WHERE sub.balance_kg > 0.01;

  v_result := jsonb_build_object(
    'faturamento_total',    ROUND(v_faturamento::numeric, 2),
    'faturamento_source',   'financeiro_fechamento_caixa',
    'custo_consumido_total', ROUND(v_custo_total::numeric, 2),
    'custo_salmon',         ROUND(v_custo_salmon::numeric, 2),
    'cmv_geral_percent',    v_cmv_geral,
    'cmv_salmon_percent',   v_cmv_salmon,
    'margem_bruta_percent', v_margem,
    'impacto_salmon_percent', v_impacto,
    'meta_cmv',             COALESCE((SELECT (value::numeric) FROM app_config WHERE key = 'meta_cmv'), 35),
    'cmv_por_categoria',    v_cmv_categorias,
    'tendencia_cmv_3_meses', v_tendencia,
    'valor_total_estoque',  ROUND(v_valor_estoque::numeric, 2),
    'itens_abaixo_minimo_count', v_count_abaixo,
    'itens_abaixo_minimo_top5',  v_abaixo_minimo,
    'maiores_perdas_top5',  v_maiores_perdas,
    'ruptura_percent',      v_ruptura,
    'giro_estoque',         v_giro,
    'cobertura_semanas',    v_cobertura,
    'parado_percent',       v_parado_percent,
    'parado_count',         v_count_parados,
    'total_ativos',         v_total_ativos,
    'perdas_kg',            COALESCE((SELECT ROUND(SUM(m.quantidade)::numeric, 3) FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')), 0),
    'perdas_valor',         COALESCE((SELECT ROUND(SUM(m.custo_total)::numeric, 2) FROM movimentacoes_estoque m WHERE m.company_id = v_company AND m.data BETWEEN p_start AND p_end AND m.status = 'ATIVO' AND m.tipo IN ('PERDA', 'VENCIMENTO')), 0),
    'salmon_bruto_kg',      ROUND(v_salmon_bruto_kg::numeric, 3),
    'salmon_limpo_kg',      ROUND(v_salmon_limpo_kg::numeric, 3),
    'salmon_valor_estoque', ROUND(v_salmon_valor_estoque::numeric, 2),
    'salmon_compras_valor', ROUND(v_salmon_compras_valor::numeric, 2),
    'salmon_compras_kg',    ROUND(v_salmon_compras_kg::numeric, 3)
  );
  RETURN v_result;
END;
$function$;

NOTIFY pgrst, 'reload schema';

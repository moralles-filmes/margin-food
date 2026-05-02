-- =========================================================
-- FIX: Unificar fórmula de valor de estoque para ledger
-- Data: 2026-05-02
-- Objetivo: get_stock_summary, get_stock_dashboard e
--           get_relatorios_kpis devem exibir o mesmo valor
--           usando o ledger (Σ custo_total das movimentações)
--           em vez de saldo_atual × custo_efetivo.
-- Motivo: migration 20260327220000 não foi aplicada em produção.
--         As três funções usavam fórmulas distintas:
--           - get_stock_summary: saldo × effective_cost
--           - get_stock_dashboard: saldo × custo_efetivo
--           - get_relatorios_kpis: saldo × custo_padrao (pior)
-- =========================================================

-- 1. get_stock_summary → ledger
CREATE OR REPLACE FUNCTION public.get_stock_summary()
RETURNS TABLE(total_stock_value numeric, items_count integer, missing_cost_items_count integer, updated_at timestamp with time zone)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
            CASE WHEN m.direction = 'IN' THEN m.custo_total ELSE -m.custo_total END
        ), 0)::numeric AS total_val
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
    ),
    active_totals AS (
        SELECT
            COUNT(*)::integer AS cnt,
            COALESCE(COUNT(*) FILTER (WHERE pd.effective_cost = 0), 0)::integer AS missing_costs
        FROM product_data pd
    )
    SELECT
        ROUND(lv.total_val, 2) AS total_stock_value,
        at.cnt AS items_count,
        at.missing_costs AS missing_cost_items_count,
        now() AS updated_at
    FROM ledger_value lv, active_totals at;
END;
$$;

-- =========================================================
-- 2. get_stock_dashboard → ledger para valor_total e categorias
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_stock_dashboard(p_days integer DEFAULT 30)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_company uuid;
    v_result  jsonb;
    v_cutoff  timestamptz;
BEGIN
    v_company := public.assert_tenant();
    v_cutoff  := now() - (p_days || ' days')::interval;

    WITH produto_saldos AS (
        -- mantido para status counts (ok/atencao/critico/sem_custo)
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
    -- ledger por produto: base financeira única
    cat_ledger AS (
        SELECT
            m.produto_id,
            SUM(CASE WHEN m.direction = 'IN' THEN m.custo_total
                     ELSE -m.custo_total END) AS ledger_val
        FROM public.movimentacoes_estoque m
        WHERE m.company_id = v_company
          AND m.status = 'ATIVO'
          AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO')
        GROUP BY m.produto_id
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
                ROUND(COALESCE(SUM(cl.ledger_val), 0)::numeric, 2)  AS valor,
                COUNT(DISTINCT ps.id)::int                           AS qtd_itens
            FROM produto_saldos ps
            LEFT JOIN cat_ledger cl ON cl.produto_id = ps.id
            WHERE COALESCE(cl.ledger_val, 0) > 0
            GROUP BY 1
        ) sub
    ),
    status_counts AS (
        SELECT
            COUNT(*) FILTER (WHERE ps.saldo > ps.estoque_minimo OR COALESCE(ps.estoque_minimo, 0) = 0)::int AS ok,
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND ps.saldo <= ps.estoque_minimo AND ps.estoque_minimo > 0)::int AS atencao,
            COUNT(*) FILTER (WHERE ps.saldo > 0 AND ps.saldo <= (ps.estoque_minimo * 0.5) AND ps.estoque_minimo > 0)::int AS critico,
            COUNT(*) FILTER (WHERE ps.saldo <= 0)::int AS sem_estoque,
            COUNT(*) FILTER (WHERE ps.custo_efetivo = 0)::int AS sem_custo
        FROM produto_saldos ps
    ),
    recent_mov AS (
        SELECT COALESCE(jsonb_agg(sub.row_data ORDER BY sub.rn), '[]'::jsonb) AS data
        FROM (
            SELECT
                ROW_NUMBER() OVER (ORDER BY m.created_at DESC) AS rn,
                jsonb_build_object(
                    'id',           m.id,
                    'data',         m.created_at,
                    'produto',      p.nome_produto,
                    'tipo',         m.tipo,
                    'quantidade',   m.quantidade,
                    'custo_unitario', m.custo_unitario,
                    'unidade',      p.unidade_medida,
                    'usuario',      pr.nome
                ) AS row_data
            FROM public.movimentacoes_estoque m
            JOIN public.produtos p  ON p.id  = m.produto_id
            LEFT JOIN public.profiles pr ON pr.id = m.created_by
            WHERE m.company_id = v_company AND m.status = 'ATIVO'
              AND m.created_at >= v_cutoff
            ORDER BY m.created_at DESC
            LIMIT 10
        ) sub
    ),
    totals AS (
        SELECT
            ROUND(COALESCE(SUM(cl.ledger_val), 0)::numeric, 2) AS valor_total,
            COUNT(DISTINCT ps.id)::int                          AS total_produtos,
            COUNT(DISTINCT ps.id) FILTER (WHERE ps.saldo > 0)::int AS produtos_com_saldo
        FROM produto_saldos ps
        LEFT JOIN cat_ledger cl ON cl.produto_id = ps.id
    )
    SELECT jsonb_build_object(
        'valor_total',       COALESCE(t.valor_total, 0),
        'total_produtos',    t.total_produtos,
        'produtos_com_saldo', t.produtos_com_saldo,
        'ok',                sc.ok,
        'atencao',           sc.atencao,
        'critico',           sc.critico,
        'sem_estoque',       sc.sem_estoque,
        'sem_custo',         sc.sem_custo,
        'categorias',        COALESCE(cd.data, '[]'::jsonb),
        'movimentacoes',     COALESCE(rm.data, '[]'::jsonb)
    ) INTO v_result
    FROM totals t, status_counts sc, cat_dist cd, recent_mov rm;

    RETURN v_result;
END;
$$;

-- =========================================================
-- 3. get_relatorios_kpis(date, date) → ledger para v_valor_estoque
--    Apenas a linha de cálculo de valor de estoque muda.
--    Antes: saldo_atual × custo_padrao (custo padrão apenas).
--    Agora: Σ ledger (mesma base das outras funções).
-- =========================================================
CREATE OR REPLACE FUNCTION public.get_relatorios_kpis(p_start date, p_end date)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- ===== LEDGER: mesma base que get_stock_summary e get_stock_dashboard =====
  SELECT COALESCE(SUM(
    CASE WHEN m.direction = 'IN' THEN m.custo_total ELSE -m.custo_total END
  ), 0) INTO v_valor_estoque
  FROM movimentacoes_estoque m
  WHERE m.company_id = v_company
    AND m.status = 'ATIVO'
    AND m.tipo NOT IN ('ENTRADA_ESTORNO', 'SAIDA_ESTORNO');

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
$$;

NOTIFY pgrst, 'reload schema';

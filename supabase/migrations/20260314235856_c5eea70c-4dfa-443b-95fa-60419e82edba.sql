
-- RPC: relatorio_socios_resumo
-- Aggregates all data server-side for the Relatório para Sócios sub-tab.
-- Handles: transfer exclusion, CONCILIADO status, rateio distribution, no truncation.
CREATE OR REPLACE FUNCTION public.relatorio_socios_resumo(p_mes TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id UUID;
  v_inicio DATE;
  v_fim DATE;
  v_receita NUMERIC := 0;
  v_despesa NUMERIC := 0;
  v_a_receber NUMERIC := 0;
  v_a_pagar NUMERIC := 0;
  v_top_despesas JSONB;
  v_top_receitas JSONB;
BEGIN
  -- Resolve tenant
  SELECT company_id INTO v_company_id
  FROM public.profiles
  WHERE id = auth.uid();

  IF v_company_id IS NULL THEN
    RAISE EXCEPTION 'Tenant não encontrado';
  END IF;

  -- Build date range
  v_inicio := (p_mes || '-01')::DATE;
  v_fim := (date_trunc('month', v_inicio) + interval '1 month - 1 day')::DATE;

  -- ══════════════════════════════════════════════
  -- KPIs: Receita & Despesa (competência)
  -- Excludes TRANSFERENCIA, includes REALIZADO + CONCILIADO
  -- ══════════════════════════════════════════════
  SELECT
    COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0)
  INTO v_receita, v_despesa
  FROM fin_lancamentos
  WHERE company_id = v_company_id
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo IN ('RECEITA', 'DESPESA')
    AND data_competencia >= v_inicio
    AND data_competencia <= v_fim;

  -- ══════════════════════════════════════════════
  -- A Receber (pendentes por vencimento no mês)
  -- ══════════════════════════════════════════════
  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM fin_contas_receber
  WHERE company_id = v_company_id
    AND status = 'A_RECEBER'
    AND data_vencimento >= v_inicio
    AND data_vencimento <= v_fim;

  -- ══════════════════════════════════════════════
  -- A Pagar (pendentes por vencimento no mês)
  -- ══════════════════════════════════════════════
  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM fin_contas_pagar
  WHERE company_id = v_company_id
    AND status IN ('APROVADO', 'AGUARDANDO_APROVACAO')
    AND data_vencimento >= v_inicio
    AND data_vencimento <= v_fim;

  -- ══════════════════════════════════════════════
  -- Top Despesas por categoria (considers rateios)
  -- If a lancamento has rateios, use the rateio distribution.
  -- Otherwise, use the lancamento's own categoria_id.
  -- ══════════════════════════════════════════════
  WITH lancamentos_periodo AS (
    SELECT id, tipo, valor, categoria_id
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo = 'DESPESA'
      AND data_competencia >= v_inicio
      AND data_competencia <= v_fim
  ),
  rateios_periodo AS (
    SELECT r.lancamento_id, r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    INNER JOIN lancamentos_periodo lp ON lp.id = r.lancamento_id
    WHERE r.company_id = v_company_id
  ),
  lancamentos_com_rateio AS (
    SELECT DISTINCT lancamento_id FROM rateios_periodo
  ),
  valores_por_cat AS (
    -- Lancamentos SEM rateio: usa categoria do pai
    SELECT lp.categoria_id, lp.valor
    FROM lancamentos_periodo lp
    LEFT JOIN lancamentos_com_rateio lcr ON lcr.lancamento_id = lp.id
    WHERE lcr.lancamento_id IS NULL AND lp.categoria_id IS NOT NULL
    UNION ALL
    -- Lancamentos COM rateio: usa distribuição do rateio
    SELECT rp.categoria_id, rp.valor
    FROM rateios_periodo rp
    WHERE rp.categoria_id IS NOT NULL
  ),
  agrupado AS (
    SELECT
      COALESCE(c.nome, 'Sem categoria') AS nome,
      SUM(vpc.valor) AS total
    FROM valores_por_cat vpc
    LEFT JOIN fin_categorias c ON c.id = vpc.categoria_id AND c.company_id = v_company_id
    GROUP BY COALESCE(c.nome, 'Sem categoria')
    ORDER BY total DESC
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', nome, 'valor', total)), '[]'::jsonb)
  INTO v_top_despesas
  FROM agrupado;

  -- ══════════════════════════════════════════════
  -- Top Receitas por categoria (same rateio logic)
  -- ══════════════════════════════════════════════
  WITH lancamentos_periodo AS (
    SELECT id, tipo, valor, categoria_id
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo = 'RECEITA'
      AND data_competencia >= v_inicio
      AND data_competencia <= v_fim
  ),
  rateios_periodo AS (
    SELECT r.lancamento_id, r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    INNER JOIN lancamentos_periodo lp ON lp.id = r.lancamento_id
    WHERE r.company_id = v_company_id
  ),
  lancamentos_com_rateio AS (
    SELECT DISTINCT lancamento_id FROM rateios_periodo
  ),
  valores_por_cat AS (
    SELECT lp.categoria_id, lp.valor
    FROM lancamentos_periodo lp
    LEFT JOIN lancamentos_com_rateio lcr ON lcr.lancamento_id = lp.id
    WHERE lcr.lancamento_id IS NULL AND lp.categoria_id IS NOT NULL
    UNION ALL
    SELECT rp.categoria_id, rp.valor
    FROM rateios_periodo rp
    WHERE rp.categoria_id IS NOT NULL
  ),
  agrupado AS (
    SELECT
      COALESCE(c.nome, 'Sem categoria') AS nome,
      SUM(vpc.valor) AS total
    FROM valores_por_cat vpc
    LEFT JOIN fin_categorias c ON c.id = vpc.categoria_id AND c.company_id = v_company_id
    GROUP BY COALESCE(c.nome, 'Sem categoria')
    ORDER BY total DESC
    LIMIT 10
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object('nome', nome, 'valor', total)), '[]'::jsonb)
  INTO v_top_receitas
  FROM agrupado;

  -- ══════════════════════════════════════════════
  -- Return consolidated result
  -- ══════════════════════════════════════════════
  RETURN jsonb_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'resultado', v_receita - v_despesa,
    'aReceber', v_a_receber,
    'aPagar', v_a_pagar,
    'topDespesas', v_top_despesas,
    'topReceitas', v_top_receitas
  );
END;
$$;

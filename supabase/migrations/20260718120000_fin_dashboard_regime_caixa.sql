-- Dashboard Financeiro: cards e gráficos passam a REGIME DE CAIXA
-- ------------------------------------------------------------------
-- Motivo: os cards "Despesa do Período"/"Resultado" (e os gráficos do dashboard)
-- vinham somando CONTAS A PAGAR/RECEBER EM ABERTO por competência (regime de
-- competência, alinhado ao DRE na etapa de 2026-06-10). Na prática isso confundia:
-- o dashboard mostrava ~R$9k de despesa mesmo sem lançamento nenhum (só boletos a
-- pagar), e o clique em "Despesa do Período" levava à tela de Lançamentos — que
-- lista apenas fin_lancamentos e NUNCA mostra CP/CR em aberto -> número "sem lastro".
--
-- Decisão do dono do produto (2026-07-18): o DASHBOARD é visão de CAIXA — conta
-- apenas o que de fato foi realizado (lançamentos REALIZADO/CONCILIADO). Boletos
-- não pagos ficam SOMENTE nos cards "A Pagar"/"A Receber" (por vencimento).
--
-- O DRE (get_fin_dre_summary) e o DFC permanecem INALTERADOS — a visão por
-- competência com CP/CR em aberto continua sendo a fonte de verdade contábil lá.
-- Estes dois RPCs são usados exclusivamente pelo Dashboard (DashboardFinanceiroSection
-- e DashboardCharts), então a mudança não afeta DRE/Relatórios/KPIs.

-- 1) Resumo (6 cards) --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _result json;
  v_company uuid;
  v_receita numeric;
  v_despesa numeric;
  v_a_receber numeric;
  v_a_pagar numeric;
  v_saldo_caixa numeric;
  v_saldo_inicial_contas numeric;
  v_receita_prev numeric;
  v_despesa_prev numeric;
  v_prev_start date;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:dashboard:view)';
  END IF;

  -- Receita (CAIXA): somente lançamentos REALIZADO/CONCILIADO por competência.
  -- CR em aberto NÃO entra aqui (fica no card "A Receber" por vencimento).
  v_receita := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= p_start AND data_competencia < p_end
  );

  -- Despesa (CAIXA): somente lançamentos REALIZADO/CONCILIADO por competência.
  -- CP em aberto (boletos não pagos) NÃO entra aqui (fica no card "A Pagar").
  v_despesa := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= p_start AND data_competencia < p_end
  );

  -- Contas a Receber pendentes no período (por vencimento) — inalterado
  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status NOT IN ('RECEBIDO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Contas a Pagar pendentes no período (por vencimento) — inalterado
  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status NOT IN ('PAGO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Saldo em Caixa = saldo_inicial + movimentos realizados POR CAIXA até p_end — inalterado
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial_contas
  FROM public.fin_contas
  WHERE company_id = v_company AND ativo = true;

  SELECT v_saldo_inicial_contas + COALESCE(SUM(
    CASE WHEN tipo = 'RECEITA' THEN valor
         WHEN tipo = 'DESPESA' THEN -valor
         ELSE 0 END
  ), 0) INTO v_saldo_caixa
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo != 'TRANSFERENCIA'
    AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end;

  -- Período anterior (mesma duração) — também regime de caixa
  v_prev_start := p_start - (p_end - p_start);

  v_receita_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= v_prev_start AND data_competencia < p_start
  );

  v_despesa_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= v_prev_start AND data_competencia < p_start
  );

  _result := json_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'resultado', v_receita - v_despesa,
    'a_receber', v_a_receber,
    'a_pagar', v_a_pagar,
    'saldo_caixa', v_saldo_caixa,
    'receita_prev', v_receita_prev,
    'despesa_prev', v_despesa_prev,
    'resultado_prev', v_receita_prev - v_despesa_prev
  );

  RETURN _result;
END;
$function$;

-- 2) Gráficos (evolução mensal + despesas por categoria) ---------------------
CREATE OR REPLACE FUNCTION public.get_fin_dashboard_charts(p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _evolucao json;
  _despesas_cat json;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Evolução mensal (CAIXA): somente lançamentos REALIZADO/CONCILIADO, por competência.
  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _evolucao
  FROM (
    SELECT mes,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0) AS receitas,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS despesas,
      COALESCE(SUM(valor) FILTER (WHERE tipo = 'RECEITA'), 0)
        - COALESCE(SUM(valor) FILTER (WHERE tipo = 'DESPESA'), 0) AS resultado
    FROM (
      SELECT tipo, valor, to_char(data_competencia, 'YYYY-MM') AS mes
        FROM public.fin_lancamentos
        WHERE company_id = v_company AND status IN ('REALIZADO', 'CONCILIADO') AND tipo != 'TRANSFERENCIA'
          AND data_competencia >= p_start AND data_competencia <= p_end
    ) y
    GROUP BY mes
  ) t;

  -- Despesas por categoria (CAIXA): somente lançamentos DESPESA REALIZADO/CONCILIADO,
  -- por competência (rateio tem prioridade sobre a categoria do lançamento).
  SELECT json_agg(row_to_json(t)) INTO _despesas_cat
  FROM (
    SELECT nome, SUM(valor) AS valor FROM (
      -- lançamento DESPESA com rateio
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, r.valor
      FROM public.fin_lancamento_rateios r
      JOIN public.fin_lancamentos l ON l.id = r.lancamento_id
      LEFT JOIN public.fin_categorias cat ON cat.id = r.categoria_id
      WHERE l.company_id = v_company AND r.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND l.data_competencia >= p_start AND l.data_competencia <= p_end
      UNION ALL
      -- lançamento DESPESA sem rateio
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, l.valor
      FROM public.fin_lancamentos l
      LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
      WHERE l.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND l.data_competencia >= p_start AND l.data_competencia <= p_end
        AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_rateios r2 WHERE r2.lancamento_id = l.id AND r2.company_id = v_company)
    ) combined
    GROUP BY nome
    ORDER BY SUM(valor) DESC
    LIMIT 8
  ) t;

  RETURN json_build_object(
    'evolucao_mensal', COALESCE(_evolucao, '[]'::json),
    'despesas_por_categoria', COALESCE(_despesas_cat, '[]'::json)
  );
END;
$function$;

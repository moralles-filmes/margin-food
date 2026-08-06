-- ============================================================================
-- Dashboard Financeiro: mesma exclusão de origem='conciliacao' desconciliado
-- já aplicada em list_fin_lancamentos_cursor/get_fin_lancamentos_totais/
-- get_fin_dre_summary (migration 20260806200000).
--
-- Achado: Receita/Despesa do Período, evolução mensal e despesas por
-- categoria no Dashboard somavam lançamentos REALIZADO/CONCILIADO sem checar
-- a combinação origem='conciliacao' AND conciliado=false — um lançamento
-- nascido do import do extrato, ainda sem categoria e desconciliado para
-- correção, continuava contando no card de Despesa mesmo já tendo sido
-- escondido do Livro Razão/DRE.
--
-- Saldo em Caixa NÃO é alterado aqui (mantém o princípio já documentado no
-- CLAUDE.md: reflete o dinheiro real independente do estado de categorização).
-- ============================================================================

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

  v_receita := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= p_start AND data_competencia < p_end
  );

  v_despesa := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= p_start AND data_competencia < p_end
  );

  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status NOT IN ('RECEBIDO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status NOT IN ('PAGO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

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

  v_prev_start := p_start - (p_end - p_start);

  v_receita_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= v_prev_start AND data_competencia < p_start
  );

  v_despesa_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
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
          AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
          AND data_competencia >= p_start AND data_competencia <= p_end
    ) y
    GROUP BY mes
  ) t;

  SELECT json_agg(row_to_json(t)) INTO _despesas_cat
  FROM (
    SELECT nome, SUM(valor) AS valor FROM (
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, r.valor
      FROM public.fin_lancamento_rateios r
      JOIN public.fin_lancamentos l ON l.id = r.lancamento_id
      LEFT JOIN public.fin_categorias cat ON cat.id = r.categoria_id
      WHERE l.company_id = v_company AND r.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND l.data_competencia >= p_start AND l.data_competencia <= p_end
      UNION ALL
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, l.valor
      FROM public.fin_lancamentos l
      LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
      WHERE l.company_id = v_company
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
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

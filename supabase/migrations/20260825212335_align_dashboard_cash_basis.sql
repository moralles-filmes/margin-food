-- Dashboard Financeiro: alinhar cards e graficos ao regime de caixa real.
--
-- A migration 20260718120000 removeu CP/CR em aberto dos cards, mas continuou
-- filtrando lancamentos realizados por data_competencia. Isso fazia o card
-- "Despesa Realizada" divergir do Livro Razao quando a competencia e o
-- pagamento caiam em periodos diferentes. A data efetiva segue a mesma regra
-- do Livro Razao e do DFC: pagamento -> conciliacao -> competencia (fallback).

CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  _result json;
  v_company uuid;
  v_today date;
  v_receita numeric;
  v_despesa numeric;
  v_a_receber numeric;
  v_a_pagar numeric;
  v_a_pagar_vencido numeric;
  v_a_pagar_vencido_qtd integer;
  v_saldo_caixa numeric;
  v_saldo_inicial_contas numeric;
  v_receita_prev numeric;
  v_despesa_prev numeric;
  v_prev_start date;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissao (financeiro:dashboard:view)';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_receita := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= p_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end
  );

  v_despesa := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= p_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end
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

  SELECT COALESCE(SUM(valor), 0), COUNT(*)::int INTO v_a_pagar_vencido, v_a_pagar_vencido_qtd
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status IN ('APROVADO', 'AGUARDANDO_APROVACAO')
    AND data_vencimento < v_today;

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
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= v_prev_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_start
  );

  v_despesa_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= v_prev_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_start
  );

  _result := json_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'resultado', v_receita - v_despesa,
    'a_receber', v_a_receber,
    'a_pagar', v_a_pagar,
    'a_pagar_vencido', v_a_pagar_vencido,
    'a_pagar_vencido_qtd', v_a_pagar_vencido_qtd,
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
      SELECT tipo, valor,
        to_char(COALESCE(data_pagamento, conciliado_em::date, data_competencia), 'YYYY-MM') AS mes
      FROM public.fin_lancamentos
      WHERE company_id = v_company
        AND excluir_dos_relatorios IS NOT TRUE
        AND status IN ('REALIZADO', 'CONCILIADO')
        AND tipo != 'TRANSFERENCIA'
        AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
        AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= p_start
        AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) <= p_end
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
        AND l.excluir_dos_relatorios IS NOT TRUE
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) >= p_start
        AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end
      UNION ALL
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, l.valor
      FROM public.fin_lancamentos l
      LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
      WHERE l.company_id = v_company
        AND l.excluir_dos_relatorios IS NOT TRUE
        AND l.status IN ('REALIZADO', 'CONCILIADO') AND l.tipo = 'DESPESA'
        AND NOT (l.origem = 'conciliacao' AND l.conciliado IS NOT TRUE)
        AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) >= p_start
        AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_end
        AND NOT EXISTS (
          SELECT 1 FROM public.fin_lancamento_rateios r2
          WHERE r2.lancamento_id = l.id AND r2.company_id = v_company
        )
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

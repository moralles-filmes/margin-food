-- ============================================================================
-- Etapa 2 / C — get_fin_dashboard_charts alinhado às regras do DRE
-- ----------------------------------------------------------------------------
-- evolucao_mensal (receitas/despesas/resultado por mês) e despesas_por_categoria
-- passam a considerar lançamentos REALIZADO/CONCILIADO + CP/CR EM ABERTO, por
-- competência (CP/CR: COALESCE(data_competencia, data_vencimento)) — igual ao DRE.
-- Rateio de CP tem prioridade (fin_lancamento_rateios é polimórfico, splits de CP
-- ficam sob o id da CP).
-- ============================================================================

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

  -- Evolução mensal: lançamentos REALIZADO/CONCILIADO + CP/CR em aberto, por competência
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
      UNION ALL
      SELECT 'DESPESA', valor, to_char(COALESCE(data_competencia, data_vencimento), 'YYYY-MM')
        FROM public.fin_contas_pagar
        WHERE company_id = v_company AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
          AND COALESCE(data_competencia, data_vencimento) >= p_start
          AND COALESCE(data_competencia, data_vencimento) <= p_end
      UNION ALL
      SELECT 'RECEITA', valor, to_char(COALESCE(data_competencia, data_vencimento), 'YYYY-MM')
        FROM public.fin_contas_receber
        WHERE company_id = v_company AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
          AND COALESCE(data_competencia, data_vencimento) >= p_start
          AND COALESCE(data_competencia, data_vencimento) <= p_end
    ) y
    GROUP BY mes
  ) t;

  -- Despesas por categoria: lançamentos DESPESA + CP em aberto, por competência (rateio tem prioridade)
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
      UNION ALL
      -- CP em aberto com rateio (split sob o id da CP)
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, r.valor
      FROM public.fin_lancamento_rateios r
      JOIN public.fin_contas_pagar cp ON cp.id = r.lancamento_id
      LEFT JOIN public.fin_categorias cat ON cat.id = r.categoria_id
      WHERE cp.company_id = v_company AND r.company_id = v_company
        AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
        AND COALESCE(cp.data_competencia, cp.data_vencimento) >= p_start
        AND COALESCE(cp.data_competencia, cp.data_vencimento) <= p_end
      UNION ALL
      -- CP em aberto sem rateio
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, cp.valor
      FROM public.fin_contas_pagar cp
      LEFT JOIN public.fin_categorias cat ON cat.id = cp.categoria_id
      WHERE cp.company_id = v_company
        AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
        AND COALESCE(cp.data_competencia, cp.data_vencimento) >= p_start
        AND COALESCE(cp.data_competencia, cp.data_vencimento) <= p_end
        AND NOT EXISTS (SELECT 1 FROM public.fin_lancamento_rateios r2 WHERE r2.lancamento_id = cp.id AND r2.company_id = v_company)
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

-- Força resolução das colunas dos novos JOINs (CP) no db push
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM r.valor
  FROM public.fin_lancamento_rateios r
  JOIN public.fin_contas_pagar cp ON cp.id = r.lancamento_id
  WHERE cp.company_id = v_sentinel
    AND cp.status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
    AND COALESCE(cp.data_competencia, cp.data_vencimento) BETWEEN '1900-01-01' AND '1900-01-31';
END $$;

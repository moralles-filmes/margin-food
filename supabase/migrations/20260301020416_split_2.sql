CREATE OR REPLACE FUNCTION public.get_fin_dashboard_charts(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _evolucao json;
  _despesas_cat json;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT json_agg(row_to_json(t)) INTO _evolucao
  FROM (
    SELECT
      to_char(data_competencia, 'YYYY-MM') AS mes,
      COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END), 0) AS receitas,
      COALESCE(SUM(CASE WHEN tipo='DESPESA' THEN valor ELSE 0 END), 0) AS despesas,
      COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END) - SUM(CASE WHEN tipo='DESPESA' THEN valor ELSE 0 END), 0) AS resultado
    FROM public.fin_lancamentos
    WHERE company_id = v_company
      AND status='REALIZADO' AND tipo != 'TRANSFERENCIA'
      AND data_competencia >= p_start AND data_competencia <= p_end
    GROUP BY to_char(data_competencia, 'YYYY-MM')
    ORDER BY mes
  ) t;

  SELECT json_agg(row_to_json(t)) INTO _despesas_cat
  FROM (
    SELECT nome, SUM(valor) AS valor FROM (
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, r.valor
      FROM public.fin_lancamento_rateios r
      JOIN public.fin_lancamentos l ON l.id = r.lancamento_id
      LEFT JOIN public.fin_categorias cat ON cat.id = r.categoria_id
      WHERE l.company_id = v_company AND r.company_id = v_company
        AND l.status='REALIZADO' AND l.tipo='DESPESA'
        AND l.data_competencia >= p_start AND l.data_competencia <= p_end
      UNION ALL
      SELECT COALESCE(cat.nome, 'Sem categoria') AS nome, l.valor
      FROM public.fin_lancamentos l
      LEFT JOIN public.fin_categorias cat ON cat.id = l.categoria_id
      WHERE l.company_id = v_company
        AND l.status='REALIZADO' AND l.tipo='DESPESA'
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
$$;
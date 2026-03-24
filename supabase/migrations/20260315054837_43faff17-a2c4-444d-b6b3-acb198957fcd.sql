
CREATE OR REPLACE FUNCTION public.comparativo_periodos(
  p_mes_a text,
  p_mes_b text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inicio_a date;
  v_fim_a date;
  v_inicio_b date;
  v_fim_b date;
  v_pa jsonb;
  v_pb jsonb;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:comparativo:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio_a := to_date(p_mes_a || '-01', 'YYYY-MM-DD');
  v_fim_a := (date_trunc('month', v_inicio_a) + interval '1 month' - interval '1 day')::date;
  v_inicio_b := to_date(p_mes_b || '-01', 'YYYY-MM-DD');
  v_fim_b := (date_trunc('month', v_inicio_b) + interval '1 month' - interval '1 day')::date;

  -- Period A
  WITH pa AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa,
      COUNT(*) AS total_lancamentos
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia BETWEEN v_inicio_a AND v_fim_a
  )
  SELECT jsonb_build_object(
    'mes', p_mes_a,
    'receita', receita,
    'despesa', despesa,
    'resultado', receita - despesa,
    'margem', CASE WHEN receita > 0 THEN ((receita - despesa) / receita) * 100 ELSE 0 END,
    'total_lancamentos', total_lancamentos
  ) INTO v_pa FROM pa;

  -- Period B
  WITH pb AS (
    SELECT
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa,
      COUNT(*) AS total_lancamentos
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia BETWEEN v_inicio_b AND v_fim_b
  )
  SELECT jsonb_build_object(
    'mes', p_mes_b,
    'receita', receita,
    'despesa', despesa,
    'resultado', receita - despesa,
    'margem', CASE WHEN receita > 0 THEN ((receita - despesa) / receita) * 100 ELSE 0 END,
    'total_lancamentos', total_lancamentos
  ) INTO v_pb FROM pb;

  -- Build result
  v_result := jsonb_build_object(
    'periodo_a', v_pa,
    'periodo_b', v_pb,
    'variacoes', jsonb_build_object(
      'receita_pct', CASE WHEN (v_pb->>'receita')::numeric > 0 THEN (((v_pa->>'receita')::numeric - (v_pb->>'receita')::numeric) / (v_pb->>'receita')::numeric) * 100 ELSE 0 END,
      'despesa_pct', CASE WHEN (v_pb->>'despesa')::numeric > 0 THEN (((v_pa->>'despesa')::numeric - (v_pb->>'despesa')::numeric) / (v_pb->>'despesa')::numeric) * 100 ELSE 0 END,
      'resultado_pct', CASE WHEN ABS((v_pb->>'resultado')::numeric) > 0 THEN (((v_pa->>'resultado')::numeric - (v_pb->>'resultado')::numeric) / ABS((v_pb->>'resultado')::numeric)) * 100 ELSE 0 END,
      'margem_pp', (v_pa->>'margem')::numeric - (v_pb->>'margem')::numeric,
      'lancamentos_pct', CASE WHEN (v_pb->>'total_lancamentos')::numeric > 0 THEN (((v_pa->>'total_lancamentos')::numeric - (v_pb->>'total_lancamentos')::numeric) / (v_pb->>'total_lancamentos')::numeric) * 100 ELSE 0 END
    ),
    'grafico', jsonb_build_array(
      jsonb_build_object('indicador', 'Receita', 'periodo_a', (v_pa->>'receita')::numeric, 'periodo_b', (v_pb->>'receita')::numeric),
      jsonb_build_object('indicador', 'Despesa', 'periodo_a', (v_pa->>'despesa')::numeric, 'periodo_b', (v_pb->>'despesa')::numeric),
      jsonb_build_object('indicador', 'Resultado', 'periodo_a', (v_pa->>'resultado')::numeric, 'periodo_b', (v_pb->>'resultado')::numeric)
    ),
    'breakdown_categorias', COALESCE((
      WITH cat_a AS (
        SELECT
          COALESCE(c.nome, 'Sem categoria') AS categoria,
          SUM(COALESCE(r.valor, l.valor)) AS valor
        FROM fin_lancamentos l
        LEFT JOIN fin_lancamento_rateios r ON r.lancamento_id = l.id
        LEFT JOIN fin_categorias c ON c.id = COALESCE(r.categoria_id, l.categoria_id)
        WHERE l.company_id = v_company_id
          AND l.tipo = 'DESPESA'
          AND l.tipo != 'TRANSFERENCIA'
          AND l.status IN ('REALIZADO', 'CONCILIADO')
          AND l.data_competencia BETWEEN v_inicio_a AND v_fim_a
        GROUP BY COALESCE(c.nome, 'Sem categoria')
      ),
      cat_b AS (
        SELECT
          COALESCE(c.nome, 'Sem categoria') AS categoria,
          SUM(COALESCE(r.valor, l.valor)) AS valor
        FROM fin_lancamentos l
        LEFT JOIN fin_lancamento_rateios r ON r.lancamento_id = l.id
        LEFT JOIN fin_categorias c ON c.id = COALESCE(r.categoria_id, l.categoria_id)
        WHERE l.company_id = v_company_id
          AND l.tipo = 'DESPESA'
          AND l.tipo != 'TRANSFERENCIA'
          AND l.status IN ('REALIZADO', 'CONCILIADO')
          AND l.data_competencia BETWEEN v_inicio_b AND v_fim_b
        GROUP BY COALESCE(c.nome, 'Sem categoria')
      ),
      combined AS (
        SELECT
          COALESCE(a.categoria, b.categoria) AS categoria,
          COALESCE(a.valor, 0) AS valor_a,
          COALESCE(b.valor, 0) AS valor_b,
          CASE WHEN COALESCE(b.valor, 0) > 0 THEN ((COALESCE(a.valor, 0) - COALESCE(b.valor, 0)) / COALESCE(b.valor, 0)) * 100 ELSE 0 END AS variacao_pct
        FROM cat_a a
        FULL OUTER JOIN cat_b b ON a.categoria = b.categoria
      )
      SELECT jsonb_agg(jsonb_build_object(
        'categoria', categoria,
        'valor_a', valor_a,
        'valor_b', valor_b,
        'variacao_pct', variacao_pct
      ) ORDER BY ABS(COALESCE(valor_a, 0) - COALESCE(valor_b, 0)) DESC)
      FROM combined
      LIMIT 10
    ), '[]'::jsonb)
  );

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.comparativo_periodos(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.comparativo_periodos(text, text) TO authenticated;

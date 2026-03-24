CREATE OR REPLACE FUNCTION public.orcamento_execucao_mensal(p_mes TEXT)
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
  v_result JSONB;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:orcamento:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio := (p_mes || '-01')::DATE;
  v_fim := (date_trunc('month', v_inicio) + interval '1 month - 1 day')::DATE;

  WITH lancamentos_despesa AS (
    SELECT id, categoria_id, valor
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo = 'DESPESA'
      AND data_competencia >= v_inicio
      AND data_competencia <= v_fim
  ),
  rateios AS (
    SELECT r.lancamento_id, r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    INNER JOIN lancamentos_despesa ld ON ld.id = r.lancamento_id
    WHERE r.company_id = v_company_id
  ),
  lancamentos_com_rateio AS (
    SELECT DISTINCT lancamento_id FROM rateios
  ),
  valores_por_cat AS (
    SELECT ld.categoria_id, ld.valor
    FROM lancamentos_despesa ld
    LEFT JOIN lancamentos_com_rateio lcr ON lcr.lancamento_id = ld.id
    WHERE lcr.lancamento_id IS NULL AND ld.categoria_id IS NOT NULL
    UNION ALL
    SELECT r.categoria_id, r.valor
    FROM rateios r
    WHERE r.categoria_id IS NOT NULL
  ),
  realizado_por_cat AS (
    SELECT categoria_id, SUM(valor)::NUMERIC AS total_realizado
    FROM valores_por_cat
    GROUP BY categoria_id
  ),
  resultado AS (
    SELECT
      o.id,
      o.categoria_id,
      COALESCE(c.nome, 'Sem categoria') AS categoria_nome,
      COALESCE(c.tipo, 'despesa') AS categoria_tipo,
      o.valor_orcado::NUMERIC,
      COALESCE(r.total_realizado, 0)::NUMERIC AS valor_realizado,
      CASE WHEN o.valor_orcado > 0
        THEN ROUND((COALESCE(r.total_realizado, 0) / o.valor_orcado) * 100, 1)
        ELSE 0
      END AS pct_execucao,
      CASE
        WHEN o.valor_orcado > 0 AND COALESCE(r.total_realizado, 0) > o.valor_orcado THEN 'estourado'
        WHEN o.valor_orcado > 0 AND COALESCE(r.total_realizado, 0) > o.valor_orcado * 0.8 THEN 'alerta'
        ELSE 'ok'
      END AS status_execucao,
      GREATEST(COALESCE(r.total_realizado, 0) - o.valor_orcado, 0)::NUMERIC AS valor_excedido,
      o.updated_at
    FROM fin_orcamentos o
    LEFT JOIN fin_categorias c ON c.id = o.categoria_id AND c.company_id = v_company_id
    LEFT JOIN realizado_por_cat r ON r.categoria_id = o.categoria_id
    WHERE o.company_id = v_company_id
      AND o.mes_ano = p_mes
    ORDER BY COALESCE(r.total_realizado, 0) DESC
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', id,
      'categoria_id', categoria_id,
      'categoriaNome', categoria_nome,
      'categoriaTipo', categoria_tipo,
      'valorOrcado', valor_orcado,
      'valorRealizado', valor_realizado,
      'pctExecucao', pct_execucao,
      'statusExecucao', status_execucao,
      'valorExcedido', valor_excedido,
      'updated_at', updated_at
    )
  ), '[]'::jsonb) INTO v_result FROM resultado;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.orcamento_execucao_mensal(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.orcamento_execucao_mensal(text) TO authenticated;

-- 2. Guarded upsert
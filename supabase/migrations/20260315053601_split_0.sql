CREATE OR REPLACE FUNCTION public.aplicar_regras_categorizacao()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_total int := 0;
  v_categorizados int := 0;
  v_regra record;
  v_match_count int;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:categorizacao:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Count uncategorized (excluding those with categorized rateio)
  SELECT count(*) INTO v_total
  FROM fin_lancamentos fl
  WHERE fl.company_id = v_company_id
    AND fl.categoria_id IS NULL
    AND fl.status NOT IN ('CANCELADO')
    AND NOT EXISTS (
      SELECT 1 FROM fin_lancamento_rateios flr
      WHERE flr.lancamento_id = fl.id
        AND flr.categoria_id IS NOT NULL
    );

  IF v_total = 0 THEN
    RETURN json_build_object('total', 0, 'categorizados', 0);
  END IF;

  FOR v_regra IN
    SELECT id, padrao, tipo_match, categoria_id, centro_custo_id
    FROM fin_regras_categorizacao
    WHERE company_id = v_company_id AND ativo = true
    ORDER BY prioridade DESC, created_at ASC
  LOOP
    WITH matched AS (
      UPDATE fin_lancamentos fl
      SET
        categoria_id = v_regra.categoria_id,
        centro_custo_id = COALESCE(v_regra.centro_custo_id, fl.centro_custo_id),
        updated_at = now()
      WHERE fl.company_id = v_company_id
        AND fl.categoria_id IS NULL
        AND fl.status NOT IN ('CANCELADO')
        AND NOT EXISTS (
          SELECT 1 FROM fin_lancamento_rateios flr
          WHERE flr.lancamento_id = fl.id
            AND flr.categoria_id IS NOT NULL
        )
        AND (
          CASE v_regra.tipo_match
            WHEN 'contem' THEN lower(COALESCE(fl.descricao, '')) LIKE '%' || lower(v_regra.padrao) || '%'
            WHEN 'exato'  THEN lower(COALESCE(fl.descricao, '')) = lower(v_regra.padrao)
            WHEN 'regex'  THEN COALESCE(fl.descricao, '') ~* v_regra.padrao
            ELSE false
          END
        )
      RETURNING fl.id
    )
    SELECT count(*) INTO v_match_count FROM matched;
    v_categorizados := v_categorizados + v_match_count;
  END LOOP;

  RETURN json_build_object('total', v_total, 'categorizados', v_categorizados);
END;
$$;

REVOKE ALL ON FUNCTION public.aplicar_regras_categorizacao() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.aplicar_regras_categorizacao() TO authenticated;

-- 2) Harden contar_lancamentos_sem_categoria with assert_tenant + RBAC + rateio exclusion
CREATE OR REPLACE FUNCTION public.preview_regra_categorizacao(
  p_padrao text,
  p_tipo_match text DEFAULT 'contem'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result json;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:categorizacao:view',
    'financeiro:categorizacao:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT COALESCE(json_agg(json_build_object(
    'id', sub.id,
    'descricao', sub.descricao,
    'valor', sub.valor,
    'data_competencia', sub.data_competencia::text
  )), '[]'::json) INTO v_result
  FROM (
    SELECT fl.id, fl.descricao, fl.valor, fl.data_competencia
    FROM fin_lancamentos fl
    WHERE fl.company_id = v_company_id
      AND fl.categoria_id IS NULL
      AND fl.status NOT IN ('CANCELADO')
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios flr
        WHERE flr.lancamento_id = fl.id
          AND flr.categoria_id IS NOT NULL
      )
      AND (
        CASE p_tipo_match
          WHEN 'contem' THEN lower(COALESCE(fl.descricao, '')) LIKE '%' || lower(p_padrao) || '%'
          WHEN 'exato'  THEN lower(COALESCE(fl.descricao, '')) = lower(p_padrao)
          WHEN 'regex'  THEN COALESCE(fl.descricao, '') ~* p_padrao
          ELSE false
        END
      )
    ORDER BY fl.data_competencia DESC
    LIMIT 20
  ) sub;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.preview_regra_categorizacao(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.preview_regra_categorizacao(text, text) TO authenticated;
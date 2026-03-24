CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_mes text)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_inicio date;
  v_fim date;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:relatorios:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_inicio := (p_mes || '-01')::date;
  v_fim := (v_inicio + interval '1 month' - interval '1 day')::date;

  WITH effective_values AS (
    -- Rateio lines take priority over lancamento header
    SELECT r.categoria_id, r.valor
    FROM fin_lancamento_rateios r
    JOIN fin_lancamentos l ON l.id = r.lancamento_id AND l.company_id = v_company_id
    WHERE l.status = 'REALIZADO'
      AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND r.company_id = v_company_id
    UNION ALL
    -- Lancamentos without rateio
    SELECT l.categoria_id, l.valor
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.status = 'REALIZADO'
      AND l.tipo != 'TRANSFERENCIA'
      AND l.data_competencia BETWEEN v_inicio AND v_fim
      AND NOT EXISTS (
        SELECT 1 FROM fin_lancamento_rateios r
        WHERE r.lancamento_id = l.id AND r.company_id = v_company_id
      )
  ),
  por_categoria AS (
    SELECT
      COALESCE(ev.categoria_id, '00000000-0000-0000-0000-000000000000') as cat_id,
      SUM(ev.valor) as total
    FROM effective_values ev
    GROUP BY ev.categoria_id
  ),
  cat_details AS (
    SELECT
      pc.cat_id,
      pc.total,
      c.tipo as cat_tipo,
      c.linha_dre,
      c.grupo
    FROM por_categoria pc
    LEFT JOIN fin_categorias c ON c.id = pc.cat_id AND c.company_id = v_company_id
  )
  SELECT jsonb_build_object(
    'mes', p_mes,
    'receita_total', COALESCE((SELECT SUM(total) FROM cat_details WHERE cat_tipo = 'receita'), 0),
    'despesa_total', COALESCE((SELECT SUM(total) FROM cat_details WHERE cat_tipo = 'despesa'), 0),
    'por_categoria', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'categoria_id', cat_id, 'total', total, 'tipo', cat_tipo, 'linha_dre', linha_dre, 'grupo', grupo
    )) FROM cat_details), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_dre_summary(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_dre_summary(text) TO authenticated;

-- =====================================================
-- H4: Cashflow server-side RPC
-- =====================================================
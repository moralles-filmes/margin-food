CREATE OR REPLACE FUNCTION public.get_fin_cashflow(p_inicio date, p_fim date)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_result jsonb;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:relatorios:view', 'financeiro:fluxo:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  WITH realizado AS (
    SELECT
      data_competencia as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as saidas
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status = 'REALIZADO'
      AND tipo != 'TRANSFERENCIA'
      AND data_competencia BETWEEN p_inicio AND p_fim
    GROUP BY data_competencia
  ),
  previsto_lanc AS (
    SELECT
      data_competencia as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as prev_entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as prev_saidas
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status = 'PREVISTO'
      AND tipo != 'TRANSFERENCIA'
      AND data_competencia BETWEEN p_inicio AND p_fim
    GROUP BY data_competencia
  ),
  pagar AS (
    SELECT data_vencimento as data, SUM(valor) as prev_saidas
    FROM fin_contas_pagar
    WHERE company_id = v_company_id
      AND status IN ('APROVADO', 'AGUARDANDO_APROVACAO')
      AND data_vencimento BETWEEN p_inicio AND p_fim
    GROUP BY data_vencimento
  ),
  receber AS (
    SELECT data_vencimento as data, SUM(valor) as prev_entradas
    FROM fin_contas_receber
    WHERE company_id = v_company_id
      AND status = 'A_RECEBER'
      AND data_vencimento BETWEEN p_inicio AND p_fim
    GROUP BY data_vencimento
  ),
  all_dates AS (
    SELECT data FROM realizado
    UNION SELECT data FROM previsto_lanc
    UNION SELECT data FROM pagar
    UNION SELECT data FROM receber
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'dias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'data', d.data,
        'entradas', COALESCE(r.entradas, 0),
        'saidas', COALESCE(r.saidas, 0),
        'prev_entradas', COALESCE(pl.prev_entradas, 0) + COALESCE(rc.prev_entradas, 0),
        'prev_saidas', COALESCE(pl.prev_saidas, 0) + COALESCE(pg.prev_saidas, 0)
      ) ORDER BY d.data)
      FROM all_dates d
      LEFT JOIN realizado r ON r.data = d.data
      LEFT JOIN previsto_lanc pl ON pl.data = d.data
      LEFT JOIN pagar pg ON pg.data = d.data
      LEFT JOIN receber rc ON rc.data = d.data
    ), '[]'::jsonb),
    'totais', jsonb_build_object(
      'entradas', COALESCE((SELECT SUM(entradas) FROM realizado), 0),
      'saidas', COALESCE((SELECT SUM(saidas) FROM realizado), 0),
      'prev_entradas', COALESCE((SELECT SUM(prev_entradas) FROM previsto_lanc), 0) + COALESCE((SELECT SUM(prev_entradas) FROM receber), 0),
      'prev_saidas', COALESCE((SELECT SUM(prev_saidas) FROM previsto_lanc), 0) + COALESCE((SELECT SUM(prev_saidas) FROM pagar), 0)
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_cashflow(date, date) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_cashflow(date, date) TO authenticated;
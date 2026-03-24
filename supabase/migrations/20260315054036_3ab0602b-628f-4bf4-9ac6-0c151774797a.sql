
CREATE OR REPLACE FUNCTION public.get_fin_fluxo_projecao(
  p_dias integer DEFAULT 30,
  p_saldo_manual numeric DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_company_id uuid;
  v_hoje date;
  v_fim date;
  v_saldo_base numeric;
  v_result jsonb;
BEGIN
  -- Tenant isolation
  v_company_id := assert_tenant();

  -- RBAC
  IF NOT has_any_permission(
    auth.uid(),
    ARRAY['financeiro:projecao:view','system:global:manage']
  ) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_fim  := v_hoje + p_dias;

  -- 1. Saldo base: realizado + conciliado, excluindo transferências
  SELECT COALESCE(SUM(
    CASE
      WHEN tipo = 'RECEITA' THEN valor
      WHEN tipo = 'DESPESA' THEN -valor
      ELSE 0
    END
  ), 0)
  INTO v_saldo_base
  FROM fin_lancamentos
  WHERE company_id = v_company_id
    AND tipo != 'TRANSFERENCIA'
    AND status IN ('REALIZADO', 'CONCILIADO');

  -- Override with manual if provided
  IF p_saldo_manual IS NOT NULL THEN
    v_saldo_base := p_saldo_manual;
  END IF;

  -- 2. Build timeline using CTE
  WITH movimentacoes AS (
    -- Lançamentos previstos
    SELECT data_competencia AS data,
           CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END AS entrada,
           CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END AS saida
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND tipo != 'TRANSFERENCIA'
      AND status = 'PREVISTO'
      AND data_competencia BETWEEN v_hoje AND v_fim

    UNION ALL

    -- Contas a pagar
    SELECT data_vencimento AS data,
           0 AS entrada,
           valor AS saida
    FROM fin_contas_pagar
    WHERE company_id = v_company_id
      AND status IN ('APROVADO', 'AGUARDANDO_APROVACAO')
      AND data_vencimento BETWEEN v_hoje AND v_fim

    UNION ALL

    -- Contas a receber
    SELECT data_vencimento AS data,
           valor AS entrada,
           0 AS saida
    FROM fin_contas_receber
    WHERE company_id = v_company_id
      AND status = 'A_RECEBER'
      AND data_vencimento BETWEEN v_hoje AND v_fim
  ),
  dias_serie AS (
    SELECT d::date AS data
    FROM generate_series(v_hoje, v_fim, '1 day'::interval) d
  ),
  daily_agg AS (
    SELECT ds.data,
           COALESCE(SUM(m.entrada), 0) AS entradas,
           COALESCE(SUM(m.saida), 0) AS saidas
    FROM dias_serie ds
    LEFT JOIN movimentacoes m ON m.data = ds.data
    GROUP BY ds.data
    ORDER BY ds.data
  ),
  timeline AS (
    SELECT data,
           entradas,
           saidas,
           v_saldo_base + SUM(entradas - saidas) OVER (ORDER BY data) AS saldo
    FROM daily_agg
  )
  SELECT jsonb_build_object(
    'saldo_inicial', v_saldo_base,
    'entradas', (SELECT COALESCE(SUM(entradas), 0) FROM timeline),
    'saidas', (SELECT COALESCE(SUM(saidas), 0) FROM timeline),
    'saldo_final', (SELECT saldo FROM timeline ORDER BY data DESC LIMIT 1),
    'dias_negativo', (SELECT COUNT(*) FROM timeline WHERE saldo < 0),
    'saldo_minimo', (SELECT COALESCE(MIN(saldo), 0) FROM timeline),
    'timeline', COALESCE((
      SELECT jsonb_agg(
        jsonb_build_object(
          'data', to_char(data, 'YYYY-MM-DD'),
          'saldo', saldo,
          'entradas', entradas,
          'saidas', saidas
        ) ORDER BY data
      )
      FROM timeline
    ), '[]'::jsonb)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_fluxo_projecao(integer, numeric) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_fluxo_projecao(integer, numeric) TO authenticated;

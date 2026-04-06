-- Adiciona saldo_acumulado no retorno do fluxo de caixa
-- Saldo acumulado = saldo_inicial das contas bancárias ativas + lançamentos realizados até p_fim

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
  v_today date := CURRENT_DATE;
  v_saldo_acumulado numeric;
BEGIN
  v_company_id := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY['financeiro:relatorios:view', 'financeiro:fluxo:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  -- Saldo acumulado = saldo_inicial contas ativas + movimentos realizados até p_fim
  v_saldo_acumulado := (
    SELECT COALESCE(SUM(saldo_inicial), 0) FROM fin_contas
    WHERE company_id = v_company_id AND ativo = true
  ) + COALESCE((
    SELECT SUM(CASE WHEN tipo = 'RECEITA' THEN valor WHEN tipo = 'DESPESA' THEN -valor ELSE 0 END)
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND data_competencia <= p_fim
  ), 0);

  WITH realizado AS (
    SELECT
      data_competencia as data,
      SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END) as entradas,
      SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END) as saidas
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND data_competencia BETWEEN p_inicio AND p_fim
    GROUP BY data_competencia
  ),
  realizado_detalhes AS (
    SELECT
      data_competencia as data,
      id,
      descricao,
      valor,
      tipo,
      COALESCE(origem, 'manual') as origem
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND tipo != 'TRANSFERENCIA'
      AND data_competencia BETWEEN p_inicio AND p_fim
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
  previsto_lanc_detalhes AS (
    SELECT
      data_competencia as data,
      id,
      descricao,
      valor,
      tipo,
      COALESCE(origem, 'manual') as origem
    FROM fin_lancamentos
    WHERE company_id = v_company_id
      AND status = 'PREVISTO'
      AND tipo != 'TRANSFERENCIA'
      AND data_competencia BETWEEN p_inicio AND p_fim
  ),
  pagar AS (
    SELECT data_vencimento as data, SUM(valor) as prev_saidas
    FROM fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
    GROUP BY data_vencimento
  ),
  pagar_detalhes AS (
    SELECT data_vencimento as data, id, descricao, valor,
      CASE WHEN data_vencimento < v_today THEN true ELSE false END as is_vencida
    FROM fin_contas_pagar
    WHERE company_id = v_company_id
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
  ),
  receber AS (
    SELECT data_vencimento as data, SUM(valor) as prev_entradas
    FROM fin_contas_receber
    WHERE company_id = v_company_id
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
    GROUP BY data_vencimento
  ),
  receber_detalhes AS (
    SELECT data_vencimento as data, id, descricao, valor,
      CASE WHEN data_vencimento < v_today THEN true ELSE false END as is_vencida
    FROM fin_contas_receber
    WHERE company_id = v_company_id
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND (
        data_vencimento BETWEEN p_inicio AND p_fim
        OR data_vencimento < v_today
      )
  ),
  all_dates AS (
    SELECT data FROM realizado
    UNION SELECT data FROM previsto_lanc
    UNION SELECT data FROM pagar
    UNION SELECT data FROM receber
  ),
  detail_rows AS (
    SELECT data, jsonb_agg(det ORDER BY det->>'descricao') as detalhes
    FROM (
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'lancamento',
        'tipo', 'realizado', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', CASE WHEN tipo = 'RECEITA' THEN 'entrada' ELSE 'saida' END,
        'origem', origem
      ) as det FROM realizado_detalhes
      UNION ALL
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'lancamento',
        'tipo', 'previsto', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', CASE WHEN tipo = 'RECEITA' THEN 'entrada' ELSE 'saida' END,
        'origem', origem
      ) FROM previsto_lanc_detalhes
      UNION ALL
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'conta_pagar',
        'tipo', 'previsto', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', 'saida',
        'origem', CASE WHEN is_vencida THEN 'conta_pagar_vencida' ELSE 'conta_pagar' END
      ) FROM pagar_detalhes
      UNION ALL
      SELECT data, jsonb_build_object(
        'id', id, 'entidade_tipo', 'conta_receber',
        'tipo', 'previsto', 'descricao', COALESCE(descricao,''), 'valor', valor,
        'natureza', 'entrada',
        'origem', CASE WHEN is_vencida THEN 'conta_receber_vencida' ELSE 'conta_receber' END
      ) FROM receber_detalhes
    ) sub
    GROUP BY data
  )
  SELECT jsonb_build_object(
    'periodo', jsonb_build_object('inicio', p_inicio, 'fim', p_fim),
    'dias', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'data', d.data,
        'entradas', COALESCE(r.entradas, 0),
        'saidas', COALESCE(r.saidas, 0),
        'prev_entradas', COALESCE(pl.prev_entradas, 0) + COALESCE(rc.prev_entradas, 0),
        'prev_saidas', COALESCE(pl.prev_saidas, 0) + COALESCE(pg.prev_saidas, 0),
        'detalhes', COALESCE(dr.detalhes, '[]'::jsonb)
      ) ORDER BY d.data)
      FROM all_dates d
      LEFT JOIN realizado r ON r.data = d.data
      LEFT JOIN previsto_lanc pl ON pl.data = d.data
      LEFT JOIN pagar pg ON pg.data = d.data
      LEFT JOIN receber rc ON rc.data = d.data
      LEFT JOIN detail_rows dr ON dr.data = d.data
    ), '[]'::jsonb),
    'totais', jsonb_build_object(
      'entradas', COALESCE((SELECT SUM(entradas) FROM realizado), 0),
      'saidas', COALESCE((SELECT SUM(saidas) FROM realizado), 0),
      'prev_entradas', COALESCE((SELECT SUM(prev_entradas) FROM previsto_lanc), 0) + COALESCE((SELECT SUM(prev_entradas) FROM receber), 0),
      'prev_saidas', COALESCE((SELECT SUM(prev_saidas) FROM previsto_lanc), 0) + COALESCE((SELECT SUM(prev_saidas) FROM pagar), 0),
      'saldo_acumulado', v_saldo_acumulado
    )
  ) INTO v_result;

  RETURN v_result;
END;
$$;


CREATE OR REPLACE FUNCTION public.get_fin_kpis(p_meses integer DEFAULT 6)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result json;
  _receita numeric;
  _despesa numeric;
  _total_receitas int;
  _total_vencido numeric;
  _total_pendente numeric;
  _prazo_pgto numeric;
  _prazo_receb numeric;
  _receita_por_mes json;
  _top_fornecedores json;
  v_company uuid;
  v_hoje date;
  v_start date;
  v_end date;
BEGIN
  v_company := assert_tenant();

  IF NOT has_any_permission(auth.uid(), ARRAY[
    'financeiro:kpis:view',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  v_hoje := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
  v_start := date_trunc('month', v_hoje - make_interval(months => p_meses - 1))::date;
  v_end := v_hoje;

  -- Receita e despesa (REALIZADO + CONCILIADO, excl. TRANSFERENCIA)
  SELECT
    COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN 1 ELSE 0 END), 0)
  INTO _receita, _despesa, _total_receitas
  FROM fin_lancamentos
  WHERE company_id = v_company
    AND tipo != 'TRANSFERENCIA'
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND data_competencia BETWEEN v_start AND v_end;

  -- Inadimplência: vencido / pendente (apenas A_RECEBER)
  SELECT
    COALESCE(SUM(CASE WHEN data_vencimento < v_hoje THEN valor ELSE 0 END), 0),
    COALESCE(SUM(valor), 0)
  INTO _total_vencido, _total_pendente
  FROM fin_contas_receber
  WHERE company_id = v_company
    AND status = 'A_RECEBER';

  -- Prazo médio pagamento
  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_pagamento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_pgto
  FROM fin_contas_pagar
  WHERE company_id = v_company
    AND status = 'PAGO'
    AND data_pagamento IS NOT NULL
    AND data_vencimento >= v_start;

  -- Prazo médio recebimento
  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_recebimento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_receb
  FROM fin_contas_receber
  WHERE company_id = v_company
    AND status = 'RECEBIDO'
    AND data_recebimento IS NOT NULL
    AND data_vencimento >= v_start;

  -- Receita vs Despesa mensal (REALIZADO + CONCILIADO)
  SELECT json_agg(row_to_json(t) ORDER BY t.mes) INTO _receita_por_mes
  FROM (
    SELECT
      to_char(data_competencia, 'YYYY-MM') AS mes,
      COALESCE(SUM(CASE WHEN tipo = 'RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo = 'DESPESA' THEN valor ELSE 0 END), 0) AS despesa
    FROM fin_lancamentos
    WHERE company_id = v_company
      AND tipo != 'TRANSFERENCIA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia BETWEEN v_start AND v_end
    GROUP BY to_char(data_competencia, 'YYYY-MM')
  ) t;

  -- Top fornecedores (normalizado por supplier_id ou texto)
  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT
      COALESCE(s.nome, TRIM(UPPER(cp.fornecedor)), 'N/A') AS nome,
      SUM(cp.valor) AS total
    FROM fin_contas_pagar cp
    LEFT JOIN suppliers s ON s.id = cp.supplier_id
    WHERE cp.company_id = v_company
      AND cp.status != 'CANCELADO'
      AND cp.data_vencimento >= v_start
    GROUP BY COALESCE(s.nome, TRIM(UPPER(cp.fornecedor)), 'N/A')
    ORDER BY total DESC
    LIMIT 8
  ) t;

  _result := json_build_object(
    'receita_total', _receita,
    'despesa_total', _despesa,
    'margem', CASE WHEN _receita > 0 THEN ((_receita - _despesa) / _receita) * 100 ELSE 0 END,
    'ticket_medio', CASE WHEN _total_receitas > 0 THEN _receita / _total_receitas ELSE 0 END,
    'inadimplencia', CASE WHEN _total_pendente > 0 THEN (_total_vencido / _total_pendente) * 100 ELSE 0 END,
    'total_vencido', _total_vencido,
    'prazo_medio_pagamento', _prazo_pgto,
    'prazo_medio_recebimento', _prazo_receb,
    'receita_por_mes', COALESCE(_receita_por_mes, '[]'::json),
    'top_fornecedores', COALESCE(_top_fornecedores, '[]'::json)
  );

  RETURN _result;
END;
$$;

REVOKE ALL ON FUNCTION public.get_fin_kpis(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_fin_kpis(integer) TO authenticated;

-- Drop old signature if exists
DROP FUNCTION IF EXISTS public.get_fin_kpis(text, text);

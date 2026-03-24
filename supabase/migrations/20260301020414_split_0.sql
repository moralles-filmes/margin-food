CREATE OR REPLACE FUNCTION public.get_fin_kpis(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result json;
  _receita numeric;
  _despesa numeric;
  _total_lanc int;
  _total_vencido numeric;
  _total_receber numeric;
  _prazo_pgto numeric;
  _prazo_receb numeric;
  _receita_por_mes json;
  _top_fornecedores json;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN tipo='DESPESA' THEN valor ELSE 0 END), 0),
    COUNT(*)
  INTO _receita, _despesa, _total_lanc
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND status='REALIZADO' AND tipo != 'TRANSFERENCIA'
    AND data_competencia >= p_start AND data_competencia <= p_end;

  SELECT
    COALESCE(SUM(CASE WHEN status='A_RECEBER' AND data_vencimento < CURRENT_DATE THEN valor ELSE 0 END), 0),
    COALESCE(SUM(valor), 0)
  INTO _total_vencido, _total_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status != 'CANCELADO' AND data_vencimento >= p_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_pagamento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_pgto
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status='PAGO' AND data_pagamento IS NOT NULL
    AND data_vencimento >= p_start;

  SELECT COALESCE(AVG(EXTRACT(DAY FROM (data_recebimento::timestamp - data_vencimento::timestamp))), 0)
  INTO _prazo_receb
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status='RECEBIDO' AND data_recebimento IS NOT NULL
    AND data_vencimento >= p_start;

  SELECT json_agg(row_to_json(t)) INTO _receita_por_mes
  FROM (
    SELECT
      to_char(data_competencia, 'YYYY-MM') AS mes,
      COALESCE(SUM(CASE WHEN tipo='RECEITA' THEN valor ELSE 0 END), 0) AS receita,
      COALESCE(SUM(CASE WHEN tipo='DESPESA' THEN valor ELSE 0 END), 0) AS despesa
    FROM public.fin_lancamentos
    WHERE company_id = v_company
      AND status='REALIZADO' AND tipo != 'TRANSFERENCIA'
      AND data_competencia >= p_start AND data_competencia <= p_end
    GROUP BY to_char(data_competencia, 'YYYY-MM')
    ORDER BY mes
  ) t;

  SELECT json_agg(row_to_json(t)) INTO _top_fornecedores
  FROM (
    SELECT COALESCE(fornecedor, 'N/A') AS nome, SUM(valor) AS total
    FROM public.fin_contas_pagar
    WHERE company_id = v_company
      AND status != 'CANCELADO' AND data_vencimento >= p_start
    GROUP BY COALESCE(fornecedor, 'N/A')
    ORDER BY total DESC
    LIMIT 8
  ) t;

  _result := json_build_object(
    'receita_total', _receita,
    'despesa_total', _despesa,
    'margem', CASE WHEN _receita > 0 THEN ((_receita - _despesa) / _receita) * 100 ELSE 0 END,
    'ticket_medio', CASE WHEN _total_lanc > 0 THEN _receita / _total_lanc ELSE 0 END,
    'total_lancamentos', _total_lanc,
    'inadimplencia', CASE WHEN _total_receber > 0 THEN (_total_vencido / _total_receber) * 100 ELSE 0 END,
    'total_vencido', _total_vencido,
    'prazo_medio_pagamento', _prazo_pgto,
    'prazo_medio_recebimento', _prazo_receb,
    'receita_por_mes', COALESCE(_receita_por_mes, '[]'::json),
    'top_fornecedores', COALESCE(_top_fornecedores, '[]'::json)
  );

  RETURN _result;
END;
$$;
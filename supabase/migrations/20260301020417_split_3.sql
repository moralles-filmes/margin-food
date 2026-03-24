CREATE OR REPLACE FUNCTION public.get_fin_counts_by_status(p_start date DEFAULT NULL::date, p_end date DEFAULT NULL::date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _result json;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT json_build_object(
    'contas_pagar', (
      SELECT json_object_agg(status, cnt) FROM (
        SELECT status, COUNT(*) AS cnt
        FROM public.fin_contas_pagar
        WHERE company_id = v_company
          AND (p_start IS NULL OR data_vencimento >= p_start)
          AND (p_end IS NULL OR data_vencimento <= p_end)
        GROUP BY status
      ) s
    ),
    'contas_receber', (
      SELECT json_object_agg(status, cnt) FROM (
        SELECT status, COUNT(*) AS cnt
        FROM public.fin_contas_receber
        WHERE company_id = v_company
          AND (p_start IS NULL OR data_vencimento >= p_start)
          AND (p_end IS NULL OR data_vencimento <= p_end)
        GROUP BY status
      ) s
    ),
    'total_pagar_pendente', (
      SELECT COALESCE(SUM(valor), 0)
      FROM public.fin_contas_pagar
      WHERE company_id = v_company
        AND status NOT IN ('PAGO', 'CANCELADO')
        AND (p_start IS NULL OR data_vencimento >= p_start)
        AND (p_end IS NULL OR data_vencimento <= p_end)
    ),
    'total_receber_pendente', (
      SELECT COALESCE(SUM(valor), 0)
      FROM public.fin_contas_receber
      WHERE company_id = v_company
        AND status NOT IN ('RECEBIDO', 'CANCELADO')
        AND (p_start IS NULL OR data_vencimento >= p_start)
        AND (p_end IS NULL OR data_vencimento <= p_end)
    ),
    'vencidas_pagar', (
      SELECT COUNT(*)
      FROM public.fin_contas_pagar
      WHERE company_id = v_company
        AND status NOT IN ('PAGO', 'CANCELADO')
        AND data_vencimento < CURRENT_DATE
        AND (p_start IS NULL OR data_vencimento >= p_start)
    ),
    'vencidas_receber', (
      SELECT COUNT(*)
      FROM public.fin_contas_receber
      WHERE company_id = v_company
        AND status NOT IN ('RECEBIDO', 'CANCELADO')
        AND data_vencimento < CURRENT_DATE
        AND (p_start IS NULL OR data_vencimento >= p_start)
    )
  ) INTO _result;

  RETURN _result;
END;
$$;
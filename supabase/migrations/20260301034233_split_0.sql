CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  _result json;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT (public.has_permission(auth.uid(), 'finance:read') OR public.has_permission(auth.uid(), 'financeiro:dashboard:view')) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:dashboard:view)';
  END IF;

  SELECT json_build_object(
    'receita', COALESCE(SUM(CASE WHEN tipo='RECEITA' AND status='REALIZADO' THEN valor ELSE 0 END), 0),
    'despesa', COALESCE(SUM(CASE WHEN tipo='DESPESA' AND status='REALIZADO' THEN valor ELSE 0 END), 0),
    'a_receber', COALESCE(SUM(CASE WHEN tipo='RECEITA' AND status='PREVISTO' THEN valor ELSE 0 END), 0),
    'a_pagar', COALESCE(SUM(CASE WHEN tipo='DESPESA' AND status='PREVISTO' THEN valor ELSE 0 END), 0),
    'saldo_caixa', (
      SELECT COALESCE(SUM(
        CASE WHEN tipo='RECEITA' THEN valor WHEN tipo='DESPESA' THEN -valor ELSE 0 END
      ), 0)
      FROM public.fin_lancamentos
      WHERE company_id = v_company
        AND status='REALIZADO' AND tipo != 'TRANSFERENCIA' AND data_competencia < p_end
    )
  ) INTO _result
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND status != 'CANCELADO'
    AND data_competencia >= p_start
    AND data_competencia < p_end;

  RETURN _result;
END;
$function$;

-- list_fin_lancamentos_cursor: accept finance:read OR financeiro:lancamentos:view
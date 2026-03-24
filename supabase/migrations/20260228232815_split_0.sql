CREATE OR REPLACE FUNCTION get_fin_dashboard_summary(
  p_start DATE,
  p_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  _result JSON;
BEGIN
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  SELECT json_build_object(
    'receita', COALESCE(SUM(CASE WHEN tipo='RECEITA' AND status='REALIZADO' THEN valor ELSE 0 END), 0),
    'despesa', COALESCE(SUM(CASE WHEN tipo='DESPESA' AND status='REALIZADO' THEN valor ELSE 0 END), 0),
    'a_receber', COALESCE(SUM(CASE WHEN tipo='RECEITA' AND status='PREVISTO' THEN valor ELSE 0 END), 0),
    'a_pagar', COALESCE(SUM(CASE WHEN tipo='DESPESA' AND status='PREVISTO' THEN valor ELSE 0 END), 0),
    'saldo_caixa', (
      SELECT COALESCE(SUM(
        CASE WHEN tipo='RECEITA' THEN valor
             WHEN tipo='DESPESA' THEN -valor
             ELSE 0 END
      ), 0)
      FROM public.fin_lancamentos
      WHERE status='REALIZADO' AND tipo != 'TRANSFERENCIA' AND data_competencia < p_end
    )
  ) INTO _result
  FROM public.fin_lancamentos
  WHERE status != 'CANCELADO'
    AND data_competencia >= p_start
    AND data_competencia < p_end;

  RETURN _result;
END;
$$;

-- ═══════════════════════════════════════════════════════════
-- 2) RPC: get_fin_kpis
--    Server-side KPIs replacing KPIsSection client aggregation
-- ═══════════════════════════════════════════════════════════
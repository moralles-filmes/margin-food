
-- Update get_fin_dashboard_summary to include resultado and CONCILIADO status
CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _result json;
  v_company uuid;
  v_receita numeric;
  v_despesa numeric;
  v_a_receber numeric;
  v_a_pagar numeric;
  v_saldo_caixa numeric;
  v_saldo_inicial_contas numeric;
  v_receita_prev numeric;
  v_despesa_prev numeric;
  v_interval interval;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:dashboard:view)';
  END IF;

  -- Receitas realizadas do período (excluindo transferências, incluindo CONCILIADO)
  SELECT COALESCE(SUM(valor), 0) INTO v_receita
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo = 'RECEITA'
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo != 'TRANSFERENCIA'
    AND data_competencia >= p_start
    AND data_competencia < p_end;

  -- Despesas realizadas do período (excluindo transferências, incluindo CONCILIADO)
  SELECT COALESCE(SUM(valor), 0) INTO v_despesa
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo = 'DESPESA'
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo != 'TRANSFERENCIA'
    AND data_competencia >= p_start
    AND data_competencia < p_end;

  -- Contas a Receber pendentes no período
  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status NOT IN ('RECEBIDO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Contas a Pagar pendentes no período
  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status NOT IN ('PAGO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Saldo em Caixa
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial_contas
  FROM public.fin_contas
  WHERE company_id = v_company AND ativo = true;

  SELECT v_saldo_inicial_contas + COALESCE(SUM(
    CASE WHEN tipo = 'RECEITA' THEN valor
         WHEN tipo = 'DESPESA' THEN -valor
         ELSE 0 END
  ), 0) INTO v_saldo_caixa
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo != 'TRANSFERENCIA'
    AND data_competencia < p_end;

  -- Previous period comparison (same duration before p_start)
  v_interval := (p_end - p_start) * interval '1 day';

  SELECT COALESCE(SUM(valor), 0) INTO v_receita_prev
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo = 'RECEITA'
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo != 'TRANSFERENCIA'
    AND data_competencia >= (p_start - (p_end - p_start))
    AND data_competencia < p_start;

  SELECT COALESCE(SUM(valor), 0) INTO v_despesa_prev
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo = 'DESPESA'
    AND status IN ('REALIZADO', 'CONCILIADO')
    AND tipo != 'TRANSFERENCIA'
    AND data_competencia >= (p_start - (p_end - p_start))
    AND data_competencia < p_start;

  _result := json_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'resultado', v_receita - v_despesa,
    'a_receber', v_a_receber,
    'a_pagar', v_a_pagar,
    'saldo_caixa', v_saldo_caixa,
    'receita_prev', v_receita_prev,
    'despesa_prev', v_despesa_prev,
    'resultado_prev', v_receita_prev - v_despesa_prev
  );

  RETURN _result;
END;
$$;

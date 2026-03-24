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
BEGIN
  v_company := public.assert_tenant();
  IF NOT (public.has_permission(auth.uid(), 'finance:read') OR public.has_permission(auth.uid(), 'financeiro:dashboard:view')) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:dashboard:view)';
  END IF;

  -- Receitas realizadas do período (excluindo transferências)
  SELECT COALESCE(SUM(valor), 0) INTO v_receita
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo = 'RECEITA'
    AND status = 'REALIZADO'
    AND (origem IS NULL OR origem != 'transferencia')
    AND data_competencia >= p_start
    AND data_competencia < p_end;

  -- Despesas realizadas do período (excluindo transferências)
  SELECT COALESCE(SUM(valor), 0) INTO v_despesa
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND tipo = 'DESPESA'
    AND status = 'REALIZADO'
    AND (origem IS NULL OR origem != 'transferencia')
    AND data_competencia >= p_start
    AND data_competencia < p_end;

  -- Contas a Receber pendentes no período (da tabela fin_contas_receber)
  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status NOT IN ('RECEBIDO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Contas a Pagar pendentes no período (da tabela fin_contas_pagar)
  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status NOT IN ('PAGO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Saldo em Caixa: saldo inicial das contas + movimentações realizadas até p_end
  SELECT COALESCE(SUM(saldo_inicial), 0) INTO v_saldo_inicial_contas
  FROM public.fin_contas
  WHERE company_id = v_company
    AND ativo = true;

  SELECT v_saldo_inicial_contas + COALESCE(SUM(
    CASE WHEN tipo = 'RECEITA' THEN valor
         WHEN tipo = 'DESPESA' THEN -valor
         ELSE 0 END
  ), 0) INTO v_saldo_caixa
  FROM public.fin_lancamentos
  WHERE company_id = v_company
    AND status = 'REALIZADO'
    AND tipo != 'TRANSFERENCIA'
    AND data_competencia < p_end;

  _result := json_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'a_receber', v_a_receber,
    'a_pagar', v_a_pagar,
    'saldo_caixa', v_saldo_caixa
  );

  RETURN _result;
END;
$$;
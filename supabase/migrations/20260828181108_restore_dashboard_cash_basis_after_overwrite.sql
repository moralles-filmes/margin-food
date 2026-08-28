-- Restaura invariantes do Dashboard sobrescritas pela reaplicação tardia de
-- 20260820120000_dashboard_contas_vencidas em produção.
--
-- Mantém o card de contas vencidas, mas volta a usar a data efetiva do regime
-- de caixa e a excluir lançamentos não operacionais dos cards de resultado.

CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  _result json;
  v_company uuid;
  v_today date;
  v_receita numeric;
  v_despesa numeric;
  v_a_receber numeric;
  v_a_pagar numeric;
  v_a_pagar_vencido numeric;
  v_a_pagar_vencido_qtd integer;
  v_saldo_caixa numeric;
  v_saldo_inicial_contas numeric;
  v_receita_prev numeric;
  v_despesa_prev numeric;
  v_prev_start date;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissao (financeiro:dashboard:view)';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_receita := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= p_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end
  );

  v_despesa := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= p_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end
  );

  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status NOT IN ('RECEBIDO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status NOT IN ('PAGO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  SELECT COALESCE(SUM(valor), 0), COUNT(*)::int INTO v_a_pagar_vencido, v_a_pagar_vencido_qtd
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status IN ('APROVADO', 'AGUARDANDO_APROVACAO')
    AND data_vencimento < v_today;

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
    AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end;

  v_prev_start := p_start - (p_end - p_start);

  v_receita_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= v_prev_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_start
  );

  v_despesa_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND excluir_dos_relatorios IS NOT TRUE
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) >= v_prev_start
      AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_start
  );

  _result := json_build_object(
    'receita', v_receita,
    'despesa', v_despesa,
    'resultado', v_receita - v_despesa,
    'a_receber', v_a_receber,
    'a_pagar', v_a_pagar,
    'a_pagar_vencido', v_a_pagar_vencido,
    'a_pagar_vencido_qtd', v_a_pagar_vencido_qtd,
    'saldo_caixa', v_saldo_caixa,
    'receita_prev', v_receita_prev,
    'despesa_prev', v_despesa_prev,
    'resultado_prev', v_receita_prev - v_despesa_prev
  );

  RETURN _result;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_dashboard_summary(date, date)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_dashboard_summary(date, date)
  TO authenticated, service_role;

-- PL/pgSQL resolve referências internas apenas na primeira execução.
DO $migration_check$
DECLARE
  v_function_config text[];
BEGIN
  SELECT function_config.proconfig
  INTO v_function_config
  FROM pg_catalog.pg_proc function_config
  JOIN pg_catalog.pg_namespace function_schema
    ON function_schema.oid = function_config.pronamespace
  WHERE function_schema.nspname = 'public'
    AND function_config.proname = 'get_fin_dashboard_summary'
    AND function_config.proargtypes = '1082 1082'::pg_catalog.oidvector;

  IF v_function_config IS NULL
     OR NOT ('search_path=""' = ANY(v_function_config)) THEN
    RAISE EXCEPTION 'MIGRATION_CHECK_FAILED: get_fin_dashboard_summary search_path';
  END IF;

  PERFORM
    ledger.company_id,
    ledger.tipo,
    ledger.valor,
    ledger.excluir_dos_relatorios,
    ledger.status,
    ledger.origem,
    ledger.conciliado,
    ledger.data_pagamento,
    ledger.conciliado_em,
    ledger.data_competencia,
    payable.company_id,
    payable.valor,
    payable.status,
    payable.data_vencimento,
    receivable.company_id,
    receivable.valor,
    receivable.status,
    receivable.data_vencimento,
    account.company_id,
    account.saldo_inicial,
    account.ativo
  FROM public.fin_lancamentos ledger
  LEFT JOIN public.fin_contas_pagar payable ON false
  LEFT JOIN public.fin_contas_receber receivable ON false
  LEFT JOIN public.fin_contas account ON false
  WHERE false;
END;
$migration_check$;

COMMENT ON FUNCTION public.get_fin_dashboard_summary(date, date) IS
  'Dashboard financeiro em regime de caixa pela data efetiva; exclui não operacionais dos resultados, preserva contas vencidas e usa search_path imutável.';

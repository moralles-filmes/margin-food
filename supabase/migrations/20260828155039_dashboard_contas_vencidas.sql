-- Reconstruída a partir do histórico aplicado em produção
-- (supabase_migrations.schema_migrations, version 20260828155039).
-- O arquivo original não chegou a ser versionado; o SQL abaixo é exatamente o
-- que foi executado no banco. Migrations posteriores do mesmo dia
-- (20260828171602 e 20260828181108) redefinem esta função para regime de caixa,
-- então a ordem cronológica preserva o estado final vigente.

CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
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
    RAISE EXCEPTION 'Sem permissão (financeiro:dashboard:view)';
  END IF;

  v_today := (now() AT TIME ZONE 'America/Sao_Paulo')::date;

  v_receita := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= p_start AND data_competencia < p_end
  );

  v_despesa := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= p_start AND data_competencia < p_end
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
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= v_prev_start AND data_competencia < p_start
  );

  v_despesa_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND NOT (origem = 'conciliacao' AND conciliado IS NOT TRUE)
      AND data_competencia >= v_prev_start AND data_competencia < p_start
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

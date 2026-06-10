-- ============================================================================
-- Etapa 2 / A — get_fin_dashboard_summary alinhado às regras do DRE/DFC
-- ----------------------------------------------------------------------------
-- Antes: Receita/Despesa/Resultado somavam só fin_lancamentos REALIZADO/CONCILIADO
-- por competência (ignoravam CP/CR em aberto); Saldo em Caixa somava por
-- data_competencia (deveria ser caixa).
--
-- Agora (mesmo critério do get_fin_dre_summary / get_fin_dfc_summary):
--   • Receita/Despesa/Resultado (e comparativo do período anterior) =
--       lançamentos REALIZADO/CONCILIADO + CP/CR EM ABERTO, por competência
--       (CP/CR: COALESCE(data_competencia, data_vencimento)).
--   • Saldo em Caixa = saldo_inicial + movimentos realizados por CAIXA
--       (COALESCE(data_pagamento, conciliado_em::date, data_competencia) < p_end).
--   • A Receber / A Pagar = pendentes por data_vencimento (inalterado).
-- Sem dupla contagem: CP/CR paga vira espelho REALIZADO e sai do conjunto aberto.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.get_fin_dashboard_summary(p_start date, p_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
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
  v_prev_start date;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_any_permission(auth.uid(), ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']) THEN
    RAISE EXCEPTION 'Sem permissão (financeiro:dashboard:view)';
  END IF;

  -- Receita (competência): lançamentos REALIZADO/CONCILIADO + CR em aberto
  v_receita := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= p_start AND data_competencia < p_end
  ) + (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_contas_receber
    WHERE company_id = v_company
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(data_competencia, data_vencimento) >= p_start
      AND COALESCE(data_competencia, data_vencimento) < p_end
  );

  -- Despesa (competência): lançamentos REALIZADO/CONCILIADO + CP em aberto
  v_despesa := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= p_start AND data_competencia < p_end
  ) + (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_contas_pagar
    WHERE company_id = v_company
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(data_competencia, data_vencimento) >= p_start
      AND COALESCE(data_competencia, data_vencimento) < p_end
  );

  -- Contas a Receber pendentes no período (por vencimento)
  SELECT COALESCE(SUM(valor), 0) INTO v_a_receber
  FROM public.fin_contas_receber
  WHERE company_id = v_company
    AND status NOT IN ('RECEBIDO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Contas a Pagar pendentes no período (por vencimento)
  SELECT COALESCE(SUM(valor), 0) INTO v_a_pagar
  FROM public.fin_contas_pagar
  WHERE company_id = v_company
    AND status NOT IN ('PAGO', 'CANCELADO')
    AND data_vencimento >= p_start
    AND data_vencimento < p_end;

  -- Saldo em Caixa = saldo_inicial + movimentos realizados POR CAIXA até p_end
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

  -- Período anterior (mesma duração) — também por competência + CP/CR aberto
  v_prev_start := p_start - (p_end - p_start);

  v_receita_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'RECEITA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= v_prev_start AND data_competencia < p_start
  ) + (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_contas_receber
    WHERE company_id = v_company
      AND status NOT IN ('RECEBIDO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(data_competencia, data_vencimento) >= v_prev_start
      AND COALESCE(data_competencia, data_vencimento) < p_start
  );

  v_despesa_prev := (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_lancamentos
    WHERE company_id = v_company AND tipo = 'DESPESA'
      AND status IN ('REALIZADO', 'CONCILIADO')
      AND data_competencia >= v_prev_start AND data_competencia < p_start
  ) + (
    SELECT COALESCE(SUM(valor), 0) FROM public.fin_contas_pagar
    WHERE company_id = v_company
      AND status NOT IN ('PAGO', 'CANCELADO', 'RASCUNHO')
      AND COALESCE(data_competencia, data_vencimento) >= v_prev_start
      AND COALESCE(data_competencia, data_vencimento) < p_start
  );

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
$function$;

-- Força resolução de colunas dos novos acessos a CP/CR no db push
DO $$
DECLARE v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
BEGIN
  PERFORM 1 FROM public.fin_contas_receber
   WHERE company_id = v_sentinel AND status NOT IN ('RECEBIDO','CANCELADO','RASCUNHO')
     AND COALESCE(data_competencia, data_vencimento) >= '1900-01-01';
  PERFORM 1 FROM public.fin_lancamentos
   WHERE company_id = v_sentinel
     AND COALESCE(data_pagamento, conciliado_em::date, data_competencia) < '1900-01-01';
END $$;

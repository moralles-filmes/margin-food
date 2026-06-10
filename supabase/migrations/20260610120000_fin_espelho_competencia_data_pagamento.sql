-- ============================================================================
-- M1 — Espelho de pagamento: competência correta + data de pagamento escolhida
-- ----------------------------------------------------------------------------
-- Problema (confirmado na função viva em produção):
--   pay_conta_pagar / receive_conta_receber gravavam o lançamento espelho com
--   data_competencia = CURRENT_DATE (UTC) e data_pagamento = CURRENT_DATE, sem
--   parâmetro de data. Efeitos:
--     • CURRENT_DATE é UTC → à noite no BR já virou o dia/mês seguinte (junho↔maio).
--     • Competência = dia do pagamento → o DRE (que agrupa por competência) virava
--       relatório de caixa.
--     • Impossível registrar pagamento antecipado (a data era sempre "hoje").
--   reconcile_pay/receive gravavam o espelho com data_competencia = data do
--   pagamento, em vez da competência da própria conta.
--
-- Correção:
--   • data_pagamento  = data escolhida pelo usuário, ou hoje em America/Sao_Paulo.
--   • data_competencia = COALESCE(conta.data_competencia, conta.data_vencimento, pgto)
--     → regime de competência preservado (DRE) e fluxo de caixa pela data real (DFC).
--   • pay_conta_pagar / receive_conta_receber ganham parâmetro de data (DEFAULT NULL).
--
-- INSERT-only: o trigger validate_fin_lancamento só bloqueia transferência mesma
-- conta; o guard de UPDATE de REALIZADO não se aplica a INSERT.
-- ============================================================================

-- ── pay_conta_pagar: nova assinatura com p_data_pagamento ───────────────────
DROP FUNCTION IF EXISTS public.pay_conta_pagar(uuid, text);

CREATE OR REPLACE FUNCTION public.pay_conta_pagar(
  p_id uuid,
  p_expected_updated_at text,
  p_data_pagamento date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_exists boolean;
  v_pag date;
  v_comp date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para pagar contas.';
  END IF;

  SELECT * INTO v_item FROM fin_contas_pagar WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'Status inválido para pagamento: %', v_item.status;
  END IF;

  v_company_id := v_item.company_id;

  -- Data real do pagamento: escolhida pelo usuário, ou hoje no fuso BR (nunca UTC)
  v_pag := COALESCE(p_data_pagamento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  -- Competência preservada da conta (regime de competência do DRE)
  v_comp := COALESCE(v_item.data_competencia, v_item.data_vencimento, v_pag);

  IF v_item.conta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_item.conta_id AND company_id = v_company_id) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  -- Create espelho lancamento — competência da conta, pagamento na data real
  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'DESPESA', v_item.valor, v_comp, v_pag, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_pagar', p_id::text, v_company_id, 'espelho_cp'
  )
  RETURNING id INTO v_lanc_id;

  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  UPDATE fin_contas_pagar
  SET status = 'PAGO', data_pagamento = v_pag, valor_pago = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_pagar', p_id, 'pagar', auth.uid(), v_company_id);

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_pagar', p_id, 'PAY',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO', 'data_pagamento', v_pag, 'data_competencia', v_comp));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO');
END;
$function$;

-- ── receive_conta_receber: nova assinatura com p_data_recebimento ───────────
DROP FUNCTION IF EXISTS public.receive_conta_receber(uuid, text);

CREATE OR REPLACE FUNCTION public.receive_conta_receber(
  p_id uuid,
  p_expected_updated_at text,
  p_data_recebimento date DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_exists boolean;
  v_rec date;
  v_comp date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para receber contas.';
  END IF;

  SELECT * INTO v_item FROM fin_contas_receber WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status != 'A_RECEBER' THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_item.status;
  END IF;

  v_company_id := v_item.company_id;

  v_rec := COALESCE(p_data_recebimento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  v_comp := COALESCE(v_item.data_competencia, v_item.data_vencimento, v_rec);

  IF v_item.conta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_item.conta_id AND company_id = v_company_id) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'RECEITA', v_item.valor, v_comp, v_rec, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_receber', p_id::text, v_company_id, 'espelho_cr'
  )
  RETURNING id INTO v_lanc_id;

  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  UPDATE fin_contas_receber
  SET status = 'RECEBIDO', data_recebimento = v_rec, valor_recebido = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_receber', p_id, 'receber', auth.uid(), v_company_id);

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_receber', p_id, 'RECEIVE',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO', 'data_recebimento', v_rec, 'data_competencia', v_comp));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO');
END;
$function$;

-- Re-grant EXECUTE: DROP + CREATE com assinatura nova não herda os grants explícitos
GRANT EXECUTE ON FUNCTION public.pay_conta_pagar(uuid, text, date) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.receive_conta_receber(uuid, text, date) TO authenticated, service_role;

-- ── reconcile_pay_conta_pagar: espelho com competência da conta (não do pgto) ─
CREATE OR REPLACE FUNCTION public.reconcile_pay_conta_pagar(
  p_conta_pagar_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cp record;
  v_lancamento_id uuid;
  v_next_cp_id uuid;
  v_existing_lanc_id uuid;
  v_conta_exists boolean;
BEGIN
  IF NOT public.has_permission(p_user_id, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  SELECT * INTO v_cp
  FROM public.fin_contas_pagar
  WHERE id = p_conta_pagar_id
  FOR UPDATE;

  IF v_cp IS NULL THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada: %', p_conta_pagar_id;
  END IF;

  IF p_conta_bancaria_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.fin_contas WHERE id = p_conta_bancaria_id AND company_id = v_cp.company_id
    ) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  IF v_cp.status = 'PAGO' THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Conta já está paga');
  END IF;

  IF v_cp.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'Status inválido para pagamento: %', v_cp.status;
  END IF;

  -- Já existe lancamento vinculado? Reaproveita (sem novo lançamento) — preserva competência
  IF v_cp.lancamento_id IS NOT NULL THEN
    SELECT id INTO v_existing_lanc_id FROM public.fin_lancamentos WHERE id = v_cp.lancamento_id;
    IF v_existing_lanc_id IS NOT NULL THEN
      UPDATE public.fin_contas_pagar
      SET status = 'PAGO', data_pagamento = p_data_pagamento, valor_pago = v_cp.valor, updated_at = now()
      WHERE id = p_conta_pagar_id;

      UPDATE public.fin_lancamentos
      SET conciliado = true, conciliado_em = now(), conciliado_por = p_user_id,
          conta_id = p_conta_bancaria_id,
          data_pagamento = p_data_pagamento, status = 'REALIZADO'
      WHERE id = v_existing_lanc_id;

      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, depois)
      VALUES ('contas_pagar', p_conta_pagar_id, 'reconcile_pay_existing', p_user_id,
        jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));

      RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cp.recorrente);
    END IF;
  END IF;

  SELECT id INTO v_existing_lanc_id
  FROM public.fin_lancamentos
  WHERE referencia_modulo = 'contas_pagar' AND referencia_id = p_conta_pagar_id::text AND company_id = v_cp.company_id
  LIMIT 1;

  IF v_existing_lanc_id IS NOT NULL THEN
    UPDATE public.fin_contas_pagar
    SET status = 'PAGO', data_pagamento = p_data_pagamento, valor_pago = v_cp.valor,
        lancamento_id = v_existing_lanc_id, updated_at = now()
    WHERE id = p_conta_pagar_id;

    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = p_user_id,
        conta_id = p_conta_bancaria_id,
        data_pagamento = p_data_pagamento, status = 'REALIZADO'
    WHERE id = v_existing_lanc_id;

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, depois)
    VALUES ('contas_pagar', p_conta_pagar_id, 'reconcile_pay_existing', p_user_id,
      jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));

    RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cp.recorrente);
  END IF;

  -- 1. Update conta a pagar to PAGO
  UPDATE public.fin_contas_pagar
  SET status = 'PAGO', data_pagamento = p_data_pagamento, valor_pago = v_cp.valor, updated_at = now()
  WHERE id = p_conta_pagar_id;

  -- 2. Create ledger entry — competência da conta (não do pagamento)
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
    created_by, referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'DESPESA', v_cp.valor,
    COALESCE(v_cp.data_competencia, v_cp.data_vencimento, p_data_pagamento), p_data_pagamento, v_cp.descricao,
    v_cp.categoria_id, v_cp.centro_custo_id, p_conta_bancaria_id,
    v_cp.forma_pagamento, 'REALIZADO', true, now(), p_user_id,
    p_user_id, 'contas_pagar', p_conta_pagar_id::text, v_cp.company_id, 'espelho_cp'
  )
  RETURNING id INTO v_lancamento_id;

  -- 2b. Transfer rateios from CP to espelho lancamento
  INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM public.fin_lancamento_rateios
  WHERE lancamento_id = p_conta_pagar_id AND company_id = v_cp.company_id;

  -- 3. Link back
  UPDATE public.fin_contas_pagar SET lancamento_id = v_lancamento_id WHERE id = p_conta_pagar_id;

  -- 4. Recurrence
  IF v_cp.recorrente AND v_cp.recorrencia_config IS NOT NULL THEN
    DECLARE
      v_freq text; v_max_parcelas int; v_geradas int; v_nova_data date;
    BEGIN
      v_freq := COALESCE(v_cp.recorrencia_config->>'frequencia', 'mensal');
      v_max_parcelas := (v_cp.recorrencia_config->>'parcelas')::int;
      v_geradas := COALESCE((v_cp.recorrencia_config->>'parcelas_geradas')::int, 0) + 1;
      IF v_max_parcelas IS NULL OR v_geradas < v_max_parcelas THEN
        IF v_freq = 'semanal' THEN v_nova_data := v_cp.data_vencimento + interval '7 days';
        ELSIF v_freq = 'quinzenal' THEN v_nova_data := v_cp.data_vencimento + interval '15 days';
        ELSE v_nova_data := v_cp.data_vencimento + interval '1 month'; END IF;
        INSERT INTO public.fin_contas_pagar (
          descricao, valor, data_vencimento, status, categoria_id, centro_custo_id, conta_id, fornecedor,
          forma_pagamento, recorrente, lancamento_pai_id, recorrencia_config, parcela_atual, parcela_total, created_by
        ) VALUES (
          v_cp.descricao, v_cp.valor, v_nova_data, 'AGUARDANDO_APROVACAO',
          v_cp.categoria_id, v_cp.centro_custo_id, v_cp.conta_id, v_cp.fornecedor,
          v_cp.forma_pagamento, true, COALESCE(v_cp.lancamento_pai_id, v_cp.id),
          jsonb_build_object('frequencia', v_freq, 'parcelas', v_max_parcelas, 'parcelas_geradas', v_geradas),
          COALESCE(v_cp.parcela_atual, 0) + 1, v_max_parcelas, p_user_id
        ) RETURNING id INTO v_next_cp_id;
      END IF;
    END;
  END IF;

  -- 5. Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, depois)
  VALUES ('contas_pagar', p_conta_pagar_id, 'reconcile_pay', p_user_id,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cp.valor, 'data_pagamento', p_data_pagamento, 'recorrente', v_cp.recorrente, 'next_cp_id', v_next_cp_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id, 'next_cp_id', v_next_cp_id, 'recorrente', v_cp.recorrente);
END;
$function$;

-- ── reconcile_receive_conta_receber: espelho com competência da conta ───────
CREATE OR REPLACE FUNCTION public.reconcile_receive_conta_receber(
  p_conta_receber_id uuid,
  p_conta_bancaria_id uuid,
  p_data_recebimento date,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_cr record;
  v_lancamento_id uuid;
  v_next_cr_id uuid;
  v_uid uuid;
  v_company uuid;
  v_existing_lanc_id uuid;
  v_conta_exists boolean;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(v_uid, 'finance:manage') THEN
    RAISE EXCEPTION 'Permissão negada: finance:manage necessário';
  END IF;

  SELECT * INTO v_cr
  FROM public.fin_contas_receber
  WHERE id = p_conta_receber_id AND company_id = v_company
  FOR UPDATE;

  IF v_cr IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;

  IF p_conta_bancaria_id IS NOT NULL THEN
    SELECT EXISTS(
      SELECT 1 FROM public.fin_contas WHERE id = p_conta_bancaria_id AND company_id = v_company
    ) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  IF v_cr.status = 'RECEBIDO' THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Conta já foi recebida');
  END IF;
  IF v_cr.status != 'A_RECEBER' THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_cr.status;
  END IF;

  IF v_cr.lancamento_id IS NOT NULL THEN
    SELECT id INTO v_existing_lanc_id FROM public.fin_lancamentos WHERE id = v_cr.lancamento_id;
    IF v_existing_lanc_id IS NOT NULL THEN
      UPDATE public.fin_contas_receber
      SET status = 'RECEBIDO', data_recebimento = p_data_recebimento, valor_recebido = v_cr.valor, updated_at = now()
      WHERE id = p_conta_receber_id AND company_id = v_company;
      UPDATE public.fin_lancamentos
      SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid,
          conta_id = p_conta_bancaria_id,
          data_pagamento = p_data_recebimento, status = 'REALIZADO'
      WHERE id = v_existing_lanc_id;
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
      VALUES ('contas_receber', p_conta_receber_id, 'reconcile_receive_existing', v_uid, v_company,
        jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));
      RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cr.recorrente);
    END IF;
  END IF;

  SELECT id INTO v_existing_lanc_id
  FROM public.fin_lancamentos
  WHERE referencia_modulo = 'contas_receber' AND referencia_id = p_conta_receber_id::text AND company_id = v_company
  LIMIT 1;

  IF v_existing_lanc_id IS NOT NULL THEN
    UPDATE public.fin_contas_receber
    SET status = 'RECEBIDO', data_recebimento = p_data_recebimento, valor_recebido = v_cr.valor,
        lancamento_id = v_existing_lanc_id, updated_at = now()
    WHERE id = p_conta_receber_id AND company_id = v_company;
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid,
        conta_id = p_conta_bancaria_id,
        data_pagamento = p_data_recebimento, status = 'REALIZADO'
    WHERE id = v_existing_lanc_id;
    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
    VALUES ('contas_receber', p_conta_receber_id, 'reconcile_receive_existing', v_uid, v_company,
      jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));
    RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cr.recorrente);
  END IF;

  -- 1. Update CR
  UPDATE public.fin_contas_receber
  SET status = 'RECEBIDO', data_recebimento = p_data_recebimento, valor_recebido = v_cr.valor, updated_at = now()
  WHERE id = p_conta_receber_id AND company_id = v_company;

  -- 2. Create ledger entry — competência da conta (não do recebimento)
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
    created_by, referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'RECEITA', v_cr.valor,
    COALESCE(v_cr.data_competencia, v_cr.data_vencimento, p_data_recebimento), p_data_recebimento, v_cr.descricao,
    v_cr.categoria_id, v_cr.centro_custo_id, p_conta_bancaria_id,
    v_cr.forma_pagamento, 'REALIZADO', true, now(), v_uid,
    v_uid, 'contas_receber', p_conta_receber_id::text, v_company, 'espelho_cr'
  )
  RETURNING id INTO v_lancamento_id;

  -- 2b. Transfer rateios from CR to espelho lancamento
  INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM public.fin_lancamento_rateios
  WHERE lancamento_id = p_conta_receber_id AND company_id = v_company;

  -- 3. Link back
  UPDATE public.fin_contas_receber SET lancamento_id = v_lancamento_id WHERE id = p_conta_receber_id AND company_id = v_company;

  -- 4. Recurrence
  IF v_cr.recorrente AND v_cr.recorrencia_config IS NOT NULL THEN
    DECLARE
      v_freq text; v_max_parcelas int; v_geradas int; v_nova_data date;
    BEGIN
      v_freq := COALESCE(v_cr.recorrencia_config->>'frequencia', 'mensal');
      v_max_parcelas := (v_cr.recorrencia_config->>'parcelas')::int;
      v_geradas := COALESCE((v_cr.recorrencia_config->>'parcelas_geradas')::int, 0) + 1;
      IF v_max_parcelas IS NULL OR v_geradas < v_max_parcelas THEN
        IF v_freq = 'semanal' THEN v_nova_data := v_cr.data_vencimento::date + interval '7 days';
        ELSIF v_freq = 'quinzenal' THEN v_nova_data := v_cr.data_vencimento::date + interval '15 days';
        ELSE v_nova_data := v_cr.data_vencimento::date + interval '1 month'; END IF;
        INSERT INTO public.fin_contas_receber (
          descricao, valor, data_vencimento, status, categoria_id, centro_custo_id, conta_id, cliente,
          forma_pagamento, recorrente, lancamento_pai_id, recorrencia_config, parcela_atual, parcela_total, created_by, company_id
        ) VALUES (
          v_cr.descricao, v_cr.valor, v_nova_data, 'A_RECEBER',
          v_cr.categoria_id, v_cr.centro_custo_id, v_cr.conta_id, v_cr.cliente,
          v_cr.forma_pagamento, true, COALESCE(v_cr.lancamento_pai_id, v_cr.id),
          jsonb_build_object('frequencia', v_freq, 'parcelas', v_max_parcelas, 'parcelas_geradas', v_geradas),
          COALESCE(v_cr.parcela_atual, 0) + 1, v_max_parcelas, v_uid, v_company
        ) RETURNING id INTO v_next_cr_id;
      END IF;
    END;
  END IF;

  -- 5. Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('contas_receber', p_conta_receber_id, 'reconcile_receive', v_uid, v_company,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cr.valor, 'data_recebimento', p_data_recebimento, 'recorrente', v_cr.recorrente, 'next_cr_id', v_next_cr_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id, 'next_cr_id', v_next_cr_id, 'recorrente', v_cr.recorrente);
END;
$function$;

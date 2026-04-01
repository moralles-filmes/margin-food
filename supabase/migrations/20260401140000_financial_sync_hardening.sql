-- ============================================================================
-- FINANCIAL SYNC HARDENING
-- 1. _guarded_delete_lancamento: Guard contra deleção de espelhos
-- 2. _guarded_estornar_conta_pagar: Estorno de CP paga (reverte CP + cancela espelho)
-- 3. _guarded_estornar_conta_receber: Estorno de CR recebida (reverte CR + cancela espelho)
-- 4. Rateio transfer: pay_conta_pagar e receive_conta_receber copiam rateios para espelho
-- 5. Validação de conta bancária nas RPCs de reconciliação
-- 6. fin_audit_integrity_check: Job de auditoria de integridade
-- ============================================================================

-- ============================================================================
-- 1. _guarded_delete_lancamento
--    Substitui o DELETE direto do frontend por RPC com guards:
--    - Bloqueia deleção de espelhos (origem = espelho_cp / espelho_cr)
--    - Bloqueia deleção de lançamentos CONCILIADOS
--    - Registra auditoria
-- ============================================================================
CREATE OR REPLACE FUNCTION public._guarded_delete_lancamento(p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_lanc record;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_permission(v_uid, 'financeiro:lancamentos:delete') THEN
    RAISE EXCEPTION 'Permissão negada: financeiro:lancamentos:delete';
  END IF;

  SELECT * INTO v_lanc
  FROM public.fin_lancamentos
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_lanc IS NULL THEN
    RAISE EXCEPTION 'Lançamento não encontrado';
  END IF;

  -- Block deletion of espelho entries
  IF v_lanc.origem IN ('espelho_cp', 'espelho_cr') THEN
    RAISE EXCEPTION 'Não é possível excluir lançamento-espelho. Use o estorno na conta a pagar/receber correspondente.';
  END IF;

  -- Block deletion of conciliated entries
  IF v_lanc.conciliado = true THEN
    RAISE EXCEPTION 'Não é possível excluir lançamento conciliado. Desfaça a conciliação primeiro.';
  END IF;

  -- Delete rateios first (cascade should handle but be explicit)
  DELETE FROM public.fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  -- Delete the lancamento
  DELETE FROM public.fin_lancamentos
  WHERE id = p_id AND company_id = v_company_id;

  -- Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes)
  VALUES ('lancamentos', p_id, 'delete', v_uid, v_company_id,
    jsonb_build_object('descricao', v_lanc.descricao, 'valor', v_lanc.valor, 'tipo', v_lanc.tipo, 'origem', v_lanc.origem));

  RETURN jsonb_build_object('status', 'ok');
END;
$$;


-- ============================================================================
-- 2. _guarded_estornar_conta_pagar
--    Reverte uma CP PAGO → APROVADO e cancela/remove o lançamento espelho
-- ============================================================================
CREATE OR REPLACE FUNCTION public._guarded_estornar_conta_pagar(
  p_id uuid,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_cp record;
  v_lanc_id uuid;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_permission(v_uid, 'financeiro:pagar:edit') THEN
    RAISE EXCEPTION 'Permissão negada: financeiro:pagar:edit';
  END IF;

  SELECT * INTO v_cp
  FROM public.fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_cp IS NULL THEN
    RAISE EXCEPTION 'Conta a pagar não encontrada';
  END IF;

  IF v_cp.status != 'PAGO' THEN
    RAISE EXCEPTION 'Somente contas com status PAGO podem ser estornadas. Status atual: %', v_cp.status;
  END IF;

  v_lanc_id := v_cp.lancamento_id;

  -- 1. Revert CP status to APROVADO
  UPDATE public.fin_contas_pagar
  SET status = 'APROVADO',
      data_pagamento = NULL,
      valor_pago = NULL,
      lancamento_id = NULL,
      updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  -- 2. Cancel the espelho lancamento (if exists)
  IF v_lanc_id IS NOT NULL THEN
    -- Delete rateios of the espelho
    DELETE FROM public.fin_lancamento_rateios
    WHERE lancamento_id = v_lanc_id AND company_id = v_company_id;

    -- Mark as CANCELADO instead of deleting (preserves audit trail)
    UPDATE public.fin_lancamentos
    SET status = 'CANCELADO',
        conciliado = false,
        updated_at = now()
    WHERE id = v_lanc_id AND company_id = v_company_id;
  END IF;

  -- Also cancel any lancamento referencing this CP (in case lancamento_id was NULL but reference exists)
  UPDATE public.fin_lancamentos
  SET status = 'CANCELADO',
      conciliado = false,
      updated_at = now()
  WHERE referencia_modulo = 'contas_pagar'
    AND referencia_id = p_id::text
    AND company_id = v_company_id
    AND status != 'CANCELADO';

  -- 3. Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes, depois)
  VALUES ('contas_pagar', p_id, 'estorno', v_uid, v_company_id,
    jsonb_build_object('status', 'PAGO', 'valor_pago', v_cp.valor_pago, 'lancamento_id', v_lanc_id),
    jsonb_build_object('status', 'APROVADO', 'justificativa', COALESCE(p_justificativa, 'Estorno manual')));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_cancelado', v_lanc_id);
END;
$$;


-- ============================================================================
-- 3. _guarded_estornar_conta_receber
--    Reverte uma CR RECEBIDO → A_RECEBER e cancela/remove o lançamento espelho
-- ============================================================================
CREATE OR REPLACE FUNCTION public._guarded_estornar_conta_receber(
  p_id uuid,
  p_justificativa text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_cr record;
  v_lanc_id uuid;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  IF NOT public.has_permission(v_uid, 'financeiro:receber:edit') THEN
    RAISE EXCEPTION 'Permissão negada: financeiro:receber:edit';
  END IF;

  SELECT * INTO v_cr
  FROM public.fin_contas_receber
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;

  IF v_cr IS NULL THEN
    RAISE EXCEPTION 'Conta a receber não encontrada';
  END IF;

  IF v_cr.status != 'RECEBIDO' THEN
    RAISE EXCEPTION 'Somente contas com status RECEBIDO podem ser estornadas. Status atual: %', v_cr.status;
  END IF;

  v_lanc_id := v_cr.lancamento_id;

  -- 1. Revert CR status to A_RECEBER
  UPDATE public.fin_contas_receber
  SET status = 'A_RECEBER',
      data_recebimento = NULL,
      valor_recebido = NULL,
      lancamento_id = NULL,
      updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  -- 2. Cancel the espelho lancamento (if exists)
  IF v_lanc_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamento_rateios
    WHERE lancamento_id = v_lanc_id AND company_id = v_company_id;

    UPDATE public.fin_lancamentos
    SET status = 'CANCELADO',
        conciliado = false,
        updated_at = now()
    WHERE id = v_lanc_id AND company_id = v_company_id;
  END IF;

  -- Also cancel any lancamento referencing this CR
  UPDATE public.fin_lancamentos
  SET status = 'CANCELADO',
      conciliado = false,
      updated_at = now()
  WHERE referencia_modulo = 'contas_receber'
    AND referencia_id = p_id::text
    AND company_id = v_company_id
    AND status != 'CANCELADO';

  -- 3. Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes, depois)
  VALUES ('contas_receber', p_id, 'estorno', v_uid, v_company_id,
    jsonb_build_object('status', 'RECEBIDO', 'valor_recebido', v_cr.valor_recebido, 'lancamento_id', v_lanc_id),
    jsonb_build_object('status', 'A_RECEBER', 'justificativa', COALESCE(p_justificativa, 'Estorno manual')));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_cancelado', v_lanc_id);
END;
$$;


-- ============================================================================
-- 4. RATEIO TRANSFER: Atualizar pay_conta_pagar e receive_conta_receber
--    para copiar rateios da CP/CR para o lançamento espelho criado
-- ============================================================================

-- Overwrite pay_conta_pagar with rateio transfer + conta bancária validation
CREATE OR REPLACE FUNCTION public.pay_conta_pagar(p_id uuid, p_expected_updated_at text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para pagar contas.';
  END IF;

  SELECT * INTO v_item FROM fin_contas_pagar WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at::text != p_expected_updated_at THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'Status inválido para pagamento: %', v_item.status;
  END IF;

  v_company_id := v_item.company_id;

  -- Validate conta bancária (if present)
  IF v_item.conta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_item.conta_id AND company_id = v_company_id) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  -- Create espelho lancamento
  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'DESPESA', v_item.valor, v_item.data_vencimento, CURRENT_DATE::text, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_pagar', p_id::text, v_company_id, 'espelho_cp'
  )
  RETURNING id INTO v_lanc_id;

  -- Transfer rateios from CP to espelho lancamento
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  -- Update CP status
  UPDATE fin_contas_pagar
  SET status = 'PAGO', data_pagamento = CURRENT_DATE::text, valor_pago = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id;

  -- Audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_pagar', p_id::text, 'pagar', auth.uid(), v_company_id);

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_pagar', p_id, 'PAY',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO'));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO');
END;
$$;

-- Overwrite receive_conta_receber with rateio transfer + conta bancária validation
CREATE OR REPLACE FUNCTION public.receive_conta_receber(p_id uuid, p_expected_updated_at text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item RECORD;
  v_lanc_id uuid;
  v_company_id uuid;
  v_conta_exists boolean;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para receber contas.';
  END IF;

  SELECT * INTO v_item FROM fin_contas_receber WHERE id = p_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Conta não encontrada.'; END IF;
  IF v_item.updated_at::text != p_expected_updated_at THEN
    RAISE EXCEPTION 'Registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status != 'A_RECEBER' THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_item.status;
  END IF;

  v_company_id := v_item.company_id;

  -- Validate conta bancária (if present)
  IF v_item.conta_id IS NOT NULL THEN
    SELECT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_item.conta_id AND company_id = v_company_id) INTO v_conta_exists;
    IF NOT v_conta_exists THEN
      RAISE EXCEPTION 'Conta bancária não encontrada ou não pertence à empresa';
    END IF;
  END IF;

  -- Create espelho lancamento
  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'RECEITA', v_item.valor, v_item.data_vencimento, CURRENT_DATE::text, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_item.conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_receber', p_id::text, v_company_id, 'espelho_cr'
  )
  RETURNING id INTO v_lanc_id;

  -- Transfer rateios from CR to espelho lancamento
  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  -- Update CR status
  UPDATE fin_contas_receber
  SET status = 'RECEBIDO', data_recebimento = CURRENT_DATE::text, valor_recebido = v_item.valor, lancamento_id = v_lanc_id
  WHERE id = p_id;

  -- Audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id)
  VALUES ('contas_receber', p_id::text, 'receber', auth.uid(), v_company_id);

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_receber', p_id, 'RECEIVE',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO'));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'RECEBIDO');
END;
$$;


-- ============================================================================
-- 5. VALIDAÇÃO de conta bancária nos reconcile RPCs
--    (Adicionada ao reconcile_pay_conta_pagar e reconcile_receive_conta_receber)
-- ============================================================================

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
AS $$
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

  -- Validate conta bancária
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

  -- Check if there's already a linked lancamento (prevent duplicate)
  IF v_cp.lancamento_id IS NOT NULL THEN
    SELECT id INTO v_existing_lanc_id FROM public.fin_lancamentos WHERE id = v_cp.lancamento_id;
    IF v_existing_lanc_id IS NOT NULL THEN
      UPDATE public.fin_contas_pagar
      SET status = 'PAGO',
          data_pagamento = p_data_pagamento,
          valor_pago = v_cp.valor,
          updated_at = now()
      WHERE id = p_conta_pagar_id;

      UPDATE public.fin_lancamentos
      SET conciliado = true, conciliado_em = now(), conciliado_por = p_user_id,
          conta_id = p_conta_bancaria_id,
          data_pagamento = p_data_pagamento, status = 'REALIZADO'
      WHERE id = v_existing_lanc_id;

      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, depois)
      VALUES ('contas_pagar', p_conta_pagar_id::text, 'reconcile_pay_existing', p_user_id,
        jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));

      RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cp.recorrente);
    END IF;
  END IF;

  -- Also check if a lancamento already references this CP
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
    VALUES ('contas_pagar', p_conta_pagar_id::text, 'reconcile_pay_existing', p_user_id,
      jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));

    RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cp.recorrente);
  END IF;

  -- 1. Update conta a pagar to PAGO
  UPDATE public.fin_contas_pagar
  SET status = 'PAGO', data_pagamento = p_data_pagamento, valor_pago = v_cp.valor, updated_at = now()
  WHERE id = p_conta_pagar_id;

  -- 2. Create ledger entry
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
    created_by, referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'DESPESA', v_cp.valor, p_data_pagamento, p_data_pagamento, v_cp.descricao,
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
  VALUES ('contas_pagar', p_conta_pagar_id::text, 'reconcile_pay', p_user_id,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cp.valor, 'data_pagamento', p_data_pagamento, 'recorrente', v_cp.recorrente, 'next_cp_id', v_next_cp_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id, 'next_cp_id', v_next_cp_id, 'recorrente', v_cp.recorrente);
END;
$$;

-- Overwrite reconcile_receive_conta_receber with validação + rateio transfer
CREATE OR REPLACE FUNCTION public.reconcile_receive_conta_receber(
  p_conta_receber_id uuid,
  p_conta_bancaria_id uuid,
  p_data_recebimento date,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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

  -- Validate conta bancária
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

  -- Check for existing linked lancamento (prevent duplicate)
  IF v_cr.lancamento_id IS NOT NULL THEN
    SELECT id INTO v_existing_lanc_id FROM public.fin_lancamentos WHERE id = v_cr.lancamento_id;
    IF v_existing_lanc_id IS NOT NULL THEN
      UPDATE public.fin_contas_receber
      SET status = 'RECEBIDO', data_recebimento = p_data_recebimento::text, valor_recebido = v_cr.valor, updated_at = now()
      WHERE id = p_conta_receber_id AND company_id = v_company;
      UPDATE public.fin_lancamentos
      SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid,
          conta_id = p_conta_bancaria_id,
          data_pagamento = p_data_recebimento, status = 'REALIZADO'
      WHERE id = v_existing_lanc_id;
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
      VALUES ('contas_receber', p_conta_receber_id::text, 'reconcile_receive_existing', v_uid, v_company,
        jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));
      RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cr.recorrente);
    END IF;
  END IF;

  -- Also check by referencia
  SELECT id INTO v_existing_lanc_id
  FROM public.fin_lancamentos
  WHERE referencia_modulo = 'contas_receber' AND referencia_id = p_conta_receber_id::text AND company_id = v_company
  LIMIT 1;

  IF v_existing_lanc_id IS NOT NULL THEN
    UPDATE public.fin_contas_receber
    SET status = 'RECEBIDO', data_recebimento = p_data_recebimento::text, valor_recebido = v_cr.valor,
        lancamento_id = v_existing_lanc_id, updated_at = now()
    WHERE id = p_conta_receber_id AND company_id = v_company;
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid,
        conta_id = p_conta_bancaria_id,
        data_pagamento = p_data_recebimento, status = 'REALIZADO'
    WHERE id = v_existing_lanc_id;
    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
    VALUES ('contas_receber', p_conta_receber_id::text, 'reconcile_receive_existing', v_uid, v_company,
      jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));
    RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id, 'reused', true, 'recorrente', v_cr.recorrente);
  END IF;

  -- 1. Update CR
  UPDATE public.fin_contas_receber
  SET status = 'RECEBIDO', data_recebimento = p_data_recebimento::text, valor_recebido = v_cr.valor, updated_at = now()
  WHERE id = p_conta_receber_id AND company_id = v_company;

  -- 2. Create ledger entry
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
    created_by, referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'RECEITA', v_cr.valor, p_data_recebimento, p_data_recebimento, v_cr.descricao,
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
  VALUES ('contas_receber', p_conta_receber_id::text, 'reconcile_receive', v_uid, v_company,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cr.valor, 'data_recebimento', p_data_recebimento, 'recorrente', v_cr.recorrente, 'next_cr_id', v_next_cr_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id, 'next_cr_id', v_next_cr_id, 'recorrente', v_cr.recorrente);
END;
$$;


-- ============================================================================
-- 6. fin_audit_integrity_check
--    Função de auditoria que detecta inconsistências entre CP/CR e espelhos.
--    Retorna registros com problemas para revisão manual.
-- ============================================================================
CREATE OR REPLACE FUNCTION public.fin_audit_integrity_check()
RETURNS TABLE(
  tipo text,
  problema text,
  entidade_id uuid,
  descricao text,
  valor numeric,
  status text,
  lancamento_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company_id uuid;
BEGIN
  v_company_id := public.assert_tenant();

  -- 1. CPs PAGO sem lancamento_id
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'PAGO sem lançamento espelho'::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND cp.lancamento_id IS NULL;

  -- 2. CPs PAGO cujo espelho não existe mais
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'Espelho excluído ou inexistente'::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND cp.lancamento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = cp.lancamento_id);

  -- 3. CPs PAGO cujo espelho está CANCELADO
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'Espelho CANCELADO mas CP ainda PAGO'::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  JOIN public.fin_lancamentos l ON l.id = cp.lancamento_id
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND l.status = 'CANCELADO';

  -- 4. Espelhos sem CP/CR correspondente
  RETURN QUERY
  SELECT 'lancamento_orfao'::text, 'Espelho CP sem conta a pagar correspondente'::text,
    l.id, l.descricao, l.valor, l.status, l.id
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.origem = 'espelho_cp'
    AND l.status != 'CANCELADO'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_contas_pagar cp
      WHERE cp.lancamento_id = l.id OR cp.id::text = l.referencia_id
    );

  -- 5. CRs RECEBIDO sem lancamento_id
  RETURN QUERY
  SELECT 'conta_receber'::text, 'RECEBIDO sem lançamento espelho'::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND cr.lancamento_id IS NULL;

  -- 6. CRs RECEBIDO cujo espelho não existe mais
  RETURN QUERY
  SELECT 'conta_receber'::text, 'Espelho excluído ou inexistente'::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND cr.lancamento_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.fin_lancamentos l WHERE l.id = cr.lancamento_id);

  -- 7. CRs RECEBIDO cujo espelho está CANCELADO
  RETURN QUERY
  SELECT 'conta_receber'::text, 'Espelho CANCELADO mas CR ainda RECEBIDO'::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  JOIN public.fin_lancamentos l ON l.id = cr.lancamento_id
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND l.status = 'CANCELADO';

  -- 8. Espelhos CR sem conta a receber correspondente
  RETURN QUERY
  SELECT 'lancamento_orfao'::text, 'Espelho CR sem conta a receber correspondente'::text,
    l.id, l.descricao, l.valor, l.status, l.id
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.origem = 'espelho_cr'
    AND l.status != 'CANCELADO'
    AND NOT EXISTS (
      SELECT 1 FROM public.fin_contas_receber cr
      WHERE cr.lancamento_id = l.id OR cr.id::text = l.referencia_id
    );

  -- 9. Valor divergente entre CP e seu espelho
  RETURN QUERY
  SELECT 'conta_pagar'::text, 'Valor divergente: CP=' || cp.valor::text || ' vs Espelho=' || l.valor::text,
    cp.id, cp.descricao, cp.valor, cp.status, cp.lancamento_id
  FROM public.fin_contas_pagar cp
  JOIN public.fin_lancamentos l ON l.id = cp.lancamento_id
  WHERE cp.company_id = v_company_id
    AND cp.status = 'PAGO'
    AND l.status != 'CANCELADO'
    AND cp.valor != l.valor;

  -- 10. Valor divergente entre CR e seu espelho
  RETURN QUERY
  SELECT 'conta_receber'::text, 'Valor divergente: CR=' || cr.valor::text || ' vs Espelho=' || l.valor::text,
    cr.id, cr.descricao, cr.valor, cr.status, cr.lancamento_id
  FROM public.fin_contas_receber cr
  JOIN public.fin_lancamentos l ON l.id = cr.lancamento_id
  WHERE cr.company_id = v_company_id
    AND cr.status = 'RECEBIDO'
    AND l.status != 'CANCELADO'
    AND cr.valor != l.valor;
END;
$$;

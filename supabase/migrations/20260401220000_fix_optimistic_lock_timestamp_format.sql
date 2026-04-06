-- Fix: optimistic locking comparison in pay_conta_pagar and receive_conta_receber
-- Bug: row_to_json() returns updated_at in ISO 8601 format (e.g. "2026-04-01T10:15:30+00:00")
--      but updated_at::text in PL/pgSQL produces PostgreSQL text format (e.g. "2026-04-01 10:15:30+00")
--      The mismatch causes the comparison to ALWAYS fail, blocking all payments/receipts.
-- Fix: cast p_expected_updated_at to timestamptz and compare as timestamps instead of text.

-- 1. Fix pay_conta_pagar
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
  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
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


-- 2. Fix receive_conta_receber
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
  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
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

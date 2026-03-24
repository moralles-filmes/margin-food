
-- 1) Add origem column to fin_lancamentos for visual tracking
ALTER TABLE public.fin_lancamentos
ADD COLUMN IF NOT EXISTS origem text NOT NULL DEFAULT 'manual';

-- 2) Backfill existing records based on referencia_modulo and tipo
UPDATE public.fin_lancamentos SET origem = 'espelho_cp' WHERE referencia_modulo = 'contas_pagar' AND origem = 'manual';
UPDATE public.fin_lancamentos SET origem = 'espelho_cr' WHERE referencia_modulo = 'contas_receber' AND origem = 'manual';
UPDATE public.fin_lancamentos SET origem = 'transferencia' WHERE tipo = 'TRANSFERENCIA' AND origem = 'manual';
UPDATE public.fin_lancamentos SET origem = 'conciliacao' WHERE conciliado = true AND referencia_modulo IS NULL AND tipo != 'TRANSFERENCIA' AND origem = 'manual';

-- 3) Update reconcile_pay_conta_pagar to prevent duplicate lancamento
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
      -- Lancamento already exists, just update the CP status
      UPDATE public.fin_contas_pagar
      SET status = 'PAGO',
          data_pagamento = p_data_pagamento,
          valor_pago = v_cp.valor,
          updated_at = now()
      WHERE id = p_conta_pagar_id;

      -- Mark existing lancamento as conciliado
      UPDATE public.fin_lancamentos
      SET conciliado = true, conciliado_em = now(), conciliado_por = p_user_id,
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
    created_by, referencia_modulo, referencia_id, origem
  )
  VALUES (
    'DESPESA', v_cp.valor, p_data_pagamento, p_data_pagamento, v_cp.descricao,
    v_cp.categoria_id, v_cp.centro_custo_id, COALESCE(v_cp.conta_id, p_conta_bancaria_id),
    v_cp.forma_pagamento, 'REALIZADO', true, now(), p_user_id,
    p_user_id, 'contas_pagar', p_conta_pagar_id::text, 'espelho_cp'
  )
  RETURNING id INTO v_lancamento_id;

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

-- 4) Update reconcile_receive_conta_receber to prevent duplicate lancamento
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
      SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid, data_pagamento = p_data_recebimento, status = 'REALIZADO'
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
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid, data_pagamento = p_data_recebimento, status = 'REALIZADO'
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
    v_cr.categoria_id, v_cr.centro_custo_id, COALESCE(v_cr.conta_id, p_conta_bancaria_id),
    v_cr.forma_pagamento, 'REALIZADO', true, now(), v_uid,
    v_uid, 'contas_receber', p_conta_receber_id::text, v_company, 'espelho_cr'
  )
  RETURNING id INTO v_lancamento_id;

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

REVOKE ALL ON FUNCTION public.reconcile_receive_conta_receber(uuid, uuid, date, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reconcile_receive_conta_receber(uuid, uuid, date, uuid) TO authenticated;

-- 5) Update list_fin_lancamentos_cursor to include origem and extra fields
CREATE OR REPLACE FUNCTION public.list_fin_lancamentos_cursor(
  p_start date DEFAULT NULL::date,
  p_end date DEFAULT NULL::date,
  p_status text DEFAULT NULL::text,
  p_tipo text DEFAULT NULL::text,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_search text DEFAULT NULL::text,
  p_limit integer DEFAULT 50,
  p_cursor_date date DEFAULT NULL::date,
  p_cursor_id uuid DEFAULT NULL::uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  _items json;
  _effective_limit int;
  v_company uuid;
BEGIN
  v_company := public.assert_tenant();
  IF NOT public.has_permission(auth.uid(), 'finance:read') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  _effective_limit := LEAST(GREATEST(p_limit, 10), 200);

  SELECT json_agg(row_to_json(t)) INTO _items
  FROM (
    SELECT
      l.id, l.tipo, l.valor, l.data_competencia, l.data_vencimento, l.data_pagamento,
      l.descricao, l.status,
      l.conta_id, l.conta_destino_id, l.categoria_id, l.centro_custo_id,
      l.forma_pagamento, l.recorrente, l.observacoes, l.created_at, l.updated_at,
      l.lancamento_pai_id, l.conciliado, l.referencia_modulo, l.referencia_id,
      l.origem
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.status != 'CANCELADO'
      AND (p_start IS NULL OR l.data_competencia >= p_start)
      AND (p_end IS NULL OR l.data_competencia <= p_end)
      AND (p_status IS NULL OR l.status = p_status)
      AND (p_tipo IS NULL OR l.tipo = p_tipo)
      AND (p_conta_id IS NULL OR l.conta_id = p_conta_id)
      AND (p_search IS NULL OR l.descricao ILIKE '%' || p_search || '%')
      AND (
        p_cursor_date IS NULL
        OR l.data_competencia < p_cursor_date
        OR (l.data_competencia = p_cursor_date AND l.id < p_cursor_id)
      )
    ORDER BY l.data_competencia DESC, l.id DESC
    LIMIT _effective_limit
  ) t;

  RETURN json_build_object(
    'items', COALESCE(_items, '[]'::json),
    'has_more', (SELECT json_array_length(COALESCE(_items, '[]'::json)) = _effective_limit)
  );
END;
$$;

-- 6) Update reconcile_import_lancamento to set origem='conciliacao'
-- Get latest version first
CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date, p_descricao text, p_valor numeric, p_tipo text,
  p_conta_id uuid, p_user_id uuid, p_rateio_linhas jsonb DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_lancamento_id uuid;
  v_idem_key text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_permission(v_uid, 'finance:manage') THEN
    RAISE EXCEPTION 'permission_denied';
  END IF;

  -- Idempotency key
  v_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);

  -- Check for existing
  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  IF v_lancamento_id IS NOT NULL THEN
    -- Already exists, just mark as conciliado
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  -- Insert new lancamento
  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    conta_id, forma_pagamento, status,
    conciliado, conciliado_em, conciliado_por,
    created_by, idempotency_key, company_id, origem
  )
  VALUES (
    p_tipo::text, p_valor, p_data, p_data, p_descricao,
    p_conta_id, 'extrato', 'REALIZADO',
    true, now(), v_uid,
    v_uid, v_idem_key, v_company, 'conciliacao'
  )
  RETURNING id INTO v_lancamento_id;

  -- Handle rateio
  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas)
    LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id,
        valor, percentual, observacao, company_id
      )
      VALUES (
        v_lancamento_id,
        (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric,
        (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao',
        v_company
      );
    END LOOP;

    -- Set single category if only one rateio line
    IF jsonb_array_length(p_rateio_linhas) = 1 THEN
      UPDATE public.fin_lancamentos
      SET categoria_id = (p_rateio_linhas->0->>'categoria_id')::uuid,
          centro_custo_id = NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid
      WHERE id = v_lancamento_id;
    END IF;
  END IF;

  -- Audit
  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id::text, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data, 'descricao', p_descricao));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;

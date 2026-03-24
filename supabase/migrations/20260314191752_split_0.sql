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
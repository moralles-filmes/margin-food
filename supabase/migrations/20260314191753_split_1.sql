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
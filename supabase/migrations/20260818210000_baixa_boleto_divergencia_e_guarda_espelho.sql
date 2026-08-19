-- Baixa de boleto pela conciliação: divergência de valor e proteção do espelho.
--
-- Contexto (produção, 17/08): 21 boletos foram baixados em 3 segundos pelo botão
-- "Processar" da importação — o matcher casava sozinho com tolerância de 5% no
-- valor e 7 dias na data, sem olhar fornecedor, e o lote não pedia confirmação.
-- O operador do financeiro não sabia que estava dando baixa em nada. Ao tentar
-- desfazer, excluiu 4 lançamentos espelho pela tela de Lançamentos: a exclusão
-- passou (o guard só barrava TRANSFERENCIA) e os boletos ficaram PAGO sem
-- nenhuma despesa no razão.
--
-- Aqui: o valor que sai do banco pode divergir do boleto (juros, tarifa,
-- desconto) e isso passa a ser explícito; e o espelho de uma baixa não pode mais
-- ser excluído — só estornado.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Baixa com divergência de valor
-- ─────────────────────────────────────────────────────────────────────────────
-- O espelho continua com o valor do boleto, na categoria da despesa; a diferença
-- vira um lançamento próprio na categoria de juros/tarifa/desconto. Assim o DRE
-- não mistura custo financeiro com custo da mercadoria, e a soma dos dois bate
-- com a linha do extrato.
--
-- `p_valor_extrato` NULL mantém o comportamento antigo — o front que ainda não
-- envia o valor continua funcionando.
CREATE OR REPLACE FUNCTION public.reconcile_pay_conta_pagar(
  p_conta_pagar_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_user_id uuid,
  p_valor_extrato numeric DEFAULT NULL,
  p_ajuste_tipo text DEFAULT NULL,
  p_ajuste_categoria_id uuid DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_cp record;
  v_lancamento_id uuid;
  v_next_cp_id uuid;
  v_existing_lanc_id uuid;
  v_existing_conta_id uuid;
  v_found boolean;
  v_diff numeric;
  v_ajuste_id uuid;
  v_ajuste_tipo text;
  v_ajuste_lanc_tipo text;
  v_cat_tipo text;
  v_rotulo text;
BEGIN
  v_company := public.assert_tenant();
  v_uid := COALESCE(auth.uid(), p_user_id);

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF p_conta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'CONTA_OBRIGATORIA: informe a conta bancária do extrato';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.fin_contas WHERE id = p_conta_bancaria_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  SELECT * INTO v_cp
  FROM public.fin_contas_pagar
  WHERE id = p_conta_pagar_id AND company_id = v_company
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta a pagar %', p_conta_pagar_id;
  END IF;

  IF v_cp.status = 'PAGO' THEN
    RETURN jsonb_build_object(
      'status', 'noop',
      'message', 'Conta já está paga',
      'lancamento_id', v_cp.lancamento_id,
      'data_pagamento', v_cp.data_pagamento
    );
  END IF;

  IF v_cp.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_cp.status;
  END IF;

  -- ── Divergência entre o boleto e a linha do extrato ──
  v_diff := 0;
  IF p_valor_extrato IS NOT NULL THEN
    v_diff := round(p_valor_extrato - v_cp.valor, 2);

    IF abs(v_diff) >= 0.01 THEN
      v_ajuste_tipo := upper(btrim(COALESCE(p_ajuste_tipo, '')));

      IF v_ajuste_tipo NOT IN ('JUROS', 'TARIFA', 'DESCONTO') THEN
        RAISE EXCEPTION
          'DIVERGENCIA_VALOR: extrato % x boleto % (diferença %). Classifique como JUROS, TARIFA ou DESCONTO.',
          p_valor_extrato, v_cp.valor, v_diff;
      END IF;

      -- Pagou mais que o boleto → juros/tarifa. Pagou menos → desconto.
      IF v_diff > 0 AND v_ajuste_tipo = 'DESCONTO' THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: o extrato é maior que o boleto — a diferença é JUROS ou TARIFA, não desconto.';
      END IF;
      IF v_diff < 0 AND v_ajuste_tipo <> 'DESCONTO' THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: o extrato é menor que o boleto — a diferença é DESCONTO.';
      END IF;

      v_ajuste_lanc_tipo := CASE WHEN v_diff > 0 THEN 'DESPESA' ELSE 'RECEITA' END;

      SELECT c.tipo INTO v_cat_tipo
      FROM public.fin_categorias c
      WHERE c.id = p_ajuste_categoria_id AND c.company_id = v_company AND c.ativo = true;

      IF v_cat_tipo IS NULL THEN
        RAISE EXCEPTION 'CATEGORY_REQUIRED: selecione a categoria da diferença (%).', v_ajuste_tipo;
      END IF;
      IF v_cat_tipo <> lower(v_ajuste_lanc_tipo) THEN
        RAISE EXCEPTION 'CATEGORY_REQUIRED: a categoria da diferença precisa ser de %.', lower(v_ajuste_lanc_tipo);
      END IF;
    END IF;
  END IF;

  v_existing_lanc_id := v_cp.lancamento_id;
  IF v_existing_lanc_id IS NULL THEN
    SELECT id INTO v_existing_lanc_id
    FROM public.fin_lancamentos
    WHERE referencia_modulo = 'contas_pagar'
      AND referencia_id = p_conta_pagar_id::text
      AND company_id = v_company
      AND status <> 'CANCELADO'
    LIMIT 1;
  END IF;

  v_found := false;
  IF v_existing_lanc_id IS NOT NULL THEN
    SELECT conta_id, true INTO v_existing_conta_id, v_found
    FROM public.fin_lancamentos
    WHERE id = v_existing_lanc_id AND company_id = v_company AND status <> 'CANCELADO';
  END IF;

  IF v_found THEN
    UPDATE public.fin_contas_pagar
    SET status = 'PAGO', data_pagamento = p_data_pagamento, valor_pago = v_cp.valor,
        lancamento_id = v_existing_lanc_id, conta_id = p_conta_bancaria_id, updated_at = now()
    WHERE id = p_conta_pagar_id AND company_id = v_company;

    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid,
        conta_id = p_conta_bancaria_id,
        data_pagamento = p_data_pagamento, status = 'REALIZADO',
        justificativa_edicao = CASE
          WHEN v_existing_conta_id IS DISTINCT FROM p_conta_bancaria_id
            THEN 'Conta bancária definida na conciliação do extrato'
          ELSE justificativa_edicao
        END
    WHERE id = v_existing_lanc_id AND company_id = v_company;

    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
    VALUES ('contas_pagar', p_conta_pagar_id, 'reconcile_pay_existing', v_uid, v_company,
      jsonb_build_object('lancamento_id', v_existing_lanc_id, 'reused', true));

    RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_existing_lanc_id,
      'reused', true, 'recorrente', v_cp.recorrente);
  END IF;

  UPDATE public.fin_contas_pagar
  SET status = 'PAGO', data_pagamento = p_data_pagamento, valor_pago = v_cp.valor,
      conta_id = p_conta_bancaria_id, updated_at = now()
  WHERE id = p_conta_pagar_id AND company_id = v_company;

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
    v_cp.forma_pagamento, 'REALIZADO', true, now(), v_uid,
    v_uid, 'contas_pagar', p_conta_pagar_id::text, v_cp.company_id, 'espelho_cp'
  )
  RETURNING id INTO v_lancamento_id;

  INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM public.fin_lancamento_rateios
  WHERE lancamento_id = p_conta_pagar_id AND company_id = v_company;

  UPDATE public.fin_contas_pagar SET lancamento_id = v_lancamento_id
  WHERE id = p_conta_pagar_id AND company_id = v_company;

  -- ── Lançamento da diferença ──
  IF abs(v_diff) >= 0.01 THEN
    v_rotulo := CASE v_ajuste_tipo
      WHEN 'JUROS' THEN 'Juros'
      WHEN 'TARIFA' THEN 'Tarifa bancária'
      ELSE 'Desconto'
    END;

    INSERT INTO public.fin_lancamentos (
      tipo, valor, data_competencia, data_pagamento, descricao,
      categoria_id, conta_id, forma_pagamento, status,
      conciliado, conciliado_em, conciliado_por,
      created_by, referencia_modulo, referencia_id, company_id, origem
    )
    VALUES (
      v_ajuste_lanc_tipo, abs(v_diff), p_data_pagamento, p_data_pagamento,
      v_rotulo || ' — ' || v_cp.descricao,
      p_ajuste_categoria_id, p_conta_bancaria_id, v_cp.forma_pagamento, 'REALIZADO',
      true, now(), v_uid,
      v_uid, 'contas_pagar', p_conta_pagar_id::text, v_company, 'ajuste_pagamento'
    )
    RETURNING id INTO v_ajuste_id;
  END IF;

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
          forma_pagamento, recorrente, lancamento_pai_id, recorrencia_config, parcela_atual, parcela_total,
          created_by, company_id
        ) VALUES (
          v_cp.descricao, v_cp.valor, v_nova_data, 'AGUARDANDO_APROVACAO',
          v_cp.categoria_id, v_cp.centro_custo_id, v_cp.conta_id, v_cp.fornecedor,
          v_cp.forma_pagamento, true, COALESCE(v_cp.lancamento_pai_id, v_cp.id),
          jsonb_build_object('frequencia', v_freq, 'parcelas', v_max_parcelas, 'parcelas_geradas', v_geradas),
          COALESCE(v_cp.parcela_atual, 0) + 1, v_max_parcelas, v_uid, v_company
        ) RETURNING id INTO v_next_cp_id;
      END IF;
    END;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('contas_pagar', p_conta_pagar_id, 'reconcile_pay', v_uid, v_company,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cp.valor,
      'valor_extrato', p_valor_extrato, 'diferenca', v_diff, 'ajuste_tipo', v_ajuste_tipo,
      'ajuste_lancamento_id', v_ajuste_id,
      'data_pagamento', p_data_pagamento, 'recorrente', v_cp.recorrente, 'next_cp_id', v_next_cp_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id,
    'next_cp_id', v_next_cp_id, 'recorrente', v_cp.recorrente,
    'ajuste_lancamento_id', v_ajuste_id, 'diferenca', v_diff);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Espelho de baixa não pode ser excluído — só estornado
-- ─────────────────────────────────────────────────────────────────────────────
-- Excluir o lançamento não desfaz a baixa: o boleto continua PAGO e fica sem
-- despesa no razão. Foi o que aconteceu com 4 contas em 18/08.
CREATE OR REPLACE FUNCTION public._guarded_delete_lancamento(
  p_id uuid,
  p_expected_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id    uuid;
  v_tipo       text;
  v_updated_at timestamptz;
  v_old_data   jsonb;
  v_deleted    int;
  v_ref_modulo text;
  v_ref_id     text;
  v_origem     text;
  v_bloqueio   text;
BEGIN
  v_company_id := assert_tenant();
  v_user_id    := auth.uid();

  IF NOT has_permission('financeiro:lancamentos:delete') THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:delete';
  END IF;

  SELECT tipo, updated_at, referencia_modulo, referencia_id, origem,
         jsonb_build_object('descricao', descricao, 'valor', valor, 'tipo', tipo)
  INTO v_tipo, v_updated_at, v_ref_modulo, v_ref_id, v_origem, v_old_data
  FROM fin_lancamentos
  WHERE id = p_id AND company_id = v_company_id;

  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  -- Transferências têm fluxo dedicado (delete_transfer); bloquear aqui
  IF v_tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION 'Use a ação "Excluir Transferência" para este lançamento.';
  END IF;

  IF v_ref_modulo = 'contas_pagar' AND v_ref_id IS NOT NULL AND v_ref_id <> '' THEN
    SELECT cp.descricao INTO v_bloqueio
    FROM fin_contas_pagar cp
    WHERE cp.id::text = v_ref_id AND cp.company_id = v_company_id AND cp.status = 'PAGO';
    IF FOUND THEN
      RAISE EXCEPTION
        'LANCAMENTO_ESPELHO: este lançamento é a baixa da conta a pagar "%". Use Estornar em Contas a Pagar — excluir aqui deixaria a conta paga sem despesa no razão.',
        v_bloqueio;
    END IF;
  END IF;

  IF v_ref_modulo = 'contas_receber' AND v_ref_id IS NOT NULL AND v_ref_id <> '' THEN
    SELECT cr.descricao INTO v_bloqueio
    FROM fin_contas_receber cr
    WHERE cr.id::text = v_ref_id AND cr.company_id = v_company_id AND cr.status = 'RECEBIDO';
    IF FOUND THEN
      RAISE EXCEPTION
        'LANCAMENTO_ESPELHO: este lançamento é a baixa da conta a receber "%". Use Estornar em Contas a Receber.',
        v_bloqueio;
    END IF;
  END IF;

  IF p_expected_updated_at IS NOT NULL AND v_updated_at <> p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;

  DELETE FROM fin_lancamento_rateios WHERE lancamento_id = p_id AND company_id = v_company_id;
  DELETE FROM fin_lancamentos WHERE id = p_id AND company_id = v_company_id;

  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  IF v_deleted = 0 THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, antes, user_id, company_id)
  VALUES ('lancamentos', p_id, 'excluir', v_old_data, v_user_id, v_company_id);

  RETURN jsonb_build_object('id', p_id, 'deleted', true);
END;
$function$;

NOTIFY pgrst, 'reload schema';

-- Blindagem do módulo de Conciliação Bancária: mapeamento completo dos bugs
-- recorrentes de saldo/duplicação encontrado nesta auditoria (24+ fixes no
-- módulo em ~4 meses, sempre um caminho corrigido e o caminho gêmeo esquecido).
--
-- 1) reconcile_pay_conta_pagar: o ajuste de juros/tarifa/desconto (p_valor_extrato
--    divergente do boleto) era calculado e validado, mas o branch de reaproveitamento
--    de lançamento já vinculado (v_found) retornava ANTES do INSERT do ajuste —
--    a diferença nunca virava lançamento. Saldo não batia, sem erro nenhum.
--
-- 2) reconcile_receive_conta_receber nunca recebeu nenhuma correção equivalente às
--    de reconcile_pay_conta_pagar (migrations 20260818172000/20260818210000/
--    20260819120000): zero suporte a divergência de valor (sempre grava
--    valor_recebido = valor cadastrado, ignorando o extrato) e, nos branches de
--    reaproveitamento, atualiza conta_id sem preencher justificativa_edicao —
--    como o espelho de CR sempre nasce REALIZADO, isso sempre estoura P0003
--    (trg_validate_fin_lancamento_update) na próxima vez que alguém reconciliar
--    um recebível já vinculado a lançamento com conta diferente/nula.
--
-- 3) RBAC inconsistente no mesmo fluxo: reconcile_import_lancamento e
--    reconcile_receive_conta_receber checavam só 'finance:manage'; as demais RPCs
--    de conciliação (reconcile_pay_conta_pagar, reconcile_create_transfer,
--    reconcile_link_existing_lancamento) já aceitavam a permissão granular
--    'financeiro:conciliacao:reconcile'. Usuário com só a granular ficava travado
--    em parte da própria tela de conciliação. Unifica as duas funções restantes.
--
-- 4) get_fin_saldo_conta_em (card de saldo na tela de conciliação) usava
--    COALESCE(data_pagamento, data_competencia); get_fin_saldo_atual (Livro Razão)
--    usa COALESCE(data_pagamento, conciliado_em::date, data_competencia). Lançamento
--    com data_pagamento NULL e conciliado_em preenchido (caso de
--    reconcile_link_existing_lancamento sem conta) cai em datas diferentes nas duas
--    telas — divergência de saldo na própria tela cujo propósito é conferir saldo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 0. Categoria de sistema espelho: "Descontos Concedidos" (DESPESAS NÃO OPERACIONAIS)
-- ─────────────────────────────────────────────────────────────────────────────
-- Mesma necessidade de fin_get_categoria_desconto_baixa (CP, RECEITAS NÃO
-- OPERACIONAIS), espelhada para CR: receber menos que o título é desconto dado
-- ao cliente — DESPESA que não pode contar como custo operacional no DRE.
CREATE OR REPLACE FUNCTION public.fin_get_categoria_desconto_concedido(
  p_company_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_raiz uuid;
BEGIN
  SELECT id INTO v_raiz
  FROM public.fin_categorias
  WHERE company_id = p_company_id AND system_key = 'despesas_nao_operacionais'
  LIMIT 1;

  IF v_raiz IS NULL THEN
    INSERT INTO public.fin_categorias (system_key, nome, tipo, codigo, ordem, company_id)
    VALUES ('despesas_nao_operacionais', 'DESPESAS NÃO OPERACIONAIS', 'despesa', 'NO-D', 9991, p_company_id)
    RETURNING id INTO v_raiz;
  END IF;

  SELECT id INTO v_id
  FROM public.fin_categorias
  WHERE company_id = p_company_id
    AND parent_id = v_raiz
    AND lower(nome) = 'descontos concedidos'
  ORDER BY ativo DESC, created_at
  LIMIT 1;

  IF v_id IS NOT NULL THEN
    UPDATE public.fin_categorias
    SET ativo = true
    WHERE id = v_id AND company_id = p_company_id AND ativo = false;
    RETURN v_id;
  END IF;

  INSERT INTO public.fin_categorias
    (nome, tipo, codigo, parent_id, ordem, ativo, company_id)
  VALUES
    ('Descontos Concedidos', 'despesa', 'NO-D.90', v_raiz, 9991, true, p_company_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fin_get_categoria_desconto_concedido(uuid) IS
  'Resolve (criando se preciso) a categoria não operacional usada pelo desconto concedido no recebimento de título.';

REVOKE ALL ON FUNCTION public.fin_get_categoria_desconto_concedido(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_categoria_desconto_concedido(uuid) TO service_role;

DO $backfill$
DECLARE
  v_company uuid;
BEGIN
  FOR v_company IN
    SELECT DISTINCT company_id FROM public.fin_categorias
  LOOP
    PERFORM public.fin_get_categoria_desconto_concedido(v_company);
  END LOOP;
END;
$backfill$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. reconcile_import_lancamento: RBAC unificado (assinatura inalterada, 9 args)
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date,
  p_descricao text,
  p_valor numeric,
  p_tipo text,
  p_conta_id uuid,
  p_user_id uuid,
  p_rateio_linhas jsonb DEFAULT NULL::jsonb,
  p_external_id text DEFAULT NULL::text,
  p_force_duplicate boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_lancamento_id uuid;
  v_idem_key text;
  v_legacy_idem_key text;
  v_external_id text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
  v_cat_id uuid;
  v_cc_id uuid;
  v_invalid_categories int;
  v_dup_id uuid;
  v_dup_created_at timestamptz;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;

  IF p_tipo <> 'TRANSFERENCIA' THEN
    IF p_rateio_linhas IS NULL OR jsonb_typeof(p_rateio_linhas) <> 'array' OR jsonb_array_length(p_rateio_linhas) = 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: selecione uma categoria antes de conciliar';
    END IF;
    SELECT count(*) INTO v_invalid_categories
    FROM jsonb_array_elements(p_rateio_linhas) item
    LEFT JOIN public.fin_categorias c
      ON c.id = NULLIF(item->>'categoria_id', '')::uuid
      AND c.company_id = v_company AND c.ativo = true
    WHERE c.id IS NULL OR c.tipo <> lower(p_tipo);
    IF v_invalid_categories > 0 THEN
      RAISE EXCEPTION USING ERRCODE = '23514', MESSAGE = 'CATEGORY_REQUIRED: categoria inválida ou incompatível com o tipo';
    END IF;
  END IF;

  v_external_id := NULLIF(btrim(p_external_id), '');
  IF v_external_id IS NOT NULL AND length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
  END IF;

  v_legacy_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);
  v_idem_key := CASE
    WHEN v_external_id IS NOT NULL
      THEN md5(concat_ws('|', v_company::text, p_conta_id::text, 'external', v_external_id))
    ELSE v_legacy_idem_key
  END;

  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  -- Compatibilidade: a primeira reimportação promove a linha antiga para FITID.
  IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_legacy_idem_key AND company_id = v_company;

    IF v_lancamento_id IS NOT NULL THEN
      UPDATE public.fin_lancamentos
      SET idempotency_key = v_idem_key
      WHERE id = v_lancamento_id;
    END IF;
  END IF;

  IF v_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  -- FITID novo (ou ausente) e sem bater com a chave legada: antes de criar,
  -- procura por conteudo identico ja conciliado desta conta. Nao restringe a
  -- quem ja tem vinculo — e exatamente o caso de reimportacao com FITID trocado.
  -- p_force_duplicate=true pula esta checagem (usuario confirmou que e uma
  -- transacao legitima repetida, ex.: duas vendas iguais no mesmo dia).
  IF NOT p_force_duplicate THEN
    SELECT l.id, l.created_at INTO v_dup_id, v_dup_created_at
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.conta_id = p_conta_id
      AND l.tipo = p_tipo
      AND l.valor = p_valor
      AND l.data_pagamento = p_data
      AND l.descricao = p_descricao
      AND l.origem = 'conciliacao'
    ORDER BY l.created_at ASC
    LIMIT 1;

    IF v_dup_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'status', 'possible_duplicate',
        'lancamento_id', v_dup_id,
        'criado_em', v_dup_created_at
      );
    END IF;
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF(p_rateio_linhas->0->>'categoria_id', '')::uuid;
    v_cc_id := NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid;
  END IF;

  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao, conta_id,
    forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
    created_by, idempotency_key, company_id, origem, categoria_id, centro_custo_id
  ) VALUES (
    p_tipo, p_valor, p_data, p_data, p_descricao, p_conta_id,
    'extrato', 'REALIZADO', true, now(), v_uid,
    v_uid, v_idem_key, v_company, 'conciliacao', v_cat_id, v_cc_id
  ) RETURNING id INTO v_lancamento_id;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      ) VALUES (
        v_lancamento_id, (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric, (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao', v_company
      );
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data,
      'descricao', p_descricao, 'categoria_id', v_cat_id, 'rateios', p_rateio_linhas,
      'external_id_used', v_external_id IS NOT NULL, 'category_validation', 'passed',
      'force_duplicate', p_force_duplicate));
  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. reconcile_pay_conta_pagar: ajuste não é mais descartado no reaproveitamento
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.reconcile_pay_conta_pagar(
  p_conta_pagar_id uuid,
  p_conta_bancaria_id uuid,
  p_data_pagamento date,
  p_user_id uuid,
  p_valor_extrato numeric DEFAULT NULL::numeric,
  p_ajuste_tipo text DEFAULT NULL::text,
  p_ajuste_categoria_id uuid DEFAULT NULL::uuid
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
  v_reused boolean;
  v_diff numeric;
  v_ajuste_id uuid;
  v_ajuste_tipo text;
  v_ajuste_lanc_tipo text;
  v_ajuste_cat_id uuid;
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

      IF v_diff > 0 AND v_ajuste_tipo = 'DESCONTO' THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: o extrato é maior que o boleto — a diferença é JUROS ou TARIFA, não desconto.';
      END IF;
      IF v_diff < 0 AND v_ajuste_tipo <> 'DESCONTO' THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: o extrato é menor que o boleto — a diferença é DESCONTO.';
      END IF;

      v_ajuste_lanc_tipo := CASE WHEN v_diff > 0 THEN 'DESPESA' ELSE 'RECEITA' END;

      -- Desconto sem categoria escolhida cai na categoria de sistema.
      v_ajuste_cat_id := p_ajuste_categoria_id;
      IF v_ajuste_cat_id IS NULL AND v_ajuste_tipo = 'DESCONTO' THEN
        v_ajuste_cat_id := public.fin_get_categoria_desconto_baixa(v_company);
      END IF;

      SELECT c.tipo INTO v_cat_tipo
      FROM public.fin_categorias c
      WHERE c.id = v_ajuste_cat_id AND c.company_id = v_company AND c.ativo = true;

      IF v_cat_tipo IS NULL THEN
        RAISE EXCEPTION 'CATEGORY_REQUIRED: selecione a categoria da diferença (%).', v_ajuste_tipo;
      END IF;
      IF v_cat_tipo <> lower(v_ajuste_lanc_tipo) THEN
        RAISE EXCEPTION 'CATEGORY_REQUIRED: a categoria da diferença precisa ser de %.', lower(v_ajuste_lanc_tipo);
      END IF;

      -- Desconto é dinheiro que deixou de sair, não venda: fora do resultado.
      IF v_ajuste_tipo = 'DESCONTO'
         AND NOT public.fin_categoria_fora_do_resultado(v_ajuste_cat_id, v_company) THEN
        RAISE EXCEPTION
          'CATEGORIA_OPERACIONAL: o desconto obtido não pode entrar como receita operacional — use uma categoria sob RECEITAS NÃO OPERACIONAIS (ex.: "Descontos Obtidos"), senão ele soma no faturamento do DRE.';
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

  v_reused := COALESCE(v_found, false);

  IF v_reused THEN
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

    v_lancamento_id := v_existing_lanc_id;
  ELSE
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
  END IF;

  -- Ajuste (juros/tarifa/desconto) sempre entra, reaproveitando lançamento ou não —
  -- antes esse INSERT só era alcançado no caminho de lançamento novo, porque o
  -- branch de reaproveitamento (v_found) retornava antes de chegar aqui. A
  -- diferença sumia silenciosamente sempre que a conta a pagar já tinha
  -- lançamento vinculado (ex.: criado manualmente, ou vinculado antes via
  -- reconcile_link_existing_lancamento).
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
      v_ajuste_cat_id, p_conta_bancaria_id, v_cp.forma_pagamento, 'REALIZADO',
      true, now(), v_uid,
      v_uid, 'contas_pagar', p_conta_pagar_id::text, v_company, 'ajuste_pagamento'
    )
    RETURNING id INTO v_ajuste_id;
  END IF;

  IF NOT v_reused AND v_cp.recorrente AND v_cp.recorrencia_config IS NOT NULL THEN
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
  VALUES ('contas_pagar', p_conta_pagar_id,
    CASE WHEN v_reused THEN 'reconcile_pay_existing' ELSE 'reconcile_pay' END,
    v_uid, v_company,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cp.valor,
      'valor_extrato', p_valor_extrato, 'diferenca', v_diff, 'ajuste_tipo', v_ajuste_tipo,
      'ajuste_categoria_id', v_ajuste_cat_id, 'ajuste_lancamento_id', v_ajuste_id,
      'data_pagamento', p_data_pagamento, 'recorrente', v_cp.recorrente, 'next_cp_id', v_next_cp_id,
      'reused', v_reused));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id,
    'next_cp_id', v_next_cp_id, 'recorrente', v_cp.recorrente,
    'ajuste_lancamento_id', v_ajuste_id, 'diferenca', v_diff, 'reused', v_reused);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. reconcile_receive_conta_receber: paridade com reconcile_pay_conta_pagar
-- ─────────────────────────────────────────────────────────────────────────────
-- Assinatura ganha 3 parâmetros novos (p_valor_extrato/p_ajuste_tipo/
-- p_ajuste_categoria_id) — DROP da assinatura de 4 args exigido, senão vira
-- overload em vez de substituir (ver convenção do projeto).
DROP FUNCTION IF EXISTS public.reconcile_receive_conta_receber(uuid, uuid, date, uuid);

CREATE OR REPLACE FUNCTION public.reconcile_receive_conta_receber(
  p_conta_receber_id uuid,
  p_conta_bancaria_id uuid,
  p_data_recebimento date,
  p_user_id uuid,
  p_valor_extrato numeric DEFAULT NULL::numeric,
  p_ajuste_tipo text DEFAULT NULL::text,
  p_ajuste_categoria_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_cr record;
  v_lancamento_id uuid;
  v_next_cr_id uuid;
  v_uid uuid;
  v_company uuid;
  v_existing_lanc_id uuid;
  v_existing_conta_id uuid;
  v_conta_exists boolean;
  v_found boolean;
  v_reused boolean;
  v_diff numeric;
  v_ajuste_id uuid;
  v_ajuste_tipo text;
  v_ajuste_lanc_tipo text;
  v_ajuste_cat_id uuid;
  v_cat_tipo text;
  v_rotulo text;
BEGIN
  v_company := public.assert_tenant();
  v_uid := COALESCE(auth.uid(), p_user_id);
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
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
    RETURN jsonb_build_object('status', 'noop', 'message', 'Conta já foi recebida', 'lancamento_id', v_cr.lancamento_id);
  END IF;
  IF v_cr.status != 'A_RECEBER' THEN
    RAISE EXCEPTION 'Status inválido para recebimento: %', v_cr.status;
  END IF;

  -- Divergência entre o valor do título e o que efetivamente entrou no banco —
  -- espelho de reconcile_pay_conta_pagar com o sinal invertido: receber A MENOS
  -- que o título é desconto concedido ao cliente (DESPESA não operacional, senão
  -- infla despesas operacionais no DRE); receber A MAIS é juros/multa (RECEITA).
  v_diff := 0;
  IF p_valor_extrato IS NOT NULL THEN
    v_diff := round(p_valor_extrato - v_cr.valor, 2);

    IF abs(v_diff) >= 0.01 THEN
      v_ajuste_tipo := upper(btrim(COALESCE(p_ajuste_tipo, '')));

      IF v_ajuste_tipo NOT IN ('JUROS', 'TARIFA', 'DESCONTO') THEN
        RAISE EXCEPTION
          'DIVERGENCIA_VALOR: extrato % x título % (diferença %). Classifique como JUROS, TARIFA ou DESCONTO.',
          p_valor_extrato, v_cr.valor, v_diff;
      END IF;

      IF v_diff < 0 AND v_ajuste_tipo <> 'DESCONTO' THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: o extrato é menor que o título — a diferença é DESCONTO.';
      END IF;
      IF v_diff > 0 AND v_ajuste_tipo = 'DESCONTO' THEN
        RAISE EXCEPTION 'AJUSTE_INVALIDO: o extrato é maior que o título — a diferença é JUROS ou TARIFA, não desconto.';
      END IF;

      v_ajuste_lanc_tipo := CASE WHEN v_diff < 0 THEN 'DESPESA' ELSE 'RECEITA' END;

      v_ajuste_cat_id := p_ajuste_categoria_id;
      IF v_ajuste_cat_id IS NULL AND v_ajuste_tipo = 'DESCONTO' THEN
        v_ajuste_cat_id := public.fin_get_categoria_desconto_concedido(v_company);
      END IF;

      SELECT c.tipo INTO v_cat_tipo
      FROM public.fin_categorias c
      WHERE c.id = v_ajuste_cat_id AND c.company_id = v_company AND c.ativo = true;

      IF v_cat_tipo IS NULL THEN
        RAISE EXCEPTION 'CATEGORY_REQUIRED: selecione a categoria da diferença (%).', v_ajuste_tipo;
      END IF;
      IF v_cat_tipo <> lower(v_ajuste_lanc_tipo) THEN
        RAISE EXCEPTION 'CATEGORY_REQUIRED: a categoria da diferença precisa ser de %.', lower(v_ajuste_lanc_tipo);
      END IF;

      IF v_ajuste_tipo = 'DESCONTO'
         AND NOT public.fin_categoria_fora_do_resultado(v_ajuste_cat_id, v_company) THEN
        RAISE EXCEPTION
          'CATEGORIA_OPERACIONAL: o desconto concedido não pode entrar como despesa operacional — use uma categoria sob DESPESAS NÃO OPERACIONAIS (ex.: "Descontos Concedidos"), senão ele infla as despesas do DRE.';
      END IF;
    END IF;
  END IF;

  v_existing_lanc_id := v_cr.lancamento_id;
  IF v_existing_lanc_id IS NULL THEN
    SELECT id INTO v_existing_lanc_id
    FROM public.fin_lancamentos
    WHERE referencia_modulo = 'contas_receber'
      AND referencia_id = p_conta_receber_id::text
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

  v_reused := COALESCE(v_found, false);

  IF v_reused THEN
    UPDATE public.fin_contas_receber
    SET status = 'RECEBIDO', data_recebimento = p_data_recebimento, valor_recebido = v_cr.valor,
        lancamento_id = v_existing_lanc_id, updated_at = now()
    WHERE id = p_conta_receber_id AND company_id = v_company;

    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid,
        conta_id = p_conta_bancaria_id,
        data_pagamento = p_data_recebimento, status = 'REALIZADO',
        justificativa_edicao = CASE
          WHEN v_existing_conta_id IS DISTINCT FROM p_conta_bancaria_id
            THEN 'Conta bancária definida na conciliação do extrato'
          ELSE justificativa_edicao
        END
    WHERE id = v_existing_lanc_id AND company_id = v_company;

    v_lancamento_id := v_existing_lanc_id;
  ELSE
    UPDATE public.fin_contas_receber
    SET status = 'RECEBIDO', data_recebimento = p_data_recebimento, valor_recebido = v_cr.valor, updated_at = now()
    WHERE id = p_conta_receber_id AND company_id = v_company;

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

    INSERT INTO public.fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
    SELECT v_lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
    FROM public.fin_lancamento_rateios
    WHERE lancamento_id = p_conta_receber_id AND company_id = v_company;

    UPDATE public.fin_contas_receber SET lancamento_id = v_lancamento_id WHERE id = p_conta_receber_id AND company_id = v_company;
  END IF;

  -- Ajuste (juros/tarifa/desconto) sempre entra, reaproveitando lançamento ou não —
  -- mesmo princípio da correção em reconcile_pay_conta_pagar.
  IF abs(v_diff) >= 0.01 THEN
    v_rotulo := CASE v_ajuste_tipo
      WHEN 'JUROS' THEN 'Juros'
      WHEN 'TARIFA' THEN 'Tarifa bancária'
      ELSE 'Desconto concedido'
    END;

    INSERT INTO public.fin_lancamentos (
      tipo, valor, data_competencia, data_pagamento, descricao,
      categoria_id, conta_id, forma_pagamento, status,
      conciliado, conciliado_em, conciliado_por,
      created_by, referencia_modulo, referencia_id, company_id, origem
    )
    VALUES (
      v_ajuste_lanc_tipo, abs(v_diff), p_data_recebimento, p_data_recebimento,
      v_rotulo || ' — ' || v_cr.descricao,
      v_ajuste_cat_id, p_conta_bancaria_id, v_cr.forma_pagamento, 'REALIZADO',
      true, now(), v_uid,
      v_uid, 'contas_receber', p_conta_receber_id::text, v_company, 'ajuste_recebimento'
    )
    RETURNING id INTO v_ajuste_id;
  END IF;

  IF NOT v_reused AND v_cr.recorrente AND v_cr.recorrencia_config IS NOT NULL THEN
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

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('contas_receber', p_conta_receber_id,
    CASE WHEN v_reused THEN 'reconcile_receive_existing' ELSE 'reconcile_receive' END,
    v_uid, v_company,
    jsonb_build_object('lancamento_id', v_lancamento_id, 'valor', v_cr.valor,
      'valor_extrato', p_valor_extrato, 'diferenca', v_diff, 'ajuste_tipo', v_ajuste_tipo,
      'ajuste_categoria_id', v_ajuste_cat_id, 'ajuste_lancamento_id', v_ajuste_id,
      'data_recebimento', p_data_recebimento, 'recorrente', v_cr.recorrente, 'next_cr_id', v_next_cr_id,
      'reused', v_reused));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id,
    'next_cr_id', v_next_cr_id, 'recorrente', v_cr.recorrente,
    'ajuste_lancamento_id', v_ajuste_id, 'diferenca', v_diff, 'reused', v_reused);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_receive_conta_receber(uuid, uuid, date, uuid, numeric, text, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. get_fin_saldo_conta_em: mesma cadeia de fallback de data que get_fin_saldo_atual
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.get_fin_saldo_conta_em(p_conta_id uuid, p_data date)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_company uuid;
  v_saldo_inicial numeric;
  v_saldo numeric;
BEGIN
  v_company := public.assert_tenant();

  IF NOT public.has_any_permission(auth.uid(), ARRAY['financeiro:conciliacao:view', 'financeiro:conciliacao:manage', 'system:global:manage']) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED';
  END IF;

  SELECT c.saldo_inicial INTO v_saldo_inicial
  FROM public.fin_contas c
  WHERE c.id = p_conta_id AND c.company_id = v_company;

  IF v_saldo_inicial IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  SELECT v_saldo_inicial + COALESCE(SUM(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = p_conta_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = p_conta_id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = p_conta_id THEN -l.valor
      ELSE 0
    END
  ), 0) INTO v_saldo
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)
    AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= p_data;

  RETURN v_saldo;
END;
$function$;

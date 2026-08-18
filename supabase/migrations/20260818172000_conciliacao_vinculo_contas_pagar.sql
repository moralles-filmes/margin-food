-- Conciliação × Contas a Pagar: fecha os caminhos que duplicavam despesa no razão.
--
-- Cenário 1 (pagou no extrato, depois pagou de novo em Contas a Pagar): não havia
-- nenhuma trava — `pay_conta_pagar` cria o espelho sem olhar o razão.
-- Cenário 2 (pagou em Contas a Pagar, depois importou o extrato): o espelho fica
-- invisível para o matcher da conciliação, porque o score compara a data do
-- extrato com `data_competencia` (a competência do boleto), e não com a data em
-- que o dinheiro saiu. Boleto pago com mais de 7 dias de atraso nunca aparecia.
--
-- As RPCs abaixo dão o suporte que faltava: baixar boleto exigindo conta bancária,
-- listar boletos em aberto sem trava de data, e vincular uma linha do extrato a um
-- lançamento que já existe — sem criar um segundo.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. Baixa em Contas a Pagar exige conta bancária
-- ─────────────────────────────────────────────────────────────────────────────
-- Sem conta, o espelho nasce com conta_id NULL: fica fora de qualquer conta
-- bancária, não aparece na conciliação (que filtra por conta) e o extrato traz a
-- mesma despesa como nova. A conta continua opcional ao cadastrar o boleto.
--
-- Assinatura antiga precisa ser dropada: manter as duas deixaria a chamada de 3
-- argumentos ambígua para o PostgREST (PGRST203).
DROP FUNCTION IF EXISTS public.pay_conta_pagar(uuid, text, date);

CREATE OR REPLACE FUNCTION public.pay_conta_pagar(
  p_id uuid,
  p_expected_updated_at text,
  p_data_pagamento date DEFAULT NULL::date,
  p_conta_id uuid DEFAULT NULL::uuid
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
  v_conta_id uuid;
  v_pag date;
  v_comp date;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Não autenticado.'; END IF;
  IF NOT public.has_permission(auth.uid(), 'finance:manage') THEN
    RAISE EXCEPTION 'Sem permissão para pagar contas.';
  END IF;

  v_company_id := public.assert_tenant();

  SELECT * INTO v_item FROM fin_contas_pagar
  WHERE id = p_id AND company_id = v_company_id
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta a pagar não encontrada.'; END IF;

  IF v_item.updated_at != p_expected_updated_at::timestamptz THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: registro alterado por outro usuário. Recarregue.';
  END IF;
  IF v_item.status NOT IN ('APROVADO', 'AGUARDANDO_APROVACAO') THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: %', v_item.status;
  END IF;

  -- Conta escolhida na baixa tem precedência; sem ela, cai na conta do cadastro.
  v_conta_id := COALESCE(p_conta_id, v_item.conta_id);
  IF v_conta_id IS NULL THEN
    RAISE EXCEPTION 'CONTA_OBRIGATORIA: selecione a conta bancária de onde o pagamento saiu.';
  END IF;
  IF NOT EXISTS(SELECT 1 FROM fin_contas WHERE id = v_conta_id AND company_id = v_company_id) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  -- Data real do pagamento: escolhida pelo usuário, ou hoje no fuso BR (nunca UTC)
  v_pag := COALESCE(p_data_pagamento, (now() AT TIME ZONE 'America/Sao_Paulo')::date);
  -- Competência preservada da conta (regime de competência do DRE)
  v_comp := COALESCE(v_item.data_competencia, v_item.data_vencimento, v_pag);

  INSERT INTO fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento, descricao,
    categoria_id, centro_custo_id, conta_id,
    forma_pagamento, status, created_by,
    referencia_modulo, referencia_id, company_id, origem
  )
  VALUES (
    'DESPESA', v_item.valor, v_comp, v_pag, v_item.descricao,
    v_item.categoria_id, v_item.centro_custo_id, v_conta_id,
    v_item.forma_pagamento, 'REALIZADO', auth.uid(),
    'contas_pagar', p_id::text, v_company_id, 'espelho_cp'
  )
  RETURNING id INTO v_lanc_id;

  INSERT INTO fin_lancamento_rateios (lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id)
  SELECT v_lanc_id, categoria_id, centro_custo_id, valor, percentual, company_id
  FROM fin_lancamento_rateios
  WHERE lancamento_id = p_id AND company_id = v_company_id;

  UPDATE fin_contas_pagar
  SET status = 'PAGO', data_pagamento = v_pag, valor_pago = v_item.valor,
      lancamento_id = v_lanc_id, conta_id = v_conta_id
  WHERE id = p_id AND company_id = v_company_id;

  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('contas_pagar', p_id, 'pagar', auth.uid(), v_company_id,
    jsonb_build_object('lancamento_id', v_lanc_id, 'conta_id', v_conta_id, 'data_pagamento', v_pag));

  PERFORM public.log_audit('rpc', 'financeiro', 'fin_contas_pagar', p_id, 'PAY',
    jsonb_build_object('status_anterior', v_item.status, 'valor', v_item.valor),
    jsonb_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO', 'data_pagamento', v_pag,
      'data_competencia', v_comp, 'conta_id', v_conta_id));

  RETURN json_build_object('lancamento_id', v_lanc_id, 'status', 'PAGO', 'conta_id', v_conta_id);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Boletos em aberto para o seletor manual da conciliação
-- ─────────────────────────────────────────────────────────────────────────────
-- O matcher automático só sugere um boleto se o score for > 0, o que exige valor
-- dentro de 5% E data dentro de 7 dias. Boleto pago com atraso jamais aparecia e
-- o usuário não tinha como escolher um manualmente. Aqui não há trava de data:
-- ordena por proximidade de valor/vencimento e deixa a decisão com a pessoa.
CREATE OR REPLACE FUNCTION public.list_fin_contas_pagar_abertas(
  p_search text DEFAULT NULL,
  p_valor numeric DEFAULT NULL,
  p_data date DEFAULT NULL,
  p_limit int DEFAULT 30
)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_search text;
  v_limit int;
  v_result jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'financeiro:pagar:view',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  v_limit := LEAST(GREATEST(COALESCE(p_limit, 30), 1), 100);
  -- O cliente já normaliza o termo (normalizeSearchText); aqui só garante o piso.
  v_search := NULLIF(btrim(lower(public.immutable_unaccent(p_search))), '');

  -- `- 'ordem'` tira a chave de ordenação do payload devolvido ao cliente.
  SELECT COALESCE(jsonb_agg(to_jsonb(t) - 'ordem' ORDER BY t.ordem, t.data_vencimento DESC), '[]'::jsonb)
  INTO v_result
  FROM (
    SELECT
      cp.id,
      cp.descricao,
      cp.fornecedor,
      cp.valor,
      cp.status,
      cp.data_vencimento,
      cp.data_competencia,
      cp.conta_id,
      cp.categoria_id,
      public.fin_entity_has_category(cp.id, cp.categoria_id, cp.company_id) AS tem_categoria,
      -- Ordem: valor exato primeiro, depois proximidade de vencimento.
      (CASE WHEN p_valor IS NOT NULL AND abs(cp.valor - p_valor) < 0.01 THEN 0 ELSE 1 END)
        * 100000
        + LEAST(COALESCE(abs(cp.data_vencimento - COALESCE(p_data, CURRENT_DATE)), 99999), 99999) AS ordem
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company
      AND cp.status IN ('RASCUNHO', 'AGUARDANDO_APROVACAO', 'APROVADO', 'VENCIDO')
      AND (
        v_search IS NULL
        OR cp.descricao_unaccent LIKE '%' || v_search || '%'
        OR cp.fornecedor_unaccent LIKE '%' || v_search || '%'
      )
    ORDER BY ordem, cp.data_vencimento DESC
    LIMIT v_limit
  ) t;

  RETURN v_result;
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Vincular linha do extrato a um lançamento que já existe
-- ─────────────────────────────────────────────────────────────────────────────
-- Usada quando a conciliação identifica que aquela despesa já entrou no razão
-- pelo Contas a Pagar. Marca como conciliado e grava o FITID, sem criar um
-- segundo lançamento. Se o lançamento tiver ficado sem conta bancária (baixa
-- antiga, feita quando a conta não era obrigatória), adota a conta do extrato.
CREATE OR REPLACE FUNCTION public.reconcile_link_existing_lancamento(
  p_conta_id uuid,
  p_lancamento_id uuid,
  p_external_id text DEFAULT NULL,
  p_tipo text DEFAULT NULL,
  p_data_extrato date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lanc record;
  v_conta_ajustada boolean := false;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF NOT EXISTS(SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária';
  END IF;

  SELECT * INTO v_lanc FROM public.fin_lancamentos
  WHERE id = p_lancamento_id AND company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: lançamento'; END IF;

  IF v_lanc.status = 'CANCELADO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: lançamento cancelado não pode ser conciliado';
  END IF;

  -- Conta divergente é erro, não ajuste silencioso: mover um lançamento de conta
  -- mexeria no saldo das duas pontas sem o usuário perceber.
  IF v_lanc.conta_id IS NOT NULL
     AND v_lanc.conta_id <> p_conta_id
     AND COALESCE(v_lanc.conta_destino_id, '00000000-0000-0000-0000-000000000000'::uuid) <> p_conta_id THEN
    RAISE EXCEPTION 'CONTA_DIVERGENTE: o lançamento pertence a outra conta bancária';
  END IF;

  -- A categoria é exigida pelo trigger ao conciliar; erro antecipado é mais claro
  -- do que a exceção genérica do trigger.
  IF v_lanc.tipo <> 'TRANSFERENCIA'
     AND NOT public.fin_entity_has_category(v_lanc.id, v_lanc.categoria_id, v_lanc.company_id) THEN
    RAISE EXCEPTION USING ERRCODE = '23514',
      MESSAGE = 'CATEGORY_REQUIRED: o lançamento está sem categoria — corrija antes de conciliar';
  END IF;

  -- Alterar conta_id de um lançamento REALIZADO dispara o trigger que exige
  -- justificativa; ela vai no mesmo UPDATE.
  IF v_lanc.conta_id IS NULL THEN
    UPDATE public.fin_lancamentos
    SET conta_id = p_conta_id,
        conciliado = true,
        conciliado_em = now(),
        conciliado_por = v_uid,
        justificativa_edicao = 'Conta bancária definida na conciliação do extrato',
        updated_at = now()
    WHERE id = p_lancamento_id AND company_id = v_company;
    v_conta_ajustada := true;
  ELSIF v_lanc.conciliado IS DISTINCT FROM true THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid, updated_at = now()
    WHERE id = p_lancamento_id AND company_id = v_company;
  END IF;

  IF NULLIF(btrim(p_external_id), '') IS NOT NULL AND p_tipo IN ('RECEITA', 'DESPESA') THEN
    PERFORM public.reconcile_bind_extrato(p_conta_id, p_external_id, p_tipo, p_lancamento_id);
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', p_lancamento_id, 'reconcile_link_existing', v_uid, v_company,
    jsonb_build_object('conta_id', p_conta_id, 'external_id', p_external_id,
      'origem_lancamento', v_lanc.origem, 'conta_ajustada', v_conta_ajustada,
      'data_extrato', p_data_extrato));

  RETURN jsonb_build_object(
    'status', 'ok',
    'lancamento_id', p_lancamento_id,
    'origem', v_lanc.origem,
    'conta_ajustada', v_conta_ajustada
  );
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. reconcile_pay_conta_pagar — isolamento de tenant, conta obrigatória e noop útil
-- ─────────────────────────────────────────────────────────────────────────────
-- Três correções: (a) buscava o boleto sem filtrar company_id, alcançando outro
-- tenant; (b) checava permissão com o p_user_id vindo do cliente; (c) quando o
-- boleto já estava PAGO devolvia 'noop' sem lancamento_id, então o front não
-- gravava o FITID e a mesma linha voltava como nova na importação seguinte.
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
  v_company uuid;
  v_uid uuid;
  v_cp record;
  v_lancamento_id uuid;
  v_next_cp_id uuid;
  v_existing_lanc_id uuid;
  v_existing_conta_id uuid;
  v_found boolean;
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

  -- Já pago: devolve o lançamento existente para o front vincular o FITID em vez
  -- de deixar a linha do extrato aparecer como nova na próxima importação.
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

  -- Já existe lançamento vinculado? Reaproveita (sem novo lançamento) — preserva competência
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

  -- FOUND depois de um SELECT INTO que não acha nada mantém o valor anterior em
  -- alguns caminhos; a flag explícita evita cair no branch de reuso à toa.
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

      -- Trocar conta_id de lançamento REALIZADO exige justificativa (trigger
      -- trg_validate_fin_lancamento_update). Sem ela o UPDATE estourava P0003.
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
      'data_pagamento', p_data_pagamento, 'recorrente', v_cp.recorrente, 'next_cp_id', v_next_cp_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id,
    'next_cp_id', v_next_cp_id, 'recorrente', v_cp.recorrente);
END;
$function$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 5. Estorno remove o vínculo do extrato
-- ─────────────────────────────────────────────────────────────────────────────
-- O estorno cancelava o espelho mas deixava a linha em fin_conciliacao_vinculos
-- apontando para ele. Ao reimportar o extrato, a linha aparecia como "já
-- conciliada" apontando para um lançamento CANCELADO: o valor sumia do razão e
-- não havia como relançar.
CREATE OR REPLACE FUNCTION public._guarded_estornar_conta_pagar(
  p_id uuid,
  p_justificativa text DEFAULT NULL::text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_cp record;
  v_lanc_id uuid;
  v_vinculos_removidos int := 0;
  v_cancelados uuid[];
  v_alvos uuid[];
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta a pagar não encontrada';
  END IF;

  IF v_cp.status != 'PAGO' THEN
    RAISE EXCEPTION 'STATUS_INVALIDO: somente contas PAGO podem ser estornadas. Status atual: %', v_cp.status;
  END IF;

  v_lanc_id := v_cp.lancamento_id;

  UPDATE public.fin_contas_pagar
  SET status = 'APROVADO',
      data_pagamento = NULL,
      valor_pago = NULL,
      lancamento_id = NULL,
      updated_at = now()
  WHERE id = p_id AND company_id = v_company_id;

  IF v_lanc_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamento_rateios
    WHERE lancamento_id = v_lanc_id AND company_id = v_company_id;

    UPDATE public.fin_lancamentos
    SET status = 'CANCELADO',
        conciliado = false,
        updated_at = now()
    WHERE id = v_lanc_id AND company_id = v_company_id;
  END IF;

  WITH cancelados AS (
    UPDATE public.fin_lancamentos
    SET status = 'CANCELADO',
        conciliado = false,
        updated_at = now()
    WHERE referencia_modulo = 'contas_pagar'
      AND referencia_id = p_id::text
      AND company_id = v_company_id
      AND status != 'CANCELADO'
    RETURNING id
  )
  SELECT array_agg(id) INTO v_cancelados FROM cancelados;

  -- Sem isso a linha do extrato fica presa a um lançamento cancelado.
  v_alvos := COALESCE(v_cancelados, ARRAY[]::uuid[]);
  IF v_lanc_id IS NOT NULL THEN
    v_alvos := v_alvos || v_lanc_id;
  END IF;

  IF array_length(v_alvos, 1) > 0 THEN
    WITH removidos AS (
      DELETE FROM public.fin_conciliacao_vinculos
      WHERE company_id = v_company_id
        AND lancamento_id = ANY(v_alvos)
      RETURNING 1
    )
    SELECT count(*) INTO v_vinculos_removidos FROM removidos;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, antes, depois)
  VALUES ('contas_pagar', p_id, 'estorno', v_uid, v_company_id,
    jsonb_build_object('status', 'PAGO', 'valor_pago', v_cp.valor_pago, 'lancamento_id', v_lanc_id),
    jsonb_build_object('status', 'APROVADO', 'justificativa', COALESCE(p_justificativa, 'Estorno manual'),
      'vinculos_extrato_removidos', v_vinculos_removidos));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_cancelado', v_lanc_id,
    'vinculos_extrato_removidos', v_vinculos_removidos);
END;
$function$;

-- Limpeza dos vínculos já órfãos (apontando para lançamento cancelado).
DELETE FROM public.fin_conciliacao_vinculos v
USING public.fin_lancamentos l
WHERE l.id = v.lancamento_id AND l.status = 'CANCELADO';

-- PostgREST precisa reler o schema para expor as RPCs novas.
NOTIFY pgrst, 'reload schema';

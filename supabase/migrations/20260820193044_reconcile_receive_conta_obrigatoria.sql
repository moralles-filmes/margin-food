-- reconcile_receive_conta_receber deixava p_conta_bancaria_id opcional (só
-- validava se viesse preenchido), diferente de reconcile_pay_conta_pagar
-- (CONTA_OBRIGATORIA). Achado da revisão adversarial da migration anterior:
-- o mesmo padrão documentado no CLAUDE.md para o lado de pagamento — "Sem
-- conta, o espelho nasce com conta_id NULL, some da conciliação (que filtra
-- por conta) e o extrato traz a mesma despesa como nova" — se aplica
-- identicamente ao lado de recebimento. Hoje o único chamador
-- (ConciliacaoBancariaSection.tsx) sempre passa uma conta selecionada, então
-- não é explorável pela UI atual, mas fecha o buraco de defesa em profundidade
-- na própria migration que trouxe "paridade estrutural" com o lado pago.

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

  IF p_conta_bancaria_id IS NULL THEN
    RAISE EXCEPTION 'CONTA_OBRIGATORIA: informe a conta bancária do extrato';
  END IF;
  IF NOT EXISTS(
    SELECT 1 FROM public.fin_contas WHERE id = p_conta_bancaria_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  SELECT * INTO v_cr
  FROM public.fin_contas_receber
  WHERE id = p_conta_receber_id AND company_id = v_company
  FOR UPDATE;

  IF v_cr IS NULL THEN RAISE EXCEPTION 'Conta a receber não encontrada'; END IF;

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

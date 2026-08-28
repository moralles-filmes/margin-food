-- Desconto obtido na baixa de boleto não pode virar faturamento.
--
-- A baixa com divergência cria a diferença como lançamento próprio. Quando o
-- banco debita MENOS que o boleto (desconto), esse lançamento nasce tipo
-- RECEITA — e, caído numa categoria de receita operacional, entra no total de
-- RECEITAS do DRE, no DFC e nos relatórios como se fosse venda.
--
-- Duas engrenagens diferentes tiram valor do resultado, e as duas precisam ser
-- satisfeitas ao mesmo tempo:
--   • DRE/DFC (DemonstrativoTree) separam pela RAIZ da árvore — `calcNodeValue`
--     soma a subárvore inteira sem olhar o flag dos filhos, então marcar só uma
--     folha no meio da árvore de RECEITAS não tira nada do total.
--   • Relatórios (Dashboard, KPIs, Fluxo, Orçamento, Sócios, Comparativo) filtram
--     `fin_lancamentos.excluir_dos_relatorios`, materializado por
--     `fin_category_is_excluded`, que lê o flag DA PRÓPRIA categoria.
--
-- Por isso o desconto exige categoria cuja cadeia inteira até a raiz esteja
-- marcada `excluir_dos_totais` — na prática, sob RECEITAS NÃO OPERACIONAIS, onde
-- os triggers de categoria já herdam e propagam o flag.
-- O saldo bancário continua real: ele não filtra nada.

-- ─────────────────────────────────────────────────────────────────────────────
-- 1. A cadeia da categoria está fora do resultado?
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_categoria_fora_do_resultado(
  p_categoria_id uuid,
  p_company_id uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  WITH RECURSIVE cadeia AS (
    SELECT c.id, c.parent_id, c.excluir_dos_totais, 0 AS nivel
    FROM public.fin_categorias c
    WHERE c.id = p_categoria_id AND c.company_id = p_company_id
    UNION ALL
    SELECT p.id, p.parent_id, p.excluir_dos_totais, cadeia.nivel + 1
    FROM public.fin_categorias p
    JOIN cadeia ON p.id = cadeia.parent_id
    WHERE p.company_id = p_company_id AND cadeia.nivel < 20
  )
  SELECT COALESCE(bool_and(excluir_dos_totais), false) FROM cadeia;
$function$;

COMMENT ON FUNCTION public.fin_categoria_fora_do_resultado(uuid, uuid) IS
  'true quando a categoria E todos os ancestrais estão marcados excluir_dos_totais — condição para ficar fora do DRE/DFC e dos relatórios ao mesmo tempo.';

GRANT EXECUTE ON FUNCTION public.fin_categoria_fora_do_resultado(uuid, uuid) TO authenticated, service_role;

-- ─────────────────────────────────────────────────────────────────────────────
-- 2. Categoria de sistema "Descontos Obtidos"
-- ─────────────────────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.fin_get_categoria_desconto_baixa(
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
  WHERE company_id = p_company_id AND system_key = 'receitas_nao_operacionais'
  LIMIT 1;

  IF v_raiz IS NULL THEN
    INSERT INTO public.fin_categorias (system_key, nome, tipo, codigo, ordem, company_id)
    VALUES ('receitas_nao_operacionais', 'RECEITAS NÃO OPERACIONAIS', 'receita', 'NO-R', 9990, p_company_id)
    RETURNING id INTO v_raiz;
  END IF;

  SELECT id INTO v_id
  FROM public.fin_categorias
  WHERE company_id = p_company_id
    AND parent_id = v_raiz
    AND lower(nome) = 'descontos obtidos'
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
    ('Descontos Obtidos', 'receita', 'NO-R.90', v_raiz, 9991, true, p_company_id)
  RETURNING id INTO v_id;

  RETURN v_id;
END;
$function$;

COMMENT ON FUNCTION public.fin_get_categoria_desconto_baixa(uuid) IS
  'Resolve (criando se preciso) a categoria não operacional usada pelo desconto obtido na baixa de boleto.';

REVOKE ALL ON FUNCTION public.fin_get_categoria_desconto_baixa(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fin_get_categoria_desconto_baixa(uuid) TO service_role;

-- Backfill para as empresas que já têm plano de contas.
DO $backfill$
DECLARE
  v_company uuid;
BEGIN
  FOR v_company IN
    SELECT DISTINCT company_id FROM public.fin_categorias
  LOOP
    PERFORM public.fin_get_categoria_desconto_baixa(v_company);
  END LOOP;
END;
$backfill$;

-- ─────────────────────────────────────────────────────────────────────────────
-- 3. Overload legado de 4 argumentos
-- ─────────────────────────────────────────────────────────────────────────────
DROP FUNCTION IF EXISTS public.reconcile_pay_conta_pagar(uuid, uuid, date, uuid);

-- ─────────────────────────────────────────────────────────────────────────────
-- 4. Baixa com divergência: desconto só em categoria fora do resultado
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
      'ajuste_categoria_id', v_ajuste_cat_id, 'ajuste_lancamento_id', v_ajuste_id,
      'data_pagamento', p_data_pagamento, 'recorrente', v_cp.recorrente, 'next_cp_id', v_next_cp_id));

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id,
    'next_cp_id', v_next_cp_id, 'recorrente', v_cp.recorrente,
    'ajuste_lancamento_id', v_ajuste_id, 'diferenca', v_diff);
END;
$function$;

GRANT EXECUTE ON FUNCTION public.reconcile_pay_conta_pagar(uuid, uuid, date, uuid, numeric, text, uuid) TO authenticated, service_role;

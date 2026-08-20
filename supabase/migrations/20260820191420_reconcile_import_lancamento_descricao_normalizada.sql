-- O guard de duplicata por conteudo (migration 20260820183751, do incidente de
-- FITID instavel) comparava l.descricao = p_descricao por igualdade exata. Se o
-- banco truncar a descricao em tamanho diferente entre dois downloads do mesmo
-- extrato (comum), ou o usuario editar a descricao do lancamento ja conciliado,
-- a comparacao exata nao bate e a propria protecao criada hoje deixa de pegar
-- a reimportacao -- minando o proprio guard. Normaliza (unaccent + lower + trim)
-- dos dois lados, seguindo o padrao de busca de texto do projeto
-- (immutable_unaccent, ja usado nas colunas *_unaccent).

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
  -- Descricao comparada normalizada (unaccent+lower+trim): o banco pode truncar
  -- a descricao em tamanho diferente entre dois downloads do mesmo extrato, e
  -- igualdade exata deixaria passar despercebida a mesma reimportacao que essa
  -- checagem existe para pegar.
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
      AND lower(public.immutable_unaccent(btrim(l.descricao))) = lower(public.immutable_unaccent(btrim(p_descricao)))
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

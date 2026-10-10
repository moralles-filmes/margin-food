-- Um lançamento cobre uma única linha do extrato por conta.
--
-- reconcile_bind_extrato gravava qualquer FITID novo no lançamento pedido,
-- mesmo com ele já vinculado a outra linha desta conta. A baixa de um título já
-- pago volta `noop` com o lançamento da 1ª baixa, e a tela grava nele o FITID da
-- linha nova: duas linhas do extrato num lançamento só, e a 2ª saída real some
-- do saldo sem aviso. Agora recusa com LANCAMENTO_JA_VINCULADO, a mesma regra de
-- reconcile_link_existing_lancamento (20261007193000). O reenvio do mesmo FITID
-- continua idempotente; o lançamento fica travado (FOR UPDATE) para duas
-- chamadas concorrentes não passarem juntas pela checagem; e o FITID gravado por
-- outra chamada entre a leitura e o INSERT não é mais repontado em silêncio.
--
-- reconcile_import_lancamento: a linha com FITID ainda sem lançamento procurava
-- o lançamento legado pela chave da 1ª ocorrência, qualquer que fosse a dela.
-- Com duas linhas iguais e um lançamento legado sem vínculo, a 2ª linha promovia
-- o lançamento da 1ª (já reconhecida na tela pelo conteúdo) e voltava
-- `duplicate`. Agora procura pela chave de conteúdo da mesma ocorrência. O resto
-- do corpo é o do banco vivo (= 20261008120000, conferido por md5 do prosrc).
--
-- Assinaturas, permissões e retornos não mudam.

CREATE OR REPLACE FUNCTION public.reconcile_bind_extrato(p_conta_id uuid, p_external_id text, p_tipo text, p_lancamento_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_external_id text;
  v_existing_lancamento_id uuid;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  v_external_id := NULLIF(btrim(p_external_id), '');
  IF v_external_id IS NULL OR length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
  END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA') THEN
    RAISE EXCEPTION 'INVALID_TYPE';
  END IF;

  PERFORM 1
  FROM public.fin_contas c
  WHERE c.id = p_conta_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta bancária'; END IF;

  -- Trava o lançamento: duas linhas vinculando a ele ao mesmo tempo passariam
  -- juntas pela checagem de vínculo único abaixo.
  PERFORM 1
  FROM public.fin_lancamentos l
  WHERE l.id = p_lancamento_id
    AND l.company_id = v_company
    AND (
      (l.tipo = 'TRANSFERENCIA' AND (l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id))
      OR (l.tipo <> 'TRANSFERENCIA' AND l.conta_id = p_conta_id)
    )
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: lançamento não pertence à conta'; END IF;

  SELECT v.lancamento_id INTO v_existing_lancamento_id
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_company
    AND v.conta_id = p_conta_id
    AND v.external_id = v_external_id
    AND v.tipo = p_tipo
  FOR UPDATE;

  IF v_existing_lancamento_id IS NOT NULL AND v_existing_lancamento_id <> p_lancamento_id THEN
    RAISE EXCEPTION 'EXTERNAL_ID_CONFLICT: linha bancária já vinculada a outro lançamento';
  END IF;

  -- Reenvio do mesmo vínculo: idempotente.
  IF v_existing_lancamento_id = p_lancamento_id THEN
    RETURN jsonb_build_object('status', 'ok', 'lancamento_id', p_lancamento_id);
  END IF;

  -- Um lançamento cobre uma linha do extrato por conta (transferência: uma perna
  -- em cada conta). Um 2º FITID nele esconderia uma movimentação real.
  IF EXISTS (
    SELECT 1 FROM public.fin_conciliacao_vinculos v
    WHERE v.company_id = v_company
      AND v.conta_id = p_conta_id
      AND v.lancamento_id = p_lancamento_id
      AND (v.external_id, v.tipo) IS DISTINCT FROM (v_external_id, p_tipo)
  ) THEN
    RAISE EXCEPTION 'LANCAMENTO_JA_VINCULADO: este lançamento já está vinculado a outra linha do extrato desta conta';
  END IF;

  INSERT INTO public.fin_conciliacao_vinculos (
    company_id, conta_id, external_id, tipo, lancamento_id, created_by
  ) VALUES (
    v_company, p_conta_id, v_external_id, p_tipo, p_lancamento_id, v_uid
  )
  ON CONFLICT (company_id, conta_id, external_id, tipo)
  DO NOTHING;

  -- Outra chamada gravou o mesmo FITID entre a leitura e o INSERT: só vale se
  -- for para o mesmo lançamento (antes, o DO UPDATE repontava o vínculo dela).
  SELECT v.lancamento_id INTO v_existing_lancamento_id
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_company
    AND v.conta_id = p_conta_id
    AND v.external_id = v_external_id
    AND v.tipo = p_tipo;
  IF v_existing_lancamento_id IS DISTINCT FROM p_lancamento_id THEN
    RAISE EXCEPTION 'EXTERNAL_ID_CONFLICT: linha bancária já vinculada a outro lançamento';
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', p_lancamento_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_bind_extrato(uuid, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_bind_extrato(uuid, text, text, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(
  p_data date,
  p_descricao text,
  p_valor numeric,
  p_tipo text,
  p_conta_id uuid,
  p_user_id uuid,
  p_rateio_linhas jsonb DEFAULT NULL::jsonb,
  p_external_id text DEFAULT NULL::text,
  p_force_duplicate boolean DEFAULT false,
  p_occurrence_index integer DEFAULT 0,
  p_data_competencia date DEFAULT NULL::date
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
  v_conteudo_idem_key text;
  v_external_id text;
  v_company uuid;
  v_uid uuid;
  v_rateio_item jsonb;
  v_cat_id uuid;
  v_cc_id uuid;
  v_invalid_categories int;
  v_dup_id uuid;
  v_dup_created_at timestamptz;
  v_existing_count int;
  v_occurrence_index int;
  v_descricao_normalizada text;
  v_constraint text;
  v_competencia date;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;
  IF p_tipo NOT IN ('RECEITA', 'DESPESA', 'TRANSFERENCIA') THEN RAISE EXCEPTION 'INVALID_TYPE'; END IF;
  -- Transferência não tem competência própria: as duas pernas usam a data do banco.
  IF p_data_competencia IS NOT NULL AND p_tipo = 'TRANSFERENCIA' THEN
    RAISE EXCEPTION USING ERRCODE = '22023', MESSAGE = 'COMPETENCIA_INVALIDA: transferência usa a data do banco';
  END IF;
  v_competencia := COALESCE(p_data_competencia, p_data);

  -- Mesmo padrão do cabeçalho de CP/CR: a conta entra na chave e no lançamento.
  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas WHERE id = p_conta_id AND company_id = v_company
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_occurrence_index := GREATEST(COALESCE(p_occurrence_index, 0), 0);

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
  -- Linha sem FITID (CSV): a identidade é o conteúdo + a ocorrência dele no
  -- extrato. A 1ª ocorrência mantém a chave legada — lançamentos já gravados
  -- continuam reconhecidos e reimportar o arquivo não duplica —, e a n-ésima
  -- tem chave própria. Sem isso a 2ª venda idêntica do dia caía no caminho
  -- rápido da 1ª e devolvia 'duplicate' antes de olhar p_force_duplicate.
  v_conteudo_idem_key := CASE
    WHEN v_legacy_idem_key IS NULL OR v_occurrence_index = 0 THEN v_legacy_idem_key
    ELSE md5(concat_ws('|', v_legacy_idem_key, 'ocorrencia', v_occurrence_index::text))
  END;
  v_idem_key := CASE
    WHEN v_external_id IS NOT NULL
      THEN md5(concat_ws('|', v_company::text, p_conta_id::text, 'external', v_external_id))
    ELSE v_conteudo_idem_key
  END;

  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  -- Linha com FITID ainda sem lançamento: procura o lançamento gravado antes do
  -- FITID (CSV ou legado) pela chave de conteúdo da MESMA ocorrência. Pela chave
  -- da 1ª, a 2ª linha igual promovia o lançamento da 1ª e voltava 'duplicate' —
  -- a 2ª venda nunca era lançada. Na ocorrência 0 a chave é a legada, como antes.
  IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_conteudo_idem_key AND company_id = v_company;

    IF v_lancamento_id IS NOT NULL THEN
      IF EXISTS (
        SELECT 1 FROM public.fin_conciliacao_vinculos v
        WHERE v.company_id = v_company
          AND v.conta_id = p_conta_id
          AND v.lancamento_id = v_lancamento_id
          AND v.external_id <> v_external_id
      ) THEN
        v_lancamento_id := NULL;
      ELSE
        UPDATE public.fin_lancamentos
        SET idempotency_key = v_idem_key
        WHERE id = v_lancamento_id;
      END IF;
    END IF;
  END IF;

  IF v_lancamento_id IS NOT NULL THEN
    UPDATE public.fin_lancamentos
    SET conciliado = true, conciliado_em = now(), conciliado_por = v_uid
    WHERE id = v_lancamento_id;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END IF;

  -- Colapsa espaços internos antes de comparar: o MEMO do OFX varia o espaçamento
  -- entre exportações do mesmo extrato (ex.: Santander), então uma comparação exata
  -- de string (mesmo com lower+unaccent) deixa passar duplicata como se fosse nova.
  v_descricao_normalizada := regexp_replace(lower(public.immutable_unaccent(btrim(p_descricao))), '\s+', ' ', 'g');

  IF NOT p_force_duplicate THEN
    SELECT count(*) INTO v_existing_count
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.conta_id = p_conta_id
      AND l.tipo = p_tipo
      AND l.valor = p_valor
      AND l.data_pagamento = p_data
      AND regexp_replace(lower(public.immutable_unaccent(btrim(l.descricao))), '\s+', ' ', 'g') = v_descricao_normalizada
      AND l.origem IN ('conciliacao', 'espelho_cp', 'espelho_cr');

    IF v_occurrence_index < v_existing_count THEN
      SELECT l.id, l.created_at INTO v_dup_id, v_dup_created_at
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.conta_id = p_conta_id
        AND l.tipo = p_tipo
        AND l.valor = p_valor
        AND l.data_pagamento = p_data
        AND regexp_replace(lower(public.immutable_unaccent(btrim(l.descricao))), '\s+', ' ', 'g') = v_descricao_normalizada
        AND l.origem IN ('conciliacao', 'espelho_cp', 'espelho_cr')
      ORDER BY l.created_at ASC
      OFFSET v_occurrence_index
      LIMIT 1;

      IF v_dup_id IS NOT NULL THEN
        RETURN jsonb_build_object(
          'status', 'possible_duplicate',
          'lancamento_id', v_dup_id,
          'criado_em', v_dup_created_at
        );
      END IF;
    END IF;
  END IF;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) = 1 THEN
    v_cat_id := NULLIF(p_rateio_linhas->0->>'categoria_id', '')::uuid;
    v_cc_id := NULLIF(p_rateio_linhas->0->>'centro_custo_id', '')::uuid;
  END IF;

  BEGIN
    INSERT INTO public.fin_lancamentos (
      tipo, valor, data_competencia, data_pagamento, descricao, conta_id,
      forma_pagamento, status, conciliado, conciliado_em, conciliado_por,
      created_by, idempotency_key, company_id, origem, categoria_id, centro_custo_id
    ) VALUES (
      p_tipo, p_valor, v_competencia, p_data, p_descricao, p_conta_id,
      'extrato', 'REALIZADO', true, now(), v_uid,
      v_uid, v_idem_key, v_company, 'conciliacao', v_cat_id, v_cc_id
    ) RETURNING id INTO v_lancamento_id;
  EXCEPTION WHEN unique_violation THEN
    -- Outra chamada com a mesma chave gravou entre o SELECT acima e este INSERT:
    -- é a mesma linha do extrato, então vale o mesmo retorno do caminho rápido.
    GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
    IF v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
      RAISE;
    END IF;
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_idem_key AND company_id = v_company;
    IF v_lancamento_id IS NULL THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
  END;

  IF p_rateio_linhas IS NOT NULL AND jsonb_array_length(p_rateio_linhas) > 0 THEN
    FOR v_rateio_item IN SELECT * FROM jsonb_array_elements(p_rateio_linhas) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id, cmv_incluir
      ) VALUES (
        v_lancamento_id, (v_rateio_item->>'categoria_id')::uuid,
        NULLIF(v_rateio_item->>'centro_custo_id', '')::uuid,
        (v_rateio_item->>'valor')::numeric, (v_rateio_item->>'percentual')::numeric,
        v_rateio_item->>'observacao', v_company,
        -- Só despesa entra no CMV financeiro; sem resposta = pendente.
        CASE WHEN p_tipo = 'DESPESA' AND jsonb_typeof(v_rateio_item->'cmv_incluir') = 'boolean'
          THEN (v_rateio_item->>'cmv_incluir')::boolean END
      );
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_lancamento_id, 'reconcile_import', v_uid, v_company,
    jsonb_build_object('valor', p_valor, 'tipo', p_tipo, 'data', p_data, 'data_competencia', v_competencia,
      'descricao', p_descricao, 'categoria_id', v_cat_id, 'rateios', p_rateio_linhas,
      'external_id_used', v_external_id IS NOT NULL, 'category_validation', 'passed',
      'force_duplicate', p_force_duplicate, 'occurrence_index', v_occurrence_index));
  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) TO authenticated, service_role;

-- Força a resolução das assinaturas e das colunas na aplicação da migration.
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
  v_signature regprocedure;
BEGIN
  v_signature := 'public.reconcile_bind_extrato(uuid,text,text,uuid)'::regprocedure;
  v_signature := 'public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer,date)'::regprocedure;

  PERFORM l.id, l.company_id, l.tipo, l.conta_id, l.conta_destino_id, l.idempotency_key
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel;

  PERFORM v.company_id, v.conta_id, v.external_id, v.tipo, v.lancamento_id, v.created_by
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_sentinel;
END $$;

-- Teste da migration 20261010160000_conciliacao_vinculo_unico_por_lancamento
--
-- Rodar no SQL Editor ANTES e DEPOIS de aplicar a migration (colar o arquivo
-- inteiro e "Run"; se aparecer o aviso "Potential issues", usar "Run without RLS").
-- Cria as versões novas de reconcile_bind_extrato e reconcile_import_lancamento
-- como cópias temporárias (pg_temp.vu_bind e pg_temp.vu_import), monta
-- lançamentos de teste numa empresa real escolhida pelo próprio script e roda
-- os mesmos cenários contra as cópias e contra as funções publicadas. Cada
-- chamada é desfeita logo depois, e o script termina SEMPRE com erro trazendo o
-- relatório: a transação inteira é desfeita, nada fica gravado.
--
-- Resultado esperado ANTES de aplicar: "TESTE OK — N ok, 0 falha(s)"; nas linhas
-- "publicada" os cenários B1 (2º FITID no mesmo lançamento) e I1 (2ª linha igual
-- promovendo o legado da 1ª) mostram o defeito, e o G aparece como PULADO.
-- Resultado esperado DEPOIS de aplicar: "TESTE OK", as linhas "publicada" iguais
-- às da cópia nova e o G (grants) OK.
-- Qualquer "FALHA" ou "TESTE NÃO RODOU": não aplicar (ou reverter) a migration.

CREATE OR REPLACE FUNCTION pg_temp.vu_bind(p_conta_id uuid, p_external_id text, p_tipo text, p_lancamento_id uuid)
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

CREATE OR REPLACE FUNCTION pg_temp.vu_import(
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

-- Executa a chamada, devolve "status|lancamento_id" (ou "ERRO <código>") e desfaz
-- o que ela gravou, para um cenário não contaminar o seguinte.
CREATE OR REPLACE FUNCTION pg_temp.vu_tentar(p_sql text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_ret jsonb;
BEGIN
  BEGIN
    EXECUTE p_sql INTO v_ret;
    RAISE EXCEPTION 'VUT_DESFAZ:%', COALESCE(v_ret->>'status', '?') || '|' || COALESCE(v_ret->>'lancamento_id', '');
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'VUT_DESFAZ:%' THEN
      RETURN substr(SQLERRM, 12);
    END IF;
    RETURN 'ERRO ' || split_part(SQLERRM, ':', 1);
  END;
END;
$$;

DO $teste$
DECLARE
  v_company uuid;
  v_user uuid;
  v_conta uuid;
  v_outra uuid;
  v_cat uuid;
  d0 date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10;
  v_l uuid;
  v_l2 uuid;
  v_t uuid;
  v_z1 uuid;
  v_z2 uuid;
  v_z3 uuid;
  v_rateio jsonb;
  v_nomes text[];
  v_cenarios jsonb := '[]'::jsonb;
  c jsonb;
  i int;
  v_alvo text;
  v_sql text;
  v_obtido text;
  v_nova text;
  rel text := '';
  falhas int := 0;
  ok int := 0;
BEGIN
  -- Empresa com duas contas ativas, categoria de despesa e um membro ativo com
  -- permissão de conciliar.
  FOR v_company, v_user IN
    SELECT m.company_id, m.user_id
    FROM public.company_memberships m
    WHERE m.status = 'active'
      AND (SELECT count(*) FROM public.fin_contas c2 WHERE c2.company_id = m.company_id AND c2.ativo IS NOT FALSE) >= 2
      AND EXISTS (SELECT 1 FROM public.fin_categorias fc WHERE fc.company_id = m.company_id AND fc.ativo AND fc.tipo = 'despesa')
    ORDER BY m.company_id, m.user_id
  LOOP
    PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
    PERFORM set_config('request.headers', json_build_object('x-company-id', v_company)::text, true);
    BEGIN
      IF public.get_current_company_id() = v_company
         AND public.has_any_permission(v_user, ARRAY['financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage']) THEN
        EXIT;
      END IF;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
    v_company := NULL;
  END LOOP;

  IF v_company IS NULL THEN
    RAISE EXCEPTION 'TESTE NÃO RODOU: nenhuma empresa com 2 contas, categoria de despesa e usuário com permissão de conciliar';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', json_build_object('x-company-id', v_company)::text, true);

  SELECT c2.id INTO v_conta FROM public.fin_contas c2
  WHERE c2.company_id = v_company AND c2.ativo IS NOT FALSE ORDER BY c2.created_at, c2.id LIMIT 1;
  SELECT c2.id INTO v_outra FROM public.fin_contas c2
  WHERE c2.company_id = v_company AND c2.ativo IS NOT FALSE AND c2.id <> v_conta ORDER BY c2.created_at, c2.id LIMIT 1;
  SELECT fc.id INTO v_cat FROM public.fin_categorias fc
  WHERE fc.company_id = v_company AND fc.ativo AND fc.tipo = 'despesa' ORDER BY fc.id LIMIT 1;

  rel := format(E'\nempresa %s · usuário %s · conta %s · outra %s', v_company, v_user, v_conta, v_outra);

  -- Valores fora do comum para não competir com lançamentos reais.
  -- L: despesa já vinculada ao FITID VUT-F1 nesta conta. L2: despesa sem vínculo.
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, created_by)
  VALUES (v_company, 'DESPESA', 'REALIZADO', 98712.01, v_conta, d0, d0, 'VUT L', 'conciliacao', true, v_cat, v_user)
  RETURNING id INTO v_l;
  INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id, created_by)
  VALUES (v_company, v_conta, 'VUT-F1', 'DESPESA', v_l, v_user);
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, created_by)
  VALUES (v_company, 'DESPESA', 'REALIZADO', 98712.02, v_conta, d0, d0, 'VUT L2', 'conciliacao', true, v_cat, v_user)
  RETURNING id INTO v_l2;
  -- T: transferência outra → conta, vinculada só na conta de origem.
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, conta_destino_id, data_competencia,
    data_pagamento, descricao, origem, conciliado, created_by)
  VALUES (v_company, 'TRANSFERENCIA', 'REALIZADO', 98712.03, v_outra, v_conta, d0, d0, 'VUT T', 'transferencia', true, v_user)
  RETURNING id INTO v_t;
  INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id, created_by)
  VALUES (v_company, v_outra, 'VUT-ORIGEM', 'DESPESA', v_t, v_user);

  -- Z1, Z2, Z3: lançamentos gravados antes do FITID (chave legada = conteúdo da 1ª ocorrência).
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, created_by, idempotency_key)
  VALUES (v_company, 'DESPESA', 'REALIZADO', 98712.11, v_conta, d0, d0, 'VUT IMPORT 1', 'conciliacao', true, v_cat, v_user,
    md5(v_company::text || d0::text || 'VUT IMPORT 1' || (98712.11)::numeric::text || 'DESPESA' || v_conta::text))
  RETURNING id INTO v_z1;
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, created_by, idempotency_key)
  VALUES (v_company, 'DESPESA', 'REALIZADO', 98712.12, v_conta, d0, d0, 'VUT IMPORT 2', 'conciliacao', true, v_cat, v_user,
    md5(v_company::text || d0::text || 'VUT IMPORT 2' || (98712.12)::numeric::text || 'DESPESA' || v_conta::text))
  RETURNING id INTO v_z2;
  INSERT INTO public.fin_lancamentos (company_id, tipo, status, valor, conta_id, data_competencia, data_pagamento,
    descricao, origem, conciliado, categoria_id, created_by, idempotency_key)
  VALUES (v_company, 'DESPESA', 'REALIZADO', 98712.13, v_conta, d0, d0, 'VUT IMPORT 3', 'conciliacao', true, v_cat, v_user,
    md5(v_company::text || d0::text || 'VUT IMPORT 3' || (98712.13)::numeric::text || 'DESPESA' || v_conta::text))
  RETURNING id INTO v_z3;
  INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id, created_by)
  VALUES (v_company, v_conta, 'VUT-Z3-OUTRO', 'DESPESA', v_z3, v_user);

  v_nomes := ARRAY[v_l::text, 'L', v_l2::text, 'L2', v_t::text, 'T', v_z1::text, 'Z1', v_z2::text, 'Z2', v_z3::text, 'Z3'];
  v_rateio := jsonb_build_array(jsonb_build_object('categoria_id', v_cat, 'percentual', 100, 'observacao', 'VUT'));

  -- Cenários: SQL com %1$s no lugar da função alvo e o resultado esperado da versão nova.
  v_cenarios := jsonb_build_array(
    jsonb_build_object('id', 'B1', 'nome', '2º FITID no lançamento já vinculado nesta conta: recusa', 'tipo', 'bind',
      'sql', format('SELECT %%1$s(%L::uuid, %L, %L, %L::uuid)', v_conta, 'VUT-F2', 'DESPESA', v_l),
      'esperado', 'ERRO LANCAMENTO_JA_VINCULADO'),
    jsonb_build_object('id', 'B2', 'nome', 'reenvio do mesmo FITID para o mesmo lançamento: idempotente', 'tipo', 'bind',
      'sql', format('SELECT %%1$s(%L::uuid, %L, %L, %L::uuid)', v_conta, 'VUT-F1', 'DESPESA', v_l),
      'esperado', 'ok|L'),
    jsonb_build_object('id', 'B3', 'nome', 'FITID já vinculado a outro lançamento: recusa', 'tipo', 'bind',
      'sql', format('SELECT %%1$s(%L::uuid, %L, %L, %L::uuid)', v_conta, 'VUT-F1', 'DESPESA', v_l2),
      'esperado', 'ERRO EXTERNAL_ID_CONFLICT'),
    jsonb_build_object('id', 'B4', 'nome', 'perna de destino da transferência vinculada só na origem: vincula', 'tipo', 'bind',
      'sql', format('SELECT %%1$s(%L::uuid, %L, %L, %L::uuid)', v_conta, 'VUT-F3', 'RECEITA', v_t),
      'esperado', 'ok|T'),
    jsonb_build_object('id', 'B5', 'nome', 'lançamento sem vínculo: vincula', 'tipo', 'bind',
      'sql', format('SELECT %%1$s(%L::uuid, %L, %L, %L::uuid)', v_conta, 'VUT-F4', 'DESPESA', v_l2),
      'esperado', 'ok|L2'),
    jsonb_build_object('id', 'I1', 'nome', '2ª linha igual (ocorrência 1) com FITID não promove o legado da 1ª: cria', 'tipo', 'import',
      'sql', format('SELECT %%1$s(%L::date, %L, %s::numeric, %L, %L::uuid, %L::uuid, %L::jsonb, %L, false, 1, NULL::date)',
        d0, 'VUT IMPORT 1', '98712.11', 'DESPESA', v_conta, v_user,
        jsonb_set(v_rateio, '{0,valor}', to_jsonb(98712.11)), 'VUT-I1'),
      'esperado', 'ok|novo'),
    jsonb_build_object('id', 'I2', 'nome', '1ª linha (ocorrência 0) com FITID promove o legado, como antes', 'tipo', 'import',
      'sql', format('SELECT %%1$s(%L::date, %L, %s::numeric, %L, %L::uuid, %L::uuid, %L::jsonb, %L, false, 0, NULL::date)',
        d0, 'VUT IMPORT 2', '98712.12', 'DESPESA', v_conta, v_user,
        jsonb_set(v_rateio, '{0,valor}', to_jsonb(98712.12)), 'VUT-I2'),
      'esperado', 'duplicate|Z2'),
    jsonb_build_object('id', 'I3', 'nome', 'legado já vinculado a outro FITID não é promovido: possível duplicata', 'tipo', 'import',
      'sql', format('SELECT %%1$s(%L::date, %L, %s::numeric, %L, %L::uuid, %L::uuid, %L::jsonb, %L, false, 0, NULL::date)',
        d0, 'VUT IMPORT 3', '98712.13', 'DESPESA', v_conta, v_user,
        jsonb_set(v_rateio, '{0,valor}', to_jsonb(98712.13)), 'VUT-I3'),
      'esperado', 'possible_duplicate|Z3')
  );

  FOR c IN SELECT value FROM jsonb_array_elements(v_cenarios)
  LOOP
    FOREACH v_alvo IN ARRAY CASE WHEN c->>'tipo' = 'bind'
      THEN ARRAY['pg_temp.vu_bind', 'public.reconcile_bind_extrato']
      ELSE ARRAY['pg_temp.vu_import', 'public.reconcile_import_lancamento'] END
    LOOP
      v_sql := format(c->>'sql', v_alvo);
      v_obtido := pg_temp.vu_tentar(v_sql);
      FOR i IN 1 .. array_length(v_nomes, 1) BY 2 LOOP
        v_obtido := replace(v_obtido, v_nomes[i], v_nomes[i + 1]);
      END LOOP;
      v_obtido := regexp_replace(v_obtido, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', 'novo');

      IF v_alvo LIKE 'pg_temp.%' THEN
        -- Versão nova (cópia temporária): conta no resultado.
        v_nova := v_obtido;
        IF v_obtido = c->>'esperado' THEN
          ok := ok + 1; rel := rel || format(E'\nOK    %s nova: %s', c->>'id', c->>'nome');
        ELSE
          falhas := falhas + 1; rel := rel || format(E'\nFALHA %s nova: esperado %s, obtido %s', c->>'id', c->>'esperado', v_obtido);
        END IF;
      ELSE
        -- Função publicada: informativo antes de aplicar; depois de aplicar tem que bater.
        rel := rel || format(E'\n      %s publicada: %s%s', c->>'id', v_obtido,
          CASE WHEN v_obtido = c->>'esperado' THEN ' (igual à nova)' ELSE ' (DIFERENTE da nova)' END);
      END IF;
    END LOOP;
  END LOOP;

  -- Sem acesso à empresa: recusa.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    v_obtido := pg_temp.vu_tentar(format('SELECT pg_temp.vu_bind(%L::uuid, %L, %L, %L::uuid)', v_conta, 'VUT-F5', 'DESPESA', v_l2));
    IF v_obtido LIKE 'ERRO %' THEN
      ok := ok + 1; rel := rel || E'\nOK    P  usuário sem acesso recusado: ' || v_obtido;
    ELSE
      falhas := falhas + 1; rel := rel || E'\nFALHA P  usuário sem acesso deveria ser recusado: ' || v_obtido;
    END IF;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- G: grants das funções publicadas (só depois de aplicar a migration).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reconcile_bind_extrato'
      AND pg_get_functiondef(p.oid) LIKE '%LANCAMENTO_JA_VINCULADO%'
  ) THEN
    rel := rel || E'\nPULADO G  grants: migration ainda não aplicada';
  ELSIF NOT has_function_privilege('anon', 'public.reconcile_bind_extrato(uuid,text,text,uuid)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.reconcile_bind_extrato(uuid,text,text,uuid)', 'EXECUTE')
        AND NOT has_function_privilege('anon', 'public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer,date)', 'EXECUTE')
        AND has_function_privilege('authenticated', 'public.reconcile_import_lancamento(date,text,numeric,text,uuid,uuid,jsonb,text,boolean,integer,date)', 'EXECUTE') THEN
    ok := ok + 1; rel := rel || E'\nOK    G  anon sem EXECUTE, authenticated com EXECUTE nas duas funções';
  ELSE
    falhas := falhas + 1; rel := rel || E'\nFALHA G  grants das funções publicadas';
  END IF;

  -- Sempre termina em erro: desfaz tudo o que o teste gravou.
  RAISE EXCEPTION '% — % ok, % falha(s)%',
    CASE WHEN falhas = 0 THEN 'TESTE OK' ELSE 'TESTE COM FALHA' END, ok, falhas, rel;
END;
$teste$;

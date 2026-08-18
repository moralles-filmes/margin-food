-- Corrige `function min(uuid) does not exist` (SQLSTATE 42883) nas duas RPCs de
-- transferência entre contas.
--
-- Ambas usam o mesmo padrão para escolher a transferência candidata mais
-- próxima em data e recusar reconhecimento quando há empate:
--
--   SELECT count(*)::integer, min(n.id) INTO v_count, v_id FROM nearest n;
--
-- `min()` no Postgres não tem sobrecarga para `uuid` (não há operator class de
-- ordenação btree padrão exposta como agregado para esse tipo), então a query
-- falha na resolução da função — sempre, mesmo com zero candidatos, porque o
-- erro ocorre no parse/plan e não na execução linha a linha. Efeito em produção:
--   * reconcile_create_transfer            → botão "Transf." do extrato quebrado;
--   * reconcile_auto_bind_transfer_counterparts → reconhecimento automático da
--     contrapartida no extrato da segunda conta nunca rodava (falha calada +
--     toast "reconhecimento automático indisponível").
--
-- Substituído por `(array_agg(n.id ORDER BY n.id))[1]`: `array_agg` aceita uuid,
-- o ORDER BY torna a escolha determinística e o resultado é idêntico ao que
-- `min()` retornaria. A semântica de desempate continua a mesma — o id só é
-- usado quando `count(*) = 1`, ou seja, quando o candidato é inequívoco.

CREATE OR REPLACE FUNCTION public.reconcile_create_transfer(
  p_data date,
  p_valor numeric,
  p_descricao text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lancamento_id uuid;
  v_nome_origem text;
  v_nome_destino text;
  v_existing_id uuid;
  v_existing_count integer;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF p_valor IS NULL OR p_valor <= 0 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: valor deve ser maior que zero';
  END IF;

  IF p_conta_origem_id = p_conta_destino_id THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: contas de origem e destino devem ser diferentes';
  END IF;

  SELECT c.nome INTO v_nome_origem
  FROM public.fin_contas c
  WHERE c.id = p_conta_origem_id AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta de origem';
  END IF;

  SELECT c.nome INTO v_nome_destino
  FROM public.fin_contas c
  WHERE c.id = p_conta_destino_id AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta de destino';
  END IF;

  -- Serializa por par de contas (ordem-independente) para impedir que duas
  -- conciliações concorrentes — uma em cada extremidade da transferência —
  -- criem duplicidade em corrida entre a checagem abaixo e o INSERT.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_company::text || ':transfer:' ||
      least(p_conta_origem_id::text, p_conta_destino_id::text) || ':' ||
      greatest(p_conta_origem_id::text, p_conta_destino_id::text),
      0
    )
  );

  WITH candidates AS (
    SELECT l.id, abs(l.data_competencia - p_data) AS date_distance
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company
      AND l.tipo = 'TRANSFERENCIA'
      AND l.status = 'REALIZADO'
      AND l.conta_id = p_conta_origem_id
      AND l.conta_destino_id = p_conta_destino_id
      AND l.valor = p_valor
      AND l.data_competencia BETWEEN (p_data - 3) AND (p_data + 3)
  ), nearest AS (
    SELECT c.id
    FROM candidates c
    WHERE c.date_distance = (SELECT min(c2.date_distance) FROM candidates c2)
  )
  SELECT count(*)::integer, (array_agg(n.id ORDER BY n.id))[1]
  INTO v_existing_count, v_existing_id
  FROM nearest n;

  IF v_existing_count = 1 AND v_existing_id IS NOT NULL THEN
    RETURN jsonb_build_object('status', 'existing', 'lancamento_id', v_existing_id);
  END IF;

  INSERT INTO public.fin_lancamentos (
    tipo, valor, data_competencia, data_pagamento,
    descricao, conta_id, conta_destino_id,
    status, forma_pagamento, conciliado, conciliado_em, conciliado_por,
    created_by, company_id, origem
  )
  VALUES (
    'TRANSFERENCIA', p_valor, p_data, p_data,
    COALESCE(NULLIF(btrim(p_descricao), ''), format('Transferência: %s → %s', v_nome_origem, v_nome_destino)),
    p_conta_origem_id, p_conta_destino_id,
    'REALIZADO', 'TRANSFERENCIA', true, now(), v_uid,
    v_uid, v_company, 'transferencia'
  )
  RETURNING id INTO v_lancamento_id;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, user_id, company_id, depois
  )
  VALUES (
    'transferencia', v_lancamento_id, 'reconcile_transfer', v_uid, v_company,
    jsonb_build_object(
      'lancamento_id', v_lancamento_id,
      'origem', p_conta_origem_id,
      'destino', p_conta_destino_id,
      'valor', p_valor,
      'data', p_data,
      'modelo', 'registro_unico'
    )
  );

  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_auto_bind_transfer_counterparts(
  p_conta_id uuid,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_line jsonb;
  v_external_id text;
  v_tipo text;
  v_data date;
  v_valor numeric;
  v_lancamento_id uuid;
  v_candidate_count integer;
  v_matched_external_ids jsonb := '[]'::jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: p_lines deve ser um array';
  END IF;
  IF jsonb_array_length(p_lines) > 5000 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: máximo de 5000 linhas por importação';
  END IF;

  PERFORM 1
  FROM public.fin_contas c
  WHERE c.id = p_conta_id
    AND c.company_id = v_company;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária';
  END IF;

  -- Serializa o reconhecimento por tenant/conta para impedir que duas
  -- importações concorrentes consumam a mesma contrapartida.
  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company::text || ':' || p_conta_id::text, 0)
  );

  FOR v_line IN SELECT value FROM jsonb_array_elements(p_lines)
  LOOP
    v_external_id := NULLIF(btrim(v_line->>'external_id'), '');
    v_tipo := v_line->>'tipo';

    IF v_external_id IS NULL OR length(v_external_id) > 512
       OR v_tipo NOT IN ('RECEITA', 'DESPESA')
       OR (v_line->>'data') IS NULL
       OR (v_line->>'valor') IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      v_data := (v_line->>'data')::date;
      v_valor := (v_line->>'valor')::numeric;
    EXCEPTION WHEN invalid_text_representation OR datetime_field_overflow THEN
      CONTINUE;
    END;

    IF v_valor <= 0 THEN
      CONTINUE;
    END IF;

    -- Reimportação: o vínculo desta própria conta já é suficiente.
    SELECT v.lancamento_id INTO v_lancamento_id
    FROM public.fin_conciliacao_vinculos v
    WHERE v.company_id = v_company
      AND v.conta_id = p_conta_id
      AND v.external_id = v_external_id
      AND v.tipo = v_tipo;

    IF v_lancamento_id IS NOT NULL THEN
      v_matched_external_ids := v_matched_external_ids || jsonb_build_array(v_external_id);
      CONTINUE;
    END IF;

    v_lancamento_id := NULL;
    v_candidate_count := 0;

    WITH candidates AS (
      SELECT
        l.id,
        abs(l.data_competencia - v_data) AS date_distance
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company
        AND l.tipo = 'TRANSFERENCIA'
        AND l.status = 'REALIZADO'
        AND l.valor = v_valor
        AND l.data_competencia BETWEEN (v_data - 3) AND (v_data + 3)
        AND (
          (v_tipo = 'DESPESA' AND l.conta_id = p_conta_id)
          OR
          (v_tipo = 'RECEITA' AND l.conta_destino_id = p_conta_id)
        )
        AND EXISTS (
          SELECT 1
          FROM public.fin_conciliacao_vinculos source_link
          WHERE source_link.company_id = v_company
            AND source_link.lancamento_id = l.id
            AND source_link.conta_id <> p_conta_id
        )
        AND NOT EXISTS (
          SELECT 1
          FROM public.fin_conciliacao_vinculos target_link
          WHERE target_link.company_id = v_company
            AND target_link.lancamento_id = l.id
            AND target_link.conta_id = p_conta_id
        )
    ), nearest AS (
      SELECT c.id
      FROM candidates c
      WHERE c.date_distance = (SELECT min(c2.date_distance) FROM candidates c2)
    )
    SELECT count(*)::integer, (array_agg(n.id ORDER BY n.id))[1]
    INTO v_candidate_count, v_lancamento_id
    FROM nearest n;

    IF v_candidate_count <> 1 OR v_lancamento_id IS NULL THEN
      CONTINUE;
    END IF;

    INSERT INTO public.fin_conciliacao_vinculos (
      company_id, conta_id, external_id, tipo, lancamento_id, created_by
    ) VALUES (
      v_company, p_conta_id, v_external_id, v_tipo, v_lancamento_id, v_uid
    )
    ON CONFLICT (company_id, conta_id, external_id, tipo)
    DO NOTHING;

    v_matched_external_ids := v_matched_external_ids || jsonb_build_array(v_external_id);
  END LOOP;

  RETURN jsonb_build_object(
    'status', 'ok',
    'matched_external_ids', v_matched_external_ids,
    'matched_count', jsonb_array_length(v_matched_external_ids)
  );
END;
$$;

-- Força a resolução das colunas durante o db push e prova que o agregado sobre
-- uuid resolve — se `min(uuid)` voltasse, este bloco falharia no deploy em vez
-- de na primeira chamada real do usuário.
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
  v_count integer;
  v_id uuid;
BEGIN
  WITH candidates AS (
    SELECT l.id, abs(l.data_competencia - CURRENT_DATE) AS date_distance
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_sentinel
      AND l.tipo = 'TRANSFERENCIA'
      AND l.status = 'REALIZADO'
      AND l.conta_id IS NOT NULL
      AND l.conta_destino_id IS NOT NULL
  ), nearest AS (
    SELECT c.id FROM candidates c
    WHERE c.date_distance = (SELECT min(c2.date_distance) FROM candidates c2)
  )
  SELECT count(*)::integer, (array_agg(n.id ORDER BY n.id))[1]
  INTO v_count, v_id
  FROM nearest n;

  PERFORM v.lancamento_id, v.conta_id, v.external_id, v.tipo
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_sentinel;
END $$;

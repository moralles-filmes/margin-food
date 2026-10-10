-- Teste da migration 20261010150000_conciliacao_auto_bind_transferencia_mutua
--
-- Rodar no SQL Editor ANTES e DEPOIS de aplicar a migration (colar o arquivo
-- inteiro e "Run"; se aparecer o aviso "Potential issues", usar "Run without RLS").
-- Cria a versão nova de reconcile_auto_bind_transfer_counterparts como cópia
-- temporária (pg_temp.abtc_nova), monta transferências de teste numa empresa real
-- escolhida pelo próprio script e roda os mesmos cenários contra a cópia nova e
-- contra a função publicada. Termina SEMPRE com erro trazendo o relatório: a
-- transação inteira é desfeita — nenhum lançamento, vínculo ou saldo fica gravado.
--
-- Resultado esperado ANTES de aplicar: "TESTE OK — N ok, 0 falha(s)"; nas linhas
-- "publicada" os cenários A, B e I mostram o defeito (vínculo na linha errada, no
-- empate, fora do período), o V aparece como erro (a data 'abc' derrubava o lote
-- inteiro) e o G aparece como PULADO.
-- Resultado esperado DEPOIS de aplicar: "TESTE OK" e as linhas "publicada" iguais
-- às da cópia nova, com o G (grants) OK.
-- Qualquer "FALHA" ou "TESTE NÃO RODOU": não aplicar (ou reverter) a migration.

CREATE OR REPLACE FUNCTION pg_temp.abtc_nova(p_conta_id uuid, p_lines jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_line jsonb;
  v_external_id text;
  v_tipo text;
  v_data date;
  v_valor numeric;
  -- Linhas sem vínculo nesta conta, em arrays paralelos (array_append estende no
  -- lugar; concatenar jsonb recopiaria o lote a cada linha).
  v_livres_external_id text[] := '{}';
  v_livres_tipo text[] := '{}';
  v_livres_data date[] := '{}';
  v_livres_valor numeric[] := '{}';
  v_periodo_inicio date;
  v_periodo_fim date;
  v_vinculados jsonb;
  v_matched_external_ids jsonb := '[]'::jsonb;
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

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company::text || ':' || p_conta_id::text, 0)
  );

  -- Validação linha a linha; a linha inválida é pulada (nunca derruba o lote) e a
  -- que já tem vínculo nesta conta só entra no retorno, fora da disputa pelas
  -- transferências.
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
    EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format
                OR datetime_field_overflow OR numeric_value_out_of_range THEN
      CONTINUE;
    END;

    IF v_valor <= 0 OR v_valor IN ('NaN'::numeric, 'Infinity'::numeric) OR NOT isfinite(v_data) THEN
      CONTINUE;
    END IF;

    -- O período conta também as linhas já vinculadas: são do mesmo arquivo.
    v_periodo_inicio := LEAST(v_periodo_inicio, v_data);
    v_periodo_fim := GREATEST(v_periodo_fim, v_data);

    IF EXISTS (
      SELECT 1
      FROM public.fin_conciliacao_vinculos v
      WHERE v.company_id = v_company
        AND v.conta_id = p_conta_id
        AND v.external_id = v_external_id
        AND v.tipo = v_tipo
    ) THEN
      v_matched_external_ids := v_matched_external_ids || jsonb_build_array(v_external_id);
      CONTINUE;
    END IF;

    v_livres_external_id := array_append(v_livres_external_id, v_external_id);
    v_livres_tipo := array_append(v_livres_tipo, v_tipo);
    v_livres_data := array_append(v_livres_data, v_data);
    v_livres_valor := array_append(v_livres_valor, v_valor);
  END LOOP;

  WITH linhas AS (
    -- O mesmo FITID repetido no lote disputa uma vez só.
    SELECT DISTINCT ON (l.external_id, l.tipo) l.external_id, l.tipo, l.data, l.valor
    FROM unnest(v_livres_external_id, v_livres_tipo, v_livres_data, v_livres_valor)
      AS l(external_id, tipo, data, valor)
    ORDER BY l.external_id, l.tipo, l.data, l.valor
  ), pares AS (
    SELECT
      li.external_id,
      li.tipo,
      t.id AS lancamento_id,
      abs(t.data_competencia - li.data) AS distancia
    FROM linhas li
    JOIN public.fin_lancamentos t
      ON t.company_id = v_company
     AND t.tipo = 'TRANSFERENCIA'
     AND t.status = 'REALIZADO'
     AND t.valor = li.valor
     AND t.data_competencia BETWEEN (li.data - 3) AND (li.data + 3)
     AND t.data_competencia BETWEEN v_periodo_inicio AND v_periodo_fim
     AND (
       (li.tipo = 'DESPESA' AND t.conta_id = p_conta_id)
       OR
       (li.tipo = 'RECEITA' AND t.conta_destino_id = p_conta_id)
     )
    WHERE EXISTS (
        SELECT 1
        FROM public.fin_conciliacao_vinculos source_link
        WHERE source_link.company_id = v_company
          AND source_link.lancamento_id = t.id
          AND source_link.conta_id <> p_conta_id
      )
      AND NOT EXISTS (
        SELECT 1
        FROM public.fin_conciliacao_vinculos target_link
        WHERE target_link.company_id = v_company
          AND target_link.lancamento_id = t.id
          AND target_link.conta_id = p_conta_id
      )
  ), ranqueados AS (
    SELECT
      p.external_id,
      p.tipo,
      p.lancamento_id,
      rank() OVER (PARTITION BY p.external_id, p.tipo ORDER BY p.distancia) AS posicao_na_linha,
      count(*) OVER (PARTITION BY p.external_id, p.tipo, p.distancia) AS empates_na_linha,
      rank() OVER (PARTITION BY p.lancamento_id ORDER BY p.distancia) AS posicao_na_transferencia,
      count(*) OVER (PARTITION BY p.lancamento_id, p.distancia) AS empates_na_transferencia
    FROM pares p
  ), escolhidos AS (
    SELECT r.external_id, r.tipo, r.lancamento_id
    FROM ranqueados r
    WHERE r.posicao_na_linha = 1
      AND r.empates_na_linha = 1
      AND r.posicao_na_transferencia = 1
      AND r.empates_na_transferencia = 1
  ), inseridos AS (
    INSERT INTO public.fin_conciliacao_vinculos (
      company_id, conta_id, external_id, tipo, lancamento_id, created_by
    )
    SELECT v_company, p_conta_id, e.external_id, e.tipo, e.lancamento_id, v_uid
    FROM escolhidos e
    ON CONFLICT (company_id, conta_id, external_id, tipo)
    DO NOTHING
    RETURNING external_id
  )
  SELECT COALESCE(jsonb_agg(i.external_id), '[]'::jsonb)
  INTO v_vinculados
  FROM inseridos i;

  v_matched_external_ids := v_matched_external_ids || v_vinculados;

  RETURN jsonb_build_object(
    'status', 'ok',
    'matched_external_ids', v_matched_external_ids,
    'matched_count', jsonb_array_length(v_matched_external_ids)
  );
END;
$function$;

-- Transferência REALIZADA origem → destino, já vinculada na conta de origem
-- (como fica depois de importar o extrato da origem).
CREATE OR REPLACE FUNCTION pg_temp.abtc_transferencia(
  p_company uuid, p_user uuid, p_origem uuid, p_destino uuid,
  p_valor numeric, p_data date, p_rotulo text, p_com_vinculo_origem boolean DEFAULT true
)
RETURNS uuid
LANGUAGE plpgsql
AS $$
DECLARE
  v_id uuid;
BEGIN
  INSERT INTO public.fin_lancamentos (
    company_id, tipo, status, valor, conta_id, conta_destino_id,
    data_competencia, data_pagamento, descricao, origem, conciliado, created_by
  ) VALUES (
    p_company, 'TRANSFERENCIA', 'REALIZADO', p_valor, p_origem, p_destino,
    p_data, p_data, 'ABTC ' || p_rotulo, 'transferencia', true, p_user
  )
  RETURNING id INTO v_id;
  IF p_com_vinculo_origem THEN
    INSERT INTO public.fin_conciliacao_vinculos (company_id, conta_id, external_id, tipo, lancamento_id, created_by)
    VALUES (p_company, p_origem, 'ABTC-ORIGEM-' || p_rotulo, 'DESPESA', v_id, p_user);
  END IF;
  RETURN v_id;
END;
$$;

-- Roda a função alvo e devolve os vínculos que ela gravou na conta de destino
-- ("FITID>transferência", em ordem); limpa os vínculos para o próximo cenário.
CREATE OR REPLACE FUNCTION pg_temp.abtc_rodar(p_alvo text, p_conta uuid, p_lines jsonb, p_limpar boolean DEFAULT true)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_retorno jsonb;
  v_vinculos text;
BEGIN
  EXECUTE format('SELECT %s($1, $2)', p_alvo) INTO v_retorno USING p_conta, p_lines;
  SELECT COALESCE(string_agg(v.external_id || '>' || replace(l.descricao, 'ABTC ', ''), ',' ORDER BY v.external_id), '-')
  INTO v_vinculos
  FROM public.fin_conciliacao_vinculos v
  JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
  WHERE v.conta_id = p_conta AND v.external_id LIKE 'ABTC-%';
  IF p_limpar THEN
    DELETE FROM public.fin_conciliacao_vinculos WHERE conta_id = p_conta AND external_id LIKE 'ABTC-%';
  END IF;
  RETURN v_vinculos;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.abtc_linha(p_fitid text, p_tipo text, p_data date, p_valor numeric)
RETURNS jsonb
LANGUAGE sql
AS $$
  SELECT jsonb_build_object('external_id', p_fitid, 'tipo', p_tipo, 'data', p_data, 'valor', p_valor);
$$;

DO $teste$
DECLARE
  v_company uuid;
  v_user uuid;
  v_origem uuid;
  v_destino uuid;
  d0 date := (now() AT TIME ZONE 'America/Sao_Paulo')::date - 10;
  v_assinatura text := 'public.reconcile_auto_bind_transfer_counterparts(uuid,jsonb)';
  v_cenarios jsonb := '[]'::jsonb;
  c jsonb;
  v_alvo text;
  v_obtido text;
  v_retorno jsonb;
  v_qtd int;
  rel text := '';
  falhas int := 0;
  ok int := 0;
BEGIN
  -- Empresa com duas contas ativas e um membro ativo com permissão de conciliar.
  FOR v_company, v_user IN
    SELECT m.company_id, m.user_id
    FROM public.company_memberships m
    WHERE m.status = 'active'
      AND (SELECT count(*) FROM public.fin_contas c2 WHERE c2.company_id = m.company_id AND c2.ativo IS NOT FALSE) >= 2
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
    RAISE EXCEPTION 'TESTE NÃO RODOU: nenhuma empresa com 2 contas e usuário com permissão de conciliar';
  END IF;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);
  PERFORM set_config('request.headers', json_build_object('x-company-id', v_company)::text, true);

  SELECT c2.id INTO v_origem FROM public.fin_contas c2
  WHERE c2.company_id = v_company AND c2.ativo IS NOT FALSE ORDER BY c2.created_at, c2.id LIMIT 1;
  SELECT c2.id INTO v_destino FROM public.fin_contas c2
  WHERE c2.company_id = v_company AND c2.ativo IS NOT FALSE AND c2.id <> v_origem ORDER BY c2.created_at, c2.id LIMIT 1;

  rel := format(E'\nempresa %s · usuário %s · origem %s · destino %s', v_company, v_user, v_origem, v_destino);

  -- Valores fora do comum para não competir com transferências reais.
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.11, d0, 'TA');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.22, d0, 'TB');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.33, d0, 'TC1');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.33, d0 + 3, 'TC2');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.44, d0 - 1, 'TD1');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.44, d0 + 1, 'TD2');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.55, d0, 'TF');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.66, d0, 'TH', false);
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.77, d0, 'TI');
  PERFORM pg_temp.abtc_transferencia(v_company, v_user, v_origem, v_destino, 98711.99, d0, 'TV');

  -- Cenário: linhas na ordem do OFX (mais nova primeiro) e o resultado esperado da versão nova.
  v_cenarios := jsonb_build_array(
    jsonb_build_object('id', 'A', 'nome', 'outra linha de mesmo valor 2 dias depois vem antes no arquivo: só a contrapartida real é vinculada',
      'linhas', jsonb_build_array(
        pg_temp.abtc_linha('ABTC-A-OUTRA', 'RECEITA', d0 + 2, 98711.11),
        pg_temp.abtc_linha('ABTC-A-REAL', 'RECEITA', d0, 98711.11)),
      'esperado', 'ABTC-A-REAL>TA'),
    jsonb_build_object('id', 'B', 'nome', 'duas linhas à mesma distância da transferência: nenhuma é vinculada',
      'linhas', jsonb_build_array(
        pg_temp.abtc_linha('ABTC-B-1', 'RECEITA', d0 - 1, 98711.22),
        pg_temp.abtc_linha('ABTC-B-2', 'RECEITA', d0 + 1, 98711.22)),
      'esperado', '-'),
    jsonb_build_object('id', 'C', 'nome', 'duas transferências e duas linhas de mesmo valor: cada linha com a sua',
      'linhas', jsonb_build_array(
        pg_temp.abtc_linha('ABTC-C-2', 'RECEITA', d0 + 3, 98711.33),
        pg_temp.abtc_linha('ABTC-C-1', 'RECEITA', d0, 98711.33)),
      'esperado', 'ABTC-C-1>TC1,ABTC-C-2>TC2'),
    jsonb_build_object('id', 'D', 'nome', 'linha equidistante de duas transferências: não vincula',
      'linhas', jsonb_build_array(pg_temp.abtc_linha('ABTC-D', 'RECEITA', d0, 98711.44)),
      'esperado', '-'),
    jsonb_build_object('id', 'E', 'nome', 'linha de saída (DESPESA) no destino não é contrapartida',
      'linhas', jsonb_build_array(pg_temp.abtc_linha('ABTC-E', 'DESPESA', d0, 98711.11)),
      'esperado', '-'),
    jsonb_build_object('id', 'F', 'nome', 'mesmo FITID repetido no lote: um vínculo, sem erro',
      'linhas', jsonb_build_array(
        pg_temp.abtc_linha('ABTC-F', 'RECEITA', d0, 98711.55),
        pg_temp.abtc_linha('ABTC-F', 'RECEITA', d0, 98711.55)),
      'esperado', 'ABTC-F>TF'),
    jsonb_build_object('id', 'H', 'nome', 'transferência sem vínculo na conta de origem não é candidata',
      'linhas', jsonb_build_array(pg_temp.abtc_linha('ABTC-H', 'RECEITA', d0, 98711.66)),
      'esperado', '-'),
    jsonb_build_object('id', 'I', 'nome', 'transferência antes do período do lote (contrapartida no arquivo anterior): não vincula',
      'linhas', jsonb_build_array(pg_temp.abtc_linha('ABTC-I', 'RECEITA', d0 + 1, 98711.77)),
      'esperado', '-'),
    jsonb_build_object('id', 'V', 'nome', 'linhas inválidas são puladas sem derrubar o lote',
      'linhas', jsonb_build_array(
        jsonb_build_object('external_id', 'ABTC-V-DATA', 'tipo', 'RECEITA', 'data', 'abc', 'valor', 98711.99),
        jsonb_build_object('external_id', 'ABTC-V-MES', 'tipo', 'RECEITA', 'data', '2026-13-45', 'valor', 98711.99),
        jsonb_build_object('external_id', 'ABTC-V-TEXTO', 'tipo', 'RECEITA', 'data', d0, 'valor', 'abc'),
        jsonb_build_object('external_id', 'ABTC-V-NAN', 'tipo', 'RECEITA', 'data', d0, 'valor', 'NaN'),
        jsonb_build_object('external_id', 'ABTC-V-ZERO', 'tipo', 'RECEITA', 'data', d0, 'valor', 0),
        jsonb_build_object('external_id', 'ABTC-V-TIPO', 'tipo', NULL, 'data', d0, 'valor', 98711.99),
        jsonb_build_object('external_id', 'ABTC-' || repeat('X', 600), 'tipo', 'RECEITA', 'data', d0, 'valor', 98711.99),
        pg_temp.abtc_linha('ABTC-V-OK', 'RECEITA', d0, 98711.99)),
      'esperado', 'ABTC-V-OK>TV')
  );

  FOR c IN SELECT value FROM jsonb_array_elements(v_cenarios)
  LOOP
    -- Versão nova (cópia temporária): conta no resultado.
    BEGIN
      v_obtido := pg_temp.abtc_rodar('pg_temp.abtc_nova', v_destino, c->'linhas');
      IF v_obtido = c->>'esperado' THEN
        ok := ok + 1; rel := rel || format(E'\nOK    %s nova: %s', c->>'id', c->>'nome');
      ELSE
        falhas := falhas + 1; rel := rel || format(E'\nFALHA %s nova: esperado %s, obtido %s', c->>'id', c->>'esperado', v_obtido);
      END IF;
    EXCEPTION WHEN OTHERS THEN
      falhas := falhas + 1; rel := rel || format(E'\nFALHA %s nova erro: %s', c->>'id', SQLERRM);
    END;

    -- Função publicada: informativo antes de aplicar; depois de aplicar tem que bater.
    BEGIN
      v_obtido := pg_temp.abtc_rodar('public.reconcile_auto_bind_transfer_counterparts', v_destino, c->'linhas');
      rel := rel || format(E'\n      %s publicada: %s%s', c->>'id', v_obtido,
        CASE WHEN v_obtido = c->>'esperado' THEN ' (igual à nova)' ELSE ' (DIFERENTE da nova)' END);
    EXCEPTION WHEN OTHERS THEN
      rel := rel || format(E'\n      %s publicada erro: %s', c->>'id', SQLERRM);
    END;
  END LOOP;

  -- Reenvio: a linha já vinculada só volta no retorno e a outra continua sem vínculo.
  BEGIN
    PERFORM pg_temp.abtc_rodar('pg_temp.abtc_nova', v_destino, v_cenarios->0->'linhas', false);
    v_retorno := pg_temp.abtc_nova(v_destino, v_cenarios->0->'linhas');
    SELECT count(*) INTO v_qtd FROM public.fin_conciliacao_vinculos
    WHERE conta_id = v_destino AND external_id LIKE 'ABTC-%';
    IF v_retorno->'matched_external_ids' = '["ABTC-A-REAL"]'::jsonb AND v_qtd = 1 THEN
      ok := ok + 1; rel := rel || E'\nOK    R  reenvio do mesmo lote não cria vínculo novo';
    ELSE
      falhas := falhas + 1; rel := rel || format(E'\nFALHA R  reenvio: retorno %s, vínculos %s', v_retorno, v_qtd);
    END IF;
    DELETE FROM public.fin_conciliacao_vinculos WHERE conta_id = v_destino AND external_id LIKE 'ABTC-%';
  EXCEPTION WHEN OTHERS THEN
    falhas := falhas + 1; rel := rel || E'\nFALHA R  erro: ' || SQLERRM;
  END;

  -- Sem permissão de conciliar: recusa.
  BEGIN
    PERFORM set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid(), 'role', 'authenticated')::text, true);
    v_retorno := pg_temp.abtc_nova(v_destino, v_cenarios->0->'linhas');
    falhas := falhas + 1; rel := rel || E'\nFALHA P  usuário sem acesso deveria ser recusado: ' || v_retorno::text;
  EXCEPTION WHEN OTHERS THEN
    ok := ok + 1; rel := rel || E'\nOK    P  usuário sem acesso recusado: ' || SQLERRM;
  END;
  PERFORM set_config('request.jwt.claims', json_build_object('sub', v_user, 'role', 'authenticated')::text, true);

  -- G: grants da função publicada (só depois de aplicar a migration).
  IF NOT EXISTS (
    SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public' AND p.proname = 'reconcile_auto_bind_transfer_counterparts'
      AND pg_get_functiondef(p.oid) LIKE '%posicao_na_transferencia%'
  ) THEN
    rel := rel || E'\nPULADO G  grants: migration ainda não aplicada';
  ELSIF NOT has_function_privilege('anon', v_assinatura, 'EXECUTE')
        AND has_function_privilege('authenticated', v_assinatura, 'EXECUTE')
        AND has_function_privilege('service_role', v_assinatura, 'EXECUTE') THEN
    ok := ok + 1; rel := rel || E'\nOK    G  anon sem EXECUTE, authenticated e service_role com EXECUTE';
  ELSE
    falhas := falhas + 1; rel := rel || E'\nFALHA G  grants da função publicada';
  END IF;

  -- Sempre termina em erro: desfaz tudo o que o teste gravou.
  RAISE EXCEPTION '% — % ok, % falha(s)%',
    CASE WHEN falhas = 0 THEN 'TESTE OK' ELSE 'TESTE COM FALHA' END, ok, falhas, rel;
END;
$teste$;

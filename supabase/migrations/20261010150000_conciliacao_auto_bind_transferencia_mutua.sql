-- Contrapartida de transferência: o vínculo automático só sai para o par
-- vizinho mútuo único do lote.
--
-- reconcile_auto_bind_transfer_counterparts percorria p_lines em ordem e
-- vinculava a primeira linha cuja transferência mais próxima era única. O OFX
-- vem do mais novo ao mais antigo, então outra linha de mesmo valor até 3 dias
-- depois ganhava o vínculo antes da contrapartida real — e o vínculo é
-- persistente: a linha errada fica "já conciliada" pelo FITID e a real fica sem
-- par. Agora a decisão olha o lote inteiro: a linha L só recebe a transferência
-- T quando T é a única mais próxima de L e L é a única mais próxima de T entre
-- as linhas do lote ainda sem vínculo nesta conta. Empate não vincula; fica
-- para o reconhecimento da tela e para o usuário.
--
-- A transferência também precisa estar dentro do período do lote (da menor à
-- maior data das linhas válidas): fora dele a contrapartida real está fora do
-- lote, e outra linha de mesmo valor no começo do arquivo ficava com o vínculo.
--
-- A decisão é de uma passada: a linha que perde a transferência mais próxima
-- para o par mútuo não tenta a segunda opção na mesma chamada (fica para a tela;
-- um reenvio do lote pode vinculá-la, sem nunca desfazer vínculo). O retorno
-- traz as linhas que já tinham vínculo e as que esta chamada vinculou.
--
-- Assinatura, permissões, validações, lock e formato do retorno não mudam.

CREATE OR REPLACE FUNCTION public.reconcile_auto_bind_transfer_counterparts(p_conta_id uuid, p_lines jsonb)
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

REVOKE ALL ON FUNCTION public.reconcile_auto_bind_transfer_counterparts(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_auto_bind_transfer_counterparts(uuid, jsonb)
  TO authenticated, service_role;

-- Força a resolução das colunas e da assinatura na aplicação da migration.
DO $$
DECLARE
  v_sentinel uuid := '00000000-0000-0000-0000-000000000001';
  v_signature regprocedure;
BEGIN
  v_signature := 'public.reconcile_auto_bind_transfer_counterparts(uuid,jsonb)'::regprocedure;
  IF v_signature IS NULL THEN
    RAISE EXCEPTION 'reconcile_auto_bind_transfer_counterparts signature not resolved';
  END IF;

  PERFORM l.id, l.company_id, l.tipo, l.status, l.valor,
          l.data_competencia, l.conta_id, l.conta_destino_id
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_sentinel;

  PERFORM v.company_id, v.conta_id, v.external_id, v.tipo, v.lancamento_id, v.created_by
  FROM public.fin_conciliacao_vinculos v
  WHERE v.company_id = v_sentinel;
END $$;

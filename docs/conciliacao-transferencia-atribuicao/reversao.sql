-- Reversão da migration 20261010150000_conciliacao_auto_bind_transferencia_mutua
--
-- Volta reconcile_auto_bind_transfer_counterparts à definição que estava em
-- produção antes dela (capturada com pg_get_functiondef em 2026-10-10). A
-- assinatura e o retorno não mudaram, então a ordem com o frontend é livre.
--
-- Dados: a reversão não mexe em vínculos já gravados. A versão nova só deixa de
-- vincular (empate ou linha que não é a mais próxima); nada do que ela gravou
-- precisa ser desfeito.

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
  v_lancamento_id uuid;
  v_candidate_count integer;
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
$function$;

REVOKE ALL ON FUNCTION public.reconcile_auto_bind_transfer_counterparts(uuid, jsonb)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_auto_bind_transfer_counterparts(uuid, jsonb)
  TO authenticated, service_role;

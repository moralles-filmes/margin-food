-- Santander ContaMax is part of the same bank balance shown to the customer.
-- Applications and rescues only move money between the current-account pocket
-- and the automatic-investment pocket, so they are reconciliation evidence with
-- zero financial effect. They must not create ledger transfers or require a
-- second bank account in Margin Food.

ALTER TABLE public.fin_conciliacao_ignoradas
  ADD COLUMN IF NOT EXISTS tratamento text NOT NULL DEFAULT 'IGNORADA_MANUAL',
  ADD COLUMN IF NOT EXISTS occurrence_index integer,
  ADD COLUMN IF NOT EXISTS external_id text,
  ADD COLUMN IF NOT EXISTS lancamento_origem_id uuid REFERENCES public.fin_lancamentos(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS descricao_unaccent text GENERATED ALWAYS AS (
    regexp_replace(
      lower(public.immutable_unaccent(btrim(COALESCE(descricao, '')))),
      '\s+', ' ', 'g'
    )
  ) STORED;

DO $constraints$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fin_conciliacao_ignoradas'::regclass
      AND conname = 'fin_conciliacao_ignoradas_tratamento_check'
  ) THEN
    ALTER TABLE public.fin_conciliacao_ignoradas
      ADD CONSTRAINT fin_conciliacao_ignoradas_tratamento_check
      CHECK (tratamento IN ('IGNORADA_MANUAL', 'MOVIMENTACAO_INTERNA_CONTAMAX'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fin_conciliacao_ignoradas'::regclass
      AND conname = 'fin_conciliacao_ignoradas_occurrence_check'
  ) THEN
    ALTER TABLE public.fin_conciliacao_ignoradas
      ADD CONSTRAINT fin_conciliacao_ignoradas_occurrence_check
      CHECK (
        tratamento <> 'MOVIMENTACAO_INTERNA_CONTAMAX'
        OR (conta_id IS NOT NULL AND occurrence_index IS NOT NULL AND occurrence_index >= 0)
      );
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'public.fin_conciliacao_ignoradas'::regclass
      AND conname = 'fin_conciliacao_ignoradas_external_id_length_check'
  ) THEN
    ALTER TABLE public.fin_conciliacao_ignoradas
      ADD CONSTRAINT fin_conciliacao_ignoradas_external_id_length_check
      CHECK (external_id IS NULL OR length(external_id) <= 512);
  END IF;
END;
$constraints$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_conciliacao_contamax_occurrence
  ON public.fin_conciliacao_ignoradas (
    company_id, conta_id, data, valor, tipo, descricao_unaccent, occurrence_index
  )
  WHERE tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX';

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_conciliacao_contamax_origin
  ON public.fin_conciliacao_ignoradas (company_id, lancamento_origem_id)
  WHERE lancamento_origem_id IS NOT NULL;

-- Cover every foreign key from the child side. Besides keeping deletes/updates
-- predictable, these remove two pre-existing advisor warnings on this table.
CREATE INDEX IF NOT EXISTS idx_fin_conciliacao_ignoradas_conta_id
  ON public.fin_conciliacao_ignoradas (conta_id);

CREATE INDEX IF NOT EXISTS idx_fin_conciliacao_ignoradas_ignorado_por
  ON public.fin_conciliacao_ignoradas (ignorado_por);

CREATE INDEX IF NOT EXISTS idx_fin_conciliacao_ignoradas_lancamento_origem_id
  ON public.fin_conciliacao_ignoradas (lancamento_origem_id);

CREATE INDEX IF NOT EXISTS idx_fin_conciliacao_ignoradas_descricao_unaccent
  ON public.fin_conciliacao_ignoradas USING gin (descricao_unaccent gin_trgm_ops);

COMMENT ON COLUMN public.fin_conciliacao_ignoradas.tratamento IS
  'IGNORADA_MANUAL: descartada pelo usuário; MOVIMENTACAO_INTERNA_CONTAMAX: evidência neutra, sem efeito no razão.';
COMMENT ON COLUMN public.fin_conciliacao_ignoradas.occurrence_index IS
  'Índice zero-based entre linhas bancárias de mesmo conteúdo no mesmo arquivo; protege repetições legítimas.';
COMMENT ON COLUMN public.fin_conciliacao_ignoradas.external_id IS
  'FITID apenas para auditoria; nunca é identidade única porque o Santander o regenera.';

ALTER TABLE public.fin_conciliacao_ignoradas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_conciliacao_ignoradas FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "conciliacao_ignoradas_company_rls" ON public.fin_conciliacao_ignoradas;
DROP POLICY IF EXISTS "conciliacao_ignoradas_superadmin" ON public.fin_conciliacao_ignoradas;
DROP POLICY IF EXISTS "fin_conciliacao_ignoradas_tenant_select" ON public.fin_conciliacao_ignoradas;

CREATE POLICY "fin_conciliacao_ignoradas_tenant_select"
  ON public.fin_conciliacao_ignoradas
  FOR SELECT
  TO authenticated
  USING (
    company_id = (SELECT public.get_current_company_id())
    AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
      'financeiro:conciliacao:view',
      'financeiro:conciliacao:reconcile',
      'financeiro:conciliacao:manage',
      'finance:manage',
      'system:global:manage'
    ]))
  );

-- Table privileges expose SELECT through PostgREST; RLS intentionally has no
-- direct-write policy. All mutations go through the guarded RPCs below.
GRANT ALL ON TABLE public.fin_conciliacao_ignoradas TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.reconcile_neutralize_contamax(
  p_conta_id uuid,
  p_linhas jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_bank text;
  v_bank_digits text;
  v_line record;
  v_data date;
  v_valor numeric;
  v_tipo text;
  v_descricao text;
  v_descricao_normalizada text;
  v_external_id text;
  v_processed integer;
  v_inserted integer;
  v_audited integer;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  IF p_linhas IS NULL OR jsonb_typeof(p_linhas) <> 'array' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: p_linhas deve ser um array JSON';
  END IF;

  v_processed := jsonb_array_length(p_linhas);
  IF v_processed > 10000 THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: máximo de 10000 linhas por lote';
  END IF;
  IF v_processed = 0 THEN
    RETURN jsonb_build_object('status', 'ok', 'processed', 0, 'inserted', 0, 'existing', 0);
  END IF;

  SELECT lower(public.immutable_unaccent(btrim(COALESCE(c.banco, '')))),
         regexp_replace(COALESCE(c.banco, ''), '\D', '', 'g')
  INTO v_bank, v_bank_digits
  FROM public.fin_contas c
  WHERE c.id = p_conta_id
    AND c.company_id = v_company_id
    AND c.ativo = true;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária ativa';
  END IF;
  IF v_bank_digits <> '033' AND v_bank NOT LIKE '%santander%' THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: ContaMax automático só é aceito em conta Santander';
  END IF;

  -- Validate every row before the all-or-nothing INSERT. Cast failures are
  -- converted into the same stable validation error instead of leaking a
  -- partial or obscure PostgreSQL exception to the client.
  FOR v_line IN
    SELECT value, ordinality
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY
  LOOP
    BEGIN
      v_data := (v_line.value ->> 'data')::date;
      v_valor := round(abs((v_line.value ->> 'valor')::numeric), 2);
    EXCEPTION WHEN OTHERS THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: data/valor inválido na linha %', v_line.ordinality;
    END;

    v_tipo := upper(btrim(COALESCE(v_line.value ->> 'tipo', '')));
    v_descricao := regexp_replace(btrim(COALESCE(v_line.value ->> 'descricao', '')), '\s+', ' ', 'g');
    v_descricao_normalizada := lower(public.immutable_unaccent(v_descricao));
    v_external_id := NULLIF(btrim(v_line.value ->> 'external_id'), '');

    IF v_valor <= 0 OR v_tipo NOT IN ('RECEITA', 'DESPESA') OR v_descricao = '' THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: linha ContaMax inválida na posição %', v_line.ordinality;
    END IF;
    IF v_external_id IS NOT NULL AND length(v_external_id) > 512 THEN
      RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
    END IF;
    IF NOT (
      (v_tipo = 'DESPESA' AND v_descricao_normalizada LIKE '%aplicacao%contamax%')
      OR (v_tipo = 'RECEITA' AND v_descricao_normalizada LIKE '%resgate%contamax%')
    ) THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: somente aplicação/resgate ContaMax é movimentação interna (linha %)', v_line.ordinality;
    END IF;
  END LOOP;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(v_company_id::text || ':contamax:' || p_conta_id::text, 0)
  );

  WITH input_rows AS (
    SELECT
      ordinality,
      (value ->> 'data')::date AS data,
      round(abs((value ->> 'valor')::numeric), 2) AS valor,
      upper(btrim(value ->> 'tipo')) AS tipo,
      regexp_replace(btrim(value ->> 'descricao'), '\s+', ' ', 'g') AS descricao,
      NULLIF(btrim(value ->> 'external_id'), '') AS external_id
    FROM jsonb_array_elements(p_linhas) WITH ORDINALITY
  ), numbered AS (
    SELECT
      input_rows.*,
      row_number() OVER (
        PARTITION BY
          data,
          valor,
          tipo,
          lower(public.immutable_unaccent(descricao))
        ORDER BY ordinality
      ) - 1 AS occurrence_index
    FROM input_rows
  ), inserted AS (
    INSERT INTO public.fin_conciliacao_ignoradas (
      company_id, conta_id, data, valor, tipo, descricao,
      ignorado_por, tratamento, occurrence_index, external_id
    )
    SELECT
      v_company_id, p_conta_id, n.data, n.valor, n.tipo, n.descricao,
      v_uid, 'MOVIMENTACAO_INTERNA_CONTAMAX', n.occurrence_index, n.external_id
    FROM numbered n
    ON CONFLICT (
      company_id, conta_id, data, valor, tipo, descricao_unaccent, occurrence_index
    ) WHERE tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX'
    DO NOTHING
    RETURNING id, company_id, conta_id, data, valor, tipo, descricao, occurrence_index, external_id
  ), audited AS (
    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, user_id, company_id, depois
    )
    SELECT
      'conciliacao_interna', i.id, 'neutralizar_contamax', v_uid, i.company_id,
      jsonb_build_object(
        'conta_id', i.conta_id,
        'data', i.data,
        'valor', i.valor,
        'tipo', i.tipo,
        'descricao', i.descricao,
        'occurrence_index', i.occurrence_index,
        'external_id_used', i.external_id IS NOT NULL,
        'financial_effect', 0
      )
    FROM inserted i
    RETURNING id
  )
  SELECT
    (SELECT count(*)::integer FROM inserted),
    (SELECT count(*)::integer FROM audited)
  INTO v_inserted, v_audited;

  IF v_inserted <> v_audited THEN
    RAISE EXCEPTION 'CONTAMAX_AUDIT_MISMATCH';
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'processed', v_processed,
    'inserted', v_inserted,
    'existing', v_processed - v_inserted
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_neutralize_contamax(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_neutralize_contamax(uuid, jsonb) TO authenticated;

-- Manual ignore remains available for genuine non-financial noise, but ContaMax
-- must use the classified, idempotent batch above.
CREATE OR REPLACE FUNCTION public.reconcile_ignorar_lancamento(
  p_conta_id uuid,
  p_data date,
  p_valor numeric,
  p_tipo text,
  p_descricao text,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_id uuid;
  v_company_id uuid;
  v_uid uuid;
  v_descricao_normalizada text;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  PERFORM 1
  FROM public.fin_contas c
  WHERE c.id = p_conta_id
    AND c.company_id = v_company_id
    AND c.ativo = true;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária ativa';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 OR p_tipo NOT IN ('RECEITA', 'DESPESA') OR p_data IS NULL THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: data, valor e tipo são obrigatórios';
  END IF;

  v_descricao_normalizada := lower(public.immutable_unaccent(
    regexp_replace(btrim(COALESCE(p_descricao, '')), '\s+', ' ', 'g')
  ));
  IF v_descricao_normalizada LIKE '%aplicacao%contamax%'
     OR v_descricao_normalizada LIKE '%resgate%contamax%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUTOMATIC_INVESTMENT_REQUIRES_NEUTRALIZATION: aplicação/resgate ContaMax é movimentação interna';
  END IF;

  INSERT INTO public.fin_conciliacao_ignoradas (
    company_id, conta_id, data, valor, tipo, descricao,
    ignorado_por, tratamento
  ) VALUES (
    v_company_id, p_conta_id, p_data, round(p_valor, 2), p_tipo,
    regexp_replace(btrim(COALESCE(p_descricao, '')), '\s+', ' ', 'g'),
    v_uid, 'IGNORADA_MANUAL'
  )
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'ok', 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_ignorar_lancamento(uuid, date, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_ignorar_lancamento(uuid, date, numeric, text, text, uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.reconcile_reconsiderar_ignorada(
  p_ignorada_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_uid uuid;
  v_tratamento text;
  v_deleted_id uuid;
BEGIN
  v_company_id := public.assert_tenant();
  v_uid := auth.uid();

  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:conciliacao:reconcile',
    'financeiro:conciliacao:manage',
    'finance:manage',
    'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:conciliacao:reconcile necessário';
  END IF;

  SELECT i.tratamento
  INTO v_tratamento
  FROM public.fin_conciliacao_ignoradas i
  WHERE i.id = p_ignorada_id
    AND i.company_id = v_company_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX' THEN
    RAISE EXCEPTION 'INTERNAL_MOVEMENT_CANNOT_BE_RECONSIDERED';
  END IF;

  DELETE FROM public.fin_conciliacao_ignoradas
  WHERE id = p_ignorada_id
    AND company_id = v_company_id
    AND tratamento = 'IGNORADA_MANUAL'
  RETURNING id INTO v_deleted_id;

  IF v_deleted_id IS NULL THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;

  RETURN jsonb_build_object('status', 'ok', 'id', v_deleted_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_reconsiderar_ignorada(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_reconsiderar_ignorada(uuid) TO authenticated;

-- Server-side last line of defense: even an old client or a new import path
-- cannot turn Santander application/rescue lines into active ledger entries.
CREATE OR REPLACE FUNCTION public.fin_block_contamax_ledger_entry()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_descricao text;
BEGIN
  IF NEW.status NOT IN ('REALIZADO', 'CONCILIADO') THEN
    RETURN NEW;
  END IF;

  v_descricao := lower(public.immutable_unaccent(
    regexp_replace(btrim(COALESCE(NEW.descricao, '')), '\s+', ' ', 'g')
  ));
  IF v_descricao NOT LIKE '%aplicacao%contamax%'
     AND v_descricao NOT LIKE '%resgate%contamax%' THEN
    RETURN NEW;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.fin_contas c
    WHERE c.company_id = NEW.company_id
      AND c.id IN (NEW.conta_id, NEW.conta_destino_id)
      AND (
        regexp_replace(COALESCE(c.banco, ''), '\D', '', 'g') = '033'
        OR lower(public.immutable_unaccent(btrim(COALESCE(c.banco, '')))) LIKE '%santander%'
      )
  ) THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUTOMATIC_INVESTMENT_IS_INTERNAL: aplicação/resgate ContaMax não cria lançamento financeiro';
  END IF;

  RETURN NEW;
END;
$function$;

REVOKE ALL ON FUNCTION public.fin_block_contamax_ledger_entry() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_fin_block_contamax_ledger_entry ON public.fin_lancamentos;
CREATE TRIGGER trg_fin_block_contamax_ledger_entry
  BEFORE INSERT OR UPDATE OF tipo, status, descricao, conta_id, conta_destino_id
  ON public.fin_lancamentos
  FOR EACH ROW
  EXECUTE FUNCTION public.fin_block_contamax_ledger_entry();

-- Repair only the proven pilot dataset. Natural account identifiers plus the
-- 20 audit records created by the previous repair define the exact target set;
-- changed cardinality or amounts abort the whole migration.
DO $repair$
DECLARE
  v_source_id uuid;
  v_target_id uuid;
  v_company_id uuid;
  v_actor_id uuid;
  v_source_count integer;
  v_target_count integer;
  v_active_transfer_count integer;
  v_repair_audit_count integer;
  v_neutral_count integer;
  v_application_total numeric;
  v_rescue_total numeric;
  v_target_active_rows integer;
  v_yield_target_count integer;
  v_yield_source_count integer;
  v_source_initial numeric;
  v_source_balance numeric;
  v_target_balance numeric;
  v_transfer record;
BEGIN
  SELECT count(*)::integer,
         (array_agg(c.id ORDER BY c.id))[1],
         (array_agg(c.company_id ORDER BY c.id))[1],
         (array_agg(c.created_by ORDER BY c.id))[1]
  INTO v_source_count, v_source_id, v_company_id, v_actor_id
  FROM public.fin_contas c
  WHERE c.banco = '033'
    AND regexp_replace(COALESCE(c.numero_conta, ''), '\D', '', 'g') = '130117470';

  IF v_source_count = 0 THEN
    RETURN;
  END IF;
  IF v_source_count <> 1 OR v_actor_id IS NULL THEN
    RAISE EXCEPTION 'CONTAMAX_CONSOLIDATION_ABORTED: expected one audited Santander GM source, found %', v_source_count;
  END IF;

  SELECT count(*)::integer, (array_agg(c.id ORDER BY c.id))[1]
  INTO v_target_count, v_target_id
  FROM public.fin_contas c
  WHERE c.company_id = v_company_id
    AND lower(public.immutable_unaccent(btrim(c.nome))) = 'conta aplicacao';

  IF v_target_count <> 1 THEN
    RAISE EXCEPTION 'CONTAMAX_CONSOLIDATION_ABORTED: expected one CONTA APLICACAO, found %', v_target_count;
  END IF;

  SELECT count(*)::integer
  INTO v_repair_audit_count
  FROM public.fin_audit_logs a
  JOIN public.fin_lancamentos l ON l.id = a.entidade_id AND l.company_id = a.company_id
  WHERE a.company_id = v_company_id
    AND a.acao = 'repair_contamax_ignored'
    AND l.tipo = 'TRANSFERENCIA'
    AND (
      (l.conta_id = v_source_id AND l.conta_destino_id = v_target_id)
      OR (l.conta_id = v_target_id AND l.conta_destino_id = v_source_id)
    );

  IF v_repair_audit_count <> 20 THEN
    RAISE EXCEPTION 'CONTAMAX_CONSOLIDATION_ABORTED: expected 20 audited transfers, found %', v_repair_audit_count;
  END IF;

  SELECT
    count(*) FILTER (WHERE l.status IN ('REALIZADO', 'CONCILIADO'))::integer,
    COALESCE(sum(l.valor) FILTER (
      WHERE l.status IN ('REALIZADO', 'CONCILIADO') AND l.conta_id = v_source_id
    ), 0),
    COALESCE(sum(l.valor) FILTER (
      WHERE l.status IN ('REALIZADO', 'CONCILIADO') AND l.conta_destino_id = v_source_id
    ), 0)
  INTO v_active_transfer_count, v_application_total, v_rescue_total
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND EXISTS (
      SELECT 1 FROM public.fin_audit_logs a
      WHERE a.company_id = v_company_id
        AND a.acao = 'repair_contamax_ignored'
        AND a.entidade_id = l.id
    );

  SELECT count(*)::integer
  INTO v_neutral_count
  FROM public.fin_conciliacao_ignoradas i
  WHERE i.company_id = v_company_id
    AND i.conta_id = v_source_id
    AND i.tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX'
    AND i.lancamento_origem_id IN (
      SELECT a.entidade_id FROM public.fin_audit_logs a
      WHERE a.company_id = v_company_id AND a.acao = 'repair_contamax_ignored'
    );

  IF NOT (
    (v_active_transfer_count = 20 AND v_neutral_count = 0
      AND v_application_total = 53363.87 AND v_rescue_total = 63566.62)
    OR (v_active_transfer_count = 0 AND v_neutral_count = 20)
  ) THEN
    RAISE EXCEPTION
      'CONTAMAX_CONSOLIDATION_ABORTED: unexpected state active=% neutral=% applications=% rescues=%',
      v_active_transfer_count, v_neutral_count, v_application_total, v_rescue_total;
  END IF;

  IF v_active_transfer_count = 20 THEN
    FOR v_transfer IN
      WITH audited_transfers AS (
        SELECT DISTINCT l.*
        FROM public.fin_lancamentos l
        JOIN public.fin_audit_logs a
          ON a.company_id = l.company_id
         AND a.entidade_id = l.id
         AND a.acao = 'repair_contamax_ignored'
        WHERE l.company_id = v_company_id
          AND l.status IN ('REALIZADO', 'CONCILIADO')
      ), numbered AS (
        SELECT
          t.*,
          row_number() OVER (
            PARTITION BY
              COALESCE(t.data_pagamento, t.data_competencia),
              t.valor,
              CASE WHEN t.conta_id = v_source_id THEN 'DESPESA' ELSE 'RECEITA' END,
              lower(public.immutable_unaccent(regexp_replace(btrim(t.descricao), '\s+', ' ', 'g')))
            ORDER BY t.id
          ) - 1 AS neutral_occurrence
        FROM audited_transfers t
      )
      SELECT * FROM numbered ORDER BY data_pagamento, id
    LOOP
      INSERT INTO public.fin_conciliacao_ignoradas (
        company_id, conta_id, data, valor, tipo, descricao, ignorado_em,
        ignorado_por, tratamento, occurrence_index, lancamento_origem_id
      ) VALUES (
        v_company_id,
        v_source_id,
        COALESCE(v_transfer.data_pagamento, v_transfer.data_competencia),
        v_transfer.valor,
        CASE WHEN v_transfer.conta_id = v_source_id THEN 'DESPESA' ELSE 'RECEITA' END,
        regexp_replace(btrim(v_transfer.descricao), '\s+', ' ', 'g'),
        COALESCE(v_transfer.conciliado_em, v_transfer.created_at),
        COALESCE(v_transfer.conciliado_por, v_transfer.created_by, v_actor_id),
        'MOVIMENTACAO_INTERNA_CONTAMAX',
        v_transfer.neutral_occurrence,
        v_transfer.id
      );

      INSERT INTO public.fin_audit_logs (
        entidade, entidade_id, acao, antes, depois, user_id, company_id
      ) VALUES (
        'transferencia', v_transfer.id, 'consolidar_contamax',
        jsonb_build_object(
          'status', v_transfer.status,
          'conta_id', v_transfer.conta_id,
          'conta_destino_id', v_transfer.conta_destino_id,
          'valor', v_transfer.valor
        ),
        jsonb_build_object(
          'status', 'CANCELADO',
          'tratamento', 'MOVIMENTACAO_INTERNA_CONTAMAX',
          'financial_effect', 0
        ),
        COALESCE(v_transfer.conciliado_por, v_transfer.created_by, v_actor_id),
        v_company_id
      );
    END LOOP;

    DELETE FROM public.fin_conciliacao_vinculos v
    WHERE v.company_id = v_company_id
      AND v.lancamento_id IN (
        SELECT a.entidade_id FROM public.fin_audit_logs a
        WHERE a.company_id = v_company_id AND a.acao = 'repair_contamax_ignored'
      );

    UPDATE public.fin_lancamentos l
    SET status = 'CANCELADO',
        conciliado = false,
        conciliado_em = NULL,
        conciliado_por = NULL,
        justificativa_edicao = 'Cancelado: ContaMax consolidado na conta Santander; movimentação interna sem efeito financeiro.'
    WHERE l.company_id = v_company_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND EXISTS (
        SELECT 1 FROM public.fin_audit_logs a
        WHERE a.company_id = v_company_id
          AND a.acao = 'repair_contamax_ignored'
          AND a.entidade_id = l.id
      );
  END IF;

  SELECT
    count(*) FILTER (WHERE l.conta_id = v_target_id)::integer,
    count(*) FILTER (WHERE l.conta_id = v_source_id)::integer
  INTO v_yield_target_count, v_yield_source_count
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND l.tipo = 'RECEITA'
    AND l.valor = 0.34
    AND l.data_pagamento = date '2026-08-24'
    AND lower(public.immutable_unaccent(btrim(l.descricao))) = 'rendimento contamax';

  IF NOT (
    (v_yield_target_count = 1 AND v_yield_source_count = 0)
    OR (v_yield_target_count = 0 AND v_yield_source_count = 1)
  ) THEN
    RAISE EXCEPTION 'CONTAMAX_CONSOLIDATION_ABORTED: expected one R$0.34 yield, target=% source=%',
      v_yield_target_count, v_yield_source_count;
  END IF;

  IF v_yield_target_count = 1 THEN
    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, antes, depois, user_id, company_id
    )
    SELECT
      'lancamentos', l.id, 'consolidar_rendimento_contamax',
      jsonb_build_object('conta_id', l.conta_id, 'valor', l.valor),
      jsonb_build_object(
        'conta_id', v_source_id,
        'valor', l.valor,
        'reason', 'rendimento real pertence ao saldo Santander consolidado'
      ),
      COALESCE(l.created_by, v_actor_id), l.company_id
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.conta_id = v_target_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo = 'RECEITA'
      AND l.valor = 0.34
      AND l.data_pagamento = date '2026-08-24'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) = 'rendimento contamax';

    UPDATE public.fin_lancamentos l
    SET conta_id = v_source_id,
        justificativa_edicao = 'Rendimento ContaMax movido para o saldo Santander consolidado.'
    WHERE l.company_id = v_company_id
      AND l.conta_id = v_target_id
      AND l.status IN ('REALIZADO', 'CONCILIADO')
      AND l.tipo = 'RECEITA'
      AND l.valor = 0.34
      AND l.data_pagamento = date '2026-08-24'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) = 'rendimento contamax';
  END IF;

  SELECT c.saldo_inicial INTO v_source_initial
  FROM public.fin_contas c
  WHERE c.id = v_source_id AND c.company_id = v_company_id;

  IF v_source_initial NOT IN (0, 10202.41) THEN
    RAISE EXCEPTION 'CONTAMAX_CONSOLIDATION_ABORTED: unexpected Santander initial balance R$%', v_source_initial;
  END IF;

  IF v_source_initial = 0 THEN
    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, antes, depois, user_id, company_id
    ) VALUES (
      'contas_bancarias', v_source_id, 'consolidar_saldo_inicial_contamax',
      jsonb_build_object('saldo_inicial', 0),
      jsonb_build_object(
        'saldo_inicial', 10202.41,
        'data_saldo_inicial', date '2026-08-01',
        'reason', 'principal ContaMax na abertura; rendimento real de R$0,34 permanece no razão'
      ),
      v_actor_id, v_company_id
    );

    UPDATE public.fin_contas
    SET saldo_inicial = 10202.41,
        data_saldo_inicial = date '2026-08-01',
        updated_at = now()
    WHERE id = v_source_id AND company_id = v_company_id;
  END IF;

  SELECT count(*)::integer
  INTO v_target_active_rows
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND (l.conta_id = v_target_id OR l.conta_destino_id = v_target_id);

  IF v_target_active_rows <> 0 THEN
    RAISE EXCEPTION 'CONTAMAX_CONSOLIDATION_ABORTED: technical account still has % active ledger rows', v_target_active_rows;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.fin_contas c
    WHERE c.id = v_target_id AND c.company_id = v_company_id AND c.ativo = true
  ) THEN
    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, antes, depois, user_id, company_id
    ) VALUES (
      'contas_bancarias', v_target_id, 'desativar_conta_tecnica_contamax',
      jsonb_build_object('ativo', true, 'saldo_inicial', 0),
      jsonb_build_object('ativo', false, 'saldo_final', 0, 'reason', 'modelo Santander consolidado dispensa conta técnica'),
      v_actor_id, v_company_id
    );

    UPDATE public.fin_contas
    SET ativo = false, updated_at = now()
    WHERE id = v_target_id AND company_id = v_company_id;
  END IF;

  SELECT c.saldo_inicial + COALESCE(sum(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_source_balance
  FROM public.fin_contas c
  LEFT JOIN public.fin_lancamentos l
    ON l.company_id = c.company_id
   AND l.status IN ('REALIZADO', 'CONCILIADO')
   AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
   AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= date '2026-08-28'
  WHERE c.id = v_source_id AND c.company_id = v_company_id
  GROUP BY c.saldo_inicial;

  SELECT c.saldo_inicial + COALESCE(sum(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = c.id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = c.id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = c.id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = c.id THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_target_balance
  FROM public.fin_contas c
  LEFT JOIN public.fin_lancamentos l
    ON l.company_id = c.company_id
   AND l.status IN ('REALIZADO', 'CONCILIADO')
   AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
  WHERE c.id = v_target_id AND c.company_id = v_company_id
  GROUP BY c.saldo_inicial;

  SELECT count(*)::integer
  INTO v_neutral_count
  FROM public.fin_conciliacao_ignoradas i
  WHERE i.company_id = v_company_id
    AND i.conta_id = v_source_id
    AND i.tratamento = 'MOVIMENTACAO_INTERNA_CONTAMAX'
    AND i.lancamento_origem_id IN (
      SELECT a.entidade_id FROM public.fin_audit_logs a
      WHERE a.company_id = v_company_id AND a.acao = 'repair_contamax_ignored'
    );

  SELECT count(*) FILTER (WHERE l.status IN ('REALIZADO', 'CONCILIADO'))::integer
  INTO v_active_transfer_count
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND EXISTS (
      SELECT 1 FROM public.fin_audit_logs a
      WHERE a.company_id = v_company_id
        AND a.acao = 'repair_contamax_ignored'
        AND a.entidade_id = l.id
    );

  IF v_neutral_count <> 20 OR v_active_transfer_count <> 0
     OR v_source_balance <> 0 OR v_target_balance <> 0 THEN
    RAISE EXCEPTION
      'CONTAMAX_CONSOLIDATION_ABORTED: final validation neutral=% active=% source=R$% target=R$%',
      v_neutral_count, v_active_transfer_count, v_source_balance, v_target_balance;
  END IF;
END;
$repair$;

DO $validation$
BEGIN
  IF to_regprocedure('public.reconcile_neutralize_contamax(uuid,jsonb)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_neutralize_contamax: expected signature missing';
  END IF;
  IF to_regprocedure('public.reconcile_ignorar_lancamento(uuid,date,numeric,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_ignorar_lancamento: expected signature missing';
  END IF;
  IF to_regprocedure('public.reconcile_reconsiderar_ignorada(uuid)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_reconsiderar_ignorada: expected signature missing';
  END IF;
  IF to_regprocedure('public.fin_block_contamax_ledger_entry()') IS NULL THEN
    RAISE EXCEPTION 'fin_block_contamax_ledger_entry: expected signature missing';
  END IF;
END;
$validation$;

-- Santander ContaMax must affect the current-account balance. Treating these
-- lines as ignored made every daily closing balance diverge by the exact amount
-- automatically invested/rescued. The client now offers a batch-transfer flow;
-- this server-side guard protects older clients too.
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
    AND c.company_id = v_company_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária';
  END IF;

  v_descricao_normalizada := lower(public.immutable_unaccent(btrim(COALESCE(p_descricao, ''))));
  IF v_descricao_normalizada LIKE '%aplicacao contamax%'
     OR v_descricao_normalizada LIKE '%resgate contamax%' THEN
    RAISE EXCEPTION USING
      ERRCODE = '23514',
      MESSAGE = 'AUTOMATIC_INVESTMENT_REQUIRES_TRANSFER: aplicação/resgate ContaMax deve ser registrado como transferência';
  END IF;

  INSERT INTO public.fin_conciliacao_ignoradas
    (company_id, conta_id, data, valor, tipo, descricao, ignorado_por)
  VALUES
    (v_company_id, p_conta_id, p_data, p_valor, p_tipo, p_descricao, v_uid)
  RETURNING id INTO v_id;

  RETURN jsonb_build_object('status', 'ok', 'id', v_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_ignorar_lancamento(uuid, date, numeric, text, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_ignorar_lancamento(uuid, date, numeric, text, text, uuid) TO authenticated;

-- Creates (or safely reuses) and binds a transfer in one transaction. The old
-- two-call client flow could create the transfer and fail before persisting the
-- OFX link; it also reused a transfer already claimed by a different bank line.
CREATE OR REPLACE FUNCTION public.reconcile_create_transfer_from_extrato(
  p_data date,
  p_valor numeric,
  p_descricao text,
  p_conta_origem_id uuid,
  p_conta_destino_id uuid,
  p_external_id text,
  p_external_tipo text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lancamento_id uuid;
  v_existing_id uuid;
  v_existing_type text;
  v_existing_status text;
  v_existing_count integer;
  v_external_id text;
  v_extrato_conta_id uuid;
  v_status text := 'ok';
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
  IF p_external_tipo NOT IN ('RECEITA', 'DESPESA') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: tipo bancário inválido';
  END IF;

  v_external_id := NULLIF(btrim(p_external_id), '');
  IF v_external_id IS NOT NULL AND length(v_external_id) > 512 THEN
    RAISE EXCEPTION 'INVALID_EXTERNAL_ID';
  END IF;
  v_extrato_conta_id := CASE
    WHEN p_external_tipo = 'DESPESA' THEN p_conta_origem_id
    ELSE p_conta_destino_id
  END;

  PERFORM 1 FROM public.fin_contas c
  WHERE c.id = p_conta_origem_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta de origem'; END IF;
  PERFORM 1 FROM public.fin_contas c
  WHERE c.id = p_conta_destino_id AND c.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: conta de destino'; END IF;

  PERFORM pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      v_company::text || ':transfer:' ||
      least(p_conta_origem_id::text, p_conta_destino_id::text) || ':' ||
      greatest(p_conta_origem_id::text, p_conta_destino_id::text),
      0
    )
  );

  IF v_external_id IS NOT NULL THEN
    SELECT v.lancamento_id, l.tipo, l.status
    INTO v_lancamento_id, v_existing_type, v_existing_status
    FROM public.fin_conciliacao_vinculos v
    JOIN public.fin_lancamentos l ON l.id = v.lancamento_id
    WHERE v.company_id = v_company
      AND v.conta_id = v_extrato_conta_id
      AND v.external_id = v_external_id
      AND v.tipo = p_external_tipo
      AND l.company_id = v_company;
    IF v_lancamento_id IS NOT NULL THEN
      IF v_existing_type = 'TRANSFERENCIA' AND v_existing_status = 'REALIZADO' THEN
        RETURN jsonb_build_object('status', 'duplicate', 'lancamento_id', v_lancamento_id);
      END IF;
      RAISE EXCEPTION 'EXTERNAL_ID_ALREADY_LINKED: linha bancária já vinculada ao lançamento %', v_lancamento_id;
    END IF;
  END IF;

  -- Reuse only one unclaimed manual candidate. A transfer already linked to a
  -- different line on this account is never stolen by a repeated transaction.
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
      AND NOT EXISTS (
        SELECT 1
        FROM public.fin_conciliacao_vinculos claimed
        WHERE claimed.company_id = v_company
          AND claimed.conta_id = v_extrato_conta_id
          AND claimed.lancamento_id = l.id
      )
  ), nearest AS (
    SELECT c.id
    FROM candidates c
    WHERE c.date_distance = (SELECT min(c2.date_distance) FROM candidates c2)
  )
  SELECT count(*)::integer, (array_agg(n.id ORDER BY n.id))[1]
  INTO v_existing_count, v_existing_id
  FROM nearest n;

  IF v_existing_count = 1 AND v_existing_id IS NOT NULL THEN
    v_lancamento_id := v_existing_id;
    v_status := 'existing';
  ELSE
    INSERT INTO public.fin_lancamentos (
      tipo, valor, data_competencia, data_pagamento, descricao,
      conta_id, conta_destino_id, status, forma_pagamento,
      conciliado, conciliado_em, conciliado_por, created_by,
      company_id, origem
    ) VALUES (
      'TRANSFERENCIA', p_valor, p_data, p_data,
      COALESCE(NULLIF(btrim(p_descricao), ''), 'Transferência de extrato'),
      p_conta_origem_id, p_conta_destino_id, 'REALIZADO', 'TRANSFERENCIA',
      true, now(), v_uid, v_uid, v_company, 'transferencia'
    )
    RETURNING id INTO v_lancamento_id;

    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, user_id, company_id, depois
    ) VALUES (
      'transferencia', v_lancamento_id, 'reconcile_transfer_from_extrato', v_uid, v_company,
      jsonb_build_object(
        'origem', p_conta_origem_id,
        'destino', p_conta_destino_id,
        'valor', p_valor,
        'data', p_data,
        'external_id_used', v_external_id IS NOT NULL
      )
    );
  END IF;

  IF v_external_id IS NOT NULL THEN
    INSERT INTO public.fin_conciliacao_vinculos (
      company_id, conta_id, external_id, tipo, lancamento_id, created_by
    ) VALUES (
      v_company, v_extrato_conta_id, v_external_id, p_external_tipo, v_lancamento_id, v_uid
    )
    ON CONFLICT (company_id, conta_id, external_id, tipo) DO NOTHING;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'EXTERNAL_ID_ALREADY_LINKED: linha bancária vinculada concorrentemente';
    END IF;
  END IF;

  RETURN jsonb_build_object('status', v_status, 'lancamento_id', v_lancamento_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.reconcile_create_transfer_from_extrato(date, numeric, text, uuid, uuid, text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reconcile_create_transfer_from_extrato(date, numeric, text, uuid, uuid, text, text) TO authenticated;

-- Repair the pilot account using natural identifiers only. The block is
-- idempotent and guarded by exact counts/amounts so a changed dataset aborts
-- instead of applying a partial or speculative correction.
DO $migration$
DECLARE
  v_source_id uuid;
  v_target_id uuid;
  v_company_id uuid;
  v_actor_id uuid;
  v_source_count integer;
  v_target_count integer;
  v_ignored_count integer;
  v_stale_count integer;
  v_stale_total numeric;
  v_manual_count integer;
  v_saldo_inicial numeric;
  v_balance_20260828 numeric;
  v_ignored record;
  v_transfer_id uuid;
BEGIN
  SELECT count(*)::integer,
         (array_agg(c.id ORDER BY c.id))[1],
         (array_agg(c.company_id ORDER BY c.id))[1],
         (array_agg(c.created_by ORDER BY c.id))[1]
  INTO v_source_count, v_source_id, v_company_id, v_actor_id
  FROM public.fin_contas c
  WHERE c.ativo = true
    AND c.banco = '033'
    AND regexp_replace(COALESCE(c.numero_conta, ''), '\D', '', 'g') = '130117470';

  IF v_source_count = 0 THEN
    RETURN;
  END IF;
  IF v_source_count <> 1 THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: expected one Santander GM source account, found %', v_source_count;
  END IF;
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: source account has no audit actor';
  END IF;

  SELECT count(*)::integer, (array_agg(c.id ORDER BY c.id))[1]
  INTO v_target_count, v_target_id
  FROM public.fin_contas c
  WHERE c.company_id = v_company_id
    AND c.ativo = true
    AND lower(public.immutable_unaccent(btrim(c.nome))) = 'conta aplicacao';

  IF v_target_count <> 1 THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: expected one CONTA APLICACAO target, found %', v_target_count;
  END IF;

  SELECT count(*)::integer
  INTO v_ignored_count
  FROM public.fin_conciliacao_ignoradas i
  WHERE i.company_id = v_company_id
    AND i.conta_id = v_source_id
    AND (
      lower(public.immutable_unaccent(btrim(i.descricao))) LIKE '%aplicacao contamax%'
      OR lower(public.immutable_unaccent(btrim(i.descricao))) LIKE '%resgate contamax%'
    );

  IF v_ignored_count NOT IN (0, 20) THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: expected 20 or 0 ignored ContaMax rows, found %', v_ignored_count;
  END IF;

  FOR v_ignored IN
    SELECT i.*,
      lower(public.immutable_unaccent(btrim(i.descricao))) AS descricao_normalizada
    FROM public.fin_conciliacao_ignoradas i
    WHERE i.company_id = v_company_id
      AND i.conta_id = v_source_id
      AND (
        lower(public.immutable_unaccent(btrim(i.descricao))) LIKE '%aplicacao contamax%'
        OR lower(public.immutable_unaccent(btrim(i.descricao))) LIKE '%resgate contamax%'
      )
    ORDER BY i.data, i.id
  LOOP
    SELECT l.id INTO v_transfer_id
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.idempotency_key = md5('contamax-ignored:' || v_ignored.id::text);

    IF v_transfer_id IS NULL THEN
      INSERT INTO public.fin_lancamentos (
        tipo, valor, data_competencia, data_pagamento, descricao,
        conta_id, conta_destino_id, forma_pagamento, status,
        conciliado, conciliado_em, conciliado_por, created_by,
        company_id, origem, idempotency_key
      ) VALUES (
        'TRANSFERENCIA', v_ignored.valor, v_ignored.data, v_ignored.data, v_ignored.descricao,
        CASE WHEN v_ignored.descricao_normalizada LIKE '%aplicacao contamax%' THEN v_source_id ELSE v_target_id END,
        CASE WHEN v_ignored.descricao_normalizada LIKE '%aplicacao contamax%' THEN v_target_id ELSE v_source_id END,
        'TRANSFERENCIA', 'REALIZADO', true, v_ignored.ignorado_em, v_ignored.ignorado_por,
        v_ignored.ignorado_por, v_company_id, 'transferencia',
        md5('contamax-ignored:' || v_ignored.id::text)
      )
      RETURNING id INTO v_transfer_id;

      INSERT INTO public.fin_audit_logs (
        entidade, entidade_id, acao, user_id, company_id, depois
      ) VALUES (
        'transferencia', v_transfer_id, 'repair_contamax_ignored',
        v_ignored.ignorado_por, v_company_id,
        jsonb_build_object(
          'ignored_id', v_ignored.id,
          'origem', CASE WHEN v_ignored.descricao_normalizada LIKE '%aplicacao contamax%' THEN v_source_id ELSE v_target_id END,
          'destino', CASE WHEN v_ignored.descricao_normalizada LIKE '%aplicacao contamax%' THEN v_target_id ELSE v_source_id END,
          'valor', v_ignored.valor,
          'data', v_ignored.data,
          'reason', 'ContaMax é transferência e precisa afetar o saldo bancário'
        )
      );
    END IF;

    DELETE FROM public.fin_conciliacao_ignoradas
    WHERE id = v_ignored.id
      AND company_id = v_company_id;
  END LOOP;

  -- Four yield rows existed only in an older Santander export. Their values
  -- total R$0.34 and were later represented by one manual aggregate of R$0.34,
  -- so retaining both doubled the income. Cancel the obsolete detailed rows and
  -- detach their dead FITIDs.
  SELECT count(*)::integer, COALESCE(sum(l.valor), 0)
  INTO v_stale_count, v_stale_total
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.conta_id = v_source_id
    AND l.status = 'REALIZADO'
    AND l.origem = 'conciliacao'
    AND l.tipo = 'RECEITA'
    AND lower(public.immutable_unaccent(btrim(l.descricao))) LIKE '%rendimento liquido de contamax%'
    AND l.data_pagamento BETWEEN date '2026-08-01' AND date '2026-08-31';

  IF v_stale_count NOT IN (0, 4) OR (v_stale_count = 4 AND v_stale_total <> 0.34) THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: stale yields expected 4/R$0.34 or 0, found %/R$%', v_stale_count, v_stale_total;
  END IF;

  IF v_stale_count = 4 THEN
    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
    SELECT
      'lancamentos', l.id, 'cancelar_extrato_obsoleto',
      jsonb_build_object('status', l.status, 'conta_id', l.conta_id, 'valor', l.valor, 'descricao', l.descricao),
      jsonb_build_object('status', 'CANCELADO', 'reason', 'linha ausente no OFX Santander mais recente; rendimento já consolidado em R$0,34'),
      l.created_by, l.company_id
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.conta_id = v_source_id
      AND l.status = 'REALIZADO'
      AND l.origem = 'conciliacao'
      AND l.tipo = 'RECEITA'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) LIKE '%rendimento liquido de contamax%'
      AND l.data_pagamento BETWEEN date '2026-08-01' AND date '2026-08-31';

    DELETE FROM public.fin_conciliacao_vinculos v
    USING public.fin_lancamentos l
    WHERE v.lancamento_id = l.id
      AND l.company_id = v_company_id
      AND l.conta_id = v_source_id
      AND l.status = 'REALIZADO'
      AND l.origem = 'conciliacao'
      AND l.tipo = 'RECEITA'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) LIKE '%rendimento liquido de contamax%'
      AND l.data_pagamento BETWEEN date '2026-08-01' AND date '2026-08-31';

    UPDATE public.fin_lancamentos l
    SET status = 'CANCELADO',
        conciliado = false,
        conciliado_em = NULL,
        conciliado_por = NULL,
        justificativa_edicao = 'Cancelado: linha ausente no OFX Santander mais recente; rendimento já consolidado em R$0,34.'
    WHERE l.company_id = v_company_id
      AND l.conta_id = v_source_id
      AND l.status = 'REALIZADO'
      AND l.origem = 'conciliacao'
      AND l.tipo = 'RECEITA'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) LIKE '%rendimento liquido de contamax%'
      AND l.data_pagamento BETWEEN date '2026-08-01' AND date '2026-08-31';
  END IF;

  -- Keep the one valid R$0.34 aggregate, but in the investment account where
  -- the yield actually accrued (not in the current account statement).
  SELECT count(*)::integer
  INTO v_manual_count
  FROM public.fin_lancamentos l
  WHERE l.company_id = v_company_id
    AND l.conta_id = v_source_id
    AND l.status = 'REALIZADO'
    AND l.origem = 'manual'
    AND l.tipo = 'RECEITA'
    AND l.valor = 0.34
    AND l.data_pagamento = date '2026-08-24'
    AND lower(public.immutable_unaccent(btrim(l.descricao))) = 'rendimento contamax';

  IF v_manual_count NOT IN (0, 1) THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: expected one or zero manual R$0.34 yield, found %', v_manual_count;
  END IF;

  IF v_manual_count = 1 THEN
    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
    SELECT
      'lancamentos', l.id, 'mover_rendimento_contamax',
      jsonb_build_object('conta_id', l.conta_id, 'valor', l.valor),
      jsonb_build_object('conta_id', v_target_id, 'valor', l.valor, 'reason', 'rendimento pertence à conta de investimento'),
      l.created_by, l.company_id
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.conta_id = v_source_id
      AND l.status = 'REALIZADO'
      AND l.origem = 'manual'
      AND l.tipo = 'RECEITA'
      AND l.valor = 0.34
      AND l.data_pagamento = date '2026-08-24'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) = 'rendimento contamax';

    UPDATE public.fin_lancamentos l
    SET conta_id = v_target_id,
        justificativa_edicao = 'Rendimento ContaMax reclassificado para a conta de investimento; correção da conciliação Santander.'
    WHERE l.company_id = v_company_id
      AND l.conta_id = v_source_id
      AND l.status = 'REALIZADO'
      AND l.origem = 'manual'
      AND l.tipo = 'RECEITA'
      AND l.valor = 0.34
      AND l.data_pagamento = date '2026-08-24'
      AND lower(public.immutable_unaccent(btrim(l.descricao))) = 'rendimento contamax';
  END IF;

  -- The original balance was zero before a manual attempt to compensate for
  -- ignored ContaMax movements changed it to R$33,164.29. Restore the proven
  -- opening balance from the August OFX (R$0.00).
  SELECT c.saldo_inicial INTO v_saldo_inicial
  FROM public.fin_contas c
  WHERE c.id = v_source_id
    AND c.company_id = v_company_id;

  IF v_saldo_inicial NOT IN (0, 33164.29) THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: unexpected Santander GM initial balance R$%', v_saldo_inicial;
  END IF;

  IF v_saldo_inicial = 33164.29 THEN
    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, user_id, company_id)
    VALUES (
      'contas_bancarias', v_source_id, 'corrigir_saldo_inicial_contamax',
      jsonb_build_object('saldo_inicial', v_saldo_inicial),
      jsonb_build_object('saldo_inicial', 0, 'reason', 'OFX agosto abre em R$0,00; valor anterior compensava movimentos ContaMax ignorados'),
      v_actor_id, v_company_id
    );

    UPDATE public.fin_contas
    SET saldo_inicial = 0,
        updated_at = now()
    WHERE id = v_source_id
      AND company_id = v_company_id;
  END IF;

  SELECT c.saldo_inicial + COALESCE(sum(
    CASE
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_id = v_source_id THEN -l.valor
      WHEN l.tipo = 'TRANSFERENCIA' AND l.conta_destino_id = v_source_id THEN l.valor
      WHEN l.tipo = 'RECEITA' AND l.conta_id = v_source_id THEN l.valor
      WHEN l.tipo = 'DESPESA' AND l.conta_id = v_source_id THEN -l.valor
      ELSE 0
    END
  ), 0)
  INTO v_balance_20260828
  FROM public.fin_contas c
  LEFT JOIN public.fin_lancamentos l
    ON l.company_id = c.company_id
    AND l.status IN ('REALIZADO', 'CONCILIADO')
    AND (l.conta_id = c.id OR l.conta_destino_id = c.id)
    AND COALESCE(l.data_pagamento, l.conciliado_em::date, l.data_competencia) <= date '2026-08-28'
  WHERE c.id = v_source_id
    AND c.company_id = v_company_id
  GROUP BY c.saldo_inicial;

  IF v_balance_20260828 <> 0 THEN
    RAISE EXCEPTION 'CONTAMAX_REPAIR_ABORTED: Santander GM must close 2026-08-28 at R$0.00, got R$%', v_balance_20260828;
  END IF;
END;
$migration$;

DO $validation$
BEGIN
  IF to_regprocedure('public.reconcile_ignorar_lancamento(uuid,date,numeric,text,text,uuid)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_ignorar_lancamento: expected signature missing';
  END IF;
  IF to_regprocedure('public.reconcile_create_transfer_from_extrato(date,numeric,text,uuid,uuid,text,text)') IS NULL THEN
    RAISE EXCEPTION 'reconcile_create_transfer_from_extrato: expected signature missing';
  END IF;
END;
$validation$;

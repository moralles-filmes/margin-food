-- ─────────────────────────────────────────────────────────────────────────────
-- Financeiro — criações protegidas contra duplo clique e reenvio.
--
-- Mesmo padrão de `op_registrar_movimentacao`:
--   · a chave vem DERIVADA do cliente (semente da tela + identidade da operação);
--   · caminho rápido por SELECT, mas a garantia real é o índice único parcial com
--     company_id — check-then-insert sozinho não é idempotente;
--   · unique_violation DO ÍNDICE DA CHAVE é tratado como reenvio e devolve o
--     registro original (qualquer outra violação continua sendo erro);
--   · chave reaproveitada para outra operação → REQUEST_ID_REUTILIZADO.
--
-- Todos os parâmetros novos têm DEFAULT: o front publicado hoje, que não envia
-- chave, continua funcionando sem idempotência até o merge.
--
--   1. _guarded_upsert_lancamento  — p_idempotency_key (Livro Razão, criação)
--   2. create_transfer             — p_idempotency_key (transferência manual)
--   3. _guarded_create_conta_pagar/_receber — p_idempotency_key; só o título pai
--      guarda a chave, então um reenvio não duplica as N parcelas
--   4. reconcile_create_titulo_from_extrato — novo: título já baixado a partir de
--      uma linha do extrato, atômico e com o lançamento como chave (UNIQUE em
--      lancamento_id nos títulos). Substitui o INSERT direto do diálogo.
--   5. gerar_parcela_recorrente    — p_parcela_esperada: o cliente diz qual
--      parcela está pedindo; reenvio devolve a mesma parcela em vez da seguinte
--   6. reconcile_import_lancamento — só o tratamento de unique_violation
--      (corrida entre duas chamadas com a mesma chave); resto do corpo intocado
--
-- Os corpos partem de pg_get_functiondef do banco vivo (2026-09-29), não das
-- migrations antigas. Gates: has_any_permission([chave granular, legado,
-- 'system:global:manage']); has_permission não expande system:global:manage.
-- GRANTs no arquivo seguinte.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Preflight: os índices únicos abaixo não podem nascer sobre duplicatas ───────
DO $preflight$
DECLARE
  v_dup_cp integer;
  v_dup_cr integer;
BEGIN
  SELECT count(*) INTO v_dup_cp FROM (
    SELECT 1 FROM public.fin_contas_pagar
    WHERE lancamento_id IS NOT NULL
    GROUP BY company_id, lancamento_id HAVING count(*) > 1
  ) d;
  SELECT count(*) INTO v_dup_cr FROM (
    SELECT 1 FROM public.fin_contas_receber
    WHERE lancamento_id IS NOT NULL
    GROUP BY company_id, lancamento_id HAVING count(*) > 1
  ) d;
  IF v_dup_cp > 0 OR v_dup_cr > 0 THEN
    RAISE EXCEPTION 'PREFLIGHT: lançamentos com mais de um título vinculado (CP=%, CR=%)', v_dup_cp, v_dup_cr;
  END IF;
END
$preflight$;

-- ── Chave dos títulos ────────────────────────────────────────────────────────
-- Só o título pai (parcela 1) guarda a chave; as parcelas filhas nascem na mesma
-- transação e não precisam dela.
ALTER TABLE public.fin_contas_pagar ADD COLUMN IF NOT EXISTS idempotency_key text;
ALTER TABLE public.fin_contas_receber ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_contas_pagar_idempotency
  ON public.fin_contas_pagar (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_contas_receber_idempotency
  ON public.fin_contas_receber (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- Um lançamento do razão é a baixa de no máximo um título. Sem isso, repetir
-- "criar conta a pagar a partir do extrato" gravava um segundo título PAGO para
-- a mesma linha bancária (o lançamento era idempotente, o título não).
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_contas_pagar_lancamento
  ON public.fin_contas_pagar (company_id, lancamento_id)
  WHERE lancamento_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_contas_receber_lancamento
  ON public.fin_contas_receber (company_id, lancamento_id)
  WHERE lancamento_id IS NOT NULL;

-- ═════════════════════════════════════════════════════════════════════════════
-- 1. Livro Razão — novo lançamento
-- ═════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamp with time zone, text);

CREATE FUNCTION public._guarded_upsert_lancamento(
  p_id uuid DEFAULT NULL::uuid,
  p_tipo text DEFAULT 'DESPESA'::text,
  p_status text DEFAULT 'PREVISTO'::text,
  p_valor numeric DEFAULT 0,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_data_competencia date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  p_data_vencimento date DEFAULT NULL::date,
  p_data_pagamento date DEFAULT NULL::date,
  p_descricao text DEFAULT ''::text,
  p_observacoes text DEFAULT NULL::text,
  p_forma_pagamento text DEFAULT 'pix'::text,
  p_origem text DEFAULT 'manual'::text,
  p_recorrente boolean DEFAULT false,
  p_recorrencia_config jsonb DEFAULT NULL::jsonb,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_updated_at timestamp with time zone DEFAULT NULL::timestamp with time zone,
  p_justificativa_edicao text DEFAULT NULL::text,
  p_idempotency_key text DEFAULT NULL::text
)
 RETURNS TABLE(id uuid, updated_at timestamp with time zone, idempotente boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  _company_id uuid;
  _user_id uuid;
  _v_id uuid;
  _v_updated_at timestamptz;
  _existing record;
  _request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  _idem_key text;
  _replay boolean := false;
  _constraint text;
BEGIN
  _user_id := auth.uid();
  IF _user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  _company_id := public.assert_tenant();

  -- Permission check
  IF p_id IS NULL THEN
    IF NOT public.has_any_permission(_user_id, ARRAY[
      'financeiro:lancamentos:create', 'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:create';
    END IF;
  ELSE
    IF NOT public.has_any_permission(_user_id, ARRAY[
      'financeiro:lancamentos:edit', 'finance:manage', 'system:global:manage'
    ]) THEN
      RAISE EXCEPTION 'Permission denied: financeiro:lancamentos:edit';
    END IF;

    -- Fetch existing for optimistic locking
    SELECT fl.* INTO _existing
    FROM public.fin_lancamentos fl
    WHERE fl.id = p_id AND fl.company_id = _company_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Lancamento not found';
    END IF;

    -- Block editing conciliados
    IF _existing.conciliado = true THEN
      RAISE EXCEPTION 'Lançamento conciliado não pode ser editado. Desconcilie primeiro.';
    END IF;

    -- Optimistic locking
    IF p_updated_at IS NOT NULL AND _existing.updated_at != p_updated_at THEN
      RAISE EXCEPTION 'CONFLICT: Registro alterado por outro usuário';
    END IF;
  END IF;

  IF p_id IS NULL THEN
    -- Chave só vale para criação. Prefixo próprio: fin_lancamentos.idempotency_key
    -- é compartilhada com a conciliação (md5) e a recorrência ('recorrencia:').
    IF _request_key IS NOT NULL THEN
      IF length(_request_key) > 200 THEN
        RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
      END IF;
      _idem_key := 'manual:' || _request_key;

      SELECT fl.id, fl.updated_at, fl.tipo, fl.valor, fl.conta_id, fl.data_competencia,
             fl.descricao, fl.categoria_id
        INTO _existing
      FROM public.fin_lancamentos fl
      WHERE fl.company_id = _company_id AND fl.idempotency_key = _idem_key;
      _replay := FOUND;
    END IF;

    IF NOT _replay THEN
      BEGIN
        INSERT INTO public.fin_lancamentos (
          tipo, status, valor, conta_id, categoria_id, centro_custo_id,
          data_competencia, data_vencimento, data_pagamento,
          descricao, observacoes, forma_pagamento, origem,
          recorrente, recorrencia_config,
          created_by, company_id, idempotency_key
        ) VALUES (
          p_tipo, p_status, p_valor, p_conta_id, p_categoria_id, p_centro_custo_id,
          p_data_competencia, p_data_vencimento, p_data_pagamento,
          p_descricao, p_observacoes, p_forma_pagamento, p_origem,
          p_recorrente, p_recorrencia_config,
          _user_id, _company_id, _idem_key
        )
        RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
        INTO _v_id, _v_updated_at;
      EXCEPTION WHEN unique_violation THEN
        -- Outra chamada com a mesma chave gravou entre o SELECT e este INSERT.
        GET STACKED DIAGNOSTICS _constraint = CONSTRAINT_NAME;
        IF _idem_key IS NULL OR _constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
          RAISE;
        END IF;
        SELECT fl.id, fl.updated_at, fl.tipo, fl.valor, fl.conta_id, fl.data_competencia,
               fl.descricao, fl.categoria_id
          INTO _existing
        FROM public.fin_lancamentos fl
        WHERE fl.company_id = _company_id AND fl.idempotency_key = _idem_key;
        IF NOT FOUND THEN
          RAISE;
        END IF;
        _replay := true;
      END;
    END IF;

    IF _replay THEN
      -- Só é reenvio se descrever a MESMA operação.
      IF _existing.tipo IS DISTINCT FROM p_tipo
         OR round(_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
         OR _existing.conta_id IS DISTINCT FROM p_conta_id
         OR _existing.data_competencia IS DISTINCT FROM p_data_competencia
         OR _existing.descricao IS DISTINCT FROM p_descricao
         OR _existing.categoria_id IS DISTINCT FROM p_categoria_id THEN
        RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
      END IF;
      RETURN QUERY SELECT _existing.id, _existing.updated_at, true;
      RETURN;
    END IF;
  ELSE
    -- UPDATE
    UPDATE public.fin_lancamentos SET
      tipo = p_tipo,
      status = p_status,
      valor = p_valor,
      conta_id = p_conta_id,
      categoria_id = p_categoria_id,
      centro_custo_id = p_centro_custo_id,
      data_competencia = p_data_competencia,
      data_vencimento = p_data_vencimento,
      data_pagamento = p_data_pagamento,
      descricao = p_descricao,
      observacoes = p_observacoes,
      forma_pagamento = p_forma_pagamento,
      recorrente = p_recorrente,
      recorrencia_config = p_recorrencia_config,
      justificativa_edicao = p_justificativa_edicao,
      updated_at = now()
    WHERE fin_lancamentos.id = p_id AND company_id = _company_id
    RETURNING fin_lancamentos.id, fin_lancamentos.updated_at
    INTO _v_id, _v_updated_at;
  END IF;

  -- Handle rateios atomically
  IF _v_id IS NOT NULL THEN
    DELETE FROM public.fin_lancamento_rateios WHERE lancamento_id = _v_id AND company_id = _company_id;

    IF p_rateios IS NOT NULL AND jsonb_array_length(p_rateios) > 0 THEN
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      )
      SELECT
        _v_id,
        (r->>'categoria_id')::uuid,
        NULLIF(r->>'centro_custo_id', '')::uuid,
        (r->>'valor')::numeric,
        (r->>'percentual')::numeric,
        NULLIF(r->>'observacao', ''),
        _company_id
      FROM jsonb_array_elements(p_rateios) AS r;
    END IF;

    -- Na criação _existing não tem a linha inteira (só o SELECT da chave), então
    -- a auditoria de cada caminho fica num ramo próprio.
    IF p_id IS NULL THEN
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
      VALUES (
        'lancamentos', _v_id, 'criar',
        jsonb_build_object(
          'tipo', p_tipo, 'status', p_status, 'valor', p_valor,
          'conta_id', p_conta_id, 'categoria_id', p_categoria_id,
          'data_competencia', p_data_competencia, 'descricao', p_descricao,
          'origem', p_origem, 'rateios', jsonb_array_length(coalesce(p_rateios, '[]'::jsonb))
        ),
        _user_id, _company_id
      );
    ELSE
      INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
      VALUES (
        'lancamentos', _v_id, 'editar',
        jsonb_build_object(
          'tipo', _existing.tipo, 'status', _existing.status, 'valor', _existing.valor,
          'conta_id', _existing.conta_id, 'categoria_id', _existing.categoria_id,
          'data_competencia', _existing.data_competencia, 'descricao', _existing.descricao
        ),
        jsonb_build_object(
          'tipo', p_tipo, 'status', p_status, 'valor', p_valor,
          'conta_id', p_conta_id, 'categoria_id', p_categoria_id,
          'data_competencia', p_data_competencia, 'descricao', p_descricao,
          'rateios', jsonb_array_length(coalesce(p_rateios, '[]'::jsonb))
        ),
        coalesce(p_justificativa_edicao, ''),
        _user_id, _company_id
      );
    END IF;
  END IF;

  RETURN QUERY SELECT _v_id, _v_updated_at, false;
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 2. Transferência manual (Livro Razão)
-- ═════════════════════════════════════════════════════════════════════════════
-- Sem dedupe por conteúdo de propósito: duas transferências manuais iguais no
-- mesmo dia são legítimas. A deduplicação por valor/data de
-- reconcile_create_transfer existe porque lá as duas pontas vêm de dois extratos.
DROP FUNCTION IF EXISTS public.create_transfer(uuid, uuid, numeric, date, text, uuid);

CREATE FUNCTION public.create_transfer(
  p_conta_origem uuid,
  p_conta_destino uuid,
  p_valor numeric,
  p_data date,
  p_descricao text,
  p_created_by uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_id uuid;
  v_company uuid;
  v_uid uuid;
  v_request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_idem_key text;
  v_existing record;
  v_replay boolean := false;
  v_constraint text;
BEGIN
  v_company := public.assert_tenant();
  v_uid := auth.uid();
  IF v_uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
  IF NOT public.has_any_permission(v_uid, ARRAY[
    'financeiro:lancamentos:create', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:lancamentos:create';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Valor deve ser positivo'; END IF;
  IF p_conta_origem = p_conta_destino THEN
    RAISE EXCEPTION 'Conta origem e destino devem ser diferentes em transferências';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_origem AND company_id = v_company) THEN RAISE EXCEPTION 'Conta origem não encontrada'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_contas WHERE id = p_conta_destino AND company_id = v_company) THEN RAISE EXCEPTION 'Conta destino não encontrada'; END IF;

  IF v_request_key IS NOT NULL THEN
    IF length(v_request_key) > 200 THEN RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA'; END IF;
    v_idem_key := 'transferencia_manual:' || v_request_key;

    SELECT l.id, l.tipo, l.conta_id, l.conta_destino_id, l.valor, l.data_competencia, l.descricao
      INTO v_existing
    FROM public.fin_lancamentos l
    WHERE l.company_id = v_company AND l.idempotency_key = v_idem_key;
    v_replay := FOUND;
  END IF;

  IF NOT v_replay THEN
    BEGIN
      -- created_by vem sempre da sessão: p_created_by fica só pela assinatura
      -- (SECURITY DEFINER aceitava gravar a autoria em nome de outra pessoa).
      INSERT INTO public.fin_lancamentos (tipo, valor, data_competencia, descricao, conta_id, conta_destino_id, status, created_by, company_id, idempotency_key)
      VALUES ('TRANSFERENCIA', p_valor, p_data, COALESCE(p_descricao,'Transferência'), p_conta_origem, p_conta_destino, 'REALIZADO', v_uid, v_company, v_idem_key)
      RETURNING id INTO v_id;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_idem_key IS NULL OR v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN
        RAISE;
      END IF;
      SELECT l.id, l.tipo, l.conta_id, l.conta_destino_id, l.valor, l.data_competencia, l.descricao
        INTO v_existing
      FROM public.fin_lancamentos l
      WHERE l.company_id = v_company AND l.idempotency_key = v_idem_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      v_replay := true;
    END;
  END IF;

  IF v_replay THEN
    IF v_existing.tipo IS DISTINCT FROM 'TRANSFERENCIA'
       OR v_existing.conta_id IS DISTINCT FROM p_conta_origem
       OR v_existing.conta_destino_id IS DISTINCT FROM p_conta_destino
       OR round(v_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
       OR v_existing.data_competencia IS DISTINCT FROM p_data
       OR v_existing.descricao IS DISTINCT FROM COALESCE(p_descricao, 'Transferência') THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object('id', v_existing.id, 'idempotente', true);
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES ('transferencia', v_id, 'criar', jsonb_build_object(
    'origem', p_conta_origem, 'destino', p_conta_destino,
    'valor', p_valor, 'data', p_data, 'modelo', 'registro_unico'
  ), v_uid, v_company);

  RETURN jsonb_build_object('id', v_id, 'idempotente', false);
END; $function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3a. Contas a Pagar — criação (inclusive parcelada)
-- ═════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public._guarded_create_conta_pagar(text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb);

CREATE FUNCTION public._guarded_create_conta_pagar(
  p_descricao text,
  p_valor numeric,
  p_fornecedor text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_data_vencimento date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'boleto'::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb,
  p_idempotency_key text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_status text;
  v_threshold numeric;
  v_id uuid;
  v_child_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_forn text;
  v_obs text;
  v_rateios jsonb;
  v_recorrencia jsonb;
  v_frequency text;
  v_total integer := 1;
  v_index integer;
  v_due_date date;
  v_competence_date date;
  r record;
  v_request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing record;
  v_replay boolean := false;
  v_constraint text;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:pagar:create', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Permission denied: financeiro:pagar:create';
  END IF;

  v_desc := public.strip_html(p_descricao);
  v_forn := public.strip_html(p_fornecedor);
  v_obs := public.strip_html(p_observacoes);

  IF length(btrim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas
    WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_recorrencia := public.fin_validate_recorrencia_config(p_recorrencia);
  IF v_recorrencia IS NOT NULL THEN
    v_frequency := v_recorrencia->>'frequencia';
    v_total := (v_recorrencia->>'parcelas')::integer;
  END IF;

  IF v_request_key IS NOT NULL THEN
    IF length(v_request_key) > 200 THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
    END IF;
    SELECT cp.id, cp.status, cp.created_at, cp.valor, cp.data_vencimento, cp.parcela_total,
           cp.descricao, cp.categoria_id, cp.supplier_id
      INTO v_existing
    FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company_id AND cp.idempotency_key = v_request_key;
    v_replay := FOUND;
  END IF;

  v_threshold := public.fin_get_limite_aprovacao(v_company_id);
  v_status := CASE WHEN p_valor > v_threshold THEN 'AGUARDANDO_APROVACAO' ELSE 'APROVADO' END;

  IF NOT v_replay THEN
    BEGIN
      INSERT INTO public.fin_contas_pagar (
        descricao, valor, fornecedor, supplier_id,
        data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, idempotency_key
      ) VALUES (
        v_desc, p_valor, v_forn, p_supplier_id,
        p_data_vencimento, p_data_competencia,
        p_categoria_id, p_centro_custo_id, p_conta_id,
        p_forma_pagamento, v_obs, v_status,
        v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
        CASE WHEN v_recorrencia IS NOT NULL THEN 1 END,
        CASE WHEN v_recorrencia IS NOT NULL THEN v_total END,
        v_request_key
      )
      RETURNING id, created_at INTO v_id, v_created_at;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_request_key IS NULL OR v_constraint IS DISTINCT FROM 'uq_fin_contas_pagar_idempotency' THEN
        RAISE;
      END IF;
      SELECT cp.id, cp.status, cp.created_at, cp.valor, cp.data_vencimento, cp.parcela_total,
             cp.descricao, cp.categoria_id, cp.supplier_id
        INTO v_existing
      FROM public.fin_contas_pagar cp
      WHERE cp.company_id = v_company_id AND cp.idempotency_key = v_request_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      v_replay := true;
    END;
  END IF;

  IF v_replay THEN
    -- Só é reenvio se descrever a MESMA operação.
    IF round(v_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
       OR v_existing.data_vencimento IS DISTINCT FROM p_data_vencimento
       OR coalesce(v_existing.parcela_total, 1) IS DISTINCT FROM v_total
       OR v_existing.descricao IS DISTINCT FROM v_desc
       OR v_existing.categoria_id IS DISTINCT FROM p_categoria_id
       OR v_existing.supplier_id IS DISTINCT FROM p_supplier_id THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'status', v_existing.status,
      'created_at', v_existing.created_at,
      'limite_aprovacao', v_threshold,
      'lancamentos_criados', (
        SELECT count(*) FROM public.fin_contas_pagar cp
        WHERE cp.company_id = v_company_id
          AND (cp.id = v_existing.id OR cp.lancamento_pai_id = v_existing.id)
      ),
      'idempotente', true
    );
  END IF;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  IF v_recorrencia IS NOT NULL THEN
    FOR v_index IN 2..v_total LOOP
      v_due_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_vencimento + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_vencimento + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_vencimento + ((v_index - 1) * 15)
      END;
      v_competence_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_competencia + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_competencia + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_competencia + ((v_index - 1) * 15)
      END;

      INSERT INTO public.fin_contas_pagar (
        descricao, valor, fornecedor, supplier_id,
        data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, lancamento_pai_id
      ) VALUES (
        v_desc || ' (' || v_index || '/' || v_total || ')',
        p_valor, v_forn, p_supplier_id,
        v_due_date, v_competence_date,
        p_categoria_id, p_centro_custo_id, p_conta_id,
        p_forma_pagamento, v_obs, v_status,
        v_user_id, v_company_id, false, NULL,
        v_index, v_total, v_id
      ) RETURNING id INTO v_child_id;

      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      )
      SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id
      FROM public.fin_lancamento_rateios
      WHERE lancamento_id = v_id AND company_id = v_company_id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES (
    'contas_pagar', v_id, 'criar',
    jsonb_build_object(
      'descricao', v_desc,
      'valor', p_valor,
      'status', v_status,
      'limite_aprovacao', v_threshold,
      'lancamentos_criados', v_total
    ),
    v_user_id, v_company_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'status', v_status,
    'created_at', v_created_at,
    'limite_aprovacao', v_threshold,
    'lancamentos_criados', v_total,
    'idempotente', false
  );
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 3b. Contas a Receber — criação (inclusive parcelada)
-- ═════════════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS public._guarded_create_conta_receber(text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid);

CREATE FUNCTION public._guarded_create_conta_receber(
  p_descricao text,
  p_cliente text DEFAULT NULL::text,
  p_valor numeric DEFAULT 0,
  p_data_vencimento date DEFAULT ((now() AT TIME ZONE 'America/Sao_Paulo'::text))::date,
  p_data_competencia date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_centro_custo_id uuid DEFAULT NULL::uuid,
  p_conta_id uuid DEFAULT NULL::uuid,
  p_forma_pagamento text DEFAULT 'pix'::text,
  p_observacoes text DEFAULT NULL::text,
  p_rateios jsonb DEFAULT '[]'::jsonb,
  p_recorrencia jsonb DEFAULT NULL::jsonb,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_idempotency_key text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company_id uuid;
  v_user_id uuid;
  v_id uuid;
  v_child_id uuid;
  v_created_at timestamptz;
  v_desc text;
  v_cliente text;
  v_obs text;
  v_rateios jsonb;
  v_recorrencia jsonb;
  v_frequency text;
  v_total integer := 1;
  v_index integer;
  v_due_date date;
  v_competence_date date;
  r record;
  v_request_key text := nullif(btrim(coalesce(p_idempotency_key, '')), '');
  v_existing record;
  v_replay boolean := false;
  v_constraint text;
BEGIN
  v_company_id := public.assert_tenant();
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  IF NOT public.has_any_permission(v_user_id, ARRAY[
    'financeiro:receber:create', 'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'Permission denied: financeiro:receber:create';
  END IF;

  v_desc := public.strip_html(p_descricao);
  v_cliente := public.strip_html(p_cliente);
  v_obs := public.strip_html(p_observacoes);

  IF length(btrim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  IF p_valor <= 0 THEN
    RAISE EXCEPTION 'Valor deve ser positivo';
  END IF;

  IF p_conta_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_contas
    WHERE id = p_conta_id AND company_id = v_company_id
  ) THEN
    RAISE EXCEPTION 'NOT_FOUND: conta bancária não pertence à empresa';
  END IF;

  v_recorrencia := public.fin_validate_recorrencia_config(p_recorrencia);
  IF v_recorrencia IS NOT NULL THEN
    v_frequency := v_recorrencia->>'frequencia';
    v_total := (v_recorrencia->>'parcelas')::integer;
  END IF;

  IF v_request_key IS NOT NULL THEN
    IF length(v_request_key) > 200 THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_INVALIDA';
    END IF;
    SELECT cr.id, cr.created_at, cr.valor, cr.data_vencimento, cr.parcela_total,
           cr.descricao, cr.categoria_id, cr.cliente
      INTO v_existing
    FROM public.fin_contas_receber cr
    WHERE cr.company_id = v_company_id AND cr.idempotency_key = v_request_key;
    v_replay := FOUND;
  END IF;

  IF NOT v_replay THEN
    BEGIN
      INSERT INTO public.fin_contas_receber (
        descricao, cliente, valor, data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id, supplier_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, idempotency_key
      ) VALUES (
        v_desc, v_cliente, p_valor, p_data_vencimento, p_data_competencia,
        p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id,
        p_forma_pagamento, v_obs, 'A_RECEBER',
        v_user_id, v_company_id, v_recorrencia IS NOT NULL, v_recorrencia,
        CASE WHEN v_recorrencia IS NOT NULL THEN 1 END,
        CASE WHEN v_recorrencia IS NOT NULL THEN v_total END,
        v_request_key
      )
      RETURNING id, created_at INTO v_id, v_created_at;
    EXCEPTION WHEN unique_violation THEN
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_request_key IS NULL OR v_constraint IS DISTINCT FROM 'uq_fin_contas_receber_idempotency' THEN
        RAISE;
      END IF;
      SELECT cr.id, cr.created_at, cr.valor, cr.data_vencimento, cr.parcela_total,
             cr.descricao, cr.categoria_id, cr.cliente
        INTO v_existing
      FROM public.fin_contas_receber cr
      WHERE cr.company_id = v_company_id AND cr.idempotency_key = v_request_key;
      IF NOT FOUND THEN
        RAISE;
      END IF;
      v_replay := true;
    END;
  END IF;

  IF v_replay THEN
    -- Só é reenvio se descrever a MESMA operação.
    IF round(v_existing.valor, 2) IS DISTINCT FROM round(p_valor, 2)
       OR v_existing.data_vencimento IS DISTINCT FROM p_data_vencimento
       OR coalesce(v_existing.parcela_total, 1) IS DISTINCT FROM v_total
       OR v_existing.descricao IS DISTINCT FROM v_desc
       OR v_existing.categoria_id IS DISTINCT FROM p_categoria_id
       OR v_existing.cliente IS DISTINCT FROM v_cliente THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object(
      'id', v_existing.id,
      'created_at', v_existing.created_at,
      'lancamentos_criados', (
        SELECT count(*) FROM public.fin_contas_receber cr
        WHERE cr.company_id = v_company_id
          AND (cr.id = v_existing.id OR cr.lancamento_pai_id = v_existing.id)
      ),
      'idempotente', true
    );
  END IF;

  v_rateios := CASE
    WHEN p_rateios IS NOT NULL AND jsonb_typeof(p_rateios) = 'array' THEN p_rateios
    ELSE '[]'::jsonb
  END;

  IF jsonb_array_length(v_rateios) > 0 THEN
    FOR r IN SELECT * FROM jsonb_to_recordset(v_rateios) AS x(
      categoria_id uuid, centro_custo_id uuid, valor numeric, percentual numeric
    ) LOOP
      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, company_id
      ) VALUES (
        v_id, r.categoria_id, r.centro_custo_id, r.valor, r.percentual, v_company_id
      );
    END LOOP;
  END IF;

  IF v_recorrencia IS NOT NULL THEN
    FOR v_index IN 2..v_total LOOP
      v_due_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_vencimento + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_vencimento + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_vencimento + ((v_index - 1) * 15)
      END;
      v_competence_date := CASE v_frequency
        WHEN 'mensal' THEN (p_data_competencia + make_interval(months => v_index - 1))::date
        WHEN 'semanal' THEN p_data_competencia + ((v_index - 1) * 7)
        WHEN 'quinzenal' THEN p_data_competencia + ((v_index - 1) * 15)
      END;

      INSERT INTO public.fin_contas_receber (
        descricao, cliente, valor, data_vencimento, data_competencia,
        categoria_id, centro_custo_id, conta_id, supplier_id,
        forma_pagamento, observacoes, status,
        created_by, company_id, recorrente, recorrencia_config,
        parcela_atual, parcela_total, lancamento_pai_id
      ) VALUES (
        v_desc || ' (' || v_index || '/' || v_total || ')',
        v_cliente, p_valor, v_due_date, v_competence_date,
        p_categoria_id, p_centro_custo_id, p_conta_id, p_supplier_id,
        p_forma_pagamento, v_obs, 'A_RECEBER',
        v_user_id, v_company_id, false, NULL,
        v_index, v_total, v_id
      ) RETURNING id INTO v_child_id;

      INSERT INTO public.fin_lancamento_rateios (
        lancamento_id, categoria_id, centro_custo_id, valor, percentual, observacao, company_id
      )
      SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id
      FROM public.fin_lancamento_rateios
      WHERE lancamento_id = v_id AND company_id = v_company_id;
    END LOOP;
  END IF;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
  VALUES (
    'contas_receber', v_id, 'criar',
    jsonb_build_object(
      'descricao', v_desc,
      'valor', p_valor,
      'cliente', v_cliente,
      'lancamentos_criados', v_total
    ),
    v_user_id, v_company_id
  );

  RETURN jsonb_build_object(
    'id', v_id,
    'created_at', v_created_at,
    'lancamentos_criados', v_total,
    'idempotente', false
  );
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 4. Extrato → título já baixado (Conciliação → "Criar lançamento")
-- ═════════════════════════════════════════════════════════════════════════════
-- O lançamento vem de reconcile_import_lancamento (idempotente por FITID/chave
-- legada); o título era um INSERT direto do diálogo, seguido de dois UPDATEs.
-- Aqui os dois passos viram uma transação e o lançamento é a chave: repetir a
-- ação devolve o título já criado. Valor e conta vêm do lançamento, nunca do
-- cliente — o título é a identificação da baixa que já está no razão.
CREATE OR REPLACE FUNCTION public.reconcile_create_titulo_from_extrato(
  p_lancamento_id uuid,
  p_destino text,
  p_descricao text,
  p_data_vencimento date DEFAULT NULL::date,
  p_data_competencia date DEFAULT NULL::date,
  p_data_baixa date DEFAULT NULL::date,
  p_categoria_id uuid DEFAULT NULL::uuid,
  p_supplier_id uuid DEFAULT NULL::uuid,
  p_cliente text DEFAULT NULL::text,
  p_observacoes text DEFAULT NULL::text
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_uid uuid;
  v_lanc record;
  v_tipo_esperado text;
  v_modulo text;
  v_origem text;
  v_titulo_id uuid;
  v_outro_id uuid;
  v_desc text;
  v_obs text;
  v_cliente text;
  v_competencia date;
  v_vencimento date;
  v_baixa date;
  v_idempotente boolean := false;
  v_divergente boolean;
  v_constraint text;
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

  IF p_destino IS NULL OR p_destino NOT IN ('conta_pagar', 'conta_receber') THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: destino inválido';
  END IF;
  v_tipo_esperado := CASE p_destino WHEN 'conta_pagar' THEN 'DESPESA' ELSE 'RECEITA' END;
  v_modulo := CASE p_destino WHEN 'conta_pagar' THEN 'contas_pagar' ELSE 'contas_receber' END;
  v_origem := CASE p_destino WHEN 'conta_pagar' THEN 'espelho_cp' ELSE 'espelho_cr' END;

  -- Trava o lançamento: duas chamadas para a mesma linha do extrato serializam
  -- aqui, e a segunda enxerga o título criado pela primeira.
  SELECT l.id, l.tipo, l.status, l.valor, l.conta_id, l.data_competencia,
         l.data_pagamento, l.origem, l.referencia_modulo, l.referencia_id
    INTO v_lanc
  FROM public.fin_lancamentos l
  WHERE l.id = p_lancamento_id AND l.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND: lançamento'; END IF;

  IF v_lanc.tipo IS DISTINCT FROM v_tipo_esperado THEN
    RAISE EXCEPTION 'VALIDATION_ERROR: lançamento % não pode virar %', v_lanc.tipo, v_modulo;
  END IF;
  IF v_lanc.conta_id IS NULL THEN
    RAISE EXCEPTION 'CONTA_OBRIGATORIA';
  END IF;

  -- Valores do título, calculados antes da busca: um reenvio é comparado com eles.
  v_desc := public.strip_html(p_descricao);
  IF v_desc IS NULL OR length(btrim(v_desc)) = 0 THEN
    RAISE EXCEPTION 'Descrição é obrigatória';
  END IF;
  v_obs := NULLIF(public.strip_html(p_observacoes), '');
  v_cliente := NULLIF(public.strip_html(p_cliente), '');
  v_competencia := coalesce(p_data_competencia, v_lanc.data_competencia);
  v_vencimento := coalesce(p_data_vencimento, v_competencia);
  v_baixa := coalesce(p_data_baixa, v_lanc.data_pagamento, v_competencia);

  IF p_destino = 'conta_pagar' THEN
    SELECT cp.id INTO v_titulo_id FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company AND cp.lancamento_id = p_lancamento_id;
    SELECT cr.id INTO v_outro_id FROM public.fin_contas_receber cr
    WHERE cr.company_id = v_company AND cr.lancamento_id = p_lancamento_id;
  ELSE
    SELECT cr.id INTO v_titulo_id FROM public.fin_contas_receber cr
    WHERE cr.company_id = v_company AND cr.lancamento_id = p_lancamento_id;
    SELECT cp.id INTO v_outro_id FROM public.fin_contas_pagar cp
    WHERE cp.company_id = v_company AND cp.lancamento_id = p_lancamento_id;
  END IF;

  -- Mesma linha bancária, outro tipo de título: não é reenvio desta operação.
  IF v_outro_id IS NOT NULL THEN
    RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
  END IF;

  IF v_titulo_id IS NULL THEN
    -- Lançamento que já é espelho/referência de outra coisa não vira título novo.
    -- referencia_modulo/referencia_id têm DEFAULT '' (não NULL).
    IF NULLIF(v_lanc.referencia_modulo, '') IS NOT NULL
       OR NULLIF(v_lanc.referencia_id, '') IS NOT NULL
       OR v_lanc.origem IS DISTINCT FROM 'conciliacao' THEN
      RAISE EXCEPTION 'LANCAMENTO_JA_VINCULADO';
    END IF;

    IF p_categoria_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fin_categorias c
      WHERE c.id = p_categoria_id AND c.company_id = v_company
    ) THEN
      RAISE EXCEPTION 'NOT_FOUND: categoria';
    END IF;
    IF p_supplier_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.suppliers s
      WHERE s.id = p_supplier_id AND s.company_id = v_company
    ) THEN
      RAISE EXCEPTION 'NOT_FOUND: fornecedor';
    END IF;

    BEGIN
      IF p_destino = 'conta_pagar' THEN
        INSERT INTO public.fin_contas_pagar (
          descricao, valor, data_vencimento, data_competencia,
          status, data_pagamento, valor_pago, conta_id, observacoes,
          categoria_id, supplier_id, lancamento_id, created_by, company_id
        ) VALUES (
          v_desc, v_lanc.valor, v_vencimento, v_competencia,
          'PAGO', v_baixa, v_lanc.valor, v_lanc.conta_id, v_obs,
          p_categoria_id, p_supplier_id, p_lancamento_id, v_uid, v_company
        ) RETURNING id INTO v_titulo_id;
      ELSE
        INSERT INTO public.fin_contas_receber (
          descricao, valor, data_vencimento, data_competencia,
          status, data_recebimento, valor_recebido, conta_id, observacoes,
          categoria_id, cliente, supplier_id, lancamento_id, created_by, company_id
        ) VALUES (
          v_desc, v_lanc.valor, v_vencimento, v_competencia,
          'RECEBIDO', v_baixa, v_lanc.valor, v_lanc.conta_id, v_obs,
          p_categoria_id, v_cliente, p_supplier_id, p_lancamento_id, v_uid, v_company
        ) RETURNING id INTO v_titulo_id;
      END IF;
    EXCEPTION WHEN unique_violation THEN
      -- O front antigo ainda grava o título por INSERT direto, sem a trava acima.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS NULL OR v_constraint NOT IN ('uq_fin_contas_pagar_lancamento', 'uq_fin_contas_receber_lancamento') THEN
        RAISE;
      END IF;
      IF p_destino = 'conta_pagar' THEN
        SELECT cp.id INTO v_titulo_id FROM public.fin_contas_pagar cp
        WHERE cp.company_id = v_company AND cp.lancamento_id = p_lancamento_id;
      ELSE
        SELECT cr.id INTO v_titulo_id FROM public.fin_contas_receber cr
        WHERE cr.company_id = v_company AND cr.lancamento_id = p_lancamento_id;
      END IF;
      IF v_titulo_id IS NULL THEN
        RAISE;
      END IF;
      v_idempotente := true;
    END;
  ELSE
    v_idempotente := true;
  END IF;

  -- Reenvio só devolve o título se ele descrever o que foi pedido agora. A chave
  -- aqui é o lançamento, não o formulário: trocar a categoria entre uma tentativa
  -- e outra não pode virar "sucesso" com a categoria antiga.
  IF v_idempotente THEN
    IF p_destino = 'conta_pagar' THEN
      SELECT (cp.descricao IS DISTINCT FROM v_desc
           OR cp.categoria_id IS DISTINCT FROM p_categoria_id
           OR cp.supplier_id IS DISTINCT FROM p_supplier_id
           OR coalesce(cp.observacoes, '') IS DISTINCT FROM coalesce(v_obs, '')
           OR cp.data_vencimento IS DISTINCT FROM v_vencimento
           OR cp.data_competencia IS DISTINCT FROM v_competencia
           OR cp.data_pagamento IS DISTINCT FROM v_baixa)
        INTO v_divergente
      FROM public.fin_contas_pagar cp
      WHERE cp.id = v_titulo_id AND cp.company_id = v_company;
    ELSE
      SELECT (cr.descricao IS DISTINCT FROM v_desc
           OR cr.categoria_id IS DISTINCT FROM p_categoria_id
           OR cr.supplier_id IS DISTINCT FROM p_supplier_id
           OR cr.cliente IS DISTINCT FROM v_cliente
           OR coalesce(cr.observacoes, '') IS DISTINCT FROM coalesce(v_obs, '')
           OR cr.data_vencimento IS DISTINCT FROM v_vencimento
           OR cr.data_competencia IS DISTINCT FROM v_competencia
           OR cr.data_recebimento IS DISTINCT FROM v_baixa)
        INTO v_divergente
      FROM public.fin_contas_receber cr
      WHERE cr.id = v_titulo_id AND cr.company_id = v_company;
    END IF;
    IF v_divergente THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
  END IF;

  -- Vínculo de volta. Também completa o estado parcial do fluxo antigo (título
  -- gravado, UPDATE do lançamento perdido). Nenhum destes campos é vigiado por
  -- trg_validate_fin_lancamento_update.
  UPDATE public.fin_lancamentos
  SET referencia_modulo = v_modulo,
      referencia_id = v_titulo_id::text,
      origem = v_origem
  WHERE id = p_lancamento_id AND company_id = v_company
    AND (referencia_modulo IS DISTINCT FROM v_modulo
         OR referencia_id IS DISTINCT FROM v_titulo_id::text
         OR origem IS DISTINCT FROM v_origem);

  IF NOT v_idempotente THEN
    INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, depois, user_id, company_id)
    VALUES (v_modulo, v_titulo_id, 'criar_baixado_extrato', jsonb_build_object(
      'lancamento_id', p_lancamento_id, 'valor', v_lanc.valor,
      'conta_id', v_lanc.conta_id, 'data_baixa', v_baixa
    ), v_uid, v_company);
  END IF;

  RETURN jsonb_build_object(
    'status', 'ok',
    'titulo_id', v_titulo_id,
    'lancamento_id', p_lancamento_id,
    'idempotente', v_idempotente
  );
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 5. Recorrência — gerar parcela
-- ═════════════════════════════════════════════════════════════════════════════
-- A chave 'recorrencia:<pai>:<n>' vinha só do estado do servidor
-- (parcelas_geradas + 1): um reenvio depois de uma resposta perdida gerava a
-- parcela N+1. Com p_parcela_esperada o cliente diz qual parcela está pedindo.
DROP FUNCTION IF EXISTS public.gerar_parcela_recorrente(uuid);

CREATE FUNCTION public.gerar_parcela_recorrente(
  p_lancamento_pai_id uuid,
  p_parcela_esperada integer DEFAULT NULL::integer
)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path = 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_company_id uuid;
  v_pai record;
  v_config jsonb;
  v_freq text;
  v_max_parcelas int;
  v_geradas int;
  v_num int;
  v_nova_data date;
  v_base_date date;
  v_new_id uuid;
BEGIN
  -- Auth + tenant
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'AUTH_REQUIRED';
  END IF;
  v_company_id := assert_tenant();

  -- Permission check (a tela de Recorrências usa financeiro:recorrencias:create)
  IF NOT has_any_permission(v_user_id, ARRAY[
    'financeiro:recorrencias:create', 'financeiro:lancamentos:create',
    'finance:manage', 'system:global:manage'
  ]) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:recorrencias:create necessário';
  END IF;

  -- Lock parent row to prevent concurrent generation
  SELECT * INTO v_pai
  FROM fin_lancamentos
  WHERE id = p_lancamento_pai_id
    AND company_id = v_company_id
    AND recorrente = true
    AND lancamento_pai_id IS NULL
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND: Lançamento pai não encontrado ou não é recorrente';
  END IF;

  v_config := COALESCE(v_pai.recorrencia_config, '{}'::jsonb);
  v_freq := COALESCE(v_config->>'frequencia', 'mensal');
  v_max_parcelas := COALESCE((v_config->>'parcelas')::int, 0);
  v_geradas := COALESCE((v_config->>'parcelas_geradas')::int, 0);

  v_num := v_geradas + 1;

  IF p_parcela_esperada IS NOT NULL THEN
    IF p_parcela_esperada < 1 THEN
      RAISE EXCEPTION 'VALIDATION_ERROR: parcela inválida';
    END IF;
    -- Reenvio: a parcela pedida já foi gerada — devolve ela, não a seguinte.
    IF p_parcela_esperada <= v_geradas THEN
      SELECT l.id INTO v_new_id
      FROM fin_lancamentos l
      WHERE l.company_id = v_company_id
        AND l.idempotency_key = 'recorrencia:' || v_pai.id || ':' || p_parcela_esperada;
      IF v_new_id IS NULL THEN
        RETURN jsonb_build_object('status', 'noop', 'message',
          'A parcela ' || p_parcela_esperada || ' já tinha sido gerada', 'idempotente', true);
      END IF;
      RETURN jsonb_build_object('status', 'ok', 'parcela_id', v_new_id,
        'parcela_num', p_parcela_esperada, 'idempotente', true);
    END IF;
    IF p_parcela_esperada > v_num THEN
      RAISE EXCEPTION 'PARCELA_FORA_DE_ORDEM: esperada %, próxima %', p_parcela_esperada, v_num;
    END IF;
  END IF;

  -- Check if all parcels already generated
  IF v_max_parcelas > 0 AND v_geradas >= v_max_parcelas THEN
    RETURN jsonb_build_object('status', 'noop', 'message', 'Todas as parcelas já foram geradas');
  END IF;

  v_base_date := v_pai.data_competencia;

  -- Calculate new date
  IF v_freq = 'mensal' THEN
    v_nova_data := v_base_date + (v_num || ' months')::interval;
  ELSIF v_freq = 'semanal' THEN
    v_nova_data := v_base_date + (v_num * 7 || ' days')::interval;
  ELSIF v_freq = 'quinzenal' THEN
    v_nova_data := v_base_date + (v_num * 15 || ' days')::interval;
  ELSE
    v_nova_data := v_base_date + (v_num || ' months')::interval;
  END IF;

  -- Idempotency key to prevent duplicates
  INSERT INTO fin_lancamentos (
    descricao, tipo, valor, categoria_id, centro_custo_id, conta_id,
    forma_pagamento, recorrente, lancamento_pai_id, parcela_atual,
    parcela_total, data_competencia, status, created_by, company_id,
    idempotency_key
  )
  VALUES (
    CASE WHEN v_max_parcelas > 0
      THEN v_pai.descricao || ' (' || v_num || '/' || v_max_parcelas || ')'
      ELSE v_pai.descricao || ' (parcela ' || v_num || ')'
    END,
    v_pai.tipo, v_pai.valor, v_pai.categoria_id, v_pai.centro_custo_id,
    v_pai.conta_id, v_pai.forma_pagamento, false, v_pai.id,
    v_num, CASE WHEN v_max_parcelas > 0 THEN v_max_parcelas ELSE NULL END,
    v_nova_data, 'PREVISTO', v_user_id, v_company_id,
    'recorrencia:' || v_pai.id || ':' || v_num
  )
  ON CONFLICT (company_id, idempotency_key) WHERE idempotency_key IS NOT NULL
  DO NOTHING
  RETURNING id INTO v_new_id;

  -- A parcela desta posição já existia, mas o contador do pai ficou para trás
  -- (ex.: a edição do lançamento regravou recorrencia_config). Devolve a parcela
  -- existente e avança o contador — senão a geração fica presa neste ponto.
  IF v_new_id IS NULL THEN
    SELECT l.id INTO v_new_id
    FROM fin_lancamentos l
    WHERE l.company_id = v_company_id
      AND l.idempotency_key = 'recorrencia:' || v_pai.id || ':' || v_num;

    UPDATE fin_lancamentos
    SET recorrencia_config = jsonb_set(
      COALESCE(recorrencia_config, '{}'::jsonb),
      '{parcelas_geradas}',
      to_jsonb(v_num)
    )
    WHERE id = v_pai.id AND company_id = v_company_id;

    RETURN jsonb_build_object('status', 'noop', 'message', 'Parcela já existia (idempotente)',
      'parcela_id', v_new_id, 'parcela_num', v_num, 'idempotente', true);
  END IF;

  -- Update parent config atomically
  UPDATE fin_lancamentos
  SET recorrencia_config = jsonb_set(
    COALESCE(recorrencia_config, '{}'::jsonb),
    '{parcelas_geradas}',
    to_jsonb(v_num)
  )
  WHERE id = v_pai.id AND company_id = v_company_id;

  -- Audit
  INSERT INTO fin_audit_logs (entidade, entidade_id, acao, user_id, company_id, depois)
  VALUES ('lancamentos', v_new_id, 'gerar_parcela', v_user_id, v_company_id,
    jsonb_build_object('pai_id', v_pai.id, 'parcela_num', v_num, 'data', v_nova_data));

  RETURN jsonb_build_object('status', 'ok', 'parcela_id', v_new_id, 'parcela_num', v_num, 'idempotente', false);
END;
$function$;

-- ═════════════════════════════════════════════════════════════════════════════
-- 6. Conciliação — corrida no INSERT de reconcile_import_lancamento
-- ═════════════════════════════════════════════════════════════════════════════
-- Mesma assinatura (CREATE OR REPLACE). Único trecho novo: o INSERT do
-- lançamento dentro de um bloco que trata a unique_violation do índice da chave
-- como o caminho 'duplicate' — duas chamadas simultâneas com a mesma chave
-- (duplo clique em "Processar") devolviam 23505 cru para a tela.
CREATE OR REPLACE FUNCTION public.reconcile_import_lancamento(p_data date, p_descricao text, p_valor numeric, p_tipo text, p_conta_id uuid, p_user_id uuid, p_rateio_linhas jsonb DEFAULT NULL::jsonb, p_external_id text DEFAULT NULL::text, p_force_duplicate boolean DEFAULT false, p_occurrence_index integer DEFAULT 0)
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
  v_existing_count int;
  v_occurrence_index int;
  v_descricao_normalizada text;
  v_constraint text;
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
  v_idem_key := CASE
    WHEN v_external_id IS NOT NULL
      THEN md5(concat_ws('|', v_company::text, p_conta_id::text, 'external', v_external_id))
    ELSE v_legacy_idem_key
  END;

  SELECT id INTO v_lancamento_id
  FROM public.fin_lancamentos
  WHERE idempotency_key = v_idem_key AND company_id = v_company;

  IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN
    SELECT id INTO v_lancamento_id
    FROM public.fin_lancamentos
    WHERE idempotency_key = v_legacy_idem_key AND company_id = v_company;

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
      p_tipo, p_valor, p_data, p_data, p_descricao, p_conta_id,
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
      'force_duplicate', p_force_duplicate, 'occurrence_index', v_occurrence_index));
  RETURN jsonb_build_object('status', 'ok', 'lancamento_id', v_lancamento_id);
END;
$function$;

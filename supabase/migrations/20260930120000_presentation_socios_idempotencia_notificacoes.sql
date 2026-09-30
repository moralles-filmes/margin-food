-- ─────────────────────────────────────────────────────────────────────────────
-- Apresentação Sócios — criação idempotente de sessão executiva e de decisão, e
-- notificações só para quem consegue abrir o registro.
--
-- Corpos copiados do banco vivo (pg_get_functiondef em 2026-09-30), não das
-- migrations 20260826*: a 20260909193057 já tinha reescrito a validação de
-- `profile.company_id` para `is_company_member()` (membership ativa + empresa
-- ativa).
--
--   · Idempotência: `_guarded_create_presentation_session` e
--     `_guarded_create_presentation_decision` ganham `p_idempotency_key` (chave
--     DERIVADA da operação no cliente, DEFAULT NULL para o front em produção). O
--     índice único parcial (company_id, idempotency_key) é a garantia; o SELECT
--     prévio é só o caminho rápido e a `unique_violation` do próprio índice é
--     tratada como reenvio (devolve o registro com `idempotent=true`, sem nova
--     auditoria nem notificação).
--   · Reenvio só é reenvio se descrever a MESMA operação: `idempotency_fingerprint`
--     guarda o md5 do pedido original — sessão e decisão são editáveis depois,
--     então comparar com a linha atual confundiria um retry legítimo com
--     conteúdo novo. Chave igual com conteúdo ou autor diferente →
--     REQUEST_ID_REUTILIZADO. Na decisão, o snapshot fica fora da comparação
--     (capturedAt e métricas mudam a cada captura); entram as escolhas do
--     usuário: título, contexto, período, granularidade, referência, modo da
--     fonte, cenário e responsável — o mesmo conteúdo da chave no cliente
--     (`src/domain/financeiro/presentation/idempotency.ts`).
--   · Destinatários: responsável pela ata e responsável por ação precisam de
--     membership ativa E da permissão que abre o registro
--     (`financeiro:relatorio-socios:view` ou `system:global:manage`, o mesmo gate
--     das RPCs de leitura e da RLS dessas tabelas). Na atribuição (criar, ou
--     trocar o responsável ao salvar/editar), quem não passa é recusado
--     (RESPONSIBLE_WITHOUT_ACCESS); responsável mantido que perdeu o acesso não
--     trava a edição, e em ata enviada/aprovada/devolvida ele é revalidado e,
--     sem acesso, não é notificado — a transição segue.
--   · Falha de notificação agora propaga. O INSERT roda na MESMA transação do
--     registro: se falhar, nada foi gravado, então o erro não convida a reenviar
--     algo já salvo (e o reenvio é idempotente). Com o destinatário validado
--     antes, não sobra falha de negócio esperada — o que falhar é defeito
--     (constraint, trigger, grant) e `EXCEPTION WHEN OTHERS THEN NULL` o
--     esconderia para sempre. As notificações de ação já propagavam.
--   · Toda notificação grava `company_id` explícito (antes dependia do DEFAULT
--     `get_current_company_id()`). link_path, entity_type, entity_id e metadata
--     não mudam — o deep-link do front depende desse formato.
--
-- Compatível com o front em produção: parâmetros novos com DEFAULT, retorno só
-- ganha a chave `idempotent`, colunas novas nulas e fora das projeções das RPCs
-- de leitura. GRANTs no mesmo arquivo (aplicação via MCP/db query, não db push).
-- Reaplicável: DROP só da assinatura antiga + CREATE OR REPLACE da nova.
--
-- Reversão (não destrói dado): recriar as assinaturas de 10 (sessão) e 8
-- (decisão) argumentos a partir de pg_get_functiondef anterior, com os mesmos
-- GRANTs, e dropar as de 11/9; as colunas e índices novos podem ficar.
-- ─────────────────────────────────────────────────────────────────────────────

-- ── Colunas e índices de idempotência ───────────────────────────────────────

ALTER TABLE public.fin_presentation_sessions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

ALTER TABLE public.fin_presentation_sessions
  DROP CONSTRAINT IF EXISTS fin_presentation_sessions_idempotency_chk;
ALTER TABLE public.fin_presentation_sessions
  ADD CONSTRAINT fin_presentation_sessions_idempotency_chk
  CHECK (
    (idempotency_key IS NULL) = (idempotency_fingerprint IS NULL)
    AND (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 200)
  );

ALTER TABLE public.fin_presentation_decisions
  ADD COLUMN IF NOT EXISTS idempotency_key text,
  ADD COLUMN IF NOT EXISTS idempotency_fingerprint text;

ALTER TABLE public.fin_presentation_decisions
  DROP CONSTRAINT IF EXISTS fin_presentation_decisions_idempotency_chk;
ALTER TABLE public.fin_presentation_decisions
  ADD CONSTRAINT fin_presentation_decisions_idempotency_chk
  CHECK (
    (idempotency_key IS NULL) = (idempotency_fingerprint IS NULL)
    AND (idempotency_key IS NULL OR char_length(idempotency_key) BETWEEN 1 AND 200)
  );

-- Preflight: as colunas acabaram de nascer, mas a migration pode ser reaplicada.
DO $preflight$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.fin_presentation_sessions
    WHERE idempotency_key IS NOT NULL
    GROUP BY company_id, idempotency_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PRESENTATION_SESSION_IDEMPOTENCY_DUPLICADA: resolva as duplicatas antes do indice unico';
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.fin_presentation_decisions
    WHERE idempotency_key IS NOT NULL
    GROUP BY company_id, idempotency_key HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION 'PRESENTATION_DECISION_IDEMPOTENCY_DUPLICADA: resolva as duplicatas antes do indice unico';
  END IF;
END
$preflight$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_presentation_sessions_idempotency
  ON public.fin_presentation_sessions (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_fin_presentation_decisions_idempotency
  ON public.fin_presentation_decisions (company_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

-- ── Quem pode receber aviso da Apresentação Sócios ──────────────────────────
-- Mesmo gate das RPCs de leitura (get/list_fin_presentation_*) e da RLS
-- `*_tenant_read`, avaliado na unidade do registro e não na do ator. Sem EXECUTE
-- para clientes: exposta em /rpc, deixaria qualquer membro sondar a permissão
-- de um colega.

CREATE OR REPLACE FUNCTION public._fin_presentation_can_view(p_user_id uuid, p_company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SET search_path = ''
AS $function$
  SELECT p_user_id IS NOT NULL
     AND p_company_id IS NOT NULL
     AND public.is_company_member(p_user_id, p_company_id)
     AND public.get_company_permissions(p_user_id, p_company_id)
         && ARRAY['financeiro:relatorio-socios:view', 'system:global:manage']::text[];
$function$;

REVOKE ALL ON FUNCTION public._fin_presentation_can_view(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._fin_presentation_can_view(uuid, uuid) TO service_role;

-- ── Criar sessão executiva ──────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb);

CREATE OR REPLACE FUNCTION public._guarded_create_presentation_session(
  p_title text,
  p_context text,
  p_period_start date,
  p_period_end_exclusive date,
  p_granularity text,
  p_meeting_date date,
  p_minutes_responsible_user_id uuid,
  p_participant_user_ids uuid[],
  p_previous_session_id uuid,
  p_agenda_items jsonb,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_responsible_name text;
  v_responsible_email text;
  v_session public.fin_presentation_sessions%ROWTYPE;
  v_content jsonb;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_fingerprint text;
  v_created boolean := false;
  v_constraint text;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:manage', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN RAISE EXCEPTION 'REQUEST_ID_INVALIDO'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'VALIDATION: titulo obrigatorio'; END IF;
  IF length(COALESCE(p_context, '')) > 10000 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: context'; END IF;
  IF p_period_start IS NULL OR p_period_end_exclusive IS NULL OR p_period_end_exclusive <= p_period_start THEN
    RAISE EXCEPTION 'VALIDATION: periodo invalido';
  END IF;
  IF p_granularity NOT IN ('day', 'month', 'year') THEN RAISE EXCEPTION 'VALIDATION: granularidade invalida'; END IF;
  IF p_meeting_date IS NULL THEN RAISE EXCEPTION 'VALIDATION: data da reuniao obrigatoria'; END IF;
  IF p_minutes_responsible_user_id IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_REQUIRED'; END IF;

  -- Identidade do pedido: tudo o que o usuário informou, no mesmo recorte da
  -- chave do cliente (período + granularidade + rascunho).
  v_fingerprint := md5(jsonb_build_object(
    'title', btrim(p_title),
    'context', COALESCE(p_context, ''),
    'periodStart', p_period_start,
    'periodEndExclusive', p_period_end_exclusive,
    'granularity', p_granularity,
    'meetingDate', p_meeting_date,
    'minutesResponsibleUserId', p_minutes_responsible_user_id,
    'participantUserIds', to_jsonb(COALESCE(p_participant_user_ids, ARRAY[]::uuid[])),
    'previousSessionId', p_previous_session_id,
    'agendaItems', COALESCE(p_agenda_items, '[]'::jsonb)
  )::text);

  -- Caminho rápido: reenvio já resolvido.
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_session FROM public.fin_presentation_sessions session
    WHERE session.company_id = v_company AND session.idempotency_key = v_key;
  END IF;

  IF v_session.id IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario') INTO v_actor_name
    FROM public.profiles profile WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
    IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
    SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario'), NULLIF(profile.email, '')
      INTO v_responsible_name, v_responsible_email
    FROM public.profiles profile
    WHERE profile.id = p_minutes_responsible_user_id
      AND public.is_company_member(profile.id, v_company)
      AND profile.nome NOT ILIKE '[EXCLUIDO]%'
      AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
    IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
    IF NOT public._fin_presentation_can_view(p_minutes_responsible_user_id, v_company) THEN
      RAISE EXCEPTION 'RESPONSIBLE_WITHOUT_ACCESS: responsavel sem acesso a Apresentacao Socios nesta unidade';
    END IF;
    IF p_previous_session_id IS NOT NULL AND NOT EXISTS (
      SELECT 1 FROM public.fin_presentation_sessions previous
      WHERE previous.id = p_previous_session_id AND previous.company_id = v_company
    ) THEN RAISE EXCEPTION 'PREVIOUS_SESSION_OUT_OF_TENANT'; END IF;

    BEGIN
      INSERT INTO public.fin_presentation_sessions (
        company_id, title, context, period_start, period_end_exclusive, granularity,
        meeting_date, minutes_responsible_user_id, minutes_responsible_name_snapshot,
        minutes_responsible_email_snapshot, previous_session_id, status,
        created_by, created_by_name_snapshot, updated_by, updated_by_name_snapshot,
        idempotency_key, idempotency_fingerprint
      ) VALUES (
        v_company, btrim(p_title), COALESCE(p_context, ''), p_period_start, p_period_end_exclusive, p_granularity,
        p_meeting_date, p_minutes_responsible_user_id, v_responsible_name,
        v_responsible_email, p_previous_session_id, 'DRAFT',
        v_user, v_actor_name, v_user, v_actor_name,
        v_key, CASE WHEN v_key IS NULL THEN NULL ELSE v_fingerprint END
      ) RETURNING * INTO v_session;
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      -- Outra transação gravou a mesma chave entre o caminho rápido e o INSERT.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS DISTINCT FROM 'uq_fin_presentation_sessions_idempotency' THEN RAISE; END IF;
      SELECT * INTO v_session FROM public.fin_presentation_sessions session
      WHERE session.company_id = v_company AND session.idempotency_key = v_key;
      IF v_session.id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF NOT v_created THEN
    IF v_session.created_by IS DISTINCT FROM v_user
       OR v_session.idempotency_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object(
      'id', v_session.id, 'status', v_session.status, 'updatedAt', v_session.updated_at,
      'version', v_session.version, 'idempotent', true
    );
  END IF;

  v_content := public._replace_fin_presentation_session_content(
    v_session.id, v_company, v_user, v_actor_name, p_participant_user_ids, p_agenda_items
  );

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
  VALUES (
    'presentation_session', v_session.id, 'SESSION_CREATED', NULL,
    jsonb_build_object(
      'actorName', v_actor_name,
      'status', 'DRAFT',
      'title', v_session.title,
      'meetingDate', v_session.meeting_date,
      'minutesResponsibleUserId', v_session.minutes_responsible_user_id,
      'minutesResponsibleName', v_session.minutes_responsible_name_snapshot,
      'periodStart', v_session.period_start,
      'periodEndExclusive', v_session.period_end_exclusive,
      'granularity', v_session.granularity,
      'content', v_content,
      'version', v_session.version
    ), '', v_user, v_company
  );

  INSERT INTO public.notifications (
    company_id, recipient_user_id, type, module, title, message, entity_type,
    entity_id, link_path, created_by, metadata
  ) VALUES (
    v_company, p_minutes_responsible_user_id, 'PRESENTATION_MINUTES_ASSIGNED', 'financeiro',
    'Responsabilidade por ata executiva', v_session.title,
    'presentation_session', v_session.id,
    '/financeiro/relatorio-socios?session=' || v_session.id::text,
    v_user, jsonb_build_object('sessionId', v_session.id)
  );

  RETURN jsonb_build_object(
    'id', v_session.id, 'status', v_session.status, 'updatedAt', v_session.updated_at,
    'version', v_session.version, 'idempotent', false
  );
END;
$function$;

COMMENT ON FUNCTION public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb, text) IS
  'Cria sessão executiva. p_idempotency_key = chave derivada da operação; reenvio devolve a existente (idempotent=true), conteúdo ou autor divergente → REQUEST_ID_REUTILIZADO.';

REVOKE ALL ON FUNCTION public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb, text) TO authenticated, service_role;

-- ── Salvar sessão executiva (mesma assinatura) ──────────────────────────────

CREATE OR REPLACE FUNCTION public._guarded_save_presentation_session(p_session_id uuid, p_title text, p_context text, p_meeting_date date, p_minutes_responsible_user_id uuid, p_participant_user_ids uuid[], p_previous_session_id uuid, p_agenda_items jsonb, p_expected_status text, p_expected_updated_at timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_responsible_name text;
  v_responsible_email text;
  v_before public.fin_presentation_sessions%ROWTYPE;
  v_after public.fin_presentation_sessions%ROWTYPE;
  v_before_content jsonb;
  v_after_content jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:manage', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_expected_status NOT IN ('DRAFT', 'IN_PROGRESS') THEN RAISE EXCEPTION 'STATUS_INVALID'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'VALIDATION: titulo obrigatorio'; END IF;
  IF length(COALESCE(p_context, '')) > 10000 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: context'; END IF;
  IF p_meeting_date IS NULL THEN RAISE EXCEPTION 'VALIDATION: data da reuniao obrigatoria'; END IF;
  IF p_minutes_responsible_user_id IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_REQUIRED'; END IF;
  IF p_previous_session_id = p_session_id THEN RAISE EXCEPTION 'PREVIOUS_SESSION_INVALID'; END IF;

  SELECT * INTO v_before FROM public.fin_presentation_sessions session
  WHERE session.id = p_session_id AND session.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'; END IF;
  IF v_before.status IS DISTINCT FROM p_expected_status OR v_before.status NOT IN ('DRAFT', 'IN_PROGRESS') THEN
    RAISE EXCEPTION 'STATUS_INVALID: expected %, current %', p_expected_status, v_before.status;
  END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario') INTO v_actor_name
  FROM public.profiles profile WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario'), NULLIF(profile.email, '')
    INTO v_responsible_name, v_responsible_email
  FROM public.profiles profile
  WHERE profile.id = p_minutes_responsible_user_id
    AND public.is_company_member(profile.id, v_company)
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
  -- Acesso é exigido na atribuição. Responsável mantido que perdeu o acesso não
  -- trava a edição da ata (ele só deixa de ser avisado).
  IF v_before.minutes_responsible_user_id IS DISTINCT FROM p_minutes_responsible_user_id
     AND NOT public._fin_presentation_can_view(p_minutes_responsible_user_id, v_company) THEN
    RAISE EXCEPTION 'RESPONSIBLE_WITHOUT_ACCESS: responsavel sem acesso a Apresentacao Socios nesta unidade';
  END IF;
  IF p_previous_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_presentation_sessions previous
    WHERE previous.id = p_previous_session_id AND previous.company_id = v_company
  ) THEN RAISE EXCEPTION 'PREVIOUS_SESSION_OUT_OF_TENANT'; END IF;

  SELECT jsonb_build_object(
    'participantUserIds', COALESCE((SELECT jsonb_agg(participant.user_id ORDER BY participant.position) FROM public.fin_presentation_session_participants participant WHERE participant.session_id = p_session_id), '[]'::jsonb),
    'agendaItems', COALESCE((SELECT jsonb_agg(jsonb_build_object(
      'id', agenda.id, 'position', agenda.position, 'title', agenda.title,
      'itemType', agenda.item_type, 'reviewState', agenda.review_state,
      'referenceType', agenda.reference_type, 'referenceId', agenda.reference_id,
      'referenceVersion', agenda.reference_version, 'referenceStatus', agenda.reference_status
    ) ORDER BY agenda.position) FROM public.fin_presentation_agenda_items agenda WHERE agenda.session_id = p_session_id), '[]'::jsonb)
  ) INTO v_before_content;

  UPDATE public.fin_presentation_sessions
  SET title = btrim(p_title),
      context = COALESCE(p_context, ''),
      meeting_date = p_meeting_date,
      minutes_responsible_user_id = p_minutes_responsible_user_id,
      minutes_responsible_name_snapshot = v_responsible_name,
      minutes_responsible_email_snapshot = v_responsible_email,
      previous_session_id = p_previous_session_id,
      updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(),
      version = version + 1
  WHERE id = p_session_id
  RETURNING * INTO v_after;

  v_after_content := public._replace_fin_presentation_session_content(
    p_session_id, v_company, v_user, v_actor_name, p_participant_user_ids, p_agenda_items
  );

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
  VALUES (
    'presentation_session', p_session_id, 'SESSION_UPDATED',
    jsonb_build_object(
      'actorName', v_actor_name, 'title', v_before.title, 'context', v_before.context,
      'meetingDate', v_before.meeting_date,
      'minutesResponsibleUserId', v_before.minutes_responsible_user_id,
      'minutesResponsibleName', v_before.minutes_responsible_name_snapshot,
      'previousSessionId', v_before.previous_session_id, 'content', v_before_content, 'version', v_before.version
    ),
    jsonb_build_object(
      'actorName', v_actor_name, 'title', v_after.title, 'context', v_after.context,
      'meetingDate', v_after.meeting_date,
      'minutesResponsibleUserId', v_after.minutes_responsible_user_id,
      'minutesResponsibleName', v_after.minutes_responsible_name_snapshot,
      'previousSessionId', v_after.previous_session_id, 'content', v_after_content, 'version', v_after.version
    ), '', v_user, v_company
  );

  IF v_before.minutes_responsible_user_id IS DISTINCT FROM p_minutes_responsible_user_id THEN
    INSERT INTO public.notifications (
      company_id, recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      v_company, p_minutes_responsible_user_id, 'PRESENTATION_MINUTES_ASSIGNED', 'financeiro',
      'Responsabilidade por ata executiva', v_after.title,
      'presentation_session', p_session_id,
      '/financeiro/relatorio-socios?session=' || p_session_id::text,
      v_user, jsonb_build_object('sessionId', p_session_id)
    );
  END IF;
  RETURN jsonb_build_object('id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at, 'version', v_after.version);
END;
$function$;

-- ── Enviar ata para revisão (mesma assinatura) ──────────────────────────────

CREATE OR REPLACE FUNCTION public._guarded_submit_presentation_minutes(p_session_id uuid, p_revision_reason text, p_expected_status text, p_expected_updated_at timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_before public.fin_presentation_sessions%ROWTYPE;
  v_after public.fin_presentation_sessions%ROWTYPE;
  v_revision public.fin_presentation_minutes_revisions%ROWTYPE;
  v_revision_number integer;
  v_content jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:manage', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_expected_status <> 'IN_PROGRESS' THEN RAISE EXCEPTION 'STATUS_INVALID'; END IF;
  IF p_revision_reason IS NULL OR length(btrim(p_revision_reason)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'JUSTIFICATION_REQUIRED';
  END IF;
  SELECT * INTO v_before FROM public.fin_presentation_sessions session
  WHERE session.id = p_session_id AND session.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'; END IF;
  IF v_before.status <> 'IN_PROGRESS' OR v_before.meeting_snapshot IS NULL THEN
    RAISE EXCEPTION 'STATUS_INVALID: meeting must be in progress with snapshot';
  END IF;
  SELECT COALESCE(max(revision.revision_number), 0) + 1 INTO v_revision_number
  FROM public.fin_presentation_minutes_revisions revision
  WHERE revision.session_id = p_session_id AND revision.company_id = v_company;
  IF v_revision_number > 50 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: revisions'; END IF;
  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario') INTO v_actor_name
  FROM public.profiles profile WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  v_content := jsonb_build_object(
    'contractVersion', 'presentation-minutes-revision-v1.0',
    'session', jsonb_build_object(
      'id', v_before.id,
      'title', v_before.title,
      'period', jsonb_build_object('start', v_before.period_start, 'endExclusive', v_before.period_end_exclusive),
      'granularity', v_before.granularity,
      'meetingDate', v_before.meeting_date,
      'context', v_before.context,
      'minutesResponsibleUserId', v_before.minutes_responsible_user_id,
      'minutesResponsibleName', v_before.minutes_responsible_name_snapshot,
      'previousSessionId', v_before.previous_session_id
    ),
    'participants', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', participant.id,
        'userId', participant.user_id,
        'nameSnapshot', participant.name_snapshot,
        'emailSnapshot', participant.email_snapshot,
        'createdBy', participant.created_by,
        'createdByName', participant.created_by_name_snapshot,
        'createdAt', participant.created_at
      ) ORDER BY participant.position)
      FROM public.fin_presentation_session_participants participant
      WHERE participant.session_id = p_session_id AND participant.company_id = v_company
    ), '[]'::jsonb),
    'agendaItems', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', agenda.id,
        'itemType', agenda.item_type,
        'position', agenda.position,
        'title', agenda.title,
        'objective', agenda.objective,
        'discussionNotes', agenda.discussion_notes,
        'conclusion', agenda.conclusion,
        'reviewState', agenda.review_state,
        'referenceType', agenda.reference_type,
        'referenceId', agenda.reference_id,
        'referenceVersion', agenda.reference_version,
        'referenceStatus', agenda.reference_status,
        'createdBy', agenda.created_by,
        'createdByName', agenda.created_by_name_snapshot,
        'updatedBy', agenda.updated_by,
        'updatedByName', agenda.updated_by_name_snapshot,
        'createdAt', agenda.created_at,
        'updatedAt', agenda.updated_at
      ) ORDER BY agenda.position)
      FROM public.fin_presentation_agenda_items agenda
      WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company
    ), '[]'::jsonb),
    'snapshot', v_before.meeting_snapshot
  );
  IF octet_length(v_content::text) > 524288 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: revision'; END IF;

  INSERT INTO public.fin_presentation_minutes_revisions (
    company_id, session_id, revision_number, state, revision_reason, content,
    created_by, created_by_name_snapshot
  ) VALUES (
    v_company, p_session_id, v_revision_number, 'IN_REVIEW', btrim(p_revision_reason), v_content,
    v_user, v_actor_name
  ) RETURNING * INTO v_revision;

  UPDATE public.fin_presentation_sessions
  SET status = 'IN_REVIEW', current_revision_id = v_revision.id,
      submitted_at = clock_timestamp(), latest_justification = btrim(p_revision_reason),
      updated_by = v_user, updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(), version = version + 1
  WHERE id = p_session_id RETURNING * INTO v_after;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
  VALUES (
    'presentation_session', p_session_id, 'MINUTES_SUBMITTED',
    jsonb_build_object('actorName', v_actor_name, 'status', v_before.status, 'version', v_before.version, 'currentRevisionId', v_before.current_revision_id),
    jsonb_build_object('actorName', v_actor_name, 'status', v_after.status, 'version', v_after.version, 'currentRevisionId', v_revision.id, 'revisionNumber', v_revision_number),
    btrim(p_revision_reason), v_user, v_company
  );
  -- Responsável gravado na atribuição: se perdeu acesso (ou foi removido e o
  -- campo ficou nulo), a ata segue sem aviso.
  IF public._fin_presentation_can_view(v_before.minutes_responsible_user_id, v_company) THEN
    INSERT INTO public.notifications (
      company_id, recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      v_company, v_before.minutes_responsible_user_id, 'PRESENTATION_MINUTES_IN_REVIEW', 'financeiro',
      'Ata executiva enviada para revisao', v_before.title,
      'presentation_session', p_session_id,
      '/financeiro/relatorio-socios?session=' || p_session_id::text || '&revision=' || v_revision.id::text,
      v_user, jsonb_build_object('sessionId', p_session_id, 'revisionId', v_revision.id, 'revisionNumber', v_revision_number)
    );
  END IF;
  RETURN jsonb_build_object(
    'id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at,
    'version', v_after.version, 'revisionId', v_revision.id, 'revisionNumber', v_revision_number
  );
END;
$function$;

-- ── Transição da sessão: aprovar/devolver/reabrir/cancelar (mesma assinatura)

CREATE OR REPLACE FUNCTION public._guarded_transition_presentation_session(p_session_id uuid, p_expected_status text, p_target_status text, p_justification text, p_expected_updated_at timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_before public.fin_presentation_sessions%ROWTYPE;
  v_after public.fin_presentation_sessions%ROWTYPE;
  v_revision public.fin_presentation_minutes_revisions%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_action text;
  v_notification_type text;
  v_notification_title text;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  -- O modelo deliberadamente nao inventa segregacao de funcao: um usuario com
  -- approve pode preparar e aprovar. Autor/aprovador ficam explicitos na trilha.
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:approve', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:approve';
  END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_expected_status NOT IN ('DRAFT', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'CANCELLED')
     OR p_target_status NOT IN ('DRAFT', 'IN_PROGRESS', 'APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'TRANSITION_INVALID';
  END IF;
  IF p_justification IS NULL OR length(btrim(p_justification)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'JUSTIFICATION_REQUIRED';
  END IF;

  SELECT * INTO v_before FROM public.fin_presentation_sessions session
  WHERE session.id = p_session_id AND session.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'; END IF;
  IF v_before.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'STATUS_INVALID: expected %, current %', p_expected_status, v_before.status;
  END IF;
  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario') INTO v_actor_name
  FROM public.profiles profile WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF v_before.current_revision_id IS NOT NULL THEN
    SELECT * INTO v_revision FROM public.fin_presentation_minutes_revisions revision
    WHERE revision.id = v_before.current_revision_id
      AND revision.session_id = p_session_id
      AND revision.company_id = v_company
    FOR UPDATE;
  END IF;

  IF p_target_status = 'APPROVED' THEN
    IF v_before.status <> 'IN_REVIEW' OR v_revision.id IS NULL OR v_revision.state <> 'IN_REVIEW' THEN
      RAISE EXCEPTION 'TRANSITION_INVALID';
    END IF;
    UPDATE public.fin_presentation_minutes_revisions
    SET state = 'APPROVED', approved_by = v_user,
        approved_by_name_snapshot = v_actor_name, approved_at = v_now
    WHERE id = v_revision.id;
    v_action := 'MINUTES_APPROVED';
    v_notification_type := 'PRESENTATION_MINUTES_APPROVED';
    v_notification_title := 'Ata executiva aprovada';
  ELSIF p_target_status = 'IN_PROGRESS' THEN
    IF v_before.status = 'IN_REVIEW' THEN
      IF v_revision.id IS NULL OR v_revision.state <> 'IN_REVIEW' THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
      UPDATE public.fin_presentation_minutes_revisions SET state = 'SUPERSEDED' WHERE id = v_revision.id;
      v_action := 'MINUTES_RETURNED';
      v_notification_type := 'PRESENTATION_MINUTES_RETURNED';
      v_notification_title := 'Ata executiva devolvida para correcao';
    ELSIF v_before.status = 'APPROVED' THEN
      v_action := 'SESSION_REOPENED';
    ELSIF v_before.status = 'CANCELLED' AND v_before.meeting_snapshot IS NOT NULL THEN
      v_action := 'SESSION_REOPENED';
    ELSE
      RAISE EXCEPTION 'TRANSITION_INVALID';
    END IF;
  ELSIF p_target_status = 'DRAFT' THEN
    IF v_before.status <> 'CANCELLED' OR v_before.meeting_snapshot IS NOT NULL THEN
      RAISE EXCEPTION 'TRANSITION_INVALID';
    END IF;
    v_action := 'SESSION_REOPENED';
  ELSIF p_target_status = 'CANCELLED' THEN
    IF v_before.status NOT IN ('DRAFT', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED') THEN
      RAISE EXCEPTION 'TRANSITION_INVALID';
    END IF;
    IF v_before.status = 'IN_REVIEW' AND v_revision.id IS NOT NULL AND v_revision.state = 'IN_REVIEW' THEN
      UPDATE public.fin_presentation_minutes_revisions SET state = 'SUPERSEDED' WHERE id = v_revision.id;
    END IF;
    v_action := 'SESSION_CANCELLED';
  ELSE
    RAISE EXCEPTION 'TRANSITION_INVALID';
  END IF;

  UPDATE public.fin_presentation_sessions
  SET status = p_target_status,
      latest_justification = btrim(p_justification),
      approved_at = CASE WHEN p_target_status = 'APPROVED' THEN v_now ELSE approved_at END,
      approved_by = CASE WHEN p_target_status = 'APPROVED' THEN v_user ELSE approved_by END,
      approved_by_name_snapshot = CASE WHEN p_target_status = 'APPROVED' THEN v_actor_name ELSE approved_by_name_snapshot END,
      cancelled_at = CASE WHEN p_target_status = 'CANCELLED' THEN v_now ELSE NULL END,
      updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = v_now,
      version = version + 1
  WHERE id = p_session_id RETURNING * INTO v_after;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
  VALUES (
    'presentation_session', p_session_id, v_action,
    jsonb_build_object(
      'actorName', v_actor_name, 'status', v_before.status, 'version', v_before.version,
      'currentRevisionId', v_before.current_revision_id,
      'revisionNumber', v_revision.revision_number,
      'revisionState', v_revision.state
    ),
    jsonb_build_object(
      'actorName', v_actor_name, 'status', v_after.status, 'version', v_after.version,
      'currentRevisionId', v_after.current_revision_id,
      'revisionNumber', v_revision.revision_number,
      'approvedBy', CASE WHEN p_target_status = 'APPROVED' THEN v_user ELSE v_after.approved_by END,
      'approvedByName', CASE WHEN p_target_status = 'APPROVED' THEN v_actor_name ELSE v_after.approved_by_name_snapshot END
    ), btrim(p_justification), v_user, v_company
  );

  -- Responsável gravado na atribuição: se perdeu acesso (ou foi removido e o
  -- campo ficou nulo), a transição segue sem aviso.
  IF v_notification_type IS NOT NULL
     AND public._fin_presentation_can_view(v_before.minutes_responsible_user_id, v_company) THEN
    INSERT INTO public.notifications (
      company_id, recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      v_company, v_before.minutes_responsible_user_id, v_notification_type, 'financeiro',
      v_notification_title, v_after.title,
      'presentation_session', p_session_id,
      '/financeiro/relatorio-socios?session=' || p_session_id::text
        || CASE WHEN v_after.current_revision_id IS NULL THEN '' ELSE '&revision=' || v_after.current_revision_id::text END,
      v_user, jsonb_build_object('sessionId', p_session_id, 'revisionId', v_after.current_revision_id)
    );
  END IF;
  RETURN jsonb_build_object(
    'id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at,
    'version', v_after.version, 'currentRevisionId', v_after.current_revision_id
  );
END;
$function$;

-- ── Registrar decisão ───────────────────────────────────────────────────────

DROP FUNCTION IF EXISTS public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid);

CREATE OR REPLACE FUNCTION public._guarded_create_presentation_decision(
  p_title text,
  p_context text,
  p_period_start date,
  p_period_end_exclusive date,
  p_granularity text,
  p_reference_type text,
  p_snapshot jsonb,
  p_executive_responsible_user_id uuid DEFAULT NULL,
  p_idempotency_key text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_responsible_name text;
  v_decision public.fin_presentation_decisions%ROWTYPE;
  v_revision_id uuid;
  v_updated_at timestamptz;
  v_key text := NULLIF(btrim(COALESCE(p_idempotency_key, '')), '');
  v_fingerprint text;
  v_created boolean := false;
  v_constraint text;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:manage',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF v_key IS NOT NULL AND char_length(v_key) > 200 THEN RAISE EXCEPTION 'REQUEST_ID_INVALIDO'; END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN
    RAISE EXCEPTION 'VALIDATION: titulo obrigatorio ou excede 200 caracteres';
  END IF;
  IF p_context IS NULL OR length(btrim(p_context)) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'VALIDATION: contexto obrigatorio ou excede 10000 caracteres';
  END IF;
  IF p_period_end_exclusive <= p_period_start THEN
    RAISE EXCEPTION 'VALIDATION: periodo invalido';
  END IF;
  IF p_granularity NOT IN ('day', 'month', 'year') OR p_reference_type NOT IN ('BASE', 'SCENARIO') THEN
    RAISE EXCEPTION 'VALIDATION: referencia ou granularidade invalida';
  END IF;

  -- Identidade do pedido: as escolhas do usuário. O snapshot fica fora
  -- (capturedAt e métricas mudam a cada captura); o cenário entra, porque é
  -- entrada do usuário e muda a decisão.
  v_fingerprint := md5(jsonb_build_object(
    'title', btrim(p_title),
    'context', btrim(p_context),
    'periodStart', p_period_start,
    'periodEndExclusive', p_period_end_exclusive,
    'granularity', p_granularity,
    'referenceType', p_reference_type,
    'sourceMode', p_snapshot->'sourceMode',
    'scenarioDraft', p_snapshot->'scenarioDraft',
    'executiveResponsibleUserId', p_executive_responsible_user_id
  )::text);

  -- Caminho rápido: reenvio já resolvido.
  IF v_key IS NOT NULL THEN
    SELECT * INTO v_decision FROM public.fin_presentation_decisions decision
    WHERE decision.company_id = v_company AND decision.idempotency_key = v_key;
  END IF;

  IF v_decision.id IS NULL THEN
    SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
      INTO v_actor_name
    FROM public.profiles profile
    WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
    IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

    IF p_executive_responsible_user_id IS NOT NULL THEN
      SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
        INTO v_responsible_name
      FROM public.profiles profile
      WHERE profile.id = p_executive_responsible_user_id
        AND public.is_company_member(profile.id, v_company)
        AND profile.nome NOT ILIKE '[EXCLUIDO]%'
        AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
      IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
    END IF;

    PERFORM public._validate_fin_presentation_decision_snapshot(
      p_snapshot, p_period_start, p_period_end_exclusive, p_granularity, p_reference_type
    );

    BEGIN
      INSERT INTO public.fin_presentation_decisions (
        company_id, title, context, period_start, period_end_exclusive, granularity,
        reference_type, status, executive_responsible_user_id,
        executive_responsible_name_snapshot, created_by, created_by_name_snapshot,
        updated_by, updated_by_name_snapshot, idempotency_key, idempotency_fingerprint
      ) VALUES (
        v_company, btrim(p_title), btrim(p_context), p_period_start, p_period_end_exclusive,
        p_granularity, p_reference_type, 'DRAFT', p_executive_responsible_user_id,
        v_responsible_name, v_user, v_actor_name, v_user, v_actor_name,
        v_key, CASE WHEN v_key IS NULL THEN NULL ELSE v_fingerprint END
      )
      RETURNING * INTO v_decision;
      v_created := true;
    EXCEPTION WHEN unique_violation THEN
      -- Outra transação gravou a mesma chave entre o caminho rápido e o INSERT.
      GET STACKED DIAGNOSTICS v_constraint = CONSTRAINT_NAME;
      IF v_constraint IS DISTINCT FROM 'uq_fin_presentation_decisions_idempotency' THEN RAISE; END IF;
      SELECT * INTO v_decision FROM public.fin_presentation_decisions decision
      WHERE decision.company_id = v_company AND decision.idempotency_key = v_key;
      IF v_decision.id IS NULL THEN RAISE; END IF;
    END;
  END IF;

  IF NOT v_created THEN
    IF v_decision.created_by IS DISTINCT FROM v_user
       OR v_decision.idempotency_fingerprint IS DISTINCT FROM v_fingerprint THEN
      RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';
    END IF;
    RETURN jsonb_build_object(
      'id', v_decision.id,
      'currentRevisionId', v_decision.current_revision_id,
      'status', v_decision.status,
      'version', v_decision.version,
      'updatedAt', v_decision.updated_at,
      'idempotent', true
    );
  END IF;

  INSERT INTO public.fin_presentation_decision_revisions (
    company_id, decision_id, revision_number, reference_type, snapshot,
    revision_reason, created_by, created_by_name_snapshot
  ) VALUES (
    v_company, v_decision.id, 1, p_reference_type, p_snapshot,
    'Registro inicial', v_user, v_actor_name
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.fin_presentation_decisions
  SET current_revision_id = v_revision_id,
      updated_at = clock_timestamp()
  WHERE id = v_decision.id
  RETURNING updated_at INTO v_updated_at;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', v_decision.id, 'DECISION_CREATED', NULL,
    jsonb_build_object(
      'actorName', v_actor_name,
      'title', btrim(p_title),
      'status', 'DRAFT',
      'referenceType', p_reference_type,
      'revisionNumber', 1
    ),
    '', v_user, v_company
  );

  RETURN jsonb_build_object(
    'id', v_decision.id,
    'currentRevisionId', v_revision_id,
    'status', 'DRAFT',
    'version', 1,
    'updatedAt', v_updated_at,
    'idempotent', false
  );
END;
$function$;

COMMENT ON FUNCTION public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid, text) IS
  'Registra decisão. p_idempotency_key = chave derivada da operação; reenvio devolve a existente (idempotent=true), conteúdo ou autor divergente → REQUEST_ID_REUTILIZADO. Snapshot fora da comparação.';

REVOKE ALL ON FUNCTION public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid, text) TO authenticated, service_role;

-- ── Criar ação da decisão (mesma assinatura) ────────────────────────────────

CREATE OR REPLACE FUNCTION public._guarded_create_presentation_decision_action(p_decision_id uuid, p_description text, p_responsible_user_id uuid, p_expected_decision_status text, p_expected_decision_updated_at timestamp with time zone, p_due_date date, p_priority text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_responsible_name text;
  v_decision public.fin_presentation_decisions%ROWTYPE;
  v_action public.fin_presentation_decision_actions%ROWTYPE;
  v_count integer;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:manage',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'VALIDATION: descricao obrigatoria ou excede 1000 caracteres';
  END IF;
  IF p_responsible_user_id IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_REQUIRED'; END IF;
  IF p_expected_decision_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_expected_decision_status NOT IN ('DRAFT', 'APPROVED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'STATUS_INVALID'; END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION 'VALIDATION: prioridade invalida';
  END IF;

  SELECT * INTO v_decision
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = p_decision_id AND decision.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_decision.updated_at IS DISTINCT FROM p_expected_decision_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;
  IF v_decision.status IS DISTINCT FROM p_expected_decision_status THEN
    RAISE EXCEPTION 'STATUS_INVALID: expected %, current %', p_expected_decision_status, v_decision.status;
  END IF;
  IF v_decision.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'STATUS_INVALID: reopen decision first';
  END IF;

  SELECT count(*)::integer INTO v_count
  FROM public.fin_presentation_decision_actions action
  WHERE action.decision_id = p_decision_id AND action.company_id = v_company;
  IF v_count >= 100 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: actions'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_responsible_name
  FROM public.profiles profile
  WHERE profile.id = p_responsible_user_id
    AND public.is_company_member(profile.id, v_company)
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
  IF NOT public._fin_presentation_can_view(p_responsible_user_id, v_company) THEN
    RAISE EXCEPTION 'RESPONSIBLE_WITHOUT_ACCESS: responsavel sem acesso a Apresentacao Socios nesta unidade';
  END IF;

  INSERT INTO public.fin_presentation_decision_actions (
    company_id, decision_id, description, responsible_user_id,
    responsible_name_snapshot, due_date, priority, status,
    created_by, created_by_name_snapshot, updated_by, updated_by_name_snapshot
  ) VALUES (
    v_company, p_decision_id, btrim(p_description), p_responsible_user_id,
    v_responsible_name, p_due_date, p_priority, 'PENDING',
    v_user, v_actor_name, v_user, v_actor_name
  ) RETURNING * INTO v_action;

  UPDATE public.fin_presentation_decisions
  SET updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(),
      version = version + 1
  WHERE id = p_decision_id;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', p_decision_id, 'ACTION_CREATED', NULL,
    jsonb_build_object(
      'actorName', v_actor_name,
      'actionId', v_action.id,
      'description', v_action.description,
      'responsibleUserId', v_action.responsible_user_id,
      'responsibleName', v_action.responsible_name_snapshot,
      'dueDate', v_action.due_date,
      'priority', v_action.priority,
      'status', v_action.status,
      'version', v_action.version
    ),
    '', v_user, v_company
  );

  INSERT INTO public.notifications (
    company_id, recipient_user_id, type, module, title, message, entity_type,
    entity_id, link_path, created_by, metadata
  ) VALUES (
    v_company, p_responsible_user_id, 'PRESENTATION_ACTION_ASSIGNED', 'financeiro',
    'Nova acao da Apresentacao Socios',
    btrim(p_description), 'presentation_decision', p_decision_id,
    '/financeiro/relatorio-socios?decision=' || p_decision_id::text,
    v_user, jsonb_build_object('actionId', v_action.id)
  );

  RETURN jsonb_build_object(
    'id', v_action.id,
    'decisionId', v_action.decision_id,
    'status', v_action.status,
    'version', v_action.version,
    'updatedAt', v_action.updated_at
  );
END;
$function$;

-- ── Editar ação da decisão (mesma assinatura) ───────────────────────────────

CREATE OR REPLACE FUNCTION public._guarded_update_presentation_decision_action(p_action_id uuid, p_description text, p_responsible_user_id uuid, p_due_date date, p_priority text, p_expected_status text, p_expected_updated_at timestamp with time zone)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_actor_name text;
  v_responsible_name text;
  v_decision public.fin_presentation_decisions%ROWTYPE;
  v_before public.fin_presentation_decision_actions%ROWTYPE;
  v_after public.fin_presentation_decision_actions%ROWTYPE;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:manage',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_expected_status NOT IN ('PENDING', 'IN_PROGRESS') THEN RAISE EXCEPTION 'STATUS_INVALID'; END IF;
  IF p_description IS NULL OR length(btrim(p_description)) NOT BETWEEN 1 AND 1000 THEN
    RAISE EXCEPTION 'VALIDATION: descricao obrigatoria ou excede 1000 caracteres';
  END IF;
  IF p_responsible_user_id IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_REQUIRED'; END IF;
  IF p_priority IS NOT NULL AND p_priority NOT IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL') THEN
    RAISE EXCEPTION 'VALIDATION: prioridade invalida';
  END IF;

  SELECT * INTO v_before
  FROM public.fin_presentation_decision_actions action
  WHERE action.id = p_action_id AND action.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;
  IF v_before.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'STATUS_INVALID: expected %, current %', p_expected_status, v_before.status;
  END IF;
  IF v_before.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'ACTION_REOPEN_REQUIRED';
  END IF;

  SELECT * INTO v_decision
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = v_before.decision_id AND decision.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_decision.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'STATUS_INVALID: reopen decision first';
  END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND public.is_company_member(profile.id, v_company);
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_responsible_name
  FROM public.profiles profile
  WHERE profile.id = p_responsible_user_id
    AND public.is_company_member(profile.id, v_company)
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
  -- Acesso é exigido na atribuição. Responsável mantido que perdeu o acesso não
  -- trava a edição da ação.
  IF v_before.responsible_user_id IS DISTINCT FROM p_responsible_user_id
     AND NOT public._fin_presentation_can_view(p_responsible_user_id, v_company) THEN
    RAISE EXCEPTION 'RESPONSIBLE_WITHOUT_ACCESS: responsavel sem acesso a Apresentacao Socios nesta unidade';
  END IF;

  UPDATE public.fin_presentation_decision_actions
  SET description = btrim(p_description),
      responsible_user_id = p_responsible_user_id,
      responsible_name_snapshot = v_responsible_name,
      due_date = p_due_date,
      priority = p_priority,
      updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(),
      version = version + 1
  WHERE id = p_action_id
  RETURNING * INTO v_after;

  UPDATE public.fin_presentation_decisions
  SET updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(),
      version = version + 1
  WHERE id = v_before.decision_id;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', v_before.decision_id, 'ACTION_UPDATED',
    jsonb_build_object(
      'actorName', v_actor_name,
      'actionId', v_before.id,
      'description', v_before.description,
      'responsibleUserId', v_before.responsible_user_id,
      'responsibleName', v_before.responsible_name_snapshot,
      'dueDate', v_before.due_date,
      'priority', v_before.priority,
      'version', v_before.version
    ),
    jsonb_build_object(
      'actorName', v_actor_name,
      'actionId', v_after.id,
      'description', v_after.description,
      'responsibleUserId', v_after.responsible_user_id,
      'responsibleName', v_after.responsible_name_snapshot,
      'dueDate', v_after.due_date,
      'priority', v_after.priority,
      'version', v_after.version
    ),
    '', v_user, v_company
  );

  IF v_before.responsible_user_id IS DISTINCT FROM p_responsible_user_id THEN
    INSERT INTO public.notifications (
      company_id, recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      v_company, p_responsible_user_id, 'PRESENTATION_ACTION_ASSIGNED', 'financeiro',
      'Acao atribuida na Apresentacao Socios',
      v_after.description, 'presentation_decision', v_before.decision_id,
      '/financeiro/relatorio-socios?decision=' || v_before.decision_id::text,
      v_user, jsonb_build_object('actionId', v_after.id)
    );
  END IF;

  RETURN jsonb_build_object(
    'id', v_after.id,
    'decisionId', v_after.decision_id,
    'status', v_after.status,
    'version', v_after.version,
    'updatedAt', v_after.updated_at
  );
END;
$function$;

-- ── Verificação no catálogo real ────────────────────────────────────────────
-- PL/pgSQL só resolve colunas na 1ª execução; o ensaio da aplicação chama as
-- funções de verdade. Aqui garante que as colunas novas e as funções existem.
DO $migration_check$
BEGIN
  PERFORM session.idempotency_key, session.idempotency_fingerprint
  FROM public.fin_presentation_sessions session WHERE false;
  PERFORM decision.idempotency_key, decision.idempotency_fingerprint
  FROM public.fin_presentation_decisions decision WHERE false;
  PERFORM pg_catalog.pg_get_functiondef('public._fin_presentation_can_view(uuid, uuid)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb, text)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid, text)'::regprocedure);
  IF to_regprocedure('public._guarded_create_presentation_session(text, text, date, date, text, date, uuid, uuid[], uuid, jsonb)') IS NOT NULL
     OR to_regprocedure('public._guarded_create_presentation_decision(text, text, date, date, text, text, jsonb, uuid)') IS NOT NULL THEN
    RAISE EXCEPTION 'PRESENTATION_OVERLOAD_ANTIGO: assinatura antiga ainda existe';
  END IF;
END
$migration_check$;

NOTIFY pgrst, 'reload schema';

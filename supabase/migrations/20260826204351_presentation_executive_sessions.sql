-- Fase 12 - ritual executivo, atas e follow-up da Apresentacao Socios.
--
-- Reutilizacoes deliberadas:
--   * get_fin_presentation_plan permanece a unica base financeira atual;
--   * decisoes e acoes da Fase 11 sao referenciadas por id/versao, nunca copiadas;
--   * profiles/list_profiles_minimal fornece usuarios tenant-scoped;
--   * fin_audit_logs preserva antes/depois e justificativas;
--   * notifications recebe somente eventos explicitos, em blocos tolerantes a falha.
--
-- A persistencia nova e necessaria porque pauta, participantes, snapshot congelado
-- e revisoes aprovadas nao possuem entidade canonica equivalente. Nenhuma destas
-- tabelas participa de DRE, DFC, orcamento, metas, saldos ou lancamentos.

CREATE TABLE public.fin_presentation_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  title text NOT NULL,
  title_unaccent text GENERATED ALWAYS AS (public.immutable_unaccent(lower(title))) STORED,
  context text NOT NULL DEFAULT '',
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  granularity text NOT NULL,
  meeting_date date NOT NULL,
  minutes_responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  minutes_responsible_name_snapshot text NOT NULL,
  minutes_responsible_email_snapshot text,
  previous_session_id uuid REFERENCES public.fin_presentation_sessions(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  meeting_snapshot jsonb,
  current_revision_id uuid,
  latest_justification text,
  started_at timestamptz,
  submitted_at timestamptz,
  approved_at timestamptz,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name_snapshot text,
  cancelled_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_presentation_sessions_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT fin_presentation_sessions_context_length CHECK (length(context) <= 10000),
  CONSTRAINT fin_presentation_sessions_period CHECK (period_end_exclusive > period_start),
  CONSTRAINT fin_presentation_sessions_granularity CHECK (granularity IN ('day', 'month', 'year')),
  CONSTRAINT fin_presentation_sessions_status CHECK (status IN ('DRAFT', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'CANCELLED')),
  CONSTRAINT fin_presentation_sessions_snapshot_size CHECK (meeting_snapshot IS NULL OR octet_length(meeting_snapshot::text) <= 262144),
  CONSTRAINT fin_presentation_sessions_reason_length CHECK (latest_justification IS NULL OR length(latest_justification) <= 4000),
  CONSTRAINT fin_presentation_sessions_version CHECK (version > 0)
);

CREATE TABLE public.fin_presentation_session_participants (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.fin_presentation_sessions(id) ON DELETE CASCADE,
  user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  name_snapshot text NOT NULL,
  email_snapshot text,
  position integer NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_presentation_session_participants_name_length CHECK (length(btrim(name_snapshot)) BETWEEN 1 AND 300),
  CONSTRAINT fin_presentation_session_participants_email_length CHECK (email_snapshot IS NULL OR length(email_snapshot) <= 320),
  CONSTRAINT fin_presentation_session_participants_position CHECK (position > 0),
  UNIQUE (company_id, session_id, position)
);

CREATE UNIQUE INDEX fin_presentation_session_participants_user_idx
  ON public.fin_presentation_session_participants (company_id, session_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE TABLE public.fin_presentation_agenda_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.fin_presentation_sessions(id) ON DELETE CASCADE,
  item_type text NOT NULL,
  position integer NOT NULL,
  title text NOT NULL,
  title_unaccent text GENERATED ALWAYS AS (public.immutable_unaccent(lower(title))) STORED,
  objective text NOT NULL DEFAULT '',
  discussion_notes text NOT NULL DEFAULT '',
  conclusion text,
  review_state text NOT NULL DEFAULT 'PENDING',
  reference_type text,
  reference_id uuid,
  reference_version integer,
  reference_status text,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_presentation_agenda_items_type CHECK (item_type IN (
    'FINANCIAL_OVERVIEW', 'REVENUE', 'EXPENSE', 'RESULT', 'MARGIN', 'CMV',
    'CATEGORY_RANKING', 'PAYABLES_RECEIVABLES', 'SCENARIO', 'DECISION', 'ACTION', 'FREE_TEXT'
  )),
  CONSTRAINT fin_presentation_agenda_items_position CHECK (position > 0),
  CONSTRAINT fin_presentation_agenda_items_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT fin_presentation_agenda_items_objective_length CHECK (length(objective) <= 2000),
  CONSTRAINT fin_presentation_agenda_items_notes_length CHECK (length(discussion_notes) <= 20000),
  CONSTRAINT fin_presentation_agenda_items_conclusion_length CHECK (conclusion IS NULL OR length(conclusion) <= 10000),
  CONSTRAINT fin_presentation_agenda_items_state CHECK (review_state IN ('PENDING', 'DISCUSSED', 'CONCLUDED', 'CANCELLED')),
  CONSTRAINT fin_presentation_agenda_items_reference_type CHECK (reference_type IS NULL OR reference_type IN ('CATEGORY', 'DECISION', 'ACTION')),
  CONSTRAINT fin_presentation_agenda_items_reference_pair CHECK ((reference_type IS NULL) = (reference_id IS NULL)),
  CONSTRAINT fin_presentation_agenda_items_reference_version CHECK (reference_version IS NULL OR reference_version > 0),
  UNIQUE (company_id, session_id, position)
);

CREATE TABLE public.fin_presentation_minutes_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  session_id uuid NOT NULL REFERENCES public.fin_presentation_sessions(id) ON DELETE RESTRICT,
  revision_number integer NOT NULL,
  state text NOT NULL DEFAULT 'IN_REVIEW',
  revision_reason text NOT NULL,
  content jsonb NOT NULL,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name_snapshot text,
  approved_at timestamptz,
  CONSTRAINT fin_presentation_minutes_revisions_number CHECK (revision_number > 0),
  CONSTRAINT fin_presentation_minutes_revisions_state CHECK (state IN ('IN_REVIEW', 'APPROVED', 'SUPERSEDED')),
  CONSTRAINT fin_presentation_minutes_revisions_reason_length CHECK (length(btrim(revision_reason)) BETWEEN 1 AND 4000),
  CONSTRAINT fin_presentation_minutes_revisions_content_size CHECK (octet_length(content::text) <= 524288),
  UNIQUE (company_id, session_id, revision_number)
);

ALTER TABLE public.fin_presentation_sessions
  ADD CONSTRAINT fin_presentation_sessions_current_revision_fk
  FOREIGN KEY (current_revision_id)
  REFERENCES public.fin_presentation_minutes_revisions(id)
  ON DELETE RESTRICT;

CREATE INDEX fin_presentation_sessions_company_period_idx
  ON public.fin_presentation_sessions (company_id, period_start DESC, period_end_exclusive DESC, meeting_date DESC);
CREATE INDEX fin_presentation_sessions_company_status_idx
  ON public.fin_presentation_sessions (company_id, status, updated_at DESC);
CREATE INDEX fin_presentation_sessions_company_responsible_idx
  ON public.fin_presentation_sessions (company_id, minutes_responsible_user_id, meeting_date DESC);
CREATE INDEX fin_presentation_sessions_title_search_idx
  ON public.fin_presentation_sessions USING gin (title_unaccent gin_trgm_ops);
CREATE INDEX fin_presentation_session_participants_company_user_idx
  ON public.fin_presentation_session_participants (company_id, user_id, session_id);
CREATE INDEX fin_presentation_agenda_items_company_session_idx
  ON public.fin_presentation_agenda_items (company_id, session_id, position);
CREATE INDEX fin_presentation_agenda_items_company_reference_idx
  ON public.fin_presentation_agenda_items (company_id, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;
CREATE INDEX fin_presentation_agenda_items_title_search_idx
  ON public.fin_presentation_agenda_items USING gin (title_unaccent gin_trgm_ops);
CREATE INDEX fin_presentation_minutes_revisions_company_session_idx
  ON public.fin_presentation_minutes_revisions (company_id, session_id, revision_number DESC);

ALTER TABLE public.fin_presentation_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_sessions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_session_participants ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_session_participants FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_agenda_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_agenda_items FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_minutes_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_minutes_revisions FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_fin_presentation_sessions_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_sessions
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();
CREATE TRIGGER trg_fin_presentation_session_participants_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_session_participants
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();
CREATE TRIGGER trg_fin_presentation_agenda_items_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_agenda_items
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();
CREATE TRIGGER trg_fin_presentation_minutes_revisions_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_minutes_revisions
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

CREATE POLICY fin_presentation_sessions_tenant_read
ON public.fin_presentation_sessions FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY['financeiro:relatorio-socios:view', 'system:global:manage']))
);
CREATE POLICY fin_presentation_session_participants_tenant_read
ON public.fin_presentation_session_participants FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY['financeiro:relatorio-socios:view', 'system:global:manage']))
);
CREATE POLICY fin_presentation_agenda_items_tenant_read
ON public.fin_presentation_agenda_items FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY['financeiro:relatorio-socios:view', 'system:global:manage']))
);
CREATE POLICY fin_presentation_minutes_revisions_tenant_read
ON public.fin_presentation_minutes_revisions FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY['financeiro:relatorio-socios:view', 'system:global:manage']))
);

REVOKE ALL ON TABLE public.fin_presentation_sessions FROM anon;
REVOKE ALL ON TABLE public.fin_presentation_session_participants FROM anon;
REVOKE ALL ON TABLE public.fin_presentation_agenda_items FROM anon;
REVOKE ALL ON TABLE public.fin_presentation_minutes_revisions FROM anon;
GRANT ALL ON TABLE public.fin_presentation_sessions TO authenticated, service_role;
GRANT ALL ON TABLE public.fin_presentation_session_participants TO authenticated, service_role;
GRANT ALL ON TABLE public.fin_presentation_agenda_items TO authenticated, service_role;
GRANT ALL ON TABLE public.fin_presentation_minutes_revisions TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._validate_fin_presentation_meeting_snapshot(
  p_snapshot jsonb,
  p_company_id uuid,
  p_period_start date,
  p_period_end_exclusive date,
  p_granularity text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_metric text;
  v_item jsonb;
  v_id uuid;
  v_decision_id uuid;
  v_version integer;
  v_status text;
  v_current_version integer;
  v_current_status text;
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'SNAPSHOT_INVALID';
  END IF;
  IF octet_length(p_snapshot::text) > 262144 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: snapshot'; END IF;
  IF p_snapshot->>'contractVersion' <> 'presentation-meeting-snapshot-v1.0' THEN
    RAISE EXCEPTION 'SNAPSHOT_VERSION_UNKNOWN';
  END IF;
  IF p_snapshot#>>'{period,start}' IS DISTINCT FROM p_period_start::text
     OR p_snapshot#>>'{period,endExclusive}' IS DISTINCT FROM p_period_end_exclusive::text
     OR p_snapshot->>'granularity' IS DISTINCT FROM p_granularity THEN
    RAISE EXCEPTION 'SNAPSHOT_PERIOD_INCOMPATIBLE';
  END IF;
  IF p_snapshot->>'formulaVersion' <> 'presentation-plan-v1.0'
     OR p_snapshot#>>'{sources,actual}' <> 'fin_lancamentos'
     OR p_snapshot#>>'{sources,budget}' <> 'fin_orcamentos'
     OR p_snapshot#>>'{sources,cmvTarget}' <> 'metas_cmv.meta_cmv_total' THEN
    RAISE EXCEPTION 'SNAPSHOT_SOURCE_INCOMPATIBLE';
  END IF;
  IF jsonb_typeof(p_snapshot->'rules') <> 'object'
     OR jsonb_typeof(p_snapshot->'metrics') <> 'object'
     OR jsonb_typeof(p_snapshot->'dataUnavailable') <> 'array'
     OR jsonb_typeof(p_snapshot->'filters') <> 'object'
     OR jsonb_typeof(p_snapshot->'decisions') <> 'array'
     OR jsonb_typeof(p_snapshot->'actions') <> 'array' THEN
    RAISE EXCEPTION 'SNAPSHOT_CONTRACT_INVALID';
  END IF;
  IF jsonb_array_length(p_snapshot->'decisions') > 100
     OR jsonb_array_length(p_snapshot->'actions') > 500
     OR jsonb_array_length(p_snapshot->'dataUnavailable') > 100 THEN
    RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: snapshot lists';
  END IF;
  IF p_snapshot#>>'{filters,comparisonMode}' NOT IN ('actual', 'budget', 'projection')
     OR COALESCE((p_snapshot#>>'{filters,rankingLimit}')::integer, 0) NOT BETWEEN 1 AND 50 THEN
    RAISE EXCEPTION 'SNAPSHOT_FILTER_INVALID';
  END IF;
  BEGIN
    PERFORM (p_snapshot->>'capturedAt')::timestamptz;
    PERFORM (p_snapshot->>'cutoffDate')::date;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SNAPSHOT_AUDIT_FIELDS_INVALID';
  END;

  FOREACH v_metric IN ARRAY ARRAY['revenue', 'expense', 'result', 'marginPercent', 'cmv', 'cmvPercent'] LOOP
    IF NOT ((p_snapshot->'metrics') ? v_metric)
       OR jsonb_typeof(p_snapshot->'metrics'->v_metric) NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'SNAPSHOT_METRIC_INVALID: %', v_metric;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_snapshot#>'{metrics,revenue}') = 'number'
     AND (p_snapshot#>>'{metrics,revenue}')::numeric = 0
     AND (jsonb_typeof(p_snapshot#>'{metrics,marginPercent}') <> 'null'
          OR jsonb_typeof(p_snapshot#>'{metrics,cmvPercent}') <> 'null') THEN
    RAISE EXCEPTION 'SNAPSHOT_METRIC_INCOMPATIBLE: zero revenue';
  END IF;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_snapshot->'decisions') LOOP
    BEGIN
      v_id := (v_item->>'id')::uuid;
      v_decision_id := (v_item->>'decisionId')::uuid;
      v_version := (v_item->>'version')::integer;
      v_status := v_item->>'status';
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SNAPSHOT_REFERENCE_INVALID'; END;
    IF v_id <> v_decision_id OR v_version < 1 OR v_status NOT IN ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') THEN
      RAISE EXCEPTION 'SNAPSHOT_REFERENCE_INVALID';
    END IF;
    SELECT decision.version, decision.status INTO v_current_version, v_current_status
    FROM public.fin_presentation_decisions decision
    WHERE decision.id = v_id AND decision.company_id = p_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REFERENCE_OUT_OF_TENANT'; END IF;
    IF v_current_version IS DISTINCT FROM v_version OR v_current_status IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: decision %', v_id;
    END IF;
  END LOOP;

  FOR v_item IN SELECT value FROM jsonb_array_elements(p_snapshot->'actions') LOOP
    BEGIN
      v_id := (v_item->>'id')::uuid;
      v_decision_id := (v_item->>'decisionId')::uuid;
      v_version := (v_item->>'version')::integer;
      v_status := v_item->>'status';
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'SNAPSHOT_REFERENCE_INVALID'; END;
    IF v_version < 1 OR v_status NOT IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') THEN
      RAISE EXCEPTION 'SNAPSHOT_REFERENCE_INVALID';
    END IF;
    SELECT action.version, action.status INTO v_current_version, v_current_status
    FROM public.fin_presentation_decision_actions action
    WHERE action.id = v_id AND action.decision_id = v_decision_id AND action.company_id = p_company_id;
    IF NOT FOUND THEN RAISE EXCEPTION 'REFERENCE_OUT_OF_TENANT'; END IF;
    IF v_current_version IS DISTINCT FROM v_version OR v_current_status IS DISTINCT FROM v_status THEN
      RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: action %', v_id;
    END IF;
  END LOOP;
END;
$function$;

REVOKE ALL ON FUNCTION public._validate_fin_presentation_meeting_snapshot(jsonb,uuid,date,date,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._validate_fin_presentation_meeting_snapshot(jsonb,uuid,date,date,text) TO service_role;

CREATE OR REPLACE FUNCTION public._replace_fin_presentation_session_content(
  p_session_id uuid,
  p_company_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_participant_user_ids uuid[],
  p_agenda_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_participant_id uuid;
  v_participant_name text;
  v_participant_email text;
  v_position integer := 0;
  v_item jsonb;
  v_item_id uuid;
  v_item_type text;
  v_title text;
  v_objective text;
  v_notes text;
  v_conclusion text;
  v_review_state text;
  v_reference_type text;
  v_reference_id uuid;
  v_reference_version integer;
  v_reference_status text;
  v_existing_session_id uuid;
  v_seen_ids uuid[] := ARRAY[]::uuid[];
BEGIN
  IF p_participant_user_ids IS NULL
     OR cardinality(p_participant_user_ids) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'VALIDATION: participantes obrigatorios ou excedem limite';
  END IF;
  IF (SELECT count(*) FROM unnest(p_participant_user_ids) item)
     <> (SELECT count(DISTINCT item) FROM unnest(p_participant_user_ids) item) THEN
    RAISE EXCEPTION 'PARTICIPANT_DUPLICATE';
  END IF;
  IF p_agenda_items IS NULL OR jsonb_typeof(p_agenda_items) <> 'array'
     OR jsonb_array_length(p_agenda_items) NOT BETWEEN 1 AND 100 THEN
    RAISE EXCEPTION 'VALIDATION: pauta obrigatoria ou excede limite';
  END IF;
  IF octet_length(p_agenda_items::text) > 524288 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: agenda'; END IF;

  DELETE FROM public.fin_presentation_session_participants participant
  WHERE participant.session_id = p_session_id AND participant.company_id = p_company_id;

  FOREACH v_participant_id IN ARRAY p_participant_user_ids LOOP
    SELECT
      COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario'),
      NULLIF(profile.email, '')
    INTO v_participant_name, v_participant_email
    FROM public.profiles profile
    WHERE profile.id = v_participant_id
      AND profile.company_id = p_company_id
      AND profile.nome NOT ILIKE '[EXCLUIDO]%'
      AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
    IF v_participant_name IS NULL THEN RAISE EXCEPTION 'PARTICIPANT_OUT_OF_TENANT'; END IF;
    v_position := v_position + 1;
    INSERT INTO public.fin_presentation_session_participants (
      company_id, session_id, user_id, name_snapshot, email_snapshot, position,
      created_by, created_by_name_snapshot
    ) VALUES (
      p_company_id, p_session_id, v_participant_id, v_participant_name, v_participant_email, v_position,
      p_actor_user_id, p_actor_name
    );
  END LOOP;

  -- Libera temporariamente as posições persistidas para permitir trocas como
  -- 1 <-> 2 sem violar a UNIQUE (company_id, session_id, position) no meio do
  -- upsert. Qualquer erro posterior reverte também este deslocamento.
  UPDATE public.fin_presentation_agenda_items agenda
  SET position = agenda.position + 1000
  WHERE agenda.session_id = p_session_id
    AND agenda.company_id = p_company_id;

  v_position := 0;
  FOR v_item IN SELECT value FROM jsonb_array_elements(p_agenda_items) LOOP
    v_position := v_position + 1;
    BEGIN
      IF COALESCE(v_item->>'id', '') = '' THEN
        -- Item sem id é sempre novo. Reaproveitar o id pela posição faria um
        -- item recém-inserido sobrescrever outro durante uma reordenação.
        v_item_id := gen_random_uuid();
      ELSE
        v_item_id := (v_item->>'id')::uuid;
      END IF;
      v_reference_id := CASE
        WHEN COALESCE(v_item->>'referenceId', '') = '' THEN NULL
        ELSE (v_item->>'referenceId')::uuid
      END;
    EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'VALIDATION: uuid de pauta invalido'; END;
    v_item_type := v_item->>'itemType';
    v_title := btrim(COALESCE(v_item->>'title', ''));
    v_objective := COALESCE(v_item->>'objective', '');
    v_notes := COALESCE(v_item->>'discussionNotes', '');
    v_conclusion := NULLIF(v_item->>'conclusion', '');
    v_review_state := COALESCE(v_item->>'reviewState', 'PENDING');
    v_reference_type := NULLIF(v_item->>'referenceType', '');
    v_reference_version := NULL;
    v_reference_status := NULL;

    IF v_item_type NOT IN (
      'FINANCIAL_OVERVIEW', 'REVENUE', 'EXPENSE', 'RESULT', 'MARGIN', 'CMV',
      'CATEGORY_RANKING', 'PAYABLES_RECEIVABLES', 'SCENARIO', 'DECISION', 'ACTION', 'FREE_TEXT'
    ) THEN RAISE EXCEPTION 'VALIDATION: tipo de pauta invalido'; END IF;
    IF length(v_title) NOT BETWEEN 1 AND 200 OR length(v_objective) > 2000
       OR length(v_notes) > 20000 OR length(COALESCE(v_conclusion, '')) > 10000 THEN
      RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: agenda item';
    END IF;
    IF v_review_state NOT IN ('PENDING', 'DISCUSSED', 'CONCLUDED', 'CANCELLED') THEN
      RAISE EXCEPTION 'VALIDATION: estado de revisao invalido';
    END IF;
    IF (v_reference_type IS NULL) IS DISTINCT FROM (v_reference_id IS NULL) THEN
      RAISE EXCEPTION 'REFERENCE_INCOMPATIBLE';
    END IF;
    IF v_reference_type IS NOT NULL AND v_reference_type NOT IN ('CATEGORY', 'DECISION', 'ACTION') THEN
      RAISE EXCEPTION 'REFERENCE_INCOMPATIBLE';
    END IF;
    IF v_item_type = 'DECISION' AND v_reference_type IS DISTINCT FROM 'DECISION' THEN
      RAISE EXCEPTION 'REFERENCE_REQUIRED: decision';
    END IF;
    IF v_item_type = 'ACTION' AND v_reference_type IS DISTINCT FROM 'ACTION' THEN
      RAISE EXCEPTION 'REFERENCE_REQUIRED: action';
    END IF;

    IF v_reference_type = 'CATEGORY' THEN
      IF NOT EXISTS (
        SELECT 1 FROM public.fin_categorias category
        WHERE category.id = v_reference_id AND category.company_id = p_company_id
      ) THEN RAISE EXCEPTION 'REFERENCE_OUT_OF_TENANT'; END IF;
    ELSIF v_reference_type = 'DECISION' THEN
      SELECT decision.version, decision.status INTO v_reference_version, v_reference_status
      FROM public.fin_presentation_decisions decision
      JOIN public.fin_presentation_sessions session
        ON session.id = p_session_id AND session.company_id = p_company_id
      WHERE decision.id = v_reference_id
        AND decision.company_id = p_company_id
        AND decision.period_end_exclusive > session.period_start
        AND decision.period_start < session.period_end_exclusive;
      IF NOT FOUND THEN RAISE EXCEPTION 'REFERENCE_OUT_OF_TENANT_OR_PERIOD'; END IF;
    ELSIF v_reference_type = 'ACTION' THEN
      SELECT action.version, action.status INTO v_reference_version, v_reference_status
      FROM public.fin_presentation_decision_actions action
      JOIN public.fin_presentation_decisions decision ON decision.id = action.decision_id
      JOIN public.fin_presentation_sessions session
        ON session.id = p_session_id AND session.company_id = p_company_id
      WHERE action.id = v_reference_id
        AND action.company_id = p_company_id
        AND decision.company_id = p_company_id
        AND decision.period_end_exclusive > session.period_start
        AND decision.period_start < session.period_end_exclusive;
      IF NOT FOUND THEN RAISE EXCEPTION 'REFERENCE_OUT_OF_TENANT_OR_PERIOD'; END IF;
    END IF;

    SELECT agenda.session_id INTO v_existing_session_id
    FROM public.fin_presentation_agenda_items agenda
    WHERE agenda.id = v_item_id;
    IF FOUND AND v_existing_session_id IS DISTINCT FROM p_session_id THEN
      RAISE EXCEPTION 'REFERENCE_OUT_OF_TENANT';
    END IF;

    INSERT INTO public.fin_presentation_agenda_items (
      id, company_id, session_id, item_type, position, title, objective,
      discussion_notes, conclusion, review_state, reference_type, reference_id,
      reference_version, reference_status, created_by, created_by_name_snapshot,
      updated_by, updated_by_name_snapshot
    ) VALUES (
      v_item_id, p_company_id, p_session_id, v_item_type, v_position, v_title, v_objective,
      v_notes, v_conclusion, v_review_state, v_reference_type, v_reference_id,
      v_reference_version, v_reference_status, p_actor_user_id, p_actor_name,
      p_actor_user_id, p_actor_name
    )
    ON CONFLICT (id) DO UPDATE SET
      item_type = EXCLUDED.item_type,
      position = EXCLUDED.position,
      title = EXCLUDED.title,
      objective = EXCLUDED.objective,
      discussion_notes = EXCLUDED.discussion_notes,
      conclusion = EXCLUDED.conclusion,
      review_state = EXCLUDED.review_state,
      reference_type = EXCLUDED.reference_type,
      reference_id = EXCLUDED.reference_id,
      reference_version = EXCLUDED.reference_version,
      reference_status = EXCLUDED.reference_status,
      updated_by = EXCLUDED.updated_by,
      updated_by_name_snapshot = EXCLUDED.updated_by_name_snapshot,
      updated_at = clock_timestamp();
    v_seen_ids := array_append(v_seen_ids, v_item_id);
  END LOOP;

  DELETE FROM public.fin_presentation_agenda_items agenda
  WHERE agenda.session_id = p_session_id
    AND agenda.company_id = p_company_id
    AND NOT (agenda.id = ANY(v_seen_ids));

  RETURN jsonb_build_object(
    'participantUserIds', to_jsonb(p_participant_user_ids),
    'agendaItems', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', agenda.id,
        'position', agenda.position,
        'title', agenda.title,
        'itemType', agenda.item_type,
        'reviewState', agenda.review_state,
        'referenceType', agenda.reference_type,
        'referenceId', agenda.reference_id,
        'referenceVersion', agenda.reference_version,
        'referenceStatus', agenda.reference_status
      ) ORDER BY agenda.position)
      FROM public.fin_presentation_agenda_items agenda
      WHERE agenda.session_id = p_session_id AND agenda.company_id = p_company_id
    ), '[]'::jsonb)
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._replace_fin_presentation_session_content(uuid,uuid,uuid,text,uuid[],jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._replace_fin_presentation_session_content(uuid,uuid,uuid,text,uuid[],jsonb) TO service_role;

CREATE OR REPLACE FUNCTION public.list_fin_presentation_sessions(
  p_period_start date DEFAULT NULL,
  p_period_end_exclusive date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_participant_user_id uuid DEFAULT NULL,
  p_search text DEFAULT '',
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 20
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_search text;
  v_total integer;
  v_items jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:view', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;
  IF p_page < 1 OR p_page_size NOT BETWEEN 1 AND 50 THEN RAISE EXCEPTION 'VALIDATION: paginacao invalida'; END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED', 'CANCELLED') THEN
    RAISE EXCEPTION 'VALIDATION: status invalido';
  END IF;
  IF p_period_start IS NOT NULL AND p_period_end_exclusive IS NOT NULL
     AND p_period_end_exclusive <= p_period_start THEN RAISE EXCEPTION 'VALIDATION: periodo invalido'; END IF;
  IF length(COALESCE(p_search, '')) > 100 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: search'; END IF;
  v_search := public.immutable_unaccent(lower(btrim(COALESCE(p_search, ''))));

  WITH filtered AS (
    SELECT session.id
    FROM public.fin_presentation_sessions session
    WHERE session.company_id = v_company
      AND (p_period_start IS NULL OR session.period_end_exclusive > p_period_start)
      AND (p_period_end_exclusive IS NULL OR session.period_start < p_period_end_exclusive)
      AND (p_status IS NULL OR session.status = p_status)
      AND (p_responsible_user_id IS NULL OR session.minutes_responsible_user_id = p_responsible_user_id)
      AND (v_search = '' OR session.title_unaccent ILIKE '%' || v_search || '%')
      AND (p_participant_user_id IS NULL OR EXISTS (
        SELECT 1 FROM public.fin_presentation_session_participants participant
        WHERE participant.session_id = session.id
          AND participant.company_id = v_company
          AND participant.user_id = p_participant_user_id
      ))
  )
  SELECT count(*)::integer INTO v_total FROM filtered;

  WITH filtered AS (
    SELECT session.*
    FROM public.fin_presentation_sessions session
    WHERE session.company_id = v_company
      AND (p_period_start IS NULL OR session.period_end_exclusive > p_period_start)
      AND (p_period_end_exclusive IS NULL OR session.period_start < p_period_end_exclusive)
      AND (p_status IS NULL OR session.status = p_status)
      AND (p_responsible_user_id IS NULL OR session.minutes_responsible_user_id = p_responsible_user_id)
      AND (v_search = '' OR session.title_unaccent ILIKE '%' || v_search || '%')
      AND (p_participant_user_id IS NULL OR EXISTS (
        SELECT 1 FROM public.fin_presentation_session_participants participant
        WHERE participant.session_id = session.id
          AND participant.company_id = v_company
          AND participant.user_id = p_participant_user_id
      ))
    ORDER BY session.meeting_date DESC, session.updated_at DESC, session.id
    LIMIT p_page_size OFFSET (p_page - 1) * p_page_size
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', session.id,
    'title', session.title,
    'period', jsonb_build_object('start', session.period_start, 'endExclusive', session.period_end_exclusive),
    'granularity', session.granularity,
    'meetingDate', session.meeting_date,
    'status', session.status,
    'minutesResponsibleUserId', session.minutes_responsible_user_id,
    'minutesResponsibleName', session.minutes_responsible_name_snapshot,
    'previousSessionId', session.previous_session_id,
    'currentRevisionId', session.current_revision_id,
    'currentRevisionNumber', revision.revision_number,
    'participantCount', (SELECT count(*) FROM public.fin_presentation_session_participants participant WHERE participant.session_id = session.id),
    'agendaItemCount', (SELECT count(*) FROM public.fin_presentation_agenda_items agenda WHERE agenda.session_id = session.id),
    'unresolvedAgendaCount', (SELECT count(*) FROM public.fin_presentation_agenda_items agenda WHERE agenda.session_id = session.id AND agenda.review_state NOT IN ('CONCLUDED', 'CANCELLED')),
    'createdBy', session.created_by,
    'createdByName', session.created_by_name_snapshot,
    'createdAt', session.created_at,
    'updatedAt', session.updated_at,
    'version', session.version
  ) ORDER BY session.meeting_date DESC, session.updated_at DESC), '[]'::jsonb)
  INTO v_items
  FROM filtered session
  LEFT JOIN public.fin_presentation_minutes_revisions revision ON revision.id = session.current_revision_id;

  RETURN jsonb_build_object(
    'contractVersion', 'presentation-executive-session-v1.0',
    'items', v_items,
    'page', p_page,
    'pageSize', p_page_size,
    'totalCount', v_total,
    'hasMore', p_page * p_page_size < v_total,
    'fetchedAt', clock_timestamp()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_presentation_session(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_session public.fin_presentation_sessions%ROWTYPE;
  v_revision_number integer;
  v_participant_count integer;
  v_agenda_count integer;
  v_unresolved_count integer;
  v_participants jsonb;
  v_agenda jsonb;
  v_revisions jsonb;
  v_references jsonb;
  v_timeline jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:view', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;
  SELECT * INTO v_session
  FROM public.fin_presentation_sessions session
  WHERE session.id = p_session_id AND session.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT revision_number INTO v_revision_number
  FROM public.fin_presentation_minutes_revisions revision
  WHERE revision.id = v_session.current_revision_id AND revision.company_id = v_company;
  SELECT count(*)::integer INTO v_participant_count FROM public.fin_presentation_session_participants participant WHERE participant.session_id = p_session_id AND participant.company_id = v_company;
  SELECT count(*)::integer, count(*) FILTER (WHERE review_state NOT IN ('CONCLUDED', 'CANCELLED'))::integer
    INTO v_agenda_count, v_unresolved_count
  FROM public.fin_presentation_agenda_items agenda WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', participant.id,
    'userId', participant.user_id,
    'nameSnapshot', participant.name_snapshot,
    'emailSnapshot', participant.email_snapshot,
    'createdBy', participant.created_by,
    'createdByName', participant.created_by_name_snapshot,
    'createdAt', participant.created_at
  ) ORDER BY participant.position), '[]'::jsonb)
  INTO v_participants
  FROM public.fin_presentation_session_participants participant
  WHERE participant.session_id = p_session_id AND participant.company_id = v_company;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
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
  ) ORDER BY agenda.position), '[]'::jsonb)
  INTO v_agenda
  FROM public.fin_presentation_agenda_items agenda
  WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', revision.id,
    'revisionNumber', revision.revision_number,
    'state', revision.state,
    'revisionReason', revision.revision_reason,
    'content', revision.content,
    'createdBy', revision.created_by,
    'createdByName', revision.created_by_name_snapshot,
    'createdAt', revision.created_at,
    'approvedBy', revision.approved_by,
    'approvedByName', revision.approved_by_name_snapshot,
    'approvedAt', revision.approved_at
  ) ORDER BY revision.revision_number DESC), '[]'::jsonb)
  INTO v_revisions
  FROM public.fin_presentation_minutes_revisions revision
  WHERE revision.session_id = p_session_id AND revision.company_id = v_company;

  WITH referenced_decisions AS (
    SELECT agenda.reference_id AS decision_id
    FROM public.fin_presentation_agenda_items agenda
    WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company AND agenda.reference_type = 'DECISION'
    UNION
    SELECT action.decision_id
    FROM public.fin_presentation_agenda_items agenda
    JOIN public.fin_presentation_decision_actions action
      ON agenda.reference_type = 'ACTION' AND action.id = agenda.reference_id AND action.company_id = v_company
    WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company
  ), references_union AS (
    SELECT
      'DECISION'::text AS entity_type,
      decision.id,
      decision.id AS decision_id,
      decision.title,
      decision.version,
      decision.status,
      decision.executive_responsible_user_id AS responsible_user_id,
      decision.executive_responsible_name_snapshot AS responsible_name,
      NULL::date AS due_date,
      NULL::text AS priority,
      decision.created_at,
      decision.updated_at,
      0 AS sort_group
    FROM referenced_decisions referenced
    JOIN public.fin_presentation_decisions decision
      ON decision.id = referenced.decision_id AND decision.company_id = v_company
    UNION ALL
    SELECT
      'ACTION', action.id, action.decision_id, action.description, action.version, action.status,
      action.responsible_user_id, action.responsible_name_snapshot, action.due_date, action.priority,
      action.created_at, action.updated_at, 1
    FROM public.fin_presentation_decision_actions action
    WHERE action.company_id = v_company
      AND action.decision_id IN (SELECT decision_id FROM referenced_decisions)
    ORDER BY sort_group, updated_at DESC
    LIMIT 600
  )
  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'entityType', reference.entity_type,
    'id', reference.id,
    'decisionId', reference.decision_id,
    'title', reference.title,
    'version', reference.version,
    'status', reference.status,
    'responsibleUserId', reference.responsible_user_id,
    'responsibleName', reference.responsible_name,
    'dueDate', reference.due_date,
    'priority', reference.priority,
    'createdAt', reference.created_at,
    'updatedAt', reference.updated_at
  ) ORDER BY reference.sort_group, reference.updated_at DESC), '[]'::jsonb)
  INTO v_references
  FROM references_union reference;

  SELECT COALESCE(jsonb_agg(jsonb_build_object(
    'id', audit.id,
    'eventType', audit.acao,
    'before', audit.antes,
    'after', audit.depois,
    'justification', NULLIF(audit.justificativa, ''),
    'actorUserId', audit.user_id,
    'actorName', COALESCE(audit.depois->>'actorName', audit.antes->>'actorName', 'Usuario removido'),
    'createdAt', audit.created_at
  ) ORDER BY audit.created_at DESC, audit.id DESC), '[]'::jsonb)
  INTO v_timeline
  FROM public.fin_audit_logs audit
  WHERE audit.company_id = v_company
    AND audit.entidade = 'presentation_session'
    AND audit.entidade_id = p_session_id;

  RETURN jsonb_build_object(
    'contractVersion', 'presentation-executive-session-v1.0',
    'session', jsonb_build_object(
      'id', v_session.id,
      'title', v_session.title,
      'context', v_session.context,
      'period', jsonb_build_object('start', v_session.period_start, 'endExclusive', v_session.period_end_exclusive),
      'granularity', v_session.granularity,
      'meetingDate', v_session.meeting_date,
      'status', v_session.status,
      'minutesResponsibleUserId', v_session.minutes_responsible_user_id,
      'minutesResponsibleName', v_session.minutes_responsible_name_snapshot,
      'previousSessionId', v_session.previous_session_id,
      'currentRevisionId', v_session.current_revision_id,
      'currentRevisionNumber', v_revision_number,
      'participantCount', v_participant_count,
      'agendaItemCount', v_agenda_count,
      'unresolvedAgendaCount', v_unresolved_count,
      'snapshot', v_session.meeting_snapshot,
      'latestJustification', v_session.latest_justification,
      'startedAt', v_session.started_at,
      'submittedAt', v_session.submitted_at,
      'approvedAt', v_session.approved_at,
      'approvedBy', v_session.approved_by,
      'approvedByName', v_session.approved_by_name_snapshot,
      'cancelledAt', v_session.cancelled_at,
      'createdBy', v_session.created_by,
      'createdByName', v_session.created_by_name_snapshot,
      'updatedBy', v_session.updated_by,
      'updatedByName', v_session.updated_by_name_snapshot,
      'createdAt', v_session.created_at,
      'updatedAt', v_session.updated_at,
      'version', v_session.version
    ),
    'participants', v_participants,
    'agendaItems', v_agenda,
    'revisions', v_revisions,
    'canonicalReferences', v_references,
    'timeline', v_timeline,
    'fetchedAt', clock_timestamp()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fin_presentation_sessions(date,date,text,uuid,uuid,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_fin_presentation_sessions(date,date,text,uuid,uuid,text,integer,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_fin_presentation_session(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_session(uuid) TO authenticated, service_role;

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
  p_agenda_items jsonb
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
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:manage', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200 THEN RAISE EXCEPTION 'VALIDATION: titulo obrigatorio'; END IF;
  IF length(COALESCE(p_context, '')) > 10000 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: context'; END IF;
  IF p_period_start IS NULL OR p_period_end_exclusive IS NULL OR p_period_end_exclusive <= p_period_start THEN
    RAISE EXCEPTION 'VALIDATION: periodo invalido';
  END IF;
  IF p_granularity NOT IN ('day', 'month', 'year') THEN RAISE EXCEPTION 'VALIDATION: granularidade invalida'; END IF;
  IF p_meeting_date IS NULL THEN RAISE EXCEPTION 'VALIDATION: data da reuniao obrigatoria'; END IF;
  IF p_minutes_responsible_user_id IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_REQUIRED'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario') INTO v_actor_name
  FROM public.profiles profile WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario'), NULLIF(profile.email, '')
    INTO v_responsible_name, v_responsible_email
  FROM public.profiles profile
  WHERE profile.id = p_minutes_responsible_user_id
    AND profile.company_id = v_company
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
  IF p_previous_session_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.fin_presentation_sessions previous
    WHERE previous.id = p_previous_session_id AND previous.company_id = v_company
  ) THEN RAISE EXCEPTION 'PREVIOUS_SESSION_OUT_OF_TENANT'; END IF;

  INSERT INTO public.fin_presentation_sessions (
    company_id, title, context, period_start, period_end_exclusive, granularity,
    meeting_date, minutes_responsible_user_id, minutes_responsible_name_snapshot,
    minutes_responsible_email_snapshot, previous_session_id, status,
    created_by, created_by_name_snapshot, updated_by, updated_by_name_snapshot
  ) VALUES (
    v_company, btrim(p_title), COALESCE(p_context, ''), p_period_start, p_period_end_exclusive, p_granularity,
    p_meeting_date, p_minutes_responsible_user_id, v_responsible_name,
    v_responsible_email, p_previous_session_id, 'DRAFT',
    v_user, v_actor_name, v_user, v_actor_name
  ) RETURNING * INTO v_session;

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

  BEGIN
    INSERT INTO public.notifications (
      recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      p_minutes_responsible_user_id, 'PRESENTATION_MINUTES_ASSIGNED', 'financeiro',
      'Responsabilidade por ata executiva', v_session.title,
      'presentation_session', v_session.id,
      '/financeiro/relatorio-socios?session=' || v_session.id::text,
      v_user, jsonb_build_object('sessionId', v_session.id)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;

  RETURN jsonb_build_object('id', v_session.id, 'status', v_session.status, 'updatedAt', v_session.updated_at, 'version', v_session.version);
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_save_presentation_session(
  p_session_id uuid,
  p_title text,
  p_context text,
  p_meeting_date date,
  p_minutes_responsible_user_id uuid,
  p_participant_user_ids uuid[],
  p_previous_session_id uuid,
  p_agenda_items jsonb,
  p_expected_status text,
  p_expected_updated_at timestamptz
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
  FROM public.profiles profile WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;
  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario'), NULLIF(profile.email, '')
    INTO v_responsible_name, v_responsible_email
  FROM public.profiles profile
  WHERE profile.id = p_minutes_responsible_user_id
    AND profile.company_id = v_company
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
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
    BEGIN
      INSERT INTO public.notifications (
        recipient_user_id, type, module, title, message, entity_type,
        entity_id, link_path, created_by, metadata
      ) VALUES (
        p_minutes_responsible_user_id, 'PRESENTATION_MINUTES_ASSIGNED', 'financeiro',
        'Responsabilidade por ata executiva', v_after.title,
        'presentation_session', p_session_id,
        '/financeiro/relatorio-socios?session=' || p_session_id::text,
        v_user, jsonb_build_object('sessionId', p_session_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object('id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at, 'version', v_after.version);
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_create_presentation_session(text,text,date,date,text,date,uuid,uuid[],uuid,jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_presentation_session(text,text,date,date,text,date,uuid,uuid[],uuid,jsonb) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_save_presentation_session(uuid,text,text,date,uuid,uuid[],uuid,jsonb,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_save_presentation_session(uuid,text,text,date,uuid,uuid[],uuid,jsonb,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guarded_start_presentation_session(
  p_session_id uuid,
  p_snapshot jsonb,
  p_expected_status text,
  p_expected_updated_at timestamptz
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
  v_before public.fin_presentation_sessions%ROWTYPE;
  v_after public.fin_presentation_sessions%ROWTYPE;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:manage', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_expected_status <> 'DRAFT' THEN RAISE EXCEPTION 'STATUS_INVALID'; END IF;
  SELECT * INTO v_before FROM public.fin_presentation_sessions session
  WHERE session.id = p_session_id AND session.company_id = v_company FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'; END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'STATUS_INVALID: expected DRAFT, current %', v_before.status; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.fin_presentation_session_participants participant WHERE participant.session_id = p_session_id AND participant.company_id = v_company)
     OR NOT EXISTS (SELECT 1 FROM public.fin_presentation_agenda_items agenda WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company) THEN
    RAISE EXCEPTION 'VALIDATION: participantes e pauta obrigatorios';
  END IF;

  PERFORM public._validate_fin_presentation_meeting_snapshot(
    p_snapshot, v_company, v_before.period_start, v_before.period_end_exclusive, v_before.granularity
  );

  IF EXISTS (
    SELECT 1
    FROM public.fin_presentation_agenda_items agenda
    WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company
      AND agenda.reference_type = 'DECISION'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_snapshot->'decisions') item
        WHERE (item->>'id')::uuid = agenda.reference_id
      )
  ) OR EXISTS (
    SELECT 1
    FROM public.fin_presentation_agenda_items agenda
    WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company
      AND agenda.reference_type = 'ACTION'
      AND NOT EXISTS (
        SELECT 1 FROM jsonb_array_elements(p_snapshot->'actions') item
        WHERE (item->>'id')::uuid = agenda.reference_id
      )
  ) THEN RAISE EXCEPTION 'SNAPSHOT_REFERENCE_MISSING'; END IF;

  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot->'decisions') item
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fin_presentation_agenda_items agenda
      LEFT JOIN public.fin_presentation_decision_actions action
        ON agenda.reference_type = 'ACTION' AND action.id = agenda.reference_id AND action.company_id = v_company
      WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company
        AND (
          (agenda.reference_type = 'DECISION' AND agenda.reference_id = (item->>'id')::uuid)
          OR action.decision_id = (item->>'id')::uuid
        )
    )
  ) OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_snapshot->'actions') item
    WHERE NOT EXISTS (
      SELECT 1
      FROM public.fin_presentation_agenda_items agenda
      LEFT JOIN public.fin_presentation_decision_actions referenced_action
        ON agenda.reference_type = 'ACTION' AND referenced_action.id = agenda.reference_id AND referenced_action.company_id = v_company
      WHERE agenda.session_id = p_session_id AND agenda.company_id = v_company
        AND (
          (agenda.reference_type = 'DECISION' AND agenda.reference_id = (item->>'decisionId')::uuid)
          OR referenced_action.decision_id = (item->>'decisionId')::uuid
        )
    )
  ) THEN RAISE EXCEPTION 'SNAPSHOT_REFERENCE_UNRELATED'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario') INTO v_actor_name
  FROM public.profiles profile WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  UPDATE public.fin_presentation_sessions
  SET status = 'IN_PROGRESS', meeting_snapshot = p_snapshot, started_at = clock_timestamp(),
      latest_justification = NULL, updated_by = v_user, updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(), version = version + 1
  WHERE id = p_session_id RETURNING * INTO v_after;

  INSERT INTO public.fin_audit_logs (entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id)
  VALUES (
    'presentation_session', p_session_id, 'SESSION_STARTED',
    jsonb_build_object('actorName', v_actor_name, 'status', v_before.status, 'version', v_before.version),
    jsonb_build_object(
      'actorName', v_actor_name, 'status', v_after.status, 'version', v_after.version,
      'snapshotContractVersion', p_snapshot->>'contractVersion',
      'snapshotCapturedAt', p_snapshot->>'capturedAt',
      'decisionCount', jsonb_array_length(p_snapshot->'decisions'),
      'actionCount', jsonb_array_length(p_snapshot->'actions')
    ), '', v_user, v_company
  );
  RETURN jsonb_build_object('id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at, 'version', v_after.version);
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_submit_presentation_minutes(
  p_session_id uuid,
  p_revision_reason text,
  p_expected_status text,
  p_expected_updated_at timestamptz
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
  FROM public.profiles profile WHERE profile.id = v_user AND profile.company_id = v_company;
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
  BEGIN
    INSERT INTO public.notifications (
      recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      v_before.minutes_responsible_user_id, 'PRESENTATION_MINUTES_IN_REVIEW', 'financeiro',
      'Ata executiva enviada para revisao', v_before.title,
      'presentation_session', p_session_id,
      '/financeiro/relatorio-socios?session=' || p_session_id::text || '&revision=' || v_revision.id::text,
      v_user, jsonb_build_object('sessionId', p_session_id, 'revisionId', v_revision.id, 'revisionNumber', v_revision_number)
    );
  EXCEPTION WHEN OTHERS THEN NULL;
  END;
  RETURN jsonb_build_object(
    'id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at,
    'version', v_after.version, 'revisionId', v_revision.id, 'revisionNumber', v_revision_number
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_start_presentation_session(uuid,jsonb,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_start_presentation_session(uuid,jsonb,text,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_submit_presentation_minutes(uuid,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_submit_presentation_minutes(uuid,text,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guarded_transition_presentation_session(
  p_session_id uuid,
  p_expected_status text,
  p_target_status text,
  p_justification text,
  p_expected_updated_at timestamptz
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
  FROM public.profiles profile WHERE profile.id = v_user AND profile.company_id = v_company;
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

  IF v_notification_type IS NOT NULL THEN
    BEGIN
      INSERT INTO public.notifications (
        recipient_user_id, type, module, title, message, entity_type,
        entity_id, link_path, created_by, metadata
      ) VALUES (
        v_before.minutes_responsible_user_id, v_notification_type, 'financeiro',
        v_notification_title, v_after.title,
        'presentation_session', p_session_id,
        '/financeiro/relatorio-socios?session=' || p_session_id::text
          || CASE WHEN v_after.current_revision_id IS NULL THEN '' ELSE '&revision=' || v_after.current_revision_id::text END,
        v_user, jsonb_build_object('sessionId', p_session_id, 'revisionId', v_after.current_revision_id)
      );
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
  END IF;
  RETURN jsonb_build_object(
    'id', v_after.id, 'status', v_after.status, 'updatedAt', v_after.updated_at,
    'version', v_after.version, 'currentRevisionId', v_after.current_revision_id
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_transition_presentation_session(uuid,text,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_transition_presentation_session(uuid,text,text,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.get_fin_presentation_minutes_export(p_session_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY['financeiro:relatorio-socios:export', 'system:global:manage'])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:export';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.fin_presentation_sessions session
    WHERE session.id = p_session_id AND session.company_id = v_company
  ) THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  RETURN public.get_fin_presentation_session(p_session_id);
END;
$function$;

REVOKE ALL ON FUNCTION public.get_fin_presentation_minutes_export(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_minutes_export(uuid) TO authenticated, service_role;

COMMENT ON TABLE public.fin_presentation_sessions IS
  'Sessoes explicitas do ritual executivo; evidencias historicas sem participacao em fontes financeiras.';
COMMENT ON TABLE public.fin_presentation_session_participants IS
  'Participantes explicitamente incluidos com nome/email historicos preservados apos exclusao do usuario.';
COMMENT ON TABLE public.fin_presentation_agenda_items IS
  'Pauta estruturada; decisoes e acoes sao referenciadas por id/versao, sem duplicacao canonica.';
COMMENT ON TABLE public.fin_presentation_minutes_revisions IS
  'Versoes imutaveis de atas submetidas, aprovadas ou substituidas por revisao explicita.';
COMMENT ON FUNCTION public.list_fin_presentation_sessions(date,date,text,uuid,uuid,text,integer,integer) IS
  'Lista tenant-scoped de sessoes com filtros de periodo, estado, responsavel e participante.';
COMMENT ON FUNCTION public.get_fin_presentation_session(uuid) IS
  'Detalhe tenant-scoped com pauta, participantes, revisoes, referencias atuais e timeline.';
COMMENT ON FUNCTION public.get_fin_presentation_minutes_export(uuid) IS
  'Mesmo contrato do detalhe, protegido adicionalmente pela permissao export.';

-- Forca a resolucao dos contratos e das colunas relevantes em PostgreSQL real.
DO $migration_check$
BEGIN
  PERFORM public._validate_fin_presentation_meeting_snapshot(
    '{
      "contractVersion":"presentation-meeting-snapshot-v1.0",
      "period":{"start":"2026-01-01","endExclusive":"2026-02-01"},
      "granularity":"day",
      "capturedAt":"2026-02-01T00:00:00.000Z",
      "cutoffDate":"2026-01-31",
      "formulaVersion":"presentation-plan-v1.0",
      "sources":{"actual":"fin_lancamentos","budget":"fin_orcamentos","cmvTarget":"metas_cmv.meta_cmv_total"},
      "rules":{"regime":"competencia","budgetProration":"daily","hierarchyPrecedence":"specific","projectionFormula":"linear","openItemsIncluded":false},
      "metrics":{"revenue":0,"expense":0,"result":0,"marginPercent":null,"cmv":null,"cmvPercent":null},
      "dataUnavailable":["cmv","cmvPercent"],
      "filters":{"comparisonMode":"actual","rankingLimit":10},
      "decisions":[],
      "actions":[]
    }'::jsonb,
    '00000000-0000-0000-0000-000000000002'::uuid,
    DATE '2026-01-01', DATE '2026-02-01', 'day'
  );

  PERFORM pg_catalog.pg_get_functiondef('public.list_fin_presentation_sessions(date,date,text,uuid,uuid,text,integer,integer)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public.get_fin_presentation_session(uuid)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_create_presentation_session(text,text,date,date,text,date,uuid,uuid[],uuid,jsonb)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_save_presentation_session(uuid,text,text,date,uuid,uuid[],uuid,jsonb,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_start_presentation_session(uuid,jsonb,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_submit_presentation_minutes(uuid,text,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_transition_presentation_session(uuid,text,text,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public.get_fin_presentation_minutes_export(uuid)'::regprocedure);

  PERFORM
    session.id, session.company_id, session.title_unaccent, session.period_start,
    session.status, session.meeting_snapshot, session.current_revision_id,
    participant.id, participant.user_id, participant.name_snapshot,
    agenda.id, agenda.position, agenda.reference_id, agenda.reference_version,
    revision.id, revision.revision_number, revision.content
  FROM public.fin_presentation_sessions session
  LEFT JOIN public.fin_presentation_session_participants participant ON participant.session_id = session.id
  LEFT JOIN public.fin_presentation_agenda_items agenda ON agenda.session_id = session.id
  LEFT JOIN public.fin_presentation_minutes_revisions revision ON revision.session_id = session.id
  WHERE false;
END;
$migration_check$;

NOTIFY pgrst, 'reload schema';

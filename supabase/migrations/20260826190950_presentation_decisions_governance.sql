-- Fase 11 - decisoes, plano de acao e governanca da Apresentacao Socios.
--
-- Reutilizacoes deliberadas:
--   * get_fin_presentation_plan continua sendo a unica leitura financeira atual;
--   * PresentationScenarioResult e validado no cliente antes de compor o snapshot;
--   * fin_audit_logs preserva a timeline antes/depois das mutacoes;
--   * profiles e a fonte tenant-scoped de responsaveis;
--   * notifications recebe somente avisos derivados de atribuicoes explicitas.
--
-- A persistencia abaixo guarda evidencia e governanca. Nenhuma tabela participa
-- de realizado, orcamento, metas de CMV, projecoes ou lancamentos financeiros.

CREATE TABLE public.fin_presentation_decisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  title text NOT NULL,
  title_unaccent text GENERATED ALWAYS AS (public.immutable_unaccent(lower(title))) STORED,
  context text NOT NULL,
  period_start date NOT NULL,
  period_end_exclusive date NOT NULL,
  granularity text NOT NULL,
  reference_type text NOT NULL,
  status text NOT NULL DEFAULT 'DRAFT',
  executive_responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  executive_responsible_name_snapshot text,
  current_revision_id uuid,
  ever_approved boolean NOT NULL DEFAULT false,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name_snapshot text,
  approved_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,
  latest_justification text,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_presentation_decisions_title_length CHECK (length(btrim(title)) BETWEEN 1 AND 200),
  CONSTRAINT fin_presentation_decisions_context_length CHECK (length(btrim(context)) BETWEEN 1 AND 10000),
  CONSTRAINT fin_presentation_decisions_period CHECK (period_end_exclusive > period_start),
  CONSTRAINT fin_presentation_decisions_granularity CHECK (granularity IN ('day', 'month', 'year')),
  CONSTRAINT fin_presentation_decisions_reference CHECK (reference_type IN ('BASE', 'SCENARIO')),
  CONSTRAINT fin_presentation_decisions_status CHECK (status IN ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT fin_presentation_decisions_version CHECK (version > 0),
  CONSTRAINT fin_presentation_decisions_latest_reason_length CHECK (latest_justification IS NULL OR length(latest_justification) <= 4000)
);

CREATE TABLE public.fin_presentation_decision_revisions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  decision_id uuid NOT NULL REFERENCES public.fin_presentation_decisions(id) ON DELETE CASCADE,
  revision_number integer NOT NULL,
  reference_type text NOT NULL,
  snapshot jsonb NOT NULL,
  revision_reason text NOT NULL,
  approved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  approved_by_name_snapshot text,
  approved_at timestamptz,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_presentation_decision_revisions_number CHECK (revision_number > 0),
  CONSTRAINT fin_presentation_decision_revisions_reference CHECK (reference_type IN ('BASE', 'SCENARIO')),
  CONSTRAINT fin_presentation_decision_revisions_reason_length CHECK (length(btrim(revision_reason)) BETWEEN 1 AND 4000),
  CONSTRAINT fin_presentation_decision_revisions_snapshot_size CHECK (octet_length(snapshot::text) <= 262144),
  UNIQUE (company_id, decision_id, revision_number)
);

ALTER TABLE public.fin_presentation_decisions
  ADD CONSTRAINT fin_presentation_decisions_current_revision_fk
  FOREIGN KEY (current_revision_id)
  REFERENCES public.fin_presentation_decision_revisions(id)
  ON DELETE RESTRICT;

CREATE TABLE public.fin_presentation_decision_actions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id),
  decision_id uuid NOT NULL REFERENCES public.fin_presentation_decisions(id) ON DELETE CASCADE,
  description text NOT NULL,
  description_unaccent text GENERATED ALWAYS AS (public.immutable_unaccent(lower(description))) STORED,
  responsible_user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  responsible_name_snapshot text NOT NULL,
  due_date date,
  priority text,
  status text NOT NULL DEFAULT 'PENDING',
  outcome_note text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  version integer NOT NULL DEFAULT 1,
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  created_by_name_snapshot text NOT NULL,
  updated_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  updated_by_name_snapshot text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT fin_presentation_decision_actions_description_length CHECK (length(btrim(description)) BETWEEN 1 AND 1000),
  CONSTRAINT fin_presentation_decision_actions_priority CHECK (priority IS NULL OR priority IN ('LOW', 'MEDIUM', 'HIGH', 'CRITICAL')),
  CONSTRAINT fin_presentation_decision_actions_status CHECK (status IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')),
  CONSTRAINT fin_presentation_decision_actions_outcome_length CHECK (outcome_note IS NULL OR length(outcome_note) <= 4000),
  CONSTRAINT fin_presentation_decision_actions_version CHECK (version > 0)
);

CREATE INDEX fin_presentation_decisions_company_status_period_idx
  ON public.fin_presentation_decisions (company_id, status, period_start DESC, period_end_exclusive DESC);
CREATE INDEX fin_presentation_decisions_company_responsible_idx
  ON public.fin_presentation_decisions (company_id, executive_responsible_user_id, updated_at DESC);
CREATE INDEX fin_presentation_decisions_title_search_idx
  ON public.fin_presentation_decisions USING gin (title_unaccent gin_trgm_ops);
CREATE INDEX fin_presentation_decision_revisions_company_decision_idx
  ON public.fin_presentation_decision_revisions (company_id, decision_id, revision_number DESC);
CREATE INDEX fin_presentation_decision_actions_company_status_idx
  ON public.fin_presentation_decision_actions (company_id, status, updated_at DESC);
CREATE INDEX fin_presentation_decision_actions_company_responsible_idx
  ON public.fin_presentation_decision_actions (company_id, responsible_user_id, status);
CREATE INDEX fin_presentation_decision_actions_company_due_idx
  ON public.fin_presentation_decision_actions (company_id, due_date, status) WHERE due_date IS NOT NULL;
CREATE INDEX fin_presentation_decision_actions_description_search_idx
  ON public.fin_presentation_decision_actions USING gin (description_unaccent gin_trgm_ops);

ALTER TABLE public.fin_presentation_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_decisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_decision_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_decision_revisions FORCE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_decision_actions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fin_presentation_decision_actions FORCE ROW LEVEL SECURITY;

CREATE TRIGGER trg_fin_presentation_decisions_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_decisions
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

CREATE TRIGGER trg_fin_presentation_decision_revisions_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_decision_revisions
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

CREATE TRIGGER trg_fin_presentation_decision_actions_block_placeholder
BEFORE INSERT OR UPDATE ON public.fin_presentation_decision_actions
FOR EACH ROW EXECUTE FUNCTION public.trg_block_placeholder_company();

CREATE POLICY fin_presentation_decisions_tenant_read
ON public.fin_presentation_decisions
FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:relatorio-socios:view',
    'system:global:manage'
  ]))
);

CREATE POLICY fin_presentation_decision_revisions_tenant_read
ON public.fin_presentation_decision_revisions
FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:relatorio-socios:view',
    'system:global:manage'
  ]))
);

CREATE POLICY fin_presentation_decision_actions_tenant_read
ON public.fin_presentation_decision_actions
FOR SELECT TO authenticated
USING (
  company_id = (SELECT public.get_current_company_id())
  AND (SELECT public.has_any_permission(auth.uid(), ARRAY[
    'financeiro:relatorio-socios:view',
    'system:global:manage'
  ]))
);

REVOKE ALL ON TABLE public.fin_presentation_decisions FROM anon;
REVOKE ALL ON TABLE public.fin_presentation_decision_revisions FROM anon;
REVOKE ALL ON TABLE public.fin_presentation_decision_actions FROM anon;
GRANT ALL ON TABLE public.fin_presentation_decisions TO authenticated, service_role;
GRANT ALL ON TABLE public.fin_presentation_decision_revisions TO authenticated, service_role;
GRANT ALL ON TABLE public.fin_presentation_decision_actions TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._validate_fin_presentation_decision_snapshot(
  p_snapshot jsonb,
  p_period_start date,
  p_period_end_exclusive date,
  p_granularity text,
  p_reference_type text
)
RETURNS void
LANGUAGE plpgsql
SET search_path = ''
AS $function$
DECLARE
  v_metric text;
  v_metric_type text;
  v_revenue numeric;
BEGIN
  IF p_snapshot IS NULL OR jsonb_typeof(p_snapshot) <> 'object' THEN
    RAISE EXCEPTION 'SNAPSHOT_INVALID: objeto obrigatório';
  END IF;
  IF octet_length(p_snapshot::text) > 262144 THEN
    RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: snapshot';
  END IF;
  IF p_snapshot->>'contractVersion' <> 'presentation-decision-snapshot-v1.0' THEN
    RAISE EXCEPTION 'SNAPSHOT_VERSION_UNKNOWN';
  END IF;
  IF p_snapshot->>'referenceType' IS DISTINCT FROM p_reference_type THEN
    RAISE EXCEPTION 'SNAPSHOT_SOURCE_INCOMPATIBLE';
  END IF;
  IF p_snapshot#>>'{period,start}' IS DISTINCT FROM p_period_start::text
     OR p_snapshot#>>'{period,endExclusive}' IS DISTINCT FROM p_period_end_exclusive::text
     OR p_snapshot->>'granularity' IS DISTINCT FROM p_granularity THEN
    RAISE EXCEPTION 'SNAPSHOT_PERIOD_INCOMPATIBLE';
  END IF;
  IF p_snapshot->>'metricFormulaVersion' <> 'managerial-result-v1.0'
     OR COALESCE(length(p_snapshot->>'cutoffDate'), 0) = 0
     OR COALESCE(length(p_snapshot->>'capturedAt'), 0) = 0 THEN
    RAISE EXCEPTION 'SNAPSHOT_AUDIT_FIELDS_MISSING';
  END IF;
  BEGIN
    PERFORM (p_snapshot->>'cutoffDate')::date;
    PERFORM (p_snapshot->>'capturedAt')::timestamptz;
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'SNAPSHOT_AUDIT_FIELDS_INVALID';
  END;
  IF jsonb_typeof(p_snapshot->'sources') <> 'object'
     OR jsonb_typeof(p_snapshot->'rules') <> 'object'
     OR jsonb_typeof(p_snapshot->'metrics') <> 'object'
     OR jsonb_typeof(p_snapshot->'assumptions') <> 'array' THEN
    RAISE EXCEPTION 'SNAPSHOT_CONTRACT_INVALID';
  END IF;

  FOREACH v_metric IN ARRAY ARRAY['revenue', 'expense', 'result', 'marginPercent', 'cmv', 'cmvPercent'] LOOP
    IF NOT ((p_snapshot->'metrics') ? v_metric) THEN
      RAISE EXCEPTION 'SNAPSHOT_METRIC_MISSING: %', v_metric;
    END IF;
    v_metric_type := jsonb_typeof(p_snapshot->'metrics'->v_metric);
    IF v_metric_type NOT IN ('number', 'null') THEN
      RAISE EXCEPTION 'SNAPSHOT_METRIC_INVALID: %', v_metric;
    END IF;
  END LOOP;
  IF jsonb_typeof(p_snapshot#>'{metrics,revenue}') <> 'number'
     OR jsonb_typeof(p_snapshot#>'{metrics,expense}') <> 'number'
     OR jsonb_typeof(p_snapshot#>'{metrics,result}') <> 'number' THEN
    RAISE EXCEPTION 'SNAPSHOT_METRIC_MISSING';
  END IF;
  v_revenue := (p_snapshot#>>'{metrics,revenue}')::numeric;
  IF v_revenue = 0 AND (
    jsonb_typeof(p_snapshot#>'{metrics,marginPercent}') <> 'null'
    OR jsonb_typeof(p_snapshot#>'{metrics,cmvPercent}') <> 'null'
  ) THEN
    RAISE EXCEPTION 'SNAPSHOT_METRIC_INCOMPATIBLE: zero revenue';
  END IF;

  IF p_snapshot#>>'{sources,actual}' <> 'fin_lancamentos'
     OR p_snapshot#>>'{sources,budget}' <> 'fin_orcamentos'
     OR p_snapshot#>>'{sources,cmvTarget}' <> 'metas_cmv.meta_cmv_total' THEN
    RAISE EXCEPTION 'SNAPSHOT_SOURCE_INCOMPATIBLE';
  END IF;

  IF p_reference_type = 'SCENARIO' THEN
    IF p_snapshot->>'formulaVersion' <> 'presentation-scenario-v1.0'
       OR p_snapshot->>'sourceMode' <> 'scenario'
       OR jsonb_typeof(p_snapshot->'scenarioResult') <> 'object'
       OR jsonb_typeof(p_snapshot->'scenarioDraft') <> 'object'
       OR p_snapshot#>>'{scenarioResult,contractVersion}' <> '1.0'
       OR p_snapshot#>>'{scenarioResult,formulaVersion}' <> 'presentation-scenario-v1.0'
       OR p_snapshot#>>'{scenarioResult,period,start}' IS DISTINCT FROM p_period_start::text
       OR p_snapshot#>>'{scenarioResult,period,endExclusive}' IS DISTINCT FROM p_period_end_exclusive::text
       OR p_snapshot#>>'{scenarioResult,sources,actual}' <> 'fin_lancamentos'
       OR p_snapshot#>>'{scenarioResult,sources,budget}' <> 'fin_orcamentos'
       OR p_snapshot#>>'{scenarioResult,sources,cmvTarget}' <> 'metas_cmv.meta_cmv_total'
       OR jsonb_typeof(p_snapshot#>'{scenarioResult,activeLevers}') <> 'array'
       OR jsonb_array_length(p_snapshot#>'{scenarioResult,activeLevers}') = 0
       OR jsonb_array_length(p_snapshot->'assumptions') = 0
       OR jsonb_array_length(p_snapshot->'assumptions') <> jsonb_array_length(p_snapshot#>'{scenarioResult,activeLevers}')
       OR EXISTS (
         SELECT 1
         FROM jsonb_array_elements(p_snapshot->'assumptions') assumption
         WHERE COALESCE(length(btrim(assumption->>'exactValue')), 0) = 0
       ) THEN
      RAISE EXCEPTION 'SCENARIO_WITHOUT_EXPLICIT_LEVER';
    END IF;
  ELSE
    IF p_snapshot->>'formulaVersion' <> 'presentation-plan-v1.0'
       OR p_snapshot->>'sourceMode' NOT IN ('actual', 'budget', 'projection') THEN
      RAISE EXCEPTION 'SNAPSHOT_SOURCE_INCOMPATIBLE';
    END IF;
  END IF;
END;
$function$;

REVOKE ALL ON FUNCTION public._validate_fin_presentation_decision_snapshot(jsonb,date,date,text,text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._validate_fin_presentation_decision_snapshot(jsonb,date,date,text,text) TO service_role;

CREATE OR REPLACE FUNCTION public.list_fin_presentation_decisions(
  p_period_start date DEFAULT NULL,
  p_period_end_exclusive date DEFAULT NULL,
  p_status text DEFAULT NULL,
  p_responsible_user_id uuid DEFAULT NULL,
  p_due_filter text DEFAULT 'all',
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
  v_offset integer;
  v_search text;
  v_total integer;
  v_items jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:view',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;
  IF p_page < 1 OR p_page_size < 1 OR p_page_size > 50 THEN
    RAISE EXCEPTION 'VALIDATION: paginacao invalida';
  END IF;
  IF p_status IS NOT NULL AND p_status NOT IN ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'VALIDATION: status invalido';
  END IF;
  IF p_due_filter NOT IN ('all', 'overdue', 'upcoming', 'no-deadline') THEN
    RAISE EXCEPTION 'VALIDATION: filtro de prazo invalido';
  END IF;
  IF length(COALESCE(p_search, '')) > 100 THEN
    RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: search';
  END IF;
  IF p_period_start IS NOT NULL AND p_period_end_exclusive IS NOT NULL
     AND p_period_end_exclusive <= p_period_start THEN
    RAISE EXCEPTION 'VALIDATION: periodo invalido';
  END IF;

  v_offset := (p_page - 1) * p_page_size;
  v_search := public.immutable_unaccent(lower(btrim(COALESCE(p_search, ''))));

  WITH filtered AS (
    SELECT decision.id
    FROM public.fin_presentation_decisions decision
    WHERE decision.company_id = v_company
      AND (p_period_start IS NULL OR decision.period_end_exclusive > p_period_start)
      AND (p_period_end_exclusive IS NULL OR decision.period_start < p_period_end_exclusive)
      AND (p_status IS NULL OR decision.status = p_status)
      AND (p_responsible_user_id IS NULL OR decision.executive_responsible_user_id = p_responsible_user_id)
      AND (v_search = '' OR decision.title_unaccent ILIKE '%' || v_search || '%')
      AND (
        p_due_filter = 'all'
        OR (p_due_filter = 'overdue' AND EXISTS (
          SELECT 1
          FROM public.fin_presentation_decision_actions action
          WHERE action.decision_id = decision.id
            AND action.company_id = v_company
            AND action.status IN ('PENDING', 'IN_PROGRESS')
            AND action.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ))
        OR (p_due_filter = 'upcoming' AND EXISTS (
          SELECT 1
          FROM public.fin_presentation_decision_actions action
          WHERE action.decision_id = decision.id
            AND action.company_id = v_company
            AND action.status IN ('PENDING', 'IN_PROGRESS')
            AND action.due_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ))
        OR (p_due_filter = 'no-deadline' AND EXISTS (
          SELECT 1
          FROM public.fin_presentation_decision_actions action
          WHERE action.decision_id = decision.id
            AND action.company_id = v_company
            AND action.status IN ('PENDING', 'IN_PROGRESS')
            AND action.due_date IS NULL
        ))
      )
  )
  SELECT count(*) INTO v_total FROM filtered;

  WITH filtered AS (
    SELECT decision.*
    FROM public.fin_presentation_decisions decision
    WHERE decision.company_id = v_company
      AND (p_period_start IS NULL OR decision.period_end_exclusive > p_period_start)
      AND (p_period_end_exclusive IS NULL OR decision.period_start < p_period_end_exclusive)
      AND (p_status IS NULL OR decision.status = p_status)
      AND (p_responsible_user_id IS NULL OR decision.executive_responsible_user_id = p_responsible_user_id)
      AND (v_search = '' OR decision.title_unaccent ILIKE '%' || v_search || '%')
      AND (
        p_due_filter = 'all'
        OR (p_due_filter = 'overdue' AND EXISTS (
          SELECT 1 FROM public.fin_presentation_decision_actions action
          WHERE action.decision_id = decision.id AND action.company_id = v_company
            AND action.status IN ('PENDING', 'IN_PROGRESS')
            AND action.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ))
        OR (p_due_filter = 'upcoming' AND EXISTS (
          SELECT 1 FROM public.fin_presentation_decision_actions action
          WHERE action.decision_id = decision.id AND action.company_id = v_company
            AND action.status IN ('PENDING', 'IN_PROGRESS')
            AND action.due_date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date
        ))
        OR (p_due_filter = 'no-deadline' AND EXISTS (
          SELECT 1 FROM public.fin_presentation_decision_actions action
          WHERE action.decision_id = decision.id AND action.company_id = v_company
            AND action.status IN ('PENDING', 'IN_PROGRESS') AND action.due_date IS NULL
        ))
      )
    ORDER BY decision.updated_at DESC, decision.id
    LIMIT p_page_size OFFSET v_offset
  )
  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', decision.id,
      'title', decision.title,
      'status', decision.status,
      'referenceType', decision.reference_type,
      'period', jsonb_build_object('start', decision.period_start, 'endExclusive', decision.period_end_exclusive),
      'granularity', decision.granularity,
      'executiveResponsibleUserId', decision.executive_responsible_user_id,
      'executiveResponsibleName', decision.executive_responsible_name_snapshot,
      'createdBy', decision.created_by,
      'createdByName', decision.created_by_name_snapshot,
      'createdAt', decision.created_at,
      'updatedAt', decision.updated_at,
      'version', decision.version,
      'actionCounts', jsonb_build_object(
        'pending', counts.pending_count,
        'inProgress', counts.in_progress_count,
        'completed', counts.completed_count,
        'cancelled', counts.cancelled_count,
        'overdue', counts.overdue_count
      )
    ) ORDER BY decision.updated_at DESC, decision.id
  ), '[]'::jsonb)
  INTO v_items
  FROM filtered decision
  CROSS JOIN LATERAL (
    SELECT
      count(*) FILTER (WHERE action.status = 'PENDING')::integer AS pending_count,
      count(*) FILTER (WHERE action.status = 'IN_PROGRESS')::integer AS in_progress_count,
      count(*) FILTER (WHERE action.status = 'COMPLETED')::integer AS completed_count,
      count(*) FILTER (WHERE action.status = 'CANCELLED')::integer AS cancelled_count,
      count(*) FILTER (
        WHERE action.status IN ('PENDING', 'IN_PROGRESS')
          AND action.due_date < (now() AT TIME ZONE 'America/Sao_Paulo')::date
      )::integer AS overdue_count
    FROM public.fin_presentation_decision_actions action
    WHERE action.decision_id = decision.id AND action.company_id = v_company
  ) counts;

  RETURN jsonb_build_object(
    'contractVersion', 'presentation-decision-governance-v1.0',
    'items', v_items,
    'page', p_page,
    'pageSize', p_page_size,
    'totalCount', v_total,
    'hasMore', v_offset + jsonb_array_length(v_items) < v_total,
    'fetchedAt', now()
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public.get_fin_presentation_decision(p_decision_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $function$
DECLARE
  v_company uuid;
  v_user uuid;
  v_decision public.fin_presentation_decisions%ROWTYPE;
  v_revisions jsonb;
  v_actions jsonb;
  v_timeline jsonb;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:view',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:view';
  END IF;

  SELECT * INTO v_decision
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = p_decision_id AND decision.company_id = v_company;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', revision.id,
      'revisionNumber', revision.revision_number,
      'referenceType', revision.reference_type,
      'snapshot', revision.snapshot,
      'revisionReason', revision.revision_reason,
      'approvedBy', revision.approved_by,
      'approvedByName', revision.approved_by_name_snapshot,
      'approvedAt', revision.approved_at,
      'createdBy', revision.created_by,
      'createdByName', revision.created_by_name_snapshot,
      'createdAt', revision.created_at
    ) ORDER BY revision.revision_number DESC
  ), '[]'::jsonb)
  INTO v_revisions
  FROM public.fin_presentation_decision_revisions revision
  WHERE revision.decision_id = p_decision_id AND revision.company_id = v_company;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', action.id,
      'decisionId', action.decision_id,
      'description', action.description,
      'responsibleUserId', action.responsible_user_id,
      'responsibleName', action.responsible_name_snapshot,
      'dueDate', action.due_date,
      'priority', action.priority,
      'status', action.status,
      'outcomeNote', action.outcome_note,
      'completedAt', action.completed_at,
      'cancelledAt', action.cancelled_at,
      'version', action.version,
      'createdBy', action.created_by,
      'createdByName', action.created_by_name_snapshot,
      'updatedBy', action.updated_by,
      'updatedByName', action.updated_by_name_snapshot,
      'createdAt', action.created_at,
      'updatedAt', action.updated_at
    ) ORDER BY
      CASE action.status WHEN 'IN_PROGRESS' THEN 1 WHEN 'PENDING' THEN 2 WHEN 'COMPLETED' THEN 3 ELSE 4 END,
      action.due_date NULLS LAST,
      action.created_at,
      action.id
  ), '[]'::jsonb)
  INTO v_actions
  FROM public.fin_presentation_decision_actions action
  WHERE action.decision_id = p_decision_id AND action.company_id = v_company;

  SELECT COALESCE(jsonb_agg(
    jsonb_build_object(
      'id', audit.id,
      'eventType', audit.acao,
      'before', audit.antes,
      'after', audit.depois,
      'justification', NULLIF(audit.justificativa, ''),
      'actorUserId', audit.user_id,
      'actorName', COALESCE(audit.depois->>'actorName', audit.antes->>'actorName', 'Usuario removido'),
      'createdAt', audit.created_at
    ) ORDER BY audit.created_at DESC, audit.id DESC
  ), '[]'::jsonb)
  INTO v_timeline
  FROM public.fin_audit_logs audit
  WHERE audit.company_id = v_company
    AND audit.entidade = 'presentation_decision'
    AND audit.entidade_id = p_decision_id;

  RETURN jsonb_build_object(
    'contractVersion', 'presentation-decision-governance-v1.0',
    'decision', jsonb_build_object(
      'id', v_decision.id,
      'title', v_decision.title,
      'context', v_decision.context,
      'period', jsonb_build_object('start', v_decision.period_start, 'endExclusive', v_decision.period_end_exclusive),
      'granularity', v_decision.granularity,
      'referenceType', v_decision.reference_type,
      'status', v_decision.status,
      'executiveResponsibleUserId', v_decision.executive_responsible_user_id,
      'executiveResponsibleName', v_decision.executive_responsible_name_snapshot,
      'currentRevisionId', v_decision.current_revision_id,
      'everApproved', v_decision.ever_approved,
      'approvedBy', v_decision.approved_by,
      'approvedByName', v_decision.approved_by_name_snapshot,
      'approvedAt', v_decision.approved_at,
      'completedAt', v_decision.completed_at,
      'cancelledAt', v_decision.cancelled_at,
      'latestJustification', v_decision.latest_justification,
      'version', v_decision.version,
      'createdBy', v_decision.created_by,
      'createdByName', v_decision.created_by_name_snapshot,
      'updatedBy', v_decision.updated_by,
      'updatedByName', v_decision.updated_by_name_snapshot,
      'createdAt', v_decision.created_at,
      'updatedAt', v_decision.updated_at
    ),
    'revisions', v_revisions,
    'actions', v_actions,
    'timeline', v_timeline,
    'fetchedAt', now()
  );
END;
$function$;

REVOKE ALL ON FUNCTION public.list_fin_presentation_decisions(date,date,text,uuid,text,text,integer,integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_fin_presentation_decisions(date,date,text,uuid,text,text,integer,integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_fin_presentation_decision(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_fin_presentation_decision(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guarded_create_presentation_decision(
  p_title text,
  p_context text,
  p_period_start date,
  p_period_end_exclusive date,
  p_granularity text,
  p_reference_type text,
  p_snapshot jsonb,
  p_executive_responsible_user_id uuid DEFAULT NULL
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
  v_decision_id uuid;
  v_revision_id uuid;
  v_updated_at timestamptz;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:manage',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:manage';
  END IF;
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

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF p_executive_responsible_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
      INTO v_responsible_name
    FROM public.profiles profile
    WHERE profile.id = p_executive_responsible_user_id
      AND profile.company_id = v_company
      AND profile.nome NOT ILIKE '[EXCLUIDO]%'
      AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
    IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
  END IF;

  PERFORM public._validate_fin_presentation_decision_snapshot(
    p_snapshot, p_period_start, p_period_end_exclusive, p_granularity, p_reference_type
  );

  INSERT INTO public.fin_presentation_decisions (
    company_id, title, context, period_start, period_end_exclusive, granularity,
    reference_type, status, executive_responsible_user_id,
    executive_responsible_name_snapshot, created_by, created_by_name_snapshot,
    updated_by, updated_by_name_snapshot
  ) VALUES (
    v_company, btrim(p_title), btrim(p_context), p_period_start, p_period_end_exclusive,
    p_granularity, p_reference_type, 'DRAFT', p_executive_responsible_user_id,
    v_responsible_name, v_user, v_actor_name, v_user, v_actor_name
  )
  RETURNING id INTO v_decision_id;

  INSERT INTO public.fin_presentation_decision_revisions (
    company_id, decision_id, revision_number, reference_type, snapshot,
    revision_reason, created_by, created_by_name_snapshot
  ) VALUES (
    v_company, v_decision_id, 1, p_reference_type, p_snapshot,
    'Registro inicial', v_user, v_actor_name
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.fin_presentation_decisions
  SET current_revision_id = v_revision_id,
      updated_at = clock_timestamp()
  WHERE id = v_decision_id
  RETURNING updated_at INTO v_updated_at;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', v_decision_id, 'DECISION_CREATED', NULL,
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
    'id', v_decision_id,
    'currentRevisionId', v_revision_id,
    'status', 'DRAFT',
    'version', 1,
    'updatedAt', v_updated_at
  );
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_update_presentation_decision_draft(
  p_decision_id uuid,
  p_title text,
  p_context text,
  p_executive_responsible_user_id uuid,
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
  v_before public.fin_presentation_decisions%ROWTYPE;
  v_after public.fin_presentation_decisions%ROWTYPE;
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
  IF p_title IS NULL OR length(btrim(p_title)) NOT BETWEEN 1 AND 200
     OR p_context IS NULL OR length(btrim(p_context)) NOT BETWEEN 1 AND 10000 THEN
    RAISE EXCEPTION 'VALIDATION: campos invalidos';
  END IF;

  SELECT * INTO v_before
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = p_decision_id AND decision.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;
  IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'STATUS_INVALID: DRAFT required'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF p_executive_responsible_user_id IS NOT NULL THEN
    SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
      INTO v_responsible_name
    FROM public.profiles profile
    WHERE profile.id = p_executive_responsible_user_id
      AND profile.company_id = v_company
      AND profile.nome NOT ILIKE '[EXCLUIDO]%'
      AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
    IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;
  END IF;

  UPDATE public.fin_presentation_decisions
  SET title = btrim(p_title),
      context = btrim(p_context),
      executive_responsible_user_id = p_executive_responsible_user_id,
      executive_responsible_name_snapshot = v_responsible_name,
      updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(),
      version = version + 1
  WHERE id = p_decision_id
  RETURNING * INTO v_after;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', p_decision_id, 'DRAFT_UPDATED',
    jsonb_build_object(
      'actorName', v_actor_name,
      'title', v_before.title,
      'context', v_before.context,
      'executiveResponsibleUserId', v_before.executive_responsible_user_id,
      'executiveResponsibleName', v_before.executive_responsible_name_snapshot,
      'version', v_before.version
    ),
    jsonb_build_object(
      'actorName', v_actor_name,
      'title', v_after.title,
      'context', v_after.context,
      'executiveResponsibleUserId', v_after.executive_responsible_user_id,
      'executiveResponsibleName', v_after.executive_responsible_name_snapshot,
      'version', v_after.version
    ),
    '', v_user, v_company
  );

  RETURN jsonb_build_object('id', v_after.id, 'status', v_after.status, 'version', v_after.version, 'updatedAt', v_after.updated_at);
END;
$function$;

CREATE OR REPLACE FUNCTION public._guarded_add_presentation_decision_revision(
  p_decision_id uuid,
  p_reference_type text,
  p_snapshot jsonb,
  p_reason text,
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
  v_before public.fin_presentation_decisions%ROWTYPE;
  v_after public.fin_presentation_decisions%ROWTYPE;
  v_revision_id uuid;
  v_revision_number integer;
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
  IF p_expected_status NOT IN ('DRAFT', 'APPROVED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'STATUS_INVALID'; END IF;
  IF p_reason IS NULL OR length(btrim(p_reason)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'JUSTIFICATION_REQUIRED';
  END IF;

  SELECT * INTO v_before
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = p_decision_id AND decision.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;
  IF v_before.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'STATUS_INVALID: expected %, current %', p_expected_status, v_before.status;
  END IF;
  IF v_before.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'STATUS_INVALID: reopen decision first';
  END IF;

  SELECT count(*)::integer + 1 INTO v_revision_number
  FROM public.fin_presentation_decision_revisions revision
  WHERE revision.decision_id = p_decision_id AND revision.company_id = v_company;
  IF v_revision_number > 50 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: revisions'; END IF;

  PERFORM public._validate_fin_presentation_decision_snapshot(
    p_snapshot, v_before.period_start, v_before.period_end_exclusive,
    v_before.granularity, p_reference_type
  );

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  INSERT INTO public.fin_presentation_decision_revisions (
    company_id, decision_id, revision_number, reference_type, snapshot,
    revision_reason, created_by, created_by_name_snapshot
  ) VALUES (
    v_company, p_decision_id, v_revision_number, p_reference_type, p_snapshot,
    btrim(p_reason), v_user, v_actor_name
  )
  RETURNING id INTO v_revision_id;

  UPDATE public.fin_presentation_decisions
  SET reference_type = p_reference_type,
      current_revision_id = v_revision_id,
      status = 'DRAFT',
      approved_by = NULL,
      approved_by_name_snapshot = NULL,
      approved_at = NULL,
      completed_at = NULL,
      cancelled_at = NULL,
      latest_justification = btrim(p_reason),
      updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = clock_timestamp(),
      version = version + 1
  WHERE id = p_decision_id
  RETURNING * INTO v_after;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', p_decision_id, 'REVISION_CREATED',
    jsonb_build_object(
      'actorName', v_actor_name,
      'status', v_before.status,
      'currentRevisionId', v_before.current_revision_id,
      'referenceType', v_before.reference_type,
      'version', v_before.version
    ),
    jsonb_build_object(
      'actorName', v_actor_name,
      'status', v_after.status,
      'currentRevisionId', v_revision_id,
      'revisionNumber', v_revision_number,
      'referenceType', p_reference_type,
      'version', v_after.version
    ),
    btrim(p_reason), v_user, v_company
  );

  RETURN jsonb_build_object(
    'id', p_decision_id,
    'currentRevisionId', v_revision_id,
    'revisionNumber', v_revision_number,
    'status', v_after.status,
    'version', v_after.version,
    'updatedAt', v_after.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_create_presentation_decision(text,text,date,date,text,text,jsonb,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_presentation_decision(text,text,date,date,text,text,jsonb,uuid) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_update_presentation_decision_draft(uuid,text,text,uuid,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_presentation_decision_draft(uuid,text,text,uuid,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_add_presentation_decision_revision(uuid,text,jsonb,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_add_presentation_decision_revision(uuid,text,jsonb,text,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guarded_transition_presentation_decision(
  p_decision_id uuid,
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
  v_before public.fin_presentation_decisions%ROWTYPE;
  v_after public.fin_presentation_decisions%ROWTYPE;
  v_current_revision public.fin_presentation_decision_revisions%ROWTYPE;
  v_new_revision_id uuid;
  v_new_revision_number integer;
  v_now timestamptz := clock_timestamp();
  v_event text;
BEGIN
  v_company := public.assert_tenant();
  v_user := auth.uid();
  IF NOT (SELECT public.has_any_permission(v_user, ARRAY[
    'financeiro:relatorio-socios:approve',
    'system:global:manage'
  ])) THEN
    RAISE EXCEPTION 'PERMISSION_DENIED: financeiro:relatorio-socios:approve';
  END IF;
  IF p_expected_updated_at IS NULL THEN RAISE EXCEPTION 'OPTIMISTIC_LOCK_REQUIRED'; END IF;
  IF p_justification IS NULL OR length(btrim(p_justification)) NOT BETWEEN 1 AND 4000 THEN
    RAISE EXCEPTION 'JUSTIFICATION_REQUIRED';
  END IF;
  IF p_expected_status NOT IN ('DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
     OR p_target_status NOT IN ('DRAFT', 'APPROVED', 'COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'TRANSITION_INVALID';
  END IF;

  SELECT * INTO v_before
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = p_decision_id AND decision.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_before.updated_at IS DISTINCT FROM p_expected_updated_at THEN
    RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT';
  END IF;
  IF v_before.status IS DISTINCT FROM p_expected_status THEN
    RAISE EXCEPTION 'STATUS_INVALID: expected %, current %', p_expected_status, v_before.status;
  END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  IF p_target_status = 'APPROVED' THEN
    IF v_before.status <> 'DRAFT' THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
    UPDATE public.fin_presentation_decision_revisions
    SET approved_by = v_user,
        approved_by_name_snapshot = v_actor_name,
        approved_at = v_now
    WHERE id = v_before.current_revision_id
      AND decision_id = p_decision_id
      AND company_id = v_company
      AND approved_at IS NULL;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVISION_INVALID'; END IF;

    UPDATE public.fin_presentation_decisions
    SET status = 'APPROVED',
        ever_approved = true,
        approved_by = v_user,
        approved_by_name_snapshot = v_actor_name,
        approved_at = v_now,
        completed_at = NULL,
        cancelled_at = NULL,
        latest_justification = btrim(p_justification),
        updated_by = v_user,
        updated_by_name_snapshot = v_actor_name,
        updated_at = v_now,
        version = version + 1
    WHERE id = p_decision_id
    RETURNING * INTO v_after;
    v_event := 'DECISION_APPROVED';

  ELSIF p_target_status = 'COMPLETED' THEN
    IF v_before.status NOT IN ('APPROVED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
    IF EXISTS (
      SELECT 1 FROM public.fin_presentation_decision_actions action
      WHERE action.decision_id = p_decision_id
        AND action.company_id = v_company
        AND action.status IN ('PENDING', 'IN_PROGRESS')
    ) THEN
      RAISE EXCEPTION 'ACTIVE_ACTIONS_REMAIN';
    END IF;
    UPDATE public.fin_presentation_decisions
    SET status = 'COMPLETED',
        completed_at = v_now,
        cancelled_at = NULL,
        latest_justification = btrim(p_justification),
        updated_by = v_user,
        updated_by_name_snapshot = v_actor_name,
        updated_at = v_now,
        version = version + 1
    WHERE id = p_decision_id
    RETURNING * INTO v_after;
    v_event := 'DECISION_COMPLETED';

  ELSIF p_target_status = 'CANCELLED' THEN
    IF v_before.status NOT IN ('DRAFT', 'APPROVED', 'IN_PROGRESS') THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
    UPDATE public.fin_presentation_decisions
    SET status = 'CANCELLED',
        cancelled_at = v_now,
        completed_at = NULL,
        latest_justification = btrim(p_justification),
        updated_by = v_user,
        updated_by_name_snapshot = v_actor_name,
        updated_at = v_now,
        version = version + 1
    WHERE id = p_decision_id
    RETURNING * INTO v_after;
    v_event := 'DECISION_CANCELLED';

  ELSIF p_target_status = 'DRAFT' THEN
    IF v_before.status NOT IN ('COMPLETED', 'CANCELLED') THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
    SELECT * INTO v_current_revision
    FROM public.fin_presentation_decision_revisions revision
    WHERE revision.id = v_before.current_revision_id
      AND revision.decision_id = p_decision_id
      AND revision.company_id = v_company;
    IF NOT FOUND THEN RAISE EXCEPTION 'REVISION_INVALID'; END IF;

    SELECT count(*)::integer + 1 INTO v_new_revision_number
    FROM public.fin_presentation_decision_revisions revision
    WHERE revision.decision_id = p_decision_id AND revision.company_id = v_company;
    IF v_new_revision_number > 50 THEN RAISE EXCEPTION 'PAYLOAD_TOO_LARGE: revisions'; END IF;

    INSERT INTO public.fin_presentation_decision_revisions (
      company_id, decision_id, revision_number, reference_type, snapshot,
      revision_reason, created_by, created_by_name_snapshot
    ) VALUES (
      v_company, p_decision_id, v_new_revision_number, v_current_revision.reference_type,
      v_current_revision.snapshot, btrim(p_justification), v_user, v_actor_name
    ) RETURNING id INTO v_new_revision_id;

    UPDATE public.fin_presentation_decisions
    SET status = 'DRAFT',
        current_revision_id = v_new_revision_id,
        approved_by = NULL,
        approved_by_name_snapshot = NULL,
        approved_at = NULL,
        completed_at = NULL,
        cancelled_at = NULL,
        latest_justification = btrim(p_justification),
        updated_by = v_user,
        updated_by_name_snapshot = v_actor_name,
        updated_at = v_now,
        version = version + 1
    WHERE id = p_decision_id
    RETURNING * INTO v_after;
    v_event := 'DECISION_REOPENED';
  ELSE
    RAISE EXCEPTION 'TRANSITION_INVALID';
  END IF;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', p_decision_id, v_event,
    jsonb_build_object(
      'actorName', v_actor_name,
      'status', v_before.status,
      'currentRevisionId', v_before.current_revision_id,
      'version', v_before.version
    ),
    jsonb_build_object(
      'actorName', v_actor_name,
      'status', v_after.status,
      'currentRevisionId', v_after.current_revision_id,
      'version', v_after.version
    ),
    btrim(p_justification), v_user, v_company
  );

  RETURN jsonb_build_object(
    'id', v_after.id,
    'status', v_after.status,
    'currentRevisionId', v_after.current_revision_id,
    'version', v_after.version,
    'updatedAt', v_after.updated_at
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_transition_presentation_decision(uuid,text,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_transition_presentation_decision(uuid,text,text,text,timestamptz) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public._guarded_create_presentation_decision_action(
  p_decision_id uuid,
  p_description text,
  p_responsible_user_id uuid,
  p_expected_decision_status text,
  p_expected_decision_updated_at timestamptz,
  p_due_date date,
  p_priority text
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
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_responsible_name
  FROM public.profiles profile
  WHERE profile.id = p_responsible_user_id
    AND profile.company_id = v_company
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;

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
    recipient_user_id, type, module, title, message, entity_type,
    entity_id, link_path, created_by, metadata
  ) VALUES (
    p_responsible_user_id, 'PRESENTATION_ACTION_ASSIGNED', 'financeiro',
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

CREATE OR REPLACE FUNCTION public._guarded_update_presentation_decision_action(
  p_action_id uuid,
  p_description text,
  p_responsible_user_id uuid,
  p_due_date date,
  p_priority text,
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
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_responsible_name
  FROM public.profiles profile
  WHERE profile.id = p_responsible_user_id
    AND profile.company_id = v_company
    AND profile.nome NOT ILIKE '[EXCLUIDO]%'
    AND profile.nome NOT ILIKE '[EXCLUÍDO]%';
  IF v_responsible_name IS NULL THEN RAISE EXCEPTION 'RESPONSIBLE_OUT_OF_TENANT'; END IF;

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
      recipient_user_id, type, module, title, message, entity_type,
      entity_id, link_path, created_by, metadata
    ) VALUES (
      p_responsible_user_id, 'PRESENTATION_ACTION_ASSIGNED', 'financeiro',
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

CREATE OR REPLACE FUNCTION public._guarded_transition_presentation_decision_action(
  p_action_id uuid,
  p_expected_status text,
  p_target_status text,
  p_outcome_note text,
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
  v_decision public.fin_presentation_decisions%ROWTYPE;
  v_before public.fin_presentation_decision_actions%ROWTYPE;
  v_after public.fin_presentation_decision_actions%ROWTYPE;
  v_now timestamptz := clock_timestamp();
  v_decision_started boolean := false;
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
  IF p_expected_status NOT IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED')
     OR p_target_status NOT IN ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'TRANSITION_INVALID';
  END IF;
  IF p_target_status IN ('COMPLETED', 'CANCELLED', 'PENDING')
     AND (p_outcome_note IS NULL OR length(btrim(p_outcome_note)) NOT BETWEEN 1 AND 4000) THEN
    RAISE EXCEPTION 'JUSTIFICATION_REQUIRED';
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

  SELECT * INTO v_decision
  FROM public.fin_presentation_decisions decision
  WHERE decision.id = v_before.decision_id AND decision.company_id = v_company
  FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'NOT_FOUND'; END IF;
  IF v_decision.status IN ('COMPLETED', 'CANCELLED') THEN
    RAISE EXCEPTION 'STATUS_INVALID: reopen decision first';
  END IF;

  IF p_target_status = 'IN_PROGRESS' THEN
    IF v_before.status <> 'PENDING' OR v_decision.status NOT IN ('APPROVED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'TRANSITION_INVALID';
    END IF;
  ELSIF p_target_status = 'COMPLETED' THEN
    IF v_before.status NOT IN ('PENDING', 'IN_PROGRESS') OR v_decision.status NOT IN ('APPROVED', 'IN_PROGRESS') THEN
      RAISE EXCEPTION 'TRANSITION_INVALID';
    END IF;
  ELSIF p_target_status = 'CANCELLED' THEN
    IF v_before.status NOT IN ('PENDING', 'IN_PROGRESS') THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
  ELSIF p_target_status = 'PENDING' THEN
    IF v_before.status NOT IN ('COMPLETED', 'CANCELLED') THEN RAISE EXCEPTION 'TRANSITION_INVALID'; END IF;
  END IF;

  SELECT COALESCE(NULLIF(btrim(profile.nome), ''), NULLIF(profile.email, ''), 'Usuario')
    INTO v_actor_name
  FROM public.profiles profile
  WHERE profile.id = v_user AND profile.company_id = v_company;
  IF v_actor_name IS NULL THEN RAISE EXCEPTION 'PROFILE_NOT_FOUND'; END IF;

  UPDATE public.fin_presentation_decision_actions
  SET status = p_target_status,
      outcome_note = CASE WHEN p_target_status IN ('COMPLETED', 'CANCELLED') THEN btrim(p_outcome_note) ELSE NULL END,
      completed_at = CASE WHEN p_target_status = 'COMPLETED' THEN v_now ELSE NULL END,
      cancelled_at = CASE WHEN p_target_status = 'CANCELLED' THEN v_now ELSE NULL END,
      updated_by = v_user,
      updated_by_name_snapshot = v_actor_name,
      updated_at = v_now,
      version = version + 1
  WHERE id = p_action_id
  RETURNING * INTO v_after;

  IF p_target_status = 'IN_PROGRESS' AND v_decision.status = 'APPROVED' THEN
    UPDATE public.fin_presentation_decisions
    SET status = 'IN_PROGRESS',
        updated_by = v_user,
        updated_by_name_snapshot = v_actor_name,
        updated_at = v_now,
        version = version + 1
    WHERE id = v_decision.id;
    v_decision_started := true;
  ELSE
    UPDATE public.fin_presentation_decisions
    SET updated_by = v_user,
        updated_by_name_snapshot = v_actor_name,
        updated_at = v_now,
        version = version + 1
    WHERE id = v_decision.id;
  END IF;

  IF v_decision_started THEN
    INSERT INTO public.fin_audit_logs (
      entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
    ) VALUES (
      'presentation_decision', v_decision.id, 'DECISION_IN_PROGRESS',
      jsonb_build_object('actorName', v_actor_name, 'status', 'APPROVED'),
      jsonb_build_object('actorName', v_actor_name, 'status', 'IN_PROGRESS', 'triggerActionId', v_after.id),
      '', v_user, v_company
    );
  END IF;

  INSERT INTO public.fin_audit_logs (
    entidade, entidade_id, acao, antes, depois, justificativa, user_id, company_id
  ) VALUES (
    'presentation_decision', v_before.decision_id,
    CASE WHEN p_target_status = 'PENDING' THEN 'ACTION_REOPENED' ELSE 'ACTION_STATUS_CHANGED' END,
    jsonb_build_object(
      'actorName', v_actor_name,
      'actionId', v_before.id,
      'status', v_before.status,
      'outcomeNote', v_before.outcome_note,
      'version', v_before.version
    ),
    jsonb_build_object(
      'actorName', v_actor_name,
      'actionId', v_after.id,
      'status', v_after.status,
      'outcomeNote', v_after.outcome_note,
      'version', v_after.version
    ),
    COALESCE(btrim(p_outcome_note), ''), v_user, v_company
  );

  RETURN jsonb_build_object(
    'id', v_after.id,
    'decisionId', v_after.decision_id,
    'status', v_after.status,
    'version', v_after.version,
    'updatedAt', v_after.updated_at,
    'decisionStatus', CASE WHEN v_decision_started THEN 'IN_PROGRESS' ELSE v_decision.status END
  );
END;
$function$;

REVOKE ALL ON FUNCTION public._guarded_create_presentation_decision_action(uuid,text,uuid,text,timestamptz,date,text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_create_presentation_decision_action(uuid,text,uuid,text,timestamptz,date,text) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_update_presentation_decision_action(uuid,text,uuid,date,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_update_presentation_decision_action(uuid,text,uuid,date,text,text,timestamptz) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public._guarded_transition_presentation_decision_action(uuid,text,text,text,timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._guarded_transition_presentation_decision_action(uuid,text,text,text,timestamptz) TO authenticated, service_role;

COMMENT ON TABLE public.fin_presentation_decisions IS
  'Governanca da Apresentacao Socios; nao participa de nenhuma fonte financeira canonica.';
COMMENT ON TABLE public.fin_presentation_decision_revisions IS
  'Revisoes imutaveis dos snapshots que sustentam decisoes executivas.';
COMMENT ON TABLE public.fin_presentation_decision_actions IS
  'Compromissos explicitos vinculados a decisoes, sem percentual de progresso inferido.';
COMMENT ON FUNCTION public.list_fin_presentation_decisions(date,date,text,uuid,text,text,integer,integer) IS
  'Lista tenant-scoped de decisoes com filtros e contagens de acoes.';
COMMENT ON FUNCTION public.get_fin_presentation_decision(uuid) IS
  'Detalhe tenant-scoped com revisoes, acoes e timeline auditavel.';

-- Forca resolucao de funcoes e colunas durante a aplicacao da migration.
DO $migration_check$
BEGIN
  PERFORM public._validate_fin_presentation_decision_snapshot(
    '{
      "contractVersion":"presentation-decision-snapshot-v1.0",
      "referenceType":"BASE",
      "sourceMode":"actual",
      "period":{"start":"2026-01-01","endExclusive":"2026-02-01"},
      "granularity":"day",
      "cutoffDate":"2026-01-31",
      "capturedAt":"2026-02-01T00:00:00.000Z",
      "formulaVersion":"presentation-plan-v1.0",
      "metricFormulaVersion":"managerial-result-v1.0",
      "sources":{"actual":"fin_lancamentos"},
      "rules":{"regime":"competencia"},
      "metrics":{"revenue":0,"expense":0,"result":0,"marginPercent":null,"cmv":null,"cmvPercent":null},
      "assumptions":[]
    }'::jsonb,
    DATE '2026-01-01', DATE '2026-02-01', 'day', 'BASE'
  );

  PERFORM pg_catalog.pg_get_functiondef('public.list_fin_presentation_decisions(date,date,text,uuid,text,text,integer,integer)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public.get_fin_presentation_decision(uuid)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_create_presentation_decision(text,text,date,date,text,text,jsonb,uuid)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_update_presentation_decision_draft(uuid,text,text,uuid,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_add_presentation_decision_revision(uuid,text,jsonb,text,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_transition_presentation_decision(uuid,text,text,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_create_presentation_decision_action(uuid,text,uuid,text,timestamptz,date,text)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_update_presentation_decision_action(uuid,text,uuid,date,text,text,timestamptz)'::regprocedure);
  PERFORM pg_catalog.pg_get_functiondef('public._guarded_transition_presentation_decision_action(uuid,text,text,text,timestamptz)'::regprocedure);

  PERFORM
    decision.id,
    decision.company_id,
    decision.title,
    decision.title_unaccent,
    decision.period_start,
    decision.period_end_exclusive,
    decision.granularity,
    decision.reference_type,
    decision.status,
    decision.current_revision_id,
    decision.updated_at,
    revision.id,
    revision.decision_id,
    revision.revision_number,
    revision.snapshot,
    action.id,
    action.decision_id,
    action.responsible_user_id,
    action.due_date,
    action.status,
    action.updated_at
  FROM public.fin_presentation_decisions decision
  LEFT JOIN public.fin_presentation_decision_revisions revision ON revision.decision_id = decision.id
  LEFT JOIN public.fin_presentation_decision_actions action ON action.decision_id = decision.id
  WHERE false;
END;
$migration_check$;

NOTIFY pgrst, 'reload schema';

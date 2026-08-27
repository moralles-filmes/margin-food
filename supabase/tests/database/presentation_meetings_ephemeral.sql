\set ON_ERROR_STOP on

\ir presentation_decisions_ephemeral.sql

-- A suite da Fase 12 precisa distinguir view/manage/approve/export. A Fase 11
-- usa um toggle binario porque testa outro conjunto de contratos.
CREATE OR REPLACE FUNCTION public.has_any_permission(p_user_id uuid, p_keys text[])
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT p_user_id = auth.uid()
    AND (
      COALESCE(current_setting('test.allowed_permissions', true), 'all') = 'all'
      OR p_keys && string_to_array(current_setting('test.allowed_permissions', true), ',')
    )
$$;

-- A suite da Fase 11 confirma ON DELETE SET NULL removendo este usuario.
-- Recriamos um perfil tenant-scoped para exercitar participantes na Fase 12.
INSERT INTO auth.users(id) VALUES ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
INSERT INTO public.profiles(id, company_id, nome, email) VALUES (
  'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  '11111111-1111-4111-8111-111111111111',
  'Responsavel Empresa A',
  'responsavel-a@test.local'
);

CREATE TABLE public.fin_categorias (
  id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id),
  nome text NOT NULL
);

\ir ../../migrations/20260826204351_presentation_executive_sessions.sql

CREATE OR REPLACE FUNCTION public.run_presentation_meetings_ephemeral_tests()
RETURNS void
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = ''
AS $test$
DECLARE
  v_decision public.fin_presentation_decisions%ROWTYPE;
  v_create jsonb;
  v_result jsonb;
  v_session_id uuid;
  v_updated_at timestamptz;
  v_snapshot jsonb;
  v_agenda jsonb;
  v_revision_one jsonb;
  v_count integer;
BEGIN
  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('test.permissions', 'on', false);

  SELECT * INTO v_decision
  FROM public.fin_presentation_decisions decision
  WHERE decision.company_id = '11111111-1111-4111-8111-111111111111'
  ORDER BY decision.created_at
  LIMIT 1;
  IF v_decision.id IS NULL THEN RAISE EXCEPTION 'TEST_FAILED: decision fixture missing'; END IF;

  v_agenda := jsonb_build_array(
    jsonb_build_object(
      'itemType', 'FINANCIAL_OVERVIEW', 'title', 'Visao financeira',
      'objective', 'Revisar a base do periodo.', 'discussionNotes', '',
      'conclusion', NULL, 'reviewState', 'PENDING',
      'referenceType', NULL, 'referenceId', NULL
    ),
    jsonb_build_object(
      'itemType', 'DECISION', 'title', 'Decisao em acompanhamento',
      'objective', 'Revisar estado e compromissos.', 'discussionNotes', '',
      'conclusion', NULL, 'reviewState', 'PENDING',
      'referenceType', 'DECISION', 'referenceId', v_decision.id
    )
  );

  BEGIN
    PERFORM public._guarded_create_presentation_session(
      'Participante externo', '', DATE '2026-03-01', DATE '2026-04-01', 'month',
      DATE '2026-03-25', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ARRAY['cccccccc-cccc-4ccc-8ccc-cccccccccccc'::uuid], NULL, v_agenda
    );
    RAISE EXCEPTION 'TEST_FAILED: cross tenant participant accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PARTICIPANT_OUT_OF_TENANT%' THEN RAISE; END IF;
  END;

  v_create := public._guarded_create_presentation_session(
    'Ritual executivo de marco', 'Contexto informado pelo usuario.',
    DATE '2026-03-01', DATE '2026-04-01', 'month', DATE '2026-03-25',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid],
    NULL, v_agenda
  );
  v_session_id := (v_create->>'id')::uuid;
  v_updated_at := (v_create->>'updatedAt')::timestamptz;

  IF (public.list_fin_presentation_sessions(DATE '2026-03-01', DATE '2026-04-01')->>'totalCount')::integer <> 1 THEN
    RAISE EXCEPTION 'TEST_FAILED: session list';
  END IF;
  IF public.get_fin_presentation_session(v_session_id)#>>'{session,status}' <> 'DRAFT' THEN
    RAISE EXCEPTION 'TEST_FAILED: session detail';
  END IF;

  -- Reordena itens persistidos pelos ids e inclui um novo item sem id. A
  -- operação não pode colidir pela posição nem reaproveitar o id de outro item.
  SELECT jsonb_agg(item.value ORDER BY (item.value->>'position')::integer DESC)
  INTO v_agenda
  FROM jsonb_array_elements(public.get_fin_presentation_session(v_session_id)->'agendaItems') item(value);
  v_agenda := v_agenda || jsonb_build_array(jsonb_build_object(
    'itemType', 'FREE_TEXT', 'title', 'Item novo apos reordenacao',
    'objective', '', 'discussionNotes', '', 'conclusion', NULL,
    'reviewState', 'PENDING', 'referenceType', NULL, 'referenceId', NULL
  ));
  v_result := public._guarded_save_presentation_session(
    v_session_id, 'Ritual executivo de marco', 'Contexto informado pelo usuario.', DATE '2026-03-25',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid],
    NULL, v_agenda, 'DRAFT', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  IF public.get_fin_presentation_session(v_session_id)#>>'{agendaItems,0,title}' <> 'Decisao em acompanhamento'
     OR public.get_fin_presentation_session(v_session_id)#>>'{agendaItems,1,title}' <> 'Visao financeira'
     OR public.get_fin_presentation_session(v_session_id)#>>'{agendaItems,2,title}' <> 'Item novo apos reordenacao' THEN
    RAISE EXCEPTION 'TEST_FAILED: agenda reorder not persisted';
  END IF;
  SELECT count(DISTINCT agenda.id) INTO v_count
  FROM public.fin_presentation_agenda_items agenda
  WHERE agenda.session_id = v_session_id;
  IF v_count <> 3 THEN RAISE EXCEPTION 'TEST_FAILED: agenda ids reused after insertion'; END IF;

  BEGIN
    INSERT INTO public.fin_presentation_sessions (
      company_id, title, period_start, period_end_exclusive, granularity, meeting_date,
      minutes_responsible_name_snapshot, created_by_name_snapshot, updated_by_name_snapshot
    ) VALUES (
      '11111111-1111-4111-8111-111111111111', 'Direta', DATE '2026-03-01', DATE '2026-04-01',
      'month', DATE '2026-03-25', 'Teste', 'Teste', 'Teste'
    );
    RAISE EXCEPTION 'TEST_FAILED: direct insert bypassed RLS';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;

  UPDATE public.fin_presentation_sessions SET title = 'Direta' WHERE id = v_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'TEST_FAILED: direct update bypassed RLS'; END IF;
  DELETE FROM public.fin_presentation_sessions WHERE id = v_session_id;
  GET DIAGNOSTICS v_count = ROW_COUNT;
  IF v_count <> 0 THEN RAISE EXCEPTION 'TEST_FAILED: direct delete bypassed RLS'; END IF;

  BEGIN
    PERFORM public._guarded_save_presentation_session(
      v_session_id, 'Stale', '', DATE '2026-03-25',
      'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
      ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid], NULL, v_agenda,
      'DRAFT', v_updated_at - interval '1 second'
    );
    RAISE EXCEPTION 'TEST_FAILED: stale update accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%OPTIMISTIC_LOCK_CONFLICT%' THEN RAISE; END IF;
  END;

  v_snapshot := jsonb_build_object(
    'contractVersion', 'presentation-meeting-snapshot-v1.0',
    'period', jsonb_build_object('start', '2026-03-01', 'endExclusive', '2026-04-01'),
    'granularity', 'month', 'capturedAt', '2026-03-25T10:00:00-03:00',
    'cutoffDate', '2026-03-25', 'formulaVersion', 'presentation-plan-v1.0',
    'sources', jsonb_build_object('actual', 'fin_lancamentos', 'budget', 'fin_orcamentos', 'cmvTarget', 'metas_cmv.meta_cmv_total'),
    'rules', jsonb_build_object('regime', 'competencia', 'budgetProration', 'daily', 'hierarchyPrecedence', 'specific', 'projectionFormula', 'linear', 'openItemsIncluded', false),
    'metrics', jsonb_build_object('revenue', 1200, 'expense', 700, 'result', 500, 'marginPercent', 41.6667, 'cmv', 280, 'cmvPercent', 23.3333),
    'dataUnavailable', '[]'::jsonb,
    'filters', jsonb_build_object('comparisonMode', 'actual', 'rankingLimit', 10),
    'decisions', jsonb_build_array(jsonb_build_object(
      'id', v_decision.id, 'decisionId', v_decision.id, 'version', v_decision.version,
      'status', v_decision.status, 'updatedAt', v_decision.updated_at
    )),
    'actions', COALESCE((
      SELECT jsonb_agg(jsonb_build_object(
        'id', action.id, 'decisionId', action.decision_id, 'version', action.version,
        'status', action.status, 'updatedAt', action.updated_at
      ))
      FROM public.fin_presentation_decision_actions action
      WHERE action.decision_id = v_decision.id
    ), '[]'::jsonb)
  );

  BEGIN
    PERFORM public._guarded_start_presentation_session(
      v_session_id, jsonb_set(v_snapshot, '{sources,actual}', '"wrong"'), 'DRAFT', v_updated_at
    );
    RAISE EXCEPTION 'TEST_FAILED: incompatible source accepted';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%SNAPSHOT_SOURCE_INCOMPATIBLE%' THEN RAISE; END IF;
  END;

  v_result := public._guarded_start_presentation_session(v_session_id, v_snapshot, 'DRAFT', v_updated_at);
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  IF public.get_fin_presentation_session(v_session_id)#>>'{session,snapshot,metrics,revenue}' <> '1200' THEN
    RAISE EXCEPTION 'TEST_FAILED: snapshot not frozen';
  END IF;

  v_agenda := jsonb_set(v_agenda, '{0,discussionNotes}', '"Notas registradas explicitamente."');
  v_agenda := jsonb_set(v_agenda, '{0,conclusion}', '"Conclusao factual."');
  v_agenda := jsonb_set(v_agenda, '{0,reviewState}', '"CONCLUDED"');
  v_result := public._guarded_save_presentation_session(
    v_session_id, 'Ritual executivo de marco', 'Contexto informado pelo usuario.', DATE '2026-03-25',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid],
    NULL, v_agenda, 'IN_PROGRESS', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;

  v_result := public._guarded_submit_presentation_minutes(
    v_session_id, 'Primeira versao para revisao.', 'IN_PROGRESS', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  SELECT content INTO v_revision_one FROM public.fin_presentation_minutes_revisions
  WHERE session_id = v_session_id AND revision_number = 1;

  v_result := public._guarded_transition_presentation_session(
    v_session_id, 'IN_REVIEW', 'APPROVED', 'Conteudo revisado e aprovado.', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  v_result := public._guarded_transition_presentation_session(
    v_session_id, 'APPROVED', 'IN_PROGRESS', 'Correcao factual solicitada.', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;

  v_agenda := jsonb_set(v_agenda, '{0,discussionNotes}', '"Nota factual corrigida."');
  v_result := public._guarded_save_presentation_session(
    v_session_id, 'Ritual executivo de marco', 'Contexto informado pelo usuario.', DATE '2026-03-25',
    'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
    ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid, 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'::uuid],
    NULL, v_agenda, 'IN_PROGRESS', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  v_result := public._guarded_submit_presentation_minutes(
    v_session_id, 'Segunda versao apos correcao.', 'IN_PROGRESS', v_updated_at
  );
  v_updated_at := (v_result->>'updatedAt')::timestamptz;
  v_result := public._guarded_transition_presentation_session(
    v_session_id, 'IN_REVIEW', 'APPROVED', 'Nova versao revisada e aprovada.', v_updated_at
  );

  IF (SELECT content FROM public.fin_presentation_minutes_revisions WHERE session_id = v_session_id AND revision_number = 1) <> v_revision_one THEN
    RAISE EXCEPTION 'TEST_FAILED: approved revision overwritten';
  END IF;
  SELECT count(*) INTO v_count FROM public.fin_presentation_minutes_revisions
  WHERE session_id = v_session_id AND state = 'APPROVED';
  IF v_count <> 2 THEN RAISE EXCEPTION 'TEST_FAILED: approved revisions not preserved'; END IF;
  SELECT count(*) INTO v_count FROM public.fin_audit_logs
  WHERE entidade = 'presentation_session' AND entidade_id = v_session_id;
  IF v_count < 8 THEN RAISE EXCEPTION 'TEST_FAILED: audit trail incomplete'; END IF;

  DELETE FROM auth.users WHERE id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  IF public.get_fin_presentation_session(v_session_id)#>>'{session,minutesResponsibleName}' <> 'Responsavel Empresa A' THEN
    RAISE EXCEPTION 'TEST_FAILED: historical responsible name lost';
  END IF;
  IF public.get_fin_presentation_session(v_session_id)#>>'{participants,1,nameSnapshot}' <> 'Responsavel Empresa A' THEN
    RAISE EXCEPTION 'TEST_FAILED: historical participant name lost';
  END IF;

  PERFORM set_config('test.company_id', '22222222-2222-4222-8222-222222222222', false);
  PERFORM set_config('test.user_id', 'cccccccc-cccc-4ccc-8ccc-cccccccccccc', false);
  IF EXISTS (SELECT 1 FROM public.fin_presentation_sessions) THEN
    RAISE EXCEPTION 'TEST_FAILED: RLS leaked cross tenant session';
  END IF;
  BEGIN
    PERFORM public.get_fin_presentation_session(v_session_id);
    RAISE EXCEPTION 'TEST_FAILED: cross tenant session leaked';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%NOT_FOUND%' THEN RAISE; END IF;
  END;

  PERFORM set_config('test.company_id', '11111111-1111-4111-8111-111111111111', false);
  PERFORM set_config('test.user_id', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', false);
  PERFORM set_config('test.allowed_permissions', 'financeiro:relatorio-socios:manage', false);
  BEGIN
    PERFORM public.list_fin_presentation_sessions();
    RAISE EXCEPTION 'TEST_FAILED: view without permission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERMISSION_DENIED%' THEN RAISE; END IF;
  END;

  PERFORM set_config('test.allowed_permissions', 'financeiro:relatorio-socios:view', false);
  BEGIN
    PERFORM public._guarded_create_presentation_session(
      'Sem manage', '', DATE '2026-03-01', DATE '2026-04-01', 'month', DATE '2026-03-25',
      'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      ARRAY['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'::uuid], NULL, v_agenda
    );
    RAISE EXCEPTION 'TEST_FAILED: manage without permission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERMISSION_DENIED%' THEN RAISE; END IF;
  END;

  PERFORM set_config('test.allowed_permissions', 'financeiro:relatorio-socios:view,financeiro:relatorio-socios:manage', false);
  BEGIN
    PERFORM public._guarded_transition_presentation_session(
      v_session_id, 'APPROVED', 'CANCELLED', 'Sem permissao approve.',
      (SELECT updated_at FROM public.fin_presentation_sessions WHERE id = v_session_id)
    );
    RAISE EXCEPTION 'TEST_FAILED: approve without permission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERMISSION_DENIED%' THEN RAISE; END IF;
  END;
  BEGIN
    PERFORM public.get_fin_presentation_minutes_export(v_session_id);
    RAISE EXCEPTION 'TEST_FAILED: export without permission';
  EXCEPTION WHEN OTHERS THEN
    IF SQLERRM NOT LIKE '%PERMISSION_DENIED%' THEN RAISE; END IF;
  END;

  PERFORM set_config('test.allowed_permissions', 'financeiro:relatorio-socios:view,financeiro:relatorio-socios:export', false);
  IF public.get_fin_presentation_minutes_export(v_session_id)#>>'{session,id}' <> v_session_id::text THEN
    RAISE EXCEPTION 'TEST_FAILED: export permission did not return session';
  END IF;
END;
$test$;

GRANT EXECUTE ON FUNCTION public.run_presentation_meetings_ephemeral_tests() TO authenticated;
SET ROLE authenticated;
SELECT public.run_presentation_meetings_ephemeral_tests();
RESET ROLE;

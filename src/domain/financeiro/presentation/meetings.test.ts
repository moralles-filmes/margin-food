import { describe, expect, it } from 'vitest';
import {
  buildPresentationMeetingFollowUp,
  buildPresentationMeetingSnapshot,
  comparePresentationMeetingRevisions,
  isValidPresentationMeetingTransition,
  parsePresentationMeetingDetail,
  parsePresentationMeetingDraft,
  parsePresentationMeetingSnapshot,
  parsePresentationMeetingTransition,
  parsePresentationMinutesExport,
  PRESENTATION_MEETING_API_VERSION,
  PRESENTATION_MEETING_MAX_SNAPSHOT_BYTES,
  PRESENTATION_MINUTES_EXPORT_VERSION,
} from './meetings';
import {
  AUTHOR_ID,
  DECISION_ID,
  RESPONSIBLE_ID,
} from '@/test/fixtures/presentationDecision';
import {
  MEETING_ID,
  createPresentationMeetingDetail,
  createPresentationMinutesExport,
} from '@/test/fixtures/presentationMeeting';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

const period = { start: '2026-03-01', endExclusive: '2026-04-01' } as const;

function createDraft() {
  return {
    title: 'Reunião explícita de março',
    context: 'Pauta preparada pelo usuário.',
    meetingDate: '2026-03-20',
    minutesResponsibleUserId: RESPONSIBLE_ID,
    participantUserIds: [RESPONSIBLE_ID, AUTHOR_ID],
    previousSessionId: null,
    agendaItems: [{
      itemType: 'DECISION',
      title: 'Revisar decisão',
      objective: 'Confirmar estado e versão.',
      discussionNotes: '',
      conclusion: null,
      reviewState: 'PENDING',
      referenceType: 'DECISION',
      referenceId: DECISION_ID,
    }, {
      itemType: 'FREE_TEXT',
      title: 'Pergunta aberta',
      objective: '',
      discussionNotes: '',
      conclusion: null,
      reviewState: 'PENDING',
      referenceType: null,
      referenceId: null,
    }],
  } as const;
}

describe('contratos do ritual executivo da Apresentação Sócios', () => {
  it('prepara e reordena uma pauta explícita sem criar decisão ou ação por texto', () => {
    const draft = createDraft();
    const parsed = parsePresentationMeetingDraft({
      ...draft,
      agendaItems: [draft.agendaItems[1], draft.agendaItems[0]],
    });
    expect(parsed.agendaItems.map(item => item.title)).toEqual(['Pergunta aberta', 'Revisar decisão']);
    expect(JSON.stringify(parsed)).not.toMatch(/progress|causality|causalidade/i);
    expect(parsed.agendaItems[0]).toMatchObject({ referenceType: null, referenceId: null });
  });

  it('rejeita participante duplicado, UUID inválido, referência canônica ausente e textos excessivos', () => {
    const draft = createDraft();
    expect(() => parsePresentationMeetingDraft({
      ...draft,
      participantUserIds: [RESPONSIBLE_ID, RESPONSIBLE_ID],
    })).toThrowError(expect.objectContaining({ code: 'PARTICIPANT_DUPLICATE' }));
    expect(() => parsePresentationMeetingDraft({
      ...draft,
      minutesResponsibleUserId: 'fora-do-tenant-e-inválido',
    })).toThrowError(expect.objectContaining({ code: 'INVALID_UUID' }));
    expect(() => parsePresentationMeetingDraft({
      ...draft,
      agendaItems: [{ ...draft.agendaItems[0], referenceType: null, referenceId: null }],
    })).toThrowError(expect.objectContaining({ code: 'REFERENCE_REQUIRED' }));
    expect(() => parsePresentationMeetingDraft({ ...draft, title: 'x'.repeat(201) }))
      .toThrowError(expect.objectContaining({ code: 'MALFORMED_PAYLOAD' }));
  });

  it('congela apenas evidências da base canônica e preserva campos indisponíveis como null', () => {
    const plan = createPresentationPlanData({
      actual: {
        revenue: 0,
        expense: 25,
        result: -25,
        marginPercent: null,
        cmv: null,
        cmvPercent: null,
      },
    });
    const snapshot = buildPresentationMeetingSnapshot({
      plan,
      period,
      granularity: 'month',
      comparisonMode: 'actual',
      rankingLimit: 10,
      canonicalReferences: createPresentationMeetingDetail().canonicalReferences,
      capturedAt: '2026-03-20T10:00:00-03:00',
    });
    expect(snapshot.metrics).toMatchObject({ revenue: 0, marginPercent: null, cmv: null, cmvPercent: null });
    expect(snapshot.dataUnavailable).toEqual(expect.arrayContaining(['marginPercent', 'cmv', 'cmvPercent']));
    expect(snapshot.sources).toEqual({
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    });
    expect(snapshot.decisions[0]).toEqual(expect.objectContaining({ id: DECISION_ID, version: 2 }));
  });

  it('rejeita snapshot sem versão, source/fórmula incompatível, não finito e payload excessivo', () => {
    const detail = createPresentationMeetingDetail();
    const snapshot = detail.session.snapshot!;
    expect(() => parsePresentationMeetingSnapshot({ ...snapshot, contractVersion: 'sem-versão' }))
      .toThrowError(expect.objectContaining({ code: 'UNKNOWN_VERSION' }));
    expect(() => parsePresentationMeetingSnapshot({ ...snapshot, formulaVersion: 'fórmula-paralela' }))
      .toThrowError(expect.objectContaining({ code: 'FORMULA_UNKNOWN' }));
    expect(() => parsePresentationMeetingSnapshot({ ...snapshot, sources: { ...snapshot.sources, actual: 'fonte-paralela' } }))
      .toThrowError(expect.objectContaining({ code: 'SOURCE_INCOMPATIBLE' }));
    expect(() => parsePresentationMeetingSnapshot({ ...snapshot, metrics: { ...snapshot.metrics, result: Number.NaN } }))
      .toThrowError(expect.objectContaining({ code: 'NON_FINITE_NUMBER' }));
    expect(() => parsePresentationMeetingSnapshot({ ...snapshot, rules: { huge: 'x'.repeat(PRESENTATION_MEETING_MAX_SNAPSHOT_BYTES) } }))
      .toThrowError(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
  });

  it('classifica follow-up somente por prazo, estado, prioridade, versão e timestamps explícitos', () => {
    const detail = createPresentationMeetingDetail();
    const followUp = buildPresentationMeetingFollowUp({
      detail,
      today: '2026-03-21',
      dueWindowEnd: '2026-04-20',
    });
    expect(followUp.overdueActions.map(action => action.title)).toEqual(['Renegociar contrato prioritário']);
    expect(followUp.noDueDateActions.map(action => action.title)).toEqual(['Documentar premissas operacionais']);
    expect(followUp.noPriorityActions).toHaveLength(1);
    expect(followUp.changedSinceSnapshot.map(reference => reference.id)).toEqual(expect.arrayContaining([
      DECISION_ID,
      detail.canonicalReferences[1].id,
    ]));
    expect(followUp.unresolvedAgendaItems).toHaveLength(1);
    expect(followUp).not.toHaveProperty('progressPercent');
    expect(followUp).not.toHaveProperty('riskScore');
  });

  it('exclui ações concluídas da classificação de atraso', () => {
    const detail = createPresentationMeetingDetail();
    detail.canonicalReferences = detail.canonicalReferences.map(reference => (
      reference.entityType === 'ACTION' && reference.dueDate
        ? { ...reference, status: 'COMPLETED' as const }
        : reference
    ));
    const followUp = buildPresentationMeetingFollowUp({ detail, today: '2026-03-21', dueWindowEnd: '2026-04-20' });
    expect(followUp.overdueActions).toHaveLength(0);
    expect(followUp.actionsByStatus.COMPLETED).toBe(1);
  });

  it('distingue ausência de sessão anterior, incompatibilidade e diferenças factuais', () => {
    const detail = createPresentationMeetingDetail();
    const current = detail.revisions[0];
    expect(comparePresentationMeetingRevisions({ previousSessionId: null, previous: null, current }))
      .toEqual({ state: 'no-previous-session' });
    const future = structuredClone(current);
    future.content.session.period = { start: '2026-05-01', endExclusive: '2026-06-01' };
    expect(comparePresentationMeetingRevisions({ previousSessionId: MEETING_ID, previous: future, current }))
      .toEqual({ state: 'incompatible-period' });
    const previous = structuredClone(current);
    previous.content.session.period = { start: '2026-02-01', endExclusive: '2026-03-01' };
    previous.content.session.context = 'Contexto anterior.';
    const comparison = comparePresentationMeetingRevisions({ previousSessionId: MEETING_ID, previous, current });
    expect(comparison.state).toBe('available');
    if (comparison.state === 'available') {
      expect(comparison.differences).toContainEqual(expect.objectContaining({ path: 'context', before: 'Contexto anterior.' }));
    }

    const differentParticipantRows = structuredClone(previous);
    differentParticipantRows.content.session.context = current.content.session.context;
    differentParticipantRows.content.participants[0].id = '99999999-2222-4999-8999-999999999999';
    const participantComparison = comparePresentationMeetingRevisions({
      previousSessionId: MEETING_ID,
      previous: differentParticipantRows,
      current,
    });
    expect(participantComparison.state).toBe('available');
    if (participantComparison.state === 'available') {
      expect(participantComparison.differences.some(item => item.path.startsWith('participant:'))).toBe(false);
    }

    const differentGranularity = structuredClone(previous);
    differentGranularity.content.session.granularity = 'year';
    expect(comparePresentationMeetingRevisions({ previousSessionId: MEETING_ID, previous: differentGranularity, current }))
      .toEqual({ state: 'incompatible-period' });

    const differentComparisonMode = structuredClone(previous);
    differentComparisonMode.content.snapshot.filters.comparisonMode = 'budget';
    expect(comparePresentationMeetingRevisions({ previousSessionId: MEETING_ID, previous: differentComparisonMode, current }))
      .toEqual({ state: 'incompatible-period' });
  });

  it('valida estados, justificativa e optimistic timestamp no contrato de transição', () => {
    expect(isValidPresentationMeetingTransition('DRAFT', 'APPROVED')).toBe(false);
    expect(isValidPresentationMeetingTransition('IN_REVIEW', 'APPROVED')).toBe(true);
    expect(parsePresentationMeetingTransition({
      contractVersion: PRESENTATION_MEETING_API_VERSION,
      sessionId: MEETING_ID,
      expectedStatus: 'IN_REVIEW',
      targetStatus: 'APPROVED',
      justification: 'Ata conferida explicitamente.',
      expectedUpdatedAt: '2026-03-20T11:00:00-03:00',
    })).toMatchObject({ targetStatus: 'APPROVED' });
    expect(() => parsePresentationMeetingTransition({
      contractVersion: PRESENTATION_MEETING_API_VERSION,
      sessionId: MEETING_ID,
      expectedStatus: 'IN_REVIEW',
      targetStatus: 'APPROVED',
      justification: '',
      expectedUpdatedAt: '2026-03-20T11:00:00-03:00',
    })).toThrowError(expect.objectContaining({ code: 'JUSTIFICATION_REQUIRED' }));
  });

  it('rejeita ordem duplicada e registro auditável sem autor/timestamp', () => {
    const detail = createPresentationMeetingDetail();
    const duplicated = structuredClone(detail);
    duplicated.agendaItems[1].position = 1;
    expect(() => parsePresentationMeetingDetail(duplicated))
      .toThrowError(expect.objectContaining({ code: 'AGENDA_ORDER_INVALID' }));
    const withoutActor = structuredClone(detail);
    withoutActor.timeline[0].actorName = '';
    expect(() => parsePresentationMeetingDetail(withoutActor)).toThrowError();
    const withoutTimestamp = structuredClone(detail);
    withoutTimestamp.timeline[0].createdAt = 'data-inválida';
    expect(() => parsePresentationMeetingDetail(withoutTimestamp)).toThrowError();
  });

  it('valida defensivamente o contrato completo de exportação', () => {
    const payload = createPresentationMinutesExport();
    expect(parsePresentationMinutesExport(structuredClone(payload))).toMatchObject({
      contractVersion: PRESENTATION_MINUTES_EXPORT_VERSION,
      draftWatermark: false,
    });
    expect(() => parsePresentationMinutesExport({
      ...structuredClone(payload),
      followUp: { ...payload.followUp, actionsByStatus: { PENDING: Number.POSITIVE_INFINITY } },
    })).toThrowError();
    expect(() => parsePresentationMinutesExport({
      ...structuredClone(payload),
      comparison: { state: 'available', previousSessionId: MEETING_ID, previousRevisionNumber: 1, currentRevisionNumber: 2, differences: [{ path: 'x', before: Number.NaN, after: 1 }] },
    })).toThrowError(expect.objectContaining({ code: 'MALFORMED_PAYLOAD' }));
  });
});

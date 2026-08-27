import {
  buildPresentationMeetingFollowUp,
  buildPresentationMeetingSnapshot,
  PRESENTATION_MEETING_API_VERSION,
  PRESENTATION_MINUTES_EXPORT_VERSION,
  PRESENTATION_MINUTES_REVISION_VERSION,
  type PresentationAgendaItem,
  type PresentationMeetingCanonicalReference,
  type PresentationMeetingDetail,
  type PresentationMinutesExport,
  type PresentationMinutesRevision,
} from '@/domain/financeiro/presentation';
import {
  AUTHOR_ID,
  DECISION_ID,
  RESPONSIBLE_ID,
} from '@/test/fixtures/presentationDecision';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

export const MEETING_ID = '11111111-2222-4111-8111-111111111111';
export const PREVIOUS_MEETING_ID = '22222222-2222-4222-8222-222222222222';
export const MEETING_REVISION_ID = '33333333-2222-4333-8333-333333333333';
export const PARTICIPANT_ID = '44444444-2222-4444-8444-444444444444';
export const AGENDA_ID = '55555555-2222-4555-8555-555555555555';
export const ACTION_ID = '66666666-2222-4666-8666-666666666666';
export const ACTION_WITHOUT_DUE_ID = '77777777-2222-4777-8777-777777777777';

const period = { start: '2026-03-01', endExclusive: '2026-04-01' } as const;

function createAgendaItems(count: number): PresentationAgendaItem[] {
  return Array.from({ length: count }, (_, index) => ({
    id: index === 0
      ? AGENDA_ID
      : `${String(index + 10).padStart(8, '0')}-2222-4222-8222-${String(index + 10).padStart(12, '0')}`,
    itemType: index === 0 ? 'DECISION' : 'FREE_TEXT',
    position: index + 1,
    title: index === 0 ? 'Revisar decisão de custos' : `Item executivo extenso ${index + 1}`,
    objective: index === 0 ? 'Confirmar o estado factual da decisão.' : `Pergunta explícita ${index + 1}.`,
    discussionNotes: index === 0
      ? 'A decisão foi revisada sem alterar seu estado automaticamente.'
      : `Notas registradas pelo usuário para o item ${index + 1}. `.repeat(35),
    conclusion: index === 0 ? 'O item continua acompanhado pelo fluxo canônico.' : null,
    reviewState: index === 0 ? 'CONCLUDED' : 'PENDING',
    referenceType: index === 0 ? 'DECISION' : null,
    referenceId: index === 0 ? DECISION_ID : null,
    referenceVersion: index === 0 ? 1 : null,
    referenceStatus: index === 0 ? 'APPROVED' : null,
    createdBy: AUTHOR_ID,
    createdByName: 'Sócio Autor',
    updatedBy: AUTHOR_ID,
    updatedByName: 'Sócio Autor',
    createdAt: '2026-03-20T10:00:00-03:00',
    updatedAt: '2026-03-20T10:30:00-03:00',
  }));
}

function createCanonicalReferences(): PresentationMeetingCanonicalReference[] {
  return [{
    entityType: 'DECISION',
    id: DECISION_ID,
    decisionId: DECISION_ID,
    title: 'Ajustar estrutura de custos do trimestre',
    version: 2,
    status: 'APPROVED',
    responsibleUserId: RESPONSIBLE_ID,
    responsibleName: 'Responsável Operacional',
    dueDate: null,
    priority: null,
    createdAt: '2026-03-20T10:10:00-03:00',
    updatedAt: '2026-03-20T10:40:00-03:00',
  }, {
    entityType: 'ACTION',
    id: ACTION_ID,
    decisionId: DECISION_ID,
    title: 'Renegociar contrato prioritário',
    version: 2,
    status: 'IN_PROGRESS',
    responsibleUserId: RESPONSIBLE_ID,
    responsibleName: 'Responsável Operacional',
    dueDate: '2026-03-19',
    priority: 'HIGH',
    createdAt: '2026-03-20T10:20:00-03:00',
    updatedAt: '2026-03-20T10:45:00-03:00',
  }, {
    entityType: 'ACTION',
    id: ACTION_WITHOUT_DUE_ID,
    decisionId: DECISION_ID,
    title: 'Documentar premissas operacionais',
    version: 1,
    status: 'PENDING',
    responsibleUserId: RESPONSIBLE_ID,
    responsibleName: 'Responsável Operacional',
    dueDate: null,
    priority: null,
    createdAt: '2026-03-20T10:25:00-03:00',
    updatedAt: '2026-03-20T10:25:00-03:00',
  }];
}

export function createPresentationMeetingDetail(options: {
  agendaCount?: number;
  status?: PresentationMeetingDetail['session']['status'];
  previousSessionId?: string | null;
  revisionState?: PresentationMinutesRevision['state'];
} = {}): PresentationMeetingDetail {
  const agendaItems = createAgendaItems(options.agendaCount ?? 2);
  const canonicalReferences = createCanonicalReferences();
  const snapshot = buildPresentationMeetingSnapshot({
    plan: createPresentationPlanData(),
    period,
    granularity: 'month',
    comparisonMode: 'actual',
    rankingLimit: 10,
    canonicalReferences: canonicalReferences.map(reference => ({
      ...reference,
      version: 1,
      status: reference.entityType === 'DECISION' ? 'APPROVED' : 'PENDING',
      updatedAt: '2026-03-20T10:00:00-03:00',
    })),
    capturedAt: '2026-03-20T10:00:00-03:00',
  });
  const previousSessionId = options.previousSessionId === undefined ? PREVIOUS_MEETING_ID : options.previousSessionId;
  const participants = [{
    id: PARTICIPANT_ID,
    userId: RESPONSIBLE_ID,
    nameSnapshot: 'Responsável Operacional',
    emailSnapshot: 'responsavel@empresa.test',
    createdBy: AUTHOR_ID,
    createdByName: 'Sócio Autor',
    createdAt: '2026-03-20T09:00:00-03:00',
  }];
  const revision: PresentationMinutesRevision = {
    id: MEETING_REVISION_ID,
    revisionNumber: 1,
    state: options.revisionState ?? 'APPROVED',
    revisionReason: 'Primeira versão revisada explicitamente.',
    content: {
      contractVersion: PRESENTATION_MINUTES_REVISION_VERSION,
      session: {
        id: MEETING_ID,
        title: 'Ritual executivo de março',
        period,
        granularity: 'month',
        meetingDate: '2026-03-20',
        context: 'Revisão mensal sobre a base canônica da apresentação.',
        minutesResponsibleUserId: RESPONSIBLE_ID,
        minutesResponsibleName: 'Responsável Operacional',
        previousSessionId,
      },
      participants,
      agendaItems,
      snapshot,
    },
    createdBy: AUTHOR_ID,
    createdByName: 'Sócio Autor',
    createdAt: '2026-03-20T11:00:00-03:00',
    approvedBy: AUTHOR_ID,
    approvedByName: 'Sócio Autor',
    approvedAt: '2026-03-20T11:10:00-03:00',
  };
  const status = options.status ?? 'APPROVED';
  return {
    contractVersion: PRESENTATION_MEETING_API_VERSION,
    session: {
      id: MEETING_ID,
      title: 'Ritual executivo de março',
      period,
      granularity: 'month',
      meetingDate: '2026-03-20',
      status,
      minutesResponsibleUserId: RESPONSIBLE_ID,
      minutesResponsibleName: 'Responsável Operacional',
      previousSessionId,
      currentRevisionId: MEETING_REVISION_ID,
      currentRevisionNumber: 1,
      participantCount: participants.length,
      agendaItemCount: agendaItems.length,
      unresolvedAgendaCount: agendaItems.filter(item => item.reviewState === 'PENDING').length,
      createdBy: AUTHOR_ID,
      createdByName: 'Sócio Autor',
      createdAt: '2026-03-20T09:00:00-03:00',
      updatedAt: '2026-03-20T11:10:00-03:00',
      version: 4,
      context: 'Revisão mensal sobre a base canônica da apresentação.',
      snapshot,
      latestJustification: 'Ata aprovada após leitura explícita.',
      startedAt: '2026-03-20T10:00:00-03:00',
      submittedAt: '2026-03-20T11:00:00-03:00',
      approvedAt: status === 'APPROVED' ? '2026-03-20T11:10:00-03:00' : null,
      approvedBy: status === 'APPROVED' ? AUTHOR_ID : null,
      approvedByName: status === 'APPROVED' ? 'Sócio Autor' : null,
      cancelledAt: status === 'CANCELLED' ? '2026-03-20T11:10:00-03:00' : null,
      updatedBy: AUTHOR_ID,
      updatedByName: 'Sócio Autor',
    },
    participants,
    agendaItems,
    revisions: [revision],
    canonicalReferences,
    timeline: [{
      id: '88888888-2222-4888-8888-888888888888',
      eventType: 'MINUTES_APPROVED',
      before: { status: 'IN_REVIEW' },
      after: { status: 'APPROVED', revisionNumber: 1 },
      justification: 'Ata aprovada após leitura explícita.',
      actorUserId: AUTHOR_ID,
      actorName: 'Sócio Autor',
      createdAt: '2026-03-20T11:10:00-03:00',
    }],
    fetchedAt: '2026-03-21T12:00:00-03:00',
  };
}

export function createPresentationMinutesExport(options: { agendaCount?: number; draft?: boolean } = {}): PresentationMinutesExport {
  const detail = createPresentationMeetingDetail({
    agendaCount: options.agendaCount,
    status: options.draft ? 'IN_PROGRESS' : 'APPROVED',
    revisionState: options.draft ? 'IN_REVIEW' : 'APPROVED',
  });
  return {
    contractVersion: PRESENTATION_MINUTES_EXPORT_VERSION,
    detail,
    revision: options.draft ? null : detail.revisions[0],
    followUp: buildPresentationMeetingFollowUp({
      detail,
      dueWindowEnd: '2026-04-20',
      today: '2026-03-21',
    }),
    comparison: { state: 'no-previous-session' },
    exportedAt: '2026-03-21T12:00:00-03:00',
    draftWatermark: Boolean(options.draft),
  };
}

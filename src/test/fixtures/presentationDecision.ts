import {
  buildPresentationDecisionSnapshot,
  comparePresentationDecisionSnapshot,
  PRESENTATION_DECISION_API_VERSION,
  type PresentationDecisionAction,
  type PresentationDecisionDetail,
} from '@/domain/financeiro/presentation';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

export const DECISION_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
export const REVISION_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
export const RESPONSIBLE_ID = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
export const AUTHOR_ID = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';

export function createPresentationDecisionActions(count = 2): PresentationDecisionAction[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `${String(index + 1).padStart(8, '0')}-1111-4111-8111-${String(index + 1).padStart(12, '0')}`,
    decisionId: DECISION_ID,
    description: `Compromisso executivo ${index + 1}`,
    responsibleUserId: RESPONSIBLE_ID,
    responsibleName: 'Responsável Operacional',
    dueDate: index % 2 === 0 ? '2026-04-10' : null,
    priority: index % 2 === 0 ? 'HIGH' : null,
    status: index % 3 === 2 ? 'COMPLETED' : 'PENDING',
    outcomeNote: index % 3 === 2 ? 'Entrega validada em reunião.' : null,
    completedAt: index % 3 === 2 ? '2026-04-08T15:00:00-03:00' : null,
    cancelledAt: null,
    version: 1,
    createdBy: AUTHOR_ID,
    createdByName: 'Sócio Autor',
    updatedBy: AUTHOR_ID,
    updatedByName: 'Sócio Autor',
    createdAt: '2026-03-20T10:00:00-03:00',
    updatedAt: '2026-03-20T10:00:00-03:00',
  }));
}

export function createPresentationDecisionDetail(
  actionCount = 2,
): PresentationDecisionDetail {
  const plan = createPresentationPlanData();
  const snapshot = buildPresentationDecisionSnapshot({
    plan,
    period: plan.range,
    granularity: 'month',
    mode: 'actual',
    capturedAt: '2026-03-20T10:00:00-03:00',
  });
  return {
    contractVersion: PRESENTATION_DECISION_API_VERSION,
    decision: {
      id: DECISION_ID,
      title: 'Ajustar estrutura de custos do trimestre',
      context: 'Os sócios aprovaram o plano após revisar a base canônica e as premissas documentadas.',
      status: 'APPROVED',
      referenceType: 'BASE',
      period: plan.range,
      granularity: 'month',
      executiveResponsibleUserId: RESPONSIBLE_ID,
      executiveResponsibleName: 'Responsável Operacional',
      currentRevisionId: REVISION_ID,
      everApproved: true,
      approvedBy: AUTHOR_ID,
      approvedByName: 'Sócio Autor',
      approvedAt: '2026-03-20T10:05:00-03:00',
      completedAt: null,
      cancelledAt: null,
      latestJustification: 'Aprovação registrada em reunião de sócios.',
      version: 2,
      createdBy: AUTHOR_ID,
      createdByName: 'Sócio Autor',
      updatedBy: AUTHOR_ID,
      updatedByName: 'Sócio Autor',
      createdAt: '2026-03-20T10:00:00-03:00',
      updatedAt: '2026-03-20T10:05:00-03:00',
    },
    revisions: [{
      id: REVISION_ID,
      revisionNumber: 1,
      referenceType: 'BASE',
      snapshot,
      revisionReason: 'Registro inicial',
      approvedBy: AUTHOR_ID,
      approvedByName: 'Sócio Autor',
      approvedAt: '2026-03-20T10:05:00-03:00',
      createdBy: AUTHOR_ID,
      createdByName: 'Sócio Autor',
      createdAt: '2026-03-20T10:00:00-03:00',
    }],
    actions: createPresentationDecisionActions(actionCount),
    timeline: [{
      id: 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee',
      eventType: 'DECISION_APPROVED',
      before: { status: 'DRAFT' },
      after: { status: 'APPROVED' },
      justification: 'Aprovação registrada em reunião de sócios.',
      actorUserId: AUTHOR_ID,
      actorName: 'Sócio Autor',
      createdAt: '2026-03-20T10:05:00-03:00',
    }],
    fetchedAt: '2026-08-25T15:30:00-03:00',
  };
}

export function createPresentationDecisionComparison() {
  const detail = createPresentationDecisionDetail();
  return comparePresentationDecisionSnapshot(
    detail.revisions[0].snapshot,
    createPresentationPlanData({
      generatedAt: '2026-08-25T15:30:00-03:00',
      actual: {
        revenue: 1_300,
        expense: 680,
        result: 620,
        marginPercent: 47.6923,
        cmv: 270,
        cmvPercent: 20.7692,
      },
    }),
  );
}

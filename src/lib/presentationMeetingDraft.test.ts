import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PresentationMeetingDraft } from '@/domain/financeiro/presentation';
import {
  clearPresentationMeetingDraft,
  loadPresentationMeetingDraft,
  savePresentationMeetingDraft,
} from './presentationMeetingDraft';
import { AUTHOR_ID, RESPONSIBLE_ID } from '@/test/fixtures/presentationDecision';
import { MEETING_ID, PREVIOUS_MEETING_ID } from '@/test/fixtures/presentationMeeting';

const COMPANY_ID = '99999999-2222-4999-8999-999999999999';

function draft(title = 'Ritual executivo'): PresentationMeetingDraft {
  return {
    title,
    context: '',
    meetingDate: '2026-03-20',
    minutesResponsibleUserId: RESPONSIBLE_ID,
    participantUserIds: [AUTHOR_ID],
    previousSessionId: null,
    agendaItems: [{
      itemType: 'FREE_TEXT',
      title: 'Pauta explícita',
      objective: '',
      discussionNotes: '',
      conclusion: null,
      reviewState: 'PENDING',
      referenceType: null,
      referenceId: null,
    }],
  };
}

describe('rascunho local da ata executiva', () => {
  beforeEach(() => sessionStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('isola por usuário, empresa e sessão e permite limpeza explícita', () => {
    const now = new Date('2026-03-20T12:00:00-03:00');
    savePresentationMeetingDraft({ userId: AUTHOR_ID, companyId: COMPANY_ID, sessionId: MEETING_ID, draft: draft(), now });
    expect(loadPresentationMeetingDraft({ userId: AUTHOR_ID, companyId: COMPANY_ID, sessionId: MEETING_ID, now }))
      .toMatchObject({ title: 'Ritual executivo' });
    expect(loadPresentationMeetingDraft({ userId: RESPONSIBLE_ID, companyId: COMPANY_ID, sessionId: MEETING_ID, now })).toBeNull();
    expect(loadPresentationMeetingDraft({ userId: AUTHOR_ID, companyId: COMPANY_ID, sessionId: PREVIOUS_MEETING_ID, now })).toBeNull();
    clearPresentationMeetingDraft({ userId: AUTHOR_ID, companyId: COMPANY_ID, sessionId: MEETING_ID });
    expect(loadPresentationMeetingDraft({ userId: AUTHOR_ID, companyId: COMPANY_ID, sessionId: MEETING_ID, now })).toBeNull();
  });

  it('expira após oito horas e remove o payload antigo', () => {
    savePresentationMeetingDraft({
      userId: AUTHOR_ID,
      companyId: COMPANY_ID,
      sessionId: MEETING_ID,
      draft: draft(),
      now: new Date('2026-03-20T10:00:00Z'),
    });
    expect(loadPresentationMeetingDraft({
      userId: AUTHOR_ID,
      companyId: COMPANY_ID,
      sessionId: MEETING_ID,
      now: new Date('2026-03-20T18:00:01Z'),
    })).toBeNull();
    expect(sessionStorage.length).toBe(0);
  });

  it('rejeita escopo inválido, contrato corrompido e payload acima do limite', () => {
    expect(() => savePresentationMeetingDraft({
      userId: 'inválido', companyId: COMPANY_ID, sessionId: MEETING_ID, draft: draft(),
    })).toThrowError('INVALID_DRAFT_SCOPE');

    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    sessionStorage.setItem(`presentation-meeting:${COMPANY_ID}:${AUTHOR_ID}:${MEETING_ID}`, '{inválido');
    expect(loadPresentationMeetingDraft({ userId: AUTHOR_ID, companyId: COMPANY_ID, sessionId: MEETING_ID })).toBeNull();
    expect(consoleError).toHaveBeenCalled();

    const agendaItems = Array.from({ length: 12 }, (_, index) => ({
      ...draft().agendaItems[0],
      title: `Item ${index + 1}`,
      discussionNotes: 'x'.repeat(20_000),
    }));
    expect(() => savePresentationMeetingDraft({
      userId: AUTHOR_ID,
      companyId: COMPANY_ID,
      sessionId: MEETING_ID,
      draft: { ...draft(), agendaItems },
    })).toThrowError('DRAFT_TOO_LARGE');
  });
});

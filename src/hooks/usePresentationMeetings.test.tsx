import { createElement, type PropsWithChildren } from 'react';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  PRESENTATION_MEETINGS_QUERY_ROOT,
  fetchPresentationMinutesExport,
  usePresentationMeetingMutations,
  usePresentationMeetings,
} from './usePresentationMeetings';
import { supabase } from '@/integrations/supabase/client';
import { PRESENTATION_MEETING_API_VERSION } from '@/domain/financeiro/presentation';
import { AUTHOR_ID, RESPONSIBLE_ID } from '@/test/fixtures/presentationDecision';
import { createPresentationMeetingDetail, MEETING_ID } from '@/test/fixtures/presentationMeeting';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

const companyId = '99999999-2222-4999-8999-999999999999';

function setupClient() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const wrapper = ({ children }: PropsWithChildren) => createElement(QueryClientProvider, { client }, children);
  return { client, wrapper };
}

describe('cache e transporte das reuniões executivas', () => {
  beforeEach(() => vi.mocked(supabase.rpc).mockReset());

  it('inclui tenant, período e todos os filtros na chave e não envia company_id à RPC', async () => {
    const detail = createPresentationMeetingDetail();
    vi.mocked(supabase.rpc).mockResolvedValue({
      data: {
        contractVersion: PRESENTATION_MEETING_API_VERSION,
        items: [detail.session],
        page: 2,
        pageSize: 20,
        totalCount: 21,
        hasMore: false,
        fetchedAt: detail.fetchedAt,
      },
      error: null,
    } as never);
    const { client, wrapper } = setupClient();
    const { result } = renderHook(() => usePresentationMeetings(companyId, {
      period: detail.session.period,
      status: 'IN_REVIEW',
      responsibleUserId: RESPONSIBLE_ID,
      participantUserId: AUTHOR_ID,
      search: '  Ritual MARÇO ',
      page: 2,
      pageSize: 20,
    }, true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(supabase.rpc).toHaveBeenCalledWith('list_fin_presentation_sessions', expect.objectContaining({
      p_period_start: '2026-03-01',
      p_period_end_exclusive: '2026-04-01',
      p_status: 'IN_REVIEW',
      p_responsible_user_id: RESPONSIBLE_ID,
      p_participant_user_id: AUTHOR_ID,
      p_page: 2,
      p_page_size: 20,
    }));
    expect(vi.mocked(supabase.rpc).mock.calls[0][1]).not.toHaveProperty('company_id');
    const key = client.getQueryCache().getAll()[0].queryKey;
    expect(key).toEqual(expect.arrayContaining([
      ...PRESENTATION_MEETINGS_QUERY_ROOT,
      companyId,
      '2026-03-01',
      '2026-04-01',
      'IN_REVIEW',
      RESPONSIBLE_ID,
      AUTHOR_ID,
      2,
      20,
    ]));
    client.clear();
  });

  it('transporta lock otimista e invalida o cache após alteração explícita', async () => {
    vi.mocked(supabase.rpc).mockResolvedValue({ data: { id: MEETING_ID }, error: null } as never);
    const { client, wrapper } = setupClient();
    const invalidate = vi.spyOn(client, 'invalidateQueries');
    const detail = createPresentationMeetingDetail();
    const { result } = renderHook(() => usePresentationMeetingMutations(companyId), { wrapper });
    await result.current.saveSession.mutateAsync({
      sessionId: MEETING_ID,
      draft: {
        title: detail.session.title,
        context: detail.session.context,
        meetingDate: detail.session.meetingDate,
        minutesResponsibleUserId: RESPONSIBLE_ID,
        participantUserIds: [RESPONSIBLE_ID],
        previousSessionId: null,
        agendaItems: detail.agendaItems.map(item => ({
          id: item.id,
          itemType: item.itemType,
          title: item.title,
          objective: item.objective,
          discussionNotes: item.discussionNotes,
          conclusion: item.conclusion,
          reviewState: item.reviewState,
          referenceType: item.referenceType,
          referenceId: item.referenceId,
        })),
      },
      expectedStatus: 'IN_PROGRESS',
      expectedUpdatedAt: detail.session.updatedAt,
    });
    expect(supabase.rpc).toHaveBeenCalledWith('_guarded_save_presentation_session', expect.objectContaining({
      p_session_id: MEETING_ID,
      p_expected_status: 'IN_PROGRESS',
      p_expected_updated_at: detail.session.updatedAt,
    }));
    expect(vi.mocked(supabase.rpc).mock.calls[0][1]).not.toHaveProperty('p_company_id');
    await waitFor(() => expect(invalidate).toHaveBeenCalledWith({ queryKey: PRESENTATION_MEETINGS_QUERY_ROOT }));
    client.clear();
  });

  it('usa a RPC protegida por export para obter o conteúdo da ata', async () => {
    const detail = createPresentationMeetingDetail();
    vi.mocked(supabase.rpc).mockResolvedValue({ data: detail, error: null } as never);
    await expect(fetchPresentationMinutesExport(MEETING_ID)).resolves.toMatchObject({
      session: { id: MEETING_ID },
    });
    expect(supabase.rpc).toHaveBeenCalledWith('get_fin_presentation_minutes_export', { p_session_id: MEETING_ID });
  });
});

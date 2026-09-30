import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  parsePresentationMeetingDetail,
  parsePresentationMeetingDraft,
  parsePresentationMeetingList,
  presentationSessionCreateKey,
  type NormalizedDateRange,
  type PresentationMeetingDraft,
  type PresentationMeetingSnapshot,
  type PresentationMeetingStatus,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import type { Json } from '@/integrations/supabase/types';
import { normalizeSearchText } from '@/lib/utils';

export const PRESENTATION_MEETINGS_QUERY_ROOT = ['financeiro', 'presentation-socios', 'meetings'] as const;

export interface PresentationMeetingFilters {
  period?: NormalizedDateRange;
  status?: PresentationMeetingStatus;
  responsibleUserId?: string;
  participantUserId?: string;
  search: string;
  page: number;
  pageSize?: number;
}

export class PresentationMeetingMutationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PresentationMeetingMutationError';
    this.code = code;
  }
}

function mutationError(error: { message?: string }): PresentationMeetingMutationError {
  const message = error.message ?? 'Erro desconhecido.';
  const codes = [
    'OPTIMISTIC_LOCK_CONFLICT',
    'OPTIMISTIC_LOCK_REQUIRED',
    'PERMISSION_DENIED',
    'PARTICIPANT_OUT_OF_TENANT',
    'PARTICIPANT_DUPLICATE',
    'RESPONSIBLE_OUT_OF_TENANT',
    'RESPONSIBLE_WITHOUT_ACCESS',
    'RESPONSIBLE_REQUIRED',
    'REQUEST_ID_REUTILIZADO',
    'REFERENCE_OUT_OF_TENANT_OR_PERIOD',
    'REFERENCE_OUT_OF_TENANT',
    'REFERENCE_REQUIRED',
    'REFERENCE_INCOMPATIBLE',
    'PREVIOUS_SESSION_OUT_OF_TENANT',
    'PREVIOUS_SESSION_INVALID',
    'JUSTIFICATION_REQUIRED',
    'SNAPSHOT_VERSION_UNKNOWN',
    'SNAPSHOT_SOURCE_INCOMPATIBLE',
    'SNAPSHOT_PERIOD_INCOMPATIBLE',
    'SNAPSHOT_REFERENCE_MISSING',
    'SNAPSHOT_REFERENCE_UNRELATED',
    'SNAPSHOT_CONTRACT_INVALID',
    'TRANSITION_INVALID',
    'STATUS_INVALID',
    'NOT_FOUND',
    'PAYLOAD_TOO_LARGE',
  ];
  return new PresentationMeetingMutationError(
    codes.find(code => message.includes(code)) ?? 'UNKNOWN',
    message,
  );
}

export function usePresentationMeetings(
  companyId: string | undefined,
  filters: PresentationMeetingFilters,
  enabled: boolean,
) {
  const supabase = useSupabase();
  const pageSize = filters.pageSize ?? 20;
  return useQuery({
    queryKey: [
      ...PRESENTATION_MEETINGS_QUERY_ROOT,
      companyId,
      filters.period?.start ?? null,
      filters.period?.endExclusive ?? null,
      filters.status ?? null,
      filters.responsibleUserId ?? null,
      filters.participantUserId ?? null,
      normalizeSearchText(filters.search),
      filters.page,
      pageSize,
    ],
    enabled: enabled && Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_fin_presentation_sessions', {
        p_period_start: filters.period?.start ?? null,
        p_period_end_exclusive: filters.period?.endExclusive ?? null,
        p_status: filters.status ?? null,
        p_responsible_user_id: filters.responsibleUserId ?? null,
        p_participant_user_id: filters.participantUserId ?? null,
        p_search: normalizeSearchText(filters.search),
        p_page: filters.page,
        p_page_size: pageSize,
      });
      if (error) throw mutationError(error);
      return parsePresentationMeetingList(data);
    },
  });
}

export function usePresentationMeetingDetail(
  companyId: string | undefined,
  sessionId: string | undefined,
  enabled: boolean,
) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...PRESENTATION_MEETINGS_QUERY_ROOT, companyId, 'detail', sessionId],
    enabled: enabled && Boolean(companyId && sessionId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fin_presentation_session', {
        p_session_id: sessionId!,
      });
      if (error) throw mutationError(error);
      return parsePresentationMeetingDetail(data);
    },
  });
}

export function usePresentationPreviousMeetingDetail(
  companyId: string | undefined,
  previousSessionId: string | undefined,
  enabled: boolean,
) {
  return usePresentationMeetingDetail(companyId, previousSessionId, enabled);
}

export async function fetchPresentationMinutesExport(supabase: typeof import("@/integrations/supabase/client").supabase, sessionId: string) {
  const { data, error } = await supabase.rpc('get_fin_presentation_minutes_export', {
    p_session_id: sessionId,
  });
  if (error) throw mutationError(error);
  return parsePresentationMeetingDetail(data);
}

export function usePresentationMeetingMutations(companyId: string | undefined) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();
  const invalidate = async (sessionId?: string) => {
    await queryClient.invalidateQueries({ queryKey: PRESENTATION_MEETINGS_QUERY_ROOT });
    if (companyId && sessionId) {
      await queryClient.invalidateQueries({
        queryKey: [...PRESENTATION_MEETINGS_QUERY_ROOT, companyId, 'detail', sessionId],
      });
    }
  };

  const createSession = useMutation({
    /**
     * `semente` identifica a sessão em criação (a tela troca depois do
     * sucesso). A chave é derivada dela + conteúdo: o retry depois de a
     * resposta se perder devolve a sessão já criada em vez de abrir outra.
     */
    mutationFn: async (input: {
      period: NormalizedDateRange;
      granularity: TimeSeriesGranularity;
      draft: PresentationMeetingDraft;
      semente: string;
    }) => {
      const draft = parsePresentationMeetingDraft(input.draft);
      const idempotencyKey = await presentationSessionCreateKey(input.semente, {
        period: input.period,
        granularity: input.granularity,
        draft,
      });
      const { data, error } = await supabase.rpc('_guarded_create_presentation_session', {
        p_title: draft.title,
        p_context: draft.context,
        p_period_start: input.period.start,
        p_period_end_exclusive: input.period.endExclusive,
        p_granularity: input.granularity,
        p_meeting_date: draft.meetingDate,
        p_minutes_responsible_user_id: draft.minutesResponsibleUserId,
        p_participant_user_ids: [...draft.participantUserIds],
        p_previous_session_id: draft.previousSessionId,
        p_agenda_items: draft.agendaItems as unknown as Json,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw mutationError(error);
      return data as { id: string; idempotent?: boolean };
    },
    onSuccess: result => invalidate(result.id),
  });

  const saveSession = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      draft: PresentationMeetingDraft;
      expectedStatus: 'DRAFT' | 'IN_PROGRESS';
      expectedUpdatedAt: string;
    }) => {
      const draft = parsePresentationMeetingDraft(input.draft);
      const { data, error } = await supabase.rpc('_guarded_save_presentation_session', {
        p_session_id: input.sessionId,
        p_title: draft.title,
        p_context: draft.context,
        p_meeting_date: draft.meetingDate,
        p_minutes_responsible_user_id: draft.minutesResponsibleUserId,
        p_participant_user_ids: [...draft.participantUserIds],
        p_previous_session_id: draft.previousSessionId,
        p_agenda_items: draft.agendaItems as unknown as Json,
        p_expected_status: input.expectedStatus,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });

  const startSession = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      snapshot: PresentationMeetingSnapshot;
      expectedUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_start_presentation_session', {
        p_session_id: input.sessionId,
        p_snapshot: input.snapshot as unknown as Json,
        p_expected_status: 'DRAFT',
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });

  const submitMinutes = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      revisionReason: string;
      expectedUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_submit_presentation_minutes', {
        p_session_id: input.sessionId,
        p_revision_reason: input.revisionReason,
        p_expected_status: 'IN_PROGRESS',
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });

  const transitionSession = useMutation({
    mutationFn: async (input: {
      sessionId: string;
      expectedStatus: PresentationMeetingStatus;
      targetStatus: 'DRAFT' | 'IN_PROGRESS' | 'APPROVED' | 'CANCELLED';
      justification: string;
      expectedUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_transition_presentation_session', {
        p_session_id: input.sessionId,
        p_expected_status: input.expectedStatus,
        p_target_status: input.targetStatus,
        p_justification: input.justification,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.sessionId),
  });

  return { createSession, saveSession, startSession, submitMinutes, transitionSession };
}

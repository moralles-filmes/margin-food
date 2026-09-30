import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  parsePresentationDecisionDetail,
  parsePresentationDecisionList,
  parsePresentationDecisionTransition,
  parsePresentationResponsibleProfiles,
  PRESENTATION_DECISION_API_VERSION,
  presentationDecisionCreateKey,
  type NormalizedDateRange,
  type PresentationActionPriority,
  type PresentationActionStatus,
  type PresentationDecisionReferenceType,
  type PresentationDecisionSnapshot,
  type PresentationDecisionStatus,
} from '@/domain/financeiro/presentation';
import type { Json } from '@/integrations/supabase/types';
import { normalizeSearchText } from '@/lib/utils';

export const PRESENTATION_DECISIONS_QUERY_ROOT = ['financeiro', 'presentation-socios', 'decisions'] as const;

export type PresentationDecisionDueFilter = 'all' | 'overdue' | 'upcoming' | 'no-deadline';

export interface PresentationDecisionFilters {
  period?: NormalizedDateRange;
  status?: PresentationDecisionStatus;
  responsibleUserId?: string;
  dueFilter: PresentationDecisionDueFilter;
  search: string;
  page: number;
  pageSize?: number;
}

export class PresentationDecisionMutationError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'PresentationDecisionMutationError';
    this.code = code;
  }
}

function mutationError(error: { message?: string }): PresentationDecisionMutationError {
  const message = error.message ?? 'Erro desconhecido.';
  const codes = [
    'OPTIMISTIC_LOCK_CONFLICT',
    'OPTIMISTIC_LOCK_REQUIRED',
    'PERMISSION_DENIED',
    'RESPONSIBLE_OUT_OF_TENANT',
    'RESPONSIBLE_WITHOUT_ACCESS',
    'RESPONSIBLE_REQUIRED',
    'REQUEST_ID_REUTILIZADO',
    'JUSTIFICATION_REQUIRED',
    'SCENARIO_WITHOUT_EXPLICIT_LEVER',
    'SNAPSHOT_VERSION_UNKNOWN',
    'SNAPSHOT_SOURCE_INCOMPATIBLE',
    'SNAPSHOT_PERIOD_INCOMPATIBLE',
    'SNAPSHOT_CONTRACT_INVALID',
    'SOURCE_UNAVAILABLE',
    'ACTIVE_ACTIONS_REMAIN',
    'ACTION_REOPEN_REQUIRED',
    'TRANSITION_INVALID',
    'STATUS_INVALID',
    'NOT_FOUND',
    'PAYLOAD_TOO_LARGE',
  ];
  return new PresentationDecisionMutationError(
    codes.find(code => message.includes(code)) ?? 'UNKNOWN',
    message,
  );
}

export function usePresentationDecisions(
  companyId: string | undefined,
  filters: PresentationDecisionFilters,
  enabled: boolean,
) {
  const supabase = useSupabase();
  const pageSize = filters.pageSize ?? 20;
  return useQuery({
    queryKey: [
      ...PRESENTATION_DECISIONS_QUERY_ROOT,
      companyId,
      filters.period?.start ?? null,
      filters.period?.endExclusive ?? null,
      filters.status ?? null,
      filters.responsibleUserId ?? null,
      filters.dueFilter,
      normalizeSearchText(filters.search),
      filters.page,
      pageSize,
    ],
    enabled: enabled && Boolean(companyId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_fin_presentation_decisions', {
        p_period_start: filters.period?.start ?? null,
        p_period_end_exclusive: filters.period?.endExclusive ?? null,
        p_status: filters.status ?? null,
        p_responsible_user_id: filters.responsibleUserId ?? null,
        p_due_filter: filters.dueFilter,
        p_search: normalizeSearchText(filters.search),
        p_page: filters.page,
        p_page_size: pageSize,
      });
      if (error) throw mutationError(error);
      return parsePresentationDecisionList(data);
    },
  });
}

export function usePresentationDecisionDetail(
  companyId: string | undefined,
  decisionId: string | undefined,
  enabled: boolean,
) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...PRESENTATION_DECISIONS_QUERY_ROOT, companyId, 'detail', decisionId],
    enabled: enabled && Boolean(companyId && decisionId),
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_fin_presentation_decision', {
        p_decision_id: decisionId!,
      });
      if (error) throw mutationError(error);
      return parsePresentationDecisionDetail(data);
    },
  });
}

export function usePresentationResponsibleProfiles(
  companyId: string | undefined,
  enabled: boolean,
) {
  const supabase = useSupabase();
  return useQuery({
    queryKey: [...PRESENTATION_DECISIONS_QUERY_ROOT, companyId, 'responsible-profiles'],
    enabled: enabled && Boolean(companyId),
    staleTime: 5 * 60 * 1000,
    queryFn: async () => {
      const { data, error } = await supabase.rpc('list_profiles_minimal', {
        p_search: '',
        p_limit: 200,
      });
      if (error) throw mutationError(error);
      return parsePresentationResponsibleProfiles(data);
    },
  });
}

export function usePresentationDecisionMutations(companyId: string | undefined) {
  const supabase = useSupabase();
  const queryClient = useQueryClient();

  const invalidate = async (decisionId?: string) => {
    await queryClient.invalidateQueries({ queryKey: PRESENTATION_DECISIONS_QUERY_ROOT });
    if (companyId && decisionId) {
      await queryClient.invalidateQueries({
        queryKey: [...PRESENTATION_DECISIONS_QUERY_ROOT, companyId, 'detail', decisionId],
      });
    }
  };

  const createDecision = useMutation({
    /**
     * `semente` identifica a decisão em registro (a tela troca depois do
     * sucesso). A chave é derivada dela + escolhas do usuário: o retry depois de
     * a resposta se perder devolve a decisão já registrada.
     */
    mutationFn: async (input: {
      title: string;
      context: string;
      period: NormalizedDateRange;
      granularity: 'day' | 'month' | 'year';
      referenceType: PresentationDecisionReferenceType;
      snapshot: PresentationDecisionSnapshot;
      executiveResponsibleUserId: string | null;
      semente: string;
    }) => {
      const idempotencyKey = await presentationDecisionCreateKey(input.semente, input);
      const { data, error } = await supabase.rpc('_guarded_create_presentation_decision', {
        p_title: input.title,
        p_context: input.context,
        p_period_start: input.period.start,
        p_period_end_exclusive: input.period.endExclusive,
        p_granularity: input.granularity,
        p_reference_type: input.referenceType,
        p_snapshot: input.snapshot as unknown as Json,
        p_executive_responsible_user_id: input.executiveResponsibleUserId,
        p_idempotency_key: idempotencyKey,
      });
      if (error) throw mutationError(error);
      return data as { id: string; idempotent?: boolean };
    },
    onSuccess: result => invalidate(result.id),
  });

  const updateDraft = useMutation({
    mutationFn: async (input: {
      decisionId: string;
      title: string;
      context: string;
      executiveResponsibleUserId: string | null;
      expectedUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_update_presentation_decision_draft', {
        p_decision_id: input.decisionId,
        p_title: input.title,
        p_context: input.context,
        p_executive_responsible_user_id: input.executiveResponsibleUserId,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.decisionId),
  });

  const addRevision = useMutation({
    mutationFn: async (input: {
      decisionId: string;
      referenceType: PresentationDecisionReferenceType;
      snapshot: PresentationDecisionSnapshot;
      reason: string;
      expectedStatus: PresentationDecisionStatus;
      expectedUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_add_presentation_decision_revision', {
        p_decision_id: input.decisionId,
        p_reference_type: input.referenceType,
        p_snapshot: input.snapshot as unknown as Json,
        p_reason: input.reason,
        p_expected_status: input.expectedStatus,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.decisionId),
  });

  const transitionDecision = useMutation({
    mutationFn: async (input: {
      decisionId: string;
      expectedStatus: PresentationDecisionStatus;
      targetStatus: PresentationDecisionStatus;
      justification: string;
      expectedUpdatedAt: string;
    }) => {
      const parsed = parsePresentationDecisionTransition({
        contractVersion: PRESENTATION_DECISION_API_VERSION,
        entity: 'decision',
        entityId: input.decisionId,
        expectedStatus: input.expectedStatus,
        targetStatus: input.targetStatus,
        justification: input.justification,
        expectedUpdatedAt: input.expectedUpdatedAt,
      });
      if (parsed.entity !== 'decision') throw new Error('Contrato de transição incompatível.');
      const { data, error } = await supabase.rpc('_guarded_transition_presentation_decision', {
        p_decision_id: parsed.entityId,
        p_expected_status: parsed.expectedStatus,
        p_target_status: parsed.targetStatus,
        p_justification: parsed.justification,
        p_expected_updated_at: parsed.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.decisionId),
  });

  const createAction = useMutation({
    mutationFn: async (input: {
      decisionId: string;
      description: string;
      responsibleUserId: string;
      dueDate: string | null;
      priority: PresentationActionPriority | null;
      expectedDecisionStatus: PresentationDecisionStatus;
      expectedDecisionUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_create_presentation_decision_action', {
        p_decision_id: input.decisionId,
        p_description: input.description,
        p_responsible_user_id: input.responsibleUserId,
        p_expected_decision_status: input.expectedDecisionStatus,
        p_expected_decision_updated_at: input.expectedDecisionUpdatedAt,
        p_due_date: input.dueDate,
        p_priority: input.priority,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.decisionId),
  });

  const updateAction = useMutation({
    mutationFn: async (input: {
      decisionId: string;
      actionId: string;
      description: string;
      responsibleUserId: string;
      dueDate: string | null;
      priority: PresentationActionPriority | null;
      expectedStatus: PresentationActionStatus;
      expectedUpdatedAt: string;
    }) => {
      const { data, error } = await supabase.rpc('_guarded_update_presentation_decision_action', {
        p_action_id: input.actionId,
        p_description: input.description,
        p_responsible_user_id: input.responsibleUserId,
        p_due_date: input.dueDate,
        p_priority: input.priority,
        p_expected_status: input.expectedStatus,
        p_expected_updated_at: input.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.decisionId),
  });

  const transitionAction = useMutation({
    mutationFn: async (input: {
      decisionId: string;
      actionId: string;
      expectedStatus: PresentationActionStatus;
      targetStatus: PresentationActionStatus;
      outcomeNote: string | null;
      expectedUpdatedAt: string;
    }) => {
      const parsed = parsePresentationDecisionTransition({
        contractVersion: PRESENTATION_DECISION_API_VERSION,
        entity: 'action',
        entityId: input.actionId,
        expectedStatus: input.expectedStatus,
        targetStatus: input.targetStatus,
        justification: input.outcomeNote,
        expectedUpdatedAt: input.expectedUpdatedAt,
      });
      if (parsed.entity !== 'action') throw new Error('Contrato de transição incompatível.');
      const { data, error } = await supabase.rpc('_guarded_transition_presentation_decision_action', {
        p_action_id: parsed.entityId,
        p_expected_status: parsed.expectedStatus,
        p_target_status: parsed.targetStatus,
        p_outcome_note: parsed.justification,
        p_expected_updated_at: parsed.expectedUpdatedAt,
      });
      if (error) throw mutationError(error);
      return data;
    },
    onSuccess: (_result, input) => invalidate(input.decisionId),
  });

  return {
    createDecision,
    updateDraft,
    addRevision,
    transitionDecision,
    createAction,
    updateAction,
    transitionAction,
  };
}

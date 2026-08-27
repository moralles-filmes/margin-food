import type { NormalizedDateRange, TimeSeriesGranularity } from './contracts';
import type { PresentationComparisonMode, PresentationPlanData, PresentationPlanMetricSet } from './plan';
import type {
  PresentationActionPriority,
  PresentationActionStatus,
  PresentationDecisionStatus,
} from './decisions';

/**
 * Fase 12 - contratos do ritual executivo.
 *
 * Sessões e atas guardam evidências do encontro. Métricas atuais continuam
 * vindo de get_fin_presentation_plan e decisões/ações continuam canônicas nas
 * entidades da Fase 11; este contrato armazena apenas IDs e versões revisados.
 */
export const PRESENTATION_MEETING_API_VERSION = 'presentation-executive-session-v1.0' as const;
export const PRESENTATION_MEETING_SNAPSHOT_VERSION = 'presentation-meeting-snapshot-v1.0' as const;
export const PRESENTATION_MINUTES_REVISION_VERSION = 'presentation-minutes-revision-v1.0' as const;
export const PRESENTATION_MINUTES_EXPORT_VERSION = 'presentation-minutes-export-v1.0' as const;
export const PRESENTATION_MEETING_MAX_SNAPSHOT_BYTES = 262_144;
export const PRESENTATION_MEETING_MAX_REVISION_BYTES = 524_288;
export const PRESENTATION_MEETING_MAX_AGENDA_ITEMS = 100;
export const PRESENTATION_MEETING_MAX_PARTICIPANTS = 100;

export const PRESENTATION_MEETING_STATUSES = [
  'DRAFT',
  'IN_PROGRESS',
  'IN_REVIEW',
  'APPROVED',
  'CANCELLED',
] as const;

export const PRESENTATION_AGENDA_ITEM_TYPES = [
  'FINANCIAL_OVERVIEW',
  'REVENUE',
  'EXPENSE',
  'RESULT',
  'MARGIN',
  'CMV',
  'CATEGORY_RANKING',
  'PAYABLES_RECEIVABLES',
  'SCENARIO',
  'DECISION',
  'ACTION',
  'FREE_TEXT',
] as const;

export const PRESENTATION_AGENDA_REVIEW_STATES = [
  'PENDING',
  'DISCUSSED',
  'CONCLUDED',
  'CANCELLED',
] as const;

export type PresentationMeetingStatus = typeof PRESENTATION_MEETING_STATUSES[number];
export type PresentationAgendaItemType = typeof PRESENTATION_AGENDA_ITEM_TYPES[number];
export type PresentationAgendaReviewState = typeof PRESENTATION_AGENDA_REVIEW_STATES[number];
export type PresentationMeetingReferenceType = 'CATEGORY' | 'DECISION' | 'ACTION';

export interface PresentationMeetingParticipant {
  id: string;
  userId: string | null;
  nameSnapshot: string;
  emailSnapshot: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

export interface PresentationMeetingCanonicalReference {
  entityType: 'DECISION' | 'ACTION';
  id: string;
  decisionId: string;
  title: string;
  version: number;
  status: PresentationDecisionStatus | PresentationActionStatus;
  responsibleUserId: string | null;
  responsibleName: string | null;
  dueDate: string | null;
  priority: PresentationActionPriority | null;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationAgendaItem {
  id: string;
  itemType: PresentationAgendaItemType;
  position: number;
  title: string;
  objective: string;
  discussionNotes: string;
  conclusion: string | null;
  reviewState: PresentationAgendaReviewState;
  referenceType: PresentationMeetingReferenceType | null;
  referenceId: string | null;
  referenceVersion: number | null;
  referenceStatus: string | null;
  createdBy: string | null;
  createdByName: string;
  updatedBy: string | null;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationMeetingSnapshotReference {
  id: string;
  decisionId: string;
  version: number;
  status: PresentationDecisionStatus | PresentationActionStatus;
  updatedAt: string;
}

export interface PresentationMeetingSnapshot {
  contractVersion: typeof PRESENTATION_MEETING_SNAPSHOT_VERSION;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  capturedAt: string;
  cutoffDate: string;
  formulaVersion: 'presentation-plan-v1.0';
  sources: PresentationPlanData['sources'];
  rules: PresentationPlanData['rules'];
  metrics: PresentationPlanMetricSet;
  dataUnavailable: readonly string[];
  filters: {
    comparisonMode: PresentationComparisonMode;
    rankingLimit: number;
  };
  decisions: readonly PresentationMeetingSnapshotReference[];
  actions: readonly PresentationMeetingSnapshotReference[];
}

export interface PresentationMeetingSummary {
  id: string;
  title: string;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  meetingDate: string;
  status: PresentationMeetingStatus;
  minutesResponsibleUserId: string | null;
  minutesResponsibleName: string;
  previousSessionId: string | null;
  currentRevisionId: string | null;
  currentRevisionNumber: number | null;
  participantCount: number;
  agendaItemCount: number;
  unresolvedAgendaCount: number;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export interface PresentationMeeting extends PresentationMeetingSummary {
  context: string;
  snapshot: PresentationMeetingSnapshot | null;
  latestJustification: string | null;
  startedAt: string | null;
  submittedAt: string | null;
  approvedAt: string | null;
  approvedBy: string | null;
  approvedByName: string | null;
  cancelledAt: string | null;
  updatedBy: string | null;
  updatedByName: string;
}

export interface PresentationMinutesRevisionContent {
  contractVersion: typeof PRESENTATION_MINUTES_REVISION_VERSION;
  session: {
    id: string;
    title: string;
    period: NormalizedDateRange;
    granularity: TimeSeriesGranularity;
    meetingDate: string;
    context: string;
    minutesResponsibleUserId: string | null;
    minutesResponsibleName: string;
    previousSessionId: string | null;
  };
  participants: readonly PresentationMeetingParticipant[];
  agendaItems: readonly PresentationAgendaItem[];
  snapshot: PresentationMeetingSnapshot;
}

export interface PresentationMinutesRevision {
  id: string;
  revisionNumber: number;
  state: 'IN_REVIEW' | 'APPROVED' | 'SUPERSEDED';
  revisionReason: string;
  content: PresentationMinutesRevisionContent;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
}

export interface PresentationMeetingTimelineEvent {
  id: string;
  eventType: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  justification: string | null;
  actorUserId: string | null;
  actorName: string;
  createdAt: string;
}

export interface PresentationMeetingDetail {
  contractVersion: typeof PRESENTATION_MEETING_API_VERSION;
  session: PresentationMeeting;
  participants: readonly PresentationMeetingParticipant[];
  agendaItems: readonly PresentationAgendaItem[];
  revisions: readonly PresentationMinutesRevision[];
  canonicalReferences: readonly PresentationMeetingCanonicalReference[];
  timeline: readonly PresentationMeetingTimelineEvent[];
  fetchedAt: string;
}

export interface PresentationMeetingListPage {
  contractVersion: typeof PRESENTATION_MEETING_API_VERSION;
  items: readonly PresentationMeetingSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  fetchedAt: string;
}

export interface PresentationAgendaItemDraft {
  id?: string;
  itemType: PresentationAgendaItemType;
  title: string;
  objective: string;
  discussionNotes: string;
  conclusion: string | null;
  reviewState: PresentationAgendaReviewState;
  referenceType: PresentationMeetingReferenceType | null;
  referenceId: string | null;
}

export interface PresentationMeetingDraft {
  title: string;
  context: string;
  meetingDate: string;
  minutesResponsibleUserId: string;
  participantUserIds: readonly string[];
  previousSessionId: string | null;
  agendaItems: readonly PresentationAgendaItemDraft[];
}

export interface PresentationMeetingTransition {
  contractVersion: typeof PRESENTATION_MEETING_API_VERSION;
  sessionId: string;
  expectedStatus: PresentationMeetingStatus;
  targetStatus: PresentationMeetingStatus;
  justification: string | null;
  expectedUpdatedAt: string;
}

export interface PresentationMeetingFollowUp {
  comparisonState: 'available' | 'no-previous-session' | 'incompatible-period';
  dueWindowEnd: string | null;
  decisionsByStatus: Readonly<Record<PresentationDecisionStatus, number>>;
  actionsByStatus: Readonly<Record<PresentationActionStatus, number>>;
  overdueActions: readonly PresentationMeetingCanonicalReference[];
  dueSoonActions: readonly PresentationMeetingCanonicalReference[];
  noDueDateActions: readonly PresentationMeetingCanonicalReference[];
  noPriorityActions: readonly PresentationMeetingCanonicalReference[];
  createdDuringMeeting: readonly PresentationMeetingCanonicalReference[];
  changedSinceSnapshot: readonly PresentationMeetingCanonicalReference[];
  unresolvedAgendaItems: readonly PresentationAgendaItem[];
}

export interface PresentationMeetingRevisionDifference {
  path: string;
  before: string | number | boolean | null;
  after: string | number | boolean | null;
}

export type PresentationMeetingComparison =
  | {
      state: 'available';
      previousSessionId: string;
      previousRevisionNumber: number;
      currentRevisionNumber: number;
      differences: readonly PresentationMeetingRevisionDifference[];
    }
  | { state: 'no-previous-session' }
  | { state: 'incompatible-period' };

export interface PresentationMinutesExport {
  contractVersion: typeof PRESENTATION_MINUTES_EXPORT_VERSION;
  detail: PresentationMeetingDetail;
  revision: PresentationMinutesRevision | null;
  followUp: PresentationMeetingFollowUp;
  comparison: PresentationMeetingComparison;
  exportedAt: string;
  draftWatermark: boolean;
}

export class PresentationMeetingValidationError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = 'PresentationMeetingValidationError';
    this.code = code;
    this.path = path;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fail(code: string, path: string, message: string): never {
  throw new PresentationMeetingValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function record(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail('MALFORMED_PAYLOAD', path, `${path} deve ser um objeto.`);
  return value;
}

function array(value: unknown, path: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) return fail('MALFORMED_PAYLOAD', path, `${path} deve ser uma lista.`);
  if (value.length > maximum) return fail('PAYLOAD_TOO_LARGE', path, `${path} excede o limite.`);
  return value;
}

function string(value: unknown, path: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.trim().length === 0)) {
    return fail('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  }
  return value;
}

function nullableString(value: unknown, path: string, maximum: number): string | null {
  return value === null || value === undefined ? null : string(value, path, maximum);
}

function uuid(value: unknown, path: string): string {
  const parsed = string(value, path, 36);
  return UUID_PATTERN.test(parsed) ? parsed : fail('INVALID_UUID', path, `${path} inválido.`);
}

function nullableUuid(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : uuid(value, path);
}

function finite(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail('NON_FINITE_NUMBER', path, `${path} inválido.`);
  return value;
}

function nullableFinite(value: unknown, path: string): number | null {
  return value === null ? null : finite(value, path);
}

function integer(value: unknown, path: string, minimum = 0): number {
  const parsed = finite(value, path);
  return Number.isInteger(parsed) && parsed >= minimum
    ? parsed
    : fail('MALFORMED_PAYLOAD', path, `${path} inválido.`);
}

function boolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  return value;
}

function timestamp(value: unknown, path: string): string {
  const parsed = string(value, path, 64);
  return Number.isFinite(Date.parse(parsed)) ? parsed : fail('INVALID_DATE', path, `${path} inválido.`);
}

function nullableTimestamp(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : timestamp(value, path);
}

function isoDate(value: unknown, path: string): string {
  const parsed = string(value, path, 10);
  if (!ISO_DATE_PATTERN.test(parsed)) return fail('INVALID_DATE', path, `${path} inválida.`);
  const [year, month, day] = parsed.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    return fail('INVALID_DATE', path, `${path} inválida.`);
  }
  return parsed;
}

function nullableDate(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : isoDate(value, path);
}

function range(value: unknown, path: string): NormalizedDateRange {
  const source = record(value, path);
  const parsed = {
    start: isoDate(source.start, `${path}.start`),
    endExclusive: isoDate(source.endExclusive, `${path}.endExclusive`),
  };
  if (parsed.start >= parsed.endExclusive) return fail('INVALID_PERIOD', path, 'Período inválido.');
  return parsed;
}

function granularity(value: unknown, path: string): TimeSeriesGranularity {
  if (value !== 'day' && value !== 'month' && value !== 'year') return fail('UNKNOWN_ENUM', path, `${path} inválida.`);
  return value;
}

function meetingStatus(value: unknown, path: string): PresentationMeetingStatus {
  if (!PRESENTATION_MEETING_STATUSES.includes(value as PresentationMeetingStatus)) {
    return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  }
  return value as PresentationMeetingStatus;
}

function agendaType(value: unknown, path: string): PresentationAgendaItemType {
  if (!PRESENTATION_AGENDA_ITEM_TYPES.includes(value as PresentationAgendaItemType)) {
    return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  }
  return value as PresentationAgendaItemType;
}

function agendaState(value: unknown, path: string): PresentationAgendaReviewState {
  if (!PRESENTATION_AGENDA_REVIEW_STATES.includes(value as PresentationAgendaReviewState)) {
    return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  }
  return value as PresentationAgendaReviewState;
}

function decisionStatus(value: unknown, path: string): PresentationDecisionStatus {
  const statuses: readonly string[] = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  return statuses.includes(value as string)
    ? value as PresentationDecisionStatus
    : fail('UNKNOWN_ENUM', path, `${path} inválido.`);
}

function actionStatus(value: unknown, path: string): PresentationActionStatus {
  const statuses: readonly string[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  return statuses.includes(value as string)
    ? value as PresentationActionStatus
    : fail('UNKNOWN_ENUM', path, `${path} inválido.`);
}

function priority(value: unknown, path: string): PresentationActionPriority | null {
  if (value === null || value === undefined) return null;
  const priorities: readonly string[] = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'];
  return priorities.includes(value as string)
    ? value as PresentationActionPriority
    : fail('UNKNOWN_ENUM', path, `${path} inválida.`);
}

function metricSet(value: unknown, path: string): PresentationPlanMetricSet {
  const source = record(value, path);
  const parsed = {
    revenue: nullableFinite(source.revenue, `${path}.revenue`),
    expense: nullableFinite(source.expense, `${path}.expense`),
    result: nullableFinite(source.result, `${path}.result`),
    marginPercent: nullableFinite(source.marginPercent, `${path}.marginPercent`),
    cmv: nullableFinite(source.cmv, `${path}.cmv`),
    cmvPercent: nullableFinite(source.cmvPercent, `${path}.cmvPercent`),
  };
  if (parsed.revenue === 0 && (parsed.marginPercent !== null || parsed.cmvPercent !== null)) {
    return fail('METRIC_INCOMPATIBLE', path, 'Receita zero exige percentuais indisponíveis.');
  }
  return parsed;
}

function bytes(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function parseSnapshotReference(value: unknown, path: string, entityType: 'DECISION' | 'ACTION'): PresentationMeetingSnapshotReference {
  const source = record(value, path);
  return {
    id: uuid(source.id, `${path}.id`),
    decisionId: uuid(source.decisionId, `${path}.decisionId`),
    version: integer(source.version, `${path}.version`, 1),
    status: entityType === 'DECISION'
      ? decisionStatus(source.status, `${path}.status`)
      : actionStatus(source.status, `${path}.status`),
    updatedAt: timestamp(source.updatedAt, `${path}.updatedAt`),
  };
}

export function parsePresentationMeetingSnapshot(value: unknown): PresentationMeetingSnapshot {
  if (bytes(value) > PRESENTATION_MEETING_MAX_SNAPSHOT_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'snapshot', 'Snapshot excede 256 KiB.');
  }
  const source = record(value, 'snapshot');
  if (source.contractVersion !== PRESENTATION_MEETING_SNAPSHOT_VERSION) {
    return fail('UNKNOWN_VERSION', 'snapshot.contractVersion', 'Versão de snapshot incompatível.');
  }
  if (source.formulaVersion !== 'presentation-plan-v1.0') {
    return fail('FORMULA_UNKNOWN', 'snapshot.formulaVersion', 'Fórmula desconhecida.');
  }
  const sources = record(source.sources, 'snapshot.sources');
  if (
    sources.actual !== 'fin_lancamentos'
    || sources.budget !== 'fin_orcamentos'
    || sources.cmvTarget !== 'metas_cmv.meta_cmv_total'
  ) {
    return fail('SOURCE_INCOMPATIBLE', 'snapshot.sources', 'Fontes canônicas incompatíveis.');
  }
  const filters = record(source.filters, 'snapshot.filters');
  const comparisonMode = filters.comparisonMode;
  if (comparisonMode !== 'actual' && comparisonMode !== 'budget' && comparisonMode !== 'projection') {
    return fail('UNKNOWN_ENUM', 'snapshot.filters.comparisonMode', 'Modo comparativo inválido.');
  }
  const unavailable = array(source.dataUnavailable, 'snapshot.dataUnavailable', 100)
    .map((item, index) => string(item, `snapshot.dataUnavailable[${index}]`, 200));
  return {
    contractVersion: PRESENTATION_MEETING_SNAPSHOT_VERSION,
    period: range(source.period, 'snapshot.period'),
    granularity: granularity(source.granularity, 'snapshot.granularity'),
    capturedAt: timestamp(source.capturedAt, 'snapshot.capturedAt'),
    cutoffDate: isoDate(source.cutoffDate, 'snapshot.cutoffDate'),
    formulaVersion: 'presentation-plan-v1.0',
    sources: {
      actual: 'fin_lancamentos',
      budget: 'fin_orcamentos',
      cmvTarget: 'metas_cmv.meta_cmv_total',
    },
    rules: record(source.rules, 'snapshot.rules') as unknown as PresentationPlanData['rules'],
    metrics: metricSet(source.metrics, 'snapshot.metrics'),
    dataUnavailable: unavailable,
    filters: {
      comparisonMode,
      rankingLimit: integer(filters.rankingLimit, 'snapshot.filters.rankingLimit', 1),
    },
    decisions: array(source.decisions, 'snapshot.decisions', 100)
      .map((item, index) => parseSnapshotReference(item, `snapshot.decisions[${index}]`, 'DECISION')),
    actions: array(source.actions, 'snapshot.actions', 500)
      .map((item, index) => parseSnapshotReference(item, `snapshot.actions[${index}]`, 'ACTION')),
  };
}

export function buildPresentationMeetingSnapshot(input: {
  plan: PresentationPlanData;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  comparisonMode: PresentationComparisonMode;
  rankingLimit: number;
  canonicalReferences: readonly PresentationMeetingCanonicalReference[];
  capturedAt?: string;
}): PresentationMeetingSnapshot {
  if (input.plan.range.start !== input.period.start || input.plan.range.endExclusive !== input.period.endExclusive) {
    return fail('INVALID_PERIOD', 'plan.range', 'A base atual não corresponde ao período da sessão.');
  }
  const metrics = input.comparisonMode === 'actual'
    ? input.plan.actual
    : input.comparisonMode === 'budget'
      ? input.plan.budget
      : input.plan.projection.metrics ?? {
        revenue: null,
        expense: null,
        result: null,
        marginPercent: null,
        cmv: null,
        cmvPercent: null,
      };
  const dataUnavailable = Object.entries(metrics)
    .filter(([, value]) => value === null)
    .map(([key]) => key);
  if (input.comparisonMode === 'projection' && input.plan.projection.state !== 'available') {
    dataUnavailable.push(`projection:${input.plan.projection.state}`);
  }
  const toReference = (reference: PresentationMeetingCanonicalReference): PresentationMeetingSnapshotReference => ({
    id: reference.id,
    decisionId: reference.decisionId,
    version: reference.version,
    status: reference.status,
    updatedAt: reference.updatedAt,
  });
  return parsePresentationMeetingSnapshot({
    contractVersion: PRESENTATION_MEETING_SNAPSHOT_VERSION,
    period: input.period,
    granularity: input.granularity,
    capturedAt: input.capturedAt ?? new Date().toISOString(),
    cutoffDate: input.plan.projection.cutoffDate,
    formulaVersion: 'presentation-plan-v1.0',
    sources: input.plan.sources,
    rules: input.plan.rules,
    metrics,
    dataUnavailable,
    filters: { comparisonMode: input.comparisonMode, rankingLimit: input.rankingLimit },
    decisions: input.canonicalReferences.filter(item => item.entityType === 'DECISION').map(toReference),
    actions: input.canonicalReferences.filter(item => item.entityType === 'ACTION').map(toReference),
  });
}

function parseParticipant(value: unknown, path: string): PresentationMeetingParticipant {
  const source = record(value, path);
  return {
    id: uuid(source.id, `${path}.id`),
    userId: nullableUuid(source.userId, `${path}.userId`),
    nameSnapshot: string(source.nameSnapshot, `${path}.nameSnapshot`, 300),
    emailSnapshot: nullableString(source.emailSnapshot, `${path}.emailSnapshot`, 320),
    createdBy: nullableUuid(source.createdBy, `${path}.createdBy`),
    createdByName: string(source.createdByName, `${path}.createdByName`, 300),
    createdAt: timestamp(source.createdAt, `${path}.createdAt`),
  };
}

function parseReferenceType(value: unknown, path: string): PresentationMeetingReferenceType | null {
  if (value === null || value === undefined) return null;
  if (value !== 'CATEGORY' && value !== 'DECISION' && value !== 'ACTION') {
    return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  }
  return value;
}

function parseAgendaItem(value: unknown, path: string): PresentationAgendaItem {
  const source = record(value, path);
  const referenceType = parseReferenceType(source.referenceType, `${path}.referenceType`);
  const referenceId = nullableUuid(source.referenceId, `${path}.referenceId`);
  if ((referenceType === null) !== (referenceId === null)) {
    return fail('REFERENCE_INCOMPATIBLE', path, 'Tipo e ID da referência devem coexistir.');
  }
  return {
    id: uuid(source.id, `${path}.id`),
    itemType: agendaType(source.itemType, `${path}.itemType`),
    position: integer(source.position, `${path}.position`, 1),
    title: string(source.title, `${path}.title`, 200),
    objective: string(source.objective, `${path}.objective`, 2000, true),
    discussionNotes: string(source.discussionNotes, `${path}.discussionNotes`, 20_000, true),
    conclusion: nullableString(source.conclusion, `${path}.conclusion`, 10_000),
    reviewState: agendaState(source.reviewState, `${path}.reviewState`),
    referenceType,
    referenceId,
    referenceVersion: source.referenceVersion === null ? null : integer(source.referenceVersion, `${path}.referenceVersion`, 1),
    referenceStatus: nullableString(source.referenceStatus, `${path}.referenceStatus`, 50),
    createdBy: nullableUuid(source.createdBy, `${path}.createdBy`),
    createdByName: string(source.createdByName, `${path}.createdByName`, 300),
    updatedBy: nullableUuid(source.updatedBy, `${path}.updatedBy`),
    updatedByName: string(source.updatedByName, `${path}.updatedByName`, 300),
    createdAt: timestamp(source.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(source.updatedAt, `${path}.updatedAt`),
  };
}

function validateAgendaPositions(items: readonly PresentationAgendaItem[]): void {
  const positions = new Set(items.map(item => item.position));
  if (positions.size !== items.length || items.some(item => item.position < 1)) {
    return fail('AGENDA_ORDER_INVALID', 'agendaItems', 'A ordem da pauta contém posições duplicadas ou inválidas.');
  }
}

function parseSummary(value: unknown, path: string): PresentationMeetingSummary {
  const source = record(value, path);
  return {
    id: uuid(source.id, `${path}.id`),
    title: string(source.title, `${path}.title`, 200),
    period: range(source.period, `${path}.period`),
    granularity: granularity(source.granularity, `${path}.granularity`),
    meetingDate: isoDate(source.meetingDate, `${path}.meetingDate`),
    status: meetingStatus(source.status, `${path}.status`),
    minutesResponsibleUserId: nullableUuid(source.minutesResponsibleUserId, `${path}.minutesResponsibleUserId`),
    minutesResponsibleName: string(source.minutesResponsibleName, `${path}.minutesResponsibleName`, 300),
    previousSessionId: nullableUuid(source.previousSessionId, `${path}.previousSessionId`),
    currentRevisionId: nullableUuid(source.currentRevisionId, `${path}.currentRevisionId`),
    currentRevisionNumber: source.currentRevisionNumber === null ? null : integer(source.currentRevisionNumber, `${path}.currentRevisionNumber`, 1),
    participantCount: integer(source.participantCount, `${path}.participantCount`),
    agendaItemCount: integer(source.agendaItemCount, `${path}.agendaItemCount`),
    unresolvedAgendaCount: integer(source.unresolvedAgendaCount, `${path}.unresolvedAgendaCount`),
    createdBy: nullableUuid(source.createdBy, `${path}.createdBy`),
    createdByName: string(source.createdByName, `${path}.createdByName`, 300),
    createdAt: timestamp(source.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(source.updatedAt, `${path}.updatedAt`),
    version: integer(source.version, `${path}.version`, 1),
  };
}

function parseMeeting(value: unknown): PresentationMeeting {
  const source = record(value, 'session');
  return {
    ...parseSummary(source, 'session'),
    context: string(source.context, 'session.context', 10_000, true),
    snapshot: source.snapshot === null ? null : parsePresentationMeetingSnapshot(source.snapshot),
    latestJustification: nullableString(source.latestJustification, 'session.latestJustification', 4000),
    startedAt: nullableTimestamp(source.startedAt, 'session.startedAt'),
    submittedAt: nullableTimestamp(source.submittedAt, 'session.submittedAt'),
    approvedAt: nullableTimestamp(source.approvedAt, 'session.approvedAt'),
    approvedBy: nullableUuid(source.approvedBy, 'session.approvedBy'),
    approvedByName: nullableString(source.approvedByName, 'session.approvedByName', 300),
    cancelledAt: nullableTimestamp(source.cancelledAt, 'session.cancelledAt'),
    updatedBy: nullableUuid(source.updatedBy, 'session.updatedBy'),
    updatedByName: string(source.updatedByName, 'session.updatedByName', 300),
  };
}

function parseRevisionContent(value: unknown): PresentationMinutesRevisionContent {
  if (bytes(value) > PRESENTATION_MEETING_MAX_REVISION_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'revision.content', 'Revisão excede 512 KiB.');
  }
  const source = record(value, 'revision.content');
  if (source.contractVersion !== PRESENTATION_MINUTES_REVISION_VERSION) {
    return fail('UNKNOWN_VERSION', 'revision.content.contractVersion', 'Versão da revisão incompatível.');
  }
  const session = record(source.session, 'revision.content.session');
  const agendaItems = array(source.agendaItems, 'revision.content.agendaItems', PRESENTATION_MEETING_MAX_AGENDA_ITEMS)
    .map((item, index) => parseAgendaItem(item, `revision.content.agendaItems[${index}]`));
  validateAgendaPositions(agendaItems);
  return {
    contractVersion: PRESENTATION_MINUTES_REVISION_VERSION,
    session: {
      id: uuid(session.id, 'revision.content.session.id'),
      title: string(session.title, 'revision.content.session.title', 200),
      period: range(session.period, 'revision.content.session.period'),
      granularity: granularity(session.granularity, 'revision.content.session.granularity'),
      meetingDate: isoDate(session.meetingDate, 'revision.content.session.meetingDate'),
      context: string(session.context, 'revision.content.session.context', 10_000, true),
      minutesResponsibleUserId: nullableUuid(session.minutesResponsibleUserId, 'revision.content.session.minutesResponsibleUserId'),
      minutesResponsibleName: string(session.minutesResponsibleName, 'revision.content.session.minutesResponsibleName', 300),
      previousSessionId: nullableUuid(session.previousSessionId, 'revision.content.session.previousSessionId'),
    },
    participants: array(source.participants, 'revision.content.participants', PRESENTATION_MEETING_MAX_PARTICIPANTS)
      .map((item, index) => parseParticipant(item, `revision.content.participants[${index}]`)),
    agendaItems,
    snapshot: parsePresentationMeetingSnapshot(source.snapshot),
  };
}

function parseRevision(value: unknown, path: string): PresentationMinutesRevision {
  const source = record(value, path);
  const state = source.state;
  if (state !== 'IN_REVIEW' && state !== 'APPROVED' && state !== 'SUPERSEDED') {
    return fail('UNKNOWN_ENUM', `${path}.state`, 'Estado da revisão inválido.');
  }
  return {
    id: uuid(source.id, `${path}.id`),
    revisionNumber: integer(source.revisionNumber, `${path}.revisionNumber`, 1),
    state,
    revisionReason: string(source.revisionReason, `${path}.revisionReason`, 4000),
    content: parseRevisionContent(source.content),
    createdBy: nullableUuid(source.createdBy, `${path}.createdBy`),
    createdByName: string(source.createdByName, `${path}.createdByName`, 300),
    createdAt: timestamp(source.createdAt, `${path}.createdAt`),
    approvedBy: nullableUuid(source.approvedBy, `${path}.approvedBy`),
    approvedByName: nullableString(source.approvedByName, `${path}.approvedByName`, 300),
    approvedAt: nullableTimestamp(source.approvedAt, `${path}.approvedAt`),
  };
}

function parseCanonicalReference(value: unknown, path: string): PresentationMeetingCanonicalReference {
  const source = record(value, path);
  const entityType = source.entityType;
  if (entityType !== 'DECISION' && entityType !== 'ACTION') {
    return fail('UNKNOWN_ENUM', `${path}.entityType`, 'Tipo de referência inválido.');
  }
  return {
    entityType,
    id: uuid(source.id, `${path}.id`),
    decisionId: uuid(source.decisionId, `${path}.decisionId`),
    title: string(source.title, `${path}.title`, 1000),
    version: integer(source.version, `${path}.version`, 1),
    status: entityType === 'DECISION'
      ? decisionStatus(source.status, `${path}.status`)
      : actionStatus(source.status, `${path}.status`),
    responsibleUserId: nullableUuid(source.responsibleUserId, `${path}.responsibleUserId`),
    responsibleName: nullableString(source.responsibleName, `${path}.responsibleName`, 300),
    dueDate: nullableDate(source.dueDate, `${path}.dueDate`),
    priority: priority(source.priority, `${path}.priority`),
    createdAt: timestamp(source.createdAt, `${path}.createdAt`),
    updatedAt: timestamp(source.updatedAt, `${path}.updatedAt`),
  };
}

function parseTimeline(value: unknown, path: string): PresentationMeetingTimelineEvent {
  const source = record(value, path);
  return {
    id: uuid(source.id, `${path}.id`),
    eventType: string(source.eventType, `${path}.eventType`, 100),
    before: source.before === null ? null : record(source.before, `${path}.before`),
    after: source.after === null ? null : record(source.after, `${path}.after`),
    justification: nullableString(source.justification, `${path}.justification`, 4000),
    actorUserId: nullableUuid(source.actorUserId, `${path}.actorUserId`),
    actorName: string(source.actorName, `${path}.actorName`, 300),
    createdAt: timestamp(source.createdAt, `${path}.createdAt`),
  };
}

export function parsePresentationMeetingList(value: unknown): PresentationMeetingListPage {
  const source = record(value, 'meetingList');
  if (source.contractVersion !== PRESENTATION_MEETING_API_VERSION) {
    return fail('UNKNOWN_VERSION', 'meetingList.contractVersion', 'Contrato da lista incompatível.');
  }
  return {
    contractVersion: PRESENTATION_MEETING_API_VERSION,
    items: array(source.items, 'meetingList.items', 50).map((item, index) => parseSummary(item, `meetingList.items[${index}]`)),
    page: integer(source.page, 'meetingList.page', 1),
    pageSize: integer(source.pageSize, 'meetingList.pageSize', 1),
    totalCount: integer(source.totalCount, 'meetingList.totalCount'),
    hasMore: boolean(source.hasMore, 'meetingList.hasMore'),
    fetchedAt: timestamp(source.fetchedAt, 'meetingList.fetchedAt'),
  };
}

export function parsePresentationMeetingDetail(value: unknown): PresentationMeetingDetail {
  const source = record(value, 'meetingDetail');
  if (source.contractVersion !== PRESENTATION_MEETING_API_VERSION) {
    return fail('UNKNOWN_VERSION', 'meetingDetail.contractVersion', 'Contrato do detalhe incompatível.');
  }
  const agendaItems = array(source.agendaItems, 'meetingDetail.agendaItems', PRESENTATION_MEETING_MAX_AGENDA_ITEMS)
    .map((item, index) => parseAgendaItem(item, `meetingDetail.agendaItems[${index}]`));
  validateAgendaPositions(agendaItems);
  return {
    contractVersion: PRESENTATION_MEETING_API_VERSION,
    session: parseMeeting(source.session),
    participants: array(source.participants, 'meetingDetail.participants', PRESENTATION_MEETING_MAX_PARTICIPANTS)
      .map((item, index) => parseParticipant(item, `meetingDetail.participants[${index}]`)),
    agendaItems,
    revisions: array(source.revisions, 'meetingDetail.revisions', 50)
      .map((item, index) => parseRevision(item, `meetingDetail.revisions[${index}]`)),
    canonicalReferences: array(source.canonicalReferences, 'meetingDetail.canonicalReferences', 600)
      .map((item, index) => parseCanonicalReference(item, `meetingDetail.canonicalReferences[${index}]`)),
    timeline: array(source.timeline, 'meetingDetail.timeline', 1000)
      .map((item, index) => parseTimeline(item, `meetingDetail.timeline[${index}]`)),
    fetchedAt: timestamp(source.fetchedAt, 'meetingDetail.fetchedAt'),
  };
}

export function parsePresentationMeetingDraft(value: unknown): PresentationMeetingDraft {
  const source = record(value, 'meetingDraft');
  const participantUserIds = array(source.participantUserIds, 'meetingDraft.participantUserIds', PRESENTATION_MEETING_MAX_PARTICIPANTS)
    .map((item, index) => uuid(item, `meetingDraft.participantUserIds[${index}]`));
  if (new Set(participantUserIds).size !== participantUserIds.length) {
    return fail('PARTICIPANT_DUPLICATE', 'meetingDraft.participantUserIds', 'Participantes duplicados.');
  }
  const agendaItems = array(source.agendaItems, 'meetingDraft.agendaItems', PRESENTATION_MEETING_MAX_AGENDA_ITEMS)
    .map((item, index): PresentationAgendaItemDraft => {
      const path = `meetingDraft.agendaItems[${index}]`;
      const agenda = record(item, path);
      const referenceType = parseReferenceType(agenda.referenceType, `${path}.referenceType`);
      const referenceId = nullableUuid(agenda.referenceId, `${path}.referenceId`);
      if ((referenceType === null) !== (referenceId === null)) {
        return fail('REFERENCE_INCOMPATIBLE', path, 'Tipo e ID da referência devem coexistir.');
      }
      const itemType = agendaType(agenda.itemType, `${path}.itemType`);
      if (itemType === 'DECISION' && referenceType !== 'DECISION') return fail('REFERENCE_REQUIRED', path, 'Decisão canônica obrigatória.');
      if (itemType === 'ACTION' && referenceType !== 'ACTION') return fail('REFERENCE_REQUIRED', path, 'Ação canônica obrigatória.');
      return {
        id: nullableUuid(agenda.id, `${path}.id`) ?? undefined,
        itemType,
        title: string(agenda.title, `${path}.title`, 200),
        objective: string(agenda.objective, `${path}.objective`, 2000, true),
        discussionNotes: string(agenda.discussionNotes, `${path}.discussionNotes`, 20_000, true),
        conclusion: nullableString(agenda.conclusion, `${path}.conclusion`, 10_000),
        reviewState: agendaState(agenda.reviewState, `${path}.reviewState`),
        referenceType,
        referenceId,
      };
    });
  return {
    title: string(source.title, 'meetingDraft.title', 200),
    context: string(source.context, 'meetingDraft.context', 10_000, true),
    meetingDate: isoDate(source.meetingDate, 'meetingDraft.meetingDate'),
    minutesResponsibleUserId: uuid(source.minutesResponsibleUserId, 'meetingDraft.minutesResponsibleUserId'),
    participantUserIds,
    previousSessionId: nullableUuid(source.previousSessionId, 'meetingDraft.previousSessionId'),
    agendaItems,
  };
}

export function buildPresentationMeetingFollowUp(input: {
  detail: PresentationMeetingDetail;
  dueWindowEnd: string | null;
  today: string;
}): PresentationMeetingFollowUp {
  const today = isoDate(input.today, 'followUp.today');
  const dueWindowEnd = input.dueWindowEnd === null ? null : isoDate(input.dueWindowEnd, 'followUp.dueWindowEnd');
  if (dueWindowEnd !== null && dueWindowEnd < today) {
    return fail('INVALID_PERIOD', 'followUp.dueWindowEnd', 'O fim da janela não pode anteceder hoje.');
  }
  const decisions = input.detail.canonicalReferences.filter(item => item.entityType === 'DECISION');
  const actions = input.detail.canonicalReferences.filter(item => item.entityType === 'ACTION');
  const activeActions = actions.filter(item => item.status === 'PENDING' || item.status === 'IN_PROGRESS');
  const decisionStatuses: PresentationDecisionStatus[] = ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  const actionStatuses: PresentationActionStatus[] = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'];
  const snapshotByKey = new Map<string, PresentationMeetingSnapshotReference>();
  input.detail.session.snapshot?.decisions.forEach(item => snapshotByKey.set(`DECISION:${item.id}`, item));
  input.detail.session.snapshot?.actions.forEach(item => snapshotByKey.set(`ACTION:${item.id}`, item));
  const startedAt = input.detail.session.startedAt ? Date.parse(input.detail.session.startedAt) : Number.POSITIVE_INFINITY;
  const submittedAt = input.detail.session.submittedAt ? Date.parse(input.detail.session.submittedAt) : Date.now();
  return {
    comparisonState: input.detail.session.previousSessionId ? 'available' : 'no-previous-session',
    dueWindowEnd,
    decisionsByStatus: Object.fromEntries(decisionStatuses.map(status => [
      status,
      decisions.filter(item => item.status === status).length,
    ])) as Record<PresentationDecisionStatus, number>,
    actionsByStatus: Object.fromEntries(actionStatuses.map(status => [
      status,
      actions.filter(item => item.status === status).length,
    ])) as Record<PresentationActionStatus, number>,
    overdueActions: activeActions.filter(item => item.dueDate !== null && item.dueDate < today),
    dueSoonActions: dueWindowEnd === null
      ? []
      : activeActions.filter(item => item.dueDate !== null && item.dueDate >= today && item.dueDate <= dueWindowEnd),
    noDueDateActions: activeActions.filter(item => item.dueDate === null),
    noPriorityActions: activeActions.filter(item => item.priority === null),
    createdDuringMeeting: input.detail.canonicalReferences.filter(item => {
      const createdAt = Date.parse(item.createdAt);
      return createdAt >= startedAt && createdAt <= submittedAt;
    }),
    changedSinceSnapshot: input.detail.canonicalReferences.filter(item => {
      const snapshot = snapshotByKey.get(`${item.entityType}:${item.id}`);
      return Boolean(snapshot && (snapshot.version !== item.version || snapshot.status !== item.status));
    }),
    unresolvedAgendaItems: input.detail.agendaItems.filter(item => item.reviewState !== 'CONCLUDED' && item.reviewState !== 'CANCELLED'),
  };
}

export function isValidPresentationMeetingTransition(
  current: PresentationMeetingStatus,
  target: PresentationMeetingStatus,
): boolean {
  if (current === 'DRAFT') return target === 'IN_PROGRESS' || target === 'CANCELLED';
  if (current === 'IN_PROGRESS') return target === 'IN_REVIEW' || target === 'CANCELLED';
  if (current === 'IN_REVIEW') return target === 'APPROVED' || target === 'IN_PROGRESS' || target === 'CANCELLED';
  if (current === 'APPROVED') return target === 'IN_PROGRESS' || target === 'CANCELLED';
  if (current === 'CANCELLED') return target === 'DRAFT' || target === 'IN_PROGRESS';
  return false;
}

export function parsePresentationMeetingTransition(value: unknown): PresentationMeetingTransition {
  const source = record(value, 'meetingTransition');
  if (source.contractVersion !== PRESENTATION_MEETING_API_VERSION) {
    return fail('UNKNOWN_VERSION', 'meetingTransition.contractVersion', 'Contrato da transição incompatível.');
  }
  const expectedStatus = meetingStatus(source.expectedStatus, 'meetingTransition.expectedStatus');
  const targetStatus = meetingStatus(source.targetStatus, 'meetingTransition.targetStatus');
  if (!isValidPresentationMeetingTransition(expectedStatus, targetStatus)) {
    return fail('TRANSITION_INVALID', 'meetingTransition.targetStatus', 'Transição de sessão impossível.');
  }
  const justification = source.justification === null || source.justification === undefined
    ? null
    : string(source.justification, 'meetingTransition.justification', 4000, true);
  const requiresJustification = targetStatus === 'APPROVED'
    || targetStatus === 'CANCELLED'
    || expectedStatus === 'APPROVED'
    || expectedStatus === 'CANCELLED'
    || (expectedStatus === 'IN_REVIEW' && targetStatus === 'IN_PROGRESS');
  if (requiresJustification && !justification?.trim()) {
    return fail('JUSTIFICATION_REQUIRED', 'meetingTransition.justification', 'A transição exige justificativa explícita.');
  }
  return {
    contractVersion: PRESENTATION_MEETING_API_VERSION,
    sessionId: uuid(source.sessionId, 'meetingTransition.sessionId'),
    expectedStatus,
    targetStatus,
    justification: justification?.trim() || null,
    expectedUpdatedAt: timestamp(source.expectedUpdatedAt, 'meetingTransition.expectedUpdatedAt'),
  };
}

function comparableRevisionValue(content: PresentationMinutesRevisionContent): Record<string, string | number | boolean | null> {
  const result: Record<string, string | number | boolean | null> = {
    title: content.session.title,
    context: content.session.context,
    meetingDate: content.session.meetingDate,
    minutesResponsible: content.session.minutesResponsibleName,
    participantCount: content.participants.length,
    agendaItemCount: content.agendaItems.length,
  };
  content.participants.forEach((participant, index) => {
    const identity = participant.userId
      ?? participant.emailSnapshot
      ?? `${participant.nameSnapshot}:${index}`;
    result[`participant:${identity}`] = participant.nameSnapshot;
  });
  content.agendaItems.forEach(item => {
    const prefix = `agenda:${item.id}`;
    result[`${prefix}:position`] = item.position;
    result[`${prefix}:title`] = item.title;
    result[`${prefix}:objective`] = item.objective;
    result[`${prefix}:discussionNotes`] = item.discussionNotes;
    result[`${prefix}:conclusion`] = item.conclusion;
    result[`${prefix}:reviewState`] = item.reviewState;
    result[`${prefix}:referenceVersion`] = item.referenceVersion;
    result[`${prefix}:referenceStatus`] = item.referenceStatus;
  });
  return result;
}

export function comparePresentationMeetingRevisions(input: {
  previousSessionId: string | null;
  previous: PresentationMinutesRevision | null;
  current: PresentationMinutesRevision | null;
}): PresentationMeetingComparison {
  if (!input.previousSessionId || !input.previous) return { state: 'no-previous-session' };
  if (!input.current) return { state: 'incompatible-period' };
  const previousPeriod = input.previous.content.session.period;
  const currentPeriod = input.current.content.session.period;
  if (
    input.previous.content.session.granularity !== input.current.content.session.granularity
    || input.previous.content.snapshot.filters.comparisonMode
      !== input.current.content.snapshot.filters.comparisonMode
    || previousPeriod.start > currentPeriod.start
    || previousPeriod.endExclusive > currentPeriod.endExclusive
  ) {
    return { state: 'incompatible-period' };
  }
  const before = comparableRevisionValue(input.previous.content);
  const after = comparableRevisionValue(input.current.content);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return {
    state: 'available',
    previousSessionId: input.previousSessionId,
    previousRevisionNumber: input.previous.revisionNumber,
    currentRevisionNumber: input.current.revisionNumber,
    differences: keys
      .filter(key => before[key] !== after[key])
      .map(key => ({ path: key, before: before[key] ?? null, after: after[key] ?? null })),
  };
}

function parseFollowUp(value: unknown): PresentationMeetingFollowUp {
  const source = record(value, 'minutesExport.followUp');
  const parseCounts = <T extends string>(
    input: unknown,
    path: string,
    statuses: readonly T[],
  ): Record<T, number> => {
    const counts = record(input, path);
    return Object.fromEntries(statuses.map(status => [
      status,
      integer(counts[status], `${path}.${status}`),
    ])) as Record<T, number>;
  };
  const referenceList = (input: unknown, path: string) => array(input, path, 600)
    .map((item, index) => parseCanonicalReference(item, `${path}[${index}]`));
  const comparisonState = source.comparisonState;
  if (comparisonState !== 'available' && comparisonState !== 'no-previous-session' && comparisonState !== 'incompatible-period') {
    return fail('UNKNOWN_ENUM', 'minutesExport.followUp.comparisonState', 'Estado da comparação inválido.');
  }
  const unresolvedAgendaItems = array(source.unresolvedAgendaItems, 'minutesExport.followUp.unresolvedAgendaItems', PRESENTATION_MEETING_MAX_AGENDA_ITEMS)
    .map((item, index) => parseAgendaItem(item, `minutesExport.followUp.unresolvedAgendaItems[${index}]`));
  validateAgendaPositions(unresolvedAgendaItems);
  return {
    comparisonState,
    dueWindowEnd: nullableDate(source.dueWindowEnd, 'minutesExport.followUp.dueWindowEnd'),
    decisionsByStatus: parseCounts(source.decisionsByStatus, 'minutesExport.followUp.decisionsByStatus', ['DRAFT', 'APPROVED', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    actionsByStatus: parseCounts(source.actionsByStatus, 'minutesExport.followUp.actionsByStatus', ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED']),
    overdueActions: referenceList(source.overdueActions, 'minutesExport.followUp.overdueActions'),
    dueSoonActions: referenceList(source.dueSoonActions, 'minutesExport.followUp.dueSoonActions'),
    noDueDateActions: referenceList(source.noDueDateActions, 'minutesExport.followUp.noDueDateActions'),
    noPriorityActions: referenceList(source.noPriorityActions, 'minutesExport.followUp.noPriorityActions'),
    createdDuringMeeting: referenceList(source.createdDuringMeeting, 'minutesExport.followUp.createdDuringMeeting'),
    changedSinceSnapshot: referenceList(source.changedSinceSnapshot, 'minutesExport.followUp.changedSinceSnapshot'),
    unresolvedAgendaItems,
  };
}

function parseComparison(value: unknown): PresentationMeetingComparison {
  const source = record(value, 'minutesExport.comparison');
  if (source.state === 'no-previous-session') return { state: 'no-previous-session' };
  if (source.state === 'incompatible-period') return { state: 'incompatible-period' };
  if (source.state !== 'available') {
    return fail('UNKNOWN_ENUM', 'minutesExport.comparison.state', 'Estado da comparação inválido.');
  }
  const differences = array(source.differences, 'minutesExport.comparison.differences', 10_000)
    .map((item, index): PresentationMeetingRevisionDifference => {
      const difference = record(item, `minutesExport.comparison.differences[${index}]`);
      const scalar = (input: unknown, path: string): string | number | boolean | null => {
        if (input === null) return null;
        if (typeof input === 'string') return input;
        if (typeof input === 'boolean') return input;
        if (typeof input === 'number' && Number.isFinite(input)) return input;
        return fail('MALFORMED_PAYLOAD', path, 'Diferença factual inválida.');
      };
      return {
        path: string(difference.path, `minutesExport.comparison.differences[${index}].path`, 500),
        before: scalar(difference.before, `minutesExport.comparison.differences[${index}].before`),
        after: scalar(difference.after, `minutesExport.comparison.differences[${index}].after`),
      };
    });
  return {
    state: 'available',
    previousSessionId: uuid(source.previousSessionId, 'minutesExport.comparison.previousSessionId'),
    previousRevisionNumber: integer(source.previousRevisionNumber, 'minutesExport.comparison.previousRevisionNumber', 1),
    currentRevisionNumber: integer(source.currentRevisionNumber, 'minutesExport.comparison.currentRevisionNumber', 1),
    differences,
  };
}

export function parsePresentationMinutesExport(value: unknown): PresentationMinutesExport {
  const source = record(value, 'minutesExport');
  if (source.contractVersion !== PRESENTATION_MINUTES_EXPORT_VERSION) {
    return fail('UNKNOWN_VERSION', 'minutesExport.contractVersion', 'Contrato da exportação incompatível.');
  }
  const detail = parsePresentationMeetingDetail(source.detail);
  const revision = source.revision === null ? null : parseRevision(source.revision, 'minutesExport.revision');
  return {
    contractVersion: PRESENTATION_MINUTES_EXPORT_VERSION,
    detail,
    revision,
    followUp: parseFollowUp(source.followUp),
    comparison: parseComparison(source.comparison),
    exportedAt: timestamp(source.exportedAt, 'minutesExport.exportedAt'),
    draftWatermark: boolean(source.draftWatermark, 'minutesExport.draftWatermark'),
  };
}

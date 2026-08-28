import {
  addCalendarDays,
  defaultPresentationHistoryYears,
  normalizePresentationPeriod,
  normalizePresentationHistoryYears,
  presentationRevenueMonthFromPeriod,
  type AvailablePeriodBounds,
  type NormalizedPresentationPeriod,
  type PresentationComparisonMode,
  type PresentationPeriodFilter,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { createPresentationFilterDraft } from '@/lib/presentationFilters';

export const PRESENTATION_BASE_PATH = '/financeiro/apresentacao-socios';

export const PRESENTATION_DETAIL_TARGETS = [
  'revenue',
  'expense',
  'expenses',
  'result',
  'margin',
  'cmv',
  'payables',
  'receivables',
  'ranking-revenue',
  'ranking-expense',
] as const;

export type PresentationDetailTarget = typeof PRESENTATION_DETAIL_TARGETS[number];

export type PresentationReturnAnchor =
  | 'executive-summary'
  | 'plan'
  | 'financial-tree'
  | 'open-items'
  | 'rankings';

export interface PresentationNavigationContext {
  filter: PresentationPeriodFilter;
  granularity: TimeSeriesGranularity;
  rankingLimit: number;
  comparisonMode: PresentationComparisonMode;
  historyYears: readonly number[];
  availableBounds?: AvailablePeriodBounds;
}

export interface PresentationDetailLocation {
  target: PresentationDetailTarget;
  categoryId?: string;
  returnAnchor: PresentationReturnAnchor;
}

export interface PresentationDecisionUrlState {
  decisionId?: string;
  status?: 'DRAFT' | 'APPROVED' | 'IN_PROGRESS' | 'COMPLETED' | 'CANCELLED';
  responsibleUserId?: string;
  dueFilter: 'all' | 'overdue' | 'upcoming' | 'no-deadline';
  search: string;
  page: number;
}

export interface PresentationMeetingUrlState {
  sessionId?: string;
  agendaItemId?: string;
  revisionId?: string;
  status?: 'DRAFT' | 'IN_PROGRESS' | 'IN_REVIEW' | 'APPROVED' | 'CANCELLED';
  responsibleUserId?: string;
  participantUserId?: string;
  followUpFilter: 'all' | 'overdue' | 'due-soon' | 'no-due-date' | 'no-priority' | 'changed';
  followUpDueEnd?: string;
  search: string;
  page: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const YEAR_MONTH_PATTERN = /^\d{4}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isGranularity(value: string | null): value is TimeSeriesGranularity {
  return value === 'day' || value === 'month' || value === 'year';
}

function readRankingLimit(value: string | null): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 1 && parsed <= 50 ? parsed : 10;
}

function isIsoDate(value: string | null): value is string {
  if (value === null || !ISO_DATE_PATTERN.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return parsed.getUTCFullYear() === year
    && parsed.getUTCMonth() === month - 1
    && parsed.getUTCDate() === day;
}

function isYearMonth(value: string | null): value is string {
  return value !== null && YEAR_MONTH_PATTERN.test(value);
}

function fallbackContext(today: string): PresentationNavigationContext {
  const draft = createPresentationFilterDraft(today);
  return {
    filter: { kind: 'month', month: draft.month },
    granularity: 'month',
    rankingLimit: 10,
    comparisonMode: 'actual',
    historyYears: defaultPresentationHistoryYears(draft.month),
  };
}

function readHistoryYears(params: URLSearchParams, fallback: readonly number[]): number[] {
  const serialized = params.get('years');
  if (!serialized) return [...fallback];
  try {
    const values = serialized.split(',').map(value => Number(value));
    return normalizePresentationHistoryYears(values);
  } catch {
    return [...fallback];
  }
}

function readFilter(params: URLSearchParams, today: string): PresentationPeriodFilter {
  const fallback = fallbackContext(today).filter;
  const kind = params.get('period');

  try {
    if (kind === 'month' && isYearMonth(params.get('month'))) {
      return { kind, month: params.get('month') as string };
    }
    if (
      kind === 'month-range'
      && isYearMonth(params.get('startMonth'))
      && isYearMonth(params.get('endMonth'))
    ) {
      return {
        kind,
        startMonth: params.get('startMonth') as string,
        endMonth: params.get('endMonth') as string,
      };
    }
    if (kind === 'year') {
      const year = Number(params.get('year'));
      if (Number.isInteger(year) && year >= 1 && year <= 9999) return { kind, year };
    }
    if (kind === 'year-to-date' && isIsoDate(params.get('through'))) {
      const year = Number(params.get('year'));
      if (Number.isInteger(year) && year >= 1 && year <= 9999) {
        return { kind, year, through: params.get('through') as string };
      }
    }
    if (kind === 'custom' && isIsoDate(params.get('from')) && isIsoDate(params.get('to'))) {
      const endExclusive = params.get('to') as string;
      return {
        kind,
        start: params.get('from') as string,
        endInclusive: addCalendarDays(endExclusive, -1),
      };
    }
    if (kind === 'all-time') return { kind };
  } catch {
    return fallback;
  }

  return fallback;
}

function readBounds(params: URLSearchParams): AvailablePeriodBounds | undefined {
  const from = params.get('from');
  const endExclusive = params.get('to');
  if (!isIsoDate(from) || !isIsoDate(endExclusive)) return undefined;
  try {
    const maxDate = addCalendarDays(endExclusive, -1);
    return from <= maxDate ? { minDate: from, maxDate } : undefined;
  } catch {
    return undefined;
  }
}

export function readPresentationNavigationContext(
  params: URLSearchParams,
  today: string,
): PresentationNavigationContext {
  const fallback = fallbackContext(today);
  const filter = readFilter(params, today);
  const availableBounds = filter.kind === 'all-time' ? readBounds(params) : undefined;

  try {
    const period = normalizePresentationPeriod(filter, { availableBounds });
    const revenueMonth = presentationRevenueMonthFromPeriod(period);
    const historyYears = readHistoryYears(params, defaultPresentationHistoryYears(revenueMonth));
    return {
      filter,
      granularity: isGranularity(params.get('granularity'))
        ? params.get('granularity') as TimeSeriesGranularity
        : fallback.granularity,
      rankingLimit: readRankingLimit(params.get('rankingLimit')),
      comparisonMode: params.get('mode') === 'budget' || params.get('mode') === 'projection'
        ? params.get('mode') as PresentationComparisonMode
        : 'actual',
      historyYears,
      availableBounds,
    };
  } catch {
    return fallback;
  }
}

function writeFilter(params: URLSearchParams, filter: PresentationPeriodFilter): void {
  params.set('period', filter.kind);
  if (filter.kind === 'month') params.set('month', filter.month);
  if (filter.kind === 'month-range') {
    params.set('startMonth', filter.startMonth);
    params.set('endMonth', filter.endMonth);
  }
  if (filter.kind === 'year') params.set('year', String(filter.year));
  if (filter.kind === 'year-to-date') {
    params.set('year', String(filter.year));
    params.set('through', filter.through);
  }
}

export function buildPresentationSearchParams(
  context: Omit<PresentationNavigationContext, 'availableBounds'>,
  period: NormalizedPresentationPeriod,
  detail?: Pick<PresentationDetailLocation, 'categoryId' | 'returnAnchor'>,
): URLSearchParams {
  const params = new URLSearchParams();
  writeFilter(params, context.filter);
  params.set('from', period.start);
  params.set('to', period.endExclusive);
  params.set('granularity', context.granularity);
  params.set('rankingLimit', String(context.rankingLimit));
  params.set('mode', context.comparisonMode);
  params.set('years', normalizePresentationHistoryYears(context.historyYears).join(','));
  if (detail?.categoryId && UUID_PATTERN.test(detail.categoryId)) {
    params.set('category', detail.categoryId);
  }
  if (detail?.returnAnchor) params.set('returnTo', detail.returnAnchor);
  return params;
}

export function isPresentationDetailTarget(value: string | undefined): value is PresentationDetailTarget {
  return PRESENTATION_DETAIL_TARGETS.some(target => target === value);
}

export function readPresentationCategoryId(params: URLSearchParams): string | undefined {
  const categoryId = params.get('category');
  return categoryId && UUID_PATTERN.test(categoryId) ? categoryId : undefined;
}

export function readPresentationReturnAnchor(params: URLSearchParams): PresentationReturnAnchor | undefined {
  const value = params.get('returnTo');
  return value === 'executive-summary'
    || value === 'plan'
    || value === 'financial-tree'
    || value === 'open-items'
    || value === 'rankings'
    ? value
    : undefined;
}

export function readPresentationDecisionUrlState(params: URLSearchParams): PresentationDecisionUrlState {
  const decisionId = params.get('decision');
  const responsibleUserId = params.get('decisionResponsible');
  const status = params.get('decisionStatus');
  const dueFilter = params.get('decisionDue');
  const page = Number(params.get('decisionPage'));
  const search = params.get('decisionSearch') ?? '';
  return {
    decisionId: decisionId && UUID_PATTERN.test(decisionId) ? decisionId : undefined,
    responsibleUserId: responsibleUserId && UUID_PATTERN.test(responsibleUserId)
      ? responsibleUserId
      : undefined,
    status: status === 'DRAFT'
      || status === 'APPROVED'
      || status === 'IN_PROGRESS'
      || status === 'COMPLETED'
      || status === 'CANCELLED'
      ? status
      : undefined,
    dueFilter: dueFilter === 'overdue' || dueFilter === 'upcoming' || dueFilter === 'no-deadline'
      ? dueFilter
      : 'all',
    search: search.slice(0, 100),
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

export function writePresentationDecisionUrlState(
  params: URLSearchParams,
  state: PresentationDecisionUrlState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const setOrDelete = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  setOrDelete('decision', state.decisionId && UUID_PATTERN.test(state.decisionId) ? state.decisionId : undefined);
  setOrDelete('decisionStatus', state.status);
  setOrDelete(
    'decisionResponsible',
    state.responsibleUserId && UUID_PATTERN.test(state.responsibleUserId) ? state.responsibleUserId : undefined,
  );
  setOrDelete('decisionDue', state.dueFilter === 'all' ? undefined : state.dueFilter);
  setOrDelete('decisionSearch', state.search.trim() ? state.search.slice(0, 100) : undefined);
  setOrDelete('decisionPage', state.page > 1 ? String(state.page) : undefined);
  return next;
}

export function readPresentationMeetingUrlState(params: URLSearchParams): PresentationMeetingUrlState {
  const sessionId = params.get('session');
  const agendaItemId = params.get('agendaItem');
  const revisionId = params.get('revision');
  const responsibleUserId = params.get('sessionResponsible');
  const participantUserId = params.get('sessionParticipant');
  const status = params.get('sessionStatus');
  const followUpFilter = params.get('followUp');
  const followUpDueEnd = params.get('followUpDueEnd');
  const page = Number(params.get('sessionPage'));
  return {
    sessionId: sessionId && UUID_PATTERN.test(sessionId) ? sessionId : undefined,
    agendaItemId: agendaItemId && UUID_PATTERN.test(agendaItemId) ? agendaItemId : undefined,
    revisionId: revisionId && UUID_PATTERN.test(revisionId) ? revisionId : undefined,
    responsibleUserId: responsibleUserId && UUID_PATTERN.test(responsibleUserId) ? responsibleUserId : undefined,
    participantUserId: participantUserId && UUID_PATTERN.test(participantUserId) ? participantUserId : undefined,
    status: status === 'DRAFT'
      || status === 'IN_PROGRESS'
      || status === 'IN_REVIEW'
      || status === 'APPROVED'
      || status === 'CANCELLED'
      ? status
      : undefined,
    followUpFilter: followUpFilter === 'overdue'
      || followUpFilter === 'due-soon'
      || followUpFilter === 'no-due-date'
      || followUpFilter === 'no-priority'
      || followUpFilter === 'changed'
      ? followUpFilter
      : 'all',
    followUpDueEnd: isIsoDate(followUpDueEnd) ? followUpDueEnd : undefined,
    search: (params.get('sessionSearch') ?? '').slice(0, 100),
    page: Number.isInteger(page) && page >= 1 && page <= 10000 ? page : 1,
  };
}

export function writePresentationMeetingUrlState(
  params: URLSearchParams,
  state: PresentationMeetingUrlState,
): URLSearchParams {
  const next = new URLSearchParams(params);
  const setOrDelete = (key: string, value: string | undefined) => {
    if (value) next.set(key, value);
    else next.delete(key);
  };
  setOrDelete('session', state.sessionId && UUID_PATTERN.test(state.sessionId) ? state.sessionId : undefined);
  setOrDelete('agendaItem', state.agendaItemId && UUID_PATTERN.test(state.agendaItemId) ? state.agendaItemId : undefined);
  setOrDelete('revision', state.revisionId && UUID_PATTERN.test(state.revisionId) ? state.revisionId : undefined);
  setOrDelete('sessionStatus', state.status);
  setOrDelete('sessionResponsible', state.responsibleUserId && UUID_PATTERN.test(state.responsibleUserId) ? state.responsibleUserId : undefined);
  setOrDelete('sessionParticipant', state.participantUserId && UUID_PATTERN.test(state.participantUserId) ? state.participantUserId : undefined);
  setOrDelete('followUp', state.followUpFilter === 'all' ? undefined : state.followUpFilter);
  setOrDelete('followUpDueEnd', state.followUpDueEnd && isIsoDate(state.followUpDueEnd) ? state.followUpDueEnd : undefined);
  setOrDelete('sessionSearch', state.search.trim() ? state.search.slice(0, 100) : undefined);
  setOrDelete('sessionPage', state.page > 1 ? String(state.page) : undefined);
  return next;
}

export function copyPresentationDecisionParams(source: URLSearchParams, target: URLSearchParams): URLSearchParams {
  const withDecision = writePresentationDecisionUrlState(target, readPresentationDecisionUrlState(source));
  return writePresentationMeetingUrlState(withDecision, readPresentationMeetingUrlState(source));
}

export function buildPresentationDetailPath(
  target: PresentationDetailTarget,
  params: URLSearchParams,
): string {
  return `${PRESENTATION_BASE_PATH}/${target}?${params.toString()}`;
}

export function buildPresentationDashboardPath(params: URLSearchParams): string {
  return `${PRESENTATION_BASE_PATH}?${params.toString()}`;
}

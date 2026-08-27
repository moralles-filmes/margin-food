import type { NormalizedDateRange, TimeSeriesGranularity } from './contracts';
import {
  PRESENTATION_SCENARIO_FORMULA_VERSION,
  parsePresentationScenarioDraft,
  parsePresentationScenarioResult,
  type PresentationScenarioDraft,
  type PresentationScenarioResult,
} from './scenario';
import type {
  PresentationComparisonMode,
  PresentationPlanData,
  PresentationPlanMetricSet,
} from './plan';

export const PRESENTATION_DECISION_SNAPSHOT_VERSION = 'presentation-decision-snapshot-v1.0' as const;
export const PRESENTATION_DECISION_API_VERSION = 'presentation-decision-governance-v1.0' as const;
export const PRESENTATION_PLAN_FORMULA_VERSION = 'presentation-plan-v1.0' as const;
export const PRESENTATION_MANAGERIAL_METRIC_VERSION = 'managerial-result-v1.0' as const;
export const PRESENTATION_DECISION_MAX_SNAPSHOT_BYTES = 262_144;
export const PRESENTATION_DECISION_MAX_ACTIONS = 100;
export const PRESENTATION_DECISION_MAX_REVISIONS = 50;

export const PRESENTATION_DECISION_STATUSES = [
  'DRAFT',
  'APPROVED',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export const PRESENTATION_ACTION_STATUSES = [
  'PENDING',
  'IN_PROGRESS',
  'COMPLETED',
  'CANCELLED',
] as const;
export const PRESENTATION_ACTION_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const;

export type PresentationDecisionStatus = typeof PRESENTATION_DECISION_STATUSES[number];
export type PresentationActionStatus = typeof PRESENTATION_ACTION_STATUSES[number];
export type PresentationActionPriority = typeof PRESENTATION_ACTION_PRIORITIES[number];
export type PresentationDecisionReferenceType = 'BASE' | 'SCENARIO';
export type PresentationDecisionSourceMode = PresentationComparisonMode | 'scenario';

export interface PresentationDecisionAssumption {
  id: string;
  label: string;
  target: string;
  adjustmentMode: string;
  exactValue: string;
  calculatedInputValue: number;
  resultImpact: number;
}

export interface PresentationDecisionSnapshot {
  contractVersion: typeof PRESENTATION_DECISION_SNAPSHOT_VERSION;
  referenceType: PresentationDecisionReferenceType;
  sourceMode: PresentationDecisionSourceMode;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  capturedAt: string;
  cutoffDate: string;
  formulaVersion: typeof PRESENTATION_PLAN_FORMULA_VERSION | typeof PRESENTATION_SCENARIO_FORMULA_VERSION;
  metricFormulaVersion: typeof PRESENTATION_MANAGERIAL_METRIC_VERSION;
  sources: Record<string, string>;
  rules: Record<string, unknown>;
  metrics: PresentationPlanMetricSet;
  assumptions: readonly PresentationDecisionAssumption[];
  scenarioResult?: PresentationScenarioResult;
  scenarioDraft?: PresentationScenarioDraft;
}

export interface PresentationDecisionActionCounts {
  pending: number;
  inProgress: number;
  completed: number;
  cancelled: number;
  overdue: number;
}

export interface PresentationDecisionSummary {
  id: string;
  title: string;
  status: PresentationDecisionStatus;
  referenceType: PresentationDecisionReferenceType;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  executiveResponsibleUserId: string | null;
  executiveResponsibleName: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  version: number;
  actionCounts: PresentationDecisionActionCounts;
}

export interface PresentationDecision extends Omit<PresentationDecisionSummary, 'actionCounts'> {
  context: string;
  currentRevisionId: string;
  everApproved: boolean;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  latestJustification: string | null;
  updatedBy: string | null;
  updatedByName: string;
}

export interface PresentationDecisionRevision {
  id: string;
  revisionNumber: number;
  referenceType: PresentationDecisionReferenceType;
  snapshot: PresentationDecisionSnapshot;
  revisionReason: string;
  approvedBy: string | null;
  approvedByName: string | null;
  approvedAt: string | null;
  createdBy: string | null;
  createdByName: string;
  createdAt: string;
}

export interface PresentationDecisionAction {
  id: string;
  decisionId: string;
  description: string;
  responsibleUserId: string | null;
  responsibleName: string;
  dueDate: string | null;
  priority: PresentationActionPriority | null;
  status: PresentationActionStatus;
  outcomeNote: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  version: number;
  createdBy: string | null;
  createdByName: string;
  updatedBy: string | null;
  updatedByName: string;
  createdAt: string;
  updatedAt: string;
}

export interface PresentationDecisionTimelineEvent {
  id: string;
  eventType: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  justification: string | null;
  actorUserId: string | null;
  actorName: string;
  createdAt: string;
}

export interface PresentationDecisionDetail {
  contractVersion: typeof PRESENTATION_DECISION_API_VERSION;
  decision: PresentationDecision;
  revisions: readonly PresentationDecisionRevision[];
  actions: readonly PresentationDecisionAction[];
  timeline: readonly PresentationDecisionTimelineEvent[];
  fetchedAt: string;
}

export interface PresentationDecisionListPage {
  contractVersion: typeof PRESENTATION_DECISION_API_VERSION;
  items: readonly PresentationDecisionSummary[];
  page: number;
  pageSize: number;
  totalCount: number;
  hasMore: boolean;
  fetchedAt: string;
}

export interface PresentationResponsibleProfile {
  id: string;
  nome: string;
  email: string;
  avatarUrl: string | null;
}

export interface PresentationDecisionActionDraft {
  description: string;
  responsibleUserId: string;
  dueDate: string | null;
  priority: PresentationActionPriority | null;
}

export type PresentationDecisionTransition =
  | {
      contractVersion: typeof PRESENTATION_DECISION_API_VERSION;
      entity: 'decision';
      entityId: string;
      expectedStatus: PresentationDecisionStatus;
      targetStatus: PresentationDecisionStatus;
      justification: string;
      expectedUpdatedAt: string;
    }
  | {
      contractVersion: typeof PRESENTATION_DECISION_API_VERSION;
      entity: 'action';
      entityId: string;
      expectedStatus: PresentationActionStatus;
      targetStatus: PresentationActionStatus;
      justification: string | null;
      expectedUpdatedAt: string;
    };

export type PresentationDecisionComparisonMetricKey =
  | 'revenue'
  | 'expense'
  | 'result'
  | 'marginPercent'
  | 'cmv';

export interface PresentationDecisionComparisonMetric {
  key: PresentationDecisionComparisonMetricKey;
  snapshot: number | null;
  current: number | null;
  absoluteChange: number | null;
  percentChange: number | null;
  favorability: 'favorable' | 'unfavorable' | 'neutral' | 'unavailable';
}

export type PresentationDecisionComparison =
  | {
      state: 'available';
      snapshotCapturedAt: string;
      currentGeneratedAt: string;
      metrics: readonly PresentationDecisionComparisonMetric[];
    }
  | {
      state: 'unavailable';
      reason: 'period-incompatible' | 'formula-incompatible' | 'source-incompatible' | 'current-data-unavailable';
    };

export class PresentationDecisionValidationError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = 'PresentationDecisionValidationError';
    this.code = code;
    this.path = path;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function fail(code: string, path: string, message: string): never {
  throw new PresentationDecisionValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (!isRecord(value)) return fail('MALFORMED_PAYLOAD', path, `${path} deve ser um objeto.`);
  return value;
}

function readArray(value: unknown, path: string, maximum: number): readonly unknown[] {
  if (!Array.isArray(value)) return fail('MALFORMED_PAYLOAD', path, `${path} deve ser uma lista.`);
  if (value.length > maximum) return fail('PAYLOAD_TOO_LARGE', path, `${path} excede o limite.`);
  return value;
}

function readString(value: unknown, path: string, maximum: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > maximum || (!allowEmpty && value.trim().length === 0)) {
    return fail('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  }
  return value;
}

function readNullableString(value: unknown, path: string, maximum: number): string | null {
  return value === null ? null : readString(value, path, maximum);
}

function readUuid(value: unknown, path: string): string {
  const uuid = readString(value, path, 36);
  if (!UUID_PATTERN.test(uuid)) return fail('INVALID_UUID', path, `${path} inválido.`);
  return uuid;
}

function readNullableUuid(value: unknown, path: string): string | null {
  return value === null ? null : readUuid(value, path);
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return fail('NON_FINITE_NUMBER', path, `${path} deve ser um número finito.`);
  }
  return value;
}

function readNullableNumber(value: unknown, path: string): number | null {
  return value === null ? null : readFiniteNumber(value, path);
}

function readInteger(value: unknown, path: string, minimum = 0): number {
  const number = readFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < minimum) return fail('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  return number;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  return value;
}

function readTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path, 64);
  if (!Number.isFinite(Date.parse(timestamp))) return fail('INVALID_DATE', path, `${path} inválido.`);
  return timestamp;
}

function readNullableTimestamp(value: unknown, path: string): string | null {
  return value === null ? null : readTimestamp(value, path);
}

function readIsoDate(value: unknown, path: string): string {
  const date = readString(value, path, 10);
  if (!ISO_DATE_PATTERN.test(date)) return fail('INVALID_DATE', path, `${path} inválida.`);
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) {
    return fail('INVALID_DATE', path, `${path} inválida.`);
  }
  return date;
}

function readNullableDate(value: unknown, path: string): string | null {
  return value === null ? null : readIsoDate(value, path);
}

function readGranularity(value: unknown, path: string): TimeSeriesGranularity {
  if (value !== 'day' && value !== 'month' && value !== 'year') {
    return fail('UNKNOWN_ENUM', path, `${path} inválida.`);
  }
  return value;
}

function readReferenceType(value: unknown, path: string): PresentationDecisionReferenceType {
  if (value !== 'BASE' && value !== 'SCENARIO') return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  return value;
}

function readDecisionStatus(value: unknown, path: string): PresentationDecisionStatus {
  if (!PRESENTATION_DECISION_STATUSES.includes(value as PresentationDecisionStatus)) {
    return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  }
  return value as PresentationDecisionStatus;
}

function readActionStatus(value: unknown, path: string): PresentationActionStatus {
  if (!PRESENTATION_ACTION_STATUSES.includes(value as PresentationActionStatus)) {
    return fail('UNKNOWN_ENUM', path, `${path} inválido.`);
  }
  return value as PresentationActionStatus;
}

function readPriority(value: unknown, path: string): PresentationActionPriority | null {
  if (value === null) return null;
  if (!PRESENTATION_ACTION_PRIORITIES.includes(value as PresentationActionPriority)) {
    return fail('UNKNOWN_ENUM', path, `${path} inválida.`);
  }
  return value as PresentationActionPriority;
}

function readRange(value: unknown, path: string): NormalizedDateRange {
  const range = readRecord(value, path);
  const parsed = {
    start: readIsoDate(range.start, `${path}.start`),
    endExclusive: readIsoDate(range.endExclusive, `${path}.endExclusive`),
  };
  if (parsed.start >= parsed.endExclusive) return fail('INVALID_PERIOD', path, 'Período inválido.');
  return parsed;
}

function readMetricSet(value: unknown, path: string): PresentationPlanMetricSet {
  const metrics = readRecord(value, path);
  const parsed = {
    revenue: readNullableNumber(metrics.revenue, `${path}.revenue`),
    expense: readNullableNumber(metrics.expense, `${path}.expense`),
    result: readNullableNumber(metrics.result, `${path}.result`),
    marginPercent: readNullableNumber(metrics.marginPercent, `${path}.marginPercent`),
    cmv: readNullableNumber(metrics.cmv, `${path}.cmv`),
    cmvPercent: readNullableNumber(metrics.cmvPercent, `${path}.cmvPercent`),
  };
  if (parsed.revenue === 0 && (parsed.marginPercent !== null || parsed.cmvPercent !== null)) {
    return fail('METRIC_INCOMPATIBLE', path, 'Receita zero exige percentuais indisponíveis.');
  }
  return parsed;
}

function snapshotByteLength(value: unknown): number {
  return new TextEncoder().encode(JSON.stringify(value)).length;
}

function exactValueForLever(draft: PresentationScenarioDraft, leverId: string): string {
  if (leverId === 'revenue-total') return draft.totalRevenue.value;
  if (leverId === 'expense-total') return draft.totalExpense.value;
  if (leverId === 'cmv-money') return draft.cmvMoney.value;
  if (leverId === 'cmv-percent-target') return draft.cmvTargetPercent;
  const categoryId = leverId.startsWith('category:') ? leverId.slice('category:'.length) : '';
  return draft.categoryLevers.find(lever => lever.categoryId === categoryId)?.adjustment.value ?? '';
}

export function buildPresentationDecisionSnapshot(input: {
  plan: PresentationPlanData;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  mode: PresentationComparisonMode | 'scenario';
  scenarioResult?: PresentationScenarioResult;
  scenarioDraft?: PresentationScenarioDraft;
  capturedAt?: string;
}): PresentationDecisionSnapshot {
  const capturedAt = input.capturedAt ?? new Date().toISOString();
  if (input.plan.range.start !== input.period.start || input.plan.range.endExclusive !== input.period.endExclusive) {
    return fail('INVALID_PERIOD', 'plan.range', 'A base atual não corresponde ao período selecionado.');
  }

  if (input.mode === 'scenario') {
    if (!input.scenarioResult || !input.scenarioDraft) {
      return fail('SCENARIO_INVALID', 'scenario', 'Cenário válido e rascunho explícito são obrigatórios.');
    }
    const scenarioResult = parsePresentationScenarioResult(input.scenarioResult);
    const scenarioDraft = parsePresentationScenarioDraft(input.scenarioDraft);
    if (scenarioResult.activeLevers.length === 0) {
      return fail('SCENARIO_WITHOUT_EXPLICIT_LEVER', 'scenario.activeLevers', 'O cenário não possui alavanca explícita.');
    }
    const snapshot: PresentationDecisionSnapshot = {
      contractVersion: PRESENTATION_DECISION_SNAPSHOT_VERSION,
      referenceType: 'SCENARIO',
      sourceMode: 'scenario',
      period: input.period,
      granularity: input.granularity,
      capturedAt,
      cutoffDate: scenarioResult.cutoffDate,
      formulaVersion: PRESENTATION_SCENARIO_FORMULA_VERSION,
      metricFormulaVersion: PRESENTATION_MANAGERIAL_METRIC_VERSION,
      sources: { ...scenarioResult.sources },
      rules: { ...scenarioResult.rules },
      metrics: { ...scenarioResult.scenario },
      assumptions: scenarioResult.activeLevers.map(lever => ({
        id: lever.id,
        label: lever.label,
        target: lever.target,
        adjustmentMode: lever.adjustmentMode,
        exactValue: exactValueForLever(scenarioDraft, lever.id),
        calculatedInputValue: lever.inputValue,
        resultImpact: lever.resultImpact,
      })),
      scenarioResult,
      scenarioDraft,
    };
    return parsePresentationDecisionSnapshot(snapshot);
  }

  let metrics: PresentationPlanMetricSet;
  if (input.mode === 'actual') metrics = input.plan.actual;
  else if (input.mode === 'budget') metrics = input.plan.budget;
  else {
    if (input.plan.projection.state !== 'available' || !input.plan.projection.metrics) {
      return fail('SOURCE_UNAVAILABLE', 'plan.projection', 'A projeção está indisponível.');
    }
    metrics = input.plan.projection.metrics;
  }
  if (metrics.revenue === null || metrics.expense === null || metrics.result === null) {
    return fail('SOURCE_UNAVAILABLE', `plan.${input.mode}`, 'A base selecionada não possui métricas obrigatórias.');
  }

  return parsePresentationDecisionSnapshot({
    contractVersion: PRESENTATION_DECISION_SNAPSHOT_VERSION,
    referenceType: 'BASE',
    sourceMode: input.mode,
    period: input.period,
    granularity: input.granularity,
    capturedAt,
    cutoffDate: input.plan.projection.cutoffDate,
    formulaVersion: PRESENTATION_PLAN_FORMULA_VERSION,
    metricFormulaVersion: PRESENTATION_MANAGERIAL_METRIC_VERSION,
    sources: { ...input.plan.sources, baseline: input.mode },
    rules: { ...input.plan.rules },
    metrics: { ...metrics },
    assumptions: [],
  });
}

export function parsePresentationDecisionSnapshot(value: unknown): PresentationDecisionSnapshot {
  if (snapshotByteLength(value) > PRESENTATION_DECISION_MAX_SNAPSHOT_BYTES) {
    return fail('PAYLOAD_TOO_LARGE', 'snapshot', 'Snapshot excede 256 KiB.');
  }
  const snapshot = readRecord(value, 'snapshot');
  if (snapshot.contractVersion !== PRESENTATION_DECISION_SNAPSHOT_VERSION) {
    return fail('UNKNOWN_VERSION', 'snapshot.contractVersion', 'Versão do snapshot incompatível.');
  }
  const referenceType = readReferenceType(snapshot.referenceType, 'snapshot.referenceType');
  const sourceMode = snapshot.sourceMode;
  if (sourceMode !== 'actual' && sourceMode !== 'budget' && sourceMode !== 'projection' && sourceMode !== 'scenario') {
    return fail('UNKNOWN_ENUM', 'snapshot.sourceMode', 'Fonte do snapshot inválida.');
  }
  if ((referenceType === 'SCENARIO') !== (sourceMode === 'scenario')) {
    return fail('SOURCE_INCOMPATIBLE', 'snapshot.sourceMode', 'Fonte incompatível com o tipo de referência.');
  }
  const formulaVersion = readString(snapshot.formulaVersion, 'snapshot.formulaVersion', 100);
  if (formulaVersion !== PRESENTATION_PLAN_FORMULA_VERSION && formulaVersion !== PRESENTATION_SCENARIO_FORMULA_VERSION) {
    return fail('FORMULA_UNKNOWN', 'snapshot.formulaVersion', 'Fórmula desconhecida.');
  }
  if (snapshot.metricFormulaVersion !== PRESENTATION_MANAGERIAL_METRIC_VERSION) {
    return fail('FORMULA_UNKNOWN', 'snapshot.metricFormulaVersion', 'Semântica de métricas desconhecida.');
  }
  if (
    (referenceType === 'BASE' && formulaVersion !== PRESENTATION_PLAN_FORMULA_VERSION)
    || (referenceType === 'SCENARIO' && formulaVersion !== PRESENTATION_SCENARIO_FORMULA_VERSION)
  ) {
    return fail('FORMULA_INCOMPATIBLE', 'snapshot.formulaVersion', 'Fórmula incompatível com a referência.');
  }
  const sourcesRecord = readRecord(snapshot.sources, 'snapshot.sources');
  const sources = Object.fromEntries(Object.entries(sourcesRecord).map(([key, item]) => [
    readString(key, 'snapshot.sources.key', 100),
    readString(item, `snapshot.sources.${key}`, 200),
  ]));
  if (
    sources.actual !== 'fin_lancamentos'
    || sources.budget !== 'fin_orcamentos'
    || sources.cmvTarget !== 'metas_cmv.meta_cmv_total'
  ) {
    return fail('SOURCE_INCOMPATIBLE', 'snapshot.sources', 'Fontes canônicas incompatíveis.');
  }
  const rules = readRecord(snapshot.rules, 'snapshot.rules');
  const assumptions = readArray(snapshot.assumptions, 'snapshot.assumptions', 100).map((item, index) => {
    const path = `snapshot.assumptions[${index}]`;
    const assumption = readRecord(item, path);
    return {
      id: readString(assumption.id, `${path}.id`, 100),
      label: readString(assumption.label, `${path}.label`, 300),
      target: readString(assumption.target, `${path}.target`, 100),
      adjustmentMode: readString(assumption.adjustmentMode, `${path}.adjustmentMode`, 100),
      exactValue: readString(assumption.exactValue, `${path}.exactValue`, 80),
      calculatedInputValue: readFiniteNumber(assumption.calculatedInputValue, `${path}.calculatedInputValue`),
      resultImpact: readFiniteNumber(assumption.resultImpact, `${path}.resultImpact`),
    };
  });
  let scenarioResult: PresentationScenarioResult | undefined;
  let scenarioDraft: PresentationScenarioDraft | undefined;
  if (referenceType === 'SCENARIO') {
    scenarioResult = parsePresentationScenarioResult(snapshot.scenarioResult);
    scenarioDraft = parsePresentationScenarioDraft(snapshot.scenarioDraft);
    if (
      scenarioResult.activeLevers.length === 0
      || assumptions.length === 0
      || assumptions.length !== scenarioResult.activeLevers.length
      || assumptions.some(assumption => !scenarioResult.activeLevers.some(lever => lever.id === assumption.id))
    ) {
      return fail('SCENARIO_WITHOUT_EXPLICIT_LEVER', 'snapshot.assumptions', 'Cenário sem alavanca explícita.');
    }
    const snapshotPeriod = readRange(snapshot.period, 'snapshot.period');
    if (
      scenarioResult.period.start !== snapshotPeriod.start
      || scenarioResult.period.endExclusive !== snapshotPeriod.endExclusive
      || scenarioResult.formulaVersion !== formulaVersion
      || scenarioResult.sources.actual !== sources.actual
      || scenarioResult.sources.budget !== sources.budget
      || scenarioResult.sources.cmvTarget !== sources.cmvTarget
    ) {
      return fail('SCENARIO_INCOMPATIBLE', 'snapshot.scenarioResult', 'Cenário incompatível com o envelope do snapshot.');
    }
  }
  const period = readRange(snapshot.period, 'snapshot.period');
  const metrics = readMetricSet(snapshot.metrics, 'snapshot.metrics');
  if (metrics.revenue === null || metrics.expense === null || metrics.result === null) {
    return fail('SNAPSHOT_METRIC_MISSING', 'snapshot.metrics', 'Receita, despesa e resultado são obrigatórios.');
  }
  return {
    contractVersion: PRESENTATION_DECISION_SNAPSHOT_VERSION,
    referenceType,
    sourceMode,
    period,
    granularity: readGranularity(snapshot.granularity, 'snapshot.granularity'),
    capturedAt: readTimestamp(snapshot.capturedAt, 'snapshot.capturedAt'),
    cutoffDate: readIsoDate(snapshot.cutoffDate, 'snapshot.cutoffDate'),
    formulaVersion,
    metricFormulaVersion: PRESENTATION_MANAGERIAL_METRIC_VERSION,
    sources,
    rules,
    metrics,
    assumptions,
    scenarioResult,
    scenarioDraft,
  };
}

function parseCounts(value: unknown, path: string): PresentationDecisionActionCounts {
  const counts = readRecord(value, path);
  return {
    pending: readInteger(counts.pending, `${path}.pending`),
    inProgress: readInteger(counts.inProgress, `${path}.inProgress`),
    completed: readInteger(counts.completed, `${path}.completed`),
    cancelled: readInteger(counts.cancelled, `${path}.cancelled`),
    overdue: readInteger(counts.overdue, `${path}.overdue`),
  };
}

function parseSummary(value: unknown, path: string): PresentationDecisionSummary {
  const decision = readRecord(value, path);
  return {
    id: readUuid(decision.id, `${path}.id`),
    title: readString(decision.title, `${path}.title`, 200),
    status: readDecisionStatus(decision.status, `${path}.status`),
    referenceType: readReferenceType(decision.referenceType, `${path}.referenceType`),
    period: readRange(decision.period, `${path}.period`),
    granularity: readGranularity(decision.granularity, `${path}.granularity`),
    executiveResponsibleUserId: readNullableUuid(decision.executiveResponsibleUserId, `${path}.executiveResponsibleUserId`),
    executiveResponsibleName: readNullableString(decision.executiveResponsibleName, `${path}.executiveResponsibleName`, 300),
    createdBy: readNullableUuid(decision.createdBy, `${path}.createdBy`),
    createdByName: readString(decision.createdByName, `${path}.createdByName`, 300),
    createdAt: readTimestamp(decision.createdAt, `${path}.createdAt`),
    updatedAt: readTimestamp(decision.updatedAt, `${path}.updatedAt`),
    version: readInteger(decision.version, `${path}.version`, 1),
    actionCounts: parseCounts(decision.actionCounts, `${path}.actionCounts`),
  };
}

export function parsePresentationDecisionList(value: unknown): PresentationDecisionListPage {
  const page = readRecord(value, 'decisionList');
  if (page.contractVersion !== PRESENTATION_DECISION_API_VERSION) {
    return fail('UNKNOWN_VERSION', 'decisionList.contractVersion', 'Contrato da lista incompatível.');
  }
  return {
    contractVersion: PRESENTATION_DECISION_API_VERSION,
    items: readArray(page.items, 'decisionList.items', 50).map((item, index) => parseSummary(item, `decisionList.items[${index}]`)),
    page: readInteger(page.page, 'decisionList.page', 1),
    pageSize: readInteger(page.pageSize, 'decisionList.pageSize', 1),
    totalCount: readInteger(page.totalCount, 'decisionList.totalCount'),
    hasMore: readBoolean(page.hasMore, 'decisionList.hasMore'),
    fetchedAt: readTimestamp(page.fetchedAt, 'decisionList.fetchedAt'),
  };
}

function parseDecision(value: unknown): PresentationDecision {
  const decision = readRecord(value, 'decision');
  return {
    id: readUuid(decision.id, 'decision.id'),
    title: readString(decision.title, 'decision.title', 200),
    context: readString(decision.context, 'decision.context', 10000),
    status: readDecisionStatus(decision.status, 'decision.status'),
    referenceType: readReferenceType(decision.referenceType, 'decision.referenceType'),
    period: readRange(decision.period, 'decision.period'),
    granularity: readGranularity(decision.granularity, 'decision.granularity'),
    executiveResponsibleUserId: readNullableUuid(decision.executiveResponsibleUserId, 'decision.executiveResponsibleUserId'),
    executiveResponsibleName: readNullableString(decision.executiveResponsibleName, 'decision.executiveResponsibleName', 300),
    currentRevisionId: readUuid(decision.currentRevisionId, 'decision.currentRevisionId'),
    everApproved: readBoolean(decision.everApproved, 'decision.everApproved'),
    approvedBy: readNullableUuid(decision.approvedBy, 'decision.approvedBy'),
    approvedByName: readNullableString(decision.approvedByName, 'decision.approvedByName', 300),
    approvedAt: readNullableTimestamp(decision.approvedAt, 'decision.approvedAt'),
    completedAt: readNullableTimestamp(decision.completedAt, 'decision.completedAt'),
    cancelledAt: readNullableTimestamp(decision.cancelledAt, 'decision.cancelledAt'),
    latestJustification: readNullableString(decision.latestJustification, 'decision.latestJustification', 4000),
    version: readInteger(decision.version, 'decision.version', 1),
    createdBy: readNullableUuid(decision.createdBy, 'decision.createdBy'),
    createdByName: readString(decision.createdByName, 'decision.createdByName', 300),
    updatedBy: readNullableUuid(decision.updatedBy, 'decision.updatedBy'),
    updatedByName: readString(decision.updatedByName, 'decision.updatedByName', 300),
    createdAt: readTimestamp(decision.createdAt, 'decision.createdAt'),
    updatedAt: readTimestamp(decision.updatedAt, 'decision.updatedAt'),
  };
}

function parseRevision(value: unknown, index: number): PresentationDecisionRevision {
  const path = `revisions[${index}]`;
  const revision = readRecord(value, path);
  return {
    id: readUuid(revision.id, `${path}.id`),
    revisionNumber: readInteger(revision.revisionNumber, `${path}.revisionNumber`, 1),
    referenceType: readReferenceType(revision.referenceType, `${path}.referenceType`),
    snapshot: parsePresentationDecisionSnapshot(revision.snapshot),
    revisionReason: readString(revision.revisionReason, `${path}.revisionReason`, 4000),
    approvedBy: readNullableUuid(revision.approvedBy, `${path}.approvedBy`),
    approvedByName: readNullableString(revision.approvedByName, `${path}.approvedByName`, 300),
    approvedAt: readNullableTimestamp(revision.approvedAt, `${path}.approvedAt`),
    createdBy: readNullableUuid(revision.createdBy, `${path}.createdBy`),
    createdByName: readString(revision.createdByName, `${path}.createdByName`, 300),
    createdAt: readTimestamp(revision.createdAt, `${path}.createdAt`),
  };
}

function parseAction(value: unknown, index: number): PresentationDecisionAction {
  const path = `actions[${index}]`;
  const action = readRecord(value, path);
  return {
    id: readUuid(action.id, `${path}.id`),
    decisionId: readUuid(action.decisionId, `${path}.decisionId`),
    description: readString(action.description, `${path}.description`, 1000),
    responsibleUserId: readNullableUuid(action.responsibleUserId, `${path}.responsibleUserId`),
    responsibleName: readString(action.responsibleName, `${path}.responsibleName`, 300),
    dueDate: readNullableDate(action.dueDate, `${path}.dueDate`),
    priority: readPriority(action.priority, `${path}.priority`),
    status: readActionStatus(action.status, `${path}.status`),
    outcomeNote: readNullableString(action.outcomeNote, `${path}.outcomeNote`, 4000),
    completedAt: readNullableTimestamp(action.completedAt, `${path}.completedAt`),
    cancelledAt: readNullableTimestamp(action.cancelledAt, `${path}.cancelledAt`),
    version: readInteger(action.version, `${path}.version`, 1),
    createdBy: readNullableUuid(action.createdBy, `${path}.createdBy`),
    createdByName: readString(action.createdByName, `${path}.createdByName`, 300),
    updatedBy: readNullableUuid(action.updatedBy, `${path}.updatedBy`),
    updatedByName: readString(action.updatedByName, `${path}.updatedByName`, 300),
    createdAt: readTimestamp(action.createdAt, `${path}.createdAt`),
    updatedAt: readTimestamp(action.updatedAt, `${path}.updatedAt`),
  };
}

function readNullableRecord(value: unknown, path: string): Record<string, unknown> | null {
  return value === null ? null : readRecord(value, path);
}

function parseTimelineEvent(value: unknown, index: number): PresentationDecisionTimelineEvent {
  const path = `timeline[${index}]`;
  const event = readRecord(value, path);
  return {
    id: readUuid(event.id, `${path}.id`),
    eventType: readString(event.eventType, `${path}.eventType`, 100),
    before: readNullableRecord(event.before, `${path}.before`),
    after: readNullableRecord(event.after, `${path}.after`),
    justification: readNullableString(event.justification, `${path}.justification`, 4000),
    actorUserId: readNullableUuid(event.actorUserId, `${path}.actorUserId`),
    actorName: readString(event.actorName, `${path}.actorName`, 300),
    createdAt: readTimestamp(event.createdAt, `${path}.createdAt`),
  };
}

export function parsePresentationDecisionDetail(value: unknown): PresentationDecisionDetail {
  const detail = readRecord(value, 'decisionDetail');
  if (detail.contractVersion !== PRESENTATION_DECISION_API_VERSION) {
    return fail('UNKNOWN_VERSION', 'decisionDetail.contractVersion', 'Contrato do detalhe incompatível.');
  }
  const decision = parseDecision(detail.decision);
  const revisions = readArray(detail.revisions, 'revisions', PRESENTATION_DECISION_MAX_REVISIONS).map(parseRevision);
  const actions = readArray(detail.actions, 'actions', PRESENTATION_DECISION_MAX_ACTIONS).map(parseAction);
  const timeline = readArray(detail.timeline, 'timeline', 1000).map(parseTimelineEvent);
  if (!revisions.some(revision => revision.id === decision.currentRevisionId)) {
    return fail('REVISION_INVALID', 'decision.currentRevisionId', 'Revisão atual ausente.');
  }
  if (actions.some(action => action.decisionId !== decision.id)) {
    return fail('TENANT_INCOMPATIBLE', 'actions', 'Ação incompatível com a decisão.');
  }
  return {
    contractVersion: PRESENTATION_DECISION_API_VERSION,
    decision,
    revisions,
    actions,
    timeline,
    fetchedAt: readTimestamp(detail.fetchedAt, 'decisionDetail.fetchedAt'),
  };
}

export function parsePresentationResponsibleProfiles(value: unknown): readonly PresentationResponsibleProfile[] {
  return readArray(value, 'profiles', 200).map((item, index) => {
    const path = `profiles[${index}]`;
    const profile = readRecord(item, path);
    return {
      id: readUuid(profile.id, `${path}.id`),
      nome: readString(profile.nome, `${path}.nome`, 300),
      email: readString(profile.email, `${path}.email`, 320, true),
      avatarUrl: profile.avatar_url === null || profile.avatar_url === ''
        ? null
        : readString(profile.avatar_url, `${path}.avatar_url`, 2000),
    };
  });
}

export function assertPresentationResponsibleInTenant(
  responsibleUserId: string,
  profiles: readonly PresentationResponsibleProfile[],
): string {
  const id = readUuid(responsibleUserId, 'responsibleUserId');
  if (!profiles.some(profile => profile.id === id)) {
    return fail('RESPONSIBLE_OUT_OF_TENANT', 'responsibleUserId', 'Responsável fora do conjunto tenant-scoped.');
  }
  return id;
}

export function parsePresentationDecisionActionDraft(
  value: unknown,
  profiles: readonly PresentationResponsibleProfile[],
): PresentationDecisionActionDraft {
  const action = readRecord(value, 'actionDraft');
  const responsibleUserId = assertPresentationResponsibleInTenant(
    readUuid(action.responsibleUserId, 'actionDraft.responsibleUserId'),
    profiles,
  );
  return {
    description: readString(action.description, 'actionDraft.description', 1000).trim(),
    responsibleUserId,
    dueDate: readNullableDate(action.dueDate, 'actionDraft.dueDate'),
    priority: readPriority(action.priority, 'actionDraft.priority'),
  };
}

export function parsePresentationDecisionTransition(value: unknown): PresentationDecisionTransition {
  const transition = readRecord(value, 'transition');
  if (transition.contractVersion !== PRESENTATION_DECISION_API_VERSION) {
    return fail('UNKNOWN_VERSION', 'transition.contractVersion', 'Contrato da transição incompatível.');
  }
  const entityId = readUuid(transition.entityId, 'transition.entityId');
  const expectedUpdatedAt = readTimestamp(transition.expectedUpdatedAt, 'transition.expectedUpdatedAt');
  if (transition.entity === 'decision') {
    const expectedStatus = readDecisionStatus(transition.expectedStatus, 'transition.expectedStatus');
    const targetStatus = readDecisionStatus(transition.targetStatus, 'transition.targetStatus');
    if (!isValidPresentationDecisionTransition(expectedStatus, targetStatus)) {
      return fail('TRANSITION_INVALID', 'transition.targetStatus', 'Transição de decisão impossível.');
    }
    return {
      contractVersion: PRESENTATION_DECISION_API_VERSION,
      entity: 'decision',
      entityId,
      expectedStatus,
      targetStatus,
      justification: readString(transition.justification, 'transition.justification', 4000).trim(),
      expectedUpdatedAt,
    };
  }
  if (transition.entity === 'action') {
    const expectedStatus = readActionStatus(transition.expectedStatus, 'transition.expectedStatus');
    const targetStatus = readActionStatus(transition.targetStatus, 'transition.targetStatus');
    const valid = (
      expectedStatus === 'PENDING' && ['IN_PROGRESS', 'COMPLETED', 'CANCELLED'].includes(targetStatus)
    ) || (
      expectedStatus === 'IN_PROGRESS' && ['COMPLETED', 'CANCELLED'].includes(targetStatus)
    ) || (
      ['COMPLETED', 'CANCELLED'].includes(expectedStatus) && targetStatus === 'PENDING'
    );
    if (!valid) return fail('TRANSITION_INVALID', 'transition.targetStatus', 'Transição de ação impossível.');
    const justification = targetStatus === 'IN_PROGRESS'
      ? transition.justification === null ? null : readString(transition.justification, 'transition.justification', 4000).trim()
      : readString(transition.justification, 'transition.justification', 4000).trim();
    return {
      contractVersion: PRESENTATION_DECISION_API_VERSION,
      entity: 'action',
      entityId,
      expectedStatus,
      targetStatus,
      justification,
      expectedUpdatedAt,
    };
  }
  return fail('UNKNOWN_ENUM', 'transition.entity', 'Entidade da transição inválida.');
}

export function comparePresentationDecisionSnapshot(
  snapshot: PresentationDecisionSnapshot,
  plan: PresentationPlanData,
): PresentationDecisionComparison {
  if (snapshot.period.start !== plan.range.start || snapshot.period.endExclusive !== plan.range.endExclusive) {
    return { state: 'unavailable', reason: 'period-incompatible' };
  }
  if (snapshot.metricFormulaVersion !== PRESENTATION_MANAGERIAL_METRIC_VERSION) {
    return { state: 'unavailable', reason: 'formula-incompatible' };
  }
  if (plan.sources.actual !== 'fin_lancamentos' || snapshot.sources.actual !== 'fin_lancamentos') {
    return { state: 'unavailable', reason: 'source-incompatible' };
  }
  if (plan.actual.revenue === null || plan.actual.expense === null || plan.actual.result === null) {
    return { state: 'unavailable', reason: 'current-data-unavailable' };
  }

  const definitions: Array<{ key: PresentationDecisionComparisonMetricKey; favorableHigher: boolean }> = [
    { key: 'revenue', favorableHigher: true },
    { key: 'expense', favorableHigher: false },
    { key: 'result', favorableHigher: true },
    { key: 'marginPercent', favorableHigher: true },
    { key: 'cmv', favorableHigher: false },
  ];
  const metrics = definitions.map(({ key, favorableHigher }): PresentationDecisionComparisonMetric => {
    const approved = snapshot.metrics[key];
    const current = plan.actual[key];
    if (approved === null || current === null) {
      return { key, snapshot: approved, current, absoluteChange: null, percentChange: null, favorability: 'unavailable' };
    }
    const absoluteChange = current - approved;
    const percentChange = approved === 0 ? null : (absoluteChange / Math.abs(approved)) * 100;
    const favorability = Math.abs(absoluteChange) < 0.005
      ? 'neutral'
      : favorableHigher === (absoluteChange > 0)
        ? 'favorable'
        : 'unfavorable';
    return { key, snapshot: approved, current, absoluteChange, percentChange, favorability };
  });
  return {
    state: 'available',
    snapshotCapturedAt: snapshot.capturedAt,
    currentGeneratedAt: plan.generatedAt,
    metrics,
  };
}

export function isValidPresentationDecisionTransition(
  current: PresentationDecisionStatus,
  target: PresentationDecisionStatus,
): boolean {
  if (current === 'DRAFT') return target === 'APPROVED' || target === 'CANCELLED';
  if (current === 'APPROVED') return target === 'COMPLETED' || target === 'CANCELLED';
  if (current === 'IN_PROGRESS') return target === 'COMPLETED' || target === 'CANCELLED';
  if (current === 'COMPLETED' || current === 'CANCELLED') return target === 'DRAFT';
  return false;
}

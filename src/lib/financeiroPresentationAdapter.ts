import {
  PRESENTATION_CONTRACT_VERSION,
  buildPresentationComparisons,
  calculatePresentationDeltas,
  formatPresentationPeriodLabelPtBR,
  parsePresentationScenarioResult,
  type AvailablePeriodBounds,
  type CategoryCompositionNode,
  type CategoryCompositionSection,
  type CategoryNature,
  type DataAvailability,
  type IsoDate,
  type ManagerialResultMetrics,
  type NormalizedDateRange,
  type NormalizedPresentationPeriod,
  type OpenItemsIndicator,
  type PresentationCategoryComposition,
  type PresentationCategoryDefinition,
  type PresentationComparisonData,
  type PresentationData,
  type PresentationPeriodFilter,
  type PresentationPlanData,
  type PresentationScenarioResult,
  type PresentationDecisionComparison,
  type PresentationDecisionDetail,
  type PresentationPeriodSnapshot,
  type PresentationRankingItem,
  type PresentationRankings,
  type PresentationRevenueData,
  type PresentationExpensesData,
  type PresentationResultsData,
  type PresentationInsightsData,
  type PresentationTimeSeries,
  type PresentationTimeSeriesPoint,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { buildPresentationSlides } from '@/lib/presentationSlides';
import { derivePresentationResultsAvailability } from '@/lib/resultsPresentationAdapter';
import { derivePresentationInsightsAvailability } from '@/domain/financeiro/presentation';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

export interface NonOperationalTotals {
  revenue: number;
  expense: number;
  result: number;
}

export interface PresentationAnalyticsSnapshot extends PresentationPeriodSnapshot {
  nonOperationalTotals: NonOperationalTotals;
}

export interface PresentationAnalyticsComparisonData extends Omit<PresentationComparisonData, 'snapshot'> {
  snapshot: DataAvailability<PresentationAnalyticsSnapshot>;
}

export interface PresentationSociosData extends Omit<PresentationData, 'current' | 'comparisons'> {
  current: DataAvailability<PresentationAnalyticsSnapshot>;
  revenue?: DataAvailability<PresentationRevenueData>;
  expenses?: DataAvailability<PresentationExpensesData>;
  results?: DataAvailability<PresentationResultsData>;
  insights?: DataAvailability<PresentationInsightsData>;
  plan?: DataAvailability<PresentationPlanData>;
  scenario?: DataAvailability<PresentationScenarioResult>;
  decision?: DataAvailability<{
    detail: PresentationDecisionDetail;
    comparison: PresentationDecisionComparison;
  }>;
  comparisons: {
    previousPeriod: PresentationAnalyticsComparisonData;
    previousYear: PresentationAnalyticsComparisonData;
  };
}

export function attachPresentationResults(data: PresentationSociosData): PresentationSociosData {
  const results = derivePresentationResultsAvailability({
    generatedAt: data.generatedAt,
    periodLabel: data.periodLabel,
    current: data.current,
    previousPeriod: data.comparisons.previousPeriod.snapshot,
  });
  const next: PresentationSociosData = { ...data, results, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export function attachPresentationInsights(data: PresentationSociosData): PresentationSociosData {
  const notRequested = { state: 'unavailable' as const, reason: 'not-requested' as const };
  const insights = derivePresentationInsightsAvailability(
    data.revenue ?? notRequested,
    data.expenses ?? notRequested,
  );
  const next: PresentationSociosData = { ...data, insights, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export function attachPresentationExpenses(
  data: PresentationSociosData,
  expenses: DataAvailability<PresentationExpensesData>,
): PresentationSociosData {
  const next: PresentationSociosData = { ...data, expenses, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export function attachPresentationRevenue(
  data: PresentationSociosData,
  revenue: DataAvailability<PresentationRevenueData>,
): PresentationSociosData {
  const next: PresentationSociosData = { ...data, revenue, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export function attachPresentationDecision(
  data: PresentationSociosData,
  decision: DataAvailability<{
    detail: PresentationDecisionDetail;
    comparison: PresentationDecisionComparison;
  }>,
): PresentationSociosData {
  const next: PresentationSociosData = { ...data, decision, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export function attachPresentationPlan(
  data: PresentationSociosData,
  plan: DataAvailability<PresentationPlanData>,
): PresentationSociosData {
  const next: PresentationSociosData = { ...data, plan, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export function attachPresentationScenario(
  data: PresentationSociosData,
  scenario: DataAvailability<PresentationScenarioResult>,
): PresentationSociosData {
  let validatedScenario = scenario;
  if (scenario.state === 'available' || scenario.state === 'empty') {
    try {
      validatedScenario = { ...scenario, data: parsePresentationScenarioResult(scenario.data) };
    } catch (error) {
      console.error('Contrato de cenário rejeitado antes da apresentação:', error);
      validatedScenario = { state: 'error', message: 'O cenário contém cálculos ou metadados inválidos e não será exportado.' };
    }
  }
  const next: PresentationSociosData = { ...data, scenario: validatedScenario, slides: [] };
  return { ...next, slides: buildPresentationSlides(next) };
}

export interface PresentationAdapterContext {
  filter: PresentationPeriodFilter;
  period: NormalizedPresentationPeriod;
  previousPeriod: NormalizedDateRange;
  previousYear: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  rankingLimit: number;
}

interface TransportCategoryDefinition extends PresentationCategoryDefinition {
  depth: number;
  path: readonly string[];
}

interface TransportCategoryNode {
  categoryId: string | null;
  parentCategoryId: string | null;
  name: string;
  nature: CategoryNature;
  order: number;
  depth: number;
  path: readonly string[];
  directAmount: number;
  amount: number;
  sharePercent: number;
}

interface ParsedTransportSnapshot {
  range: NormalizedDateRange;
  snapshot: PresentationAnalyticsSnapshot;
}

export class PresentationPayloadError extends Error {
  readonly path: string;
  readonly expectation: string;

  constructor(path: string, expectation: string) {
    super(`Payload inválido da Apresentação Sócios: ${path} deve ser ${expectation}`);
    this.name = 'PresentationPayloadError';
    this.path = path;
    this.expectation = expectation;
  }
}

function fail(path: string, expectation: string): never {
  throw new PresentationPayloadError(path, expectation);
}

type SafePayloadValueType = 'array' | 'null' | 'boolean' | 'number' | 'object' | 'string' | 'undefined';

function safePayloadValueType(value: unknown): SafePayloadValueType {
  if (value === null) return 'null';
  if (Array.isArray(value)) return 'array';
  return typeof value as SafePayloadValueType;
}

function safeExpectedFieldTypes(value: unknown): Record<string, SafePayloadValueType> | undefined {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return undefined;
  const record = value as Record<string, unknown>;
  return Object.fromEntries([
    'contractVersion',
    'generatedAt',
    'availableBounds',
    'categoryDefinitions',
    'current',
    'previousPeriod',
    'previousYear',
  ].map(key => [key, safePayloadValueType(record[key])]));
}

/**
 * Diagnóstico deliberadamente sem valores do payload: registra somente o
 * caminho rejeitado, a expectativa, tipos dos campos públicos do transporte e
 * o tamanho da lista de categorias. Assim a forma incompatível é observável
 * sem vazar números financeiros, nomes, UUIDs ou outros dados do tenant.
 */
export function createSafePresentationPayloadDiagnostic(
  payload: unknown,
  error: PresentationPayloadError,
) {
  const record = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  return {
    error: {
      name: error.name,
      path: error.path,
      expectation: error.expectation,
    },
    payload: {
      type: safePayloadValueType(payload),
      expectedFieldTypes: safeExpectedFieldTypes(payload),
      categoryDefinitionCount: Array.isArray(record?.categoryDefinitions)
        ? record.categoryDefinitions.length
        : undefined,
    },
  };
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'um objeto');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'uma lista');
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) return fail(path, 'um texto não vazio');
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  if (value === null) return null;
  return readString(value, path);
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'um número finito');
  return value;
}

function readInteger(value: unknown, path: string, minimum = 0): number {
  const number = readFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < minimum) {
    return fail(path, `um inteiro maior ou igual a ${minimum}`);
  }
  return number;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') return fail(path, 'booleano');
  return value;
}

function readIsoDate(value: unknown, path: string): IsoDate {
  const date = readString(value, path);
  if (!ISO_DATE_PATTERN.test(date)) return fail(path, 'uma data ISO yyyy-MM-dd');
  const [year, month, day] = date.split('-').map(Number);
  const candidate = new Date(Date.UTC(year, month - 1, day));
  if (
    candidate.getUTCFullYear() !== year
    || candidate.getUTCMonth() !== month - 1
    || candidate.getUTCDate() !== day
  ) {
    return fail(path, 'uma data ISO válida');
  }
  return date;
}

function readTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) return fail(path, 'um timestamp ISO válido');
  return timestamp;
}

function readNature(value: unknown, path: string): CategoryNature {
  if (value !== 'RECEITA' && value !== 'DESPESA') return fail(path, 'RECEITA ou DESPESA');
  return value;
}

function readGranularity(value: unknown, path: string): TimeSeriesGranularity {
  if (value !== 'day' && value !== 'month' && value !== 'year') {
    return fail(path, 'day, month ou year');
  }
  return value;
}

function readStringArray(value: unknown, path: string): readonly string[] {
  return readArray(value, path).map((item, index) => readString(item, `${path}[${index}]`));
}

function readRange(value: unknown, path: string): NormalizedDateRange {
  const record = readRecord(value, path);
  const range = {
    start: readIsoDate(record.start, `${path}.start`),
    endExclusive: readIsoDate(record.endExclusive, `${path}.endExclusive`),
  };
  if (range.start >= range.endExclusive) return fail(path, 'um intervalo com fim exclusivo posterior ao início');
  return range;
}

function rangesEqual(left: NormalizedDateRange, right: NormalizedDateRange): boolean {
  return left.start === right.start && left.endExclusive === right.endExclusive;
}

function readManagerialMetrics(value: unknown, path: string): ManagerialResultMetrics {
  const record = readRecord(value, path);
  return {
    revenue: readFiniteNumber(record.revenue, `${path}.revenue`),
    expense: readFiniteNumber(record.expense, `${path}.expense`),
    result: readFiniteNumber(record.result, `${path}.result`),
    marginPercent: readFiniteNumber(record.marginPercent, `${path}.marginPercent`),
  };
}

function readOpenItemsIndicator(value: unknown, path: string): OpenItemsIndicator {
  const record = readRecord(value, path);
  return {
    amount: readFiniteNumber(record.amount, `${path}.amount`),
    count: readInteger(record.count, `${path}.count`),
  };
}

function readTimeSeriesPoint(value: unknown, path: string): PresentationTimeSeriesPoint {
  const record = readRecord(value, path);
  const range = readRange(record, path);
  return {
    key: readString(record.key, `${path}.key`),
    label: readString(record.label, `${path}.label`),
    ...range,
    metrics: readManagerialMetrics(record.metrics, `${path}.metrics`),
  };
}

function readTimeSeries(
  value: unknown,
  path: string,
  expectedGranularity: TimeSeriesGranularity,
): PresentationTimeSeries {
  const record = readRecord(value, path);
  const granularity = readGranularity(record.granularity, `${path}.granularity`);
  if (granularity !== expectedGranularity) return fail(`${path}.granularity`, expectedGranularity);
  const points = readArray(record.points, `${path}.points`)
    .map((point, index) => readTimeSeriesPoint(point, `${path}.points[${index}]`));

  for (let index = 1; index < points.length; index += 1) {
    if (points[index - 1].endExclusive > points[index].start) {
      return fail(`${path}.points`, 'uma série temporal ordenada e sem sobreposição');
    }
  }

  return { granularity, points };
}

function readCategoryDefinitions(value: unknown): Map<string, TransportCategoryDefinition> {
  const definitions = new Map<string, TransportCategoryDefinition>();
  readArray(value, 'categoryDefinitions').forEach((item, index) => {
    const path = `categoryDefinitions[${index}]`;
    const record = readRecord(item, path);
    const id = readString(record.id, `${path}.id`);
    if (definitions.has(id)) return fail(`${path}.id`, 'único');
    const depth = readInteger(record.depth, `${path}.depth`);
    const categoryPath = readStringArray(record.path, `${path}.path`);
    if (categoryPath.length !== depth + 1 || categoryPath[categoryPath.length - 1] !== id) {
      return fail(`${path}.path`, 'compatível com depth e terminando no id da categoria');
    }
    const transportParentId = readNullableString(record.parentId, `${path}.parentId`);
    const canonicalParentId = depth === 0 ? null : categoryPath[categoryPath.length - 2];
    if (depth > 0 && canonicalParentId !== transportParentId) {
      return fail(`${path}.parentId`, 'compatível com path e depth');
    }
    definitions.set(id, {
      id,
      parentId: canonicalParentId,
      name: readString(record.name, `${path}.name`),
      nature: readNature(record.nature, `${path}.nature`),
      excludedFromTotals: readBoolean(record.excludedFromTotals, `${path}.excludedFromTotals`),
      order: readInteger(record.order, `${path}.order`),
      depth,
      path: categoryPath,
    });
  });
  return definitions;
}

function readFlatCategoryNode(
  value: unknown,
  path: string,
  expectedNature: CategoryNature,
  expectedNonOperational: boolean,
  definitions: ReadonlyMap<string, TransportCategoryDefinition>,
): TransportCategoryNode {
  const record = readRecord(value, path);
  const categoryId = readNullableString(record.categoryId, `${path}.categoryId`);
  const transportParentCategoryId = readNullableString(record.parentCategoryId, `${path}.parentCategoryId`);
  const nature = readNature(record.nature, `${path}.nature`);
  const order = readInteger(record.order, `${path}.order`);
  const depth = readInteger(record.depth, `${path}.depth`);
  const categoryPath = readStringArray(record.path, `${path}.path`);
  const name = readString(record.name, `${path}.name`);
  const canonicalParentCategoryId = depth === 0 ? null : categoryPath[categoryPath.length - 2];

  if (nature !== expectedNature) return fail(`${path}.nature`, expectedNature);

  if (categoryId === null) {
    const expectedName = nature === 'RECEITA'
      ? 'Sem categoria — Receitas'
      : 'Sem categoria — Despesas';
    if (transportParentCategoryId !== null || depth !== 0 || categoryPath.length !== 0 || name !== expectedName) {
      return fail(path, `o grupo explícito ${expectedName}`);
    }
  } else {
    const definition = definitions.get(categoryId);
    if (!definition) return fail(`${path}.categoryId`, 'uma categoria presente em categoryDefinitions');
    if (
      definition.parentId !== canonicalParentCategoryId
      || definition.name !== name
      || definition.nature !== nature
      || definition.excludedFromTotals !== expectedNonOperational
      || definition.order !== order
      || definition.depth !== depth
      || definition.path.length !== categoryPath.length
      || definition.path.some((part, index) => part !== categoryPath[index])
    ) {
      return fail(path, 'compatível com a definição canônica da categoria');
    }
    if (depth > 0 && transportParentCategoryId !== canonicalParentCategoryId) {
      return fail(`${path}.parentCategoryId`, 'compatível com path e depth');
    }
  }

  return {
    categoryId,
    parentCategoryId: canonicalParentCategoryId,
    name,
    nature,
    order,
    depth,
    path: categoryPath,
    directAmount: readFiniteNumber(record.directAmount, `${path}.directAmount`),
    amount: readFiniteNumber(record.amount, `${path}.amount`),
    sharePercent: readFiniteNumber(record.sharePercent, `${path}.sharePercent`),
  };
}

function buildCategoryTree(items: readonly TransportCategoryNode[], path: string): CategoryCompositionNode[] {
  type MutableNode = CategoryCompositionNode & { children: MutableNode[] };
  const nodes = items.map<MutableNode>(item => ({
    categoryId: item.categoryId,
    parentCategoryId: item.parentCategoryId,
    name: item.name,
    nature: item.nature,
    directAmount: item.directAmount,
    amount: item.amount,
    sharePercent: item.sharePercent,
    children: [],
  }));
  const byId = new Map<string, MutableNode>();
  items.forEach((item, index) => {
    if (item.categoryId === null) return;
    if (byId.has(item.categoryId)) return fail(`${path}[${index}].categoryId`, 'único na seção');
    byId.set(item.categoryId, nodes[index]);
  });

  const roots: MutableNode[] = [];
  items.forEach((item, index) => {
    const node = nodes[index];
    if (item.categoryId === null || item.parentCategoryId === null) {
      roots.push(node);
      return;
    }
    const parent = byId.get(item.parentCategoryId);
    if (!parent) return fail(`${path}[${index}].parentCategoryId`, 'um pai presente na mesma seção');
    parent.children.push(node);
  });

  return roots;
}

function readCompositionList(
  value: unknown,
  path: string,
  nature: CategoryNature,
  nonOperational: boolean,
  definitions: ReadonlyMap<string, TransportCategoryDefinition>,
): readonly CategoryCompositionNode[] {
  const items = readArray(value, path).map((item, index) => readFlatCategoryNode(
    item,
    `${path}[${index}]`,
    nature,
    nonOperational,
    definitions,
  ));
  return buildCategoryTree(items, path);
}

function readCompositionSection(
  value: unknown,
  path: string,
  nonOperational: boolean,
  definitions: ReadonlyMap<string, TransportCategoryDefinition>,
): CategoryCompositionSection {
  const record = readRecord(value, path);
  return {
    revenue: readCompositionList(record.revenue, `${path}.revenue`, 'RECEITA', nonOperational, definitions),
    expense: readCompositionList(record.expense, `${path}.expense`, 'DESPESA', nonOperational, definitions),
  };
}

function readCategoryComposition(
  value: unknown,
  path: string,
  definitions: ReadonlyMap<string, TransportCategoryDefinition>,
): PresentationCategoryComposition {
  const record = readRecord(value, path);
  return {
    operational: readCompositionSection(record.operational, `${path}.operational`, false, definitions),
    nonOperational: readCompositionSection(
      record.nonOperational,
      `${path}.nonOperational`,
      true,
      definitions,
    ),
  };
}

function readRankingItem(value: unknown, path: string): PresentationRankingItem {
  const record = readRecord(value, path);
  return {
    rank: readInteger(record.rank, `${path}.rank`, 1),
    categoryId: readNullableString(record.categoryId, `${path}.categoryId`),
    label: readString(record.label, `${path}.label`),
    amount: readFiniteNumber(record.amount, `${path}.amount`),
    sharePercent: readFiniteNumber(record.sharePercent, `${path}.sharePercent`),
  };
}

function readRankingList(value: unknown, path: string, rankingLimit: number): readonly PresentationRankingItem[] {
  const items = readArray(value, path).map((item, index) => readRankingItem(item, `${path}[${index}]`));
  if (items.length > rankingLimit) return fail(path, `uma lista limitada a ${rankingLimit} itens`);
  items.forEach((item, index) => {
    if (item.rank !== index + 1) return fail(`${path}[${index}].rank`, 'sequencial a partir de 1');
  });
  return items;
}

function readRankings(value: unknown, path: string, rankingLimit: number): PresentationRankings {
  const record = readRecord(value, path);
  return {
    topRevenueCategories: readRankingList(
      record.topRevenueCategories,
      `${path}.topRevenueCategories`,
      rankingLimit,
    ),
    topExpenseCategories: readRankingList(
      record.topExpenseCategories,
      `${path}.topExpenseCategories`,
      rankingLimit,
    ),
  };
}

function readNonOperationalTotals(value: unknown, path: string): NonOperationalTotals {
  const record = readRecord(value, path);
  return {
    revenue: readFiniteNumber(record.revenue, `${path}.revenue`),
    expense: readFiniteNumber(record.expense, `${path}.expense`),
    result: readFiniteNumber(record.result, `${path}.result`),
  };
}

function readSnapshot(
  value: unknown,
  path: string,
  expectedRange: NormalizedDateRange,
  context: PresentationAdapterContext,
  definitions: ReadonlyMap<string, TransportCategoryDefinition>,
): ParsedTransportSnapshot {
  const record = readRecord(value, path);
  const range = readRange(record.range, `${path}.range`);
  if (!rangesEqual(range, expectedRange)) return fail(`${path}.range`, 'igual ao intervalo solicitado');

  const metricsRecord = readRecord(record.metrics, `${path}.metrics`);
  const openItemsRecord = readRecord(metricsRecord.openItems, `${path}.metrics.openItems`);
  const snapshot: PresentationAnalyticsSnapshot = {
    metrics: {
      managerialResult: readManagerialMetrics(
        metricsRecord.managerialResult,
        `${path}.metrics.managerialResult`,
      ),
      openItems: {
        accountsPayableOpen: readOpenItemsIndicator(
          openItemsRecord.accountsPayableOpen,
          `${path}.metrics.openItems.accountsPayableOpen`,
        ),
        accountsReceivableOpen: readOpenItemsIndicator(
          openItemsRecord.accountsReceivableOpen,
          `${path}.metrics.openItems.accountsReceivableOpen`,
        ),
      },
    },
    timeSeries: readTimeSeries(record.timeSeries, `${path}.timeSeries`, context.granularity),
    categoryComposition: readCategoryComposition(
      record.categoryComposition,
      `${path}.categoryComposition`,
      definitions,
    ),
    rankings: readRankings(record.rankings, `${path}.rankings`, context.rankingLimit),
    highlights: [],
    nonOperationalTotals: readNonOperationalTotals(
      record.nonOperationalTotals,
      `${path}.nonOperationalTotals`,
    ),
  };
  return { range, snapshot };
}

function readAvailableBounds(value: unknown): AvailablePeriodBounds | undefined {
  if (value === null) return undefined;
  const record = readRecord(value, 'availableBounds');
  const bounds = {
    minDate: readIsoDate(record.minDate, 'availableBounds.minDate'),
    maxDate: readIsoDate(record.maxDate, 'availableBounds.maxDate'),
  };
  if (bounds.minDate > bounds.maxDate) return fail('availableBounds', 'limites em ordem crescente');
  return bounds;
}

function hasSnapshotData(snapshot: PresentationAnalyticsSnapshot): boolean {
  const result = snapshot.metrics.managerialResult;
  const open = snapshot.metrics.openItems;
  const nonOperational = snapshot.nonOperationalTotals;
  return result.revenue !== 0
    || result.expense !== 0
    || result.result !== 0
    || open.accountsPayableOpen.amount !== 0
    || open.accountsPayableOpen.count !== 0
    || open.accountsReceivableOpen.amount !== 0
    || open.accountsReceivableOpen.count !== 0
    || nonOperational.revenue !== 0
    || nonOperational.expense !== 0
    || nonOperational.result !== 0
    || snapshot.rankings.topRevenueCategories.length > 0
    || snapshot.rankings.topExpenseCategories.length > 0;
}

function snapshotAvailability(
  snapshot: PresentationAnalyticsSnapshot,
  fetchedAt: string,
): DataAvailability<PresentationAnalyticsSnapshot> {
  return hasSnapshotData(snapshot)
    ? { state: 'available', data: snapshot, fetchedAt }
    : { state: 'empty', data: snapshot, fetchedAt };
}

function comparisonData(
  definition: PresentationAnalyticsComparisonData['definition'],
  snapshot: PresentationAnalyticsSnapshot,
  fetchedAt: string,
): PresentationAnalyticsComparisonData {
  return {
    definition,
    snapshot: definition.availability.state === 'unavailable'
      ? { state: 'unavailable', reason: definition.availability.reason }
      : snapshotAvailability(snapshot, fetchedAt),
  };
}

function dataFromAvailability(
  availability: DataAvailability<PresentationAnalyticsSnapshot>,
): PresentationAnalyticsSnapshot | null {
  return availability.state === 'available' || availability.state === 'empty'
    ? availability.data
    : null;
}

export function adaptPresentationSociosPayload(
  payload: unknown,
  context: PresentationAdapterContext,
): PresentationSociosData {
  if (!Number.isInteger(context.rankingLimit) || context.rankingLimit < 1 || context.rankingLimit > 50) {
    throw new RangeError('Presentation ranking limit must be an integer between 1 and 50');
  }

  const root = readRecord(payload, 'payload');
  if (root.contractVersion !== PRESENTATION_CONTRACT_VERSION) {
    return fail('contractVersion', PRESENTATION_CONTRACT_VERSION);
  }
  const generatedAt = readTimestamp(root.generatedAt, 'generatedAt');
  const availableBounds = readAvailableBounds(root.availableBounds);
  const definitions = readCategoryDefinitions(root.categoryDefinitions);
  const current = readSnapshot(root.current, 'current', context.period, context, definitions).snapshot;
  const previousPeriod = readSnapshot(
    root.previousPeriod,
    'previousPeriod',
    context.previousPeriod,
    context,
    definitions,
  ).snapshot;
  const previousYear = readSnapshot(
    root.previousYear,
    'previousYear',
    context.previousYear,
    context,
    definitions,
  ).snapshot;

  const comparisons = buildPresentationComparisons(context.filter, context.period, availableBounds);
  if (
    !rangesEqual(comparisons.previousPeriod.range, context.previousPeriod)
    || !rangesEqual(comparisons.previousYear.range, context.previousYear)
  ) {
    return fail('comparisons', 'compatível com os intervalos enviados à RPC');
  }

  const previousPeriodData = comparisonData(comparisons.previousPeriod, previousPeriod, generatedAt);
  const previousYearData = comparisonData(comparisons.previousYear, previousYear, generatedAt);
  const currentAvailability = snapshotAvailability(current, generatedAt);
  const currentData = dataFromAvailability(currentAvailability);
  const priorData = dataFromAvailability(previousPeriodData.snapshot);
  if (currentData && priorData) {
    currentData.deltas = calculatePresentationDeltas(
      currentData.metrics.managerialResult,
      priorData.metrics.managerialResult,
    );
  }

  const adapted: PresentationSociosData = {
    contractVersion: PRESENTATION_CONTRACT_VERSION,
    generatedAt,
    filter: context.filter,
    period: context.period,
    periodLabel: formatPresentationPeriodLabelPtBR(context.filter, context.period),
    availableBounds,
    current: currentAvailability,
    comparisons: {
      previousPeriod: previousPeriodData,
      previousYear: previousYearData,
    },
    slides: [],
  };
  return attachPresentationResults(adapted);
}

import { useCallback, useMemo } from 'react';
import { useInfiniteQuery, useQueryClient } from '@tanstack/react-query';
import type {
  DataAvailability,
  NormalizedDateRange,
  PresentationPlanCategory,
  PresentationPlanCategoryPage,
  PresentationPlanCoverage,
  PresentationPlanData,
  PresentationPlanMetricSet,
  PresentationPlanSeriesPoint,
  PresentationPlanVariation,
  PresentationProjectionState,
  TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useDataEvent } from '@/lib/dataEvents';

type PresentationPlanRpcArgs = Database['public']['Functions']['get_fin_presentation_plan']['Args'];

export const PRESENTATION_PLAN_QUERY_ROOT = ['financeiro', 'presentation-socios', 'plan'] as const;

export interface PresentationPlanFilters {
  range: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  categoryNature?: 'RECEITA' | 'DESPESA';
  categoryGroup?: string;
  categoryId?: string;
}

export interface PresentationPlanQueryOptions extends PresentationPlanFilters {
  companyId: string | null | undefined;
  enabled: boolean;
  pageSize?: number;
}

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${path} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) throw new TypeError(`${path} deve ser uma lista.`);
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${path} inválido.`);
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  return value === null ? null : readString(value, path);
}

function readNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${path} inválido.`);
  return value;
}

function readNullableNumber(value: unknown, path: string): number | null {
  return value === null ? null : readNumber(value, path);
}

function readInteger(value: unknown, path: string, minimum = 0): number {
  const number = readNumber(value, path);
  if (!Number.isInteger(number) || number < minimum) throw new TypeError(`${path} inválido.`);
  return number;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new TypeError(`${path} inválido.`);
  return value;
}

function readDate(value: unknown, path: string): string {
  const date = readString(value, path);
  if (!ISO_DATE_PATTERN.test(date)) throw new TypeError(`${path} inválida.`);
  return date;
}

function readTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) throw new TypeError(`${path} inválido.`);
  return timestamp;
}

function readMetricSet(value: unknown, path: string): PresentationPlanMetricSet {
  const metric = readRecord(value, path);
  return {
    revenue: readNullableNumber(metric.revenue, `${path}.revenue`),
    expense: readNullableNumber(metric.expense, `${path}.expense`),
    result: readNullableNumber(metric.result, `${path}.result`),
    marginPercent: readNullableNumber(metric.marginPercent, `${path}.marginPercent`),
    cmv: readNullableNumber(metric.cmv, `${path}.cmv`),
    cmvPercent: readNullableNumber(metric.cmvPercent, `${path}.cmvPercent`),
  };
}

function readCoverage(value: unknown, path: string): PresentationPlanCoverage {
  const coverage = readRecord(value, path);
  return {
    configured: readBoolean(coverage.configured, `${path}.configured`),
    complete: readBoolean(coverage.complete, `${path}.complete`),
    actualCovered: readNumber(coverage.actualCovered, `${path}.actualCovered`),
    actualTotal: readNumber(coverage.actualTotal, `${path}.actualTotal`),
  };
}

function readNature(value: unknown, path: string): 'RECEITA' | 'DESPESA' {
  const nature = readString(value, path);
  if (nature !== 'RECEITA' && nature !== 'DESPESA') throw new TypeError(`${path} inválida.`);
  return nature;
}

function readCategory(value: unknown, index: number): PresentationPlanCategory {
  const path = `categories.items[${index}]`;
  const category = readRecord(value, path);
  return {
    categoryId: readString(category.categoryId, `${path}.categoryId`),
    parentCategoryId: readNullableString(category.parentCategoryId, `${path}.parentCategoryId`),
    name: readString(category.name, `${path}.name`),
    nature: readNature(category.nature, `${path}.nature`),
    effectiveGroup: readNullableString(category.effectiveGroup, `${path}.effectiveGroup`),
    depth: readInteger(category.depth, `${path}.depth`),
    directActual: readNumber(category.directActual, `${path}.directActual`),
    actualAmount: readNumber(category.actualAmount, `${path}.actualAmount`),
    directBudget: readNullableNumber(category.directBudget, `${path}.directBudget`),
    budgetAmount: readNullableNumber(category.budgetAmount, `${path}.budgetAmount`),
    actualCoveredAmount: readNumber(category.actualCoveredAmount, `${path}.actualCoveredAmount`),
    budgetConfigured: readBoolean(category.budgetConfigured, `${path}.budgetConfigured`),
    coverageComplete: readBoolean(category.coverageComplete, `${path}.coverageComplete`),
    varianceAmount: readNullableNumber(category.varianceAmount, `${path}.varianceAmount`),
    variancePercent: readNullableNumber(category.variancePercent, `${path}.variancePercent`),
    revenueSharePercent: readNullableNumber(category.revenueSharePercent, `${path}.revenueSharePercent`),
    resultSharePercent: readNullableNumber(category.resultSharePercent, `${path}.resultSharePercent`),
  };
}

function readCategoryPage(value: unknown): PresentationPlanCategoryPage {
  const page = readRecord(value, 'categories');
  return {
    page: readInteger(page.page, 'categories.page', 1),
    pageSize: readInteger(page.pageSize, 'categories.pageSize', 1),
    totalCount: readInteger(page.totalCount, 'categories.totalCount'),
    hasMore: readBoolean(page.hasMore, 'categories.hasMore'),
    items: readArray(page.items, 'categories.items').map(readCategory),
  };
}

function readVariation(value: unknown, path: string): PresentationPlanVariation {
  const variation = readRecord(value, path);
  return {
    categoryId: readString(variation.categoryId, `${path}.categoryId`),
    name: readString(variation.name, `${path}.name`),
    nature: readNature(variation.nature, `${path}.nature`),
    actualAmount: readNumber(variation.actualAmount, `${path}.actualAmount`),
    budgetAmount: readNumber(variation.budgetAmount, `${path}.budgetAmount`),
    varianceAmount: readNumber(variation.varianceAmount, `${path}.varianceAmount`),
    variancePercent: readNullableNumber(variation.variancePercent, `${path}.variancePercent`),
  };
}

function readSeriesPoint(value: unknown, index: number): PresentationPlanSeriesPoint {
  const path = `series[${index}]`;
  const point = readRecord(value, path);
  return {
    key: readString(point.key, `${path}.key`),
    start: readDate(point.start, `${path}.start`),
    endExclusive: readDate(point.endExclusive, `${path}.endExclusive`),
    actual: readMetricSet(point.actual, `${path}.actual`),
    budget: readMetricSet(point.budget, `${path}.budget`),
  };
}

function readProjectionState(value: unknown): PresentationProjectionState {
  const state = readString(value, 'projection.state');
  if (
    state !== 'available'
    && state !== 'insufficient-sample'
    && state !== 'period-complete'
    && state !== 'period-not-started'
  ) {
    throw new TypeError('projection.state inválido.');
  }
  return state;
}

export function parsePresentationPlan(value: unknown): PresentationPlanData {
  const plan = readRecord(value, 'plan');
  const range = readRecord(plan.range, 'range');
  const sources = readRecord(plan.sources, 'sources');
  const rules = readRecord(plan.rules, 'rules');
  const budgetRecord = readRecord(plan.budget, 'budget');
  const coverage = readRecord(plan.coverage, 'coverage');
  const projection = readRecord(plan.projection, 'projection');
  const variations = readRecord(plan.variations, 'variations');
  const contractVersion = readString(plan.contractVersion, 'contractVersion');
  if (contractVersion !== '1.0') throw new TypeError('Versão do contrato de planejamento incompatível.');
  const cmvTargetState = readString(budgetRecord.cmvTargetState, 'budget.cmvTargetState');
  if (!['available', 'not-configured', 'partial', 'mixed-values'].includes(cmvTargetState)) {
    throw new TypeError('budget.cmvTargetState inválido.');
  }
  const actualSource = readString(sources.actual, 'sources.actual');
  const budgetSource = readString(sources.budget, 'sources.budget');
  const cmvTargetSource = readString(sources.cmvTarget, 'sources.cmvTarget');
  const regime = readString(rules.regime, 'rules.regime');
  const openItemsIncluded = readBoolean(rules.openItemsIncluded, 'rules.openItemsIncluded');
  if (actualSource !== 'fin_lancamentos') throw new TypeError('sources.actual inválido.');
  if (budgetSource !== 'fin_orcamentos') throw new TypeError('sources.budget inválido.');
  if (cmvTargetSource !== 'metas_cmv.meta_cmv_total') throw new TypeError('sources.cmvTarget inválido.');
  if (regime !== 'competencia') throw new TypeError('rules.regime inválido.');
  if (openItemsIncluded) throw new TypeError('rules.openItemsIncluded deve ser falso.');

  return {
    contractVersion,
    generatedAt: readTimestamp(plan.generatedAt, 'generatedAt'),
    range: {
      start: readDate(range.start, 'range.start'),
      endExclusive: readDate(range.endExclusive, 'range.endExclusive'),
    },
    sources: {
      actual: actualSource,
      budget: budgetSource,
      cmvTarget: cmvTargetSource,
    },
    rules: {
      regime,
      budgetProration: readString(rules.budgetProration, 'rules.budgetProration'),
      hierarchyPrecedence: readString(rules.hierarchyPrecedence, 'rules.hierarchyPrecedence'),
      projectionFormula: readString(rules.projectionFormula, 'rules.projectionFormula'),
      openItemsIncluded: false,
    },
    actual: readMetricSet(plan.actual, 'actual'),
    budget: {
      ...readMetricSet(plan.budget, 'budget'),
      cmvTargetPercent: readNullableNumber(budgetRecord.cmvTargetPercent, 'budget.cmvTargetPercent'),
      cmvTargetState: cmvTargetState as PresentationPlanData['budget']['cmvTargetState'],
    },
    coverage: {
      revenue: readCoverage(coverage.revenue, 'coverage.revenue'),
      expense: readCoverage(coverage.expense, 'coverage.expense'),
      cmv: readCoverage(coverage.cmv, 'coverage.cmv'),
    },
    projection: {
      state: readProjectionState(projection.state),
      cutoffDate: readDate(projection.cutoffDate, 'projection.cutoffDate'),
      sampleDays: readInteger(projection.sampleDays, 'projection.sampleDays'),
      totalDays: readInteger(projection.totalDays, 'projection.totalDays', 1),
      factor: readNullableNumber(projection.factor, 'projection.factor'),
      metrics: projection.metrics === null ? null : readMetricSet(projection.metrics, 'projection.metrics'),
    },
    series: readArray(plan.series, 'series').map(readSeriesPoint),
    categories: readCategoryPage(plan.categories),
    variations: {
      favorable: readArray(variations.favorable, 'variations.favorable')
        .map((item, index) => readVariation(item, `variations.favorable[${index}]`)),
      unfavorable: readArray(variations.unfavorable, 'variations.unfavorable')
        .map((item, index) => readVariation(item, `variations.unfavorable[${index}]`)),
    },
    hierarchyConflictCount: readInteger(plan.hierarchyConflictCount, 'hierarchyConflictCount'),
  };
}

export function isPresentationPlanPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const shape = error as { code?: unknown; message?: unknown };
  return shape.code === '42501'
    || (typeof shape.message === 'string' && shape.message.includes('PERMISSION_DENIED'));
}

export async function fetchPresentationPlan(
  filters: PresentationPlanFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<PresentationPlanData> {
  const params: PresentationPlanRpcArgs = {
    p_start: filters.range.start,
    p_end_exclusive: filters.range.endExclusive,
    p_granularity: filters.granularity,
    p_category_nature: filters.categoryNature,
    p_category_group: filters.categoryGroup,
    p_category_id: filters.categoryId,
    p_page: page,
    p_page_size: pageSize,
  };
  const request = supabase.rpc('get_fin_presentation_plan', params);
  const { data, error } = signal ? await request.abortSignal(signal) : await request;
  if (error) throw error;
  return parsePresentationPlan(data);
}

export function presentationPlanAvailability(
  enabled: boolean,
  data: PresentationPlanData | undefined,
  error: unknown,
  isPending: boolean,
): DataAvailability<PresentationPlanData> {
  if (!enabled) return { state: 'unavailable', reason: 'permission-denied' };
  if (data) return { state: 'available', data, fetchedAt: data.generatedAt };
  if (isPending) return { state: 'loading' };
  if (isPresentationPlanPermissionError(error)) {
    return { state: 'unavailable', reason: 'permission-denied' };
  }
  if (error) return { state: 'error', message: 'Não foi possível carregar metas, orçamento e projeção.' };
  return { state: 'idle' };
}

export function usePresentationPlan(options: PresentationPlanQueryOptions) {
  const queryClient = useQueryClient();
  const pageSize = options.pageSize ?? 25;
  const query = useInfiniteQuery({
    queryKey: [
      ...PRESENTATION_PLAN_QUERY_ROOT,
      options.companyId ?? 'unresolved',
      options.range.start,
      options.range.endExclusive,
      options.granularity,
      options.categoryNature ?? null,
      options.categoryGroup ?? null,
      options.categoryId ?? null,
      pageSize,
    ],
    queryFn: ({ pageParam, signal }) => fetchPresentationPlan(options, pageParam, pageSize, signal),
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.categories.hasMore
      ? lastPage.categories.page + 1
      : undefined,
    enabled: options.enabled && Boolean(options.companyId),
    retry: (failureCount, error) => failureCount < 1 && !isPresentationPlanPermissionError(error),
  });
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PRESENTATION_PLAN_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);

  const firstPage = query.data?.pages[0];
  const categories = useMemo(
    () => query.data?.pages.flatMap(page => page.categories.items) ?? [],
    [query.data?.pages],
  );
  const availability = useMemo(
    () => presentationPlanAvailability(
      options.enabled,
      firstPage,
      query.error,
      query.isPending,
    ),
    [firstPage, options.enabled, query.error, query.isPending],
  );
  return {
    ...query,
    firstPage,
    categories,
    availability,
  };
}

import { useCallback } from 'react';
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  NormalizedDateRange,
  TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { supabase } from '@/integrations/supabase/client';
import type { Database } from '@/integrations/supabase/types';
import { useDataEvent } from '@/lib/dataEvents';

type DetailRowsRpcArgs = Database['public']['Functions']['get_fin_presentation_detail_rows']['Args'];
type DetailSeriesRpcArgs = Database['public']['Functions']['get_fin_presentation_detail_series']['Args'];

export type PresentationDetailRowKind = 'ledger' | 'payable' | 'receivable';

interface PresentationDetailRowBase {
  id: string;
  kind: PresentationDetailRowKind;
  description: string;
  status: string;
  amount: number;
  categoryName: string | null;
}

export interface PresentationLedgerDetailRow extends PresentationDetailRowBase {
  kind: 'ledger';
  nature: 'RECEITA' | 'DESPESA';
  effectiveDate: string;
  classifiedAmount: number;
  origin: string;
}

export interface PresentationOpenItemDetailRow extends PresentationDetailRowBase {
  kind: 'payable' | 'receivable';
  counterparty: string | null;
  dueDate: string;
  daysOverdue: number;
  dueInDays: number;
}

export type PresentationDetailRow = PresentationLedgerDetailRow | PresentationOpenItemDetailRow;

export interface PresentationDetailRowsPage {
  page: number;
  pageSize: number;
  hasMore: boolean;
  items: readonly PresentationDetailRow[];
}

export interface PresentationDetailSeriesPoint extends NormalizedDateRange {
  key: string;
  amount: number;
  revenue: number;
  revenueSharePercent: number | null;
}

export interface PresentationDetailFilters {
  range: NormalizedDateRange;
  kind: 'ledger' | 'payables' | 'receivables';
  nature?: 'RECEITA' | 'DESPESA';
  categoryId?: string;
  group?: string;
}

export const PRESENTATION_DETAIL_QUERY_ROOT = ['financeiro', 'presentation-detail'] as const;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readRecord(value: unknown, label: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new TypeError(`${label} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, label: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new TypeError(`${label} inválido.`);
  return value;
}

function readNullableString(value: unknown, label: string): string | null {
  return value === null || value === '' ? null : readString(value, label);
}

function readFiniteNumber(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new TypeError(`${label} inválido.`);
  return value;
}

function readInteger(value: unknown, label: string, minimum = 0): number {
  const number = readFiniteNumber(value, label);
  if (!Number.isInteger(number) || number < minimum) throw new TypeError(`${label} inválido.`);
  return number;
}

function readDate(value: unknown, label: string): string {
  const date = readString(value, label);
  if (!ISO_DATE_PATTERN.test(date)) throw new TypeError(`${label} inválida.`);
  return date;
}

function parseRow(value: unknown, index: number): PresentationDetailRow {
  const row = readRecord(value, `items[${index}]`);
  const kind = readString(row.kind, `items[${index}].kind`);
  const base = {
    id: readString(row.id, `items[${index}].id`),
    description: readString(row.description, `items[${index}].description`),
    status: readString(row.status, `items[${index}].status`),
    amount: readFiniteNumber(row.amount, `items[${index}].amount`),
    categoryName: readNullableString(row.categoryName, `items[${index}].categoryName`),
  };

  if (kind === 'ledger') {
    const nature = readString(row.nature, `items[${index}].nature`);
    if (nature !== 'RECEITA' && nature !== 'DESPESA') throw new TypeError('Natureza inválida.');
    return {
      ...base,
      kind,
      nature,
      effectiveDate: readDate(row.effectiveDate, `items[${index}].effectiveDate`),
      classifiedAmount: readFiniteNumber(row.classifiedAmount, `items[${index}].classifiedAmount`),
      origin: readString(row.origin, `items[${index}].origin`),
    };
  }

  if (kind !== 'payable' && kind !== 'receivable') throw new TypeError('Tipo de linha inválido.');
  return {
    ...base,
    kind,
    counterparty: readNullableString(row.counterparty, `items[${index}].counterparty`),
    dueDate: readDate(row.dueDate, `items[${index}].dueDate`),
    daysOverdue: readInteger(row.daysOverdue, `items[${index}].daysOverdue`),
    dueInDays: readInteger(row.dueInDays, `items[${index}].dueInDays`),
  };
}

export function parsePresentationDetailRowsPage(value: unknown): PresentationDetailRowsPage {
  const record = readRecord(value, 'detailRows');
  if (!Array.isArray(record.items)) throw new TypeError('detailRows.items deve ser uma lista.');
  if (typeof record.hasMore !== 'boolean') throw new TypeError('detailRows.hasMore inválido.');
  return {
    page: readInteger(record.page, 'detailRows.page', 1),
    pageSize: readInteger(record.pageSize, 'detailRows.pageSize', 1),
    hasMore: record.hasMore,
    items: record.items.map(parseRow),
  };
}

export function parsePresentationDetailSeries(value: unknown): readonly PresentationDetailSeriesPoint[] {
  if (!Array.isArray(value)) throw new TypeError('detailSeries deve ser uma lista.');
  return value.map((item, index) => {
    const point = readRecord(item, `detailSeries[${index}]`);
    const revenueShare = point.revenueSharePercent;
    return {
      key: readString(point.key, `detailSeries[${index}].key`),
      start: readDate(point.start, `detailSeries[${index}].start`),
      endExclusive: readDate(point.endExclusive, `detailSeries[${index}].endExclusive`),
      amount: readFiniteNumber(point.amount, `detailSeries[${index}].amount`),
      revenue: readFiniteNumber(point.revenue, `detailSeries[${index}].revenue`),
      revenueSharePercent: revenueShare === null
        ? null
        : readFiniteNumber(revenueShare, `detailSeries[${index}].revenueSharePercent`),
    };
  });
}

function detailKey(filters: PresentationDetailFilters): readonly unknown[] {
  return [
    ...PRESENTATION_DETAIL_QUERY_ROOT,
    filters.kind,
    filters.range.start,
    filters.range.endExclusive,
    filters.nature ?? null,
    filters.categoryId ?? null,
    filters.group ?? null,
  ] as const;
}

export function isPresentationDetailPermissionError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  const shape = error as { code?: unknown; message?: unknown };
  return shape.code === '42501'
    || (typeof shape.message === 'string' && (
      shape.message.includes('PERMISSION_DENIED')
      || shape.message.includes('PRESENTATION_CATEGORY_OUT_OF_SCOPE')
    ));
}

export async function fetchPresentationDetailRows(
  filters: PresentationDetailFilters,
  page: number,
  pageSize: number,
  signal?: AbortSignal,
): Promise<PresentationDetailRowsPage> {
  const params: DetailRowsRpcArgs = {
    p_start: filters.range.start,
    p_end_exclusive: filters.range.endExclusive,
    p_kind: filters.kind,
    p_nature: filters.nature,
    p_category_id: filters.categoryId,
    p_group: filters.group,
    p_page: page,
    p_page_size: pageSize,
  };
  const request = supabase.rpc('get_fin_presentation_detail_rows', params);
  const { data, error } = signal ? await request.abortSignal(signal) : await request;
  if (error) throw error;
  return parsePresentationDetailRowsPage(data);
}

export async function fetchPresentationDetailSeries(
  filters: Omit<PresentationDetailFilters, 'kind'>,
  granularity: TimeSeriesGranularity,
  signal?: AbortSignal,
): Promise<readonly PresentationDetailSeriesPoint[]> {
  const params: DetailSeriesRpcArgs = {
    p_start: filters.range.start,
    p_end_exclusive: filters.range.endExclusive,
    p_granularity: granularity,
    p_nature: filters.nature,
    p_category_id: filters.categoryId,
    p_group: filters.group,
  };
  const request = supabase.rpc('get_fin_presentation_detail_series', params);
  const { data, error } = signal ? await request.abortSignal(signal) : await request;
  if (error) throw error;
  return parsePresentationDetailSeries(data);
}

export function usePresentationDetailRows(
  filters: PresentationDetailFilters,
  enabled: boolean,
  companyId: string | null | undefined,
  pageSize = 25,
) {
  const queryClient = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: [...detailKey(filters), companyId ?? 'unresolved', 'rows', pageSize],
    queryFn: ({ pageParam, signal }) => fetchPresentationDetailRows(filters, pageParam, pageSize, signal),
    initialPageParam: 1,
    getNextPageParam: lastPage => lastPage.hasMore ? lastPage.page + 1 : undefined,
    enabled: enabled && Boolean(companyId),
    retry: (failureCount, error) => failureCount < 1 && !isPresentationDetailPermissionError(error),
  });
  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: PRESENTATION_DETAIL_QUERY_ROOT });
  }, [queryClient]);
  useDataEvent('financeiro:*', invalidate);
  return query;
}

export function usePresentationDetailSeries(
  filters: Omit<PresentationDetailFilters, 'kind'>,
  granularity: TimeSeriesGranularity,
  enabled: boolean,
  companyId: string | null | undefined,
) {
  return useQuery({
    queryKey: [...detailKey({ ...filters, kind: 'ledger' }), companyId ?? 'unresolved', 'series', granularity],
    queryFn: ({ signal }) => fetchPresentationDetailSeries(filters, granularity, signal),
    enabled: enabled && Boolean(companyId),
    retry: (failureCount, error) => failureCount < 1 && !isPresentationDetailPermissionError(error),
  });
}

import {
  PRESENTATION_EXPENSES_CONTRACT_VERSION,
  isPresentationYearMonth,
  type PresentationExpenseDetailCursor,
  type PresentationExpenseDetailRow,
  type PresentationExpenseDetailsPage,
} from '@/domain/financeiro/presentation';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export class PresentationExpenseDetailsPayloadError extends Error {
  constructor(readonly path: string) {
    super(`Payload inválido do detalhe de Despesas em ${path}.`);
    this.name = 'PresentationExpenseDetailsPayloadError';
  }
}

function fail(path: string): never { throw new PresentationExpenseDetailsPayloadError(path); }
function record(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return fail(path);
  return value as Record<string, unknown>;
}
function text(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) return fail(path);
  return value;
}
function uuid(value: unknown, path: string): string {
  const parsed = text(value, path);
  return UUID_PATTERN.test(parsed) ? parsed : fail(path);
}
function nullableUuid(value: unknown, path: string): string | null {
  return value === null ? null : uuid(value, path);
}
function number(value: unknown, path: string): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fail(path);
}
function integer(value: unknown, path: string, minimum: number): number {
  const parsed = number(value, path);
  return Number.isInteger(parsed) && parsed >= minimum ? parsed : fail(path);
}
function boolean(value: unknown, path: string): boolean {
  return typeof value === 'boolean' ? value : fail(path);
}
function date(value: unknown, path: string): string {
  const parsed = text(value, path);
  return ISO_DATE_PATTERN.test(parsed) ? parsed : fail(path);
}
function source(value: unknown, path: string): 'allocation' | 'entry' {
  return value === 'allocation' || value === 'entry' ? value : fail(path);
}
function operationalClass(value: unknown, path: string): 'operational' | 'non-operational' {
  return value === 'operational' || value === 'non-operational' ? value : fail(path);
}

function readCursor(value: unknown): PresentationExpenseDetailCursor {
  const item = record(value, 'nextCursor');
  if (item.state === 'end') return { state: 'end' };
  if (item.state !== 'available') return fail('nextCursor.state');
  return {
    state: 'available',
    effectiveDate: date(item.effectiveDate, 'nextCursor.effectiveDate'),
    ledgerId: uuid(item.ledgerId, 'nextCursor.ledgerId'),
    allocationSource: source(item.allocationSource, 'nextCursor.allocationSource'),
    allocationId: uuid(item.allocationId, 'nextCursor.allocationId'),
  };
}

function readRow(value: unknown, index: number): PresentationExpenseDetailRow {
  const path = `items[${index}]`;
  const item = record(value, path);
  return {
    allocationId: uuid(item.allocationId, `${path}.allocationId`),
    allocationSource: source(item.allocationSource, `${path}.allocationSource`),
    ledgerId: uuid(item.ledgerId, `${path}.ledgerId`),
    effectiveDate: date(item.effectiveDate, `${path}.effectiveDate`),
    description: text(item.description, `${path}.description`),
    status: text(item.status, `${path}.status`),
    origin: text(item.origin, `${path}.origin`),
    categoryId: nullableUuid(item.categoryId, `${path}.categoryId`),
    categoryName: text(item.categoryName, `${path}.categoryName`),
    operationalClass: operationalClass(item.operationalClass, `${path}.operationalClass`),
    amount: number(item.amount, `${path}.amount`),
  };
}

export function adaptPresentationExpenseDetailsPayload(value: unknown): PresentationExpenseDetailsPage {
  const payload = record(value, 'payload');
  if (payload.contractVersion !== PRESENTATION_EXPENSES_CONTRACT_VERSION) return fail('contractVersion');
  const payloadSource = record(payload.source, 'source');
  if (payloadSource.report !== 'DFC' || payloadSource.regime !== 'caixa') return fail('source');
  const month = text(payload.month, 'month');
  if (!isPresentationYearMonth(month)) return fail('month');
  const limit = integer(payload.limit, 'limit', 1);
  if (limit > 100) return fail('limit');
  const hasMore = boolean(payload.hasMore, 'hasMore');
  const nextCursor = readCursor(payload.nextCursor);
  if (hasMore !== (nextCursor.state === 'available')) return fail('nextCursor');
  const itemsValue = payload.items;
  if (!Array.isArray(itemsValue) || itemsValue.length > limit) return fail('items');
  const generatedAt = text(payload.generatedAt, 'generatedAt');
  if (!Number.isFinite(Date.parse(generatedAt))) return fail('generatedAt');
  return {
    contractVersion: PRESENTATION_EXPENSES_CONTRACT_VERSION,
    source: { report: 'DFC', regime: 'caixa' },
    month,
    categoryId: nullableUuid(payload.categoryId, 'categoryId'),
    limit,
    hasMore,
    nextCursor,
    items: itemsValue.map(readRow),
    generatedAt,
  };
}

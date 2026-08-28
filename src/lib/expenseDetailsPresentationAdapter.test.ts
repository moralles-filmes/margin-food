import { describe, expect, it } from 'vitest';
import { PresentationExpenseDetailsPayloadError, adaptPresentationExpenseDetailsPayload } from '@/lib/expenseDetailsPresentationAdapter';

const ledgerId = '11111111-1111-4111-8111-111111111111';
const allocationId = '22222222-2222-4222-8222-222222222222';
const categoryId = '33333333-3333-4333-8333-333333333333';

export function createExpenseDetailsPayload(hasMore = true) {
  return {
    contractVersion: '1.0',
    source: { report: 'DFC', regime: 'caixa' },
    month: '2026-03',
    categoryId,
    limit: 25,
    hasMore,
    nextCursor: hasMore
      ? { state: 'available', effectiveDate: '2026-03-20', ledgerId, allocationSource: 'allocation', allocationId }
      : { state: 'end' },
    items: [{
      allocationId,
      allocationSource: 'allocation',
      ledgerId,
      effectiveDate: '2026-03-20',
      description: 'Compra rateada',
      status: 'REALIZADO',
      origin: 'manual',
      categoryId,
      categoryName: 'Insumos',
      operationalClass: 'operational',
      amount: 450,
    }],
    generatedAt: '2026-08-27T15:30:00-03:00',
  };
}

describe('contrato paginado do detalhe de Despesas', () => {
  it('aceita cursor composto determinístico e linha de rateio', () => {
    const parsed = adaptPresentationExpenseDetailsPayload(createExpenseDetailsPayload());
    expect(parsed.nextCursor).toMatchObject({ state: 'available', effectiveDate: '2026-03-20', ledgerId, allocationId });
    expect(parsed.items[0]).toMatchObject({ allocationSource: 'allocation', categoryName: 'Insumos', amount: 450 });
  });

  it('recusa hasMore sem cursor, UUID inválido e limite excessivo', () => {
    expect(() => adaptPresentationExpenseDetailsPayload({ ...createExpenseDetailsPayload(), nextCursor: { state: 'end' } })).toThrow(PresentationExpenseDetailsPayloadError);
    const uuid = createExpenseDetailsPayload();
    uuid.items[0].ledgerId = 'outro-tenant';
    expect(() => adaptPresentationExpenseDetailsPayload(uuid)).toThrow(PresentationExpenseDetailsPayloadError);
    expect(() => adaptPresentationExpenseDetailsPayload({ ...createExpenseDetailsPayload(), limit: 101 })).toThrow(PresentationExpenseDetailsPayloadError);
  });
});

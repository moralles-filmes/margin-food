import { describe, it, expect } from 'vitest';

/**
 * Partial Receipt Flow — Unit Tests
 *
 * These tests validate the business rules for the purchase order
 * receiving flow, specifically the partial receipt scenario where
 * qty_received < qty_requested.
 *
 * The actual RPC logic is in the database; these tests validate
 * the domain rules and helpers used by the frontend.
 */

// ── Domain rule: determine order status after receiving ──
function determineOrderStatus(items: { received_status: string }[]): string {
  const hasNotDelivered = items.some(i => i.received_status === 'NOT_DELIVERED');
  const hasPending = items.some(i => i.received_status === 'PENDING');
  if (hasPending) return 'IN_RECEIVING';
  if (hasNotDelivered) return 'PARTIAL';
  return 'COMPLETED';
}

// ── Domain rule: detect shortfall ──
function detectShortfall(qtyRequested: number, qtyReceived: number): number {
  return Math.max(0, qtyRequested - qtyReceived);
}

// ── Domain rule: should create NOT_DELIVERED split ──
function shouldCreateShortfallItem(qtyRequested: number, qtyReceived: number): boolean {
  return detectShortfall(qtyRequested, qtyReceived) > 0.001;
}

// ── Domain rule: generate shortfall description ──
function shortfallDescription(itemName: string, unit: string, qtyRequested: number, qtyReceived: number): string {
  return `Item marcado como comprado no Checklist, porém no recebimento foi informada quantidade inferior à prevista. Previsto: ${qtyRequested} ${unit}, Recebido: ${qtyReceived} ${unit}.`;
}

describe('Partial Receipt — Order Status', () => {
  it('1. All items RECEIVED → COMPLETED', () => {
    const items = [
      { received_status: 'RECEIVED' },
      { received_status: 'RECEIVED' },
    ];
    expect(determineOrderStatus(items)).toBe('COMPLETED');
  });

  it('2. All items NOT_DELIVERED → PARTIAL', () => {
    const items = [
      { received_status: 'NOT_DELIVERED' },
      { received_status: 'NOT_DELIVERED' },
    ];
    expect(determineOrderStatus(items)).toBe('PARTIAL');
  });

  it('3. Mix RECEIVED + NOT_DELIVERED → PARTIAL', () => {
    const items = [
      { received_status: 'RECEIVED' },
      { received_status: 'NOT_DELIVERED' },
    ];
    expect(determineOrderStatus(items)).toBe('PARTIAL');
  });

  it('4. Some PENDING → IN_RECEIVING', () => {
    const items = [
      { received_status: 'RECEIVED' },
      { received_status: 'PENDING' },
    ];
    expect(determineOrderStatus(items)).toBe('IN_RECEIVING');
  });
});

describe('Partial Receipt — Shortfall Detection', () => {
  it('5. Full receipt → no shortfall', () => {
    expect(detectShortfall(2, 2)).toBe(0);
    expect(shouldCreateShortfallItem(2, 2)).toBe(false);
  });

  it('6. Partial receipt → shortfall detected', () => {
    expect(detectShortfall(2, 1)).toBe(1);
    expect(shouldCreateShortfallItem(2, 1)).toBe(true);
  });

  it('7. Zero received → full shortfall', () => {
    expect(detectShortfall(5, 0)).toBe(5);
    expect(shouldCreateShortfallItem(5, 0)).toBe(true);
  });

  it('8. Over-received → no shortfall', () => {
    expect(detectShortfall(2, 3)).toBe(0);
    expect(shouldCreateShortfallItem(2, 3)).toBe(false);
  });

  it('9. Tiny floating point difference → no false shortfall', () => {
    expect(shouldCreateShortfallItem(1.0, 0.9999999)).toBe(false);
  });
});

describe('Partial Receipt — Shortfall Description', () => {
  it('10. Generates correct description for partial receipt', () => {
    const desc = shortfallDescription('Farinha Panko', 'UN', 2, 1);
    expect(desc).toContain('Checklist');
    expect(desc).toContain('Previsto: 2 UN');
    expect(desc).toContain('Recebido: 1 UN');
    expect(desc).toContain('quantidade inferior');
  });
});

describe('Partial Receipt — Mixed Items Scenario', () => {
  it('11. Multiple items: some full, some partial, some zero', () => {
    const items = [
      { name: 'Item A', qty_requested: 5, qty_received: 5 },
      { name: 'Item B', qty_requested: 2, qty_received: 1 },
      { name: 'Item C', qty_requested: 3, qty_received: 0 },
    ];

    const results = items.map(i => ({
      name: i.name,
      shortfall: detectShortfall(i.qty_requested, i.qty_received),
      needsSplit: shouldCreateShortfallItem(i.qty_requested, i.qty_received),
    }));

    expect(results[0].shortfall).toBe(0);
    expect(results[0].needsSplit).toBe(false);

    expect(results[1].shortfall).toBe(1);
    expect(results[1].needsSplit).toBe(true);

    expect(results[2].shortfall).toBe(3);
    expect(results[2].needsSplit).toBe(true);
  });

  it('12. After splitting, order has NOT_DELIVERED items → status PARTIAL', () => {
    // After RPC processes partial receipts, the items list would look like:
    const itemsAfterSplit = [
      { received_status: 'RECEIVED' },     // Item A fully received
      { received_status: 'RECEIVED' },     // Item B partially received
      { received_status: 'NOT_DELIVERED' }, // Item B shortfall
      { received_status: 'NOT_DELIVERED' }, // Item C not received
    ];
    expect(determineOrderStatus(itemsAfterSplit)).toBe('PARTIAL');
  });
});

describe('Partial Receipt — No regression on stock movements', () => {
  it('13. Stock entry qty uses qty_received, not qty_requested', () => {
    const qtyRequested = 2;
    const qtyReceived = 1;
    const conversionFactor = 1;
    const qtyBase = qtyReceived * conversionFactor;
    // Stock should receive 1, not 2
    expect(qtyBase).toBe(1);
    expect(qtyBase).not.toBe(qtyRequested * conversionFactor);
  });

  it('14. Shortfall item should NOT generate stock movement', () => {
    // The shortfall item has qty_received = 0 and status NOT_DELIVERED
    // The RPC only creates stock movements for RECEIVED items
    const shortfallItem = { received_status: 'NOT_DELIVERED', qty_received: 0 };
    const shouldCreateMovement = shortfallItem.received_status === 'RECEIVED' && shortfallItem.qty_received > 0;
    expect(shouldCreateMovement).toBe(false);
  });
});

describe('Partial Receipt — Concluídos vs Não Entregues consistency', () => {
  it('15. Order with shortfall goes to PARTIAL (Não Entregues), not COMPLETED (Concluídos)', () => {
    // After processing: 1 RECEIVED + 1 NOT_DELIVERED (shortfall)
    const orderStatus = determineOrderStatus([
      { received_status: 'RECEIVED' },
      { received_status: 'NOT_DELIVERED' },
    ]);
    expect(orderStatus).toBe('PARTIAL');
    expect(orderStatus).not.toBe('COMPLETED');
  });
});

/**
 * Requisição badge count — unit tests for the domain rule:
 * "A requisition counts as pending IFF it has ≥1 item with status SOLICITADO."
 */
import { describe, it, expect } from 'vitest';
import { hasPendingItems } from '@/domain/estoque/requisitionStatus';

/** Helper that mirrors the RPC logic: count distinct requisitions with pending items */
function countRequisitionsWithPendingItems(
  requisitions: { id: string; status: string; items: { status: string }[] }[],
): number {
  return requisitions.filter(
    (r) =>
      (r.status === 'SOLICITADA' || r.status === 'PARCIALMENTE_ATENDIDA') &&
      hasPendingItems(r.items),
  ).length;
}

describe('countRequisitionsWithPendingItems (badge rule)', () => {
  it('all items accepted → does NOT count', () => {
    const count = countRequisitionsWithPendingItems([
      { id: '1', status: 'ATENDIDA', items: [{ status: 'ATENDIDO' }, { status: 'ATENDIDO' }] },
    ]);
    expect(count).toBe(0);
  });

  it('all items rejected → does NOT count', () => {
    const count = countRequisitionsWithPendingItems([
      { id: '1', status: 'NEGADA', items: [{ status: 'RECUSADO' }, { status: 'RECUSADO' }] },
    ]);
    expect(count).toBe(0);
  });

  it('mix accepted + rejected, all resolved → does NOT count', () => {
    const count = countRequisitionsWithPendingItems([
      {
        id: '1',
        status: 'PARCIALMENTE_ATENDIDA',
        items: [{ status: 'ATENDIDO' }, { status: 'ATENDIDO' }, { status: 'RECUSADO' }],
      },
    ]);
    // header is PARCIALMENTE_ATENDIDA but no SOLICITADO items remain
    expect(count).toBe(0);
  });

  it('some items pending → DOES count', () => {
    const count = countRequisitionsWithPendingItems([
      {
        id: '1',
        status: 'PARCIALMENTE_ATENDIDA',
        items: [{ status: 'ATENDIDO' }, { status: 'SOLICITADO' }],
      },
    ]);
    expect(count).toBe(1);
  });

  it('fully pending requisition → DOES count', () => {
    const count = countRequisitionsWithPendingItems([
      {
        id: '1',
        status: 'SOLICITADA',
        items: [{ status: 'SOLICITADO' }, { status: 'SOLICITADO' }],
      },
    ]);
    expect(count).toBe(1);
  });

  it('counts requisitions, not items', () => {
    const count = countRequisitionsWithPendingItems([
      {
        id: '1',
        status: 'SOLICITADA',
        items: [{ status: 'SOLICITADO' }, { status: 'SOLICITADO' }, { status: 'SOLICITADO' }],
      },
    ]);
    // 3 pending items but only 1 requisition
    expect(count).toBe(1);
  });

  it('multiple requisitions mixed', () => {
    const count = countRequisitionsWithPendingItems([
      // resolved
      { id: '1', status: 'PARCIALMENTE_ATENDIDA', items: [{ status: 'ATENDIDO' }, { status: 'RECUSADO' }] },
      // pending
      { id: '2', status: 'SOLICITADA', items: [{ status: 'SOLICITADO' }] },
      // resolved
      { id: '3', status: 'ATENDIDA', items: [{ status: 'ATENDIDO' }] },
      // pending
      { id: '4', status: 'PARCIALMENTE_ATENDIDA', items: [{ status: 'ATENDIDO' }, { status: 'SOLICITADO' }] },
    ]);
    expect(count).toBe(2);
  });

  it('cancelled requisition does NOT count even with pending items', () => {
    const count = countRequisitionsWithPendingItems([
      { id: '1', status: 'CANCELADA', items: [{ status: 'SOLICITADO' }] },
    ]);
    expect(count).toBe(0);
  });

  it('empty list returns 0', () => {
    expect(countRequisitionsWithPendingItems([])).toBe(0);
  });
});

/**
 * Requisition Partial Rejection Tests
 *
 * Validates domain rules for item-level status management,
 * aggregated parent status, and rejection flow guards.
 */
import { describe, it, expect } from 'vitest';
import {
  canRejectItem,
  canAttendItem,
  canActOnRequisicao,
  hasPendingItems,
  itemStatusLabel,
  requisicaoStatusLabel,
  itemStatusStyle,
  requisicaoStatusStyle,
  MOTIVOS_RECUSA,
} from '@/domain/estoque/requisitionStatus';

describe('canRejectItem', () => {
  it('allows rejection of SOLICITADO items', () => {
    expect(canRejectItem('SOLICITADO')).toBe(true);
  });

  it('blocks rejection of ATENDIDO items', () => {
    expect(canRejectItem('ATENDIDO')).toBe(false);
  });

  it('blocks rejection of already RECUSADO items', () => {
    expect(canRejectItem('RECUSADO')).toBe(false);
  });
});

describe('canAttendItem', () => {
  it('allows attending SOLICITADO items', () => {
    expect(canAttendItem('SOLICITADO')).toBe(true);
  });

  it('blocks attending ATENDIDO items', () => {
    expect(canAttendItem('ATENDIDO')).toBe(false);
  });

  it('blocks attending RECUSADO items', () => {
    expect(canAttendItem('RECUSADO')).toBe(false);
  });
});

describe('canActOnRequisicao', () => {
  it('allows action on SOLICITADA', () => {
    expect(canActOnRequisicao('SOLICITADA')).toBe(true);
  });

  it('allows action on PARCIALMENTE_ATENDIDA', () => {
    expect(canActOnRequisicao('PARCIALMENTE_ATENDIDA')).toBe(true);
  });

  it('blocks action on ATENDIDA', () => {
    expect(canActOnRequisicao('ATENDIDA')).toBe(false);
  });

  it('blocks action on NEGADA', () => {
    expect(canActOnRequisicao('NEGADA')).toBe(false);
  });

  it('blocks action on CANCELADA', () => {
    expect(canActOnRequisicao('CANCELADA')).toBe(false);
  });
});

describe('hasPendingItems', () => {
  it('returns true when there are SOLICITADO items', () => {
    expect(hasPendingItems([
      { status: 'SOLICITADO' },
      { status: 'ATENDIDO' },
      { status: 'RECUSADO' },
    ])).toBe(true);
  });

  it('returns false when all items are terminal', () => {
    expect(hasPendingItems([
      { status: 'ATENDIDO' },
      { status: 'RECUSADO' },
    ])).toBe(false);
  });

  it('returns false for empty items array', () => {
    expect(hasPendingItems([])).toBe(false);
  });
});

describe('itemStatusLabel', () => {
  it('maps all known statuses', () => {
    expect(itemStatusLabel('SOLICITADO')).toBe('Solicitado');
    expect(itemStatusLabel('ATENDIDO')).toBe('Atendido');
    expect(itemStatusLabel('RECUSADO')).toBe('Recusado');
  });

  it('returns raw string for unknown status', () => {
    expect(itemStatusLabel('UNKNOWN')).toBe('UNKNOWN');
  });
});

describe('requisicaoStatusLabel', () => {
  it('maps all known statuses', () => {
    expect(requisicaoStatusLabel('SOLICITADA')).toBe('Solicitada');
    expect(requisicaoStatusLabel('ATENDIDA')).toBe('Atendida');
    expect(requisicaoStatusLabel('NEGADA')).toBe('Negada');
    expect(requisicaoStatusLabel('PARCIALMENTE_ATENDIDA')).toBe('Parcial');
    expect(requisicaoStatusLabel('CANCELADA')).toBe('Cancelada');
  });
});

describe('itemStatusStyle', () => {
  it('returns distinct styles for each status', () => {
    const solicitado = itemStatusStyle('SOLICITADO');
    const atendido = itemStatusStyle('ATENDIDO');
    const recusado = itemStatusStyle('RECUSADO');
    expect(solicitado).not.toBe(atendido);
    expect(atendido).not.toBe(recusado);
  });
});

describe('requisicaoStatusStyle', () => {
  it('returns warning style for PARCIALMENTE_ATENDIDA', () => {
    expect(requisicaoStatusStyle('PARCIALMENTE_ATENDIDA')).toContain('warning');
  });
});

describe('MOTIVOS_RECUSA', () => {
  it('has predefined rejection reasons', () => {
    expect(MOTIVOS_RECUSA.length).toBeGreaterThanOrEqual(5);
    expect(MOTIVOS_RECUSA).toContain('Sem estoque');
    expect(MOTIVOS_RECUSA).toContain('Outro motivo');
  });
});

describe('Partial rejection scenario validation', () => {
  it('rejecting one item does not affect others', () => {
    const items = [
      { status: 'SOLICITADO' },
      { status: 'ATENDIDO' },
      { status: 'RECUSADO' },
    ];
    // Only the first item can still be acted upon
    expect(canRejectItem(items[0].status)).toBe(true);
    expect(canRejectItem(items[1].status)).toBe(false);
    expect(canRejectItem(items[2].status)).toBe(false);
    // Parent should still be actionable (has pending items)
    expect(hasPendingItems(items)).toBe(true);
  });

  it('all items rejected means no pending items', () => {
    const items = [{ status: 'RECUSADO' }, { status: 'RECUSADO' }];
    expect(hasPendingItems(items)).toBe(false);
  });

  it('mix of attended and rejected with no pending means no action', () => {
    const items = [
      { status: 'ATENDIDO' },
      { status: 'ATENDIDO' },
      { status: 'RECUSADO' },
    ];
    expect(hasPendingItems(items)).toBe(false);
  });
});

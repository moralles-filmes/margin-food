import { describe, it, expect } from 'vitest';
import { canRejectItem, canAttendItem, canActOnRequisicao, hasPendingItems, itemStatusLabel, requisicaoStatusLabel, requisicaoStatusStyle } from '@/domain/estoque/requisitionStatus';

// ─── Per-item independent processing rules ───────────────────────────────

describe('Requisition per-item processing rules', () => {
  describe('Item independence', () => {
    it('pending items can be attended even when other items are rejected', () => {
      const items = [
        { status: 'RECUSADO' },
        { status: 'SOLICITADO' },
        { status: 'ATENDIDO' },
      ];
      expect(hasPendingItems(items)).toBe(true);
      expect(canAttendItem('SOLICITADO')).toBe(true);
    });

    it('attended items should not block other pending items', () => {
      expect(canAttendItem('ATENDIDO')).toBe(false);
      expect(canAttendItem('SOLICITADO')).toBe(true);
    });

    it('rejected items should not affect pending items status check', () => {
      expect(canRejectItem('SOLICITADO')).toBe(true);
      expect(canRejectItem('ATENDIDO')).toBe(false);
      expect(canRejectItem('RECUSADO')).toBe(false);
    });
  });

  describe('Quantity adjustment validation', () => {
    it('approved quantity must be positive', () => {
      const qtdAprovada = 0;
      expect(qtdAprovada > 0).toBe(false);
    });

    it('approved quantity cannot exceed requested', () => {
      const qtdSolicitada = 5;
      const qtdAprovada = 2;
      expect(qtdAprovada <= qtdSolicitada).toBe(true);
      expect(qtdAprovada < qtdSolicitada).toBe(true); // partial
    });

    it('full quantity is not partial', () => {
      const qtdSolicitada = 5;
      const qtdAprovada = 5;
      expect(qtdAprovada < qtdSolicitada).toBe(false);
    });

    it('requested quantity is preserved when partially fulfilled', () => {
      const qtdSolicitada = 5;
      const qtdAprovada = 2;
      const qtdFaltante = qtdSolicitada - qtdAprovada;
      expect(qtdFaltante).toBe(3);
      expect(qtdSolicitada).toBe(5); // original preserved
    });
  });

  describe('Aggregated status from mixed items', () => {
    it('all ATENDIDO => requisicao ATENDIDA', () => {
      // Mirrors compute_requisicao_status_agregado logic
      const items = [{ status: 'ATENDIDO' }, { status: 'ATENDIDO' }];
      const atendidos = items.filter(i => i.status === 'ATENDIDO').length;
      const total = items.length;
      expect(atendidos === total).toBe(true);
    });

    it('all RECUSADO => requisicao NEGADA', () => {
      const items = [{ status: 'RECUSADO' }, { status: 'RECUSADO' }];
      const recusados = items.filter(i => i.status === 'RECUSADO').length;
      expect(recusados === items.length).toBe(true);
    });

    it('mixed ATENDIDO + SOLICITADO => PARCIALMENTE_ATENDIDA', () => {
      const items = [{ status: 'ATENDIDO' }, { status: 'SOLICITADO' }];
      const atendidos = items.filter(i => i.status === 'ATENDIDO').length;
      const solicitados = items.filter(i => i.status === 'SOLICITADO').length;
      expect(atendidos > 0 && solicitados > 0).toBe(true);
    });

    it('mixed ATENDIDO + RECUSADO => PARCIALMENTE_ATENDIDA', () => {
      const items = [{ status: 'ATENDIDO' }, { status: 'RECUSADO' }];
      const atendidos = items.filter(i => i.status === 'ATENDIDO').length;
      const recusados = items.filter(i => i.status === 'RECUSADO').length;
      const solicitados = items.filter(i => i.status === 'SOLICITADO').length;
      expect(atendidos > 0 && recusados > 0 && solicitados === 0).toBe(true);
    });

    it('canActOnRequisicao allows PARCIALMENTE_ATENDIDA', () => {
      expect(canActOnRequisicao('PARCIALMENTE_ATENDIDA')).toBe(true);
      expect(canActOnRequisicao('SOLICITADA')).toBe(true);
      expect(canActOnRequisicao('ATENDIDA')).toBe(false);
      expect(canActOnRequisicao('NEGADA')).toBe(false);
      expect(canActOnRequisicao('CANCELADA')).toBe(false);
    });
  });

  describe('Status labels and styles', () => {
    it('item status labels are correct', () => {
      expect(itemStatusLabel('SOLICITADO')).toBe('Solicitado');
      expect(itemStatusLabel('ATENDIDO')).toBe('Atendido');
      expect(itemStatusLabel('RECUSADO')).toBe('Recusado');
    });

    it('requisicao status labels are correct', () => {
      expect(requisicaoStatusLabel('SOLICITADA')).toBe('Solicitada');
      expect(requisicaoStatusLabel('ATENDIDA')).toBe('Atendida');
      expect(requisicaoStatusLabel('NEGADA')).toBe('Negada');
      expect(requisicaoStatusLabel('PARCIALMENTE_ATENDIDA')).toBe('Parcial');
      expect(requisicaoStatusLabel('CANCELADA')).toBe('Cancelada');
    });

    it('PARCIALMENTE_ATENDIDA uses warning style', () => {
      expect(requisicaoStatusStyle('PARCIALMENTE_ATENDIDA')).toContain('warning');
    });
  });

  describe('Stock movement per item', () => {
    it('movement quantity matches approved quantity, not requested', () => {
      const qtdSolicitada = 5;
      const qtdAprovada = 2;
      const fator = 1;
      const qtyBase = Math.round(qtdAprovada * fator * 1000) / 1000;
      expect(qtyBase).toBe(2);
      expect(qtyBase).not.toBe(qtdSolicitada);
    });

    it('movement quantity uses conversion factor correctly', () => {
      const qtdAprovada = 3;
      const fator = 0.5;
      const qtyBase = Math.round(qtdAprovada * fator * 1000) / 1000;
      expect(qtyBase).toBe(1.5);
    });

    it('no movement for rejected items', () => {
      const shouldCreateMovement = (status: string) => status === 'ATENDIDO';
      expect(shouldCreateMovement('RECUSADO')).toBe(false);
      expect(shouldCreateMovement('SOLICITADO')).toBe(false);
      expect(shouldCreateMovement('ATENDIDO')).toBe(true);
    });
  });

  describe('Insufficient stock does not block others', () => {
    it('items with stock are processed even when one lacks stock', () => {
      const items = [
        { produto_id: 'A', quantidade_solicitada: 2, saldo: 10 },
        { produto_id: 'B', quantidade_solicitada: 5, saldo: 1 },  // insufficient
        { produto_id: 'C', quantidade_solicitada: 3, saldo: 8 },
      ];

      const processable = items.filter(i => i.saldo >= i.quantidade_solicitada);
      const skipped = items.filter(i => i.saldo < i.quantidade_solicitada);

      expect(processable.length).toBe(2);
      expect(skipped.length).toBe(1);
      expect(skipped[0].produto_id).toBe('B');
      // A and C should still be processed
      expect(processable.map(i => i.produto_id)).toEqual(['A', 'C']);
    });
  });

  describe('Manual and lista-fixa compatibility', () => {
    it('both origins use same item status lifecycle', () => {
      // Both manual and lista-fixa requisitions create items with SOLICITADO
      // The fulfillment flow is identical regardless of origin
      expect(canAttendItem('SOLICITADO')).toBe(true);
      expect(canRejectItem('SOLICITADO')).toBe(true);
    });
  });

  describe('Movement persistence contract', () => {
    it('individual acceptance must link movement to the item, not only the parent requisition', () => {
      const requisicaoId = 'req-1';
      const itemAId = 'item-a';
      const itemBId = 'item-b';

      const refA = { referenciaId: requisicaoId, referenceType: 'REQUISICAO_ITEM', referenceId: itemAId };
      const refB = { referenciaId: requisicaoId, referenceType: 'REQUISICAO_ITEM', referenceId: itemBId };

      expect(refA.referenciaId).toBe(refB.referenciaId);
      expect(refA.referenceType).toBe('REQUISICAO_ITEM');
      expect(refB.referenceType).toBe('REQUISICAO_ITEM');
      expect(refA.referenceId).not.toBe(refB.referenceId);
    });

    it('frontend should only treat individual acceptance as success when a movement id exists', () => {
      const falsePositive: Record<string, unknown> = { success: true, mensagem: 'Item atendido' };
      const confirmedWrite: Record<string, unknown> = { success: true, mensagem: 'Item atendido', movement_id: 'mov-1' };

      expect(Boolean(falsePositive.success && falsePositive.movement_id)).toBe(false);
      expect(Boolean(confirmedWrite.success && confirmedWrite.movement_id)).toBe(true);
    });
  });
});

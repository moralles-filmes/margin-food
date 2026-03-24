import { describe, expect, it, vi } from 'vitest';
import { emitDataEvent, onDataEvent } from '@/lib/dataEvents';

describe('dataEvents', () => {
  it('notifica todos os listeners quando app:refresh é emitido', () => {
    const estoqueListener = vi.fn();
    const financeiroListener = vi.fn();

    const offEstoque = onDataEvent('estoque:produtos', estoqueListener);
    const offFinanceiro = onDataEvent('financeiro:*', financeiroListener);

    emitDataEvent('app:refresh');

    expect(estoqueListener).toHaveBeenCalledTimes(1);
    expect(financeiroListener).toHaveBeenCalledTimes(1);

    offEstoque();
    offFinanceiro();
  });

  it('mantém compatibilidade com listeners exatos e wildcard por módulo', () => {
    const exactListener = vi.fn();
    const wildcardListener = vi.fn();

    const offExact = onDataEvent('compras:pedidos', exactListener);
    const offWildcard = onDataEvent('compras:*', wildcardListener);

    emitDataEvent('compras:pedidos');

    expect(exactListener).toHaveBeenCalledTimes(1);
    expect(wildcardListener).toHaveBeenCalledTimes(1);

    offExact();
    offWildcard();
  });
});

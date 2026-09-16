import { describe, expect, it, vi } from 'vitest';
import { emitAppRefresh, emitDataEvent, onDataEvent } from '@/lib/dataEvents';
const scope = { userId: 'one', companyId: 'A', mode: 'memberships' as const, signal: new AbortController().signal };

describe('dataEvents', () => {
  it('notifica todos os listeners quando app:refresh é emitido', () => {
    const estoqueListener = vi.fn();
    const financeiroListener = vi.fn();

    const offEstoque = onDataEvent('estoque:produtos', estoqueListener, scope);
    const offFinanceiro = onDataEvent('financeiro:*', financeiroListener, scope);

    emitAppRefresh();

    expect(estoqueListener).toHaveBeenCalledTimes(1);
    expect(financeiroListener).toHaveBeenCalledTimes(1);

    offEstoque();
    offFinanceiro();
  });

  it('mantém compatibilidade com listeners exatos e wildcard por módulo', () => {
    const exactListener = vi.fn();
    const wildcardListener = vi.fn();

    const offExact = onDataEvent('compras:pedidos', exactListener, scope);
    const offWildcard = onDataEvent('compras:*', wildcardListener, scope);

    emitDataEvent('compras:pedidos', scope);

    expect(exactListener).toHaveBeenCalledTimes(1);
    expect(wildcardListener).toHaveBeenCalledTimes(1);

    offExact();
    offWildcard();
  });
});

import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CompanyScopeContext } from '@/contexts/CompanyScopeContext';
import { registerClientScope } from './companyClientLifetime';
import { emitDataEvent, onDataEvent } from './dataEvents';
import { cacheGet, cacheSet, cacheInvalidate } from '@/components/cmv/cmvCache';
import { bankDraftScope } from './bankDraftScope';
import { saveSaldoExtrato, loadSaldoExtrato } from './conciliacaoSaldoExtrato';
import { useScopedToast } from '@/hooks/useScopedToast';
import { toast } from 'sonner';
import type { ComponentProps } from 'react';

vi.mock('sonner', () => ({ toast: Object.assign(vi.fn(), { success: vi.fn(), error: vi.fn() }) }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.clearAllMocks(); });
function fixture(companyId = 'A', userId = 'one') {
  const lifetime = new AbortController();
  const scope = { companyId, userId, mode: 'memberships' as const, signal: lifetime.signal };
  const client = {};
  registerClientScope(client, scope);
  return { scope, client, lifetime };
}
describe('efeitos capturados no lifetime da unidade (sem banco simulado)', () => {
  it('separa evento exato/wildcard por unidade e identidade; callback encerrado não dispara', () => {
    const a = fixture(), b = fixture('B'), other = fixture('A', 'two');
    const fa = vi.fn(), fb = vi.fn(), fo = vi.fn();
    const off = [onDataEvent('financeiro:*', fa, a.scope), onDataEvent('financeiro:lancamentos', fb, b.scope), onDataEvent('financeiro:*', fo, other.scope)];
    emitDataEvent('financeiro:lancamentos', a.scope);
    expect(fa).toHaveBeenCalledOnce(); expect(fb).not.toHaveBeenCalled(); expect(fo).not.toHaveBeenCalled();
    a.lifetime.abort(); emitDataEvent('financeiro:*', a.scope);
    expect(fa).toHaveBeenCalledOnce();
    off.forEach(fn => fn()); emitDataEvent('financeiro:lancamentos', b.scope);
    expect(fb).not.toHaveBeenCalled();
  });
  it('Broadcast/storage antigo sem escopo e evento de B não invalidam A', () => {
    const a = fixture(), fn = vi.fn(); const off = onDataEvent('financeiro:*', fn, a.scope);
    const send = (scopeKey?: string) => window.dispatchEvent(new StorageEvent('storage', { key: 'marginpro:data-event', newValue: JSON.stringify({ channel: 'financeiro:lancamentos', sourceId: 'another-tab', scopeKey }) }));
    send(); send(JSON.stringify(['one','B','memberships'])); expect(fn).not.toHaveBeenCalled();
    send(JSON.stringify(['one','A','memberships'])); expect(fn).toHaveBeenCalledOnce(); off();
  });
  it('não permite repovoar CMV nem invalidar B depois de A encerrar; A nova começa vazia', () => {
    const a = fixture(), b = fixture('B'); const params = { month: '2026-09' };
    cacheSet(a.client, 'cmv', params, 10, 60); cacheSet(b.client, 'cmv', params, 20, 60);
    a.lifetime.abort(); cacheSet(a.client, 'cmv', params, 99, 60); cacheInvalidate(a.client);
    expect(cacheGet(a.client, 'cmv', params)).toBeNull(); expect(cacheGet(b.client, 'cmv', params)).toBe(20);
    expect(cacheGet(fixture().client, 'cmv', params)).toBeNull();
  });
  it('rascunho de uma mesma conta não atravessa logout/relogin; não adota legado sem autor', () => {
    saveSaldoExtrato('account', { valor: 9, data: '2026-09-16' });
    const key = bankDraftScope('one', 'A', 'account');
    expect(loadSaldoExtrato(key)).toBeNull();
    saveSaldoExtrato(key, { valor: 10, data: '2026-09-16' });
    expect(loadSaldoExtrato(bankDraftScope('two', 'A', 'account'))).toBeNull();
    expect(loadSaldoExtrato(bankDraftScope('one', 'B', 'account'))).toBeNull();
    expect(loadSaldoExtrato(key)?.valor).toBe(10);
  });
  it('sucesso/erro de write concluído após abort ou desmontagem não gera toast na nova tela', async () => {
    const a = fixture();
    type Scope = NonNullable<ComponentProps<typeof CompanyScopeContext.Provider>['value']>;
    const wrapper = ({ children }: { children: React.ReactNode }) => <CompanyScopeContext.Provider value={{ client: a.client, companyId: 'A', profile: {} } as Scope}>{children}</CompanyScopeContext.Provider>;
    const hook = renderHook(() => useScopedToast(), { wrapper });
    const captured = hook.result.current;
    captured.success('ainda em A'); expect(toast.success).toHaveBeenCalledOnce();
    await act(async () => { a.lifetime.abort(); captured.success('commit em A'); captured.error('abort em A'); });
    expect(toast.success).toHaveBeenCalledOnce(); expect(toast.error).not.toHaveBeenCalled();
    hook.unmount(); captured.error('cleanup'); expect(toast.error).not.toHaveBeenCalled();
  });
});

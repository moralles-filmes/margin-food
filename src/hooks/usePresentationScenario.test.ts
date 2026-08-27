import { describe, expect, it, vi } from 'vitest';
import {
  createEmptyPresentationScenarioDraft,
  PRESENTATION_SCENARIO_MAX_STORAGE_BYTES,
} from '@/domain/financeiro/presentation';
import {
  buildPresentationScenarioStorageKey,
  readPresentationScenarioDraft,
  writePresentationScenarioDraft,
} from './usePresentationScenario';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: vi.fn((key: string) => { values.delete(key); }),
    values,
  };
}

const BASE_CONTEXT = {
  userId: '11111111-1111-4111-8111-111111111111',
  companyId: '22222222-2222-4222-8222-222222222222',
  period: { start: '2026-03-01', endExclusive: '2026-04-01' },
  granularity: 'month' as const,
  rankingLimit: 10,
};

describe('rascunho local dos cenários', () => {
  it('isola a chave por usuário, tenant, período e filtros', () => {
    const base = buildPresentationScenarioStorageKey(BASE_CONTEXT);
    expect(base).toContain(BASE_CONTEXT.userId);
    expect(base).toContain(BASE_CONTEXT.companyId);
    expect(buildPresentationScenarioStorageKey({ ...BASE_CONTEXT, userId: '33333333-3333-4333-8333-333333333333' })).not.toBe(base);
    expect(buildPresentationScenarioStorageKey({ ...BASE_CONTEXT, companyId: '44444444-4444-4444-8444-444444444444' })).not.toBe(base);
    expect(buildPresentationScenarioStorageKey({ ...BASE_CONTEXT, period: { start: '2026-04-01', endExclusive: '2026-05-01' } })).not.toBe(base);
    expect(buildPresentationScenarioStorageKey({ ...BASE_CONTEXT, granularity: 'day' })).not.toBe(base);
    expect(buildPresentationScenarioStorageKey({ ...BASE_CONTEXT, userId: 'invalido' })).toBeNull();
  });

  it('preserva dinheiro e percentual como texto decimal exato', () => {
    const storage = memoryStorage();
    const draft = {
      ...createEmptyPresentationScenarioDraft(),
      totalRevenue: { mode: 'absolute' as const, value: '1.234,56' },
      totalExpense: { mode: 'percentage' as const, value: '2,75' },
    };
    writePresentationScenarioDraft(storage, 'scenario', draft);
    expect(readPresentationScenarioDraft(storage, 'scenario')).toMatchObject({
      totalRevenue: { value: '1.234,56' },
      totalExpense: { value: '2,75' },
    });
  });

  it('remove rascunho malformado ou excessivo sem reutilizá-lo', () => {
    const storage = memoryStorage();
    storage.setItem('invalid', '{');
    expect(() => readPresentationScenarioDraft(storage, 'invalid')).toThrow();
    expect(storage.removeItem).toHaveBeenCalledWith('invalid');

    storage.setItem('large', 'x'.repeat(PRESENTATION_SCENARIO_MAX_STORAGE_BYTES + 1));
    expect(() => readPresentationScenarioDraft(storage, 'large')).toThrowError(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    expect(storage.removeItem).toHaveBeenCalledWith('large');
  });
});

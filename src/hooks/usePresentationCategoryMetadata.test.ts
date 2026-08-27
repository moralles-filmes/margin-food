import { describe, expect, it, vi } from 'vitest';
import { parsePresentationCategoryMetadata } from './usePresentationCategoryMetadata';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

describe('metadados semânticos da Apresentação Sócios', () => {
  it('aceita grupos configurados e categorias sem classificação', () => {
    expect(parsePresentationCategoryMetadata({
      a: { group: 'cmv', dreLine: 'CMV' },
      b: { group: null, dreLine: null },
    })).toEqual({
      a: { group: 'cmv', dreLine: 'CMV' },
      b: { group: null, dreLine: null },
    });
  });

  it('rejeita payload incompatível em vez de classificar silenciosamente', () => {
    expect(() => parsePresentationCategoryMetadata({ a: { group: 42, dreLine: null } }))
      .toThrow(/a\.group/);
  });
});

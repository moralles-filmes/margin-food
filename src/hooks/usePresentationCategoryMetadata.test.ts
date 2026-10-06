import { describe, expect, it, vi } from 'vitest';
import { parsePresentationCategoryMetadata } from './usePresentationCategoryMetadata';

vi.mock('@/integrations/supabase/client', () => ({
  supabase: { rpc: vi.fn() },
}));

describe('metadados semânticos da Apresentação Sócios', () => {
  it('aceita grupos configurados e categorias sem classificação', () => {
    expect(parsePresentationCategoryMetadata({
      a: { group: 'cmv' },
      b: { group: null },
    })).toEqual({
      a: { group: 'cmv' },
      b: { group: null },
    });
  });

  it('rejeita payload incompatível em vez de classificar silenciosamente', () => {
    expect(() => parsePresentationCategoryMetadata({ a: { group: 42 } }))
      .toThrow(/a\.group/);
  });
});

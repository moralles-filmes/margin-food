import { describe, it, expect } from 'vitest';
import { normalizeSearchText, includesNormalized } from '@/lib/utils';

describe('normalizeSearchText', () => {
  it('strips accents from Portuguese words', () => {
    expect(normalizeSearchText('Açúcar')).toBe('acucar');
    expect(normalizeSearchText('Limão')).toBe('limao');
    expect(normalizeSearchText('Óleo')).toBe('oleo');
    expect(normalizeSearchText('Pão')).toBe('pao');
    expect(normalizeSearchText('Coração de galinha')).toBe('coracao de galinha');
  });

  it('lowercases text', () => {
    expect(normalizeSearchText('SALMÃO')).toBe('salmao');
  });

  it('handles already-plain text', () => {
    expect(normalizeSearchText('arroz')).toBe('arroz');
  });

  it('handles empty string', () => {
    expect(normalizeSearchText('')).toBe('');
  });
});

describe('includesNormalized', () => {
  it('finds accented word with unaccented query', () => {
    expect(includesNormalized('Açúcar refinado', 'acucar')).toBe(true);
    expect(includesNormalized('Limão siciliano', 'limao')).toBe(true);
    expect(includesNormalized('Óleo de soja', 'oleo')).toBe(true);
  });

  it('finds accented word with accented query', () => {
    expect(includesNormalized('Açúcar refinado', 'Açúcar')).toBe(true);
  });

  it('is case-insensitive', () => {
    expect(includesNormalized('SALMÃO FRESCO', 'salmao')).toBe(true);
  });

  it('supports partial matching', () => {
    expect(includesNormalized('Coração de galinha', 'cora')).toBe(true);
  });

  it('returns true for empty needle', () => {
    expect(includesNormalized('anything', '')).toBe(true);
  });

  it('returns false when no match', () => {
    expect(includesNormalized('Açúcar', 'farinha')).toBe(false);
  });
});

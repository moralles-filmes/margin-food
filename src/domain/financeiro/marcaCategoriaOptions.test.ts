import { describe, expect, it } from 'vitest';
import { filterEligibleMarcaCategoryOptions, type MarcaCategoriaOption } from './marcaCategoriaOptions';

function cat(overrides: Partial<MarcaCategoriaOption> & { id: string }): MarcaCategoriaOption {
  return { tipo: 'receita', ativo: true, excluir_dos_totais: false, parent_id: null, ...overrides };
}

describe('filterEligibleMarcaCategoryOptions', () => {
  it('aceita categoria receita, ativa, operacional e folha', () => {
    const result = filterEligibleMarcaCategoryOptions([cat({ id: 'a' })]);
    expect(result.map(c => c.id)).toEqual(['a']);
  });

  it('rejeita categoria de despesa', () => {
    const result = filterEligibleMarcaCategoryOptions([cat({ id: 'a', tipo: 'despesa' })]);
    expect(result).toEqual([]);
  });

  it('rejeita categoria inativa', () => {
    const result = filterEligibleMarcaCategoryOptions([cat({ id: 'a', ativo: false })]);
    expect(result).toEqual([]);
  });

  it('rejeita categoria não operacional (excluir_dos_totais)', () => {
    const result = filterEligibleMarcaCategoryOptions([cat({ id: 'a', excluir_dos_totais: true })]);
    expect(result).toEqual([]);
  });

  it('rejeita categoria que tem filho ativo (não é folha)', () => {
    const result = filterEligibleMarcaCategoryOptions([
      cat({ id: 'pai' }),
      cat({ id: 'filho', parent_id: 'pai' }),
    ]);
    expect(result.map(c => c.id)).toEqual(['filho']);
  });

  it('aceita categoria cujo único filho está inativo (soft-deleted)', () => {
    const result = filterEligibleMarcaCategoryOptions([
      cat({ id: 'pai' }),
      cat({ id: 'filho-inativo', parent_id: 'pai', ativo: false }),
    ]);
    expect(result.map(c => c.id)).toEqual(['pai']);
  });

  it('aceita várias folhas independentes da mesma árvore', () => {
    const result = filterEligibleMarcaCategoryOptions([
      cat({ id: 'pai' }),
      cat({ id: 'filho-a', parent_id: 'pai' }),
      cat({ id: 'filho-b', parent_id: 'pai' }),
    ]);
    expect(result.map(c => c.id).sort()).toEqual(['filho-a', 'filho-b']);
  });
});

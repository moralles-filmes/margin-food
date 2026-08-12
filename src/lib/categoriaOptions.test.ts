import { describe, it, expect } from 'vitest';
import { normalizeSearchText } from './utils';
import { buildCategoryOptions, getCategoryCommandValue } from './categoriaOptions';

describe('buildCategoryOptions', () => {
  it('gives an empty groupLabel to top-level categories (no parent)', () => {
    const rows = [{ id: '1', nome: 'CMV', parent_id: null }];
    const result = buildCategoryOptions(rows);
    expect(result[0].groupLabel).toBe('');
  });

  it('builds a "Categoria › Subcategoria" path for a 3-level chain', () => {
    const rows = [
      { id: 'cmv', nome: 'CMV', parent_id: null },
      { id: 'peixes', nome: 'PEIXES', parent_id: 'cmv' },
      { id: 'salmao', nome: 'SALMAO', parent_id: 'peixes' },
    ];
    const result = buildCategoryOptions(rows);
    const byId = Object.fromEntries(result.map(r => [r.id, r]));
    expect(byId.cmv.groupLabel).toBe('');
    expect(byId.peixes.groupLabel).toBe('CMV');
    expect(byId.salmao.groupLabel).toBe('CMV › PEIXES');
  });

  it('preserves the original fields of each row alongside groupLabel', () => {
    const rows = [{ id: '1', nome: 'CMV', codigo: '2', tipo: 'despesa', parent_id: null, centro_custo_padrao_id: null }];
    const result = buildCategoryOptions(rows);
    expect(result[0]).toMatchObject({
      id: '1', nome: 'CMV', codigo: '2', tipo: 'despesa',
      parent_id: null, centro_custo_padrao_id: null, groupLabel: '',
    });
  });

  it('stops gracefully when parent_id points to a row that is not in the list', () => {
    const rows = [{ id: 'salmao', nome: 'SALMAO', parent_id: 'peixes-nao-carregado' }];
    const result = buildCategoryOptions(rows);
    expect(result[0].groupLabel).toBe('');
  });

  it('does not loop forever when the parent_id chain has a cycle', () => {
    const rows = [
      { id: 'a', nome: 'A', parent_id: 'b' },
      { id: 'b', nome: 'B', parent_id: 'a' },
    ];
    const result = buildCategoryOptions(rows);
    const byId = Object.fromEntries(result.map(r => [r.id, r]));
    expect(byId.a.groupLabel).toBe('B');
    expect(byId.b.groupLabel).toBe('A');
  });
});

describe('getCategoryCommandValue', () => {
  it('keeps categories with the same name unique by id', () => {
    const operational = getCategoryCommandValue({
      id: 'categoria-operacional',
      nome: 'SALARIOS',
    });
    const royalParma = getCategoryCommandValue({
      id: 'categoria-royal-parma',
      nome: 'SALARIOS',
    });

    expect(operational).not.toBe(royalParma);
  });

  it('keeps the visible name and code searchable', () => {
    const value = getCategoryCommandValue({
      id: 'categoria-1',
      nome: 'SALÁRIOS',
      codigo: '3.1',
    });

    expect(normalizeSearchText(value)).toContain('salarios');
    expect(normalizeSearchText(value)).toContain('3.1');
  });
});

import { describe, expect, it } from 'vitest';
import { erroCategoriaObrigatoria } from './categoriaObrigatoria';

describe('categoria obrigatória no lançamento', () => {
  it('sem rateio exige a categoria do cabeçalho', () => {
    expect(erroCategoriaObrigatoria({ categoriaId: '', rateio: [] })).toBe('Selecione uma categoria.');
    expect(erroCategoriaObrigatoria({ categoriaId: null, rateio: [] })).toBe('Selecione uma categoria.');
    expect(erroCategoriaObrigatoria({ categoriaId: '   ', rateio: [] })).toBe('Selecione uma categoria.');
    expect(erroCategoriaObrigatoria({ tipo: 'DESPESA', categoriaId: 'cat-1', rateio: [] })).toBeNull();
  });

  it('rateio de uma linha sem categoria é recusado mesmo com categoria no cabeçalho', () => {
    expect(erroCategoriaObrigatoria({ categoriaId: 'cat-1', rateio: [{ categoria_id: '' }] }))
      .toBe('Selecione a categoria da linha 1 do rateio.');
  });

  it('aponta todas as linhas sem categoria', () => {
    const rateio = [{ categoria_id: '' }, { categoria_id: 'cat-1' }, { categoria_id: null }, { categoria_id: '  ' }];
    expect(erroCategoriaObrigatoria({ tipo: 'RECEITA', rateio })).toBe('Selecione a categoria das linhas 1, 3 e 4 do rateio.');
    expect(erroCategoriaObrigatoria({ rateio: [{ categoria_id: 'cat-1' }, {}] })).toBe('Selecione a categoria da linha 2 do rateio.');
    expect(erroCategoriaObrigatoria({ rateio: [{}, { categoria_id: undefined }] })).toBe('Selecione a categoria das linhas 1 e 2 do rateio.');
  });

  it('rateio completo vale sem categoria no cabeçalho (o cabeçalho é ignorado)', () => {
    expect(erroCategoriaObrigatoria({ categoriaId: '', rateio: [{ categoria_id: 'cat-1' }, { categoria_id: 'cat-2' }] })).toBeNull();
  });

  it('transferência não tem categoria', () => {
    expect(erroCategoriaObrigatoria({ tipo: 'TRANSFERENCIA', categoriaId: '', rateio: [] })).toBeNull();
  });
});

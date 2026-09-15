import { describe, expect, it } from 'vitest';
import { compareNames, sortByName, sortNames } from './sortByName';

describe('sortByName', () => {
  it('ordena ignorando acento e maiúsculas', () => {
    expect(sortNames(['limão', 'Alho', 'açúcar', 'Óleo', 'banana'])).toEqual([
      'açúcar',
      'Alho',
      'banana',
      'limão',
      'Óleo',
    ]);
  });

  it('usa ordem numérica natural', () => {
    expect(sortNames(['Item 10', 'Item 2', 'Item 1'])).toEqual(['Item 1', 'Item 2', 'Item 10']);
  });

  it('manda nome vazio/nulo para o fim', () => {
    const items = [{ n: null }, { n: 'Sal' }, { n: '' }, { n: 'Arroz' }];
    expect(sortByName(items, i => i.n).map(i => i.n)).toEqual(['Arroz', 'Sal', null, '']);
  });

  it('não muta a lista original e continua ordenada após filtrar', () => {
    const items = [
      { nome: 'Wasabi', categoria: 'Oriental' },
      { nome: 'Arroz', categoria: 'Grãos' },
      { nome: 'Gengibre', categoria: 'Oriental' },
      { nome: 'Alga Nori', categoria: 'Oriental' },
    ];
    const sorted = sortByName(items, i => i.nome);
    expect(items[0].nome).toBe('Wasabi');
    expect(sorted.filter(i => i.categoria === 'Oriental').map(i => i.nome)).toEqual([
      'Alga Nori',
      'Gengibre',
      'Wasabi',
    ]);
    expect(compareNames('a', 'A')).toBe(0);
  });
});

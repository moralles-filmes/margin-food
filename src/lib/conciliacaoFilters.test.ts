import { describe, expect, it } from 'vitest';
import { matchesImportFilter, type ImportFilter } from './conciliacaoFilters';

const rows = {
  conciliar: { selecionada: false, matchId: 'lancamento-1' },
  sugestoes: { selecionada: true, suggestions: [{ id: 'sugestao-1' }] },
  criar: { selecionada: true },
  conciliados: { selecionada: false, jaConciliada: true },
  ignorados: { selecionada: false, ignorada: true },
};

describe('matchesImportFilter', () => {
  it.each(Object.entries(rows))('filtra somente linhas de %s', (filter, selectedRow) => {
    const result = Object.entries(rows)
      .filter(([, row]) => matchesImportFilter(row, filter as ImportFilter))
      .map(([name]) => name);

    if (filter === 'sugestoes') {
      expect(result).toEqual(['sugestoes']);
    } else if (filter === 'criar') {
      expect(result).toEqual(['sugestoes', 'criar']);
    } else {
      expect(result).toEqual([filter]);
    }
    expect(matchesImportFilter(selectedRow, 'todos')).toBe(true);
  });

  it('não inclui linhas concluídas no filtro para conciliar', () => {
    expect(matchesImportFilter({ selecionada: false, matchId: 'lancamento-1-done' }, 'conciliar')).toBe(false);
  });
});

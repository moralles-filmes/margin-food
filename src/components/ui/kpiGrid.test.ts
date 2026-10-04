import { describe, expect, it } from 'vitest';
import { kpiGridClassFor, longestValueLength } from './kpiGrid';

describe('kpiGridClassFor', () => {
  it('valor mais longo exige grupo mais largo para 2 e 4 colunas', () => {
    expect(kpiGridClassFor(6)).toContain('[@container(min-width:55rem)]:grid-cols-4');
    expect(kpiGridClassFor(12)).toContain('[@container(min-width:27rem)]:grid-cols-2');
    expect(kpiGridClassFor(15)).toContain('[@container(min-width:66rem)]:grid-cols-4');
    expect(kpiGridClassFor(17)).toContain('[@container(min-width:72rem)]:grid-cols-4');
  });

  it('valor fora da tabela nunca vai a quatro colunas', () => {
    const cls = kpiGridClassFor(19);
    expect(cls).not.toContain('grid-cols-4');
    expect(cls).toContain('grid-cols-1');
  });

  it('três colunas usam o mesmo passo de duas e um limiar próprio', () => {
    const cls = kpiGridClassFor(12, 3);
    expect(cls).toContain('[@container(min-width:27rem)]:grid-cols-2');
    expect(cls).toContain('[@container(min-width:41rem)]:grid-cols-3');
    expect(cls).not.toContain('grid-cols-4');
    expect(kpiGridClassFor(17, 3)).toContain('[@container(min-width:55rem)]:grid-cols-3');
  });

  it('pares param em duas colunas', () => {
    const cls = kpiGridClassFor(14, 2);
    expect(cls).toContain('[@container(min-width:31rem)]:grid-cols-2');
    expect(cls).not.toMatch(/grid-cols-[34]/);
  });

  it('quatro colunas é o padrão e não muda o Dashboard', () => {
    expect(kpiGridClassFor(13, 4)).toBe(kpiGridClassFor(13));
  });
});

describe('longestValueLength', () => {
  it('maior texto exibido; lista vazia é zero', () => {
    expect(longestValueLength(['R$1,00', 'R$-10.000,00', '3'])).toBe(12);
    expect(longestValueLength([])).toBe(0);
  });
});

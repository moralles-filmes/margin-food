import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { normalizeSearchText } from '@/lib/utils';
import { padronizarTexto } from './padronizarTexto';

// Os casos moram no script SQL do backfill: o mesmo conjunto confere as duas
// implementações, então uma regra mudada só de um lado quebra aqui.
function casosDoSql(): Array<[string, string]> {
  const sql = readFileSync(resolve(__dirname, '../../docs/padronizacao-texto/padronizar_texto.sql'), 'utf8');
  const bloco = sql.split('-- CASOS-INICIO')[1].split('-- CASOS-FIM')[0];
  return [...bloco.matchAll(/\('((?:[^']|'')*)',\s*'((?:[^']|'')*)'\)/g)]
    .map(m => [m[1].replace(/''/g, "'"), m[2].replace(/''/g, "'")]);
}

describe('padronizarTexto', () => {
  const casos = casosDoSql();

  it('lê os casos compartilhados com o SQL', () => {
    expect(casos.length).toBeGreaterThan(30);
  });

  it.each(casos)('padroniza %j', (entrada, esperado) => {
    expect(padronizarTexto(entrada)).toBe(esperado);
  });

  it.each(casos)('é idempotente: %j', entrada => {
    const uma = padronizarTexto(entrada);
    expect(padronizarTexto(uma)).toBe(uma);
  });

  it.each(casos)('só muda caixa e espaços: %j', entrada => {
    expect(normalizeSearchText(padronizarTexto(entrada)))
      .toBe(normalizeSearchText(entrada).replace(/\s+/g, ' '));
  });
});

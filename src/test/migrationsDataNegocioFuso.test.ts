import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// O banco roda em UTC: CURRENT_DATE, now()::date e timestamptz::date devolvem o dia
// seguinte depois das 21h (BRT). A migration abaixo trocou todos os usos por
// `(now() AT TIME ZONE 'America/Sao_Paulo')::date`, mas os arquivos antigos do repo
// ainda têm os corpos com CURRENT_DATE — copiar uma função de lá reintroduz o bug.
const MIGRATION_CORRECAO = '20260928144950';

// Rótulo de contrato comparado literalmente pelo frontend (expensesPresentationAdapter.ts).
const ROTULO_CONTRATO = "'COALESCE(data_pagamento, conciliado_em::date, data_competencia)'";

const PADROES_UTC: Array<[string, RegExp]> = [
  ['CURRENT_DATE', /\bcurrent_date\b/i],
  ['now()::date', /\bnow\(\)\)?\s*::\s*date\b/i],
  ['to_char(now(), ...)', /\bto_char\(\s*now\(\)\s*,/i],
  ['timestamptz::date', /\b(created_at|updated_at|received_at|conciliado_em)\s*::\s*date\b/i],
];

const dir = resolve(process.cwd(), 'supabase/migrations');
const migrationsNovas = readdirSync(dir)
  .filter((file) => file.endsWith('.sql') && file.slice(0, 14) > MIGRATION_CORRECAO)
  .sort();

function semComentarios(sql: string): string {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((line) => line.replace(/--.*$/, ''))
    .join('\n');
}

describe('datas de negócio no fuso de São Paulo', () => {
  it('a migration de correção existe', () => {
    expect(readdirSync(dir).some((file) => file.startsWith(MIGRATION_CORRECAO))).toBe(true);
  });

  it.each(migrationsNovas.length > 0 ? migrationsNovas : ['(nenhuma migration nova)'])(
    '%s não usa o dia UTC',
    (file) => {
      if (!file.endsWith('.sql')) return;
      const sql = semComentarios(readFileSync(resolve(dir, file), 'utf8')).split(ROTULO_CONTRATO).join('');
      for (const [nome, padrao] of PADROES_UTC) {
        expect(
          padrao.test(sql),
          `${file} usa ${nome}; use (now() AT TIME ZONE 'America/Sao_Paulo')::date ou (<col> AT TIME ZONE 'America/Sao_Paulo')::date`,
        ).toBe(false);
      }
    },
  );
});

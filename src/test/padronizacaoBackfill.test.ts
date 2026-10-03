/**
 * Backfill da padronização (Grupo 1): o escopo do UPDATE em fin_lancamentos é
 * o que protege o texto do extrato bancário — o script roda uma vez em
 * produção e não tem desfazer além do audit_logs.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const sql = readFileSync(resolve(process.cwd(), 'docs/padronizacao-texto/backfill_grupo1.sql'), 'utf8')
  .replace(/\s+/g, ' ');
const updateLancamentos = sql.slice(
  sql.indexOf('update public.fin_lancamentos'),
  sql.indexOf('get diagnostics v_lancamentos'),
);

describe('backfill_grupo1.sql', () => {
  it('lançamentos: só digitados e espelhos de título, nunca extrato nem transferência', () => {
    expect(updateLancamentos).toContain("t.origem in ('manual', 'espelho_cp', 'espelho_cr')");
    expect(updateLancamentos).toContain("t.tipo <> 'TRANSFERENCIA'");
  });

  it('espelho de título criado a partir do extrato mantém o texto do banco', () => {
    expect(updateLancamentos).toMatch(
      /not exists \( select 1 from public\.fin_audit_logs a where a\.acao = 'criar_baixado_extrato' and a\.depois->>'lancamento_id' = t\.id::text \)/,
    );
  });

  it('sem padronizacao.aplicar = sim é simulação (aborta no fim)', () => {
    expect(sql).toContain("if coalesce(current_setting('padronizacao.aplicar', true), '') <> 'sim' then raise exception 'SIMULACAO");
  });
});

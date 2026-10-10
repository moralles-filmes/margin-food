import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Linha de rateio sem categoria cai em "Sem categoria" nos relatórios (o rateio
 * manda). A trava fica no trigger da tabela que já confere a empresa: cobre
 * todas as RPCs que gravam ou copiam rateio e o INSERT direto. O comportamento
 * em banco real está em supabase/tests/database/rateio_categoria_obrigatoria_ephemeral.sql.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');
const migration = ler('supabase/migrations/20261010210000_fin_rateio_categoria_obrigatoria.sql');
const reversao = ler('docs/rateio-categoria-obrigatoria/reversao.sql');
const plano = migration.replace(/\s+/g, ' ');

describe('migração: rateio exige categoria em todas as linhas', () => {
  it('recusa categoria nula antes das conferências de empresa, com código no começo da mensagem', () => {
    const nula = migration.indexOf('IF NEW.categoria_id IS NULL THEN');
    expect(nula).toBeGreaterThanOrEqual(0);
    expect(nula).toBeLessThan(migration.indexOf('NOT_FOUND: categoria do rateio'));
    expect(plano).toContain("RAISE EXCEPTION 'RATEIO_SEM_CATEGORIA: selecione a categoria em todas as linhas do rateio' USING ERRCODE = '23502';");
  });

  it('mantém as conferências de empresa da categoria e do centro de custo', () => {
    expect(plano).toContain('WHERE c.id = NEW.categoria_id AND c.company_id = NEW.company_id');
    expect(plano).toContain('WHERE cc.id = NEW.centro_custo_id AND cc.company_id = NEW.company_id');
    expect(migration).toContain("RAISE EXCEPTION 'NOT_FOUND: centro de custo do rateio não pertence à empresa';");
  });

  it('continua SECURITY DEFINER, com search_path vazio e fora do alcance do cliente', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.fin_rateio_valida_empresa() FROM public, anon, authenticated;');
  });

  it('só troca o corpo da função: não recria o trigger nem mexe em dados', () => {
    expect(migration).not.toMatch(/CREATE TRIGGER|DROP TRIGGER/);
    // Sem o trigger a trava não valeria: o preflight aborta antes de trocar o corpo.
    expect(migration.indexOf("RAISE EXCEPTION 'PREFLIGHT: trigger trg_fin_rateio_valida_empresa ausente"))
      .toBeLessThan(migration.indexOf('CREATE OR REPLACE FUNCTION'));
    expect(migration).not.toMatch(/\b(UPDATE|DELETE FROM|INSERT INTO)\s+public\.fin_lancamento_rateios/);
  });

  it('a reversão volta ao corpo anterior, sem a checagem nova', () => {
    expect(reversao).toContain('CREATE OR REPLACE FUNCTION public.fin_rateio_valida_empresa()');
    expect(reversao).not.toContain('RATEIO_SEM_CATEGORIA');
    expect(reversao).toContain('REVOKE ALL ON FUNCTION public.fin_rateio_valida_empresa() FROM public, anon, authenticated;');
  });
});

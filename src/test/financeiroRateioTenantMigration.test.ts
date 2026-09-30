import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Rateio com categoria/centro de custo de outra empresa. A trava fica num
 * trigger da própria tabela: as RPCs que gravam p_rateios (Livro Razão, CP/CR
 * criação e edição, conciliação), as que copiam o rateio do título e o INSERT
 * direto via PostgREST (a RLS só confere o company_id da linha) passam por ele.
 */
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260930130010_financeiro_rateio_tenant.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const plano = migration.replace(/\s+/g, ' ');

describe('migração: rateio só com categoria e centro de custo da empresa', () => {
  it('o preflight conta os rateios de outra empresa antes de criar a trava', () => {
    const preflight = migration.indexOf('PREFLIGHT');
    expect(preflight).toBeGreaterThanOrEqual(0);
    expect(preflight).toBeLessThan(migration.indexOf('CREATE TRIGGER'));
    expect(plano).toContain('JOIN public.fin_categorias c ON c.id = r.categoria_id WHERE c.company_id IS DISTINCT FROM r.company_id');
    expect(plano).toContain('JOIN public.fin_centros_custo cc ON cc.id = r.centro_custo_id WHERE cc.company_id IS DISTINCT FROM r.company_id');
  });

  it('confere categoria e centro contra a empresa DO RATEIO, com erro no padrão do cabeçalho', () => {
    expect(plano).toContain('WHERE c.id = NEW.categoria_id AND c.company_id = NEW.company_id');
    expect(plano).toContain('WHERE cc.id = NEW.centro_custo_id AND cc.company_id = NEW.company_id');
    expect(migration).toContain("RAISE EXCEPTION 'NOT_FOUND: categoria do rateio não pertence à empresa';");
    expect(migration).toContain("RAISE EXCEPTION 'NOT_FOUND: centro de custo do rateio não pertence à empresa';");
  });

  it('é SECURITY DEFINER com search_path vazio: não depende de quem grava enxergar o cadastro', () => {
    expect(migration).toContain('SECURITY DEFINER');
    expect(migration).toContain("SET search_path TO ''");
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.fin_rateio_valida_empresa() FROM public, anon, authenticated;');
  });

  it('dispara em INSERT e em toda troca de categoria, centro ou empresa', () => {
    expect(plano).toContain(
      'CREATE TRIGGER trg_fin_rateio_valida_empresa BEFORE INSERT OR UPDATE OF categoria_id, centro_custo_id, company_id ON public.fin_lancamento_rateios FOR EACH ROW',
    );
  });

  it('não mexe no trigger do pai (trg_validate_rateio_sum é de outra entrega)', () => {
    expect(migration).not.toMatch(/FUNCTION public\.trg_validate_rateio_sum/);
  });
});

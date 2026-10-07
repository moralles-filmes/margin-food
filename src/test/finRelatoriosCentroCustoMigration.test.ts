import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261006162551_fin_relatorios_centro_custo.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const ephemeral = readFileSync(
  resolve(process.cwd(), 'supabase/tests/database/centro_custo_relatorios_ephemeral.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const corpo = (assinatura: string) => {
  const inicio = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${assinatura}`);
  expect(inicio).toBeGreaterThanOrEqual(0);
  return migration.slice(inicio, migration.indexOf('$function$;', inicio));
};

const dre = corpo('get_fin_dre_summary(p_inicio date, p_fim date)');
const dfc = corpo('get_fin_dfc_summary(p_inicio date, p_fim date)');
const dash = corpo('get_fin_dashboard_charts(p_start date, p_end date)');

describe('contrato SQL — centro de custo nos relatórios financeiros', () => {
  it('mantém as assinaturas (CREATE OR REPLACE, sem DROP nem overload)', () => {
    expect(migration).not.toMatch(/DROP FUNCTION/i);
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(3);
  });

  it('continua SECURITY DEFINER com search_path fixo, tenant e permissão de antes', () => {
    for (const body of [dre, dfc, dash]) {
      expect(body).toMatch(/SECURITY DEFINER\n SET search_path = /);
      expect(body).toMatch(/assert_tenant\(\)/);
    }
    expect(dre).toContain("ARRAY['financeiro:dre:view', 'system:global:manage']");
    expect(dfc).toContain("ARRAY['financeiro:fluxo:view', 'system:global:manage']");
    expect(dash).toContain("ARRAY['finance:read', 'financeiro:dashboard:view', 'system:global:manage']");
  });

  it('DRE/DFC devolvem as chaves antigas e as novas', () => {
    for (const body of [dre, dfc]) {
      expect(body).toContain("'valores_por_categoria'");
      expect(body).toContain("'centros_custo'");
      expect(body).toContain("'valores_por_centro_custo'");
      expect(body).toContain("'sem_centro'");
    }
    expect(dfc).toContain("'saldo_inicial'");
    expect(dash).toContain("'despesas_por_categoria'");
    expect(dash).toContain("'despesas_por_centro_custo'");
  });

  it('rateio manda: com rateio vale só o centro da linha, nunca o do cabeçalho', () => {
    // O formulário esconde o centro do cabeçalho com o rateio ligado; herdar dele mandaria a linha
    // "sem centro" da tela para um centro que o usuário não vê.
    for (const body of [dre, dfc, dash]) expect(body).not.toMatch(/COALESCE\((r|rateio)\.centro_custo_id/);
    expect(dre.match(/SELECT r\.categoria_id, r\.centro_custo_id, r\.valor/g)).toHaveLength(3);
    expect(dfc).toMatch(/THEN rateio\.centro_custo_id\s+ELSE ledger\.centro_custo_id/);
    expect(dfc).toContain("ON allocation.allocation_source = 'entry'");
    expect(dash).toContain('SELECT r.centro_custo_id, r.valor');
  });

  it('nome do centro só vem da própria empresa', () => {
    expect(dre).toContain('LEFT JOIN fin_centros_custo cc ON cc.id = ev.centro_custo_id AND cc.company_id = v_company_id');
    expect(dfc).toContain('LEFT JOIN fin_centros_custo cc ON cc.id = ev.centro_custo_id AND cc.company_id = v_company_id');
    expect(dash).toContain('LEFT JOIN public.fin_centros_custo cc ON cc.id = d.centro_custo_id AND cc.company_id = v_company');
  });

  it('sem nenhum valor com centro no período, a quebra volta vazia', () => {
    for (const body of [dre, dfc]) {
      expect(body).toContain('WHERE EXISTS (SELECT 1 FROM valores x WHERE x.centro_custo_id IS NOT NULL)');
    }
    expect(dash).toContain('WHERE EXISTS (SELECT 1 FROM por_centro x WHERE x.centro_custo_id IS NOT NULL)');
  });

  it('a quebra por centro do Dashboard não tem LIMIT (precisa fechar com a despesa realizada)', () => {
    const quebra = dash.slice(dash.indexOf('WITH despesas AS'), dash.indexOf('RETURN json_build_object'));
    expect(quebra).not.toMatch(/LIMIT/);
  });

  it('não depende de linha_dre (removida por 20261006160000)', () => {
    expect(dre).not.toContain('linha_dre');
    expect(dfc).not.toContain('linha_dre');
  });

  it('DRE deixa de ser executável por PUBLIC/anon', () => {
    expect(migration).toContain('REVOKE EXECUTE ON FUNCTION public.get_fin_dre_summary(date, date) FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_fin_dre_summary(date, date) TO authenticated, service_role;');
  });

  it('força a resolução das colunas novas no push', () => {
    expect(migration).toMatch(/DO \$\$[\s\S]*centro_custo_id[\s\S]*END\n\$\$;/);
  });

  it('o teste em banco real descartável aplica esta migration e cobre as regras', () => {
    expect(ephemeral).toContain('\\ir ../../migrations/20261006162551_fin_relatorios_centro_custo.sql');
    expect(ephemeral).toContain('rateio sem centro não pode herdar o cabeçalho');
    expect(ephemeral).toContain('vazou dado da empresa B');
    expect(ephemeral).toContain('esperava chaves novas vazias');
    expect(ephemeral).toContain("has_function_privilege('anon', 'public.get_fin_dre_summary(date, date)', 'EXECUTE')");
  });
});

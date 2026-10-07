import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261006163434_fin_dre_nao_operacionais.sql'),
  'utf8',
).replace(/\r\n/g, '\n');
const ephemeral = readFileSync(
  resolve(process.cwd(), 'supabase/tests/database/centro_custo_relatorios_ephemeral.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const dre = migration.slice(
  migration.indexOf('CREATE OR REPLACE FUNCTION public.get_fin_dre_summary(p_inicio date, p_fim date)'),
  migration.indexOf('$function$;'),
);

describe('contrato SQL — DRE com não operacionais e sem categoria', () => {
  it('só reescreve o DRE, sem mudar assinatura nem permissão', () => {
    expect(migration.match(/CREATE OR REPLACE FUNCTION/g)).toHaveLength(1);
    expect(migration).not.toMatch(/DROP FUNCTION|REVOKE|GRANT/);
    expect(dre).toMatch(/STABLE SECURITY DEFINER\n SET search_path = public/);
    expect(dre).toContain("ARRAY['financeiro:dre:view', 'system:global:manage']");
    expect(dre).toContain('assert_tenant()');
  });

  it('categorias levam excluir_dos_totais e system_key (o DemonstrativoTree separa as raízes não operacionais por eles)', () => {
    expect(dre).toContain("'system_key', c.system_key");
    expect(dre).toContain("'excluir_dos_totais', c.excluir_dos_totais");
  });

  it('sem categoria vai para as linhas sintéticas …101/…102, nunca para a chave órfã …000', () => {
    expect(dre).not.toContain("'00000000-0000-0000-0000-000000000000'");
    expect(dre).toContain("WHEN ev.tipo = 'RECEITA' THEN '00000000-0000-0000-0000-000000000101'");
    expect(dre).toContain("ELSE '00000000-0000-0000-0000-000000000102'");
    expect(dre).toContain("'Sem categoria — Receitas', 'S/C-R'");
    expect(dre).toContain("'Sem categoria — Despesas', 'S/C-D'");
    // CP em aberto é despesa e CR em aberto é receita para o "sem categoria".
    expect(dre.match(/'DESPESA'::text/g)).toHaveLength(2);
    expect(dre.match(/'RECEITA'::text/g)).toHaveLength(2);
  });

  it('mantém a quebra por centro de custo (rateio manda)', () => {
    expect(dre).toContain("'valores_por_centro_custo'");
    expect(dre).toContain("'centros_custo'");
    expect(dre).not.toMatch(/COALESCE\(r\.centro_custo_id/);
    expect(dre).toContain('LEFT JOIN fin_centros_custo cc ON cc.id = ev.centro_custo_id AND cc.company_id = v_company_id');
  });

  it('o teste em banco real descartável aplica esta migration e cobre não operacional e sem categoria', () => {
    expect(ephemeral).toContain('\\ir ../../migrations/20261006163434_fin_dre_nao_operacionais.sql');
    expect(ephemeral).toContain('DRE: categorias sem excluir_dos_totais/system_key');
    expect(ephemeral).toContain('DRE junho: sem categoria precisa ir para …101/…102');
  });
});

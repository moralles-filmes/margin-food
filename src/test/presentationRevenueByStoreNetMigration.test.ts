import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260901000000_presentation_revenue_by_store_net.sql',
  ),
  'utf8',
);

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('migração de faturamento por loja (bruto + líquido) na Apresentação Sócios', () => {
  it('agrupa marcas com categoria vinculada em uma única linha por categoria, sem rateio', () => {
    const cte = section('category_groups AS (', 'category_group_values AS (');
    expect(cte).toContain("pg_catalog.string_agg(brand.nome, ' + ' ORDER BY brand.ordem, brand.nome)");
    expect(cte).toContain('pg_catalog.array_agg(brand.id ORDER BY brand.ordem, brand.nome)');
    expect(cte).toContain('WHERE brand.categoria_id IS NOT NULL');
    expect(cte).toContain('GROUP BY brand.categoria_id');
  });

  it('mantém marcas sem categoria vinculada individuais, com net NULL', () => {
    const cte = section('individual_brand_rows AS (', 'category_groups AS (');
    expect(cte).toContain('WHERE brand.categoria_id IS NULL');
    const payload = section(
      'FROM individual_brand_rows AS row',
      'UNION ALL',
    );
    expect(migration).toContain("'net', NULL,\n          'categoriaId', NULL,\n          'marcaIds', pg_catalog.jsonb_build_array(row.marca_id)");
    expect(payload.length).toBeGreaterThan(0);
  });

  it('calcula o líquido por categoria a partir do razão do mês selecionado', () => {
    const cte = section('net_current_by_category AS (', 'category_group_rows AS (');
    expect(cte).toContain("WHERE entry.period_key = 'current'");
    expect(cte).toContain("AND entry.section = 'operational'");
    expect(cte).toContain('AND entry.categoria_id IS NOT NULL');
    expect(cte).toContain('GROUP BY entry.categoria_id');
  });

  it('fecha o líquido não coberto por nenhuma marca em "Sem marca vinculada"', () => {
    const matched = section('matched_net_total AS (', 'net_revenue_payload AS (');
    expect(matched).toContain('JOIN net_current_by_category AS net ON net.categoria_id = cg.categoria_id');
    const unmatched = section('unmatched_net_row AS (', 'by_brand_payload AS (');
    expect(unmatched).toContain('net.current_net_total - matched.total');
    expect(migration).toContain("'Sem marca vinculada'");
    expect(migration).toContain('WHERE unmatched.unmatched_total <> 0');
  });

  it('preserva o resíduo "Sem detalhamento por marca" para fechamentos legados sem nenhuma marca', () => {
    expect(migration).toContain("'Sem detalhamento por marca'");
    expect(migration).toContain('WHERE unassigned.closing_count > 0');
  });

  it('bump de contractVersion para 1.1 e nova documentação do payload', () => {
    expect(migration).toContain("'contractVersion', '1.1'");
    expect(migration).toContain('Apresentação Sócios Faturamento v1.2');
  });

  it('resolve marca.categoria_id durante o próprio deploy (DO-block de validação)', () => {
    const validation = section('DO $validate_columns$', '$validate_columns$;');
    expect(validation).toContain('marca.categoria_id');
  });

  it('mantém a assinatura da função e os GRANTs restritos a authenticated/service_role', () => {
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.get_fin_presentation_revenue(text, integer[]) FROM PUBLIC, anon');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.get_fin_presentation_revenue(text, integer[])\n  TO authenticated, service_role');
    expect(migration.match(/SET search_path = ''/g)?.length).toBeGreaterThanOrEqual(1);
  });
});

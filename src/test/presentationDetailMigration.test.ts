import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260826005756_presentation_detail_drilldown.sql'),
  'utf8',
);

describe('contrato de segurança das RPCs de detalhe', () => {
  it('resolve tenant no backend, exige RBAC e bloqueia categoria fora do tenant', () => {
    expect(migration.match(/public\.assert_tenant\(\)/g)?.length).toBe(2);
    expect(migration.match(/financeiro:relatorio-socios:view/g)?.length).toBeGreaterThanOrEqual(2);
    expect(migration).toContain('PRESENTATION_CATEGORY_OUT_OF_SCOPE');
    expect(migration).not.toMatch(/p_company_id/);
  });

  it('restringe execução pública e limita cada página a pageSize + 1', () => {
    expect(migration.match(/FROM PUBLIC, anon/g)?.length).toBe(2);
    expect(migration).toContain('LIMIT p_page_size + 1');
    expect(migration).toContain("p_page_size > 50");
  });

  it('resolve CMV pelo grupo herdado e preserva rateio como fonte primária', () => {
    expect(migration).toContain('COALESCE(child.own_group, parent.effective_group)');
    expect(migration).toContain('public.fin_lancamento_rateios allocation');
    expect(migration).toContain('WHERE NOT EXISTS');
  });

  it('calcula vencimentos pela data civil de São Paulo', () => {
    expect(migration).toContain("CURRENT_TIMESTAMP AT TIME ZONE 'America/Sao_Paulo'");
    expect(migration).not.toMatch(/GREATEST\(CURRENT_DATE|data_vencimento - CURRENT_DATE/);
  });
});

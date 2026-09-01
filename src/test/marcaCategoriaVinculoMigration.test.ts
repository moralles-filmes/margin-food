import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(
    process.cwd(),
    'supabase/migrations/20260831234500_marca_categoria_vinculo.sql',
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

describe('migração de vínculo marca → categoria', () => {
  it('cria o índice único composto que faltava em fin_categorias antes da FK', () => {
    expect(migration).toContain(
      'CREATE UNIQUE INDEX IF NOT EXISTS fin_categorias_company_id_id_key\n  ON public.fin_categorias (company_id, id);',
    );
    // A FK composta precisa vir depois do índice único, senão o deploy falha.
    expect(migration.indexOf('fin_categorias_company_id_id_key'))
      .toBeLessThan(migration.indexOf('financeiro_fechamento_marcas_categoria_fk'));
  });

  it('adiciona categoria_id com FK composta anti-cross-tenant e ON DELETE RESTRICT', () => {
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS categoria_id uuid');
    const fk = section(
      'ADD CONSTRAINT financeiro_fechamento_marcas_categoria_fk',
      'financeiro_fechamento_marcas_categoria_idx',
    );
    expect(fk).toContain('FOREIGN KEY (company_id, categoria_id)');
    expect(fk).toContain('REFERENCES public.fin_categorias (company_id, id)');
    expect(fk).toContain('ON DELETE RESTRICT');
  });

  it('exige categoria no INSERT, mas não força marcas legadas em updates que não tocam categoria_id', () => {
    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF categoria_id, company_id\n  ON public.financeiro_fechamento_marcas',
    );
    const fn = section(
      'CREATE OR REPLACE FUNCTION public.validate_marca_categoria_vinculo()',
      'DROP TRIGGER IF EXISTS trg_validate_marca_categoria_vinculo',
    );
    expect(fn).toContain('IF NEW.categoria_id IS NULL THEN');
    expect(fn).toContain("RAISE EXCEPTION 'CATEGORIA_MARCA_OBRIGATORIA'");
  });

  it('só aceita categoria ativa, RECEITA operacional (não excluir_dos_totais) do próprio tenant', () => {
    const fn = section(
      'CREATE OR REPLACE FUNCTION public.validate_marca_categoria_vinculo()',
      'DROP TRIGGER IF EXISTS trg_validate_marca_categoria_vinculo',
    );
    expect(fn).toContain('AND c.company_id = NEW.company_id');
    expect(fn).toContain("v_categoria.tipo <> 'receita'");
    expect(fn).toContain('v_categoria.ativo IS NOT TRUE');
    expect(fn).toContain('v_categoria.excluir_dos_totais IS TRUE');
    expect(fn).toContain("RAISE EXCEPTION 'CATEGORIA_MARCA_INVALIDA'");
  });

  it('só aceita categoria folha (sem sub-categoria/item ativo abaixo)', () => {
    const fn = section(
      'CREATE OR REPLACE FUNCTION public.validate_marca_categoria_vinculo()',
      'DROP TRIGGER IF EXISTS trg_validate_marca_categoria_vinculo',
    );
    expect(fn).toContain('WHERE f.parent_id = NEW.categoria_id');
    expect(fn).toContain('AND f.ativo = true');
    expect(fn).toContain("RAISE EXCEPTION 'CATEGORIA_MARCA_NAO_FOLHA'");
  });

  it('bloqueia criar/mover categoria para dentro de uma categoria já vinculada a uma marca', () => {
    const fn = section(
      'CREATE OR REPLACE FUNCTION public.block_categoria_pai_vinculada_a_marca()',
      'DROP TRIGGER IF EXISTS trg_block_categoria_vinculada_a_marca',
    );
    expect(fn).toContain('WHERE m.categoria_id = NEW.parent_id');
    expect(fn).toContain("RAISE EXCEPTION 'CATEGORIA_VINCULADA_A_MARCA'");
    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF parent_id\n  ON public.fin_categorias',
    );
  });

  it('resolve os JOINs novos durante o próprio deploy (DO-block de validação)', () => {
    const validation = section('DO $migration_validation$', '$migration_validation$;\n');
    expect(validation).toContain('JOIN public.fin_categorias c');
    expect(validation).toContain('ON c.id = m.categoria_id');
    expect(validation).toContain('AND c.company_id = m.company_id');
  });
});

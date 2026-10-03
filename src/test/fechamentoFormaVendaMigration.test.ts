import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

// A versão no nome do arquivo é a que o MCP grava ao aplicar; localizar pelo sufixo.
const migrationsDir = resolve(process.cwd(), 'supabase/migrations');
const fileName = readdirSync(migrationsDir).find(name => name.endsWith('_fechamento_marca_forma_venda.sql'));
const migration = readFileSync(resolve(migrationsDir, fileName ?? ''), 'utf8').replace(/\r\n/g, '\n');

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('migração de forma de venda e quantidade por marca', () => {
  it('adiciona as colunas de forma aditiva, aceitando só PEDIDOS ou PESSOAS', () => {
    expect(migration).toContain(
      'ALTER TABLE public.financeiro_fechamento_marcas\n  ADD COLUMN IF NOT EXISTS forma_venda text;',
    );
    expect(migration).toContain('ADD COLUMN IF NOT EXISTS quantidade integer');
    expect(migration.match(/forma_venda IN \('PEDIDOS', 'PESSOAS'\)/g)).toHaveLength(2);
    expect(migration).not.toMatch(/SET NOT NULL|DROP COLUMN|DROP TABLE/);
  });

  it('só aceita quantidade junto com a forma de venda da linha', () => {
    const check = section(
      'ADD CONSTRAINT financeiro_fechamento_marca_valores_quantidade_check',
      'CREATE OR REPLACE FUNCTION public.validate_marca_forma_venda()',
    );
    expect(check).toContain('(quantidade IS NULL AND forma_venda IS NULL)');
    expect(check).toContain('OR (quantidade IS NOT NULL AND quantidade >= 0 AND forma_venda IS NOT NULL)');
  });

  it('exige forma de venda em marca nova sem forçar marca legada em outros updates', () => {
    expect(migration).toContain(
      'BEFORE INSERT OR UPDATE OF forma_venda\n  ON public.financeiro_fechamento_marcas',
    );
    expect(migration).toContain("RAISE EXCEPTION 'FORMA_VENDA_OBRIGATORIA'");
  });

  it('mantém assinatura, tenant, permissões e a soma das marcas na RPC', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(',
      'COMMENT ON COLUMN',
    );
    expect(rpc).toContain('p_marcas jsonb DEFAULT \'[]\'::jsonb,\n  p_expected_updated_at timestamptz DEFAULT NULL\n)');
    expect(rpc).toContain('SECURITY DEFINER\nSET search_path = \'public\'');
    expect(rpc).toContain('v_company_id := public.assert_tenant();');
    expect(rpc).toContain("'financeiro:fechamento:edit'");
    expect(rpc).toContain("'financeiro:fechamento:create'");
    expect(rpc).toContain("RAISE EXCEPTION 'TOTAL_MARCAS_DIVERGENTE'");
    expect(rpc).toContain("RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'");
    expect(migration).not.toContain('DROP FUNCTION');
  });

  it('valida a quantidade e copia a forma da marca do próprio tenant no INSERT', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(',
      'COMMENT ON COLUMN',
    );
    expect(rpc).toContain("(item->>'quantidade') !~ '^[0-9]{1,9}$'");
    expect(rpc).toContain("RAISE EXCEPTION 'QUANTIDADE_INVALIDA'");
    const insert = rpc.slice(rpc.indexOf('INSERT INTO public.financeiro_fechamento_marca_valores'));
    expect(insert).toContain('company_id, fechamento_id, marca_id, valor_bruto, quantidade, forma_venda, created_by');
    expect(insert).toContain('JOIN public.financeiro_fechamento_marcas m');
    expect(insert).toContain('AND m.company_id = v_company_id');
  });

  it('preserva a quantidade já gravada quando o cliente antigo não envia a chave', () => {
    const rpc = section(
      'CREATE OR REPLACE FUNCTION public.rpc_upsert_fechamento_caixa_com_marcas(',
      'COMMENT ON COLUMN',
    );
    // O snapshot antigo precisa ser lido antes do DELETE que regrava o detalhamento.
    expect(rpc.indexOf('INTO v_old')).toBeGreaterThan(0);
    expect(rpc.indexOf('INTO v_old'))
      .toBeLessThan(rpc.indexOf('DELETE FROM public.financeiro_fechamento_marca_valores'));
    expect(rpc).toContain("WHEN item ? 'quantidade' THEN (item->>'quantidade')::integer");
    expect(rpc).toContain("ELSE (v_old->(m.id::text)->>'q')::integer");
  });

  it('mantém a forma de venda que o dia já tinha, mesmo se a marca trocou depois', () => {
    expect(migration).toContain("COALESCE(v_old->(m.id::text)->>'f', m.forma_venda) AS f");
  });

  it('recusa a gravação se o JOIN descartar alguma marca do payload', () => {
    expect(migration).toContain(
      "GET DIAGNOSTICS v_inserted = ROW_COUNT;\n  IF v_inserted <> jsonb_array_length(v_marcas) THEN\n    RAISE EXCEPTION 'MARCA_INVALIDA';",
    );
  });

  it('resolve as colunas novas durante o próprio deploy (DO-block de validação)', () => {
    const validation = section('DO $migration_validation$', '$migration_validation$;\n');
    expect(validation).toContain('PERFORM m.id, m.forma_venda');
    expect(validation).toContain('PERFORM v.quantidade, v.forma_venda');
  });
});

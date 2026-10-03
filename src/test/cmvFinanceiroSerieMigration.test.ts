import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(process.cwd(), 'supabase/migrations');
const arquivo = readdirSync(dir).filter(nome => nome.endsWith('_cmv_financeiro_serie.sql'));
const sql = readFileSync(resolve(dir, arquivo[0] ?? ''), 'utf8').replace(/\r\n/g, '\n');
const base = readFileSync(
  resolve(dir, readdirSync(dir).find(nome => nome.endsWith('_cmv_financeiro.sql')) ?? ''), 'utf8',
).replace(/\r\n/g, '\n');

const corpo = (nome: string, fonte = sql) => {
  const inicio = fonte.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  expect(inicio).toBeGreaterThanOrEqual(0);
  return fonte.slice(inicio, fonte.indexOf('\n$$;', inicio));
};

describe('migration da série do CMV Financeiro — contrato SQL', () => {
  it('existe uma única migration e ela vem depois da migration do CMV', () => {
    expect(arquivo).toHaveLength(1);
    expect(arquivo[0] > '20261003140000').toBe(true);
  });

  it('é aditiva: sem DROP, sem DDL de tabela, sem UPDATE fora de função', () => {
    expect(sql).not.toMatch(/\bDROP\b|\bALTER TABLE\b|\bCREATE TABLE\b|\bTRUNCATE\b|\bDELETE FROM\b|\bCREATE POLICY\b/);
    const foraDeFuncao = sql.replace(/AS \$\$[\s\S]*?\n\$\$;/g, '').replace(/DO \$\$[\s\S]*?\n\$\$;/g, '');
    expect(foraDeFuncao).not.toMatch(/\bUPDATE\b|\bINSERT\b/);
  });

  it('toda função fixa o search_path vazio', () => {
    const funcoes = sql.match(/CREATE OR REPLACE FUNCTION/g) ?? [];
    expect(funcoes).toHaveLength(3);
    expect(sql.match(/SET search_path = ''/g) ?? []).toHaveLength(3);
  });

  it('a lista mantém a assinatura e o corpo anterior, só acrescentando o tamanho da série', () => {
    const antes = corpo('_fin_cmv_lista', base);
    const depois = corpo('_fin_cmv_lista');
    const acrescimo = ",\n        'serie_boletos', (SELECT count(*) FROM public._fin_cmv_serie(p_company_id, p.conta_pagar_id))";
    expect(depois).toContain(acrescimo);
    expect(depois.replace(acrescimo, '')).toBe(antes);
  });

  it('helpers internos não são executáveis por clientes', () => {
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._fin_cmv_serie(uuid, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._fin_cmv_lista(uuid, date, date, text, uuid, integer, integer, boolean) FROM PUBLIC, anon, authenticated;');
  });

  it('série não depende só do vínculo de pai e nunca sai da empresa', () => {
    const serie = corpo('_fin_cmv_serie');
    expect(serie).toContain('cp.company_id = ref.company_id');
    expect(serie).toContain('ref.company_id = p_company_id');
    expect(serie).toContain('cp.created_at = ref.created_at');
    expect(serie).toContain('ref.parcela_total > 1');
    expect(serie).toContain('lancamento_pai_id');
  });

  it('a RPC resolve o tenant no servidor, exige gerenciar o CMV e nega anon', () => {
    const rpc = corpo('fin_cmv_aplicar_serie');
    expect(rpc).toContain('SECURITY DEFINER');
    expect(rpc).toContain('v_company_id := public.assert_tenant();');
    expect(rpc).toContain("ARRAY['financeiro:cmv:manage', 'system:global:manage']");
    expect(rpc).not.toMatch(/finance:manage|finance:read|financeiro:pagar:edit/);
    expect(rpc.indexOf('has_any_permission')).toBeLessThan(rpc.indexOf('FOR UPDATE'));
    expect(sql).toContain('REVOKE ALL ON FUNCTION public.fin_cmv_aplicar_serie(uuid, timestamptz, text, boolean) FROM PUBLIC, anon;');
    expect(sql).toContain('GRANT EXECUTE ON FUNCTION public.fin_cmv_aplicar_serie(uuid, timestamptz, text, boolean) TO authenticated, service_role;');
  });

  it('só a decisão muda, com ordem de bloqueio, lock da referência e auditoria antes/depois', () => {
    const rpc = corpo('fin_cmv_aplicar_serie');
    expect(rpc).toMatch(/ORDER BY cp\.id\s+FOR UPDATE/);
    expect(rpc).toContain('OPTIMISTIC_LOCK_CONFLICT');
    expect(rpc).toContain('CMV_DECISAO_OBRIGATORIA');
    expect(rpc).toContain('CONTINUE WHEN v_simular;');
    expect(rpc.indexOf('CONTINUE WHEN v_simular;')).toBeLessThan(rpc.indexOf('UPDATE public.'));
    const sets = rpc.match(/\bSET [a-z_]+ = /g) ?? [];
    expect(sets.sort()).toEqual(['SET cmv_incluir = ', 'SET cmv_incluir = ', 'SET search_path = ', 'SET updated_at = ']);
    expect(rpc).toContain("'cmv_classificar', v_antes");
    expect(rpc).not.toContain('::text');
    // toda escrita filtra a empresa resolvida no servidor
    for (const trecho of rpc.split('UPDATE public.').slice(1)) expect(trecho.slice(0, 400)).toContain('company_id = v_company_id');
  });

  it('o teste de banco real aplica esta migration e resolve as colunas no deploy', () => {
    const ephemeral = readFileSync(resolve(process.cwd(), 'supabase/tests/database/cmv_financeiro_ephemeral.sql'), 'utf8');
    expect(ephemeral).toContain(`\\ir ../../migrations/${arquivo[0]}`);
    const bloco = sql.slice(sql.lastIndexOf('DO $$'));
    expect(bloco).toContain('public._fin_cmv_serie(');
    expect(bloco).toContain('public._fin_cmv_lista(');
  });
});

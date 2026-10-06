import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contrato da migration que leva as despesas de Lançamentos e da Conciliação ao
 * CMV Financeiro (spec 2026-10-05-cmv-financeiro-lancamentos-design.md). O banco
 * real é testado em supabase/tests/database/cmv_lancamentos_ephemeral.sql.
 */
const dir = resolve(process.cwd(), 'supabase/migrations');
const arquivo = readdirSync(dir).filter(nome => nome.endsWith('_cmv_financeiro_lancamentos.sql'));
const sql = readFileSync(resolve(dir, arquivo[0] ?? ''), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = sql.replace(/--[^\n]*/g, '');
const foraDasFuncoes = semComentarios.replace(/\$(function)?\$[\s\S]*?\$(function)?\$/g, '');
const plano = (s: string) => s.replace(/\s+/g, ' ');

function corpo(nome: string): string {
  const inicio = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nome}\\(`));
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThanOrEqual(0);
  const resto = sql.slice(inicio);
  const fim = resto.search(/\n\$(function)?\$;/);
  return resto.slice(0, fim);
}

describe('migration CMV com lançamentos — leitura', () => {
  it('existe uma única migration e o teste de banco real a aplica', () => {
    expect(arquivo).toHaveLength(1);
    const ephemeral = readFileSync(resolve(process.cwd(), 'supabase/tests/database/cmv_lancamentos_ephemeral.sql'), 'utf8');
    expect(ephemeral).toContain(`\\ir ../../migrations/${arquivo[0]}`);
  });

  it('é aditiva e não classifica o histórico', () => {
    expect(semComentarios).not.toMatch(/DROP\s+(TABLE|COLUMN|POLICY|TRIGGER|INDEX)/i);
    expect(semComentarios).not.toMatch(/\bTRUNCATE\b/i);
    expect(sql).toContain('ALTER TABLE public.fin_lancamentos ADD COLUMN IF NOT EXISTS cmv_incluir boolean;');
    expect(foraDasFuncoes).not.toMatch(/\bUPDATE\s+public\./i);
    expect(foraDasFuncoes).not.toMatch(/\bINSERT\s+INTO\s+public\./i);
  });

  it('toda função fixa o search_path com "="', () => {
    const funcoes = sql.match(/CREATE (OR REPLACE )?FUNCTION/g) ?? [];
    expect(funcoes.length).toBeGreaterThan(0);
    expect((sql.match(/SET search_path = '/g) ?? []).length).toBe(funcoes.length);
    expect(sql).not.toMatch(/SET search_path TO/);
  });

  it('regra de apuração das despesas de fin_lancamentos', () => {
    const c = plano(corpo('_fin_cmv_linhas_lancamentos'));
    expect(c).toContain("l.tipo = 'DESPESA'");
    expect(c).toContain("l.status <> 'CANCELADO'");
    expect(c).toContain("NULLIF(l.referencia_modulo, '') IS NULL");
    expect(c).toContain("l.origem NOT IN ('espelho_cp', 'espelho_cr', 'ajuste_pagamento')");
    expect(c).toContain("(l.origem <> 'conciliacao' OR l.conciliado IS TRUE)");
    // rateio manda: o cabeçalho só vale sem linhas de rateio
    expect(c).toContain('WHERE NOT EXISTS');
  });

  it('a baixa de um boleto (fin_contas_pagar.lancamento_id) não é despesa de lançamento', () => {
    const c = plano(corpo('_fin_cmv_linhas_lancamentos'));
    // por empresa e pela chave do título, para usar o índice de lancamento_id
    expect(c).toContain(
      'AND NOT EXISTS ( SELECT 1 FROM public.fin_contas_pagar cp WHERE cp.company_id = p_company_id AND cp.lancamento_id = l.id )',
    );
  });

  it('o relatório soma as duas fontes e mantém o contrato v1', () => {
    const p = plano(corpo('_fin_cmv_payload'));
    expect(p).toContain("'contrato', 'cmv-financeiro/v1'");
    expect(p).toContain('FROM public._fin_cmv_linhas_fontes(p_company_id) l');
    expect(p).toContain("FROM documentos WHERE fonte = 'boleto'");
    expect(p).toContain("FROM documentos WHERE fonte = 'lancamento'");
    expect(p).toContain("'pendentes_geral_por_fonte'");
    expect(plano(corpo('_fin_cmv_linhas_fontes'))).toContain('FROM public._fin_cmv_linhas(p_company_id) b');
    expect(plano(corpo('_fin_cmv_lista'))).toContain('FROM public._fin_cmv_linhas_fontes(p_company_id) l');
  });

  it('a lista não inventa fornecedor nem vencimento para o lançamento', () => {
    const l = plano(corpo('_fin_cmv_lista'));
    expect(l).toContain("SELECT 'lancamento'::text, l.id, l.descricao, NULL::text, NULL::date, l.status,");
  });

  it('a decisão do lançamento também só é gravada pelas RPCs', () => {
    expect(plano(sql)).toContain(
      'CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao BEFORE INSERT OR UPDATE ON public.fin_lancamentos FOR EACH ROW EXECUTE FUNCTION public._fin_cmv_guard_decisao();',
    );
  });

  it('helpers internos não são executáveis por clientes', () => {
    for (const assinatura of ['_fin_cmv_linhas_lancamentos(uuid)', '_fin_cmv_linhas_fontes(uuid)', '_fin_cmv_retrato_lancamento(uuid, uuid)']) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon, authenticated;`);
    }
  });

  it('a configuração informa o recurso a quem lança e a quem concilia', () => {
    const c = plano(corpo('get_fin_cmv_config'));
    expect(c).toContain("'recursos', jsonb_build_object('lancamentos', true)");
    expect(c).toContain("'financeiro:lancamentos:create'");
    expect(c).toContain("'financeiro:conciliacao:reconcile'");
  });
});

describe('migration CMV com lançamentos — escrita', () => {
  it('conciliação: a data do banco continua na chave e na 2ª camada; competência e decisão são opcionais', () => {
    const c = corpo('reconcile_import_lancamento');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer);');
    expect(c).toContain('p_occurrence_index integer DEFAULT 0,\n  p_data_competencia date DEFAULT NULL::date');
    expect(c).toContain('v_legacy_idem_key := md5(v_company::text || p_data::text || p_descricao || p_valor::text || p_tipo || p_conta_id::text);');
    expect(c.split('AND l.data_pagamento = p_data').length - 1).toBe(2);
    expect(c).toContain('v_competencia := COALESCE(p_data_competencia, p_data);');
    expect(plano(c)).toContain('p_tipo, p_valor, v_competencia, p_data, p_descricao, p_conta_id,');
    expect(plano(c)).toContain("CASE WHEN p_tipo = 'DESPESA' AND jsonb_typeof(v_rateio_item->'cmv_incluir') = 'boolean'");
    expect(plano(c)).toContain("'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage'");
    expect(c).toContain("IF v_constraint IS DISTINCT FROM 'idx_fin_lancamentos_company_idempotency' THEN");
  });

  it('Livro Razão: p_cmv opcional, id da linha preservado, nunca exige a resposta', () => {
    const c = corpo('_guarded_upsert_lancamento');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public._guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text);');
    expect(c).toContain('p_cmv jsonb DEFAULT NULL::jsonb');
    expect(c).not.toContain('CMV_DECISAO_OBRIGATORIA');
    expect(c).toContain('NOT (_r.id = ANY(_usados))');
    expect(c).toContain('public._fin_cmv_heranca(_old_set, _r.categoria_id)');
    expect(c).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO';");
    expect(c).toContain("RAISE EXCEPTION 'Lançamento conciliado não pode ser editado. Desconcilie primeiro.';");
    expect(plano(c)).toContain("'financeiro:lancamentos:create', 'finance:manage', 'system:global:manage'");
  });

  it('reclassificação: muda a competência e a decisão; a data do banco nunca', () => {
    const c = corpo('_guarded_update_reconciled_classification');
    expect(sql).toContain('DROP FUNCTION IF EXISTS public._guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text);');
    expect(c).toContain('p_cmv jsonb DEFAULT NULL::jsonb,\n  p_data_competencia date DEFAULT NULL::date');
    expect(c).toContain('THEN COALESCE(v_lanc.data_pagamento, v_lanc.data_competencia)');
    expect(c).toContain("RAISE EXCEPTION 'ORIGEM_INVALIDA: edite a conta a pagar/receber de origem';");
    expect(c).toContain("RAISE EXCEPTION 'JUSTIFICATIVA_OBRIGATORIA';");
    expect(c).not.toMatch(/\bvalor\s*=\s*p_/);
    expect(c).not.toMatch(/\bconta_id\s*=/);
  });

  it('EXECUTE das assinaturas novas só para authenticated e service_role', () => {
    for (const sig of [
      'reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date)',
      '_guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamptz, text, text, jsonb)',
      '_guarded_update_reconciled_classification(uuid, uuid, uuid, text, jsonb, timestamptz, text, jsonb, date)',
    ]) {
      expect(sql).toContain(`REVOKE EXECUTE ON FUNCTION public.${sig} FROM PUBLIC, anon;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${sig} TO authenticated, service_role;`);
    }
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._fin_cmv_heranca(jsonb, uuid) FROM PUBLIC, anon, authenticated;');
    expect(sql).toContain("NOTIFY pgrst, 'reload schema';");
  });
});

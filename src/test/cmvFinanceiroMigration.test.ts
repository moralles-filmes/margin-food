import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { LEGACY_PERMISSION_MAP, MODULE_MANIFESTS } from '@/permissions/registry';

// O arquivo é renomeado para a versão que o MCP gravar ao aplicar; o sufixo é estável.
const dir = resolve(process.cwd(), 'supabase/migrations');
const arquivo = readdirSync(dir).filter(nome => nome.endsWith('_cmv_financeiro.sql'));
const sql = readFileSync(resolve(dir, arquivo[0] ?? ''), 'utf8').replace(/\r\n/g, '\n');
const semComentarios = sql.replace(/--[^\n]*/g, '');

function corpo(nome: string): string {
  const inicio = sql.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nome}\\(`));
  expect(inicio, `função ${nome} não encontrada`).toBeGreaterThanOrEqual(0);
  const resto = sql.slice(inicio);
  const fim = resto.search(/\n\$(function)?\$;/);
  return resto.slice(0, fim);
}

const INTERNAS = ['_fin_cmv_linhas', '_fin_cmv_retrato', '_fin_cmv_ativo', '_fin_cmv_payload', '_fin_cmv_lista'];
const GUARDAS = ['_fin_cmv_guard_decisao', '_fin_cmv_guard_config'];
const PUBLICAS = [
  'get_fin_cmv_financeiro', 'list_fin_cmv_linhas', 'get_fin_cmv_config',
  'fin_cmv_set_ativo', 'fin_cmv_set_categoria_padrao', 'fin_cmv_classificar',
  '_guarded_create_conta_pagar', '_guarded_update_conta_pagar',
];

describe('migration do CMV Financeiro — contrato SQL', () => {
  it('existe uma única migration do CMV', () => {
    expect(arquivo).toHaveLength(1);
  });

  it('é aditiva: só acrescenta colunas anuláveis e não classifica o histórico', () => {
    expect(semComentarios).not.toMatch(/DROP\s+(TABLE|COLUMN|POLICY|TRIGGER|INDEX)/i);
    expect(semComentarios).not.toMatch(/\bTRUNCATE\b/i);
    expect(semComentarios).not.toMatch(/ALTER\s+COLUMN/i);
    const colunas = semComentarios.match(/ADD COLUMN IF NOT EXISTS \w+ \w+[^;]*;/g) ?? [];
    expect(colunas).toHaveLength(3);
    for (const coluna of colunas) expect(coluna).not.toMatch(/NOT NULL|DEFAULT/i);
    // nenhum UPDATE em massa de cmv_incluir fora das funções
    const foraDasFuncoes = semComentarios.replace(/\$(function)?\$[\s\S]*?\$(function)?\$/g, '');
    expect(foraDasFuncoes).not.toMatch(/UPDATE\s+public\.(fin_contas_pagar|fin_lancamento_rateios|fin_categorias)/i);
    expect(foraDasFuncoes).not.toMatch(/DELETE\s+FROM/i);
  });

  it('não relaxa RLS nem concede privilégio de tabela', () => {
    expect(semComentarios).not.toMatch(/ROW LEVEL SECURITY|CREATE POLICY|ALTER POLICY/i);
    expect(semComentarios).not.toMatch(/GRANT\s+(SELECT|INSERT|UPDATE|DELETE|ALL)[^;]*ON\s+(TABLE\s+)?public\./i);
  });

  it('toda função fixa o search_path vazio', () => {
    const funcoes = sql.match(/CREATE (OR REPLACE )?FUNCTION public\.\w+/g) ?? [];
    const fixados = sql.match(/SET search_path = ''/g) ?? [];
    expect(funcoes).toHaveLength(INTERNAS.length + GUARDAS.length + PUBLICAS.length);
    expect(fixados).toHaveLength(funcoes.length);
    expect(sql).not.toMatch(/search_path TO/);
  });

  it('decisão e ativação só são gravadas pelas RPCs: escrita direta do cliente é barrada por trigger', () => {
    for (const nome of GUARDAS) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\(\\) FROM PUBLIC, anon, authenticated;`));
      // invoker: dentro das RPCs SECURITY DEFINER o current_user é o owner e a trava não dispara
      expect(corpo(nome)).not.toContain('SECURITY DEFINER');
      expect(corpo(nome)).toContain("current_user IN ('authenticated', 'anon')");
      expect(corpo(nome)).toContain('CMV_ESCRITA_DIRETA');
    }
    expect(corpo('_fin_cmv_guard_decisao')).toContain('NEW.cmv_incluir IS DISTINCT FROM OLD.cmv_incluir');
    for (const tabela of ['fin_contas_pagar', 'fin_lancamento_rateios']) {
      expect(sql).toMatch(new RegExp(`CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_decisao\\s+BEFORE INSERT OR UPDATE ON public\\.${tabela}\\s`));
    }
    expect(sql).toMatch(/CREATE OR REPLACE TRIGGER trg_fin_cmv_guard_config\s+BEFORE INSERT OR UPDATE OR DELETE ON public\.fin_config\s/);
  });

  it('helpers internos não são executáveis por clientes', () => {
    for (const nome of INTERNAS) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\([^)]*\\) FROM PUBLIC, anon, authenticated;`));
      expect(sql).not.toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${nome}\\(`));
      expect(corpo(nome)).not.toContain('SECURITY DEFINER');
    }
  });

  it('toda RPC exposta resolve o tenant no servidor, checa permissão e nega anon', () => {
    for (const nome of PUBLICAS) {
      const body = corpo(nome);
      expect(body, nome).toContain('SECURITY DEFINER');
      expect(body, nome).toContain('public.assert_tenant()');
      expect(body, nome).toMatch(/public\.has_(any_)?permission\(/);
      expect(sql, nome).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\([^)]*\\) FROM PUBLIC, anon;`));
      expect(sql, nome).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${nome}\\([^)]*\\) TO authenticated, service_role;`));
    }
    // nenhuma RPC aceita company_id do navegador
    expect(sql).not.toMatch(/CREATE (OR REPLACE )?FUNCTION public\.(get_|list_|fin_cmv_)\w+\([^)]*p_company_id/);
  });

  it('leitura do relatório exige a chave granular do CMV (legado financeiro não libera)', () => {
    for (const nome of ['get_fin_cmv_financeiro', 'list_fin_cmv_linhas']) {
      const body = corpo(nome);
      expect(body).toContain("'financeiro:cmv:view', 'system:global:manage'");
      expect(body).not.toContain('finance:read');
    }
    expect(corpo('fin_cmv_set_ativo')).toContain("ARRAY['financeiro:cmv:manage', 'system:global:manage']");
    expect(corpo('fin_cmv_set_categoria_padrao')).toContain("ARRAY['financeiro:cmv:manage', 'system:global:manage']");
  });

  it('numerador: linhas explicitamente incluídas, pela competência, em estados válidos', () => {
    const linhas = corpo('_fin_cmv_linhas');
    expect(linhas.match(/cp\.status IN \('AGUARDANDO_APROVACAO', 'APROVADO', 'PAGO'\)/g)).toHaveLength(2);
    expect(linhas).toContain('cp.company_id = p_company_id');
    expect(linhas).toContain('r.company_id = cp.company_id');
    // boleto com rateio nunca soma também o cabeçalho
    expect(linhas).toContain('NOT EXISTS');
    expect(linhas).not.toMatch(/fin_lancamentos|valor_pago|data_pagamento|data_vencimento|lancamento_pai_id/);

    const payload = corpo('_fin_cmv_payload');
    expect(payload).toContain('l.data_competencia BETWEEN p_inicio AND p_fim');
    expect(payload).toContain('cmv_incluir IS TRUE');
    expect(payload).toContain('count(DISTINCT conta_pagar_id)');
    expect(payload).not.toMatch(/data_pagamento|data_vencimento|created_at::date|valor_pago/);
    // centavos inteiros
    expect(payload).toContain('round(l.valor * 100)::bigint');
  });

  it('denominador: só o faturamento bruto do Fechamento de Caixa, sem multiplicar rateios', () => {
    const payload = corpo('_fin_cmv_payload');
    expect(payload).toContain('FROM public.financeiro_fechamento_caixa f');
    expect(payload).toContain('round(f.faturamento_bruto * 100)::bigint');
    expect(payload).toContain('f.company_id = p_company_id');
    expect(payload).not.toMatch(/fin_contas_receber|fin_lancamentos|fin_contas_saldo|financeiro_fechamento_marca_valores/);
    // fontes agregadas em CTEs separadas, nunca num JOIN entre rateio e fechamento
    expect(payload).not.toMatch(/JOIN\s+public\.financeiro_fechamento_caixa/i);
  });

  it('dia de negócio no fuso de São Paulo', () => {
    expect(corpo('_fin_cmv_payload')).toContain("(now() AT TIME ZONE 'America/Sao_Paulo')::date");
    expect(semComentarios).not.toMatch(/CURRENT_DATE|now\(\)::date/);
  });

  it('criação/edição seguem compatíveis com o cliente antigo', () => {
    for (const nome of ['_guarded_create_conta_pagar', '_guarded_update_conta_pagar']) {
      expect(sql).toMatch(new RegExp(`DROP FUNCTION IF EXISTS public\\.${nome}\\(`));
      const inicio = sql.search(new RegExp(`CREATE FUNCTION public\\.${nome}\\(`));
      const assinatura = sql.slice(inicio, sql.indexOf('RETURNS jsonb', inicio));
      expect(assinatura).toContain('p_cmv jsonb DEFAULT NULL::jsonb');
      expect(corpo(nome)).toContain('v_cmv_cliente boolean := p_cmv IS NOT NULL');
    }
    const criar = corpo('_guarded_create_conta_pagar');
    // decisão obrigatória só para o cliente novo, na criação, com a empresa ativada
    expect(criar).toContain('IF v_pendentes > 0 AND public._fin_cmv_ativo(v_company_id) THEN');
    expect(criar).toContain("RAISE EXCEPTION 'CMV_DECISAO_OBRIGATORIA");
    expect(criar).toContain('CASE WHEN v_cmv_cliente THEN r.cmv_incluir END');
    // parcelas herdam a decisão, cada uma com a sua competência
    expect(criar).toMatch(/SELECT v_child_id, categoria_id, centro_custo_id, valor, percentual, observacao, v_company_id, cmv_incluir/);
    // reenvio com outra decisão não volta "já registrado"
    expect(criar).toContain("(v_retrato->>'pendentes')::integer IS DISTINCT FROM v_pendentes");

    const editar = corpo('_guarded_update_conta_pagar');
    // edição: boleto legado pendente segue aceito; só não se apaga decisão já tomada (cliente novo + empresa ativada)
    expect(editar).not.toContain('IF v_pendentes > 0');
    expect(editar).toContain('IF v_cmv_cliente AND public._fin_cmv_ativo(v_company_id) THEN');
    expect(editar).toContain('WHERE o.cmv_incluir IS NOT NULL AND n.cmv_incluir IS NULL');
    expect(editar).toContain('v_old_cmv IS NOT NULL AND v_cmv_titulo IS NULL');
    expect(editar).toContain("RAISE EXCEPTION 'RATEIO_NAO_FECHA");
    // id do rateio preservado só quando a linha já era deste boleto
    expect(editar).toContain('FROM jsonb_to_recordset(v_old_rateios) AS o(id uuid, created_at timestamptz)');
    expect(editar).toContain('WHERE o.id = r.id');
    // cliente antigo herda a decisão da mesma categoria
    expect(editar).toContain('WHERE o.categoria_id IS NOT DISTINCT FROM r.categoria_id');
    expect(editar).toContain("'cmv', v_cmv_antes");
  });

  it('classificação: só a decisão muda, com lock otimista, ordem de bloqueio e auditoria antes/depois', () => {
    const body = corpo('fin_cmv_classificar');
    expect(body).toContain('ORDER BY cp.id\n    FOR UPDATE');
    expect(body).toContain("RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT: %'");
    expect(body).toContain("IF v_cp.status = 'CANCELADO' THEN");
    expect(body).toContain('WHERE id = v_item.rateio_id AND lancamento_id = v_cp.id AND company_id = v_company_id');
    expect(body).toContain("VALUES ('contas_pagar', v_cp.id, 'cmv_classificar', v_antes, v_depois");
    expect(body).toContain('IF v_total < 1 OR v_total > 500 THEN');
    // lote exige gerenciar o CMV; um boleto aceita quem edita Contas a Pagar
    expect(body).toContain("IF v_titulos > 1 THEN\n    IF NOT public.has_any_permission(v_uid, ARRAY['financeiro:cmv:manage', 'system:global:manage'])");
    const updates = body.match(/UPDATE public\.\w+\s+SET [^;]+;/g) ?? [];
    for (const update of updates) expect(update).toMatch(/SET (cmv_incluir = v_item\.incluir|updated_at = v_now)\s/);
  });

  it('padrão por categoria não toca em boleto nenhum', () => {
    const body = corpo('fin_cmv_set_categoria_padrao');
    expect(body).not.toMatch(/fin_contas_pagar|fin_lancamento_rateios/);
    expect(body).toContain("VALUES ('categorias', p_categoria_id, 'cmv_padrao'");
    expect(corpo('_fin_cmv_payload')).not.toContain('cmv_sugerir');
    expect(corpo('_fin_cmv_linhas')).not.toContain('cmv_sugerir');
  });

  it('o teste de banco real aplica esta mesma migration', () => {
    const ephemeral = readFileSync(resolve(process.cwd(), 'supabase/tests/database/cmv_financeiro_ephemeral.sql'), 'utf8');
    expect(ephemeral).toContain(`${'\\'}ir ../../migrations/${arquivo[0]}`);
    expect(ephemeral).toContain('SELECT public.run_cmv_financeiro_ephemeral_tests();');
  });

  it('resolve as colunas das consultas no deploy', () => {
    const bloco = sql.slice(sql.lastIndexOf('DO $$'));
    for (const nome of INTERNAS.filter(n => n !== '_fin_cmv_ativo')) expect(bloco).toContain(`public.${nome}(`);
  });
});

describe('RBAC do CMV Financeiro', () => {
  const financeiro = MODULE_MANIFESTS.find(m => m.key === 'financeiro')!;
  const cmv = financeiro.subtabs.find(s => s.key === 'cmv')!;

  it('registry e migration declaram as mesmas chaves', () => {
    const chaves = cmv.actions.map(a => `financeiro:cmv:${a.action}`).sort();
    expect(chaves).toEqual(['financeiro:cmv:export', 'financeiro:cmv:manage', 'financeiro:cmv:view']);
    for (const chave of chaves) {
      // em permissions e em role_permissions (admin, diretor, gerente_geral)
      expect(sql.split(`'${chave}'`).length - 1).toBeGreaterThanOrEqual(2);
    }
    expect(sql).toContain("FROM (VALUES ('admin'), ('diretor'), ('gerente_geral')) AS r(role)");
  });

  it('chave legada não libera o CMV Financeiro', () => {
    const legado = Object.values(LEGACY_PERMISSION_MAP).flat();
    expect(legado.some(chave => chave.startsWith('financeiro:cmv:'))).toBe(false);
  });
});

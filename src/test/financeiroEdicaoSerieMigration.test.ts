import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const dir = resolve(process.cwd(), 'supabase/migrations');
const arquivo = readdirSync(dir).filter(nome => nome.endsWith('_financeiro_edicao_serie.sql'));
const sql = readFileSync(resolve(dir, arquivo[0] ?? ''), 'utf8').replace(/\r\n/g, '\n');

/** Corpo de uma função, do CREATE até o fim do dollar-quote. */
const corpo = (nome: string) => {
  const inicio = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  const fim = sql.slice(inicio).search(/\n\$(function)?\$;/);
  return sql.slice(inicio, inicio + fim);
};

const RPCS = [
  ['_guarded_update_conta_pagar_serie', 'fin_contas_pagar', '_guarded_update_conta_pagar', 'financeiro:pagar:edit', ['PAGO', 'CANCELADO']],
  ['_guarded_update_conta_receber_serie', 'fin_contas_receber', '_guarded_update_conta_receber', 'financeiro:receber:edit', ['RECEBIDO', 'CANCELADO']],
] as const;

describe('migration da edição em série de Contas a Pagar/Receber — contrato SQL', () => {
  it('existe uma única migration, posterior à do CMV', () => {
    expect(arquivo).toHaveLength(1);
    expect(arquivo[0] > '20261008120000').toBe(true);
  });

  it('é aditiva: sem DROP, sem DDL de tabela, sem escrita fora de função', () => {
    // A reversão fica só em comentário no cabeçalho.
    const semComentarios = sql.replace(/^\s*--.*$/gm, '');
    expect(semComentarios).not.toMatch(/\bDROP\b|\bALTER TABLE\b|\bCREATE TABLE\b|\bTRUNCATE\b|\bCREATE POLICY\b/);
    const foraDeFuncao = semComentarios.replace(/AS \$(function)?\$[\s\S]*?\n\$(function)?\$;/g, '');
    expect(foraDeFuncao).not.toMatch(/\bUPDATE\b|\bINSERT\b|\bDELETE\b/);
  });

  it('não reescreve nenhuma RPC existente', () => {
    const criadas = [...sql.matchAll(/CREATE OR REPLACE FUNCTION public\.(\w+)\(/g)].map(m => m[1]).sort();
    expect(criadas).toEqual([
      '_fin_serie_classificacao', '_fin_serie_data', '_fin_serie_rateios', '_fin_serie_retrato',
      '_guarded_update_conta_pagar_serie', '_guarded_update_conta_receber_serie',
    ]);
  });

  it('toda função fixa o search_path vazio', () => {
    expect(sql.match(/CREATE OR REPLACE FUNCTION/g) ?? []).toHaveLength(6);
    expect(sql.match(/SET search_path = ''/g) ?? []).toHaveLength(6);
  });

  it('dia de negócio: nenhuma data derivada do relógio UTC', () => {
    expect(sql).not.toMatch(/CURRENT_DATE|now\(\)::date/i);
  });

  it.each(RPCS)('%s: tenant no servidor, permissão de editar e busca sempre filtrada pela empresa', (nome, tabela, _interna, permissao) => {
    const rpc = corpo(nome);
    expect(rpc).toContain('SECURITY DEFINER');
    expect(rpc).toContain('v_company_id := public.assert_tenant();');
    expect(rpc).toContain(`'${permissao}', 'finance:manage', 'system:global:manage'`);
    // Toda leitura das tabelas do título passa pelo company_id resolvido no servidor.
    const leituras = rpc.match(new RegExp(`FROM public\\.${tabela}(?: \\w+)?\\s*\\n\\s*WHERE[^\\n]*`, 'g')) ?? [];
    expect(leituras.length).toBeGreaterThanOrEqual(4);
    for (const leitura of leituras) expect(leitura).toMatch(/company_id = v_company_id/);
    expect(rpc).toMatch(/WHERE id = p_id AND company_id = v_company_id\s+FOR UPDATE;/);
  });

  it.each(RPCS)('%s: reaproveita a edição avulsa e trava as próximas parcelas', (nome, _tabela, interna) => {
    const rpc = corpo(nome);
    // A editada e cada próxima passam pela RPC que já existe (validações, rateio, CMV, auditoria).
    expect(rpc.match(new RegExp(`public\\.${interna}\\(`, 'g')) ?? []).toHaveLength(2);
    expect(rpc).toContain('p_expected_updated_at => p_expected_updated_at');
    expect(rpc).toContain('p_expected_updated_at => v_parcela.updated_at');
    expect(rpc).toMatch(/ORDER BY \w+\.parcela_atual\s+FOR UPDATE/);
    expect(rpc).toContain("RAISE EXCEPTION 'SERIE_INVALIDA");
    expect(rpc).toContain("RAISE EXCEPTION 'SERIE_AMBIGUA");
    // Série pelo created_at da criação (a 1ª parcela pode ter sido excluída) ou pelo pai.
    expect(rpc).toContain('.created_at = v_ref.created_at');
    expect(rpc).toContain('lancamento_pai_id = COALESCE(v_ref.lancamento_pai_id, v_ref.id)');
  });

  it.each(RPCS)('%s: parcelas quitadas ou canceladas ficam de fora', (nome, _tabela, _interna, _permissao, quitadas) => {
    expect(corpo(nome)).toContain(`IF v_parcela.status IN ('${quitadas[0]}', '${quitadas[1]}') THEN`);
  });

  it.each(RPCS)('%s: só leva às próximas o que mudou nesta edição e registra o resumo com o "antes"', (nome) => {
    const rpc = corpo(nome);
    expect(rpc).toContain('IF cardinality(v_campos) > 0 THEN');
    expect(rpc).toMatch(/CASE WHEN v_mudou_valor THEN v_pos\.valor ELSE v_parcela\.valor END/);
    expect(rpc).toContain("'editar_serie'");
    // Retrato de cada parcela ANTES da edição avulsa regravá-la: dá para conferir ou desfazer o lote.
    expect(rpc.indexOf('_fin_serie_retrato(v_company_id, to_jsonb(v_parcela))'))
      .toBeLessThan(rpc.lastIndexOf('PERFORM public._guarded_update_conta_'));
    expect(rpc).toContain("jsonb_build_object('parcelas', v_antes)");
    // Autor nulo nunca casa no ramo pelo created_at.
    expect(rpc).not.toContain('created_by IS NOT DISTINCT FROM');
  });

  it('forma vazia que o formulário abre com o padrão da tela não conta como alteração', () => {
    // Se o padrão do formulário mudar, a RPC precisa mudar junto (senão a série inteira volta para aprovação).
    for (const [rpc, tela, padrao] of [
      ['_guarded_update_conta_pagar_serie', 'ContasPagarSection.tsx', 'boleto'],
      ['_guarded_update_conta_receber_serie', 'ContasReceberSection.tsx', 'pix'],
    ] as const) {
      expect(corpo(rpc)).toContain(`v_ref.forma_pagamento IS NULL AND p_forma_pagamento = '${padrao}'`);
      const fonte = readFileSync(resolve(process.cwd(), 'src/components/financeiro', tela), 'utf8');
      expect(fonte).toContain(`forma_pagamento: detail.forma_pagamento || '${padrao}'`);
    }
  });

  it('o retrato do log nunca leva o código de pagamento', () => {
    const retrato = corpo('_fin_serie_retrato');
    expect(retrato).toContain("p_titulo - ARRAY['codigo_pagamento', 'codigo_pagamento_unaccent'");
    expect(retrato).toContain('r.company_id = p_company_id');
  });

  it('o cabeçalho traz a reversão de todas as funções criadas', () => {
    for (const nome of ['_guarded_update_conta_pagar_serie', '_guarded_update_conta_receber_serie',
      '_fin_serie_retrato', '_fin_serie_rateios', '_fin_serie_classificacao', '_fin_serie_data']) {
      expect(sql).toContain(`--   DROP FUNCTION public.${nome}(`);
    }
  });

  it('Contas a Pagar: o código de pagamento de cada boleto nunca é copiado', () => {
    const rpc = corpo('_guarded_update_conta_pagar_serie');
    const proximas = rpc.slice(rpc.indexOf('PERFORM public._guarded_update_conta_pagar('));
    expect(proximas).toContain('p_dados_pagamento => NULL');
  });

  it('helpers internos não são executáveis por clientes; as RPCs só por authenticated/service_role', () => {
    for (const helper of [
      '_fin_serie_data(date, integer, text, date, integer)',
      '_fin_serie_classificacao(uuid, uuid, uuid, uuid, boolean, numeric)',
      '_fin_serie_rateios(uuid, uuid, uuid, numeric)',
      '_fin_serie_retrato(uuid, jsonb)',
    ]) expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${helper} FROM PUBLIC, anon, authenticated, service_role;`);
    for (const [nome] of RPCS) {
      expect(sql).toMatch(new RegExp(`REVOKE ALL ON FUNCTION public\\.${nome}\\([^)]*\\) FROM PUBLIC, anon;`));
      expect(sql).toMatch(new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${nome}\\([^)]*\\) TO authenticated, service_role;`));
    }
  });
});

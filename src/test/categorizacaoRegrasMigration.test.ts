import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Categorização automática (Financeiro). Antes, "Aplicar Regras" falhava no gatilho de
 * lançamento REALIZADO (exige justificativa ao trocar a categoria) e a contagem, a prévia,
 * a aplicação e o alerta do Dashboard incluíam transferência, que nunca leva categoria.
 * O comportamento roda em supabase/tests/database/categorizacao_regras_ephemeral.sql.
 */
const ler = (caminho: string) => readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');
const migration = ler('supabase/migrations/20261010190000_fix_categorizacao_regras.sql');
const reversao = ler('docs/categorizacao-regras/reversao.sql');

/** Corpo de uma função da migration, do CREATE até o fim do bloco $function$. */
function corpo(nome: string): string {
  const inicio = migration.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nome}\\(`));
  expect(inicio, nome).toBeGreaterThanOrEqual(0);
  const fim = migration.indexOf('$function$;', inicio);
  return migration.slice(inicio, fim).replace(/\s+/g, ' ');
}

const CASA_CONTEM = "lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) LIKE v_padrao_like ESCAPE E'\\\\'";
const ESCAPA = "replace(replace(replace(v_padrao, E'\\\\', E'\\\\\\\\'), '%', E'\\\\%'), '_', E'\\\\_')";

describe('migração: regras de categorização', () => {
  it('Aplicar Regras grava a justificativa que o gatilho de lançamento realizado exige', () => {
    expect(corpo('aplicar_regras_categorizacao')).toContain(
      `justificativa_edicao = 'Categorização automática pela regra "' || v_regra.padrao || '"'`,
    );
  });

  it('transferência fica fora da contagem, da prévia, da aplicação e do alerta', () => {
    expect(corpo('contar_lancamentos_sem_categoria')).toContain("AND fl.tipo <> 'TRANSFERENCIA'");
    expect(corpo('preview_regra_categorizacao')).toContain("AND fl.tipo <> 'TRANSFERENCIA'");
    // Na aplicação, o tipo do lançamento precisa ser o da categoria (despesa/receita).
    expect(corpo('aplicar_regras_categorizacao')).toContain('AND fl.tipo = v_regra.tipo_lancamento');
    expect(corpo('get_fin_alertas')).toContain(
      "WHERE fl.company_id = v_company AND fl.status IN ('REALIZADO','CONCILIADO') AND fl.tipo <> 'TRANSFERENCIA' AND NOT (fl.origem = 'conciliacao' AND fl.conciliado IS NOT TRUE) AND fl.categoria_id IS NULL",
    );
  });

  it('linha de extrato não conciliada não é pendência; espelho de boleto não é categorizado pela regra', () => {
    const pendente = "AND NOT (fl.origem = 'conciliacao' AND fl.conciliado IS NOT TRUE)";
    for (const nome of ['contar_lancamentos_sem_categoria', 'aplicar_regras_categorizacao', 'preview_regra_categorizacao']) {
      expect(corpo(nome), nome).toContain(pendente);
    }
    const espelho = "AND COALESCE(fl.origem, '') NOT IN ('espelho_cp', 'espelho_cr')";
    expect(corpo('aplicar_regras_categorizacao')).toContain(espelho);
    expect(corpo('preview_regra_categorizacao')).toContain(espelho);
    expect(corpo('contar_lancamentos_sem_categoria')).not.toContain('espelho_cp');
  });

  it('o "Sem categoria" do Livro Razão também deixa a transferência de fora', () => {
    expect(corpo('list_fin_lancamentos_cursor')).toContain("v_sem AND l.tipo <> 'TRANSFERENCIA' AND (");
    expect(corpo('get_fin_lancamentos_totais')).toContain(
      "WHEN v_sem AND base.categoria_id IS NULL AND base.tipo <> 'TRANSFERENCIA' THEN base.valor",
    );
  });

  it('só categoria ativa da empresa, do mesmo tipo; centro só ativo, da empresa e onde o lançamento não tem', () => {
    const aplicar = corpo('aplicar_regras_categorizacao');
    expect(aplicar).toContain('JOIN public.fin_categorias c ON c.id = r.categoria_id AND c.company_id = v_company_id AND c.ativo = true');
    expect(aplicar).toContain('LEFT JOIN public.fin_centros_custo cc ON cc.id = r.centro_custo_id AND cc.company_id = v_company_id AND cc.ativo = true');
    expect(aplicar).toContain('upper(c.tipo) AS tipo_lancamento');
    expect(aplicar).toContain('centro_custo_id = COALESCE(fl.centro_custo_id, v_regra.centro_custo_id)');
    expect(corpo('preview_regra_categorizacao')).toContain(
      'WHERE c.id = p_categoria_id AND c.company_id = v_company_id AND c.ativo = true',
    );
  });

  it('a aplicação não mexe em lançamento com rateio (a categoria do cabeçalho seria ignorada)', () => {
    const semRateio = 'AND NOT EXISTS ( SELECT 1 FROM public.fin_lancamento_rateios flr WHERE flr.lancamento_id = fl.id ) AND (';
    expect(corpo('aplicar_regras_categorizacao')).toContain(semRateio);
    expect(corpo('preview_regra_categorizacao')).toContain(semRateio);
  });

  it('prévia e aplicação casam igual: sem acento e com \\ % _ do padrão como texto', () => {
    for (const nome of ['aplicar_regras_categorizacao', 'preview_regra_categorizacao']) {
      const f = corpo(nome);
      expect(f, nome).toContain(ESCAPA);
      expect(f, nome).toContain(CASA_CONTEM);
      expect(f, nome).toContain("WHEN 'exato' THEN lower(public.immutable_unaccent(COALESCE(fl.descricao, ''))) = v_padrao");
    }
  });

  it('as três funções da categorização: SECURITY DEFINER, search_path vazio, tenant e permissão', () => {
    for (const nome of ['contar_lancamentos_sem_categoria', 'aplicar_regras_categorizacao', 'preview_regra_categorizacao']) {
      const f = corpo(nome);
      expect(f, nome).toContain("SECURITY DEFINER SET search_path TO ''");
      expect(f, nome).toContain('v_company_id := public.assert_tenant();');
      expect(f, nome).toContain('IF NOT public.has_any_permission(auth.uid(), ARRAY[');
    }
    // Chave granular, legado e global, como as policies de fin_regras_categorizacao.
    expect(corpo('aplicar_regras_categorizacao')).toContain("'financeiro:categorizacao:manage', 'finance:manage', 'system:global:manage' ]");
    for (const nome of ['contar_lancamentos_sem_categoria', 'preview_regra_categorizacao']) {
      expect(corpo(nome), nome).toContain("'financeiro:categorizacao:view', 'financeiro:categorizacao:manage', 'finance:read', 'system:global:manage' ]");
    }
  });

  it('regex recusada pelo Postgres pula só a regra; padrão vazio não casa nada', () => {
    const aplicar = corpo('aplicar_regras_categorizacao');
    expect(aplicar).toContain("IF v_regra.tipo_match = 'regex' THEN PERFORM '' ~* v_regra.padrao; END IF;");
    expect(aplicar).toContain('EXCEPTION WHEN invalid_regular_expression THEN v_regras_com_erro := array_append(v_regras_com_erro, v_regra.padrao);');
    expect(aplicar).toContain("'regras_com_erro', to_json(v_regras_com_erro)");
    expect(aplicar).toContain("AND btrim(COALESCE(r.padrao, '')) <> ''");
    const previa = corpo('preview_regra_categorizacao');
    expect(previa).toContain("IF btrim(COALESCE(p_padrao, '')) = '' THEN RETURN '[]'::json; END IF;");
    expect(previa).toContain("IF p_tipo_match = 'regex' THEN PERFORM '' ~* p_padrao; END IF;");
    expect(previa).toContain("count(*) OVER () AS total");
  });

  it('prévia troca de assinatura sem deixar overload e com o ACL de antes', () => {
    const drop = migration.indexOf('DROP FUNCTION IF EXISTS public.preview_regra_categorizacao(text, text);');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(drop).toBeLessThan(migration.indexOf('CREATE OR REPLACE FUNCTION public.preview_regra_categorizacao('));
    expect(migration).toContain('p_categoria_id uuid DEFAULT NULL::uuid');
    expect(migration).toContain('REVOKE ALL ON FUNCTION public.preview_regra_categorizacao(text, text, uuid) FROM PUBLIC, anon;');
    expect(migration).toContain('GRANT EXECUTE ON FUNCTION public.preview_regra_categorizacao(text, text, uuid) TO authenticated, service_role;');
  });

  it('força a resolução das colunas novas na aplicação da migration', () => {
    const bloco = migration.slice(migration.lastIndexOf('DO $$'));
    expect(bloco).toContain('JOIN public.fin_categorias c');
    expect(bloco).toContain('fl.justificativa_edicao IS NULL');
    expect(bloco).toContain('public.immutable_unaccent');
  });

  it('a reversão devolve as 6 funções e a prévia de 2 argumentos', () => {
    expect(reversao).toContain('DROP FUNCTION IF EXISTS public.preview_regra_categorizacao(text, text, uuid);');
    for (const assinatura of [
      'public.contar_lancamentos_sem_categoria()',
      'public.aplicar_regras_categorizacao()',
      "public.preview_regra_categorizacao(p_padrao text, p_tipo_match text DEFAULT 'contem'::text)",
      'public.get_fin_alertas()',
      'public.get_fin_lancamentos_totais(',
      'public.list_fin_lancamentos_cursor(',
    ]) {
      expect(reversao, assinatura).toContain(`CREATE OR REPLACE FUNCTION ${assinatura}`);
    }
    expect(reversao).toContain('GRANT EXECUTE ON FUNCTION public.preview_regra_categorizacao(text, text) TO authenticated, service_role;');
  });
});

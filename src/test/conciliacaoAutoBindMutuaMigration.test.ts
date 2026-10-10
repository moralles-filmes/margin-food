import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Migrations da conciliação "uma linha do extrato por lançamento". O teste de
 * integração em PostgreSQL real é supabase/tests/database/
 * conciliacao_cobertura_unica_ephemeral.sql (fora do CI); aqui ficam as travas
 * estáticas que o CI confere.
 *
 * Busca pelo sufixo do nome: a versão do arquivo pode mudar no repair da aplicação.
 */
function lerMigration(sufixo: string): string {
  const dir = resolve(process.cwd(), 'supabase/migrations');
  const arquivos = readdirSync(dir).filter(f => f.endsWith(`_${sufixo}.sql`));
  expect(arquivos).toHaveLength(1);
  return readFileSync(resolve(dir, arquivos[0]), 'utf8').replace(/\r\n/g, '\n');
}

function corpoDa(migration: string, assinatura: string): string {
  const inicio = migration.indexOf(`CREATE OR REPLACE FUNCTION ${assinatura}`);
  const fim = migration.indexOf('$function$;', inicio);
  expect(inicio).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  return migration.slice(inicio, fim);
}

const compactar = (s: string) => s.replace(/\s+/g, ' ');

describe('migração: vínculo automático de transferência pelo vizinho mútuo', () => {
  // reconcile_auto_bind_transfer_counterparts passava pela ordem de p_lines: a
  // primeira linha de mesmo valor no raio de 3 dias ficava com a transferência,
  // mesmo com a contrapartida real mais perto dela no mesmo lote.
  const migration = lerMigration('conciliacao_auto_bind_transferencia_mutua');
  const corpo = corpoDa(migration, 'public.reconcile_auto_bind_transfer_counterparts(');
  const compacto = compactar(corpo);

  it('mantém assinatura, segurança e grants', () => {
    expect(migration).not.toContain('DROP FUNCTION');
    expect(corpo).toContain('reconcile_auto_bind_transfer_counterparts(p_conta_id uuid, p_lines jsonb)');
    expect(corpo).toContain('SECURITY DEFINER');
    expect(corpo).toContain("SET search_path = ''");
    expect(corpo).toContain('v_company := public.assert_tenant();');
    expect(compacto).toContain("'financeiro:conciliacao:reconcile', 'finance:manage', 'system:global:manage'");
    const arquivo = compactar(migration);
    expect(arquivo).toContain('REVOKE ALL ON FUNCTION public.reconcile_auto_bind_transfer_counterparts(uuid, jsonb) FROM PUBLIC, anon;');
    expect(arquivo).toContain('GRANT EXECUTE ON FUNCTION public.reconcile_auto_bind_transfer_counterparts(uuid, jsonb) TO authenticated, service_role;');
  });

  it('linha já vinculada nesta conta só volta no retorno e não disputa transferência', () => {
    const jaVinculada = corpo.indexOf('v_matched_external_ids := v_matched_external_ids || jsonb_build_array(v_external_id);');
    const livres = corpo.indexOf('v_livres_external_id := array_append(v_livres_external_id, v_external_id);');
    expect(jaVinculada).toBeGreaterThan(0);
    expect(livres).toBeGreaterThan(jaVinculada);
  });

  it('linha inválida é pulada sem derrubar o lote', () => {
    expect(compacto).toContain('EXCEPTION WHEN invalid_text_representation OR invalid_datetime_format OR datetime_field_overflow OR numeric_value_out_of_range THEN CONTINUE;');
    expect(compacto).toContain("IF v_valor <= 0 OR v_valor IN ('NaN'::numeric, 'Infinity'::numeric) OR NOT isfinite(v_data) THEN CONTINUE;");
  });

  it('acumula as linhas livres em arrays, não em jsonb concatenado a cada linha', () => {
    expect(corpo).not.toMatch(/v_linhas_livres\s*:=\s*v_linhas_livres\s*\|\|/);
    expect(compacto).toContain('FROM unnest(v_livres_external_id, v_livres_tipo, v_livres_data, v_livres_valor)');
  });

  it('candidata exige vínculo na outra conta, nenhum nesta, e data dentro do período do lote', () => {
    expect(compacto).toContain('AND source_link.conta_id <> p_conta_id');
    expect(compacto).toContain('AND target_link.conta_id = p_conta_id');
    expect(compacto).toContain('t.data_competencia BETWEEN (li.data - 3) AND (li.data + 3)');
    expect(compacto).toContain('AND t.data_competencia BETWEEN v_periodo_inicio AND v_periodo_fim');
    // O período conta todas as linhas válidas, inclusive as já vinculadas.
    const periodo = corpo.indexOf('v_periodo_inicio := LEAST(v_periodo_inicio, v_data);');
    const jaVinculada = corpo.indexOf('v_matched_external_ids := v_matched_external_ids || jsonb_build_array(v_external_id);');
    expect(periodo).toBeGreaterThan(0);
    expect(periodo).toBeLessThan(jaVinculada);
  });

  it('só vincula o par em que linha e transferência são a única mais próxima uma da outra', () => {
    expect(compacto).toContain('rank() OVER (PARTITION BY p.external_id, p.tipo ORDER BY p.distancia) AS posicao_na_linha');
    expect(compacto).toContain('rank() OVER (PARTITION BY p.lancamento_id ORDER BY p.distancia) AS posicao_na_transferencia');
    expect(compacto).toContain(
      'WHERE r.posicao_na_linha = 1 AND r.empates_na_linha = 1 AND r.posicao_na_transferencia = 1 AND r.empates_na_transferencia = 1',
    );
  });

  it('não depende da ordem do lote: nada de laço gravando vínculo linha a linha', () => {
    const laco = corpo.slice(corpo.indexOf('FOR v_line IN'), corpo.indexOf('END LOOP;'));
    expect(laco).not.toContain('INSERT INTO public.fin_conciliacao_vinculos');
    expect(corpo.match(/INSERT INTO public\.fin_conciliacao_vinculos/g)).toHaveLength(1);
  });
});

describe('migração: um vínculo por lançamento e legado pela ocorrência', () => {
  const migration = lerMigration('conciliacao_vinculo_unico_por_lancamento');
  const bind = corpoDa(migration, 'public.reconcile_bind_extrato(');
  const bindCompacto = compactar(bind);
  const importar = corpoDa(migration, 'public.reconcile_import_lancamento(');

  it('mantém assinaturas, segurança e grants das duas funções', () => {
    expect(migration).not.toContain('DROP FUNCTION');
    for (const corpo of [bind, importar]) {
      expect(corpo).toContain('SECURITY DEFINER');
      expect(corpo).toContain("SET search_path = ''");
      expect(corpo).toContain('public.assert_tenant()');
    }
    const arquivo = compactar(migration);
    expect(arquivo).toContain('REVOKE ALL ON FUNCTION public.reconcile_bind_extrato(uuid, text, text, uuid) FROM PUBLIC, anon;');
    expect(arquivo).toContain('GRANT EXECUTE ON FUNCTION public.reconcile_bind_extrato(uuid, text, text, uuid) TO authenticated, service_role;');
    expect(arquivo).toContain('REVOKE EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) FROM PUBLIC, anon;');
    expect(arquivo).toContain('GRANT EXECUTE ON FUNCTION public.reconcile_import_lancamento(date, text, numeric, text, uuid, uuid, jsonb, text, boolean, integer, date) TO authenticated, service_role;');
  });

  it('bind: 2º FITID no lançamento já vinculado nesta conta é recusado; o reenvio do mesmo é idempotente', () => {
    const idempotente = bind.indexOf('IF v_existing_lancamento_id = p_lancamento_id THEN');
    const guarda = bind.indexOf("RAISE EXCEPTION 'LANCAMENTO_JA_VINCULADO");
    expect(idempotente).toBeGreaterThan(0);
    expect(guarda).toBeGreaterThan(idempotente);
    expect(bindCompacto).toContain('AND v.lancamento_id = p_lancamento_id AND (v.external_id, v.tipo) IS DISTINCT FROM (v_external_id, p_tipo)');
  });

  it('bind: trava o lançamento e não reponta o FITID gravado por outra chamada', () => {
    expect(bindCompacto).toMatch(/OR \(l\.tipo <> 'TRANSFERENCIA' AND l\.conta_id = p_conta_id\) \) FOR UPDATE;/);
    expect(bind).not.toContain('DO UPDATE SET lancamento_id');
    expect(bindCompacto).toContain('IF v_existing_lancamento_id IS DISTINCT FROM p_lancamento_id THEN RAISE EXCEPTION \'EXTERNAL_ID_CONFLICT');
  });

  it('import: linha com FITID procura o lançamento sem FITID pela chave da MESMA ocorrência', () => {
    const fallback = importar.slice(importar.indexOf('IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN'));
    expect(compactar(fallback)).toMatch(/^IF v_lancamento_id IS NULL AND v_external_id IS NOT NULL THEN SELECT id INTO v_lancamento_id FROM public\.fin_lancamentos WHERE idempotency_key = v_conteudo_idem_key AND company_id = v_company;/);
    expect(importar).not.toContain('WHERE idempotency_key = v_legacy_idem_key');
  });
});

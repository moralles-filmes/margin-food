import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Contas bancárias: gate das RPCs alinhado ao registry e ajuste do saldo inicial
 * pela conferência do extrato (caso Stone: conta cadastrada com o saldo de hoje e
 * extrato de dias anteriores).
 */
const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20261006163409_fin_conta_saldo_inicial_guarded.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

const corpoDe = (nome: string) => {
  const inicio = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${nome}(`);
  const fim = migration.indexOf('$function$;', inicio);
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  expect(fim).toBeGreaterThan(inicio);
  return migration.slice(inicio, fim).replace(/\s+/g, ' ');
};

const update = corpoDe('_guarded_update_conta');
const remove = corpoDe('_guarded_delete_conta');
const ajuste = corpoDe('_guarded_ajustar_saldo_inicial_conta');

const DATA_EFETIVA = "COALESCE(l.data_pagamento, (l.conciliado_em AT TIME ZONE 'America/Sao_Paulo')::date, l.data_competencia)";

describe('migração: saldo inicial e RPCs de conta bancária', () => {
  it('não troca assinatura das RPCs publicadas (CREATE OR REPLACE sem DROP)', () => {
    expect(migration).not.toMatch(/DROP FUNCTION/i);
    expect(update).toContain('p_saldo_inicial numeric DEFAULT 0, p_expected_updated_at timestamp with time zone DEFAULT NULL');
    expect(remove).toContain('_guarded_delete_conta(p_id uuid)');
  });

  it('gate aceita a chave granular, o legado que a expande e o super-admin — o banco não expande LEGACY_PERMISSION_MAP', () => {
    expect(update).toContain("has_any_permission(v_user_id, ARRAY['financeiro:contas:edit', 'finance:manage', 'system:global:manage'])");
    expect(remove).toContain("has_any_permission(v_user_id, ARRAY['financeiro:contas:delete', 'finance:delete', 'system:global:manage'])");
    expect(ajuste).toContain("has_any_permission(v_user, ARRAY['financeiro:contas:edit', 'finance:manage', 'system:global:manage'])");
    expect(migration).not.toMatch(/has_permission\('financeiro:contas/);
  });

  it('usa mensagens de erro que a tela de Contas Bancárias já trata (mapFinanceiroDeleteError na desativação)', () => {
    expect(update).toContain("RAISE EXCEPTION 'Permission denied'");
    expect(update).toContain("RAISE EXCEPTION 'Not found'");
    expect(update).toContain("RAISE EXCEPTION 'Conflict'");
    expect(remove).toContain("RAISE EXCEPTION 'Permission denied'");
    expect(remove).not.toContain("'Denied'");
  });

  it('edição e desativação travam a linha; desativação de id inexistente não grava auditoria falsa', () => {
    expect(update).toContain('WHERE id = p_id AND company_id = v_company_id FOR UPDATE;');
    expect(remove).toContain('WHERE id = p_id AND company_id = v_company_id FOR UPDATE;');
    const naoEncontrado = remove.indexOf("IF v_old_data IS NULL THEN RAISE EXCEPTION 'Not found'; END IF;");
    expect(naoEncontrado).toBeGreaterThan(0);
    expect(naoEncontrado).toBeLessThan(remove.indexOf('UPDATE fin_contas SET ativo = false'));
  });

  it('a edição grava o saldo novo na auditoria', () => {
    expect(update).toContain("jsonb_build_object('nome', p_nome, 'saldo', p_saldo_inicial)");
  });

  it('o ajuste trava a conta, é idempotente por valor e só então confere o lock otimista', () => {
    const forUpdate = ajuste.indexOf('WHERE c.id = p_conta_id AND c.company_id = v_company FOR UPDATE');
    const idempotente = ajuste.indexOf('IF round(v_saldo_atual, 2) = round(p_saldo_inicial, 2) THEN');
    const lockOtimista = ajuste.indexOf("RAISE EXCEPTION 'OPTIMISTIC_LOCK_CONFLICT'");
    expect(forUpdate).toBeGreaterThan(0);
    expect(idempotente).toBeGreaterThan(forUpdate);
    expect(lockOtimista).toBeGreaterThan(idempotente);
    expect(ajuste).toContain("RETURN jsonb_build_object('status', 'unchanged'");
  });

  it('recheca o histórico sob lock do cache de saldo, com a mesma data efetiva do saldo', () => {
    const lockCache = ajuste.indexOf('FROM public.fin_contas_saldo_cache s WHERE s.conta_id = p_conta_id FOR UPDATE');
    const anterior = ajuste.indexOf(`${DATA_EFETIVA} <= p_ate`);
    const posterior = ajuste.indexOf(`${DATA_EFETIVA} > p_periodo_fim`);
    const gravacao = ajuste.indexOf('UPDATE public.fin_contas SET saldo_inicial = p_saldo_inicial');
    expect(lockCache).toBeGreaterThan(0);
    expect(anterior).toBeGreaterThan(lockCache);
    expect(posterior).toBeGreaterThan(anterior);
    expect(gravacao).toBeGreaterThan(posterior);
    expect(ajuste).toContain("RAISE EXCEPTION 'LANCAMENTO_ANTERIOR'");
    expect(ajuste).toContain("RAISE EXCEPTION 'LANCAMENTO_POSTERIOR'");
    expect(ajuste).toContain("l.status IN ('REALIZADO', 'CONCILIADO')");
    expect(ajuste).toContain('(l.conta_id = p_conta_id OR l.conta_destino_id = p_conta_id)');
  });

  it('todo acesso é do tenant do escopo', () => {
    expect(ajuste).toContain('v_company := public.assert_tenant();');
    expect(ajuste.match(/company_id = v_company/g)?.length).toBeGreaterThanOrEqual(4);
    expect(ajuste).toContain('WHERE id = p_conta_id AND company_id = v_company;');
  });

  it('auditoria do ajuste registra antes, depois e a origem, sem gravar texto livre sem limite', () => {
    expect(ajuste).toContain("'ajustar_saldo_inicial', jsonb_build_object('saldo', v_saldo_atual)");
    expect(ajuste).toContain("'origem', 'conciliacao_extrato'");
    expect(ajuste).toContain("left(v_contexto->>'arquivo', 200)");
    expect(ajuste).toContain("jsonb_typeof(v_contexto->'saldo_informado') = 'number'");
  });

  it('SECURITY DEFINER com search_path fixo e EXECUTE só para authenticated/service_role', () => {
    for (const corpo of [update, remove, ajuste]) {
      expect(corpo).toContain('SECURITY DEFINER SET search_path = public, pg_temp');
    }
    for (const assinatura of [
      '_guarded_update_conta(uuid, text, text, text, text, text, numeric, timestamptz)',
      '_guarded_delete_conta(uuid)',
      '_guarded_ajustar_saldo_inicial_conta(uuid, numeric, date, date, timestamptz, jsonb)',
    ]) {
      expect(migration).toContain(`REVOKE ALL ON FUNCTION public.${assinatura} FROM PUBLIC, anon;`);
      expect(migration).toContain(`GRANT EXECUTE ON FUNCTION public.${assinatura} TO authenticated, service_role;`);
    }
  });
});

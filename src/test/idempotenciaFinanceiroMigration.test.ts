import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const ler = (arquivo: string) =>
  readFileSync(resolve(process.cwd(), 'supabase/migrations', arquivo), 'utf8').replace(/\r\n/g, '\n');

const migration = ler('20260929183200_idempotencia_financeiro.sql');
const grants = ler('20260929183210_idempotencia_financeiro_grants.sql');

/** Corpo de uma função, do CREATE até o fim do dollar-quote. */
function funcao(nome: string): string {
  const inicio = migration.search(new RegExp(`CREATE (OR REPLACE )?FUNCTION public\\.${nome}\\(`));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  const fim = migration.indexOf('$function$;', inicio);
  expect(fim).toBeGreaterThan(inicio);
  return migration.slice(inicio, fim);
}

const RECRIADAS: Array<[string, string]> = [
  ['_guarded_upsert_lancamento', 'p_idempotency_key text DEFAULT NULL'],
  ['create_transfer', 'p_idempotency_key text DEFAULT NULL'],
  ['_guarded_create_conta_pagar', 'p_idempotency_key text DEFAULT NULL'],
  ['_guarded_create_conta_receber', 'p_idempotency_key text DEFAULT NULL'],
  ['gerar_parcela_recorrente', 'p_parcela_esperada integer DEFAULT NULL'],
];

describe('migração: idempotência das criações do Financeiro', () => {
  it.each(RECRIADAS)('%s: DROP da assinatura antiga antes do CREATE e parâmetro novo com DEFAULT', (nome, parametro) => {
    const drop = migration.indexOf(`DROP FUNCTION IF EXISTS public.${nome}(`);
    const create = migration.indexOf(`CREATE FUNCTION public.${nome}(`);
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
    // O front publicado não envia o parâmetro novo: sem DEFAULT a chamada dele quebra.
    expect(funcao(nome)).toContain(parametro);
  });

  it('a garantia é o índice único parcial com company_id, não o SELECT prévio', () => {
    for (const indice of [
      'uq_fin_contas_pagar_idempotency ON public.fin_contas_pagar (company_id, idempotency_key)',
      'uq_fin_contas_receber_idempotency ON public.fin_contas_receber (company_id, idempotency_key)',
      'uq_fin_contas_pagar_lancamento ON public.fin_contas_pagar (company_id, lancamento_id)',
      'uq_fin_contas_receber_lancamento ON public.fin_contas_receber (company_id, lancamento_id)',
    ]) {
      expect(migration.replace(/\n\s+/g, ' ')).toContain(`CREATE UNIQUE INDEX IF NOT EXISTS ${indice}`);
    }
    // Preflight: os índices de lancamento_id não podem nascer sobre duplicatas.
    expect(migration.indexOf('PREFLIGHT')).toBeLessThan(migration.indexOf('CREATE UNIQUE INDEX'));
  });

  it.each([
    ['_guarded_upsert_lancamento', 'idx_fin_lancamentos_company_idempotency'],
    ['create_transfer', 'idx_fin_lancamentos_company_idempotency'],
    ['_guarded_create_conta_pagar', 'uq_fin_contas_pagar_idempotency'],
    ['_guarded_create_conta_receber', 'uq_fin_contas_receber_idempotency'],
    ['reconcile_create_titulo_from_extrato', 'uq_fin_contas_pagar_lancamento'],
    ['reconcile_import_lancamento', 'idx_fin_lancamentos_company_idempotency'],
  ])('%s: unique_violation só vira reenvio quando vem do índice da chave', (nome, indice) => {
    const corpo = funcao(nome);
    expect(corpo).toContain('EXCEPTION WHEN unique_violation THEN');
    expect(corpo).toContain('GET STACKED DIAGNOSTICS');
    expect(corpo).toContain(`'${indice}'`);
    // Qualquer outra violação continua sendo erro.
    expect(corpo).toMatch(/THEN\s+RAISE;/);
  });

  it.each([
    '_guarded_upsert_lancamento',
    'create_transfer',
    '_guarded_create_conta_pagar',
    '_guarded_create_conta_receber',
    'reconcile_create_titulo_from_extrato',
  ])('%s: chave reaproveitada para outra operação levanta REQUEST_ID_REUTILIZADO', (nome) => {
    expect(funcao(nome)).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO'");
  });

  it.each([
    ['_guarded_upsert_lancamento', 'financeiro:lancamentos:create'],
    ['create_transfer', 'financeiro:lancamentos:create'],
    ['_guarded_create_conta_pagar', 'financeiro:pagar:create'],
    ['_guarded_create_conta_receber', 'financeiro:receber:create'],
    ['reconcile_create_titulo_from_extrato', 'financeiro:conciliacao:reconcile'],
    ['gerar_parcela_recorrente', 'financeiro:recorrencias:create'],
  ])('%s: gate com a chave granular da tela, o legado e system:global:manage', (nome, chave) => {
    const corpo = funcao(nome);
    expect(corpo).toContain('assert_tenant()');
    expect(corpo).toMatch(/has_any_permission\([^)]*ARRAY\[/);
    expect(corpo).toContain(`'${chave}'`);
    expect(corpo).toContain("'finance:manage'");
    expect(corpo).toContain("'system:global:manage'");
    // has_permission não expande system:global:manage nem o legado.
    expect(corpo).not.toMatch(/\bhas_permission\(/);
    expect(corpo).toContain('fin_audit_logs');
  });

  it('extrato → título trava o lançamento e tira valor e conta dele, não do cliente', () => {
    const corpo = funcao('reconcile_create_titulo_from_extrato');
    expect(corpo).toMatch(/WHERE l\.id = p_lancamento_id AND l\.company_id = v_company\s+FOR UPDATE/);
    expect(corpo).not.toMatch(/\bp_valor\b/);
    expect(corpo).toContain('v_lanc.valor');
    expect(corpo).toContain('v_lanc.conta_id');
    // referencia_modulo/referencia_id têm DEFAULT '' no banco — '' não é vínculo.
    expect(corpo).toContain("NULLIF(v_lanc.referencia_modulo, '')");
  });

  it('extrato → título: reenvio com categoria/fornecedor/datas diferentes não vira sucesso silencioso', () => {
    const corpo = funcao('reconcile_create_titulo_from_extrato');
    const comparacao = corpo.slice(corpo.indexOf('IF v_idempotente THEN'));
    for (const campo of ['categoria_id', 'supplier_id', 'descricao', 'data_vencimento', 'data_pagamento', 'data_recebimento', 'cliente']) {
      expect(comparacao).toContain(`.${campo} IS DISTINCT FROM`);
    }
    expect(comparacao).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO'");
    // A comparação vem antes de tocar no lançamento.
    expect(corpo.indexOf('IF v_idempotente THEN')).toBeLessThan(corpo.indexOf('UPDATE public.fin_lancamentos'));
  });

  it('recorrência: reenvio da parcela já gerada devolve a mesma, pular parcela é recusado', () => {
    const corpo = funcao('gerar_parcela_recorrente');
    expect(corpo).toContain('IF p_parcela_esperada <= v_geradas THEN');
    expect(corpo).toContain('PARCELA_FORA_DE_ORDEM');
  });

  it('transferência grava a autoria da sessão, nunca a enviada pelo cliente', () => {
    const corpo = funcao('create_transfer');
    expect(corpo).not.toMatch(/COALESCE\(p_created_by/i);
    expect(corpo).toMatch(/'REALIZADO', v_uid, v_company, v_idem_key/);
  });

  it('grants: execução só para authenticated e service_role, nunca PUBLIC/anon', () => {
    const assinaturas = [
      '_guarded_upsert_lancamento(uuid, text, text, numeric, uuid, uuid, uuid, date, date, date, text, text, text, text, boolean, jsonb, jsonb, timestamp with time zone, text, text)',
      'create_transfer(uuid, uuid, numeric, date, text, uuid, text)',
      '_guarded_create_conta_pagar(text, numeric, text, uuid, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, text)',
      '_guarded_create_conta_receber(text, text, numeric, date, date, uuid, uuid, uuid, text, text, jsonb, jsonb, uuid, text)',
      'reconcile_create_titulo_from_extrato(uuid, text, text, date, date, date, uuid, uuid, text, text)',
      'gerar_parcela_recorrente(uuid, integer)',
    ];
    for (const assinatura of assinaturas) {
      expect(grants).toContain(`revoke execute on function public.${assinatura} from public, anon;`);
      expect(grants).toContain(`grant execute on function public.${assinatura} to authenticated, service_role;`);
    }
  });
});

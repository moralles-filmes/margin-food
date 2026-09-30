import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function ler(caminho: string): string {
  return readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');
}

const ponto = ler('supabase/migrations/20260930042119_rh_ponto_idempotencia.sql');
const folha = ler('supabase/migrations/20260930042210_rh_folha_transicoes.sql');
const ficha = ler('supabase/migrations/20260930042302_ficha_criar_componente_atomic.sql');
const empresa = ler('supabase/migrations/20260930042342_onboard_company_idempotencia.sql');
const aiChat = ler('supabase/functions/ai-chat/index.ts');
const fichaEdge = ler('supabase/functions/ficha-tecnica/index.ts');

function funcao(sql: string, nome: string): string {
  const inicio = sql.search(new RegExp(`create (or replace )?function public\\.${nome}\\(`, 'i'));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  const fins = ['$function$;', '$$;'].map(marca => sql.indexOf(marca, inicio)).filter(i => i >= 0);
  return sql.slice(inicio, Math.min(...fins));
}

describe('migração: registro de ponto idempotente', () => {
  it('índice único parcial por empresa sobre a chave', () => {
    expect(ponto).toMatch(/create unique index if not exists uq_rh_ponto_client_request\s+on public\.rh_ponto_registros \(company_id, client_request_id\)\s+where client_request_id is not null;/);
    expect(ponto).toContain('RH_PONTO_CLIENT_REQUEST_DUPLICADO');
  });

  it('só a violação da própria chave é reenvio; conteúdo diferente é REQUEST_ID_REUTILIZADO', () => {
    const corpo = funcao(ponto, 'rh_registrar_ponto');
    expect(corpo).toContain('security invoker');
    expect(corpo).toContain('exception when unique_violation');
    expect(corpo).toContain("v_constraint is distinct from 'uq_rh_ponto_client_request'");
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
    expect(corpo).toContain("'rh:ponto:create', 'rh:ponto', 'system:global:manage'");
    // Hora e dia do servidor, no fuso de negócio.
    expect(corpo).toContain("(now() at time zone 'America/Sao_Paulo')::date, now()");
    // A batida é do próprio usuário.
    expect(corpo).toContain('c.user_id = v_uid');
  });

  it('nunca executável por anon', () => {
    expect(ponto).toContain('revoke all on function public.rh_registrar_ponto(uuid, text, text) from public, anon;');
    expect(ponto).toContain('grant execute on function public.rh_registrar_ponto(uuid, text, text) to authenticated;');
  });
});

describe('migração: folha de pagamento com transições no servidor', () => {
  it('trigger barra reabrir folha aprovada/paga em qualquer caminho', () => {
    expect(folha).toMatch(/create trigger trg_rh_folha_transicao\s+before insert or update on public\.rh_folha_pagamento/);
    const guard = funcao(folha, 'rh_folha_guard_transicao');
    expect(guard).toContain("old.status in ('APROVADO', 'PAGO')");
    expect(guard).toContain('FOLHA_FECHADA');
    expect(guard).toContain('FOLHA_TRANSICAO_INVALIDA');
    // A aprovação não se reescreve depois.
    expect(guard).toContain('new.aprovado_por := old.aprovado_por');
  });

  it('recálculo num upsert atômico que não reabre folha fechada', () => {
    const corpo = funcao(folha, 'rh_folha_salvar_calculo');
    expect(corpo).toContain('on conflict (colaborador_id, periodo) do update');
    expect(corpo).toContain("and f.status in ('RASCUNHO', 'CALCULADO')");
    expect(corpo).toContain('COLABORADOR_FORA_DO_TENANT');
    expect(corpo).toContain("'rh:folha:manage', 'rh:manage', 'rh:admin', 'system:global:manage'");
  });

  it('aprovar/pagar confere o status de origem sob lock e é idempotente', () => {
    const corpo = funcao(folha, 'rh_folha_mudar_status');
    expect(corpo).toContain('for update');
    expect(corpo).toContain("'idempotente', true");
    expect(corpo).toContain("when 'APROVADO' then 'CALCULADO' when 'PAGO' then 'APROVADO'");
  });
});

describe('migração: componente de ficha técnica criado numa transação', () => {
  it('índice único parcial por empresa sobre a chave', () => {
    expect(ficha).toMatch(/create unique index if not exists uq_ficha_componentes_client_request\s+on public\.ficha_componentes \(company_id, client_request_id\)\s+where client_request_id is not null;/);
  });

  it('as regras de BOM ficam num lugar só, fora do alcance do cliente', () => {
    expect(funcao(ficha, 'ficha_salvar_componente_itens_atomic')).toContain('public._ficha_gravar_componente_itens(');
    expect(funcao(ficha, 'ficha_criar_componente_atomic')).toContain('public._ficha_gravar_componente_itens(');
    expect(ficha).toMatch(/revoke all on function public\._ficha_gravar_componente_itens\([^)]*\)\s+from public, anon, authenticated;/);
  });

  it('reenvio pelo índice; itens diferentes com a mesma chave é REQUEST_ID_REUTILIZADO', () => {
    const corpo = funcao(ficha, 'ficha_criar_componente_atomic');
    expect(corpo).toContain("v_constraint is distinct from 'uq_ficha_componentes_client_request'");
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
    expect(corpo.split('except all').length - 1).toBe(2);
  });

  it('a Edge cria pela função atômica e a auditoria depois do commit não vira erro', () => {
    expect(fichaEdge).toContain("action === 'criar_componente'");
    expect(fichaEdge).toContain("userClient.rpc('ficha_criar_componente_atomic'");
    const audit = fichaEdge.slice(fichaEdge.indexOf('async function writeAudit('), fichaEdge.indexOf('serve('));
    expect(audit).not.toContain('throw');
  });
});

describe('migração: criar empresa idempotente', () => {
  it('CNPJ único pelos dígitos e chave única do cadastro', () => {
    expect(empresa).toMatch(/create unique index if not exists uq_companies_cnpj_digitos\s+on public\.companies \(\(regexp_replace\(cnpj, '\\D', '', 'g'\)\)\)/);
    expect(empresa).toMatch(/create unique index if not exists uq_companies_onboarding_request\s+on public\.companies \(onboarding_request_id\)/);
    expect(empresa).toContain('COMPANIES_CNPJ_DUPLICADO');
  });

  it('DROP da assinatura antiga antes do CREATE (sem overload) e parâmetro novo com DEFAULT', () => {
    const drop = empresa.indexOf('drop function if exists public.onboard_new_company(text, text, uuid);');
    const create = empresa.indexOf('create function public.onboard_new_company(');
    expect(drop).toBeGreaterThanOrEqual(0);
    expect(create).toBeGreaterThan(drop);
    expect(empresa).toContain('p_onboarding_request_id text default null::text');
  });

  it('reenvio devolve a empresa existente; conteúdo diferente é REQUEST_ID_REUTILIZADO', () => {
    const corpo = funcao(empresa, 'onboard_new_company');
    expect(corpo).toContain("'idempotente', true");
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
    expect(corpo).toContain("IF v_constraint = 'uq_companies_cnpj_digitos'");
  });
});

describe('Edge ai-chat: idempotência antes da chamada paga', () => {
  it('reserva a linha de ai_logs antes do fetch ao modelo', () => {
    const reserva = aiChat.indexOf('BLOCO 3: Reserva antes da chamada paga');
    const chamada = aiChat.indexOf('https://generativelanguage.googleapis.com');
    expect(reserva).toBeGreaterThan(0);
    expect(chamada).toBeGreaterThan(reserva);
  });

  it('usa a chave do cliente e trata a corrida pelo índice único', () => {
    expect(aiChat).toContain('const idemKey = chaveCliente || crypto.randomUUID();');
    expect(aiChat).toContain('reservaError.code === "23505"');
    expect(aiChat).toContain('"IN_PROGRESS"');
  });

  it('falha da reserva não chama o modelo', () => {
    const falha = aiChat.indexOf('LOG_RESERVE_FAILED');
    expect(falha).toBeGreaterThan(0);
    expect(falha).toBeLessThan(aiChat.indexOf('https://generativelanguage.googleapis.com'));
  });
});

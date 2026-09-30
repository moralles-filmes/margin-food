import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const DIR = resolve(process.cwd(), 'supabase/migrations');

// Pelo sufixo: o prefixo é a versão que o apply_migration gravar.
function ler(sufixo: string): string {
  const nome = readdirSync(DIR).find(n => n.endsWith(sufixo));
  expect(nome, `migration ausente: *${sufixo}`).toBeDefined();
  return readFileSync(resolve(DIR, nome as string), 'utf8').replace(/\r\n/g, '\n');
}

const transferencia = ler('_transferencia_locais_idempotente.sql');
const financeiro = ler('_financeiro_tenant_receber_rateio.sql');
const produto = ler('_produto_criacao_idempotente.sql');

function funcao(sql: string, nome: string): string {
  const inicio = sql.search(new RegExp(`create (or replace )?function public\\.${nome}\\(`, 'i'));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  const fins = ['$function$;', '$$;'].map(marca => sql.indexOf(marca, inicio)).filter(i => i >= 0);
  return sql.slice(inicio, Math.min(...fins));
}

describe('migração: transferência entre locais', () => {
  const corpo = funcao(transferencia, 'stock_transfer_between_locations');

  it('grava a data como date (o text de antes quebrava com 42804)', () => {
    expect(corpo).toMatch(/v_today\s+date := \(now\(\) at time zone 'America\/Sao_Paulo'\)::date;/);
    expect(corpo).not.toContain('to_char(');
  });

  it('cada perna tem a própria referência — idx_mov_reference_unique admite uma linha ativa por referência', () => {
    expect(corpo).toContain("v_group || ':OUT'");
    expect(corpo).toContain("v_group || ':IN'");
    expect(transferencia).toMatch(/create unique index if not exists uq_mov_transfer_request\s+on public\.movimentacoes_estoque \(company_id, reference_id\)\s+where reference_type = 'INTERNAL_TRANSFER' and status = 'ATIVO';/);
    expect(transferencia).toContain('MOV_TRANSFER_REQUEST_DUPLICADO');
  });

  it('reenvio pelo índice: só a violação da própria chave vira idempotente, divergência é recusada', () => {
    expect(corpo).toContain('exception when unique_violation');
    expect(corpo).toContain("v_constraint not in ('uq_mov_transfer_request', 'idx_mov_reference_unique')");
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
  });

  it('saldo vem do cache produtos.saldo_atual, nunca da soma do ledger (que conta estornos)', () => {
    expect(corpo).toContain('v_product.saldo_atual');
    expect(corpo.toLowerCase()).not.toContain('sum(');
  });

  it('auditoria resolve o tenant pelo id da perna, não pelo ramo STOCK_TRANSFER do stamp_log', () => {
    expect(corpo).toContain("'TRANSFER_CREATE', 'movimentacoes_estoque', v_mov_out.id");
    expect(corpo).not.toMatch(/'STOCK_TRANSFER',\s*'movimentacoes_estoque'/);
  });

  it('assinatura nova com DEFAULT, sem overload, reaplicável e sem EXECUTE para anon', () => {
    expect(transferencia).toContain('drop function if exists public.stock_transfer_between_locations(uuid, text, text, numeric, text);');
    expect(transferencia).toContain('create or replace function public.stock_transfer_between_locations(');
    expect(corpo).toContain('p_client_request_id text default null');
    expect(transferencia).toContain('revoke all on function public.stock_transfer_between_locations(uuid, text, text, numeric, text, text) from public, anon;');
    expect(transferencia).toContain('revoke all on function public.list_stock_transfers(date, date, uuid, text, integer, integer) from public, anon;');
  });

  it('chave de transferência cancelada não ressuscita a operação', () => {
    const rapido = corpo.slice(corpo.indexOf('-- Caminho rápido'), corpo.indexOf('if not v_idempotente then'));
    expect(rapido).not.toContain("status = 'ATIVO'\n");
    expect(rapido).toContain("bool_or(status = 'ATIVO')");
    expect(rapido).toContain("if v_existe and not v_idempotente then\n            raise exception 'REQUEST_ID_REUTILIZADO';");
  });

  it('histórico junta as pernas pelo grupo', () => {
    const lista = funcao(transferencia, 'list_stock_transfers');
    expect(lista).toContain("|| ':IN'");
    expect(lista).toContain("m_out.reference_id like '%:OUT'");
  });

  it('cancelar uma perna estorna a irmã, com o estorno antes do CANCELADO', () => {
    const cancel = funcao(transferencia, 'cancel_stock_movement_atomic');
    const cascata = cancel.slice(cancel.indexOf("v_mov.reference_type = 'INTERNAL_TRANSFER'"));
    expect(cascata.length).toBeGreaterThan(0);
    const estorno = cascata.indexOf('INSERT INTO public.movimentacoes_estoque');
    const cancelado = cascata.indexOf("SET status = 'CANCELADO'");
    expect(estorno).toBeGreaterThanOrEqual(0);
    expect(cancelado).toBeGreaterThan(estorno);
    expect(cascata).toContain('WHERE company_id = v_cid');
  });

  it('cancelamento serializa pelo grupo antes de travar a linha (sem deadlock entre pernas opostas)', () => {
    const cancel = funcao(transferencia, 'cancel_stock_movement_atomic');
    expect(cancel.indexOf('pg_advisory_xact_lock')).toBeGreaterThanOrEqual(0);
    expect(cancel.indexOf('pg_advisory_xact_lock')).toBeLessThan(cancel.indexOf('FOR UPDATE'));
  });
});

describe('migração: financeiro filtra a empresa em buscas por id', () => {
  it('receive_conta_receber usa assert_tenant e filtra SELECT e UPDATE', () => {
    const corpo = funcao(financeiro, 'receive_conta_receber');
    expect(corpo).toContain('v_company_id := public.assert_tenant();');
    expect(corpo).not.toContain('v_company_id := v_item.company_id');
    expect(corpo).toMatch(/FROM fin_contas_receber\s+WHERE id = p_id AND company_id = v_company_id\s+FOR UPDATE;/);
    expect(corpo).toMatch(/UPDATE fin_contas_receber[\s\S]*WHERE id = p_id AND company_id = v_company_id;/);
    expect(financeiro).toContain('revoke all on function public.receive_conta_receber(uuid, text, date) from public, anon;');
  });

  it('trg_validate_rateio_sum só aceita pai da mesma empresa do rateio', () => {
    const corpo = funcao(financeiro, 'trg_validate_rateio_sum');
    for (const tabela of ['fin_lancamentos', 'fin_contas_pagar', 'fin_contas_receber']) {
      expect(corpo).toMatch(new RegExp(`FROM ${tabela}\\s+WHERE id = v_lancamento_id AND company_id = v_company_id`));
    }
  });
});

describe('migração: cadastro de produto idempotente', () => {
  const corpo = funcao(produto, 'estoque_criar_produto');

  it('chave guardada por índice único parcial com empresa', () => {
    expect(produto).toContain('alter table public.produtos add column if not exists client_request_id text;');
    expect(produto).toMatch(/create unique index if not exists uq_produtos_client_request\s+on public\.produtos \(company_id, client_request_id\)\s+where client_request_id is not null;/);
  });

  it('roda sob a RLS do chamador e só gera SKU quando o INSERT acontece', () => {
    expect(corpo).toContain('security invoker');
    expect(corpo).not.toContain('security definer');
    expect(corpo).toContain("coalesce(v_sku_in, public.generate_next_sku('MP'))");
    // O caminho rápido do reenvio vem antes de qualquer geração de SKU.
    expect(corpo.indexOf('client_request_id = v_key')).toBeLessThan(corpo.indexOf('generate_next_sku'));
  });

  it('unique_violation só é reenvio se a chave já existe; divergência é recusada', () => {
    expect(corpo).toContain('exception when unique_violation');
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
    expect(produto).toContain('revoke all on function public.estoque_criar_produto(jsonb, text) from public, anon;');
  });
});

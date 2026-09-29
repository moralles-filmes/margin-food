import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function ler(nome: string): string {
  return readFileSync(resolve(process.cwd(), 'supabase/migrations', nome), 'utf8').replace(/\r\n/g, '\n');
}

const requisicao = ler('20260929183100_requisicao_estoque_idempotencia.sql');
const movimentacao = ler('20260929183110_movimentacao_admin_idempotencia.sql');
const salmao = ler('20260929183120_salmao_idempotencia.sql');

function funcao(sql: string, nome: string): string {
  const inicio = sql.search(new RegExp(`create (or replace )?function public\\.${nome}\\(`, 'i'));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  // O corpo termina no primeiro fechamento de dollar-quote depois do CREATE.
  const fins = ['$function$;', '$$;'].map(marca => sql.indexOf(marca, inicio)).filter(i => i >= 0);
  return sql.slice(inicio, Math.min(...fins));
}

describe('migração: requisição de estoque idempotente', () => {
  it('índice único parcial por empresa sobre a chave', () => {
    expect(requisicao).toMatch(/create unique index if not exists uq_requisicoes_estoque_client_request\s+on public\.requisicoes_estoque \(company_id, client_request_id\)\s+where client_request_id is not null;/);
    expect(requisicao).toContain('REQUISICAO_CLIENT_REQUEST_DUPLICADO');
  });

  it('cabeçalho e itens na mesma função, com gate de tenant/permissão e reenvio pelo índice', () => {
    const corpo = funcao(requisicao, 'criar_requisicao_estoque');
    expect(corpo).toContain('security definer');
    expect(corpo).toMatch(/set search_path = 'public'/);
    expect(corpo).toContain('public.assert_tenant()');
    expect(corpo).toContain("'estoque:requisicoes:create', 'stock:requisitions:create', 'system:global:manage'");
    expect(corpo).toContain('PRODUTO_FORA_DO_TENANT');
    expect(corpo).toContain('insert into public.requisicoes_estoque');
    expect(corpo).toContain('insert into public.requisicao_estoque_itens');
    expect(corpo).toContain('exception when unique_violation');
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
    // Reenvio compara o multiconjunto de itens nos dois sentidos.
    expect(corpo.split('except all').length - 1).toBe(2);
  });

  it('nunca executável por anon', () => {
    expect(requisicao).toContain('revoke all on function public.criar_requisicao_estoque(text, text, jsonb, text) from public, anon;');
    expect(requisicao).toContain('grant execute on function public.criar_requisicao_estoque(text, text, jsonb, text) to authenticated;');
  });
});

describe('migração: nova movimentação admin idempotente', () => {
  it('chave por linha em reference_id, guardada por índice com empresa', () => {
    expect(movimentacao).toMatch(/create unique index if not exists uq_mov_manual_request\s+on public\.movimentacoes_estoque \(company_id, reference_id\)\s+where reference_type = 'ESTOQUE_MANUAL' and status = 'ATIVO';/);
    const corpo = funcao(movimentacao, 'estoque_registrar_movimentacoes_lote');
    expect(corpo).toContain("v_key || ':' || e.ordinality");
    expect(corpo).toContain("c_ref_type   constant text := 'ESTOQUE_MANUAL'");
  });

  it('roda sob a RLS do chamador e só trata como reenvio a violação da própria chave', () => {
    const corpo = funcao(movimentacao, 'estoque_registrar_movimentacoes_lote');
    expect(corpo).toContain('security invoker');
    expect(corpo).not.toContain('security definer');
    expect(corpo).toContain('get stacked diagnostics v_constraint = constraint_name');
    expect(corpo).toContain("v_constraint not in ('uq_mov_manual_request', 'idx_mov_reference_unique')");
    expect(corpo).toContain('REQUEST_ID_REUTILIZADO');
    // Lote gravado mais longo que o reenviado também diverge.
    expect(corpo).toContain("v_key || ':' || (v_total + 1)");
  });
});

describe('migração: Salmão idempotente', () => {
  it('índices únicos por empresa só sobre registro ativo (cancelado libera a chave)', () => {
    for (const tabela of ['salmon_entries', 'salmon_manipulations']) {
      expect(salmao).toMatch(new RegExp(
        `create unique index if not exists uq_${tabela}_client_request\\s+on public\\.${tabela} \\(company_id, client_request_id\\)\\s+where client_request_id is not null and status = 'ACTIVE';`,
      ));
    }
  });

  it('DROP da assinatura antiga antes de cada CREATE (sem overload)', () => {
    for (const nome of ['_salmon_create_entry_guarded', 'create_salmon_entry_atomic', '_salmon_create_manipulation_guarded', 'create_salmon_manipulation_atomic']) {
      const drop = salmao.indexOf(`drop function if exists public.${nome}(`);
      const create = salmao.indexOf(`create function public.${nome}(`);
      expect(drop, nome).toBeGreaterThanOrEqual(0);
      expect(create, nome).toBeGreaterThan(drop);
      expect(salmao, nome).not.toMatch(new RegExp(`create or replace function public\\.${nome}\\(`));
    }
  });

  it('parâmetro novo com DEFAULT, reenvio comparado e ACL de antes', () => {
    const semComentarios = salmao.split('\n').map(linha => linha.replace(/--.*$/, '')).join('\n');
    expect(semComentarios.match(/p_client_request_id text default null/g)).toHaveLength(4);
    for (const nome of ['create_salmon_entry_atomic', 'create_salmon_manipulation_atomic']) {
      const corpo = funcao(salmao, nome);
      expect(corpo).toContain('EXCEPTION WHEN unique_violation');
      expect(corpo).toContain("RAISE EXCEPTION 'REQUEST_ID_REUTILIZADO'");
      expect(corpo).toContain("'idempotente', true");
    }
    expect(salmao).toMatch(/revoke all on function public\.create_salmon_entry_atomic\([^)]*\) from public, anon, authenticated, service_role;/);
    expect(salmao).toMatch(/grant execute on function public\._salmon_create_entry_guarded\([^)]*\) to authenticated;/);
    expect(salmao).toMatch(/grant execute on function public\._salmon_create_manipulation_guarded\([^)]*\) to authenticated;/);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260929150000_listas_fixas_colaboradores.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('migração de colaboradores por lista fixa', () => {
  it('aborta se existir outra policy de leitura permissiva nas tabelas da lista', () => {
    const preflight = section('do $preflight$', '$preflight$;');
    expect(preflight).toContain("tablename in ('listas_fixas_setor', 'listas_fixas_setor_itens')");
    expect(preflight).toContain("permissive = 'PERMISSIVE'");
    expect(preflight).toContain('LISTAS_FIXAS_POLICY_DRIFT');
  });

  it('prende o vínculo à lista da mesma empresa com FK composta', () => {
    expect(migration.indexOf('listas_fixas_setor_company_id_id_key'))
      .toBeLessThan(migration.indexOf('constraint listas_fixas_setor_usuarios_lista_fk'));
    const fk = section('constraint listas_fixas_setor_usuarios_lista_fk', 'constraint listas_fixas_setor_usuarios_unico');
    expect(fk).toContain('foreign key (company_id, lista_fixa_id)');
    expect(fk).toContain('references public.listas_fixas_setor (company_id, id) on delete cascade');
  });

  it('força RLS e concede ao cliente só leitura, inclusão e exclusão', () => {
    expect(migration).toContain('alter table public.listas_fixas_setor_usuarios force row level security;');
    expect(migration).toContain('revoke all on public.listas_fixas_setor_usuarios from public, anon, authenticated;');
    expect(migration).toContain('grant select, insert, delete on public.listas_fixas_setor_usuarios to authenticated;');
    expect(migration).not.toMatch(/grant[^;]*update[^;]*listas_fixas_setor_usuarios to authenticated/i);
  });

  it('só quem gerencia requisições grava vínculos', () => {
    for (const policy of ['listas_fixas_setor_usuarios_insert', 'listas_fixas_setor_usuarios_delete']) {
      const body = section(`create policy ${policy}`, ';');
      expect(body).toContain('company_id = (select public.get_current_company_id())');
      expect(body).toContain("(select public.has_any_permission(auth.uid(), array[\n      'estoque:requisicoes:manage', 'system:global:manage'");
    }
  });

  it('o helper de visibilidade é SECURITY DEFINER com search_path vazio e fora do anon', () => {
    const helper = section('create or replace function public.lista_fixa_visivel_ao_usuario', '$$;');
    expect(helper).toContain('security definer');
    expect(helper).toContain("set search_path = ''");
    expect(helper).toContain('v.user_id = auth.uid()');
    expect(migration).toContain('revoke all on function public.lista_fixa_visivel_ao_usuario(uuid) from public, anon;');
  });

  it('o helper não responde sobre lista de outra empresa quando chamado direto em /rpc', () => {
    const helper = section('create or replace function public.lista_fixa_visivel_ao_usuario', '$$;');
    const escopo = helper.indexOf('l.company_id = public.get_current_company_id()');
    expect(escopo).toBeGreaterThan(0);
    // O escopo de empresa precisa valer para os dois ramos (sem vínculo / vinculado).
    expect(escopo).toBeLessThan(helper.indexOf('not exists'));
    expect(helper).toMatch(/\)\s*and \(\s*not exists/);
  });

  it('list_profiles_minimal passa a aceitar quem gerencia requisições, reescrevendo a definição viva', () => {
    const bloco = section('do $list_profiles$', '$list_profiles$;');
    expect(bloco).toContain("pg_get_functiondef('public.list_profiles_minimal(text,integer)'::regprocedure)");
    expect(bloco).toContain("if v_def ~ '''estoque:requisicoes:manage''' then\n    return;");
    expect(bloco).toContain('DRIFT: estoque:requisicoes:view não encontrado em list_profiles_minimal');
    expect(bloco).toContain("'''estoque:requisicoes:view'',''estoque:requisicoes:manage'''");
  });

  it('listas e itens só são lidos por quem gerencia ou por quem a lista libera', () => {
    const listas = section('alter policy listas_fixas_setor_select', ';');
    expect(listas).toContain('or public.lista_fixa_visivel_ao_usuario(id)');
    const itens = section('alter policy listas_fixas_setor_itens_select', ';');
    expect(itens).toContain('or public.lista_fixa_visivel_ao_usuario(lista_fixa_id)');
    for (const body of [listas, itens]) {
      expect(body).toContain('company_id = (select public.get_current_company_id())');
      // has_any_permission sempre embrulhado em (select ...) — InitPlan, não linha a linha.
      const chamadas = body.split('public.has_any_permission(').length - 1;
      const embrulhadas = body.split('(select public.has_any_permission(').length - 1;
      expect(chamadas).toBe(2);
      expect(embrulhadas).toBe(chamadas);
    }
  });
});

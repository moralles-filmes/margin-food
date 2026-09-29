import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const migration = readFileSync(
  resolve(process.cwd(), 'supabase/migrations/20260929160000_listas_fixas_somente_colaboradores.sql'),
  'utf8',
).replace(/\r\n/g, '\n');

function section(start: string, end: string): string {
  const startIndex = migration.indexOf(start);
  const endIndex = migration.indexOf(end, startIndex + start.length);
  expect(startIndex, `marcador inicial ausente: ${start}`).toBeGreaterThanOrEqual(0);
  expect(endIndex, `marcador final ausente: ${end}`).toBeGreaterThan(startIndex);
  return migration.slice(startIndex, endIndex);
}

describe('migração: lista fixa só para colaborador selecionado', () => {
  it('aborta se existir outra policy de leitura permissiva nas tabelas da lista ou do vínculo', () => {
    const preflight = section('do $preflight$', '$preflight$;');
    expect(preflight).toContain("tablename in ('listas_fixas_setor', 'listas_fixas_setor_itens', 'listas_fixas_setor_usuarios')");
    expect(preflight).toContain("permissive = 'PERMISSIVE'");
    expect(preflight).toContain('LISTAS_FIXAS_POLICY_DRIFT');
  });

  it('lista e itens: só gerente ou colaborador vinculado — sem ramo "lista sem vínculo"', () => {
    const listas = section('alter policy listas_fixas_setor_select', ';');
    const itens = section('alter policy listas_fixas_setor_itens_select', ';');
    expect(listas).toContain('where v.lista_fixa_id = listas_fixas_setor.id');
    expect(itens).toContain('where v.lista_fixa_id = listas_fixas_setor_itens.lista_fixa_id');
    for (const body of [listas, itens]) {
      expect(body).toContain('company_id = (select public.get_current_company_id())');
      expect(body).toContain('and v.user_id = (select auth.uid())');
      expect(body).not.toMatch(/not exists/i);
      expect(body).not.toContain('lista_fixa_visivel_ao_usuario');
      // has_any_permission sempre embrulhado em (select ...) — InitPlan, não linha a linha.
      const chamadas = body.split('public.has_any_permission(').length - 1;
      const embrulhadas = body.split('(select public.has_any_permission(').length - 1;
      expect(chamadas).toBe(2);
      expect(embrulhadas).toBe(chamadas);
    }
  });

  it('remove o helper SECURITY DEFINER exposto em /rpc, depois de tirar as policies dele', () => {
    const drop = migration.indexOf('drop function if exists public.lista_fixa_visivel_ao_usuario(uuid);');
    expect(drop).toBeGreaterThan(migration.indexOf('alter policy listas_fixas_setor_itens_select'));
    // Nenhuma função nova: a visibilidade é um EXISTS comum sob a RLS do chamador.
    expect(migration).not.toMatch(/create\s+(or\s+replace\s+)?function/i);
  });
});

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

function ler(caminho: string): string {
  return readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');
}

const sql = ler('supabase/migrations/20261006200000_super_admin_sem_acesso_implicito.sql');
const adminUsers = ler('supabase/functions/admin-users/index.ts');
const adminCompanies = ler('supabase/functions/admin-companies/index.ts');
const companyUsers = ler('supabase/functions/_shared/company-users.ts');

function funcao(nome: string): string {
  const inicio = sql.search(new RegExp(`create (or replace )?function public\\.${nome}\\(`, 'i'));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  return sql.slice(inicio, sql.indexOf('$function$;', inicio));
}

describe('migração: super admin sem acesso implícito às unidades', () => {
  it('onboard_new_company não cria membership para quem cria a empresa', () => {
    const corpo = funcao('onboard_new_company');
    expect(corpo).not.toMatch(/VALUES\s*\(\s*v_caller_uid\s*,\s*v_new_company_id\s*\)/);
    expect(corpo).not.toMatch(/user_roles[^;]*v_caller_uid/);
    expect(corpo).toContain("IF p_admin_user_id = v_caller_uid THEN");
    expect(corpo).toContain('SELF_PROVISIONING_DENIED');
  });

  it('provisionar entre unidades: nunca para o próprio ator e só sem gestor na unidade, sob lock', () => {
    const corpo = funcao('admin_upsert_company_membership');
    const fallback = corpo.indexOf('FROM public.profiles p WHERE p.id=p_actor_user_id');
    const self = corpo.indexOf("IF p_user_id=p_actor_user_id THEN");
    expect(fallback).toBeGreaterThan(0);
    expect(self).toBeGreaterThan(fallback);
    const lock = corpo.indexOf("pg_advisory_xact_lock(hashtextextended('company-bootstrap:'");
    const gestor = corpo.indexOf('IF public._company_has_user_manager(p_company_id) THEN');
    expect(lock).toBeGreaterThan(0);
    expect(gestor).toBeGreaterThan(lock);
    expect(corpo).toContain('COMPANY_HAS_USER_MANAGER');
  });

  it('1º gestor: reenvio que já deu certo é idempotente e nunca recebe a chave da plataforma', () => {
    const corpo = funcao('admin_upsert_company_membership');
    const bloco = corpo.slice(corpo.indexOf('IF v_cross_company THEN'), corpo.indexOf('-- Serialize retries'));
    // O alvo já é o gestor → already_exists antes de recusar.
    expect(bloco.indexOf("'already_exists',true")).toBeLessThan(bloco.indexOf("MESSAGE='COMPANY_HAS_USER_MANAGER'"));
    expect(bloco).toMatch(/&& ARRAY\['system:global:manage'\][\s\S]*PRIVILEGE_ESCALATION_DENIED/);
    // Vínculo existente (inativo/sem gestão) do 1º gestor é refeito, não devolvido como já existente.
    expect(corpo).toContain("IF v_existed AND p_if_not_exists AND v_previous_status<>'revoked' AND NOT v_cross_company THEN");
  });

  it('gestor = quem passa no gate da RPC (sem system:admin sozinho)', () => {
    const helper = funcao('_company_has_user_manager');
    expect(helper).toContain("ARRAY['configuracoes:usuarios:manage','users:manage','system:global:manage']");
    expect(helper).not.toContain("'system:admin'");
  });

  it('a chave da plataforma não sai pela edição de usuário', () => {
    const corpo = funcao('admin_upsert_company_membership');
    const guarda = corpo.indexOf("MESSAGE='GLOBAL_KEY_REMOVAL_DENIED'");
    expect(guarda).toBeGreaterThan(0);
    expect(corpo.indexOf('DELETE FROM public.user_permissions')).toBeGreaterThan(guarda);
  });

  it('role_permissions deixa de ser gravável pelo cliente', () => {
    expect(sql).toContain('DROP POLICY IF EXISTS role_templates_manage ON public.role_permissions;');
    expect(sql).toContain('REVOKE INSERT, UPDATE, DELETE, TRUNCATE ON public.role_permissions FROM anon, authenticated;');
  });

  it('membership de quem detém system:global:manage na unidade só muda por quem também detém, antes de qualquer escrita', () => {
    const corpo = funcao('admin_upsert_company_membership');
    // Avaliado com as permissões da própria unidade, antes do fallback entre unidades.
    expect(corpo.indexOf('v_actor_global_here:=')).toBeLessThan(corpo.indexOf('FROM public.profiles p WHERE p.id=p_actor_user_id'));
    const guarda = corpo.indexOf("MESSAGE='PROTECTED_MEMBERSHIP'");
    expect(guarda).toBeGreaterThan(0);
    for (const escrita of ['DELETE FROM public.user_roles', 'DELETE FROM public.user_permissions', 'INSERT INTO public.company_memberships']) {
      expect(corpo.indexOf(escrita), escrita).toBeGreaterThan(guarda);
    }
    expect(corpo).toMatch(/IF v_existed AND NOT v_actor_global_here AND \(/);
  });

  it('reserva de convite segue a mesma regra do provisionamento entre unidades', () => {
    const corpo = funcao('reserve_company_invitation');
    expect(corpo).toContain('IF public._company_has_user_manager(p_company_id) THEN');
    expect(corpo).toContain('COMPANY_HAS_USER_MANAGER');
    expect(corpo).toContain("RAISE EXCEPTION 'COMPANY_INACTIVE'");
  });

  it('list_companies informa tem_gestor; helper não é exposto ao cliente', () => {
    expect(funcao('list_companies')).toContain('public._company_has_user_manager(c.id) AS tem_gestor');
    expect(sql).toContain('REVOKE ALL ON FUNCTION public._company_has_user_manager(uuid) FROM PUBLIC, anon, authenticated;');
  });

  it('remove o atalho rpc_set_user_company', () => {
    expect(sql).toContain('DROP FUNCTION IF EXISTS public.rpc_set_user_company(uuid, uuid);');
  });

  it('toda função SECURITY DEFINER fixa search_path', () => {
    const definers = sql.match(/CREATE OR REPLACE FUNCTION[\s\S]*?AS \$function\$/g) ?? [];
    expect(definers.length).toBe(5);
    for (const cabecalho of definers) {
      expect(cabecalho).toContain('SECURITY DEFINER');
      expect(cabecalho).toMatch(/SET search_path = /);
    }
  });
});

describe('Edge Functions: acesso protegido e sem autoprovisionamento', () => {
  it('admin-users barra senha/e-mail/status do membro protegido para quem não é super admin', () => {
    expect(adminUsers).toContain("if (!globalManager && await isProtected(targetId)) return json(");
    expect(adminUsers.indexOf('isProtected(targetId)')).toBeLessThan(adminUsers.indexOf("if (action === 'reset-password')"));
    expect(adminUsers).toContain("protegido:overrides.some(p => p.user_id===m.user_id && p.permission_key==='system:global:manage' && p.effect==='ALLOW')");
  });

  it('admin-companies recusa o próprio e-mail em "Criar Admin" e traduz as recusas do banco', () => {
    expect(adminCompanies).toContain("describeMembershipError('SELF_PROVISIONING_DENIED')");
    expect(adminCompanies).toContain('const denied = describeMembershipError(message);');
    expect(adminCompanies).toContain('if (err instanceof CompanyUserInputError) return json({ error: err.message }, 400);');
  });

  it('identidade criada e recusada pelo banco só é descartada sem nenhum vínculo gravado', () => {
    const descarte = companyUsers.slice(companyUsers.indexOf('async function discardOrphanIdentity'));
    expect(companyUsers).toContain('if (created) await discardOrphanIdentity(admin, userId!);');
    expect(descarte.indexOf("from('company_memberships')")).toBeLessThan(descarte.indexOf('deleteUser(userId)'));
    expect(descarte).toContain('if (error || count !== 0)');
  });
});

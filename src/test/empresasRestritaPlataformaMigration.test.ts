import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { PLATFORM_COMPANY_ID } from '@/permissions/plataforma';

function ler(caminho: string): string {
  return readFileSync(resolve(process.cwd(), caminho), 'utf8').replace(/\r\n/g, '\n');
}

const sql = ler('supabase/migrations/20261006210000_empresas_restrita_plataforma.sql');
const adminCompanies = ler('supabase/functions/admin-companies/index.ts');
const companyUsers = ler('supabase/functions/_shared/company-users.ts');

function funcao(nome: string): string {
  const inicio = sql.search(new RegExp(`create (or replace )?function public\\.${nome}\\(`, 'i'));
  expect(inicio, `função ausente: ${nome}`).toBeGreaterThanOrEqual(0);
  return sql.slice(inicio, sql.indexOf('$function$;', inicio));
}

describe('migração: Configurações → Empresas restrita à plataforma', () => {
  it('a unidade da plataforma do banco é a mesma do front', () => {
    expect(funcao('platform_company_id')).toContain(`'${PLATFORM_COMPANY_ID}'::uuid`);
  });

  it('limpa a chave dos papéis e de outras unidades, e trava a volta', () => {
    expect(sql).toMatch(/DELETE FROM public\.role_permissions WHERE permission_key LIKE 'configuracoes:empresas:%'/);
    expect(sql).toMatch(/DELETE FROM public\.user_permissions WHERE permission_key LIKE 'configuracoes:empresas:%'\s+AND \(company_id IS DISTINCT FROM public\.platform_company_id\(\)/);
    expect(sql).toMatch(/CREATE TRIGGER trg_user_permissions_empresas_plataforma\s+BEFORE INSERT OR UPDATE/);
    expect(sql).toMatch(/CREATE TRIGGER trg_role_permissions_sem_empresas\s+BEFORE INSERT OR UPDATE/);
    expect(funcao('trg_user_permissions_empresas_plataforma')).toContain("NEW.effect = 'ALLOW'");
  });

  it('só super admin na plataforma concede: os demais mantêm o estado atual', () => {
    const corpo = funcao('admin_upsert_company_membership');
    const filtro = corpo.indexOf("IF p_company_id IS DISTINCT FROM public.platform_company_id() THEN");
    const gravacao = corpo.indexOf('INSERT INTO public.user_permissions');
    expect(filtro).toBeGreaterThan(0);
    expect(gravacao).toBeGreaterThan(filtro);
    const bloco = corpo.slice(filtro, gravacao);
    expect(bloco).toContain('ELSIF NOT v_actor_global_here THEN');
    expect(bloco).toContain('|| v_empresas_atuais;');
  });

  it('delegado de Empresas: só o papel Admin, sem lista de chaves, só em empresa sem ninguém', () => {
    const corpo = funcao('admin_upsert_company_membership');
    const delegado = corpo.slice(corpo.indexOf("'configuracoes:empresas:create'=ANY("), corpo.indexOf('v_delegated:=true'));
    expect(delegado).toContain('IF p_permissions IS NOT NULL THEN');
    expect(delegado).toContain("IF p_role IS DISTINCT FROM 'admin'::public.app_role THEN");
    // Continua dentro do provisionamento entre unidades (lock + unidade sem gestor).
    expect(corpo.indexOf('v_delegated:=true')).toBeLessThan(corpo.indexOf('v_cross_company:=true'));
    // Loja antiga sem gestor fica com o super admin; o reenvio que já deu certo volta antes.
    const gestor = corpo.indexOf("MESSAGE='COMPANY_HAS_USER_MANAGER'");
    const membros = corpo.indexOf("IF v_delegated AND EXISTS(SELECT 1 FROM public.company_memberships WHERE company_id=p_company_id) THEN");
    expect(membros).toBeGreaterThan(gestor);
    expect(corpo).toMatch(/AND NOT COALESCE\('system:admin'=ANY\(v_actor_permissions\),false\)\s+AND NOT v_delegated/);
    const reserva = funcao('reserve_company_invitation');
    expect(reserva).toContain("'configuracoes:empresas:create'=ANY(");
    expect(reserva).toContain('COMPANY_ALREADY_HAS_MEMBERS');
  });

  it('estado atual de Empresas é lido antes da limpeza da readição', () => {
    const corpo = funcao('admin_upsert_company_membership');
    const leitura = corpo.indexOf('v_empresas_atuais:=ARRAY(');
    const limpeza = corpo.indexOf('IF v_existed AND p_if_not_exists THEN\n   -- Explicitly adding');
    expect(leitura).toBeGreaterThan(0);
    expect(limpeza).toBeGreaterThan(leitura);
    expect(corpo).toContain('|| v_empresas_atuais;');
  });

  it('RPCs de empresas usam o gate por ação; atalho de admin e desativar a plataforma bloqueados', () => {
    expect(funcao('list_companies')).toContain('public.can_manage_companies(NULL)');
    const onboard = funcao('onboard_new_company');
    expect(onboard).toContain("public.can_manage_companies('create')");
    expect(onboard).toMatch(/IF p_admin_user_id IS NOT NULL AND NOT has_permission\(v_caller_uid, 'system:global:manage'\)/);
    const update = funcao('update_company');
    expect(update).toContain("public.can_manage_companies('edit')");
    expect(update).toContain("public.can_manage_companies('delete')");
    expect(update).toContain('p_company_id = public.platform_company_id()');
    // Sem mudança não grava nem audita.
    expect(update.indexOf("'noop', true")).toBeGreaterThan(0);
    expect(update.indexOf("'noop', true")).toBeLessThan(update.indexOf('UPDATE companies SET'));
    // Nenhum gate antigo de super admin sobrou nas RPCs reescritas.
    for (const nome of ['list_companies', 'update_company']) {
      expect(funcao(nome)).not.toContain("NOT has_permission(v_caller_uid, 'system:global:manage')");
    }
  });

  it('gate por ação só vale com a plataforma ativa', () => {
    const gate = funcao('can_manage_companies');
    expect(gate).toContain('public.get_current_company_id() = public.platform_company_id()');
    expect(gate).toContain("public.has_permission(auth.uid(),'system:global:manage')");
  });

  it('Auditoria Segurança lê admin_actions_log da unidade, com o gate em InitPlan', () => {
    expect(sql).toMatch(/CREATE POLICY admin_actions_unit_security_read ON public\.admin_actions_log\s+FOR SELECT TO authenticated/);
    expect(sql).toContain("(SELECT public.has_any_permission(auth.uid(), ARRAY[\n     'configuracoes:auditoria-seguranca:view'");
    expect(sql).toContain('company_id = (SELECT public.get_current_company_id())');
  });

  it('admin-companies avalia o gate como o próprio usuário e traduz as recusas do banco', () => {
    expect(adminCompanies).toContain("authClient.rpc('can_manage_companies', { p_action: 'create' })");
    expect(adminCompanies).not.toContain("_permission: 'system:global:manage'");
    for (const codigo of ['COMPANY_ALREADY_HAS_MEMBERS', 'PRIVILEGE_ESCALATION_DENIED', 'PERMISSION_DENIED']) {
      expect(companyUsers).toMatch(new RegExp(`\\b${codigo}: '`));
    }
  });
});

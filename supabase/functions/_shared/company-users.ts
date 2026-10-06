import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

/** Dado de entrada inválido: a mensagem é escrita para a tela (HTTP 400). */
export class CompanyUserInputError extends Error {}

export function normalizeIdentityEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new CompanyUserInputError('E-mail inválido.');
  return email;
}

// Recusas de acesso vindas de admin_upsert_company_membership/reserve_company_invitation.
const MEMBERSHIP_ERRORS: Record<string, string> = {
  PROTECTED_MEMBERSHIP: 'Este acesso pertence à administração do sistema nesta unidade e só pode ser alterado por ela.',
  SELF_PROVISIONING_DENIED: 'Você não pode se dar acesso a outra unidade. Peça a um admin da unidade para cadastrar seu e-mail.',
  COMPANY_HAS_USER_MANAGER: 'Esta unidade já tem administrador. Novos acessos são criados pelo admin da própria unidade.',
  GLOBAL_KEY_REMOVAL_DENIED: 'A permissão de administração do sistema não sai pela edição de usuário. Use a tela de Super Admin, com dupla confirmação.',
  COMPANY_INACTIVE: 'Esta empresa está inativa.',
};

export function describeMembershipError(message: string): string | null {
  const code = Object.keys(MEMBERSHIP_ERRORS).find(key => message.includes(key));
  return code ? MEMBERSHIP_ERRORS[code] : null;
}

export async function addCompanyUser(admin: SupabaseClient, input: {
  actorUserId: string; companyId: string; email: unknown; password?: string; nome: string;
  role: string; permissions?: string[]; jobRoleId?: string | null; sector?: string | null; sendInvite?: boolean;
}) {
  const email = normalizeIdentityEmail(input.email);
  const { data: foundId, error: lookupError } = await admin.rpc('find_auth_user_by_email', { p_email: email });
  if (lookupError) throw lookupError;
  let userId = foundId as string | null;
  let created = false;
  if (!userId) {
    if (!input.sendInvite && (!input.password || input.password.length < 12)) throw new CompanyUserInputError('Nova identidade exige senha com no mínimo 12 caracteres.');
    // Auth grava app_metadata após o INSERT de auth.users. A reserva validada
    // permite que o trigger encontre a empresa também no cadastro com senha.
    const { error: reservationError } = await admin.rpc('reserve_company_invitation', {
      p_actor_user_id:input.actorUserId,p_company_id:input.companyId,p_email:email,
    });
    if (reservationError) throw reservationError;
    const { data, error } = input.sendInvite
      ? await admin.auth.admin.inviteUserByEmail(email,{ data:{ nome:input.nome } })
      : await admin.auth.admin.createUser({
      email, password: input.password, email_confirm: true,
      user_metadata: { nome: input.nome }, app_metadata: { company_id: input.companyId },
    });
    if (error) {
      // Auth enforces unique e-mail; concurrent additions reuse the winning identity.
      const retry = await admin.rpc('find_auth_user_by_email', { p_email: email });
      if (retry.error || !retry.data) throw error;
      userId = retry.data as string;
    } else { userId = data.user.id; created = true; }
  }
  const { data: membership, error: membershipError } = await admin.rpc('admin_upsert_company_membership', {
    p_actor_user_id: input.actorUserId, p_company_id: input.companyId, p_user_id: userId,
    p_role: input.role, p_permissions: input.permissions ?? null, p_job_role_id: input.jobRoleId ?? null,
    p_sector: input.sector ?? null, p_if_not_exists: !created,
  });
  if (membershipError) {
    // Identidade criada agora e recusada pelo banco (ex.: a unidade ganhou gestor
    // entre a reserva e o vínculo) ficaria órfã, com senha conhecida por quem a
    // criou. Só compensa depois de conferir que nenhum vínculo foi gravado — uma
    // resposta perdida de um vínculo que deu certo não pode virar exclusão.
    if (created) await discardOrphanIdentity(admin, userId!);
    throw membershipError;
  }
  return { userId, email, identityCreated: created, membership };
}

async function discardOrphanIdentity(admin: SupabaseClient, userId: string) {
  const { count, error } = await admin.from('company_memberships').select('id',{ count:'exact',head:true }).eq('user_id',userId);
  if (error || count !== 0) {
    console.error('[company-users] identidade mantida após vínculo recusado', { userId, count, error });
    return;
  }
  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) console.error('[company-users] falha ao descartar identidade órfã', { userId, deleteError });
}

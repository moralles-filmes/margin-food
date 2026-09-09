import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function normalizeIdentityEmail(value: unknown): string {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) throw new Error('E-mail inválido.');
  return email;
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
    if (!input.sendInvite && (!input.password || input.password.length < 12)) throw new Error('Nova identidade exige senha com no mínimo 12 caracteres.');
    if (input.sendInvite) {
      const { error } = await admin.rpc('reserve_company_invitation', { p_actor_user_id:input.actorUserId,p_company_id:input.companyId,p_email:email });
      if (error) throw error;
    }
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
  if (membershipError) throw membershipError;
  return { userId, email, identityCreated: created, membership };
}

import { supabase } from '@/integrations/supabase/client';

const PLACEHOLDER_COMPANY_ID = '00000000-0000-0000-0000-000000000001';

export class TenantError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TenantError';
  }
}

/**
 * Resolves the current user's company_id from profiles table.
 * Throws TenantError if user is not authenticated, has no profile,
 * or company_id is NULL / placeholder.
 */
export async function resolveCompanyIdOrThrow(): Promise<string> {
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    throw new TenantError('Usuário não autenticado. Faça login novamente.');
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('company_id')
    .eq('id', user.id)
    .single();

  if (profileError || !profile) {
    throw new TenantError('Perfil não encontrado. Faça logout e login novamente.');
  }

  const companyId = profile.company_id;

  if (!companyId || companyId === PLACEHOLDER_COMPANY_ID) {
    throw new TenantError(
      'Sua empresa não está vinculada à sua conta. Faça logout/login ou contate o administrador.'
    );
  }

  return companyId;
}

export function isPlaceholderCompanyId(id: string | null | undefined): boolean {
  return !id || id === PLACEHOLDER_COMPANY_ID;
}

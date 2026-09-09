import type { supabase as baseClient } from '@/integrations/supabase/client';
export class TenantError extends Error {
  constructor(message: string) { super(message); this.name = 'TenantError'; }
}
/** Resolve the immutable request scope with backend membership validation. */
export async function resolveCompanyIdOrThrow(client: typeof baseClient): Promise<string> {
  const { data, error } = await client.rpc('assert_tenant');
  if (error || !data) throw new TenantError('Não foi possível validar seu acesso à unidade. Atualize seus acessos.');
  return data;
}

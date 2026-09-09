import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/integrations/supabase/types';
import type { CompanyProfile } from '@/contexts/CompanyScopeContext';
import type { AccessibleCompany } from './companySelection';

export type CompanyAccessMode = 'memberships' | 'single-company';
type Client = SupabaseClient<Database>;
const PLACEHOLDER_COMPANY = '00000000-0000-0000-0000-000000000001';

export function parseCompanyProfile(value: unknown): CompanyProfile {
  const v = value as CompanyProfile | null;
  if (!v || typeof v.company_id !== 'string' || typeof v.company_name !== 'string'
    || !Array.isArray(v.roles) || !v.roles.every(role => typeof role === 'string')
    || !Array.isArray(v.permissions) || !v.permissions.every(key => typeof key === 'string')) {
    throw new Error('Contexto da unidade inválido.');
  }
  return v;
}

async function readOriginalProfile(client: Client, userId: string, signal: AbortSignal) {
  const { data, error } = await client.from('profiles')
    .select('id, nome, email, avatar_url, sector, job_role_id, company_id, companies(id, nome, ativo)')
    .eq('id', userId).abortSignal(signal).maybeSingle();
  if (error) throw error;
  if (!data || data.id !== userId || !data.companies?.ativo
    || data.company_id === PLACEHOLDER_COMPANY || data.companies.id !== data.company_id) return null;
  return data;
}

export async function loadAccessibleCompanies(client: Client, userId: string, signal: AbortSignal): Promise<{
  companies: AccessibleCompany[]; mode: CompanyAccessMode;
}> {
  const { data, error } = await client.rpc('list_my_companies').abortSignal(signal);
  if (!error) return { companies: data ?? [], mode: 'memberships' };
  // Compatibilidade somente com schema anterior à migração. Uma falha de
  // permissão, rede ou publicação parcial nunca pode restaurar acesso legado.
  if (error.code !== 'PGRST202' || !error.message.includes('public.list_my_companies')) throw error;
  const { error: schemaError } = await client.from('user_roles').select('company_id').limit(0).abortSignal(signal);
  if (schemaError?.code !== '42703' || !schemaError.message.includes('user_roles.company_id')) throw error;
  const original = await readOriginalProfile(client, userId, signal);
  return {
    companies: original ? [{ id: original.company_id, nome: original.companies.nome }] : [],
    mode: 'single-company',
  };
}

export async function loadCompanyProfile(
  client: Client, userId: string, companyId: string, mode: CompanyAccessMode, signal: AbortSignal,
): Promise<CompanyProfile> {
  if (mode === 'memberships') {
    const { data, error } = await client.rpc('get_my_company_context').abortSignal(signal);
    if (error) throw error;
    const profile = parseCompanyProfile(data);
    if (profile.company_id !== companyId) throw new Error('COMPANY_SCOPE_MISMATCH');
    return profile;
  }
  const original = await readOriginalProfile(client, userId, signal);
  if (!original || original.company_id !== companyId) throw new Error('COMPANY_ACCESS_DENIED');
  const [tenant, roles, permissions] = await Promise.all([
    client.rpc('assert_tenant').abortSignal(signal),
    client.from('user_roles').select('role').eq('user_id', userId).abortSignal(signal),
    client.rpc('get_effective_permissions', { _user_id: userId }).abortSignal(signal),
  ]);
  for (const result of [tenant, roles, permissions]) if (result.error) throw result.error;
  if (tenant.data !== companyId) throw new Error('COMPANY_SCOPE_MISMATCH');
  return parseCompanyProfile({ ...original, company_name: original.companies.nome,
    roles: (roles.data ?? []).map(role => role.role), permissions: permissions.data ?? [] });
}

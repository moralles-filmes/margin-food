import type { SupabaseClient } from 'npm:@supabase/supabase-js@2';

export function companyHeaders(req: Request): Record<string, string> {
  const companyId = req.headers.get('x-company-id');
  return companyId === null ? {} : { 'x-company-id': companyId };
}

/** Use the caller's JWT client, never service_role, to resolve request scope. */
export async function requestCompanyProfile(userClient: SupabaseClient) {
  const { data, error } = await userClient.rpc('assert_tenant');
  return { data: data && !error ? { company_id: data as string } : null, error };
}

export async function requireRequestCompany(userClient: SupabaseClient): Promise<string> {
  const { data, error } = await requestCompanyProfile(userClient);
  if (error || !data) throw new Error('403: COMPANY_ACCESS_DENIED');
  return data.company_id;
}

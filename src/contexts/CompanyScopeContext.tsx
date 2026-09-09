import { createContext, useContext } from 'react';
import { supabase } from '@/integrations/supabase/client';

export interface CompanyProfile {
  company_id: string;
  company_name: string;
  nome: string;
  email: string;
  avatar_url: string | null;
  sector: string | null;
  job_role_id: string | null;
  roles: string[];
  permissions: string[];
}

export interface CompanyScope {
  companyId: string;
  client: typeof supabase;
  profile: CompanyProfile;
}

export const CompanyScopeContext = createContext<CompanyScope | null>(null);
export function useCompanyScope() { return useContext(CompanyScopeContext); }
export function useSupabase() {
  const scope = useCompanyScope();
  // Public login/recovery routes mount before an operational scope exists.
  // GlobalCompanyBoundary blocks authenticated modules until scope validation.
  return scope?.client ?? supabase;
}

import { useAuth } from '@/contexts/AuthContext';
export function useCompanyId() {
  const { profile, permissionState, refreshRoles, permissionError } = useAuth();
  return { companyId: profile?.company_id ?? null, loading: permissionState === 'LOADING', error: permissionError, refresh: refreshRoles };
}

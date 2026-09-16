import { useCallback, useLayoutEffect, useRef } from 'react';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { isCompanyClientActive } from '@/lib/companyClientLifetime';

/** Verifica o escopo capturado, inclusive depois de await/cleanup. Não desfaz writes. */
export function useScopeActivity() {
  const client = useSupabase();
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, [client]);
  return useCallback(() => mounted.current && isCompanyClientActive(client), [client]);
}

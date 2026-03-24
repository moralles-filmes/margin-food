import { useState, useEffect, useCallback } from 'react';
import { resolveCompanyIdOrThrow, TenantError } from '@/lib/tenant';

export function useCompanyId() {
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const resolve = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const id = await resolveCompanyIdOrThrow();
      setCompanyId(id);
    } catch (err: any) {
      setCompanyId(null);
      setError(err instanceof TenantError ? err.message : 'Erro ao resolver empresa.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { resolve(); }, [resolve]);

  return { companyId, loading, error, refresh: resolve };
}

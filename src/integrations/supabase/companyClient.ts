import { createClient } from '@supabase/supabase-js';
import { supabase } from './client';
import type { Database } from './types';
import type { CompanyAccessMode } from '@/lib/companyAccess';
import { supabaseFetch } from './fetch';
import { registerClientScope } from '@/lib/companyClientLifetime';

export const COMPANY_ACCESS_REVOKED_EVENT = 'company:access-revoked';

/** A fixed scope for the whole operation, including delayed follow-up requests. */
export function createCompanyClient(companyId: string, userId: string, mode: CompanyAccessMode = 'memberships') {
  const lifetime = new AbortController();
  const client = createClient<Database>(
    import.meta.env.VITE_SUPABASE_URL,
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
    {
      accessToken: async () => {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user.id !== userId) throw new Error('AUTH_IDENTITY_CHANGED');
        return data.session.access_token;
      },
      global: {
        // Edge Functions anteriores à migração ainda não aceitam este header no CORS.
        headers: mode === 'memberships' ? { 'x-company-id': companyId } : {},
        fetch: async (input, init) => {
          if (lifetime.signal.aborted) throw new DOMException('Unidade encerrada', 'AbortError');
          const signal = init?.signal
            ? AbortSignal.any([lifetime.signal, init.signal])
            : lifetime.signal;
          const response = await supabaseFetch(input, { ...init, signal });
          lifetime.signal.throwIfAborted();
          if (!response.ok && (response.status === 401 || response.status === 403)) {
            const body = await response.clone().text();
            lifetime.signal.throwIfAborted();
            if (body.includes('COMPANY_ACCESS_DENIED')) {
              window.dispatchEvent(new CustomEvent(COMPANY_ACCESS_REVOKED_EVENT, { detail: { companyId } }));
            }
          }
          return response;
        },
      },
    },
  );
  // One identity client owns refresh/session storage. Scoped clients never create
  // another GoTrue instance; legacy auth.getUser consumers share the same session.
  registerClientScope(client, { companyId, userId, mode, signal: lifetime.signal });
  client.auth = supabase.auth;
  const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
    if (session?.user.id !== userId) lifetime.abort();
    else void client.realtime.setAuth(session.access_token);
  });
  return {
    client,
    dispose() {
      lifetime.abort();
      subscription.unsubscribe();
      void client.removeAllChannels();
    },
  };
}

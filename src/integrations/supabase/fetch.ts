/** Encaminha Edge Functions pelo Vite local, preservando JWT, corpo e streaming. */
export const supabaseFetch: typeof fetch = (input, init) => {
  if (import.meta.env.DEV && typeof window !== 'undefined') {
    const url = new URL(input instanceof Request ? input.url : String(input));
    const backend = new URL(import.meta.env.VITE_SUPABASE_URL);
    if (url.origin === backend.origin && url.pathname.startsWith('/functions/v1/')) {
      const proxyUrl = new URL(`/__supabase${url.pathname}${url.search}`, window.location.origin);
      if (input instanceof Request) {
        // Copiar explicitamente: Request não é um RequestInit em todos os runtimes.
        const options: RequestInit & { duplex: 'half' } = {
          method: input.method, headers: input.headers, body: input.body, signal: input.signal,
          cache: input.cache, credentials: input.credentials, integrity: input.integrity,
          keepalive: input.keepalive, mode: input.mode, redirect: input.redirect,
          referrer: input.referrer, referrerPolicy: input.referrerPolicy,
          duplex: 'half', ...init,
        };
        return fetch(new Request(proxyUrl, options));
      }
      return fetch(proxyUrl, init);
    }
  }
  return fetch(input, init);
};

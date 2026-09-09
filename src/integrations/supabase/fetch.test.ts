import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { supabaseFetch } from './fetch';

const backend = 'https://project.example.test';
beforeEach(() => {
  vi.stubEnv('DEV', true);
  vi.stubEnv('VITE_SUPABASE_URL', backend);
});
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe('transporte local das Edge Functions', () => {
  it('preserva sessão, unidade, corpo, cancelamento e streaming pelo proxy', async () => {
    const response = new Response('data: conteúdo\n\n', { headers: { 'Content-Type': 'text/event-stream' } });
    const fetcher = vi.fn().mockResolvedValue(response);
    vi.stubGlobal('fetch', fetcher);
    const options = { method: 'POST', body: JSON.stringify({ messages: [] }), signal: new AbortController().signal,
      headers: { Authorization: 'Bearer local-test-session', apikey: 'test-publishable-key', 'x-company-id': 'A' } };
    const result = await supabaseFetch(`${backend}/functions/v1/ai-chat?region=sa-east-1`, options);
    expect(String(fetcher.mock.calls[0][0])).toBe(`${window.location.origin}/__supabase/functions/v1/ai-chat?region=sa-east-1`);
    expect(fetcher.mock.calls[0][1]).toBe(options);
    expect(result).toBe(response);
    expect(result.bodyUsed).toBe(false);
    expect(await result.text()).toBe('data: conteúdo\n\n');
  });

  it('preserva também requisições Request e seu sinal de cancelamento', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const controller = new AbortController();
    const original = new Request(`${backend}/functions/v1/admin-users`, {
      method: 'POST', body: '{"action":"list"}', signal: controller.signal,
      headers: { Authorization: 'Bearer local-test-session' },
    });
    await supabaseFetch(original);
    const forwarded = fetcher.mock.calls[0][0] as Request;
    expect(forwarded.url).toBe(`${window.location.origin}/__supabase/functions/v1/admin-users`);
    expect(forwarded.method).toBe('POST');
    expect(forwarded.headers.get('Authorization')).toBe('Bearer local-test-session');
    expect(await forwarded.text()).toBe('{"action":"list"}');
    controller.abort();
    expect(forwarded.signal.aborted).toBe(true);
  });

  it.each(['/rest/v1/profiles', '/auth/v1/token', '/storage/v1/object/rh-docs/file'])('mantém %s direto no Supabase', async path => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const url = `${backend}${path}`;
    await supabaseFetch(url);
    expect(fetcher).toHaveBeenCalledWith(url, undefined);
  });

  it('não encaminha destinos diferentes do projeto configurado', async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const url = 'https://another.example.test/functions/v1/admin-users';
    await supabaseFetch(url);
    expect(fetcher).toHaveBeenCalledWith(url, undefined);
  });

  it('mantém chamadas diretas em builds de produção', async () => {
    vi.stubEnv('DEV', false);
    const fetcher = vi.fn().mockResolvedValue(new Response('{}'));
    vi.stubGlobal('fetch', fetcher);
    const url = `${backend}/functions/v1/admin-users`;
    await supabaseFetch(url);
    expect(fetcher).toHaveBeenCalledWith(url, undefined);
  });
});

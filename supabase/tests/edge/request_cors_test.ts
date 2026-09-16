import { withRequestCors } from '../../functions/_shared/request-cors.ts';

Deno.test('origens concorrentes e stream preservam CORS da própria requisição', async () => {
  Deno.env.set('ALLOWED_ORIGINS', 'https://a.example.test,https://b.example.test');
  let release!: () => void;
  const wait = new Promise<void>(resolve => { release = resolve; });
  const handler = withRequestCors(async req => {
    if (req.headers.get('origin')?.includes('a.')) await wait;
    return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode('fixture')); c.close(); } }),
      { status: 202, headers: { 'Content-Type': 'text/event-stream', 'Access-Control-Allow-Origin': 'stale' } });
  });
  const a = handler(new Request('http://localhost', { headers: { origin: 'https://a.example.test' } }));
  const b = await handler(new Request('http://localhost', { headers: { origin: 'https://b.example.test' } }));
  release(); const ar = await a;
  for (const [res, origin] of [[ar,'a'],[b,'b']] as const) {
    if (res.headers.get('Access-Control-Allow-Origin') !== `https://${origin}.example.test` || res.status !== 202 || await res.text() !== 'fixture') throw Error('CORS/stream alterado');
  }
  const denied = await handler(new Request('http://localhost', { headers: { origin: 'https://outside.example.test' } }));
  if (denied.headers.get('Access-Control-Allow-Origin') !== 'null') throw Error('origem não permitida');
  await denied.text();
  const options = await handler(new Request('http://localhost', { method: 'OPTIONS', headers: { origin: 'https://a.example.test' } }));
  if (!options.headers.get('Access-Control-Allow-Headers')?.includes('x-company-id')) throw Error('header de escopo ausente');
});

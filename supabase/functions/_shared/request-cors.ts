import { getCorsHeaders } from './cors.ts';

/** Finaliza inclusive respostas de helpers/streams com o CORS desta requisição. */
export function withRequestCors(handler: (req: Request) => Response | Promise<Response>) {
  return async (req: Request): Promise<Response> => {
    const cors = getCorsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { headers: cors });
    const response = await handler(req);
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(cors)) headers.set(name, value);
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  };
}

/**
 * Mensagem de erro de uma Edge Function para mostrar ao usuário.
 *
 * 4xx trazem `message` (ou `error`, nas funções de administração) escrita para a
 * tela (validação, permissão, conflito de reenvio). 5xx e falha de rede não dizem
 * nada útil a quem está na tela — o texto técnico vai para o console, e a tela
 * mostra `fallback`.
 */
export async function mensagemErroEdge(error: unknown, fallback: string): Promise<string> {
  const context = (error as { context?: unknown } | null)?.context as
    | { status?: unknown; clone?: () => { json: () => Promise<unknown> } }
    | undefined;
  const status = typeof context?.status === 'number' ? context.status : null;
  if (status !== null && status >= 400 && status < 500 && typeof context?.clone === 'function') {
    try {
      const body = await context.clone().json() as { message?: unknown; error?: unknown } | null;
      if (typeof body?.message === 'string' && body.message.trim()) return body.message;
      // `error` às vezes é só um código ("UNAUTHORIZED"): esse não é texto de tela.
      if (typeof body?.error === 'string' && body.error.trim() && !/^[A-Z0-9_]+$/.test(body.error.trim())) return body.error;
    } catch { /* corpo não é JSON */ }
  }
  return fallback;
}

/**
 * Helpers para extrair mensagens úteis de erros do supabase-js.
 *
 * PostgrestError carrega { message, code, details, hint } — o `.message`
 * sozinho costuma não ser informativo (ex: "" em RLS reject). Sempre
 * prefira este helper a `err.message` cru.
 */

export interface PostgrestLikeError {
  message?: string;
  code?: string;
  details?: string | null;
  hint?: string | null;
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null;
}

/**
 * Compõe uma mensagem útil a partir de um erro do Supabase (PostgrestError),
 * Edge Function error, Error padrão, ou string.
 *
 * Combina message + details + hint + code numa única string legível.
 * Se nada for extraível, retorna `fallback`.
 */
export function extractSupabaseErrorMessage(err: unknown, fallback: string): string {
  if (!err) return fallback;
  if (typeof err === 'string') return err || fallback;

  if (isObject(err)) {
    const e = err as PostgrestLikeError;
    const parts: string[] = [];
    if (e.message) parts.push(String(e.message));
    if (e.details) parts.push(String(e.details));
    if (e.hint) parts.push(`(dica: ${e.hint})`);
    if (e.code) parts.push(`[${e.code}]`);
    if (parts.length > 0) return parts.join(' — ');
  }

  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * Detecta se um erro é provavelmente um PostgrestError do supabase-js.
 * Útil para escolher entre tratamento específico e genérico.
 */
export function isPostgrestError(err: unknown): err is PostgrestLikeError {
  return isObject(err) && ('code' in err || 'details' in err || 'hint' in err);
}

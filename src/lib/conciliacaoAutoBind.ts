import { extractSupabaseErrorMessage } from '@/lib/supabaseErrors';

interface RpcResult {
  error: unknown | null;
}

export interface OptionalAutoBindResult {
  ok: boolean;
  diagnostic?: string;
  error?: unknown;
}

/**
 * Executa o reconhecimento automático de contrapartidas como enriquecimento
 * best-effort. Essa etapa nunca pode impedir o carregamento do extrato: se a RPC
 * estiver fora do schema cache, sem rede ou temporariamente indisponível, o fluxo
 * principal continua e o usuário pode revisar a transferência manualmente.
 */
export async function runOptionalAutoBind(
  execute: () => PromiseLike<RpcResult>,
): Promise<OptionalAutoBindResult> {
  try {
    const { error } = await execute();
    if (!error) return { ok: true };

    return {
      ok: false,
      error,
      diagnostic: extractSupabaseErrorMessage(
        error,
        'Reconhecimento automático de transferências indisponível',
      ),
    };
  } catch (error) {
    return {
      ok: false,
      error,
      diagnostic: extractSupabaseErrorMessage(
        error,
        'Reconhecimento automático de transferências indisponível',
      ),
    };
  }
}

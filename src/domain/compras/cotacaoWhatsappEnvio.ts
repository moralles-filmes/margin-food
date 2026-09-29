/**
 * Resultado do envio de WhatsApp da cotação (Edge `send-whatsapp-zapi`).
 *
 * A Z-API não aceita id de deduplicação: quem impede a mensagem duplicada é a
 * tentativa registrada com a chave da operação ANTES do envio. Por isso a tela
 * precisa distinguir quatro desfechos — e só um deles convida a reenviar.
 */

/** Corpo devolvido pela Edge (200). */
export interface RespostaEnvioWhatsapp {
  success?: boolean;
  /** SENT | ERROR | UNKNOWN | PENDING */
  status?: string;
  error?: string;
  message?: string;
  idempotent?: boolean;
  aviso?: string | null;
  log_id?: string | null;
}

export type ResultadoEnvioWhatsapp =
  /** Saiu (agora ou numa tentativa anterior com a mesma chave). */
  | { tipo: 'enviado'; repetido: boolean; aviso: string | null }
  /** A Z-API recusou: nada saiu, repetir é seguro. */
  | { tipo: 'recusado'; mensagem: string }
  /** Pode ter saído (timeout, queda, envio ainda em andamento): conferir antes. */
  | { tipo: 'incerto'; mensagem: string }
  /** A resposta do servidor não chegou: repetir é seguro, a chave evita duplicar. */
  | { tipo: 'sem_resposta' }
  /** A chave já pertence a outro envio (não acontece com a chave derivada). */
  | { tipo: 'reutilizado' };

export const MENSAGEM_ENVIO_INCERTO =
  'Não foi possível confirmar se a mensagem saiu. Ela pode ter sido enviada: '
  + 'confira a conversa com o fornecedor no WhatsApp antes de enviar de novo.';

export function interpretarEnvioWhatsapp(res: RespostaEnvioWhatsapp | null | undefined): ResultadoEnvioWhatsapp {
  if (!res) return { tipo: 'sem_resposta' };
  if (res.success) {
    return { tipo: 'enviado', repetido: res.idempotent === true, aviso: res.aviso ?? null };
  }
  if (res.error === 'REQUEST_ID_REUTILIZADO') return { tipo: 'reutilizado' };
  if (res.status === 'UNKNOWN' || res.status === 'PENDING') {
    return { tipo: 'incerto', mensagem: res.message || MENSAGEM_ENVIO_INCERTO };
  }
  return { tipo: 'recusado', mensagem: res.message || 'Falha no envio' };
}

/**
 * Erro lançado pelo `functions.invoke` (sem corpo 200). 4xx é recusa deliberada
 * da função (permissão, dados, cotação inexistente) — nada saiu. Sem status
 * (rede) ou 5xx: não dá para saber, mas repetir com a mesma chave é seguro.
 */
export function interpretarFalhaEnvioWhatsapp(err: unknown): ResultadoEnvioWhatsapp {
  const e = err as { message?: string; context?: { status?: number } } | null;
  const status = e?.context?.status;
  if (typeof status === 'number' && status >= 400 && status < 500) {
    const permissao = status === 403 || (e?.message ?? '').includes('PERMISSION');
    return {
      tipo: 'recusado',
      mensagem: permissao ? 'Sem permissão para enviar mensagens' : 'Não foi possível enviar a mensagem',
    };
  }
  return { tipo: 'sem_resposta' };
}

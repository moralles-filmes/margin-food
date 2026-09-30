/**
 * ─── Central de IA: envio idempotente de mensagem (Edge `ai-chat`) ───
 *
 * A Edge reserva a linha de `ai_logs` com a chave ANTES de chamar o modelo
 * (pago). A chave identifica a conversa enviada — agente + mensagens —, então o
 * duplo envio da mesma pergunta cai na mesma reserva e o modelo é chamado uma
 * vez só. Semente, derivação e o porquê: `@/lib/chaveOperacao`.
 */

import { chaveOperacao } from '@/lib/chaveOperacao';

export interface MensagemChat {
  role: 'user' | 'assistant';
  content: string;
}

export function chaveMensagemIa(
  semente: string,
  dados: { agente: string; mensagens: MensagemChat[] },
): Promise<string> {
  return chaveOperacao(semente, {
    op: 'ai_chat',
    agente: dados.agente,
    mensagens: dados.mensagens.map(m => [m.role, m.content]),
  });
}

/** Corpo JSON devolvido pela Edge (o caminho normal é o stream SSE). */
export interface RespostaJsonIa {
  idempotent?: boolean;
  resposta_ia?: string;
  no_data?: boolean;
  message?: string;
  error?: string | { code?: string; message?: string };
}

export type ResultadoJsonIa =
  /** Texto para mostrar como resposta do assistente. */
  | { tipo: 'resposta'; texto: string; repetida: boolean }
  /** A mesma pergunta ainda está sendo respondida por outra requisição. */
  | { tipo: 'em_andamento'; mensagem: string }
  | { tipo: 'erro'; mensagem: string };

export function interpretarRespostaJsonIa(json: RespostaJsonIa | null, status: number): ResultadoJsonIa {
  if (json?.no_data) {
    return { tipo: 'resposta', texto: json.message ?? '', repetida: false };
  }
  if (json?.idempotent && typeof json.resposta_ia === 'string') {
    return { tipo: 'resposta', texto: json.resposta_ia, repetida: true };
  }
  const erro = json?.error;
  const codigo = typeof erro === 'object' && erro ? erro.code : undefined;
  const mensagem = typeof erro === 'string' ? erro : erro?.message;
  if (codigo === 'IN_PROGRESS' || status === 409) {
    return { tipo: 'em_andamento', mensagem: mensagem ?? 'Esta pergunta ainda está sendo respondida.' };
  }
  return { tipo: 'erro', mensagem: mensagem ?? `Erro ${status}` };
}

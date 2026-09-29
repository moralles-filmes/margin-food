/**
 * Chave de idempotência DERIVADA da operação — mesmo padrão de `chaveRequisicao`
 * (`src/domain/estoque/operacional.ts`), para envios cujo conteúdo é um objeto.
 *
 * A chave é `hash(semente + conteúdo)`:
 * - repetir o MESMO envio (duplo clique, retry depois de a resposta se perder)
 *   gera a mesma chave, e o servidor devolve o registro original;
 * - mudar qualquer campo gera chave nova sozinho, então um reenvio nunca é
 *   confundido com a operação anterior;
 * - a `semente` só troca quando começa uma operação nova (depois do sucesso,
 *   ou quando o usuário confirma explicitamente que quer repetir).
 *
 * Nunca guarde a chave em estado nem gere `crypto.randomUUID()` por chamada: o
 * primeiro prende a chave de um envio que falhou no próximo, o segundo faz o
 * retry virar outro registro.
 */

/** Semente de uma operação nova. */
export function novaSemente(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `op-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/**
 * JSON com as chaves dos objetos em ordem alfabética: o mesmo conteúdo produz
 * sempre o mesmo texto, independente da ordem em que o objeto foi montado.
 * Arrays mantêm a ordem (ela faz parte do conteúdo); `undefined` some, como
 * no `JSON.stringify`.
 */
export function jsonCanonico(valor: unknown): string {
  if (valor === null || typeof valor !== 'object') {
    return JSON.stringify(valor) ?? 'null';
  }
  if (Array.isArray(valor)) {
    return `[${valor.map(v => (v === undefined ? 'null' : jsonCanonico(v))).join(',')}]`;
  }
  const obj = valor as Record<string, unknown>;
  const pares = Object.keys(obj)
    .filter(k => obj[k] !== undefined)
    .sort()
    .map(k => `${JSON.stringify(k)}:${jsonCanonico(obj[k])}`);
  return `{${pares.join(',')}}`;
}

async function sha256(texto: string): Promise<Uint8Array> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(texto));
  return new Uint8Array(digest);
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
}

/** Chave derivada em texto (SHA-256, 64 caracteres hexadecimais). */
export async function chaveOperacao(semente: string, conteudo: unknown): Promise<string> {
  return hex(await sha256(`${semente}|${jsonCanonico(conteudo)}`));
}

/**
 * Chave derivada no formato UUID, para colunas `uuid` (ex.: `purchase_orders`).
 * Usa os 128 primeiros bits do SHA-256 marcados como UUIDv8 (RFC 9562, formato
 * livre) — determinística, ao contrário do v4.
 */
export async function chaveOperacaoUuid(semente: string, conteudo: unknown): Promise<string> {
  const b = (await sha256(`${semente}|${jsonCanonico(conteudo)}`)).slice(0, 16);
  b[6] = (b[6] & 0x0f) | 0x80;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = hex(b);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

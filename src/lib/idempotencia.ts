/**
 * ─── Chave de idempotência de envios ───
 *
 * O padrão de `op_registrar_movimentacao` (ver CLAUDE.md) aplicado aos demais
 * envios: a chave é DERIVADA da operação — semente da tela + resumo do
 * conteúdo —, nunca um `crypto.randomUUID()` por clique nem estado preso.
 *
 *   · Repetir a MESMA operação (retry depois de resposta perdida, duplo clique)
 *     gera a mesma chave: o servidor devolve o registro original em vez de
 *     gravar outro.
 *   · Mudar qualquer coisa do conteúdo gera chave nova sozinho: um envio
 *     diferente nunca é confundido com o anterior.
 *   · A semente só troca quando a tela começa um lançamento novo (formulário
 *     limpo depois do sucesso). Dois lançamentos iguais em sequência continuam
 *     sendo dois registros — que é o que o usuário pediu.
 *
 * O resumo não é criptográfico; existe só para a chave caber no índice. Quem
 * garante que chave igual é a mesma operação é o servidor, que compara o
 * conteúdo gravado e recusa com REQUEST_ID_REUTILIZADO quando diverge.
 */

/** Semente de um lançamento novo. */
export function novaSemente(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `s-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

/** JSON com as chaves de objeto em ordem: o mesmo conteúdo sempre vira o mesmo texto. */
function serializarEstavel(valor: unknown): string {
  if (valor === null || valor === undefined || typeof valor !== 'object') {
    return JSON.stringify(valor ?? null);
  }
  if (Array.isArray(valor)) return `[${valor.map(serializarEstavel).join(',')}]`;
  const objeto = valor as Record<string, unknown>;
  const campos = Object.keys(objeto)
    .filter(chave => objeto[chave] !== undefined)
    .sort()
    .map(chave => `${JSON.stringify(chave)}:${serializarEstavel(objeto[chave])}`);
  return `{${campos.join(',')}}`;
}

/** cyrb53: resumo de 53 bits, determinístico e síncrono (dá para usar em useMemo). */
function resumo53(texto: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < texto.length; i++) {
    const c = texto.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 2654435761);
    h2 = Math.imul(h2 ^ c, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

/**
 * `<semente>:<resumo do conteúdo>`. Objetos são comparados sem depender da
 * ordem das chaves; arrays, na ordem em que vierem — quem chama ordena quando a
 * ordem não faz parte da operação.
 */
export function chaveIdempotente(semente: string, conteudo: unknown): string {
  return `${semente}:${resumo53(serializarEstavel(conteudo))}`;
}

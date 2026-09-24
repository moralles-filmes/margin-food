/**
 * ─── Código de barras — regras puras ───
 *
 * O código é STRING em todo o caminho, do campo ao Postgres. Convertê-lo para
 * número em qualquer ponto perde o zero à esquerda (`0007894900011517` viraria
 * `7894900011517`, que é outro produto ou nenhum) e, em GTIN-14, estoura a
 * precisão exata de `Number`.
 */

/** Mesma faixa aceita pelo CHECK `produtos_barcode_formato` no banco. */
const FORMATO_VALIDO = /^[0-9A-Za-z._-]{4,64}$/;

/**
 * Normaliza o que o leitor entregou.
 *
 * Leitores HID variam: alguns mandam espaço antes do Enter, outros injetam
 * caracteres de controle (\t, \r) conforme o sufixo configurado no aparelho.
 * Nada disso pode virar um código diferente — senão o mesmo produto físico
 * falha na leitura ou, pior, é cadastrado duas vezes.
 */
export function normalizarBarcode(raw: string): string {
  return raw
    // eslint-disable-next-line no-control-regex -- sufixo de leitor HID, não é busca de texto
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, '')
    .trim();
}

export type BarcodeInvalido = 'vazio' | 'curto' | 'longo' | 'caractere';

export interface ValidacaoBarcode {
  valido: boolean;
  codigo: string;
  motivo?: BarcodeInvalido;
}

export function validarBarcode(raw: string): ValidacaoBarcode {
  const codigo = normalizarBarcode(raw);

  if (!codigo) return { valido: false, codigo, motivo: 'vazio' };
  if (codigo.length < 4) return { valido: false, codigo, motivo: 'curto' };
  if (codigo.length > 64) return { valido: false, codigo, motivo: 'longo' };
  if (!FORMATO_VALIDO.test(codigo)) return { valido: false, codigo, motivo: 'caractere' };

  return { valido: true, codigo };
}

export function mensagemBarcodeInvalido(motivo: BarcodeInvalido): string {
  switch (motivo) {
    case 'vazio':      return 'Nenhum código lido. Tente escanear novamente.';
    case 'curto':      return 'Código muito curto. Tente escanear novamente.';
    case 'longo':      return 'Código muito longo para ser um código de barras.';
    case 'caractere':  return 'Código com caracteres inválidos. Tente escanear novamente.';
  }
}

/**
 * Duas leituras do mesmo código em sequência imediata são o mesmo disparo.
 *
 * Leitor HID em superfície reflexiva dispara duas vezes; sem esta janela, um
 * único bipe vira duas movimentações. 1200 ms cobre o repique sem atrapalhar
 * quem realmente precisa lançar o mesmo item duas vezes seguidas — nesse caso a
 * segunda leitura é deliberada e demora mais que isso.
 */
export const JANELA_LEITURA_DUPLICADA_MS = 1200;

export function ehLeituraDuplicada(
  codigo: string,
  ultimoCodigo: string | null,
  ultimoEm: number | null,
  agora: number,
): boolean {
  if (!ultimoCodigo || ultimoEm === null) return false;
  if (codigo !== ultimoCodigo) return false;
  return agora - ultimoEm < JANELA_LEITURA_DUPLICADA_MS;
}

/**
 * GTIN completo (EAN-8, UPC-A, EAN-13, GTIN-14) com dígito verificador válido.
 * Mod 10: da direita para a esquerda, sem o verificador, pesos 3 e 1 alternados.
 */
export function gtinValido(codigo: string): boolean {
  if (!/^\d+$/.test(codigo) || ![8, 12, 13, 14].includes(codigo.length)) return false;
  const digitos = codigo.split('').map(Number);
  const verificador = digitos.pop()!;
  const soma = digitos.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (soma % 10)) % 10 === verificador;
}

/**
 * ─── Busca automática ao digitar ───
 *
 * Teclado numérico de celular/tablet não tem Enter: quando o texto digitado é
 * um código de barras padrão (GTIN válido) cadastrado, a tela busca sozinha
 * depois de uma pausa curta. Se ele também for o começo de outro cadastrado,
 * a pessoa pode ainda estar digitando — a pausa é maior.
 *
 * Código interno/curto não dispara sozinho mesmo cadastrado: "7891" pode ser
 * só o começo do EAN que a pessoa está digitando, e a busca abriria o produto
 * errado com os dígitos seguintes caindo no campo de quantidade. Um prefixo
 * quase nunca fecha um GTIN com verificador válido. Código não cadastrado
 * também não dispara: o botão Buscar mostra o aviso.
 */
export const ESPERA_BUSCA_AUTOMATICA_MS = 300;
export const ESPERA_BUSCA_AUTOMATICA_PREFIXO_MS = 900;

export type DecisaoBuscaAutomatica = 'agora' | 'aguardar' | 'nao';

export function decidirBuscaAutomatica(digitado: string, codigos: ReadonlySet<string>): DecisaoBuscaAutomatica {
  const codigo = normalizarBarcode(digitado);
  if (!codigo || !codigos.has(codigo) || !gtinValido(codigo)) return 'nao';
  for (const outro of codigos) {
    if (outro.length > codigo.length && outro.startsWith(codigo)) return 'aguardar';
  }
  return 'agora';
}

/**
 * ─── Lista de códigos de um produto ───
 *
 * Um produto tem N códigos porque o mesmo item de estoque chega em marcas
 * diferentes, cada uma com seu EAN. O `rotulo` diz qual embalagem é qual — sem
 * ele, um produto com quatro códigos não tem como ser mantido depois.
 */

export interface CodigoBarrasProduto {
  /** id da linha no banco. Ausente enquanto o código só existe no formulário. */
  id?: string;
  codigo: string;
  rotulo: string;
}

/** Rótulo é etiqueta curta ("União"), não descrição. */
export const ROTULO_MAX = 40;

export type AdicaoCodigo =
  | { ok: true; lista: CodigoBarrasProduto[] }
  | { ok: false; erro: string };

/**
 * Acrescenta um código à lista do formulário.
 *
 * Recusa duplicata dentro do próprio produto antes de ir ao banco: sem isso o
 * INSERT quebraria no índice único e a mensagem falaria de "outro produto",
 * quando na verdade o código já está ali na tela.
 */
export function adicionarCodigo(
  lista: CodigoBarrasProduto[],
  raw: string,
  rotulo: string,
): AdicaoCodigo {
  const { valido, codigo, motivo } = validarBarcode(raw);
  if (!valido) return { ok: false, erro: mensagemBarcodeInvalido(motivo!) };

  if (lista.some(c => c.codigo === codigo)) {
    return { ok: false, erro: 'Este código já está na lista deste produto.' };
  }

  return {
    ok: true,
    lista: [...lista, { codigo, rotulo: rotulo.trim().slice(0, ROTULO_MAX) }],
  };
}

export interface DiffCodigos {
  /** Sem `id`: ainda não existem no banco. */
  adicionar: CodigoBarrasProduto[];
  /** Ids das linhas que saíram da lista. */
  remover: string[];
}

/**
 * O que gravar ao salvar o produto.
 *
 * Quem aplica o diff precisa rodar os DELETEs ANTES dos INSERTs: trocar só o
 * rótulo de um código é removê-lo e adicioná-lo de novo, e na ordem inversa o
 * INSERT colidiria com a linha que ainda não foi apagada.
 *
 * A remoção é decidida pelo `id`, nunca pelo código. Pelo código, remover uma
 * linha e readicionar o MESMO número (só para trocar o rótulo) não gerava
 * DELETE nenhum — a linha antiga sobrevivia e o INSERT batia no índice único.
 */
export function diffCodigos(
  original: readonly CodigoBarrasProduto[],
  atual: readonly CodigoBarrasProduto[],
): DiffCodigos {
  const idsAtuais = new Set(atual.map(c => c.id).filter(Boolean));
  return {
    adicionar: atual.filter(c => !c.id),
    remover: original
      .filter(c => c.id && !idsAtuais.has(c.id))
      .map(c => c.id as string),
  };
}

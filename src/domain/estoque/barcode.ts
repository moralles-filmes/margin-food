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

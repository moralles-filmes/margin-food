/**
 * Padroniza maiúsculas/minúsculas de nomes e descrições digitados (pt-BR):
 * cada palavra com inicial maiúscula, conectivos (de, da, e…) em minúsculo no
 * meio do texto, siglas no padrão (PIX, INSS, LTDA e palavra curta sem vogal,
 * como JBS e GM) e unidades logo depois de número (1kg, 350 ml, 2L, 20x30).
 *
 * Só muda caixa e espaços — `normalizeSearchText` do resultado é o mesmo do
 * original —, então buscas e o dedup da conciliação (que comparam sem caixa)
 * não mudam. Aplicar no envio ao banco, nunca na chave de idempotência.
 *
 * Espelhada em SQL para o backfill (`docs/padronizacao-texto/padronizar_texto.sql`);
 * os casos de conferência de lá rodam também em `padronizarTexto.test.ts`.
 */

const LOCALE = 'pt-BR';

const minusculo = (s: string) => s.toLocaleLowerCase(LOCALE);
const maiusculo = (s: string) => s.toLocaleUpperCase(LOCALE);

function porChave(lista: string[]): Map<string, string> {
  return new Map(lista.map(s => [minusculo(s), s]));
}

const SIGLAS = porChave([
  'PIX', 'NF', 'NFe', 'NF-e', 'NFCe', 'NFC-e', 'NFSe', 'NFS-e', 'CT-e', 'MDF-e', 'CNPJ', 'CPF', 'RG', 'CNH', 'CEP',
  'LTDA', 'ME', 'EPP', 'EIRELI', 'MEI', 'S/A', 'TED', 'DOC', 'TEF', 'PDV',
  'INSS', 'FGTS', 'IPTU', 'IPVA', 'ICMS', 'ST', 'DIFAL', 'ISS', 'ISSQN', 'PIS', 'COFINS', 'IRPJ', 'IRRF', 'CSLL',
  'DAS', 'DAE', 'DARF', 'GPS', 'GRU', 'GNRE', 'CLT', 'PJ', 'PF', 'RH', 'TI', 'VR', 'VA', 'VT', 'EPI', 'EPIs',
  'CMV', 'DRE', 'DFC', 'SIF', 'UHT', 'PVC', 'LED', 'USB', 'TV', 'E-mail',
  'SP', 'RJ', 'MG', 'RS', 'SC', 'PR', 'DF', 'BA', 'PE', 'MS', 'MT', 'ES', 'RN', 'PB',
  'PP', 'GG', 'XG', 'XGG', 'II', 'III', 'IV', 'VI', 'VII', 'VIII', 'IX', 'XI', 'XII',
]);

// Só valem logo depois de um número ("5 KG" → "5 kg"); soltas são palavras.
const UNIDADES = porChave([
  'kg', 'kgs', 'g', 'gr', 'grs', 'mg', 'ml', 'L', 'lt', 'lts', 'm', 'cm', 'mm',
  'un', 'und', 'unid', 'cx', 'pct', 'pc', 'pcs',
]);

// Palavra curta só de consoantes é sigla (JBS, GM, CPFL), menos unidade, tratamento
// e abreviação comum. Consoantes explícitas, não \p{L}: "ª"/"º" não contam, e o
// resultado não depende de o banco considerá-los letra ("Drª", "Nº").
const SEM_VOGAL = /^[bcdfghjklmnpqrstvwxzçñ]{2,4}$/;
const SEM_VOGAL_NAO_SIGLA = new Set([
  'mr', 'mrs', 'sr', 'srs', 'dr', 'drs', 'jr', 'mc', 'pç', 'pçs', 'mç', 'mçs', 'dz', 'fd', 'hr', 'hrs',
]);

// Em minúsculo só no meio do texto: "DAS Simples" e "Pagamento DAS" são siglas.
const CONECTIVOS = new Set([
  'a', 'à', 'ao', 'aos', 'as', 'às', 'com', 'da', 'das', 'de', 'do', 'dos', 'e', 'em',
  'na', 'nas', 'no', 'nos', 'o', 'os', 'ou', 'para', 'pela', 'pelas', 'pelo', 'pelos',
  'por', 'pra', 'pro', 'sem', 'sob',
]);

// Letra solta depois destes é designação, mesmo no meio ("Tipo A Grande"), salvo
// "e" + palavra, que é conjunção ("Tipo e Marca").
const DESIGNADORES = new Set(['tipo', 'classe', 'vitamina', 'série', 'serie', 'bloco', 'modelo', 'letra']);
// Depois destes, só sem palavra em seguida: "Grupo A 2026", mas "Lote a Vencer".
const DESIGNADORES_FRACOS = new Set(['lote', 'plano', 'fase', 'turno', 'categoria', 'grupo', 'nível', 'nivel']);
type Designador = 'forte' | 'fraco' | undefined;

// Pronome depois de hífen fica minúsculo ("Pague-me").
const ENCLITICOS = new Set(['me', 'te', 'se', 'lhe', 'lhes', 'lo', 'la', 'los', 'las', 'nos', 'vos', 'o', 'a', 'os', 'as']);

const INICIO_NAO_ALFANUMERICO = /^[^\p{L}\p{Nd}]*/u;
const FIM_NAO_ALFANUMERICO = /[^\p{L}\p{Nd}]*$/u;
const UNIDADE_COLADA = /^([0-9]+(?:[.,][0-9]+)?)(\p{L}+)$/u;
const DIMENSAO = /^([0-9]+(?:[.,][0-9]+)?(?:[xX][0-9]+(?:[.,][0-9]+)?)+)(\p{L}*)$/u;
const SEPARADOR = /([-/'’.])/;

interface Token {
  pre: string;
  nucleo: string;
  suf: string;
}

function separar(token: string): Token {
  const pre = token.match(INICIO_NAO_ALFANUMERICO)?.[0] ?? '';
  if (pre.length === token.length) return { pre: token, nucleo: '', suf: '' };
  const suf = token.match(FIM_NAO_ALFANUMERICO)?.[0] ?? '';
  return { pre, nucleo: token.slice(pre.length, token.length - suf.length), suf };
}

function capitalizar(s: string): string {
  const [primeiro = '', ...resto] = [...s];
  return maiusculo(primeiro) + minusculo(resto.join(''));
}

function siglaSemVogal(chave: string): string | undefined {
  if (!SEM_VOGAL.test(chave) || UNIDADES.has(chave) || SEM_VOGAL_NAO_SIGLA.has(chave)) return undefined;
  return maiusculo(chave);
}

const ehEnclitico = (segmento: string, separadorAnterior: string) =>
  separadorAnterior === '-' && ENCLITICOS.has(minusculo(segmento));

function formatarSegmento(segmento: string, separadorAnterior: string, segmentoAnterior: string, aposEnclitico: boolean): string {
  if (!segmento) return segmento;
  const chave = minusculo(segmento);
  if (ehEnclitico(segmento, separadorAnterior)) return chave;
  // "D'Água" mantém a maiúscula; "Mcdonald's" não.
  if ((separadorAnterior === "'" || separadorAnterior === '’') && [...segmentoAnterior].length !== 1) return chave;
  // Depois de pronome é palavra, não sigla: "Bem-te-Vi", não o romano VI.
  if (aposEnclitico) return capitalizar(segmento);
  return SIGLAS.get(chave) ?? siglaSemVogal(chave) ?? capitalizar(segmento);
}

function formatarComposto(nucleo: string): string {
  const pedacos = nucleo.split(SEPARADOR); // [segmento, separador, segmento, ...]
  let saida = formatarSegmento(pedacos[0], '', '', false);
  for (let i = 2; i < pedacos.length; i += 2) {
    const aposEnclitico = ehEnclitico(pedacos[i - 2], pedacos[i - 3] ?? '');
    saida += pedacos[i - 1] + formatarSegmento(pedacos[i], pedacos[i - 1], pedacos[i - 2], aposEnclitico);
  }
  return saida;
}

function formatarComNumero(nucleo: string): string {
  const colada = nucleo.match(UNIDADE_COLADA);
  if (colada) {
    const unidade = UNIDADES.get(minusculo(colada[2]));
    return unidade ? colada[1] + unidade : nucleo;
  }
  const dimensao = nucleo.match(DIMENSAO);
  if (dimensao) {
    const sufixo = dimensao[2] ? UNIDADES.get(minusculo(dimensao[2])) ?? dimensao[2] : '';
    return dimensao[1].replace(/X/g, 'x') + sufixo;
  }
  return nucleo;
}

interface Posicao {
  meio: boolean;
  aposNumero: boolean;
  antesNumero: boolean;
  designador: Designador;
  antesPalavra: boolean;
}

function ehLetraDeDesignacao(chave: string, designador: Designador, antesPalavra: boolean): boolean {
  if (!designador || [...chave].length !== 1 || chave === 'à') return false;
  return designador === 'forte' ? !(chave === 'e' && antesPalavra) : !antesPalavra;
}

function formatarNucleo(nucleo: string, { meio, aposNumero, antesNumero, designador, antesPalavra }: Posicao): string {
  if (/[0-9]/.test(nucleo)) return formatarComNumero(nucleo);
  const chave = minusculo(nucleo);
  if (ehLetraDeDesignacao(chave, designador, antesPalavra)) return maiusculo(nucleo);
  if (meio && CONECTIVOS.has(chave)) return chave;
  if (aposNumero) {
    const unidade = UNIDADES.get(chave);
    if (unidade) return unidade;
  }
  if (chave === 'x' && aposNumero && antesNumero) return 'x';
  const sigla = SIGLAS.get(chave) ?? siglaSemVogal(chave);
  if (sigla) return sigla;
  if ([...nucleo].length === 1) return maiusculo(nucleo);
  return formatarComposto(nucleo);
}

const comecaComNumero = (token?: Token) => !!token && /^[0-9]/.test(token.nucleo);
const comecaComLetra = (token?: Token) => !!token && /^\p{L}/u.test(token.nucleo);
function designadorDe(token?: Token): Designador {
  const chave = token ? minusculo(token.nucleo) : '';
  if (DESIGNADORES.has(chave)) return 'forte';
  if (DESIGNADORES_FRACOS.has(chave)) return 'fraco';
  return undefined;
}

export function padronizarTexto(texto: string): string {
  const tokens = texto.trim().split(/\s+/).filter(t => t !== '').map(separar);
  const comNucleo = tokens.flatMap((t, i) => (t.nucleo ? [i] : []));
  const primeiro = comNucleo[0];
  const ultimo = comNucleo[comNucleo.length - 1];
  return tokens
    .map((t, i) => {
      if (!t.nucleo) return t.pre;
      return t.pre + formatarNucleo(t.nucleo, {
        meio: i !== primeiro && i !== ultimo,
        aposNumero: comecaComNumero(tokens[i - 1]),
        antesNumero: comecaComNumero(tokens[i + 1]),
        designador: designadorDe(tokens[i - 1]),
        antesPalavra: comecaComLetra(tokens[i + 1]),
      }) + t.suf;
    })
    .join(' ');
}

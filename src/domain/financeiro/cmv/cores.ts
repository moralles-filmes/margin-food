/**
 * CMV Financeiro — cor de categoria.
 *
 * A cor sai do índice estável da categoria no cadastro (ordem de criação), não da
 * posição no ranking: a mesma categoria tem a mesma cor em qualquer aba, período,
 * gráfico, tabela e no PDF. O número de categorias é aberto, então a cor é
 * calculada (ângulo áureo a partir do azul da marca) em vez de vir de uma paleta
 * fixa de tokens — exceção deliberada à regra de tokens, como a paleta impressa
 * dos exports. Tela e PDF usam a MESMA função.
 */

export type Rgb = [number, number, number];

const HUE_INICIAL = 217;
const ANGULO_AUREO = 137.508;
const LUMINOSIDADES = [50, 62, 42];
const NEUTRA: Rgb = [148, 163, 184];

function hslParaRgb(h: number, s: number, l: number): Rgb {
  const sat = s / 100;
  const lum = l / 100;
  const c = (1 - Math.abs(2 * lum - 1)) * sat;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lum - c / 2;
  let r = 0;
  let g = 0;
  let b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)];
}

/** `null` = "Sem categoria", "Outras" e totais: cinza neutro. */
export function corCategoriaRgb(indice: number | null): Rgb {
  if (indice === null || indice < 0) return NEUTRA;
  const hue = (HUE_INICIAL + indice * ANGULO_AUREO) % 360;
  return hslParaRgb(hue, 68, LUMINOSIDADES[indice % LUMINOSIDADES.length]);
}

export function corCategoriaCss(indice: number | null): string {
  const [r, g, b] = corCategoriaRgb(indice);
  return `rgb(${r}, ${g}, ${b})`;
}

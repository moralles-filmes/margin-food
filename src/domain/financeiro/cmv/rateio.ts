/**
 * CMV Financeiro — decisão por linha de rateio do boleto.
 *
 * A decisão (`true` entra, `false` fica fora, `null` pendente) pertence à linha
 * de rateio. Boleto sem rateio tem uma única linha implícita com o valor total.
 * Valores são somados em centavos inteiros: nada de resíduo de ponto flutuante.
 */

export type CmvDecisao = boolean | null;

export interface CmvLinhaDecisao {
  valor: number;
  cmv_incluir: CmvDecisao;
}

export interface CmvResumoBoleto {
  totalCentavos: number;
  incluidoCentavos: number;
  foraCentavos: number;
  pendenteCentavos: number;
  /** Parte do boleto que nenhuma linha de rateio cobre (rateio que não fecha). */
  naoRateadoCentavos: number;
  linhasPendentes: number;
}

export function paraCentavos(valor: number | null | undefined): number {
  const numero = Number(valor);
  return Number.isFinite(numero) ? Math.round(numero * 100) : 0;
}

/** Resumo "Total do boleto / Incluído / Fora / Pendente" a partir das linhas reais. */
export function resumirBoleto(valorBoleto: number, linhas: readonly CmvLinhaDecisao[]): CmvResumoBoleto {
  const totalCentavos = paraCentavos(valorBoleto);
  let incluidoCentavos = 0;
  let foraCentavos = 0;
  let pendenteCentavos = 0;
  let linhasPendentes = 0;
  for (const linha of linhas) {
    const centavos = paraCentavos(linha.valor);
    if (linha.cmv_incluir === true) incluidoCentavos += centavos;
    else if (linha.cmv_incluir === false) foraCentavos += centavos;
    else {
      pendenteCentavos += centavos;
      linhasPendentes += 1;
    }
  }
  return {
    totalCentavos,
    incluidoCentavos,
    foraCentavos,
    pendenteCentavos,
    naoRateadoCentavos: totalCentavos - incluidoCentavos - foraCentavos - pendenteCentavos,
    linhasPendentes,
  };
}

/**
 * Decisão sugerida ao escolher a categoria de um lançamento NOVO: o padrão da
 * categoria, ou pendente quando ela não tem padrão (nunca "Sim" por omissão).
 */
export function decisaoSugerida(
  categoriaId: string | null | undefined,
  padroes: ReadonlyMap<string, CmvDecisao>,
): CmvDecisao {
  if (!categoriaId) return null;
  return padroes.get(categoriaId) ?? null;
}

/**
 * Distribui `totalCentavos` em N partes iguais; os centavos que sobram vão um a
 * um para as primeiras linhas, então a soma fecha sempre e o resultado é o mesmo
 * para a mesma entrada.
 */
export function dividirCentavos(totalCentavos: number, partes: number): number[] {
  if (partes <= 0) return [];
  const base = Math.trunc(totalCentavos / partes);
  const resto = totalCentavos - base * partes;
  return Array.from({ length: partes }, (_, i) => base + (i < Math.abs(resto) ? Math.sign(resto) : 0));
}

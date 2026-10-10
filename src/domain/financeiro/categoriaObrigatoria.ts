export interface CategoriaObrigatoriaInput {
  /** RECEITA | DESPESA | TRANSFERENCIA; ausente = receita ou despesa (CP/CR). */
  tipo?: string | null;
  /** Categoria do cabeçalho, usada só quando não há rateio. */
  categoriaId?: string | null;
  rateio: ReadonlyArray<{ categoria_id?: string | null }>;
}

/** "1", "1 e 2", "1, 2 e 3". */
const juntarComE = (itens: string[]) =>
  itens.length > 1 ? `${itens.slice(0, -1).join(', ')} e ${itens[itens.length - 1]}` : itens.join('');

/**
 * Categoria obrigatória em receita e despesa: com rateio, em todas as linhas;
 * sem rateio, no cabeçalho. O rateio manda nos relatórios — linha sem categoria
 * cai em "Sem categoria" e o cabeçalho é ignorado. Transferência não tem categoria.
 * Devolve a mensagem para o usuário, ou `null` quando está tudo preenchido.
 */
export function erroCategoriaObrigatoria({ tipo, categoriaId, rateio }: CategoriaObrigatoriaInput): string | null {
  if (tipo === 'TRANSFERENCIA') return null;
  if (rateio.length > 0) {
    const linhas = rateio.flatMap((linha, i) => (linha.categoria_id?.trim() ? [] : [String(i + 1)]));
    if (linhas.length === 0) return null;
    return linhas.length === 1
      ? `Selecione a categoria da linha ${linhas[0]} do rateio.`
      : `Selecione a categoria das linhas ${juntarComE(linhas)} do rateio.`;
  }
  return categoriaId?.trim() ? null : 'Selecione uma categoria.';
}

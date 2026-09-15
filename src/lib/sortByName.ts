/**
 * Ordenação alfabética padrão das listas do sistema (exceto Financeiro).
 *
 * - pt-BR, sem diferenciar acento nem maiúsculas ("Açúcar" antes de "Alho").
 * - Numérica: "Item 2" antes de "Item 10".
 * - Nome vazio/nulo vai para o fim da lista.
 *
 * Ordenar SEMPRE depois de filtrar (ou sobre a lista base, antes do filter —
 * `Array.filter` preserva a ordem), para que o resultado filtrado continue
 * em ordem alfabética.
 */
const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

export function compareNames(a: string | null | undefined, b: string | null | undefined): number {
  const na = (a ?? '').trim();
  const nb = (b ?? '').trim();
  if (!na && !nb) return 0;
  if (!na) return 1;
  if (!nb) return -1;
  return collator.compare(na, nb);
}

/** Retorna uma NOVA lista ordenada pelo nome extraído por `getName` (não muta a original). */
export function sortByName<T>(items: readonly T[], getName: (item: T) => string | null | undefined): T[] {
  return [...items].sort((a, b) => compareNames(getName(a), getName(b)));
}

/** Atalho para listas de strings (opções de filtro, categorias etc.). */
export function sortNames<T extends string>(items: readonly T[]): T[] {
  return [...items].sort(compareNames);
}

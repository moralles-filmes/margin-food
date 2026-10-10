import type { SearchableSelectOption } from '@/components/ui/SearchableSelect';

export const CATEGORIA_FILTRO_TODOS = 'todos';
export const CATEGORIA_FILTRO_SEM_CATEGORIA = 'sem_categoria';

interface CategoriaComGrupo {
  id: string;
  nome: string;
  groupLabel?: string;
}

/** Opcoes do SearchableSelect de filtro de categoria: "Todas" + "Sem categoria" + a arvore. */
export function buildCategoriaFilterOptions(categorias: CategoriaComGrupo[]): SearchableSelectOption[] {
  return [
    { value: CATEGORIA_FILTRO_TODOS, label: 'Todas as categorias' },
    { value: CATEGORIA_FILTRO_SEM_CATEGORIA, label: 'Sem categoria' },
    ...categorias.map(c => ({ value: c.id, label: c.groupLabel ? `${c.groupLabel} › ${c.nome}` : c.nome })),
  ];
}

/** Converte o valor do Select (sentinelas 'todos'/'sem_categoria' ou um uuid) nos params da RPC. */
export function categoriaFiltroToParams(filtroCategoria: string): { p_categoria_id: string | null; p_sem_categoria: boolean } {
  if (filtroCategoria === CATEGORIA_FILTRO_SEM_CATEGORIA) return { p_categoria_id: null, p_sem_categoria: true };
  if (!filtroCategoria || filtroCategoria === CATEGORIA_FILTRO_TODOS) return { p_categoria_id: null, p_sem_categoria: false };
  return { p_categoria_id: filtroCategoria, p_sem_categoria: false };
}

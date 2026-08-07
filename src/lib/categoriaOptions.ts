export interface CategoriaHierarchyRow {
  id: string;
  nome: string;
  parent_id: string | null;
  tipo?: string | null;
  codigo?: string | null;
}

/**
 * Anexa um `groupLabel` (breadcrumb "Categoria › Subcategoria", vazio para itens de topo)
 * a cada linha, calculado a partir da cadeia de `parent_id`. Usado para agrupar visualmente
 * o CategoryCombobox por hierarquia (ver CLAUDE.md — árvore de Categorias).
 */
export function buildCategoryOptions<T extends CategoriaHierarchyRow>(rows: T[]): (T & { groupLabel: string })[] {
  const byId = new Map<string, T>();
  for (const row of rows) byId.set(row.id, row);

  const ancestorNames = (row: T): string[] => {
    const names: string[] = [];
    const visited = new Set<string>([row.id]);
    let current = row.parent_id ? byId.get(row.parent_id) : undefined;
    while (current && !visited.has(current.id)) {
      visited.add(current.id);
      names.unshift(current.nome);
      current = current.parent_id ? byId.get(current.parent_id) : undefined;
    }
    return names;
  };

  return rows.map(row => ({ ...row, groupLabel: ancestorNames(row).join(' › ') }));
}

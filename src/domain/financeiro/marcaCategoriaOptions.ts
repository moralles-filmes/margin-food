/**
 * Filtra as categorias elegíveis para vincular a uma marca/dark kitchen do
 * Fechamento de Caixa: folha (sem sub-categoria/item ativo abaixo), RECEITA,
 * ativa e operacional (não `excluir_dos_totais`).
 *
 * Espelha exatamente a validação do trigger `validate_marca_categoria_vinculo`
 * (migration `20260831234500_marca_categoria_vinculo.sql`) — o banco continua
 * sendo a rede de segurança, isto aqui é só para a combobox não oferecer uma
 * opção que o servidor vai recusar.
 */

export interface MarcaCategoriaOption {
  id: string;
  tipo?: string | null;
  parent_id?: string | null;
  ativo?: boolean | null;
  excluir_dos_totais?: boolean | null;
}

export function filterEligibleMarcaCategoryOptions<T extends MarcaCategoriaOption>(
  categorias: readonly T[],
): T[] {
  const activeParentIds = new Set(
    categorias
      .filter(c => c.ativo !== false && c.parent_id)
      .map(c => c.parent_id as string),
  );

  return categorias.filter(c =>
    c.tipo === 'receita'
    && c.ativo !== false
    && c.excluir_dos_totais !== true
    && !activeParentIds.has(c.id),
  );
}

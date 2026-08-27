import type {
  CategoryCompositionNode,
  CategoryNature,
  ManagerialLedgerEntry,
  PresentationCategoryComposition,
  PresentationCategoryDefinition,
  ResolvedCategoryAmount,
} from './contracts';
import { roundMoney } from './metrics';

/**
 * Resolve a classificação de uma linha sem misturar cabeçalho e rateio.
 * A mera existência de rateios torna `categoryId` do lançamento irrelevante.
 */
export function resolveManagerialCategoryAmounts(
  entry: ManagerialLedgerEntry,
): ResolvedCategoryAmount[] {
  if (entry.type !== 'RECEITA' && entry.type !== 'DESPESA') return [];
  const nature = entry.type;

  if (entry.allocations && entry.allocations.length > 0) {
    return entry.allocations.map(allocation => ({
      entryId: entry.id,
      categoryId: allocation.categoryId,
      nature,
      amount: roundMoney(allocation.amount),
      source: 'allocation',
      excludedFromTotals: entry.excludedFromReports,
    }));
  }

  return [{
    entryId: entry.id,
    categoryId: entry.categoryId,
    nature,
    amount: roundMoney(entry.amount),
    source: 'entry-category',
    excludedFromTotals: entry.excludedFromReports,
  }];
}

interface CategoryNodeWithOrder extends CategoryCompositionNode {
  order: number;
  children: CategoryNodeWithOrder[];
}

function buildSectionNodes(
  amounts: readonly ResolvedCategoryAmount[],
  definitions: readonly PresentationCategoryDefinition[],
  nature: CategoryNature,
  excludedFromTotals: boolean,
): CategoryCompositionNode[] {
  const relevantDefinitions = definitions.filter(definition => (
    definition.nature === nature && definition.excludedFromTotals === excludedFromTotals
  ));
  const definitionsById = new Map(relevantDefinitions.map(definition => [definition.id, definition]));
  const childrenByParent = new Map<string | null, PresentationCategoryDefinition[]>();
  const directAmounts = new Map<string, number>();
  let unclassifiedAmount = 0;

  for (const definition of relevantDefinitions) {
    const parentId = definition.parentId && definitionsById.has(definition.parentId)
      ? definition.parentId
      : null;
    const children = childrenByParent.get(parentId) ?? [];
    children.push(definition);
    childrenByParent.set(parentId, children);
  }

  for (const amount of amounts) {
    if (amount.nature !== nature || amount.excludedFromTotals !== excludedFromTotals) continue;
    if (!amount.categoryId || !definitionsById.has(amount.categoryId)) {
      unclassifiedAmount += amount.amount;
      continue;
    }
    directAmounts.set(
      amount.categoryId,
      (directAmounts.get(amount.categoryId) ?? 0) + amount.amount,
    );
  }

  const visiting = new Set<string>();
  const buildNode = (definition: PresentationCategoryDefinition): CategoryNodeWithOrder => {
    if (visiting.has(definition.id)) throw new RangeError('Category hierarchy contains a cycle');
    visiting.add(definition.id);
    const children = (childrenByParent.get(definition.id) ?? [])
      .map(buildNode)
      .filter(child => child.amount !== 0 || child.children.length > 0);
    visiting.delete(definition.id);

    const directAmount = roundMoney(directAmounts.get(definition.id) ?? 0);
    const amount = roundMoney(directAmount + children.reduce((sum, child) => sum + child.amount, 0));
    return {
      categoryId: definition.id,
      parentCategoryId: definition.parentId,
      name: definition.name,
      nature,
      directAmount,
      amount,
      sharePercent: 0,
      children,
      order: definition.order,
    };
  };

  const roots = (childrenByParent.get(null) ?? [])
    .map(buildNode)
    .filter(node => node.amount !== 0 || node.children.length > 0);

  if (roundMoney(unclassifiedAmount) !== 0) {
    roots.push({
      categoryId: null,
      parentCategoryId: null,
      name: nature === 'RECEITA' ? 'Sem categoria — Receitas' : 'Sem categoria — Despesas',
      nature,
      directAmount: roundMoney(unclassifiedAmount),
      amount: roundMoney(unclassifiedAmount),
      sharePercent: 0,
      children: [],
      order: Number.MAX_SAFE_INTEGER,
    });
  }

  roots.sort((a, b) => a.order - b.order || a.name.localeCompare(b.name, 'pt-BR'));
  const sectionTotal = roundMoney(roots.reduce((sum, node) => sum + node.amount, 0));

  const addShares = (node: CategoryNodeWithOrder): CategoryCompositionNode => ({
    categoryId: node.categoryId,
    parentCategoryId: node.parentCategoryId,
    name: node.name,
    nature: node.nature,
    directAmount: node.directAmount,
    amount: node.amount,
    sharePercent: sectionTotal === 0 ? 0 : (node.amount / sectionTotal) * 100,
    children: node.children.map(addShares),
  });

  return roots.map(addShares);
}

export function buildCategoryComposition(
  amounts: readonly ResolvedCategoryAmount[],
  definitions: readonly PresentationCategoryDefinition[],
): PresentationCategoryComposition {
  return {
    operational: {
      revenue: buildSectionNodes(amounts, definitions, 'RECEITA', false),
      expense: buildSectionNodes(amounts, definitions, 'DESPESA', false),
    },
    nonOperational: {
      revenue: buildSectionNodes(amounts, definitions, 'RECEITA', true),
      expense: buildSectionNodes(amounts, definitions, 'DESPESA', true),
    },
  };
}

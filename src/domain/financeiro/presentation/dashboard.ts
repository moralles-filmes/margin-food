import type {
  CategoryCompositionNode,
  PresentationPeriodSnapshot,
} from './contracts';

export interface PresentationCategoryMetadata {
  group: string | null;
  dreLine: string | null;
}

export type PresentationCategoryMetadataMap = Readonly<Record<string, PresentationCategoryMetadata>>;

export interface PresentationGroupMetric {
  amount: number;
  revenueSharePercent: number | null;
}

export interface PresentationDashboardInsight {
  id: string;
  title: string;
  description: string;
  tone: 'positive' | 'negative' | 'warning' | 'neutral';
  target: 'overview' | 'revenue' | 'expense' | 'cmv' | 'payables' | 'receivables';
}

function normalizedGroup(value: string | null | undefined): string | null {
  const normalized = value?.trim().toLocaleLowerCase('pt-BR');
  return normalized ? normalized : null;
}

function categoryGroup(
  node: CategoryCompositionNode,
  metadata: PresentationCategoryMetadataMap,
  inheritedGroup: string | null,
): string | null {
  if (node.categoryId === null) return inheritedGroup;
  return normalizedGroup(metadata[node.categoryId]?.group) ?? inheritedGroup;
}

function sumDirectAmountForGroup(
  nodes: readonly CategoryCompositionNode[],
  metadata: PresentationCategoryMetadataMap,
  targetGroup: string,
  inheritedGroup: string | null = null,
): number {
  let total = 0;
  const normalizedTarget = normalizedGroup(targetGroup);

  for (const node of nodes) {
    const effectiveGroup = categoryGroup(node, metadata, inheritedGroup);
    if (effectiveGroup === normalizedTarget) total += node.directAmount;
    total += sumDirectAmountForGroup(node.children, metadata, targetGroup, effectiveGroup);
  }

  return Math.round((total + Number.EPSILON) * 100) / 100;
}

export function calculatePresentationGroupMetric(
  snapshot: PresentationPeriodSnapshot,
  metadata: PresentationCategoryMetadataMap,
  targetGroup: string,
): PresentationGroupMetric {
  const amount = sumDirectAmountForGroup(
    snapshot.categoryComposition.operational.expense,
    metadata,
    targetGroup,
  );
  const revenue = snapshot.metrics.managerialResult.revenue;

  return {
    amount,
    revenueSharePercent: revenue === 0 ? null : (amount / revenue) * 100,
  };
}

function filterNodesByGroup(
  nodes: readonly CategoryCompositionNode[],
  metadata: PresentationCategoryMetadataMap,
  targetGroups: ReadonlySet<string>,
  inheritedGroup: string | null,
): CategoryCompositionNode[] {
  const result: CategoryCompositionNode[] = [];

  for (const node of nodes) {
    const effectiveGroup = categoryGroup(node, metadata, inheritedGroup);
    const filteredChildren = filterNodesByGroup(
      node.children,
      metadata,
      targetGroups,
      effectiveGroup,
    );

    if (effectiveGroup !== null && targetGroups.has(effectiveGroup)) {
      result.push({ ...node, children: filteredChildren.length > 0 ? filteredChildren : node.children });
    } else if (filteredChildren.length > 0) {
      // Um agrupador contábil genérico não deve virar uma falsa categoria do
      // indicador; promove os descendentes semanticamente classificados.
      result.push(...filteredChildren);
    }
  }

  return result;
}

export function filterPresentationCategoriesByGroup(
  nodes: readonly CategoryCompositionNode[],
  metadata: PresentationCategoryMetadataMap,
  targetGroup: string,
): CategoryCompositionNode[] {
  return filterPresentationCategoriesByGroups(nodes, metadata, [targetGroup]);
}

export function filterPresentationCategoriesByGroups(
  nodes: readonly CategoryCompositionNode[],
  metadata: PresentationCategoryMetadataMap,
  targetGroups: readonly string[],
): CategoryCompositionNode[] {
  const normalizedTargets = new Set(
    targetGroups.map(normalizedGroup).filter((value): value is string => value !== null),
  );
  return filterNodesByGroup(nodes, metadata, normalizedTargets, null);
}

function topRootCategory(nodes: readonly CategoryCompositionNode[]): CategoryCompositionNode | null {
  let top: CategoryCompositionNode | null = null;
  for (const node of nodes) {
    if (node.amount > (top?.amount ?? Number.NEGATIVE_INFINITY)) top = node;
  }
  return top;
}

export function buildPresentationDashboardInsights(
  snapshot: PresentationPeriodSnapshot,
  cmv: PresentationGroupMetric | null,
): PresentationDashboardInsight[] {
  const { managerialResult, openItems } = snapshot.metrics;
  const insights: PresentationDashboardInsight[] = [];

  if (managerialResult.result < 0) {
    insights.push({
      id: 'negative-result',
      title: 'Margem pressionada',
      description: 'As despesas operacionais ficaram acima da receita no período.',
      tone: 'negative',
      target: 'overview',
    });
  } else if (managerialResult.result > 0) {
    insights.push({
      id: 'positive-result',
      title: 'Resultado operacional positivo',
      description: 'A receita superou as despesas operacionais no período.',
      tone: 'positive',
      target: 'overview',
    });
  }

  if (cmv && cmv.amount > 0) {
    insights.push({
      id: 'cmv-share',
      title: 'Participação do CMV',
      description: cmv.revenueSharePercent === null
        ? 'Há custo classificado como CMV, mas não existe receita operacional para calcular a participação.'
        : `O CMV representa ${cmv.revenueSharePercent.toLocaleString('pt-BR', {
            minimumFractionDigits: 1,
            maximumFractionDigits: 1,
          })}% da receita operacional.`,
      tone: 'warning',
      target: 'cmv',
    });
  }

  const topExpense = topRootCategory(snapshot.categoryComposition.operational.expense);
  if (topExpense && topExpense.amount > 0) {
    insights.push({
      id: 'expense-concentration',
      title: 'Maior grupo de despesa',
      description: `${topExpense.name} concentra ${topExpense.sharePercent.toLocaleString('pt-BR', {
        minimumFractionDigits: 1,
        maximumFractionDigits: 1,
      })}% das despesas operacionais.`,
      tone: 'neutral',
      target: 'expense',
    });
  }

  if (openItems.accountsPayableOpen.count > 0) {
    insights.push({
      id: 'open-payables',
      title: 'Contas a pagar em aberto',
      description: `${openItems.accountsPayableOpen.count.toLocaleString('pt-BR')} título(s) aguardam acompanhamento.`,
      tone: 'warning',
      target: 'payables',
    });
  }

  if (insights.length === 0) {
    insights.push({
      id: 'no-alerts',
      title: 'Sem alertas determinísticos',
      description: 'Não foram identificados destaques pelas regras disponíveis para o período.',
      tone: 'neutral',
      target: 'overview',
    });
  }

  return insights.slice(0, 4);
}

import type {
  CategoryCompositionNode,
  PresentationPeriodSnapshot,
} from './contracts';
import { normalizarGrupo } from '../categoriaGrupo';

/**
 * Grupos (`fin_categorias.grupo`, já herdados) que cada detalhamento da
 * Apresentação Sócios lê. Despesa cujo grupo efetivo não está aqui — inclusive
 * sem grupo — não aparece em nenhum deles, só no total.
 */
export const PRESENTATION_ANALYSIS_GROUPS = {
  cmv: ['cmv'],
  personnel: ['pessoal'],
  operations: ['ocupacao', 'utilidades', 'marketing', 'administrativa', 'manutencao'],
  financial: ['financeira', 'taxa'],
  investments: ['investimento'],
} as const satisfies Record<string, readonly string[]>;

export const PRESENTATION_DETAILED_GROUPS: readonly string[] = Object.values(PRESENTATION_ANALYSIS_GROUPS).flat();

export interface PresentationCategoryMetadata {
  group: string | null;
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

export interface PresentationExpenseOutsideGroupsItem {
  categoryId: string | null;
  /** Nomes da raiz até a categoria. */
  path: readonly string[];
  /** Grupo efetivo (próprio ou herdado); `null` = sem grupo. */
  group: string | null;
  amount: number;
}

export interface PresentationExpenseOutsideGroups {
  amount: number;
  categories: readonly PresentationExpenseOutsideGroupsItem[];
}

function roundToCents(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function categoryGroup(
  node: CategoryCompositionNode,
  metadata: PresentationCategoryMetadataMap,
  inheritedGroup: string | null,
): string | null {
  if (node.categoryId === null) return inheritedGroup;
  return normalizarGrupo(metadata[node.categoryId]?.group) ?? inheritedGroup;
}

function sumDirectAmountForGroup(
  nodes: readonly CategoryCompositionNode[],
  metadata: PresentationCategoryMetadataMap,
  targetGroup: string,
  inheritedGroup: string | null = null,
): number {
  let total = 0;
  const normalizedTarget = normalizarGrupo(targetGroup);

  for (const node of nodes) {
    const effectiveGroup = categoryGroup(node, metadata, inheritedGroup);
    if (effectiveGroup === normalizedTarget) total += node.directAmount;
    total += sumDirectAmountForGroup(node.children, metadata, targetGroup, effectiveGroup);
  }

  return roundToCents(total);
}

/**
 * Despesa que nenhum detalhamento por grupo mostra: grupo efetivo vazio ou fora
 * de `coveredGroups`. Usa `directAmount` (como `sumDirectAmountForGroup`) para
 * não somar pai e filho duas vezes.
 */
export function summarizeExpenseOutsideGroups(
  nodes: readonly CategoryCompositionNode[],
  metadata: PresentationCategoryMetadataMap,
  coveredGroups: readonly string[],
): PresentationExpenseOutsideGroups {
  const covered = new Set(
    coveredGroups.map(normalizarGrupo).filter((value): value is string => value !== null),
  );
  const categories: PresentationExpenseOutsideGroupsItem[] = [];
  let total = 0;

  const visit = (
    list: readonly CategoryCompositionNode[],
    inheritedGroup: string | null,
    parentPath: readonly string[],
  ) => {
    for (const node of list) {
      const group = categoryGroup(node, metadata, inheritedGroup);
      const path = [...parentPath, node.name];
      if ((group === null || !covered.has(group)) && node.directAmount !== 0) {
        total += node.directAmount;
        categories.push({ categoryId: node.categoryId, path, group, amount: roundToCents(node.directAmount) });
      }
      visit(node.children, group, path);
    }
  };
  visit(nodes, null, []);

  categories.sort((a, b) => b.amount - a.amount);
  return { amount: roundToCents(total), categories };
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
    targetGroups.map(normalizarGrupo).filter((value): value is string => value !== null),
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

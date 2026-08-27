import { useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react';
import type { CategoryCompositionNode } from '@/domain/financeiro/presentation';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';

interface PresentationFinancialTreeProps {
  title: string;
  nodes: readonly CategoryCompositionNode[];
  tone: 'revenue' | 'expense';
  onSelectNode?: (node: CategoryCompositionNode) => void;
}

function expandableIds(nodes: readonly CategoryCompositionNode[]): Set<string> {
  const result = new Set<string>();
  const visit = (items: readonly CategoryCompositionNode[]) => {
    for (const node of items) {
      if (node.categoryId && node.children.length > 0) result.add(node.categoryId);
      visit(node.children);
    }
  };
  visit(nodes);
  return result;
}

function visibleRows(
  nodes: readonly CategoryCompositionNode[],
  expanded: ReadonlySet<string>,
  depth = 0,
): Array<{ node: CategoryCompositionNode; depth: number }> {
  const rows: Array<{ node: CategoryCompositionNode; depth: number }> = [];
  for (const node of nodes) {
    rows.push({ node, depth });
    if (node.categoryId && expanded.has(node.categoryId)) {
      rows.push(...visibleRows(node.children, expanded, depth + 1));
    }
  }
  return rows;
}

export default function PresentationFinancialTree({
  title,
  nodes,
  tone,
  onSelectNode,
}: PresentationFinancialTreeProps) {
  const expandable = useMemo(() => expandableIds(nodes), [nodes]);
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(expandable);
  const rows = visibleRows(nodes, expanded);

  const toggle = (id: string) => {
    setExpanded(current => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="min-w-0">
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {tone === 'revenue'
            ? <TrendingUp className="h-4 w-4 text-success" aria-hidden="true" />
            : <TrendingDown className="h-4 w-4 text-destructive" aria-hidden="true" />}
          {title}
        </h3>
        <span className="text-[10px] text-muted-foreground">Direto / acumulado</span>
      </div>
      {rows.length === 0 ? (
        <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">
          Nenhum valor nesta composição.
        </p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/80">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="h-9 text-[11px]">Categoria</TableHead>
                <TableHead className="h-9 text-right text-[11px]">Valor acumulado</TableHead>
                <TableHead className="h-9 text-right text-[11px]">% composição</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ node, depth }) => {
                const hasChildren = node.children.length > 0 && node.categoryId !== null;
                const isExpanded = hasChildren && expanded.has(node.categoryId as string);
                const canSelect = Boolean(onSelectNode && node.categoryId);
                return (
                  <TableRow key={node.categoryId ?? `${node.nature}-sem-categoria`}>
                    <TableCell className="min-w-52 py-2 text-xs font-medium">
                      <div className="flex items-center gap-1.5" style={{ paddingLeft: `${depth * 0.9}rem` }}>
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggle(node.categoryId as string)}
                            aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${node.name}`}
                            aria-expanded={isExpanded}
                            className="rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          >
                            {isExpanded
                              ? <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                              : <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />}
                          </button>
                        ) : <span className="w-[18px] text-center text-muted-foreground/50">·</span>}
                        {canSelect ? (
                          <button
                            type="button"
                            onClick={() => onSelectNode?.(node)}
                            className="min-w-0 truncate rounded-sm text-left underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            aria-label={`Abrir detalhe da categoria ${node.name}`}
                          >
                            {node.name}
                          </button>
                        ) : <span className="truncate">{node.name}</span>}
                      </div>
                    </TableCell>
                    <TableCell className="whitespace-nowrap py-2 text-right font-mono text-xs font-semibold">
                      {fmtBRL(node.amount)}
                      {node.directAmount !== node.amount ? (
                        <span className="block text-[10px] font-normal text-muted-foreground">
                          direto {fmtBRL(node.directAmount)}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="min-w-28 py-2 text-right text-xs">
                      <div className="flex items-center justify-end gap-2">
                        <span className="h-1.5 w-12 overflow-hidden rounded-full bg-muted" aria-hidden="true">
                          <span
                            className={cn('block h-full rounded-full', tone === 'revenue' ? 'bg-success' : 'bg-destructive')}
                            style={{ width: `${Math.min(Math.max(node.sharePercent, 0), 100)}%` }}
                          />
                        </span>
                        <span className="w-12">{formatPercentBR(node.sharePercent, 1)}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}

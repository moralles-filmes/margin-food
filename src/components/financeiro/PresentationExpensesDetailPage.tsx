import { ArrowLeft, Loader2 } from 'lucide-react';
import type {
  CategoryCompositionNode,
  DataAvailability,
  PresentationExpenseNode,
  PresentationExpensesData,
} from '@/domain/financeiro/presentation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import PresentationFinancialTree from '@/components/financeiro/PresentationFinancialTree';
import { usePresentationExpenseDetails } from '@/hooks/usePresentationExpenseDetails';
import { fmtBRL } from '@/lib/formatters';

function findPath(
  nodes: readonly PresentationExpenseNode[],
  categoryId: string,
  path: readonly PresentationExpenseNode[] = [],
): readonly PresentationExpenseNode[] | null {
  for (const node of nodes) {
    const next = [...path, node];
    if (node.categoryId === categoryId) return next;
    const childPath = findPath(node.children, categoryId, next);
    if (childPath) return childPath;
  }
  return null;
}

function toCompositionNodes(
  nodes: readonly PresentationExpenseNode[],
  total: number,
): CategoryCompositionNode[] {
  return nodes.map(node => ({
    categoryId: node.categoryId,
    parentCategoryId: node.parentId,
    name: node.name,
    nature: 'DESPESA',
    directAmount: node.directAmount,
    amount: node.amount,
    sharePercent: total === 0 ? 0 : (node.amount / total) * 100,
    children: toCompositionNodes(node.children, total),
  }));
}

export default function PresentationExpensesDetailPage({
  companyId,
  availability,
  categoryId,
  unitName,
  onBack,
  onSelectCategory,
}: {
  companyId: string | null | undefined;
  availability: DataAvailability<PresentationExpensesData>;
  categoryId?: string;
  unitName?: string | null;
  onBack: () => void;
  onSelectCategory: (categoryId?: string) => void;
}) {
  const expenses = availability.state === 'available' || availability.state === 'empty'
    ? availability.data
    : null;
  const path = expenses && categoryId ? findPath(expenses.tree, categoryId) : null;
  const selected = path?.[path.length - 1];
  const detail = usePresentationExpenseDetails({
    companyId,
    month: expenses?.selectedMonth ?? '2000-01',
    categoryId: categoryId ?? null,
    enabled: Boolean(expenses),
  });
  const composition = expenses ? toCompositionNodes(expenses.tree, expenses.current.total) : [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Button type="button" variant="ghost" size="sm" className="mb-2 -ml-2" onClick={onBack}>
            <ArrowLeft className="mr-2 h-4 w-4" aria-hidden="true" /> Voltar à apresentação
          </Button>
          <h2 className="text-xl font-bold text-foreground">Detalhe de despesas</h2>
          <p className="text-sm text-muted-foreground">
            {unitName ? `${unitName} · ` : ''}DFC · regime de caixa · {expenses?.selectedMonth ?? 'período indisponível'}
          </p>
        </div>
        {categoryId ? <Button type="button" variant="outline" onClick={() => onSelectCategory()}>Ver todas as despesas</Button> : null}
      </div>

      {!expenses ? (
        <Card><CardContent className="p-6 text-sm text-muted-foreground">A base canônica de despesas não está disponível para este período.</CardContent></Card>
      ) : (
        <>
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">{selected?.name ?? 'Todas as despesas'}</CardTitle>
              <p className="text-xs text-muted-foreground">
                {path?.map(node => node.name).join(' › ') ?? 'Categorias operacionais e não operacionais do DFC'}
              </p>
            </CardHeader>
            <CardContent>
              <p className="text-2xl font-bold text-foreground">{fmtBRL(selected?.amount ?? expenses.current.total)}</p>
              <p className="mt-1 text-xs text-muted-foreground">Valor acumulado; rateios substituem a categoria do lançamento.</p>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle className="text-base">Árvore do DFC</CardTitle></CardHeader>
            <CardContent>
              <PresentationFinancialTree
                title="Despesas por categoria"
                nodes={composition}
                tone="expense"
                onSelectNode={node => onSelectCategory(node.categoryId ?? undefined)}
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Lançamentos realizados</CardTitle>
              <p className="text-xs text-muted-foreground">Data efetiva: pagamento, conciliação ou competência, nessa ordem.</p>
            </CardHeader>
            <CardContent>
              {detail.isPending ? (
                <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando lançamentos...</p>
              ) : detail.error ? (
                <p className="py-6 text-sm text-destructive">Não foi possível carregar o detalhe desta categoria.</p>
              ) : detail.rows.length === 0 ? (
                <p className="py-6 text-sm text-muted-foreground">Nenhum lançamento encontrado.</p>
              ) : (
                <div className="overflow-x-auto rounded-lg border">
                  <Table>
                    <TableHeader><TableRow><TableHead>Data</TableHead><TableHead>Descrição</TableHead><TableHead>Categoria</TableHead><TableHead>Classe</TableHead><TableHead className="text-right">Valor</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {detail.rows.map(row => (
                        <TableRow key={`${row.allocationSource}-${row.allocationId}`}>
                          <TableCell className="whitespace-nowrap">{row.effectiveDate.split('-').reverse().join('/')}</TableCell>
                          <TableCell className="min-w-64">{row.description}</TableCell>
                          <TableCell>{row.categoryName}</TableCell>
                          <TableCell>{row.operationalClass === 'non-operational' ? 'Não operacional' : 'Operacional'}</TableCell>
                          <TableCell className="whitespace-nowrap text-right font-mono font-semibold">{fmtBRL(row.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {detail.hasNextPage ? (
                <Button type="button" variant="outline" className="mt-4" disabled={detail.isFetchingNextPage} onClick={() => { void detail.fetchNextPage(); }}>
                  {detail.isFetchingNextPage ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
                  Carregar mais
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

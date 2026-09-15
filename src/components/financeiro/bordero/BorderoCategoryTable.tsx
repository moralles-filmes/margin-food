import { Fragment, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { formatDateValueBR } from '@/lib/datetime';
import {
  BORDERO_STATUS_LABEL,
  flattenBorderoCategories,
  formatBorderoMoney,
  type BorderoCategoryNode,
  type BorderoReport,
} from '@/domain/financeiro/bordero';

function collectExpandableIds(nodes: BorderoCategoryNode[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.itemCount > 0) into.add(node.id);
    collectExpandableIds(node.children, into);
  }
  return into;
}

export default function BorderoCategoryTable({ report }: { report: BorderoReport }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showEmpty, setShowEmpty] = useState(false);

  const rows = useMemo(
    () => flattenBorderoCategories(report.tree, { includeEmpty: showEmpty, isExpanded: id => expanded.has(id) }),
    [report.tree, showEmpty, expanded],
  );
  const allExpandable = useMemo(() => collectExpandableIds(report.tree, new Set()), [report.tree]);
  const everythingOpen = allExpandable.size > 0 && [...allExpandable].every(id => expanded.has(id));

  const toggle = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const isEmpty = report.items.length === 0;

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-border">
          <div>
            <h3 className="text-sm font-bold uppercase tracking-wider text-foreground">Contas a vencer</h3>
            <p className="text-xs text-muted-foreground">
              Agrupadas pelas categorias financeiras do DRE/DFC • {report.payableCount} conta(s) no período
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex items-center gap-2">
              <Switch id="bordero-show-empty" checked={showEmpty} onCheckedChange={setShowEmpty} />
              <Label htmlFor="bordero-show-empty" className="text-xs text-muted-foreground">Mostrar categorias sem vencimentos</Label>
            </div>
            {allExpandable.size > 0 && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setExpanded(everythingOpen ? new Set() : new Set(allExpandable))}
              >
                {everythingOpen ? 'Recolher tudo' : 'Expandir tudo'}
              </Button>
            )}
          </div>
        </div>

        {isEmpty && (
          <div className="flex items-center gap-3 px-4 py-4 border-b border-border text-sm text-muted-foreground" role="status">
            <Inbox className="w-5 h-5 shrink-0" />
            Não existem contas a vencer para este período.
          </div>
        )}

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Categoria / Fornecedor ou descrição</TableHead>
              <TableHead className="w-[120px]">Vencimento</TableHead>
              <TableHead className="text-right w-[170px]">Valor</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(({ node, depth, hasChildren }) => {
              const open = expanded.has(node.id);
              const showItems = open && node.items.length > 0;
              return (
                <Fragment key={node.id}>
                  <TableRow className={cn(depth === 0 && 'bg-background-subtle')}>
                    <TableCell style={{ paddingLeft: `${depth * 20 + 12}px` }}>
                      <div className="flex items-center gap-1">
                        {hasChildren ? (
                          <button
                            type="button"
                            onClick={() => toggle(node.id)}
                            aria-expanded={open}
                            aria-label={`${open ? 'Recolher' : 'Expandir'} ${node.name}`}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
                          >
                            {open ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="w-5" />
                        )}
                        <span className={cn(
                          depth === 0 ? 'font-bold text-sm uppercase tracking-wide' : 'font-medium text-sm',
                          node.itemCount === 0 && 'text-muted-foreground',
                        )}>
                          {node.name}
                        </span>
                        {node.nonOperational && depth === 0 && <Badge variant="warning" className="ml-2 text-[10px]">Não operacional</Badge>}
                        {!node.active && <Badge variant="neutral" className="ml-2 text-[10px]">Inativa</Badge>}
                      </div>
                    </TableCell>
                    <TableCell />
                    <TableCell className={cn(
                      'text-right font-mono tabular-nums',
                      depth === 0 ? 'font-bold' : 'font-medium',
                      node.itemCount === 0 && 'text-muted-foreground',
                    )}>
                      {formatBorderoMoney(node.amountCents)}
                    </TableCell>
                  </TableRow>
                  {showItems && node.items.map(item => (
                    <TableRow key={item.allocationId}>
                      <TableCell style={{ paddingLeft: `${(depth + 1) * 20 + 32}px` }}>
                        <div className="text-sm text-foreground">
                          {item.supplier && item.supplier !== item.description ? (
                            <><span className="font-medium">{item.supplier}</span><span className="text-muted-foreground"> — {item.description}</span></>
                          ) : (
                            <span>{item.description}</span>
                          )}
                          {item.status === 'AGUARDANDO_APROVACAO' && (
                            <Badge variant="info" className="ml-2 text-[10px]">{BORDERO_STATUS_LABEL[item.status]}</Badge>
                          )}
                          {item.split && <Badge variant="neutral" className="ml-2 text-[10px]">Rateio</Badge>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDateValueBR(item.dueDate)}</TableCell>
                      <TableCell className="text-right font-mono text-sm tabular-nums">{formatBorderoMoney(item.amountCents)}</TableCell>
                    </TableRow>
                  ))}
                </Fragment>
              );
            })}
          </TableBody>
          <TableFooter>
            <TableRow>
              <TableCell className="font-bold uppercase tracking-wide">Total a pagar</TableCell>
              <TableCell />
              <TableCell className="text-right font-mono font-bold text-base tabular-nums" data-testid="bordero-table-total">
                {formatBorderoMoney(report.totalPayableCents)}
              </TableCell>
            </TableRow>
          </TableFooter>
        </Table>
      </CardContent>
    </Card>
  );
}

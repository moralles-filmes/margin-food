import { Fragment, useId, useMemo, useState } from 'react';
import { ChevronDown, ChevronRight, Inbox } from 'lucide-react';
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import StatusBadge from '@/components/ui/StatusBadge';
import { cn } from '@/lib/utils';
import { formatDateValueBR } from '@/lib/datetime';
import {
  borderoEntrySituation,
  flattenBorderoCategories,
  formatBorderoMoney,
  type BorderoCategoryNode,
  type BorderoEntry,
  type BorderoReport,
} from '@/domain/financeiro/bordero';
import { useConteinerEstreito } from '../useConteinerEstreito';

function collectExpandableIds(nodes: BorderoCategoryNode[], into: Set<string>): Set<string> {
  for (const node of nodes) {
    if (node.itemCount > 0) into.add(node.id);
    collectExpandableIds(node.children, into);
  }
  return into;
}

const MONEY_CELL = 'text-right tabular-nums whitespace-nowrap';

/**
 * Abaixo desta largura do contêiner a tabela de cinco colunas vira lista (Redesign V2, Fase 06A).
 * Uma só marcação no DOM: a árvore abre e fecha e não se duplica (D64).
 */
const LIMITE_LISTA_PX = 720;

export default function BorderoCategoryTable({ report, todayISO }: { report: BorderoReport; todayISO: string }) {
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set());
  const [showEmpty, setShowEmpty] = useState(false);
  const switchId = useId();
  const tituloId = useId();
  const [conteinerRef, estreito] = useConteinerEstreito(LIMITE_LISTA_PX);

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

  const isEmpty = report.entries.length === 0;

  const abrirFechar = (node: BorderoCategoryNode, hasChildren: boolean, open: boolean) => hasChildren ? (
    <button
      type="button"
      onClick={() => toggle(node.id)}
      aria-expanded={open}
      aria-label={`${open ? 'Recolher' : 'Expandir'} ${node.name}`}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {open ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
    </button>
  ) : (
    <span aria-hidden="true" className="w-7 shrink-0" />
  );

  const selosDaCategoria = (node: BorderoCategoryNode, depth: number) => (
    <>
      {node.nonOperational && depth === 0 && <StatusBadge status="warning" label="Não operacional" className="ml-2" />}
      {!node.active && <StatusBadge status="neutral" label="Inativa" className="ml-2" />}
    </>
  );

  const parte = (item: BorderoEntry) => (
    item.supplier && item.supplier !== item.description ? (
      <><span className="font-medium">{item.supplier}</span><span className="text-muted-foreground"> — {item.description}</span></>
    ) : (
      <span>{item.description}</span>
    )
  );

  const selosDoItem = (item: BorderoEntry) => {
    const situation = borderoEntrySituation(item, todayISO);
    return (
      <>
        <StatusBadge status={situation.tone} label={situation.label} className="ml-2" />
        {item.split && <StatusBadge status="neutral" label="Rateio" className="ml-2" />}
      </>
    );
  };

  return (
    <section aria-labelledby={tituloId} className="overflow-hidden rounded-summary border bg-card shadow-card">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h3 id={tituloId} className="text-sm font-bold uppercase tracking-wider text-foreground">Despesas do período</h3>
          <p className="text-xs text-muted-foreground">
            Agrupadas pelas categorias financeiras do DRE/DFC • {report.paidCount} paga(s) • {report.payableCount} a vencer
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            <Switch id={switchId} checked={showEmpty} onCheckedChange={setShowEmpty} />
            <Label htmlFor={switchId} className="text-xs text-muted-foreground">Mostrar categorias sem despesas</Label>
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
          <Inbox aria-hidden="true" className="w-5 h-5 shrink-0" />
          Não existem despesas para este período.
        </div>
      )}

      <div ref={conteinerRef}>
        {estreito ? (
          <>
            <ul aria-label="Despesas do período por categoria">
              {rows.map(({ node, depth, hasChildren }) => {
                const open = expanded.has(node.id);
                const showItems = open && node.items.length > 0;
                const vazio = node.itemCount === 0;
                return (
                  <li key={node.id} className={cn('border-t first:border-t-0', depth === 0 && 'bg-background-subtle')}>
                    <div className="px-3 py-2.5">
                      <div className="flex items-start gap-1" style={{ paddingLeft: `${depth * 12}px` }}>
                        {abrirFechar(node, hasChildren, open)}
                        <p className={cn('min-w-0 flex-1 break-words pt-1', depth === 0 ? 'text-sm font-bold uppercase tracking-wide' : 'text-sm font-medium', vazio && 'text-muted-foreground')}>
                          {node.name}
                          {selosDaCategoria(node, depth)}
                        </p>
                      </div>
                      <dl className="mt-1.5 grid grid-cols-3 gap-2 text-xs" style={{ paddingLeft: `${depth * 12 + 32}px` }}>
                        <div>
                          <dt className="text-muted-foreground">Pagas</dt>
                          <dd className="whitespace-nowrap tabular-nums text-foreground">{formatBorderoMoney(node.paidCents)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">A vencer</dt>
                          <dd className="whitespace-nowrap tabular-nums text-foreground">{formatBorderoMoney(node.openCents)}</dd>
                        </div>
                        <div className="text-right">
                          <dt className="text-muted-foreground">Total</dt>
                          <dd className={cn('whitespace-nowrap font-semibold tabular-nums', vazio ? 'text-muted-foreground' : 'text-foreground')}>{formatBorderoMoney(node.amountCents)}</dd>
                        </div>
                      </dl>
                    </div>
                    {showItems && (
                      <ul aria-label={`Despesas de ${node.name}`} className="border-t">
                        {node.items.map(item => (
                          <li key={`${item.settlement}:${item.allocationId}`} className="border-t px-3 py-2 first:border-t-0" style={{ paddingLeft: `${(depth + 1) * 12 + 44}px` }}>
                            <p className="break-words text-sm text-foreground">{parte(item)}</p>
                            <p className="mt-0.5">{selosDoItem(item)}</p>
                            <p className="mt-1 flex flex-wrap items-baseline justify-between gap-2 text-xs">
                              <span className="tabular-nums text-muted-foreground">{formatDateValueBR(item.referenceDate)}</span>
                              <span className="whitespace-nowrap font-medium tabular-nums text-foreground">
                                {item.settlement === 'paid' ? 'Paga' : 'A vencer'}: {formatBorderoMoney(item.amountCents)}
                              </span>
                            </p>
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
            </ul>
            <div className="border-t bg-muted px-3 py-3">
            <p className="mb-2 text-sm font-bold uppercase tracking-wide text-foreground">Total de contas</p>
            <dl className="grid grid-cols-3 gap-2 text-xs">
              <div>
                <dt className="text-muted-foreground">Pagas</dt>
                <dd className="whitespace-nowrap font-bold tabular-nums text-foreground" data-testid="bordero-table-paid">{formatBorderoMoney(report.totalPaidCents)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">A vencer</dt>
                <dd className="whitespace-nowrap font-bold tabular-nums text-foreground" data-testid="bordero-table-open">{formatBorderoMoney(report.totalPayableCents)}</dd>
              </div>
              <div className="text-right">
                <dt className="text-muted-foreground">Total</dt>
                <dd className="whitespace-nowrap text-sm font-bold tabular-nums text-foreground" data-testid="bordero-table-total">{formatBorderoMoney(report.totalExpenseCents)}</dd>
              </div>
            </dl>
            </div>
          </>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Categoria / Fornecedor ou descrição</TableHead>
                <TableHead className="w-[110px]">Data</TableHead>
                <TableHead className="text-right w-[140px]">Pagas</TableHead>
                <TableHead className="text-right w-[140px]">A vencer</TableHead>
                <TableHead className="text-right w-[150px]">Total</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map(({ node, depth, hasChildren }) => {
                const open = expanded.has(node.id);
                const showItems = open && node.items.length > 0;
                const weight = depth === 0 ? 'font-bold' : 'font-medium';
                const muted = node.itemCount === 0 && 'text-muted-foreground';
                return (
                  <Fragment key={node.id}>
                    <TableRow className={cn(depth === 0 && 'bg-background-subtle')}>
                      <TableCell className="py-2" style={{ paddingLeft: `${depth * 20 + 8}px` }}>
                        <div className="flex items-center gap-1">
                          {abrirFechar(node, hasChildren, open)}
                          <span className={cn(
                            depth === 0 ? 'font-bold text-sm uppercase tracking-wide' : 'font-medium text-sm',
                            muted,
                          )}>
                            {node.name}
                          </span>
                          {selosDaCategoria(node, depth)}
                        </div>
                      </TableCell>
                      <TableCell />
                      <TableCell className={cn(MONEY_CELL, weight, 'text-muted-foreground')}>{formatBorderoMoney(node.paidCents)}</TableCell>
                      <TableCell className={cn(MONEY_CELL, weight, 'text-muted-foreground')}>{formatBorderoMoney(node.openCents)}</TableCell>
                      <TableCell className={cn(MONEY_CELL, weight, muted)}>{formatBorderoMoney(node.amountCents)}</TableCell>
                    </TableRow>
                    {showItems && node.items.map(item => {
                      const amount = formatBorderoMoney(item.amountCents);
                      return (
                        <TableRow key={`${item.settlement}:${item.allocationId}`}>
                          <TableCell style={{ paddingLeft: `${(depth + 1) * 20 + 36}px` }}>
                            <div className="text-sm text-foreground">
                              {parte(item)}
                              {selosDoItem(item)}
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">{formatDateValueBR(item.referenceDate)}</TableCell>
                          <TableCell className={cn(MONEY_CELL, 'text-sm')}>{item.settlement === 'paid' ? amount : ''}</TableCell>
                          <TableCell className={cn(MONEY_CELL, 'text-sm')}>{item.settlement === 'open' ? amount : ''}</TableCell>
                          <TableCell className={cn(MONEY_CELL, 'text-sm')}>{amount}</TableCell>
                        </TableRow>
                      );
                    })}
                  </Fragment>
                );
              })}
            </TableBody>
            <TableFooter>
              <TableRow>
                <TableCell className="font-bold uppercase tracking-wide">Total de contas</TableCell>
                <TableCell />
                <TableCell className={cn(MONEY_CELL, 'font-bold')} data-testid="bordero-table-paid">{formatBorderoMoney(report.totalPaidCents)}</TableCell>
                <TableCell className={cn(MONEY_CELL, 'font-bold')} data-testid="bordero-table-open">{formatBorderoMoney(report.totalPayableCents)}</TableCell>
                <TableCell className={cn(MONEY_CELL, 'font-bold text-base')} data-testid="bordero-table-total">
                  {formatBorderoMoney(report.totalExpenseCents)}
                </TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        )}
      </div>
    </section>
  );
}

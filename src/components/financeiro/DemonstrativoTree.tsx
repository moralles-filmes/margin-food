import { useEffect, useMemo, useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import EmptyState from '@/components/ui/EmptyState';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, ChevronDown, FolderTree } from 'lucide-react';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import { buildTree, type CatNode } from './CadastroBaseTree';
import { FinNote } from './finV2Layout';
import { useConteinerEstreito } from './useConteinerEstreito';
import { cn } from '@/lib/utils';

/**
 * Abaixo desta largura do contêiner a tabela (Descrição · Valor · %) vira lista: com o recuo da
 * hierarquia, o valor e o percentual não cabem em três colunas no celular (Redesign V2, Fase 06A).
 * Uma só marcação no DOM: a árvore abre e fecha nós e não se duplica (D64).
 */
const LIMITE_LISTA_PX = 600;

interface DemonstrativoTreeProps {
  categorias: any[];
  lancamentos: any[];
  rateios: any[];
  loading: boolean;
  showPctReceita?: boolean;
  /** DFC mode: show saldo inicial / acumulado */
  saldoInicial?: number;
  isDFC?: boolean;
  /** DFC: false omite SALDO INICIAL e SALDO ACUMULADO (o saldo é da empresa, não de um recorte). */
  mostrarSaldo?: boolean;
}

interface RowData {
  id: string;
  codigo: string;
  nome: string;
  valor: number;
  depth: number;
  hasChildren: boolean;
  tipo: string;
  isSectionHeader?: boolean;
  isTotalRow?: boolean;
  isInformational?: boolean;
  hideValue?: boolean;
}

export default function DemonstrativoTree({
  categorias,
  lancamentos,
  rateios,
  loading,
  showPctReceita = false,
  saldoInicial = 0,
  isDFC = false,
  mostrarSaldo = true,
}: DemonstrativoTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['_receitas', '_despesas']));

  // Auto-expand top-level categories when categorias change
  useEffect(() => {
    if (categorias.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.add('_receitas');
        next.add('_despesas');
        categorias.filter(c => !c.parent_id).forEach(c => next.add(c.id));
        return next;
      });
    }
  }, [categorias]);

  const { rows, receitaTotal } = useMemo(() => {
    const tree = buildTree(categorias);
    if (tree.length === 0) return { rows: [] as RowData[], receitaTotal: 0 };

    // Build effective values per category
    const lancIdsWithRateio = new Set(rateios.map((r: any) => r.lancamento_id));
    const valorPorCategoria: Record<string, number> = {};

    rateios.forEach((r: any) => {
      const catId = r.categoria_id || 'sem';
      valorPorCategoria[catId] = (valorPorCategoria[catId] || 0) + Number(r.valor);
    });

    lancamentos.filter(l => !lancIdsWithRateio.has(l.id)).forEach(l => {
      const catId = l.categoria_id || 'sem';
      valorPorCategoria[catId] = (valorPorCategoria[catId] || 0) + Number(l.valor);
    });

    const calcNodeValue = (node: CatNode): number => {
      let own = valorPorCategoria[node.id] || 0;
      for (const child of node.children) {
        own += calcNodeValue(child);
      }
      return own;
    };

    const receitaNodes = tree.filter(n => n.tipo === 'receita' && !n.excluir_dos_totais);
    const despesaNodes = tree.filter(n => n.tipo === 'despesa' && !n.excluir_dos_totais);
    const receitaNaoOperacional = tree.filter(n => n.tipo === 'receita' && n.excluir_dos_totais);
    const despesaNaoOperacional = tree.filter(n => n.tipo === 'despesa' && n.excluir_dos_totais);

    const recTotal = receitaNodes.reduce((s, n) => s + calcNodeValue(n), 0);
    const despTotal = despesaNodes.reduce((s, n) => s + calcNodeValue(n), 0);

    const result: RowData[] = [];

    const flatten = (nodes: CatNode[], depth: number, sign: 1 | -1, isInformational = false) => {
      for (const node of nodes) {
        const valor = calcNodeValue(node);
        result.push({
          id: node.id,
          codigo: node.codigo,
          nome: node.nome,
          valor: sign * valor,
          depth,
          hasChildren: node.children.length > 0,
          tipo: node.tipo,
          isInformational,
        });
        if (expanded.has(node.id) && node.children.length > 0) {
          flatten(node.children, depth + 1, sign, isInformational);
        }
      }
    };

    // — SALDO INICIAL (DFC only) —
    if (isDFC && mostrarSaldo) {
      result.push({
        id: '_saldo_inicial',
        codigo: '',
        nome: 'SALDO INICIAL',
        valor: saldoInicial,
        depth: 0,
        hasChildren: false,
        tipo: 'total',
        isTotalRow: true,
      });
    }

    // — TOTAL DE RECEITAS / RECEBIMENTOS block —
    result.push({
      id: '_receitas',
      codigo: '',
      nome: isDFC ? 'TOTAL DE RECEBIMENTOS' : 'TOTAL DE RECEITAS',
      valor: recTotal,
      depth: 0,
      hasChildren: receitaNodes.length > 0,
      tipo: 'receita',
      isSectionHeader: true,
    });
    if (expanded.has('_receitas')) {
      flatten(receitaNodes, 1, 1);
    }

    // — TOTAL DE DESPESAS / PAGAMENTOS block —
    result.push({
      id: '_despesas',
      codigo: '',
      nome: isDFC ? 'TOTAL DE PAGAMENTOS' : 'TOTAL DE DESPESAS',
      valor: -despTotal,
      depth: 0,
      hasChildren: despesaNodes.length > 0,
      tipo: 'despesa',
      isSectionHeader: true,
    });
    if (expanded.has('_despesas')) {
      flatten(despesaNodes, 1, -1);
    }

    // — RESULTADO LÍQUIDO / SALDO ACUMULADO —
    const resultadoLiquido = recTotal - despTotal;
    if (isDFC) {
      result.push({
        id: '_resultado_liquido',
        codigo: '',
        nome: 'RESULTADO LÍQUIDO DO PERÍODO',
        valor: resultadoLiquido,
        depth: 0,
        hasChildren: false,
        tipo: 'total',
        isSectionHeader: true,
        isTotalRow: false,
      });
      if (mostrarSaldo) {
        result.push({
          id: '_resultado',
          codigo: '',
          nome: 'SALDO ACUMULADO',
          valor: saldoInicial + resultadoLiquido,
          depth: 0,
          hasChildren: false,
          tipo: 'total',
          isTotalRow: true,
        });
      }
    } else {
      result.push({
        id: '_resultado',
        codigo: '',
        nome: 'RESULTADO DO PERÍODO',
        valor: resultadoLiquido,
        depth: 0,
        hasChildren: false,
        tipo: 'total',
        isTotalRow: true,
      });
    }

    if (receitaNaoOperacional.length > 0 || despesaNaoOperacional.length > 0) {
      result.push({
        id: '_nao_operacionais',
        codigo: '',
        nome: 'VALORES NÃO OPERACIONAIS — NÃO COMPÕEM OS TOTAIS',
        valor: 0,
        depth: 0,
        hasChildren: false,
        tipo: 'informativo',
        isSectionHeader: true,
        isInformational: true,
        hideValue: true,
      });
      flatten(receitaNaoOperacional, 1, 1, true);
      flatten(despesaNaoOperacional, 1, -1, true);
    }

    return { rows: result, receitaTotal: recTotal };
  }, [categorias, lancamentos, rateios, expanded, isDFC, saldoInicial, mostrarSaldo]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const [conteinerRef, estreito] = useConteinerEstreito(LIMITE_LISTA_PX);
  const pctLabel = isDFC ? '% Recebimentos' : '% Receita Líq.';

  if (loading) {
    return (
      <div role="status" className="space-y-2 rounded-summary border bg-card p-4">
        <span className="sr-only">Carregando o demonstrativo…</span>
        {Array.from({ length: 8 }).map((_, i) => <Skeleton key={i} aria-hidden="true" className="h-8 w-full" />)}
      </div>
    );
  }

  if (rows.length === 0) {
    return (
      <EmptyState
        icon={FolderTree}
        title="Nenhuma categoria cadastrada"
        description="Configure a estrutura em Cadastros Base primeiro."
      />
    );
  }

  // Mesma regra de antes: % sobre a receita/recebimento do próprio demonstrativo, com sinal só nas
  // linhas de total; sem receita no período, a coluna fica em "—".
  const linhas = rows.map(row => {
    const valor = row.valor === 0 ? 0 : row.valor; // -0 (categoria zerada na seção de despesas) não vira "-R$0,00"
    const pctReceita = showPctReceita && receitaTotal > 0 && !row.isInformational
      ? formatPercentBR((Math.abs(valor) / receitaTotal) * 100)
      : '—';
    const pctResult = showPctReceita && receitaTotal > 0 && row.isTotalRow
      ? formatPercentBR((valor / receitaTotal) * 100)
      : pctReceita;
    return { row, valor, pct: row.isTotalRow ? pctResult : pctReceita, aberto: expanded.has(row.id) };
  });

  const corDoValor = (valor: number) => (valor >= 0 ? 'text-success' : 'text-destructive');
  const fundoDaLinha = (row: RowData) => cn(
    row.isTotalRow && 'bg-primary-soft border-t-2 border-primary-border',
    row.isSectionHeader && !row.isInformational && 'bg-muted border-t-2 border-border',
    row.isInformational && 'bg-warning-soft',
    row.isInformational && row.isSectionHeader && 'border-t-2 border-warning-border',
  );
  const pesoDoNome = (row: RowData) => cn(
    row.isSectionHeader && 'font-bold text-sm uppercase tracking-wider',
    row.isTotalRow && 'font-bold text-base',
    row.depth === 1 && !row.isSectionHeader && !row.isTotalRow && 'font-semibold text-xs uppercase tracking-wider',
    row.depth > 1 && !row.isTotalRow && 'font-medium text-sm',
  );
  const pesoDoValor = (row: RowData) => cn(
    (row.isTotalRow || row.isSectionHeader) && 'font-bold text-base',
    row.depth === 1 && !row.isSectionHeader && 'font-semibold',
  );

  const abrirFechar = (row: RowData, aberto: boolean) => row.hasChildren ? (
    <button
      type="button"
      onClick={() => toggleExpand(row.id)}
      aria-expanded={aberto}
      aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${row.nome}`}
      className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      {aberto ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
    </button>
  ) : (
    <span aria-hidden="true" className="w-7 shrink-0" />
  );

  const nome = (row: RowData) => (
    <span className={cn('min-w-0 break-words', pesoDoNome(row))}>
      {row.codigo && <span className="mr-1.5 font-mono text-xs font-normal normal-case tracking-normal text-muted-foreground">{row.codigo}</span>}
      {row.nome}
    </span>
  );

  return (
    <div className="space-y-2">
      <div ref={conteinerRef} className="overflow-hidden rounded-summary border bg-card shadow-card">
        {estreito ? (
          <>
            <div className="flex items-center justify-between gap-3 border-b bg-muted px-3 py-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              <span>Descrição</span>
              <span className="text-right">Valor (R$){showPctReceita && <> · {pctLabel}</>}</span>
            </div>
            <ul aria-label={isDFC ? 'Demonstração de fluxo de caixa' : 'Demonstrativo de resultado'}>
              {linhas.map(({ row, valor, pct, aberto }) => (
                <li key={row.id} className={cn('border-t px-3 py-2 first:border-t-0', fundoDaLinha(row))}>
                  <div className="flex items-start gap-1" style={{ paddingLeft: `${row.depth * 12}px` }}>
                    {abrirFechar(row, aberto)}
                    <div className="min-w-0 flex-1 pt-1">{nome(row)}</div>
                  </div>
                  <p className="mt-1 flex flex-wrap items-baseline justify-end gap-x-3 gap-y-0.5 text-right">
                    <span className={cn('whitespace-nowrap tabular-nums', pesoDoValor(row), !row.hideValue && corDoValor(valor))}>
                      <span className="sr-only">Valor: </span>{row.hideValue ? '—' : fmtBRL(valor)}
                    </span>
                    {showPctReceita && (
                      <span className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
                        <span className="sr-only">{pctLabel}: </span>{pct}
                      </span>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Descrição</TableHead>
                <TableHead className="w-[190px] text-right">Valor (R$)</TableHead>
                {showPctReceita && <TableHead className="w-[140px] text-right">{pctLabel}</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {linhas.map(({ row, valor, pct, aberto }) => (
                <TableRow key={row.id} className={fundoDaLinha(row)}>
                  <TableCell className="py-2" style={{ paddingLeft: `${row.depth * 20 + 8}px` }}>
                    <div className="flex items-center gap-1">
                      {abrirFechar(row, aberto)}
                      {nome(row)}
                    </div>
                  </TableCell>
                  <TableCell className={cn('whitespace-nowrap py-2 text-right tabular-nums', pesoDoValor(row), !row.hideValue && corDoValor(valor))}>
                    {row.hideValue ? '—' : fmtBRL(valor)}
                  </TableCell>
                  {showPctReceita && (
                    <TableCell className="whitespace-nowrap py-2 text-right text-sm tabular-nums text-muted-foreground">{pct}</TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
      {showPctReceita && receitaTotal <= 0 && (
        <FinNote>
          {isDFC
            ? 'Sem recebimentos no período: a coluna “% Recebimentos” não se aplica e fica em “—”.'
            : 'Sem receita no período: a coluna “% Receita Líq.” não se aplica e fica em “—”.'}
        </FinNote>
      )}
    </div>
  );
}

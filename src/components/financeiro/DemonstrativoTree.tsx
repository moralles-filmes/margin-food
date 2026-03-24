import { useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChevronRight, ChevronDown } from 'lucide-react';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import { buildTree, type CatNode } from './CadastroBaseTree';
import { cn } from '@/lib/utils';

interface DemonstrativoTreeProps {
  categorias: any[];
  lancamentos: any[];
  rateios: any[];
  loading: boolean;
  showPctReceita?: boolean;
  /** DFC mode: show saldo inicial / acumulado */
  saldoInicial?: number;
  isDFC?: boolean;
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
}

export default function DemonstrativoTree({
  categorias,
  lancamentos,
  rateios,
  loading,
  showPctReceita = false,
  saldoInicial = 0,
  isDFC = false,
}: DemonstrativoTreeProps) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['_receitas', '_despesas']));

  // Auto-expand top-level categories when categorias change
  useMemo(() => {
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

    const receitaNodes = tree.filter(n => n.tipo === 'receita');
    const despesaNodes = tree.filter(n => n.tipo === 'despesa');

    const recTotal = receitaNodes.reduce((s, n) => s + calcNodeValue(n), 0);
    const despTotal = despesaNodes.reduce((s, n) => s + calcNodeValue(n), 0);

    const result: RowData[] = [];

    const flatten = (nodes: CatNode[], depth: number, sign: 1 | -1) => {
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
        });
        if (expanded.has(node.id) && node.children.length > 0) {
          flatten(node.children, depth + 1, sign);
        }
      }
    };

    // — SALDO INICIAL (DFC only) —
    if (isDFC) {
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

    return { rows: result, receitaTotal: recTotal };
  }, [categorias, lancamentos, rateios, expanded, showPctReceita, isDFC, saldoInicial]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (loading) {
    return <Card><CardContent className="p-8 text-center text-muted-foreground">Carregando...</CardContent></Card>;
  }

  if (rows.length === 0) {
    return (
      <Card><CardContent className="p-8 text-center text-muted-foreground">
        <p className="font-medium">Nenhuma categoria cadastrada</p>
        <p className="text-sm">Configure a estrutura em Cadastros Base primeiro.</p>
      </CardContent></Card>
    );
  }

  return (
    <Card>
      <CardContent className="p-0">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Descrição</TableHead>
              <TableHead className="text-right w-[180px]">Valor (R$)</TableHead>
              {showPctReceita && <TableHead className="text-right w-[100px]">% Receita</TableHead>}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map(row => {
              const isPositive = row.valor >= 0;

              const pctReceita = showPctReceita && receitaTotal > 0
                ? formatPercentBR((Math.abs(row.valor) / receitaTotal) * 100)
                : '—';

              // For resultado row, show signed %
              const pctResult = showPctReceita && receitaTotal > 0 && row.isTotalRow
                ? formatPercentBR((row.valor / receitaTotal) * 100)
                : pctReceita;

              return (
                <TableRow
                  key={row.id}
                  className={cn(
                    row.isTotalRow && 'bg-primary/5 font-bold border-t-2 border-primary/20',
                    row.isSectionHeader && 'bg-muted/50 border-t border-border',
                  )}
                >
                  <TableCell
                    className={cn(
                      'flex items-center gap-1',
                      row.isSectionHeader && 'font-bold text-sm uppercase tracking-wider',
                      row.isTotalRow && 'font-bold text-base',
                      row.depth === 1 && !row.isSectionHeader && !row.isTotalRow && 'font-semibold text-xs uppercase tracking-wider',
                      row.depth > 1 && !row.isTotalRow && 'font-medium',
                    )}
                    style={{ paddingLeft: `${row.depth * 20 + 12}px` }}
                  >
                    {row.hasChildren ? (
                      <button
                        onClick={() => toggleExpand(row.id)}
                        className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted"
                      >
                        {expanded.has(row.id) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                      </button>
                    ) : (
                      <span className="w-5" />
                    )}
                    {row.codigo && <span className="font-mono text-xs text-muted-foreground mr-1">{row.codigo}</span>}
                    {row.nome}
                  </TableCell>
                  <TableCell className={cn(
                    'text-right font-mono',
                    (row.isTotalRow || row.isSectionHeader) && 'font-bold text-base',
                    row.depth === 1 && !row.isSectionHeader && 'font-semibold',
                    isPositive ? 'text-success' : 'text-destructive',
                  )}>
                    {fmtBRL(row.valor)}
                  </TableCell>
                  {showPctReceita && (
                    <TableCell className="text-right text-muted-foreground text-sm">
                      {row.isTotalRow ? pctResult : pctReceita}
                    </TableCell>
                  )}
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

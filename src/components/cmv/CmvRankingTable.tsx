import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { RefreshCw, ChevronDown } from 'lucide-react';
import type { RankingItem } from './types';
import { formatFixedBR, formatPercentBR, fmtBRL } from '@/lib/formatters';

function fmt(v: number) {
  return fmtBRL(v);
}

interface CmvRankingTableProps {
  ranking: RankingItem[];
  errorRanking: string | null;
  onRetry: () => void;
  hasMore?: boolean;
  loadingMore?: boolean;
  onLoadMore?: () => void;
  totalCount?: number;
}

export default function CmvRankingTable({ ranking, errorRanking, onRetry, hasMore, loadingMore, onLoadMore, totalCount }: CmvRankingTableProps) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center justify-between">
          <span>Top Itens — Maior Impacto no CMV</span>
          {totalCount != null && totalCount > 0 && (
            <span className="text-xs font-normal text-muted-foreground">
              {ranking.length} de {totalCount} itens
            </span>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {errorRanking ? (
          <div className="py-8 text-center">
            <p className="text-sm text-destructive mb-2">Falha ao carregar ranking</p>
            <Button variant="outline" size="sm" onClick={onRetry} className="gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" /> Tentar novamente
            </Button>
          </div>
        ) : (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>#</TableHead>
                  <TableHead>Item</TableHead>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right">Custo (R$)</TableHead>
                  <TableHead className="text-right">% CMV</TableHead>
                  <TableHead className="text-right">Qtd</TableHead>
                  <TableHead className="text-right">Custo Médio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {ranking.map((r, i) => (
                  <TableRow key={r.produtoId}>
                    <TableCell className="text-xs text-muted-foreground">{i + 1}</TableCell>
                    <TableCell className="text-sm font-medium">{r.nome}</TableCell>
                    <TableCell className="text-sm">{r.categoria}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(r.custoConsumido)}</TableCell>
                    <TableCell className="text-right text-sm font-medium">{formatPercentBR(r.percentCmv)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(r.quantidade)}</TableCell>
                    <TableCell className="text-right text-sm">{fmt(r.custoMedioSnapshot)}</TableCell>
                  </TableRow>
                ))}
                {ranking.length === 0 && !errorRanking && (
                  <TableRow><TableCell colSpan={7} className="text-center text-sm text-muted-foreground py-6">Sem dados</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
            {hasMore && onLoadMore && (
              <div className="flex justify-center py-3 border-t">
                <Button variant="ghost" size="sm" onClick={onLoadMore} disabled={loadingMore} className="gap-1.5">
                  <ChevronDown className="w-3.5 h-3.5" />
                  {loadingMore ? 'Carregando...' : 'Carregar mais'}
                </Button>
              </div>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

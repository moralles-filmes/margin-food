import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart as RPieChart, Pie, Cell } from 'recharts';
import CmvRankingTable from './CmvRankingTable';
import type { CmvResult, RankingItem } from './types';
import { fmtBRL, formatPercentBR } from '@/lib/formatters';
import { axisProps, gridProps, tooltipProps, SERIES_COLORS } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';

const COLORS = SERIES_COLORS;

function fmt(v: number) {
  return fmtBRL(v);
}

interface CmvTabsProps {
  cmvData: CmvResult;
  visibleSubtabs: string[];
  ranking: RankingItem[];
  errorRanking: string | null;
  onRetryRanking: () => void;
  rankingHasMore?: boolean;
  rankingLoadingMore?: boolean;
  onRankingLoadMore?: () => void;
  rankingTotalCount?: number;
}

export default function CmvTabs({ cmvData, visibleSubtabs, ranking, errorRanking, onRetryRanking, rankingHasMore, rankingLoadingMore, onRankingLoadMore, rankingTotalCount }: CmvTabsProps) {
  return (
    <Tabs defaultValue={visibleSubtabs.includes('categoria') ? 'categoria' : visibleSubtabs[0] || 'categoria'} className="space-y-4">
      <TabsList>
        {visibleSubtabs.includes('categoria') && <TabsTrigger value="categoria">Por Categoria</TabsTrigger>}
        {visibleSubtabs.includes('setor') && <TabsTrigger value="setor">Por Setor</TabsTrigger>}
        {visibleSubtabs.includes('top-itens') && <TabsTrigger value="item">Top Itens</TabsTrigger>}
        {visibleSubtabs.includes('semanal') && <TabsTrigger value="semanal">Semanal</TabsTrigger>}
      </TabsList>

      <TabsContent value="categoria">
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Custo por Categoria</CardTitle></CardHeader>
            <CardContent>
              {cmvData.cmvPorCategoria.length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <RPieChart>
                    <Pie data={cmvData.cmvPorCategoria} dataKey="custo" nameKey="categoria" cx="50%" cy="50%" outerRadius={80} label={(props) => { const { categoria, percentCmv } = props as unknown as { categoria: string; percentCmv: number }; return `${categoria} ${formatPercentBR(percentCmv)}`; }}>
                      {cmvData.cmvPorCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                    </Pie>
                    <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                  </RPieChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados no período</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Tabela</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Categoria</TableHead>
                    <TableHead className="text-right">Custo (R$)</TableHead>
                    <TableHead className="text-right">% CMV</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cmvData.cmvPorCategoria.map(c => (
                    <TableRow key={c.categoria}>
                      <TableCell className="text-sm">{c.categoria}</TableCell>
                      <TableCell className="text-right text-sm">{fmtBRL(c.custo)}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatPercentBR(c.percentCmv)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="setor">
        <div className="grid md:grid-cols-2 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Custo por Setor</CardTitle></CardHeader>
            <CardContent>
              {(cmvData.cmvPorSetor || []).length > 0 ? (
                <ResponsiveContainer width="100%" height={250}>
                  <BarChart data={cmvData.cmvPorSetor} layout="vertical">
                    <CartesianGrid {...gridProps} vertical horizontal={false} />
                    <XAxis type="number" {...axisProps} />
                    <YAxis dataKey="setor" type="category" {...axisProps} width={100} />
                    <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                    <Bar dataKey="custo" name="Custo" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados de setor no período</p>}
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm">Ranking por Setor</CardTitle></CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Setor</TableHead>
                    <TableHead className="text-right">Custo (R$)</TableHead>
                    <TableHead className="text-right">% Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(cmvData.cmvPorSetor || []).map((s: any) => (
                    <TableRow key={s.setor}>
                      <TableCell className="text-sm font-medium">{s.setor}</TableCell>
                      <TableCell className="text-right text-sm font-medium">{formatPercentBR(s.percentCmv)}</TableCell>
                    </TableRow>
                  ))}
                  {(cmvData.cmvPorSetor || []).length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-sm text-muted-foreground py-6">Sem dados</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>
      </TabsContent>

      <TabsContent value="item">
        <CmvRankingTable ranking={ranking} errorRanking={errorRanking} onRetry={onRetryRanking} hasMore={rankingHasMore} loadingMore={rankingLoadingMore} onLoadMore={onRankingLoadMore} totalCount={rankingTotalCount} />
      </TabsContent>

      <TabsContent value="semanal">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm">Custo Semanal (W1–W5)</CardTitle></CardHeader>
          <CardContent>
            {cmvData.cmvSemanal.length > 0 ? (
              <ResponsiveContainer width="100%" height={250}>
                <BarChart data={cmvData.cmvSemanal}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="semana" {...axisProps} />
                  <YAxis {...axisProps} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                  <Bar dataKey="custo" name="Custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            ) : <p className="text-sm text-muted-foreground text-center py-8">Sem dados</p>}
          </CardContent>
        </Card>
      </TabsContent>
    </Tabs>
  );
}

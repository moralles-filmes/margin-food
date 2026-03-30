import { useState, useEffect, useCallback, useMemo } from 'react';
import { todayBR } from '@/lib/datetime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { AlertTriangle, AlertCircle, RefreshCw, TrendingDown, DollarSign, ShieldAlert, CircleDot } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import EmptyState from '@/components/ui/EmptyState';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Cell, PieChart, Pie, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import { fmtBRL, fmtBRLCompact, formatFixedBR, formatPercentBR } from '@/lib/formatters';

interface RankedItem {
  produto_id: string; nome_produto: string; categoria: string; unidade_medida: string;
  consumo_total: number; custo_total: number; media_diaria: number;
  saldo_atual: number; estoque_minimo: number; cobertura_dias: number | null;
  status_estoque: 'ok' | 'atencao' | 'critico' | 'sem_estoque';
  sem_custo: boolean; total_saidas: number; ultima_saida: string | null;
}

interface AlertItem {
  produto_id: string; nome_produto: string; status_estoque: string;
  sem_custo: boolean; consumo_total: number; saldo_atual: number;
  cobertura_dias: number | null; unidade_medida: string;
}

interface TopConsumedData {
  items: RankedItem[];
  alertas: AlertItem[];
  categorias: { categoria: string; consumo_total: number; custo_total: number; qtd_itens: number }[];
  consumo_total: number; custo_total: number; itens_criticos: number; itens_sem_custo: number; dias_periodo: number;
}

const CHART_COLORS = [
  'hsl(221, 83%, 53%)', 'hsl(38, 92%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)',
  'hsl(190, 80%, 42%)', 'hsl(350, 80%, 55%)', 'hsl(60, 70%, 50%)', 'hsl(160, 60%, 40%)',
  'hsl(30, 70%, 50%)', 'hsl(300, 50%, 50%)',
];

const STATUS_CONFIG: Record<string, { label: string; color: string; badgeVariant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
  ok: { label: 'OK', color: 'hsl(142, 71%, 45%)', badgeVariant: 'default' },
  atencao: { label: 'Atenção', color: 'hsl(38, 92%, 50%)', badgeVariant: 'secondary' },
  critico: { label: 'Crítico', color: 'hsl(var(--destructive))', badgeVariant: 'destructive' },
  sem_estoque: { label: 'Sem Estoque', color: 'hsl(var(--muted-foreground))', badgeVariant: 'outline' },
};

const formatCurrency = fmtBRL;
const formatQty = (v: number) => formatFixedBR(v, 2);

const chartConfig: ChartConfig = { consumo_total: { label: 'Consumo', color: 'hsl(221, 83%, 53%)' } };

type PeriodPreset = '7' | '30' | '90' | 'custom';
type RankBy = 'quantity' | 'cost';

export default function StockTopConsumedSection({ categorias }: { categorias: string[] }) {
  const [data, setData] = useState<TopConsumedData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [rankBy, setRankBy] = useState<RankBy>('quantity');
  const [filterCategory, setFilterCategory] = useState('');

  const { startDate, endDate } = useMemo(() => {
    if (periodPreset === 'custom' && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    const today = todayBR();
    const endD = today;
    const d = new Date(today + 'T12:00:00');
    d.setDate(d.getDate() - Number(periodPreset === 'custom' ? 30 : periodPreset));
    const startD = d.toISOString().slice(0, 10);
    return { startDate: startD, endDate: endD };
  }, [periodPreset, customStart, customEnd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = {
        p_start_date: startDate,
        p_end_date: endDate,
        p_rank_by: rankBy,
        p_limit: 20,
        ...(filterCategory ? { p_category: filterCategory } : {}),
      } as { p_start_date: string; p_end_date: string; p_rank_by: string; p_limit: number; p_category?: string };
      const { data: raw, error: rpcError } = await supabase.rpc('get_stock_top_consumed', params);
      if (rpcError) {
        setError(rpcError.message);
      } else if (raw) {
        setData(raw as unknown as TopConsumedData);
      }
    } catch (e) {
      console.error('Erro ranking consumo:', e);
      setError('Falha ao carregar ranking de consumo');
    }
    setLoading(false);
  }, [startDate, endDate, rankBy, filterCategory]);

  useEffect(() => { fetchData(); }, [fetchData]);

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3">
        <div>
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Período</label>
          <Select value={periodPreset} onValueChange={(v) => setPeriodPreset(v as PeriodPreset)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="custom">Personalizado</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {periodPreset === 'custom' && (
          <>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium mb-1 block">De</label>
              <Input type="date" value={customStart} onChange={e => setCustomStart(e.target.value)} className="h-7 text-xs w-32" />
            </div>
            <div>
              <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Até</label>
              <Input type="date" value={customEnd} onChange={e => setCustomEnd(e.target.value)} className="h-7 text-xs w-32" />
            </div>
          </>
        )}
        <div>
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Ordenar por</label>
          <Select value={rankBy} onValueChange={(v) => setRankBy(v as RankBy)}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quantity">Quantidade</SelectItem>
              <SelectItem value="cost">Custo Total</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Categoria</label>
          <Select value={filterCategory || '__all__'} onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}>
            <SelectTrigger className="h-7 w-32 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="__all__">Todas</SelectItem>
              {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* Loading */}
      {loading && !data && (
        <div className="flex items-center justify-center py-12">
          <RefreshCw className="w-5 h-5 animate-spin text-muted-foreground" />
          <span className="ml-2 text-sm text-muted-foreground">Carregando ranking…</span>
        </div>
      )}

      {/* Error */}
      {error && (
        <Card className="bg-card border-destructive/30">
          <CardContent className="p-6 text-center">
            <AlertCircle className="w-8 h-8 mx-auto text-destructive mb-2" />
            <p className="text-sm text-destructive font-medium mb-2">Erro ao carregar ranking</p>
            <p className="text-xs text-muted-foreground mb-3">{error}</p>
            <Button variant="outline" size="sm" onClick={fetchData}>
              <RefreshCw className="w-3.5 h-3.5 mr-1.5" /> Tentar novamente
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Empty state — no consumption data */}
      {!loading && !error && data && (!data.items || data.items.length === 0) && (
        <EmptyState
          icon={TrendingDown}
          title="Nenhum consumo registrado no período"
          description="Este ranking é alimentado por movimentações de saída (consumo, perdas, transferências). Quando houver saídas registradas no período selecionado, os produtos mais consumidos aparecerão aqui automaticamente."
        />
      )}

      {/* Main content — only when there are items */}
      {!error && data && data.items && data.items.length > 0 && (<>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingDown className="w-4 h-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Consumo Total</span>
            </div>
            <p className="text-lg font-bold text-foreground">{formatQty(data.consumo_total)}</p>
            <p className="text-[10px] text-muted-foreground">{data.dias_periodo ?? 0} dias</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Custo Consumido</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data ? formatCurrency(data.custo_total) : '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertCircle className="w-4 h-4 text-destructive" />
              <span className="text-[10px] text-muted-foreground font-medium">Itens Críticos</span>
            </div>
            <p className="text-lg font-bold text-destructive">{data?.itens_criticos ?? '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <ShieldAlert className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">Sem Custo</span>
            </div>
            <p className="text-lg font-bold text-muted-foreground">{data?.itens_sem_custo ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Alerts */}
      {data?.alertas && data.alertas.length > 0 && (
        <Card className="bg-card border-destructive/30">
          <CardHeader className="p-3 pb-1">
            <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
              <AlertTriangle className="w-3.5 h-3.5 text-destructive" />
              Alertas Operacionais
            </CardTitle>
          </CardHeader>
          <CardContent className="p-3 pt-1">
            <div className="space-y-1.5">
              {data.alertas.slice(0, 8).map((a) => {
                const isCritical = a.status_estoque === 'critico' || a.status_estoque === 'sem_estoque';
                return (
                  <div key={a.produto_id} className="flex items-center gap-2 text-[11px]">
                    <CircleDot className={`w-3 h-3 flex-shrink-0 ${isCritical ? 'text-destructive' : a.sem_custo ? 'text-muted-foreground' : 'text-warning'}`} />
                    <span className="font-medium truncate max-w-[140px]">{a.nome_produto}</span>
                    {isCritical && <span className="text-destructive">Alto consumo + {a.status_estoque === 'sem_estoque' ? 'sem estoque' : 'estoque crítico'}</span>}
                    {!isCritical && a.status_estoque === 'atencao' && <span className="text-warning">Alto consumo + estoque baixo</span>}
                    {a.sem_custo && <span className="text-muted-foreground">• Sem custo</span>}
                    {a.cobertura_dias != null && <span className="text-muted-foreground ml-auto">~{a.cobertura_dias}d cobertura</span>}
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Chart */}
      <Card className="bg-card border-border">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">
            Top {Math.min(data?.items?.length ?? 10, 10)} — {rankBy === 'cost' ? 'Custo' : 'Quantidade'}
          </CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data?.items && data.items.length > 0 ? (
            <ChartContainer config={chartConfig} className="h-[260px] w-full">
              <BarChart
                data={data.items.slice(0, 10).map(i => ({
                  ...i,
                  display_value: rankBy === 'cost' ? i.custo_total : i.consumo_total,
                }))}
                layout="vertical"
                margin={{ left: 0, right: 16, top: 8, bottom: 8 }}
              >
                <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                <XAxis
                  type="number"
                  className="text-[9px]"
                  tick={{ fontSize: 9 }}
                  tickFormatter={rankBy === 'cost' ? (v) => fmtBRLCompact(v) : undefined}
                />
                <YAxis type="category" dataKey="nome_produto" width={100} className="text-[9px]" tick={{ fontSize: 9 }} />
                <ChartTooltip content={<ChartTooltipContent formatter={(v) => rankBy === 'cost' ? formatCurrency(Number(v)) : formatQty(Number(v))} />} />
                <Bar dataKey="display_value" radius={[0, 4, 4, 0]}>
                  {data.items.slice(0, 10).map((item, i) => {
                    const statusColor = STATUS_CONFIG[item.status_estoque]?.color || CHART_COLORS[i % CHART_COLORS.length];
                    const isAlert = item.status_estoque === 'critico' || item.status_estoque === 'sem_estoque';
                    return <Cell key={i} fill={isAlert ? statusColor : CHART_COLORS[i % CHART_COLORS.length]} />;
                  })}
                </Bar>
              </BarChart>
            </ChartContainer>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-8">Sem dados no período</p>
          )}
        </CardContent>
      </Card>

      {/* Pie Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top Quantity Pie */}
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Top Quantidade</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {(() => {
              const top = data.items.slice(0, 8);
              const othersTotal = data.items.slice(8).reduce((s, i) => s + i.consumo_total, 0);
              const pieData = top.map((i, idx) => ({ name: i.nome_produto, value: i.consumo_total, fill: CHART_COLORS[idx % CHART_COLORS.length] }));
              if (othersTotal > 0) pieData.push({ name: 'Outros', value: othersTotal, fill: 'hsl(var(--muted-foreground))' });
              return (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2} label={({ name, percent }) => `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${formatPercentBR(percent * 100, 0)}`} labelLine={false} className="text-[9px]">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatQty(v)} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>

        {/* Category Pie */}
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {(() => {
              const cats = (data.categorias || []).filter(c => c.consumo_total > 0).sort((a, b) => b.consumo_total - a.consumo_total);
              const topCats = cats.slice(0, 8);
              const othersTotal = cats.slice(8).reduce((s, c) => s + c.consumo_total, 0);
              const pieData = topCats.map((c, idx) => ({ name: c.categoria || 'Sem Categoria', value: c.consumo_total, fill: CHART_COLORS[idx % CHART_COLORS.length] }));
              if (othersTotal > 0) pieData.push({ name: 'Outros', value: othersTotal, fill: 'hsl(var(--muted-foreground))' });
              if (pieData.length === 0) return <p className="text-xs text-muted-foreground text-center py-8">Sem dados de categoria</p>;
              return (
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={90} innerRadius={40} paddingAngle={2} label={({ name, percent }) => `${name.length > 12 ? name.slice(0, 12) + '…' : name} ${formatPercentBR(percent * 100, 0)}`} labelLine={false} className="text-[9px]">
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => formatQty(v)} />
                    <Legend wrapperStyle={{ fontSize: '10px' }} />
                  </PieChart>
                </ResponsiveContainer>
              );
            })()}
          </CardContent>
        </Card>
      </div>

      {/* Ranking Table */}
      <Card className="bg-card border-border">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Ranking Detalhado</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data?.items && data.items.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8 w-8">#</TableHead>
                    <TableHead className="text-[10px] h-8">Produto</TableHead>
                    <TableHead className="text-[10px] h-8">Categoria</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Consumo</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Custo Total</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Média/Dia</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Cobertura</TableHead>
                    <TableHead className="text-[10px] h-8 text-center">Estoque</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.items.map((item, idx) => {
                    const sc = STATUS_CONFIG[item.status_estoque] || STATUS_CONFIG.ok;
                    return (
                      <TableRow key={item.produto_id}>
                        <TableCell className="text-[11px] py-1.5 font-bold text-muted-foreground">{idx + 1}</TableCell>
                        <TableCell className="text-[11px] py-1.5 font-medium max-w-[150px] truncate">
                          {item.nome_produto}
                          {item.sem_custo && <span className="ml-1 text-[9px] text-muted-foreground">(sem custo)</span>}
                        </TableCell>
                        <TableCell className="text-[11px] py-1.5 text-muted-foreground">{item.categoria || '—'}</TableCell>
                        <TableCell className="text-[11px] py-1.5 text-right tabular-nums font-medium">
                          {formatQty(item.consumo_total)} {item.unidade_medida}
                        </TableCell>
                        <TableCell className="text-[11px] py-1.5 text-right tabular-nums">{formatCurrency(item.custo_total)}</TableCell>
                        <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                          {formatQty(item.media_diaria)} {item.unidade_medida}
                        </TableCell>
                        <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                          {item.cobertura_dias != null ? `${item.cobertura_dias}d` : '—'}
                        </TableCell>
                        <TableCell className="text-[11px] py-1.5 text-center">
                          <Badge variant={sc.badgeVariant} className="text-[9px] px-1.5 py-0">
                            {sc.label}
                          </Badge>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum consumo registrado no período</p>
          )}
        </CardContent>
      </Card>
      </>)}
    </div>
  );
}

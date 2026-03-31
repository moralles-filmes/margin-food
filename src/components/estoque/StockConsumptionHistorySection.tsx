import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { TrendingDown, TrendingUp, Minus, RefreshCw, BarChart3, Package, DollarSign, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { formatFixedBR, formatDateBR, formatInBR, fmtBRL } from '@/lib/formatters';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, ResponsiveContainer, Cell } from 'recharts';

interface ConsumptionData {
  consumo_total: number;
  custo_total: number;
  itens_distintos: number;
  total_movimentacoes: number;
  timeline: { period: string; total_qty: number; total_cost: number }[];
  produtos: {
    produto_id: string; nome_produto: string; categoria: string; unidade_medida: string;
    consumo_total: number; custo_total: number; dias_com_consumo: number;
    media_diaria: number; media_semanal: number; ultimo_consumo: string;
  }[];
  top10: { nome_produto: string; consumo_total: number; unidade_medida: string; custo_total: number }[];
  categorias: { categoria: string; consumo_total: number; custo_total: number; qtd_itens: number }[];
}

const TOP_COLORS = [
  'hsl(221, 83%, 53%)', 'hsl(38, 92%, 50%)', 'hsl(142, 71%, 45%)', 'hsl(280, 65%, 60%)',
  'hsl(190, 80%, 42%)', 'hsl(350, 80%, 55%)', 'hsl(60, 70%, 50%)', 'hsl(160, 60%, 40%)',
  'hsl(30, 70%, 50%)', 'hsl(300, 50%, 50%)',
];

const formatCurrency = fmtBRL;
const formatQty = (v: number) => formatFixedBR(v, 2);

const chartConfigTimeline: ChartConfig = { total_qty: { label: 'Consumo', color: 'hsl(var(--primary))' } };
const chartConfigTop: ChartConfig = { consumo_total: { label: 'Consumo', color: 'hsl(221, 83%, 53%)' } };

type GroupBy = 'daily' | 'weekly' | 'monthly';
type PeriodPreset = '7' | '30' | '90' | 'custom';

export default function StockConsumptionHistorySection({ categorias }: { categorias: string[] }) {
  const [data, setData] = useState<ConsumptionData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('daily');
  const [filterCategory, setFilterCategory] = useState('');
  const [filterProduct, setFilterProduct] = useState('');

  const { startDate, endDate } = useMemo(() => {
    if (periodPreset === 'custom' && customStart && customEnd) {
      return { startDate: customStart, endDate: customEnd };
    }
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - Number(periodPreset === 'custom' ? 30 : periodPreset));
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [periodPreset, customStart, customEnd]);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        p_start_date: startDate,
        p_end_date: endDate,
        p_group_by: groupBy,
        ...(filterCategory ? { p_category: filterCategory } : {}),
        ...(filterProduct ? { p_product_id: filterProduct } : {}),
      } as { p_start_date: string; p_end_date: string; p_group_by: string; p_category?: string; p_product_id?: string };
      const { data: raw, error } = await supabase.rpc('get_stock_consumption_history', params);
      if (!error && raw) setData(raw as unknown as ConsumptionData);
    } catch (e) {
      console.error('Erro histórico consumo:', e);
    }
    setLoading(false);
  }, [startDate, endDate, groupBy, filterCategory, filterProduct]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatPeriodLabel = (period: string) => {
    const d = new Date(period + 'T12:00:00');
    if (groupBy === 'monthly') return formatInBR(d, 'MMM/yy');
    if (groupBy === 'weekly') return `Sem ${formatInBR(d, 'dd/MM')}`;
    return formatInBR(d, 'dd/MM');
  };

  // Unique products for filter dropdown
  const productOptions = useMemo(() => {
    if (!data?.produtos) return [];
    return data.produtos.map(p => ({ id: p.produto_id, name: p.nome_produto }));
  }, [data]);

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
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Agrupamento</label>
          <Select value={groupBy} onValueChange={(v) => setGroupBy(v as GroupBy)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="daily">Diário</SelectItem>
              <SelectItem value="weekly">Semanal</SelectItem>
              <SelectItem value="monthly">Mensal</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div>
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Categoria</label>
          <SearchableSelect
            value={filterCategory || '__all__'}
            onValueChange={(v) => setFilterCategory(v === '__all__' ? '' : v)}
            options={[{ value: '__all__', label: 'Todas' }, ...categorias.map(c => ({ value: c, label: c }))]}
            placeholder="Todas"
            searchPlaceholder="Buscar categoria..."
            className="h-7 w-32 text-xs"
          />
        </div>

        <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Itens Consumidos</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data?.itens_distintos ?? '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <BarChart3 className="w-4 h-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Movimentações</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data?.total_movimentacoes ?? '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Custo Total</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data ? formatCurrency(data.custo_total) : '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">Período</span>
            </div>
            <p className="text-sm font-bold text-foreground">
              {formatInBR(new Date(startDate + 'T12:00:00'), 'dd/MM')} – {formatInBR(new Date(endDate + 'T12:00:00'), 'dd/MM')}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timeline Chart */}
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Consumo no Período</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data?.timeline && data.timeline.length > 0 ? (
              <ChartContainer config={chartConfigTimeline} className="h-[220px] w-full">
                <LineChart data={data.timeline.map(t => ({ ...t, label: formatPeriodLabel(t.period) }))} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" className="text-[9px]" tick={{ fontSize: 9 }} />
                  <YAxis className="text-[9px]" tick={{ fontSize: 9 }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatQty(Number(v))} />} />
                  <Line type="monotone" dataKey="total_qty" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                </LineChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados no período</p>
            )}
          </CardContent>
        </Card>

        {/* Top 10 */}
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Top 10 Mais Consumidos</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data?.top10 && data.top10.length > 0 ? (
              <ChartContainer config={chartConfigTop} className="h-[220px] w-full">
                <BarChart data={data.top10.slice(0, 10)} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" className="text-[9px]" tick={{ fontSize: 9 }} />
                  <YAxis type="category" dataKey="nome_produto" width={90} className="text-[9px]" tick={{ fontSize: 9 }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v, name, item) => `${formatQty(Number(v))} ${(item?.payload as any)?.unidade_medida || ''}`} />} />
                  <Bar dataKey="consumo_total" radius={[0, 4, 4, 0]}>
                    {data.top10.slice(0, 10).map((_, i) => (
                      <Cell key={i} fill={TOP_COLORS[i % TOP_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Analytical Table */}
      <Card className="bg-card border-border">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Detalhamento por Produto</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data?.produtos && data.produtos.length > 0 ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8">Produto</TableHead>
                    <TableHead className="text-[10px] h-8">Categoria</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Consumo Total</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Média/Dia</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Média/Semana</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Custo Total</TableHead>
                    <TableHead className="text-[10px] h-8">Último Consumo</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.produtos.map((p) => (
                    <TableRow key={p.produto_id}>
                      <TableCell className="text-[11px] py-1.5 font-medium max-w-[150px] truncate">{p.nome_produto}</TableCell>
                      <TableCell className="text-[11px] py-1.5 text-muted-foreground">{p.categoria || '—'}</TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums font-medium">
                        {formatQty(p.consumo_total)} {p.unidade_medida}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                        {formatQty(p.media_diaria)} {p.unidade_medida}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                        {formatQty(p.media_semanal)} {p.unidade_medida}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                        {formatCurrency(p.custo_total)}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-muted-foreground">
                        {p.ultimo_consumo ? formatDateBR(new Date(p.ultimo_consumo + 'T12:00:00')) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhum consumo registrado no período</p>
          )}
        </CardContent>
      </Card>

      {/* Category summary */}
      {data?.categorias && data.categorias.length > 0 && (
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Consumo por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {data.categorias.map((c, i) => (
                <div key={c.categoria} className="p-2.5 rounded-lg bg-secondary/50 border border-border">
                  <p className="text-[10px] text-muted-foreground font-medium truncate">{c.categoria}</p>
                  <p className="text-sm font-bold text-foreground">{formatCurrency(c.custo_total)}</p>
                  <p className="text-[10px] text-muted-foreground">{c.qtd_itens} itens</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

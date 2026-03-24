import { useState, useEffect, useCallback, useMemo } from 'react';
import { todayBR } from '@/lib/datetime';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Trash2, RefreshCw, DollarSign, AlertTriangle, Package, Calendar } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, LineChart, Line, Cell, PieChart, Pie } from 'recharts';
import { fmtBRL, fmtBRLCompact } from '@/lib/money';
import { formatFixedBR } from '@/lib/formatters';

interface LossData {
  quantidade_total: number;
  valor_total: number;
  itens_distintos: number;
  total_registros: number;
  registros_sem_custo: number;
  dias_periodo: number;
  timeline: { period: string; total_qty: number; total_cost: number }[];
  produtos: {
    produto_id: string; nome_produto: string; categoria: string; unidade_medida: string;
    produto_ativo: boolean; quantidade_perdida: number; valor_perdido: number;
    total_registros: number; ultimo_registro: string; sem_custo: boolean; tipos_perda: string[];
  }[];
  categorias: { categoria: string; quantidade_perdida: number; valor_perdido: number; qtd_itens: number }[];
  tipos_perda: { tipo: string; quantidade: number; valor: number; registros: number }[];
  top10: { nome_produto: string; quantidade_perdida: number; valor_perdido: number; unidade_medida: string }[];
}

const CHART_COLORS = [
  'hsl(350, 80%, 55%)', 'hsl(38, 92%, 50%)', 'hsl(280, 65%, 60%)', 'hsl(221, 83%, 53%)',
  'hsl(190, 80%, 42%)', 'hsl(142, 71%, 45%)', 'hsl(60, 70%, 50%)', 'hsl(160, 60%, 40%)',
];

const formatCurrency = fmtBRL;
const formatQty = (v: number) => formatFixedBR(v, 2);

const chartConfigTimeline: ChartConfig = { total_cost: { label: 'Valor Perdido', color: 'hsl(350, 80%, 55%)' } };
const chartConfigTop: ChartConfig = { valor_perdido: { label: 'Valor', color: 'hsl(350, 80%, 55%)' } };

type PeriodPreset = '7' | '30' | '90' | 'custom';
type GroupBy = 'daily' | 'weekly' | 'monthly';
type OrderBy = 'quantity' | 'cost';

const LOSS_TYPE_OPTIONS = [
  { value: '__all__', label: 'Todas as saídas' },
  { value: 'all_losses', label: 'Apenas perdas' },
  { value: 'perda', label: 'Perda' },
  { value: 'descarte', label: 'Descarte' },
  { value: 'vencimento', label: 'Vencimento' },
  { value: 'avaria', label: 'Avaria' },
  { value: 'quebra', label: 'Quebra' },
];

export default function StockLossesSection({ categorias }: { categorias: string[] }) {
  const [data, setData] = useState<LossData | null>(null);
  const [loading, setLoading] = useState(true);
  const [periodPreset, setPeriodPreset] = useState<PeriodPreset>('30');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const [groupBy, setGroupBy] = useState<GroupBy>('daily');
  const [orderBy, setOrderBy] = useState<OrderBy>('cost');
  const [filterCategory, setFilterCategory] = useState('');
  const [lossType, setLossType] = useState('__all__');

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
    try {
      const params: Record<string, unknown> = {
        p_start_date: startDate,
        p_end_date: endDate,
        p_group_by: groupBy,
        p_order_by: orderBy,
      };
      if (filterCategory) params.p_category = filterCategory;
      if (lossType !== '__all__') params.p_loss_type = lossType;
      const { data: raw, error } = await supabase.rpc('get_stock_losses_report', params);
      if (!error && raw) setData(raw as unknown as LossData);
    } catch (e) {
      console.error('Erro relatório perdas:', e);
    }
    setLoading(false);
  }, [startDate, endDate, groupBy, orderBy, filterCategory, lossType]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const formatPeriodLabel = (period: string) => {
    const d = new Date(period + 'T00:00:00');
    if (groupBy === 'monthly') return d.toLocaleDateString('pt-BR', { month: 'short', year: '2-digit' });
    if (groupBy === 'weekly') return `Sem ${d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })}`;
    return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  };

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
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Tipo</label>
          <Select value={lossType} onValueChange={setLossType}>
            <SelectTrigger className="h-7 w-36 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              {LOSS_TYPE_OPTIONS.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-[10px] text-muted-foreground font-medium mb-1 block">Ordenar</label>
          <Select value={orderBy} onValueChange={(v) => setOrderBy(v as OrderBy)}>
            <SelectTrigger className="h-7 w-28 text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="quantity">Quantidade</SelectItem>
              <SelectItem value="cost">Valor</SelectItem>
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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <DollarSign className="w-4 h-4 text-destructive" />
              <span className="text-[10px] text-muted-foreground font-medium">Valor Perdido</span>
            </div>
            <p className="text-lg font-bold text-destructive">{data ? formatCurrency(data.valor_total) : '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Trash2 className="w-4 h-4 text-destructive" />
              <span className="text-[10px] text-muted-foreground font-medium">Qtd Perdida</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data ? formatQty(data.quantidade_total) : '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Package className="w-4 h-4 text-primary" />
              <span className="text-[10px] text-muted-foreground font-medium">Itens Afetados</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data?.itens_distintos ?? '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <Calendar className="w-4 h-4 text-muted-foreground" />
              <span className="text-[10px] text-muted-foreground font-medium">Registros</span>
            </div>
            <p className="text-lg font-bold text-foreground">{data?.total_registros ?? '—'}</p>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-3">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-warning" />
              <span className="text-[10px] text-muted-foreground font-medium">Sem Custo</span>
            </div>
            <p className="text-lg font-bold text-warning">{data?.registros_sem_custo ?? '—'}</p>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Timeline */}
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Perdas no Período</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data?.timeline && data.timeline.length > 0 ? (
              <ChartContainer config={chartConfigTimeline} className="h-[220px] w-full">
                <LineChart data={data.timeline.map(t => ({ ...t, label: formatPeriodLabel(t.period) }))} margin={{ left: 0, right: 8, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="label" className="text-[9px]" tick={{ fontSize: 9 }} />
                  <YAxis className="text-[9px]" tick={{ fontSize: 9 }} tickFormatter={(v) => fmtBRLCompact(v)} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => formatCurrency(Number(v))} />} />
                  <Line type="monotone" dataKey="total_cost" stroke="hsl(350, 80%, 55%)" strokeWidth={2} dot={{ r: 2 }} />
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
            <CardTitle className="text-sm font-semibold">Top Perdas — {orderBy === 'cost' ? 'Valor' : 'Quantidade'}</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data?.top10 && data.top10.length > 0 ? (
              <ChartContainer config={chartConfigTop} className="h-[220px] w-full">
                <BarChart data={data.top10} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" className="text-[9px]" tick={{ fontSize: 9 }}
                    tickFormatter={orderBy === 'cost' ? (v) => fmtBRLCompact(v) : undefined} />
                  <YAxis type="category" dataKey="nome_produto" width={100} className="text-[9px]" tick={{ fontSize: 9 }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(v) => orderBy === 'cost' ? formatCurrency(Number(v)) : formatQty(Number(v))} />} />
                  <Bar dataKey={orderBy === 'cost' ? 'valor_perdido' : 'quantidade_perdida'} radius={[0, 4, 4, 0]}>
                    {data.top10.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Loss type + Category breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Loss types */}
        {data?.tipos_perda && data.tipos_perda.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Tipo de Perda</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2">
                {data.tipos_perda.map((t, i) => (
                  <div key={t.tipo} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: CHART_COLORS[i % CHART_COLORS.length] }} />
                      <span className="text-xs font-medium">{t.tipo}</span>
                      <span className="text-[10px] text-muted-foreground">{t.registros} reg.</span>
                    </div>
                    <span className="text-xs font-bold text-foreground">{formatCurrency(t.valor)}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Categories */}
        {data?.categorias && data.categorias.length > 0 && (
          <Card className="bg-card border-border">
            <CardHeader className="p-4 pb-2">
              <CardTitle className="text-sm font-semibold">Perdas por Categoria</CardTitle>
            </CardHeader>
            <CardContent className="p-4 pt-0">
              <div className="space-y-2">
                {data.categorias.map((c, i) => (
                  <div key={c.categoria} className="flex items-center justify-between p-2 rounded-lg bg-secondary/50 border border-border">
                    <div>
                      <p className="text-xs font-medium">{c.categoria}</p>
                      <p className="text-[10px] text-muted-foreground">{c.qtd_itens} itens</p>
                    </div>
                    <div className="text-right">
                      <p className="text-xs font-bold text-foreground">{formatCurrency(c.valor_perdido)}</p>
                      <p className="text-[10px] text-muted-foreground">{formatQty(c.quantidade_perdida)}</p>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Detailed Table */}
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
                    <TableHead className="text-[10px] h-8 text-right">Qtd Perdida</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Valor Perdido</TableHead>
                    <TableHead className="text-[10px] h-8 text-center">Registros</TableHead>
                    <TableHead className="text-[10px] h-8">Tipos</TableHead>
                    <TableHead className="text-[10px] h-8">Último</TableHead>
                    <TableHead className="text-[10px] h-8 text-center">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.produtos.map((p) => (
                    <TableRow key={p.produto_id}>
                      <TableCell className="text-[11px] py-1.5 font-medium max-w-[150px] truncate">
                        {p.nome_produto}
                        {p.sem_custo && <span className="ml-1 text-[9px] text-warning">(sem custo)</span>}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-muted-foreground">{p.categoria || '—'}</TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums font-medium">
                        {formatQty(p.quantidade_perdida)} {p.unidade_medida}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums text-destructive font-medium">
                        {formatCurrency(p.valor_perdido)}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-center tabular-nums">{p.total_registros}</TableCell>
                      <TableCell className="text-[11px] py-1.5">
                        <div className="flex flex-wrap gap-0.5">
                          {p.tipos_perda.slice(0, 2).map(t => (
                            <Badge key={t} variant="secondary" className="text-[8px] px-1 py-0">{t}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-muted-foreground">
                        {p.ultimo_registro ? new Date(p.ultimo_registro).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : '—'}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-center">
                        <Badge variant={p.produto_ativo ? 'default' : 'outline'} className="text-[8px] px-1 py-0">
                          {p.produto_ativo ? 'Ativo' : 'Inativo'}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhuma perda registrada no período</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

import { useState, useEffect, useMemo, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, ReferenceLine, Area, ComposedChart } from 'recharts';
import { AlertTriangle, TrendingUp, TrendingDown, Minus, ShieldAlert, ShoppingCart, Activity, RefreshCw, Brain, Package, CalendarDays, Info, ChevronDown, ChevronUp } from 'lucide-react';
import { fmtBRL as fmtBRLMoney, formatDecimalBR } from '@/lib/formatters';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

import { useCan } from '@/permissions/hooks';
interface ForecastDay {
  day: number;
  dow: number;
  dow_label: string;
  previsao: number;
}

interface PredictiveItem {
  produto_id: string;
  nome_produto: string;
  categoria: string;
  unidade_medida: string;
  custo_unitario: number;
  saldo_atual: number;
  media_diaria_7d: number;
  media_diaria_30d: number;
  consumo_previsto_diario: number;
  previsao_amanha: number;
  previsao_7d: number;
  cobertura_dias: number;
  tendencia: 'subindo' | 'caindo' | 'estavel' | 'sem_dados';
  status_risco: 'ruptura_iminente' | 'critico' | 'atencao' | 'sem_risco' | 'sem_consumo';
  sugestao_compra: number;
  custo_estimado_compra: number;
  ruptura_em_dias: number | null;
  ruptura_data: string | null;
  dia_critico: string;
  has_seasonality: boolean;
  explicacao: string;
  serie_7d: ForecastDay[];
  perfil_dow: Record<string, { media: number; n: number }>;
}

interface PredictiveKpis {
  total_itens: number;
  ruptura_iminente: number;
  critico: number;
  atencao: number;
  sem_risco: number;
  sem_consumo: number;
  tendencia_subindo: number;
  valor_compras_sugeridas: number;
  itens_cobertura_abaixo_3d: number;
  ruptura_3d: number;
  pico_fds: number;
  com_sazonalidade: number;
}

interface Props {
  categorias: string[];
}

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: typeof AlertTriangle }> = {
  ruptura_iminente: { label: 'Ruptura Iminente', color: 'bg-destructive text-destructive-foreground', icon: ShieldAlert },
  critico: { label: 'Crítico', color: 'bg-destructive/80 text-destructive-foreground', icon: AlertTriangle },
  atencao: { label: 'Atenção', color: 'bg-warning text-warning-foreground', icon: AlertTriangle },
  sem_risco: { label: 'Sem Risco', color: 'bg-success/80 text-success-foreground', icon: Activity },
  sem_consumo: { label: 'Sem Consumo', color: 'bg-muted text-muted-foreground', icon: Minus },
};

const TENDENCIA_CONFIG: Record<string, { label: string; icon: typeof TrendingUp; className: string }> = {
  subindo: { label: 'Subindo', icon: TrendingUp, className: 'text-destructive' },
  caindo: { label: 'Caindo', icon: TrendingDown, className: 'text-success' },
  estavel: { label: 'Estável', icon: Minus, className: 'text-muted-foreground' },
  sem_dados: { label: 'Sem dados', icon: Minus, className: 'text-muted-foreground' },
};

const DOW_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

export default function StockPredictiveSection({
 categorias }: Props) {
  const canViewRbac = useCan('estoque:preditivo:view');
  const [items, setItems] = useState<PredictiveItem[]>([]);
  const [kpis, setKpis] = useState<PredictiveKpis | null>(null);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  // Filters
  const [filterCat, setFilterCat] = useState('');
  const [targetDays, setTargetDays] = useState(7);
  const [onlyCritical, setOnlyCritical] = useState(false);
  const [useWeekday, setUseWeekday] = useState(true);

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_stock_predictive_analysis_v2' as any, {
        p_category_id: filterCat || null,
        p_product_id: null,
        p_target_coverage_days: targetDays,
        p_only_critical: onlyCritical,
        p_use_weekday_pattern: useWeekday,
      });
      if (error) throw error;
      const result = data as any;
      setItems(result.items || []);
      setKpis(result.kpis || null);
    } catch (err: any) {
      toast.error(err.message || 'Erro ao carregar análise preditiva');
    }
    setLoading(false);
  }, [filterCat, targetDays, onlyCritical, useWeekday]);

  useEffect(() => { fetchData(); }, [fetchData]);

  const fmtQty = (v: number, unit: string) => `${formatDecimalBR(v, 1)} ${unit}`;
  const fmtBRL = (v: number) => fmtBRLMoney(v);

  // Top 10 critical items for bar chart
  const criticalChartData = useMemo(() =>
    items
      .filter(i => i.consumo_previsto_diario > 0 && i.cobertura_dias < 999)
      .slice(0, 10)
      .map(i => ({
        name: i.nome_produto.length > 16 ? i.nome_produto.slice(0, 16) + '…' : i.nome_produto,
        cobertura: Number(i.cobertura_dias),
      })),
    [items]
  );

  // Build stock projection chart for expanded item
  const projectionData = useMemo(() => {
    if (!expandedId) return [];
    const item = items.find(i => i.produto_id === expandedId);
    if (!item || !item.serie_7d?.length) return [];
    let running = item.saldo_atual;
    return [
      { label: 'Hoje', estoque: Math.round(running * 10) / 10, consumo: 0 },
      ...item.serie_7d.map((d: ForecastDay) => {
        running = Math.max(0, running - d.previsao);
        return {
          label: d.dow_label,
          estoque: Math.round(running * 10) / 10,
          consumo: d.previsao,
        };
      }),
    ];
  }, [expandedId, items]);

  const chartConfig = {
    cobertura: { label: 'Cobertura (dias)', color: 'hsl(var(--primary))' },
    estoque: { label: 'Estoque projetado', color: 'hsl(var(--primary))' },
    consumo: { label: 'Consumo previsto', color: 'hsl(var(--destructive))' },
  };

  if (!canViewRbac) return null;

  return (
    <TooltipProvider>
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <div>
            <h3 className="text-sm font-display font-bold text-foreground">Estoque Preditivo</h3>
            <p className="text-[10px] text-muted-foreground">Previsão com padrão semanal + histórico recente</p>
          </div>
        </div>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={fetchData} disabled={loading}>
          <RefreshCw className={`w-3 h-3 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
        </Button>
      </div>

      {/* KPI Cards */}
      {kpis && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <div className="bg-card border border-destructive/30 rounded-xl p-3 text-center">
            <ShieldAlert className="w-5 h-5 text-destructive mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-foreground">{kpis.ruptura_3d}</p>
            <p className="text-[10px] text-muted-foreground">Ruptura em até 3 dias</p>
          </div>
          <div className="bg-card border border-warning/30 rounded-xl p-3 text-center">
            <CalendarDays className="w-5 h-5 text-warning mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-foreground">{kpis.pico_fds}</p>
            <p className="text-[10px] text-muted-foreground">Pico previsto no FDS</p>
          </div>
          <div className="bg-card border border-primary/30 rounded-xl p-3 text-center">
            <TrendingUp className="w-5 h-5 text-primary mx-auto mb-1" />
            <p className="text-xl font-display font-bold text-foreground">{kpis.com_sazonalidade}</p>
            <p className="text-[10px] text-muted-foreground">Com sazonalidade</p>
          </div>
          <div className="bg-card border border-border rounded-xl p-3 text-center">
            <ShoppingCart className="w-5 h-5 text-muted-foreground mx-auto mb-1" />
            <p className="text-lg font-display font-bold text-foreground">{fmtBRL(kpis.valor_compras_sugeridas)}</p>
            <p className="text-[10px] text-muted-foreground">Compras sugeridas ({targetDays}d)</p>
          </div>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-2">
        <Select value={filterCat || 'all'} onValueChange={v => setFilterCat(v === 'all' ? '' : v)}>
          <SelectTrigger className="w-32 h-8 text-xs bg-secondary border-border"><SelectValue placeholder="Categoria" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todas</SelectItem>
            {categorias.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
        <Select value={String(targetDays)} onValueChange={v => setTargetDays(Number(v))}>
          <SelectTrigger className="w-36 h-8 text-xs bg-secondary border-border"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">Cobertura 3 dias</SelectItem>
            <SelectItem value="7">Cobertura 7 dias</SelectItem>
            <SelectItem value="15">Cobertura 15 dias</SelectItem>
            <SelectItem value="30">Cobertura 30 dias</SelectItem>
          </SelectContent>
        </Select>
        <div className="flex items-center gap-1.5">
          <Switch id="use-weekday" checked={useWeekday} onCheckedChange={setUseWeekday} />
          <Label htmlFor="use-weekday" className="text-xs text-muted-foreground cursor-pointer">Padrão semanal</Label>
        </div>
        <div className="flex items-center gap-1.5">
          <Switch id="only-critical-v2" checked={onlyCritical} onCheckedChange={setOnlyCritical} />
          <Label htmlFor="only-critical-v2" className="text-xs text-muted-foreground cursor-pointer">Somente críticos</Label>
        </div>
      </div>

      {/* Chart: Top critical */}
      {criticalChartData.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-4">
          <h4 className="text-xs font-semibold text-foreground mb-3">Top Itens com Menor Cobertura (dias)</h4>
          <ChartContainer config={chartConfig} className="h-[220px] w-full">
            <BarChart data={criticalChartData} layout="vertical" margin={{ left: 8, right: 16 }}>
              <CartesianGrid strokeDasharray="3 3" horizontal={false} />
              <XAxis type="number" tick={{ fontSize: 10 }} />
              <YAxis dataKey="name" type="category" width={120} tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <Bar dataKey="cobertura" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]} />
            </BarChart>
          </ChartContainer>
        </div>
      )}

      {/* Projection chart for expanded item */}
      {expandedId && projectionData.length > 0 && (
        <div className="bg-card border border-primary/20 rounded-xl p-4">
          <h4 className="text-xs font-semibold text-foreground mb-1">
            Projeção: {items.find(i => i.produto_id === expandedId)?.nome_produto}
          </h4>
          <p className="text-[10px] text-muted-foreground mb-3">
            {items.find(i => i.produto_id === expandedId)?.explicacao}
          </p>
          <ChartContainer config={chartConfig} className="h-[200px] w-full">
            <ComposedChart data={projectionData} margin={{ left: 0, right: 8 }}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <ChartTooltip content={<ChartTooltipContent />} />
              <ReferenceLine y={0} stroke="hsl(var(--destructive))" strokeDasharray="4 4" label={{ value: 'Ruptura', fontSize: 9, fill: 'hsl(var(--destructive))' }} />
              <Area type="monotone" dataKey="estoque" fill="hsl(var(--primary) / 0.15)" stroke="hsl(var(--primary))" strokeWidth={2} name="Estoque projetado" />
              <Bar dataKey="consumo" fill="hsl(var(--destructive) / 0.5)" radius={[3, 3, 0, 0]} name="Consumo previsto" />
            </ComposedChart>
          </ChartContainer>
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <RefreshCw className="w-6 h-6 animate-spin mx-auto text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">Calculando previsões…</p>
        </div>
      ) : items.length === 0 ? (
        <div className="bg-card border border-border rounded-xl p-8 text-center">
          <Package className="w-10 h-10 text-muted-foreground/30 mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Nenhum item encontrado.</p>
        </div>
      ) : (
        <div className="bg-card border border-border rounded-xl overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-[11px]">Produto</TableHead>
                <TableHead className="text-[11px] text-right">Saldo</TableHead>
                <TableHead className="text-[11px] text-right">Prev. Amanhã</TableHead>
                <TableHead className="text-[11px] text-right">Prev. 7d</TableHead>
                <TableHead className="text-[11px] text-right">Cobertura</TableHead>
                <TableHead className="text-[11px]">Tendência</TableHead>
                <TableHead className="text-[11px]">Status</TableHead>
                <TableHead className="text-[11px] text-right">Sugestão</TableHead>
                <TableHead className="text-[11px] text-center">Ruptura</TableHead>
                <TableHead className="text-[11px] w-8"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(item => {
                const sc = STATUS_CONFIG[item.status_risco] || STATUS_CONFIG.sem_consumo;
                const tc = TENDENCIA_CONFIG[item.tendencia] || TENDENCIA_CONFIG.sem_dados;
                const TIcon = tc.icon;
                const isExpanded = expandedId === item.produto_id;
                return (
                  <>
                  <TableRow key={item.produto_id} className="cursor-pointer" onClick={() => setExpandedId(isExpanded ? null : item.produto_id)}>
                    <TableCell className="py-2">
                      <div>
                        <p className="text-xs font-medium text-foreground truncate max-w-[140px]">{item.nome_produto}</p>
                        <div className="flex items-center gap-1">
                          <p className="text-[10px] text-muted-foreground">{item.categoria}</p>
                          {item.has_seasonality && (
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <CalendarDays className="w-3 h-3 text-primary" />
                              </TooltipTrigger>
                              <TooltipContent><p className="text-xs">Sazonalidade semanal detectada</p></TooltipContent>
                            </Tooltip>
                          )}
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">{fmtQty(item.saldo_atual, item.unidade_medida)}</TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {item.previsao_amanha > 0 ? fmtQty(item.previsao_amanha, item.unidade_medida) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {item.previsao_7d > 0 ? fmtQty(item.previsao_7d, item.unidade_medida) : '—'}
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums font-medium">
                      {item.consumo_previsto_diario > 0 ? `${item.cobertura_dias} d` : '∞'}
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center gap-0.5 text-[11px] ${tc.className}`}>
                        <TIcon className="w-3 h-3" />{tc.label}
                      </span>
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className={`text-[10px] ${sc.color}`}>{sc.label}</Badge>
                    </TableCell>
                    <TableCell className="text-right text-xs tabular-nums">
                      {item.sugestao_compra > 0 ? fmtQty(item.sugestao_compra, item.unidade_medida) : '—'}
                    </TableCell>
                    <TableCell className="text-center text-xs">
                      {item.ruptura_em_dias != null ? (
                        <span className="text-destructive font-medium">{item.dia_critico} ({item.ruptura_em_dias}d)</span>
                      ) : '—'}
                    </TableCell>
                    <TableCell className="text-center">
                      {isExpanded ? <ChevronUp className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />}
                    </TableCell>
                  </TableRow>
                  {/* Expanded detail row */}
                  {isExpanded && (
                    <TableRow key={`${item.produto_id}-detail`}>
                      <TableCell colSpan={10} className="bg-muted/30 py-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          {/* Prediction basis */}
                          <div className="space-y-2">
                            <div className="flex items-center gap-1">
                              <Info className="w-3 h-3 text-primary" />
                              <span className="text-[11px] font-medium text-foreground">Base da previsão</span>
                            </div>
                            <p className="text-[10px] text-muted-foreground">{item.explicacao}</p>
                            {item.custo_estimado_compra > 0 && (
                              <p className="text-[10px] text-muted-foreground">
                                Custo estimado da compra: <span className="font-medium text-foreground">{fmtBRL(item.custo_estimado_compra)}</span>
                              </p>
                            )}
                            {!item.has_seasonality && item.consumo_previsto_diario > 0 && (
                              <p className="text-[10px] text-warning">⚠ Histórico insuficiente para sazonalidade</p>
                            )}
                          </div>
                          {/* Weekday profile */}
                          {item.has_seasonality && item.perfil_dow && (
                            <div>
                              <p className="text-[11px] font-medium text-foreground mb-1">Perfil semanal</p>
                              <div className="flex items-end gap-1 h-12">
                                {DOW_LABELS.map((label, dow) => {
                                  const val = item.perfil_dow?.[String(dow)]?.media ?? 0;
                                  const maxVal = Math.max(...DOW_LABELS.map((_, d) => item.perfil_dow?.[String(d)]?.media ?? 0), 1);
                                  const pct = (val / maxVal) * 100;
                                  return (
                                    <Tooltip key={dow}>
                                      <TooltipTrigger asChild>
                                        <div className="flex-1 flex flex-col items-center gap-0.5">
                                          <div
                                            className="w-full rounded-t bg-primary/60 transition-all"
                                            style={{ height: `${Math.max(pct, 4)}%` }}
                                          />
                                          <span className="text-[8px] text-muted-foreground">{label}</span>
                                        </div>
                                      </TooltipTrigger>
                                      <TooltipContent>
                                        <p className="text-xs">{label}: {val.toFixed(1)} {item.unidade_medida}</p>
                                      </TooltipContent>
                                    </Tooltip>
                                  );
                                })}
                              </div>
                            </div>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                  </>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      {/* Summary footer */}
      {kpis && (
        <div className="text-[10px] text-muted-foreground text-center">
          {kpis.total_itens} itens • {kpis.com_sazonalidade} com sazonalidade • {kpis.sem_consumo} sem consumo • Horizonte: {targetDays}d
        </div>
      )}
    </div>
    </TooltipProvider>
  );
}

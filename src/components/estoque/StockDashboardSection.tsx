import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { DollarSign, Package, AlertTriangle, AlertCircle, TrendingDown, RefreshCw, ArrowDown, ArrowUp, Minus, Inbox } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import StockInactivityAlert from './StockInactivityAlert';
import { fmtBRL, fmtBRLCompact, formatDecimalBR, formatIntegerBR, parseUTCToBR } from '@/lib/formatters';
import KpiCard from '@/components/ui/KpiCard';
import StatusBadge from '@/components/ui/StatusBadge';
import type { StockHealthStatus } from '@/domain/estoque/rules';

import { useCan } from '@/permissions/hooks';
interface DashboardCategory {
  categoria: string;
  valor: number;
  qtd_itens: number;
}

interface DashboardMovement {
  id: string;
  data: string;
  produto: string;
  tipo: string;
  quantidade: number;
  custo_total: number;
  direction: string | null;
}

interface DashboardData {
  valor_total: number;
  total_produtos: number;
  produtos_com_saldo: number;
  ok: number;
  atencao: number;
  critico: number;
  sem_estoque: number;
  sem_custo: number;
  categorias: DashboardCategory[];
  movimentacoes: DashboardMovement[];
}

/** Central mapping: dashboard card → target sub-tab + filter */
const CARD_NAV_MAP: Record<string, { target: string; filter: StockHealthStatus | '' }> = {
  estoque_baixo: { target: 'saldo', filter: 'atencao' },
  critico: { target: 'saldo', filter: 'critico' },
  sem_estoque: { target: 'saldo', filter: 'sem_estoque' },
  ok: { target: 'saldo', filter: 'ok' },
};

/** Pie chart legend name → StockHealthStatus */
const PIE_NAME_TO_STATUS: Record<string, StockHealthStatus> = {
  OK: 'ok',
  'Atenção': 'atencao',
  'Crítico': 'critico',
  'Sem Estoque': 'sem_estoque',
};

const STATUS_COLORS = [
  'hsl(var(--success, 142 71% 45%))',
  'hsl(var(--warning, 38 92% 50%))',
  'hsl(var(--destructive))',
  'hsl(var(--muted-foreground))',
];

const PIE_COLORS = [
  'hsl(221, 83%, 53%)',
  'hsl(38, 92%, 50%)',
  'hsl(142, 71%, 45%)',
  'hsl(280, 65%, 60%)',
  'hsl(190, 80%, 42%)',
  'hsl(350, 80%, 55%)',
  'hsl(60, 70%, 50%)',
  'hsl(160, 60%, 40%)',
];

const formatCurrency = fmtBRL;

const chartConfigCat: ChartConfig = { valor: { label: 'Valor', color: 'hsl(221, 83%, 53%)' } };
const chartConfigStatus: ChartConfig = {
  ok: { label: 'OK', color: STATUS_COLORS[0] },
  atencao: { label: 'Atenção', color: STATUS_COLORS[1] },
  critico: { label: 'Crítico', color: STATUS_COLORS[2] },
  sem_estoque: { label: 'Sem Estoque', color: STATUS_COLORS[3] },
};

interface Props {
  categorias: string[];
  onNavigate?: (subTab: string, statusFilter?: StockHealthStatus | '') => void;
}

function toNumber(value: unknown): number {
  return typeof value === 'number' ? value : Number(value) || 0;
}

function normalizeDashboardData(raw: unknown): DashboardData | null {
  if (!raw || typeof raw !== 'object') return null;

  const payload = raw as Record<string, unknown>;
  const status = payload.status && typeof payload.status === 'object'
    ? (payload.status as Record<string, unknown>)
    : null;

  const categorias = Array.isArray(payload.categorias)
    ? payload.categorias.map((item) => {
        const row = item as Record<string, unknown>;
        return {
          categoria: typeof row.categoria === 'string' ? row.categoria : 'Sem Categoria',
          valor: toNumber(row.valor),
          qtd_itens: toNumber(row.qtd_itens),
        };
      })
    : [];

  const rawMovimentacoes = Array.isArray(payload.movimentacoes_recentes)
    ? payload.movimentacoes_recentes
    : Array.isArray(payload.movimentacoes)
      ? payload.movimentacoes
      : [];

  const movimentacoes = rawMovimentacoes.map((item) => {
    const row = item as Record<string, unknown>;
    return {
      id: typeof row.id === 'string' ? row.id : crypto.randomUUID(),
      data: typeof row.created_at === 'string'
        ? row.created_at
        : typeof row.data === 'string'
          ? row.data
          : '',
      produto: typeof row.produto_nome === 'string'
        ? row.produto_nome
        : typeof row.produto === 'string'
          ? row.produto
          : '—',
      tipo: typeof row.tipo === 'string' ? row.tipo : '—',
      quantidade: toNumber(row.quantidade),
      custo_total: toNumber((row.custo_total ?? row.custo_unitario)),
      direction: typeof row.direction === 'string' ? row.direction : null,
    };
  });

  const totalProdutos = status ? toNumber(status.total) : toNumber(payload.total_produtos);
  const semEstoque = status ? toNumber(status.sem_estoque) : toNumber(payload.sem_estoque);

  return {
    valor_total: toNumber(payload.valor_total_estoque ?? payload.valor_total),
    total_produtos: totalProdutos,
    produtos_com_saldo: totalProdutos > 0 ? Math.max(totalProdutos - semEstoque, 0) : toNumber(payload.produtos_com_saldo),
    ok: status ? toNumber(status.ok) : toNumber(payload.ok),
    atencao: status ? toNumber(status.atencao) : toNumber(payload.atencao),
    critico: status ? toNumber(status.critico) : toNumber(payload.critico),
    sem_estoque: semEstoque,
    sem_custo: status ? toNumber(status.sem_custo) : toNumber(payload.sem_custo),
    categorias,
    movimentacoes,
  };
}

export default function StockDashboardSection({
 categorias, onNavigate }: Props) {
  const canViewRbac = useCan('estoque:dashboard:view');
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [days, setDays] = useState('30');

  const fetchDashboard = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: raw, error: rpcErr } = await supabase.rpc('get_stock_dashboard', { p_days: Number(days) });
      if (rpcErr) {
        console.error('Erro dashboard estoque:', rpcErr);
        setError(rpcErr.message || 'Erro ao carregar dashboard');
      } else {
        const normalized = normalizeDashboardData(raw);
        if (normalized) {
          setData(normalized);
        } else {
          setError('Resposta inválida do dashboard');
        }
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : 'Erro inesperado';
      console.error('Erro dashboard estoque:', e);
      setError(msg);
    }
    setLoading(false);
  }, [days]);

  useEffect(() => { fetchDashboard(); }, [fetchDashboard]);

  const handleCardClick = useCallback((cardKey: string) => {
    const nav = CARD_NAV_MAP[cardKey];
    if (nav && onNavigate) {
      onNavigate(nav.target, nav.filter);
    }
  }, [onNavigate]);

  const statusData = data ? [
    { name: 'OK', value: data.ok, fill: STATUS_COLORS[0] },
    { name: 'Atenção', value: data.atencao, fill: STATUS_COLORS[1] },
    { name: 'Crítico', value: data.critico, fill: STATUS_COLORS[2] },
    { name: 'Sem Estoque', value: data.sem_estoque, fill: STATUS_COLORS[3] },
  ].filter((item) => item.value > 0) : [];

  const getMovIcon = (tipo: string, direction?: string | null) => {
    if (direction === 'IN' || tipo === 'ENTRADA' || tipo.includes('POSITIVO')) {
      return <ArrowDown className="w-3.5 h-3.5 text-success" />;
    }
    if (direction === 'OUT' || tipo === 'SAIDA' || tipo.includes('NEGATIVO')) {
      return <ArrowUp className="w-3.5 h-3.5 text-destructive" />;
    }
    return <Minus className="w-3.5 h-3.5 text-warning" />;
  };

  const getMovLabel = (tipo: string) => {
    const map: Record<string, string> = {
      ENTRADA: 'Entrada',
      SAIDA: 'Saída',
      AJUSTE_INVENTARIO_POSITIVO: 'Ajuste +',
      AJUSTE_INVENTARIO_NEGATIVO: 'Ajuste -',
      AJUSTE_POSITIVO: 'Ajuste +',
      AJUSTE_NEGATIVO: 'Ajuste -',
    };
    return map[tipo] || tipo;
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-12">
        <RefreshCw className="w-5 h-5 animate-spin text-primary" />
      </div>
    );
  }

  if (error && !data) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center">
        <AlertCircle className="w-8 h-8 mx-auto text-destructive/50 mb-2" />
        <p className="text-sm font-medium text-foreground mb-1">Erro ao carregar dashboard</p>
        <p className="text-xs text-muted-foreground mb-3">{error}</p>
        <Button size="sm" variant="outline" onClick={fetchDashboard}>Tentar novamente</Button>
      </div>
    );
  }

  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-foreground">Dashboard Estoque</h3>
        <div className="flex items-center gap-2">
          <Select value={days} onValueChange={setDays}>
            <SelectTrigger className="h-7 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">7 dias</SelectItem>
              <SelectItem value="30">30 dias</SelectItem>
              <SelectItem value="90">90 dias</SelectItem>
              <SelectItem value="365">1 ano</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={fetchDashboard} disabled={loading}>
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard label="Valor em Estoque" value={data ? formatCurrency(data.valor_total) : '—'} icon={DollarSign} variant="primary" />
        <KpiCard
          label="Produtos"
          value={String(data?.total_produtos ?? '—')}
          sub={`${data?.produtos_com_saldo ?? 0} com saldo`}
          icon={Package}
          onClick={() => onNavigate?.('saldo', '')}
        />
        <KpiCard label="Estoque Baixo" value={String(data?.atencao ?? '—')} icon={AlertTriangle} variant="warning" onClick={() => handleCardClick('estoque_baixo')} />
        <KpiCard label="Críticos" value={String(data?.critico ?? '—')} icon={AlertCircle} variant="danger" onClick={() => handleCardClick('critico')} />
        <KpiCard label="Sem Estoque" value={String(data?.sem_estoque ?? '—')} icon={Inbox} onClick={() => handleCardClick('sem_estoque')} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Distribuição por Categoria</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {data?.categorias.length ? (
              <ChartContainer config={chartConfigCat} className="h-[220px] w-full">
                <BarChart data={data.categorias.slice(0, 8)} layout="vertical" margin={{ left: 0, right: 16, top: 8, bottom: 8 }}>
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} />
                  <XAxis type="number" tickFormatter={(value) => fmtBRLCompact(value)} className="text-[10px]" />
                  <YAxis type="category" dataKey="categoria" width={90} className="text-[10px]" tick={{ fontSize: 10 }} />
                  <ChartTooltip content={<ChartTooltipContent formatter={(value) => formatCurrency(Number(value))} />} />
                  <Bar dataKey="valor" radius={[0, 4, 4, 0]}>
                    {data.categorias.slice(0, 8).map((_, index) => (
                      <Cell key={index} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ChartContainer>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardHeader className="p-4 pb-2">
            <CardTitle className="text-sm font-semibold">Status do Estoque</CardTitle>
          </CardHeader>
          <CardContent className="p-4 pt-0">
            {statusData.length > 0 ? (
              <div className="flex items-center gap-4">
                <ChartContainer config={chartConfigStatus} className="h-[200px] w-[200px] mx-auto">
                  <PieChart>
                    <Pie data={statusData} cx="50%" cy="50%" innerRadius={45} outerRadius={75} paddingAngle={3} dataKey="value">
                      {statusData.map((entry, index) => (
                        <Cell
                          key={index}
                          fill={entry.fill}
                          className="cursor-pointer hover:opacity-80 transition-opacity"
                          onClick={() => {
                            const status = PIE_NAME_TO_STATUS[entry.name];
                            if (status && onNavigate) onNavigate('saldo', status);
                          }}
                        />
                      ))}
                    </Pie>
                    <ChartTooltip content={<ChartTooltipContent />} />
                  </PieChart>
                </ChartContainer>
                <div className="space-y-2">
                  {statusData.map((item) => {
                    const status = PIE_NAME_TO_STATUS[item.name];
                    return (
                      <button
                        key={item.name}
                        onClick={() => {
                          if (status && onNavigate) onNavigate('saldo', status);
                        }}
                        className="flex items-center gap-2 rounded-lg px-2 py-1 -mx-2 transition-colors hover:bg-accent/50 cursor-pointer w-full text-left"
                        aria-label={`Ver produtos com status ${item.name}`}
                      >
                        <div className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: item.fill }} />
                        <span className="text-xs text-muted-foreground">{item.name}</span>
                        <span className="text-xs font-bold text-foreground">{item.value}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : (
              <p className="text-xs text-muted-foreground text-center py-8">Sem dados</p>
            )}
          </CardContent>
        </Card>
      </div>

      <StockInactivityAlert categorias={categorias} />

      <Card className="bg-card border-border">
        <CardHeader className="p-4 pb-2">
          <CardTitle className="text-sm font-semibold">Últimas Movimentações</CardTitle>
        </CardHeader>
        <CardContent className="p-4 pt-0">
          {data?.movimentacoes.length ? (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-[10px] h-8">Data</TableHead>
                    <TableHead className="text-[10px] h-8">Produto</TableHead>
                    <TableHead className="text-[10px] h-8">Tipo</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Qtd</TableHead>
                    <TableHead className="text-[10px] h-8 text-right">Valor</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.movimentacoes.map((mov) => (
                    <TableRow key={mov.id}>
                      <TableCell className="text-[11px] py-1.5">
                        {mov.data ? parseUTCToBR(mov.data).substring(0, 16) : '—'}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 font-medium max-w-[160px] truncate">{mov.produto}</TableCell>
                      <TableCell className="text-[11px] py-1.5">
                        <div className="flex items-center gap-1">
                          {getMovIcon(mov.tipo, mov.direction)}
                          <span>{getMovLabel(mov.tipo)}</span>
                        </div>
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                        {formatDecimalBR(mov.quantidade, 2)}
                      </TableCell>
                      <TableCell className="text-[11px] py-1.5 text-right tabular-nums">
                        {mov.custo_total > 0 ? formatCurrency(mov.custo_total) : '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : (
            <p className="text-xs text-muted-foreground text-center py-6">Nenhuma movimentação no período</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

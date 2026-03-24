import { useState, useEffect, useCallback, useRef } from 'react';
import { useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { BarChart, Bar, LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend, PieChart, Pie, Cell } from 'recharts';
import { subMonths, startOfMonth, endOfMonth } from 'date-fns';
import { formatDateBR, formatInBR } from '@/lib/datetime';
import { fmtBRL } from '@/lib/formatters';
import { toast } from 'sonner';
import { AlertTriangle } from 'lucide-react';

// ── Types ──

interface MonthlyItem {
  mes: string;
  mesLabel: string;
  receitas: number;
  despesas: number;
  resultado: number;
}

interface CategoriaItem {
  nome: string;
  valor: number;
}

interface ChartsData {
  evolucao_mensal: MonthlyItem[];
  despesas_por_categoria: CategoriaItem[];
}

// Use CSS custom properties for theme-aware colors
const CHART_COLORS = [
  'hsl(var(--success))',
  'hsl(var(--destructive))',
  'hsl(var(--primary))',
  'hsl(var(--warning, 45 93% 47%))',
  'hsl(var(--accent))',
  'hsl(var(--muted-foreground))',
];

// Fallback hex colors for Recharts (doesn't support CSS vars in all cases)
const PIE_COLORS = ['#22c55e', '#ef4444', '#3b82f6', '#eab308', '#8b5cf6', '#14b8a6'];

export default function DashboardCharts() {
  const [chartData, setChartData] = useState<ChartsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [meses, setMeses] = useState(6);

  const loadRef = useRef<() => void>(() => {});

  const load = useCallback(async () => {
    setLoading(true);
    setError(false);
    const inicio = formatDateBR(startOfMonth(subMonths(new Date(), meses - 1)));
    const fim = formatDateBR(endOfMonth(new Date()));

    const { data, error: rpcError } = await supabase.rpc('get_fin_dashboard_charts', {
      p_start: inicio,
      p_end: fim,
    });

    if (rpcError) {
      console.error(rpcError);
      toast.error('Erro ao carregar gráficos do dashboard');
      setError(true);
      setLoading(false);
      return;
    }

    const d = data as Record<string, unknown> | null;

    const evolucao = ((d?.evolucao_mensal as Array<Record<string, unknown>>) || []).map((m) => {
      const [year, month] = String(m.mes).split('-');
      const date = new Date(Number(year), Number(month) - 1);
      return {
        mes: String(m.mes),
        mesLabel: formatInBR(date, 'MMM/yy'),
        receitas: Number(m.receitas) || 0,
        despesas: Number(m.despesas) || 0,
        resultado: Number(m.resultado) || 0,
      };
    });

    setChartData({
      evolucao_mensal: evolucao,
      despesas_por_categoria: ((d?.despesas_por_categoria as Array<Record<string, unknown>>) || []).map((c) => ({
        nome: String(c.nome),
        valor: Number(c.valor) || 0,
      })),
    });
    setLoading(false);
  }, [meses]);

  loadRef.current = load;

  useEffect(() => { load(); }, [load]);

  // Auto-refresh via data events
  useDataEvent('financeiro:*', useCallback(() => loadRef.current(), []));

  const fmt = (v: number) => fmtBRL(v);

  // ── Loading skeleton ──
  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-end">
          <Skeleton className="h-9 w-36" />
        </div>
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {[1, 2, 3].map(i => (
            <Card key={i} className={i === 3 ? 'lg:col-span-2' : ''}>
              <CardHeader className="pb-2"><Skeleton className="h-4 w-40" /></CardHeader>
              <CardContent><Skeleton className="h-[260px] w-full" /></CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  // ── Error state ──
  if (error || !chartData) {
    return (
      <Card>
        <CardContent className="p-8 text-center text-muted-foreground">
          <AlertTriangle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          <p className="text-sm">Não foi possível carregar os gráficos.</p>
          <button onClick={load} className="text-xs text-primary underline mt-2">Tentar novamente</button>
        </CardContent>
      </Card>
    );
  }

  const { evolucao_mensal, despesas_por_categoria } = chartData;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Select value={String(meses)} onValueChange={v => setMeses(Number(v))}>
          <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="3">3 meses</SelectItem>
            <SelectItem value="6">6 meses</SelectItem>
            <SelectItem value="12">12 meses</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Receitas vs Despesas</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={evolucao_mensal}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="mesLabel" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Legend />
                <Bar dataKey="receitas" name="Receitas" fill="#22c55e" radius={[4, 4, 0, 0]} />
                <Bar dataKey="despesas" name="Despesas" fill="#ef4444" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Resultado Mensal</CardTitle></CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={260}>
              <LineChart data={evolucao_mensal}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border/30" />
                <XAxis dataKey="mesLabel" fontSize={11} />
                <YAxis fontSize={11} tickFormatter={v => `${(v / 1000).toFixed(0)}k`} />
                <Tooltip formatter={(v: number) => fmt(v)} />
                <Line type="monotone" dataKey="resultado" name="Resultado" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader className="pb-2"><CardTitle className="text-sm font-medium">Despesas por Categoria (Top 8)</CardTitle></CardHeader>
          <CardContent>
            {despesas_por_categoria.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">Sem despesas categorizadas no período</p>
            ) : (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                <ResponsiveContainer width="100%" height={240}>
                  <PieChart>
                    <Pie data={despesas_por_categoria} dataKey="valor" nameKey="nome" cx="50%" cy="50%" outerRadius={90} label={({ nome, percent }) => `${String(nome).slice(0, 15)} ${(percent * 100).toFixed(0)}%`} labelLine={false} fontSize={10}>
                      {despesas_por_categoria.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-1.5">
                  {despesas_por_categoria.map((item, i) => (
                    <div key={item.nome} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                        <span className="truncate max-w-[160px]">{item.nome}</span>
                      </div>
                      <span className="font-medium">{fmt(item.valor)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

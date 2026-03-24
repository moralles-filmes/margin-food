import { useState, useEffect } from 'react';
import { useRelatoriosData } from '@/hooks/useRelatoriosData';
import PeriodFilter, { PeriodRange, getDefaultRange } from './PeriodFilter';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, LineChart, Line, Cell } from 'recharts';
import { TrendingUp, TrendingDown, DollarSign, Percent, Package, BarChart3, Building2, Zap, AlertTriangle, ArrowUpDown, Target, Brain, Calculator, Layers, BoxesIcon, Loader2, ShieldCheck, ShieldX } from 'lucide-react';
import AnaliseItemView from './AnaliseItemView';
import GastosPorSetorChart from './relatorios/GastosPorSetorChart';
import { Button } from '@/components/ui/button';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { useModuleAccess } from '@/permissions/hooks';
import { useCan } from '@/permissions/hooks';
import { fmtBRL, formatNumberToBRL } from '@/lib/money';
import { formatIntegerBR, formatPercentBR, formatFixedBR } from '@/lib/formatters';

function fmt(n: number) { return formatIntegerBR(n); }
const fmtR$ = fmtBRL;
function fmtPct(n: number) { return formatPercentBR(n); }
function fmtPctNullable(v: number | null | undefined): string { return v == null ? '—' : formatPercentBR(v); }
function safeFmt(v: unknown, fn: (n: number) => string): string { return v == null || Number.isNaN(Number(v)) ? '—' : fn(Number(v)); }

function KPICard({ label, value, sub, variant = 'default' }: { label: string; value: string; sub?: string; variant?: 'default' | 'salmon' | 'gold' | 'success' | 'destructive' }) {
  const borderColor = { default: 'border-border', salmon: 'border-primary/30', gold: 'border-warning/30', success: 'border-success/30', destructive: 'border-destructive/30' }[variant];
  const textColor = { default: 'text-foreground', salmon: 'text-primary', gold: 'text-warning', success: 'text-success', destructive: 'text-destructive' }[variant];
  return (
    <div className={`bg-card rounded-xl p-3 border ${borderColor} animate-fade-up`}>
      <p className="text-[10px] text-muted-foreground font-medium uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-lg font-display font-bold ${textColor}`}>{value}</p>
      {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

function ScoreBadge({ score }: { score: number }) {
  if (score >= 80) return <span className="text-[10px] font-bold text-success bg-success/15 px-1.5 py-0.5 rounded-full">🟢 {score}</span>;
  if (score >= 50) return <span className="text-[10px] font-bold text-warning bg-warning/15 px-1.5 py-0.5 rounded-full">🟡 {score}</span>;
  return <span className="text-[10px] font-bold text-destructive bg-destructive/15 px-1.5 py-0.5 rounded-full">🔴 {score}</span>;
}

function ConfidenceBadge({ confidence }: { confidence: number }) {
  if (confidence >= 0.7) return <span className="text-[9px] text-success/80">●</span>;
  if (confidence >= 0.3) return <span className="text-[9px] text-warning/80">●</span>;
  return <span className="text-[9px] text-muted-foreground">○</span>;
}

function NoAccess({ perm }: { perm: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-16 gap-3">
      <ShieldX className="w-10 h-10 text-muted-foreground" />
      <p className="text-sm text-muted-foreground font-medium">Sem permissão</p>
      <p className="text-[10px] text-muted-foreground/70">({perm})</p>
    </div>
  );
}

const chartTooltipStyle = { background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: '11px', color: 'hsl(var(--foreground))' };

const TAB_META: { key: string; label: string }[] = [
  { key: 'cmv', label: 'CMV' },
  { key: 'estoque', label: 'Estoque' },
  { key: 'compras', label: 'Compras' },
  { key: 'tendencia', label: 'Tendência' },
  { key: 'score', label: 'Score' },
  { key: 'itens', label: '📦 Itens' },
];

export default function RelatoriosView() {
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());
  const data = useRelatoriosData(period);

  // RBAC
  const { visibleSubtabs, canView } = useModuleAccess('relatorios');
  const canSimulate = useCan('relatorios:score:simulate');

  const visibleTabs = TAB_META.filter(t => visibleSubtabs.includes(t.key));
  const defaultTab = visibleTabs[0]?.key || 'cmv';

  // Simulator state
  const [simDesperdicioReduz, setSimDesperdicioReduz] = useState('5');
  const [simConsumoReduz, setSimConsumoReduz] = useState('10');
  const [simMetaCMV, setSimMetaCMV] = useState('30');

  // Trigger simulation when inputs change
  useEffect(() => {
    if (!canSimulate) return;
    data.runSimulation({
      reduzir_perdas_percent: parseDecimal(simDesperdicioReduz) ?? 0,
      reduzir_consumo_percent: parseDecimal(simConsumoReduz) ?? 0,
      target_cmv_percent: parseDecimal(simMetaCMV) ?? 0,
    });
  }, [simDesperdicioReduz, simConsumoReduz, simMetaCMV, data.runSimulation, canSimulate]);

  const sim = data.simulationResult;

  if (!canView) {
    return <NoAccess perm="relatorios:*:view" />;
  }

  if (data.serverLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 gap-3">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">Carregando relatórios…</p>
      </div>
    );
  }

  if (data.serverError) {
    return (
      <div className="space-y-4">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-primary" /> Relatórios Inteligentes
          </h2>
        </div>
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-3">
          <AlertTriangle className="w-8 h-8 text-destructive mx-auto" />
          <p className="text-sm text-destructive font-semibold">Erro ao carregar relatórios</p>
          <p className="text-xs text-muted-foreground">{data.serverError}</p>
          <Button variant="outline" size="sm" onClick={() => setPeriod({ ...period })}>
            Tentar novamente
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
          <BarChart3 className="w-5 h-5 text-primary" /> Relatórios Inteligentes
        </h2>
        <p className="text-xs text-muted-foreground">Centro de Inteligência Financeira — semanal/mensal</p>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      <Tabs defaultValue={defaultTab} className="w-full">
        <TabsList className={`w-full grid h-8 bg-secondary/50`} style={{ gridTemplateColumns: `repeat(${visibleTabs.length}, 1fr)` }}>
          {visibleTabs.map(t => (
            <TabsTrigger key={t.key} value={t.key} className="text-[9px] data-[state=active]:gradient-salmon data-[state=active]:text-primary-foreground">
              {t.label}
            </TabsTrigger>
          ))}
        </TabsList>

        {/* === BLOCK 1: CMV === */}
        {visibleSubtabs.includes('cmv') && (
          <TabsContent value="cmv" className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <KPICard label="🔥 CMV Geral" value={fmtPctNullable(data.cmvGeral)} sub={`Meta: ${data.metaCMV}%`} variant={data.cmvGeral != null && data.cmvGeral > data.metaCMV ? 'destructive' : 'success'} />
              <KPICard label="CMV Salmão" value={fmtPctNullable(data.cmvSalmao)} variant="salmon" />
              <KPICard label="Margem Bruta" value={fmtPctNullable(data.margemBruta)} variant="success" />
              <KPICard label="Impacto Salmão" value={fmtPctNullable(data.impactoSalmao)} sub="no CMV total" variant="gold" />
              <KPICard label="Custo Consumido" value={fmtR$(data.custoConsumido)} variant="default" />
              <KPICard label="Faturamento" value={fmtR$(data.faturamento)} variant="success" />
            </div>

            {data.cmvPorCategoria.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-warning" /> CMV por Categoria
                </p>
                {data.cmvPorCategoria.map(c => (
                  <div key={c.categoria} className="flex items-center justify-between text-[11px] py-1 border-b border-border/30 last:border-0">
                    <span className="text-foreground font-medium">{c.categoria}</span>
                    <div className="flex items-center gap-3">
                      <span className="text-muted-foreground">{fmtR$(c.custo)}</span>
                      <span className="font-bold text-primary">{fmtPct(c.cmv)}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {data.tendenciaCMV.some(t => t.cmv > 0) && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-primary" /> Tendência CMV (3 meses)
                </p>
                <ResponsiveContainer width="100%" height={140}>
                  <LineChart data={data.tendenciaCMV}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="mes" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                    <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [safeFmt(v, n => formatPercentBR(n)), 'CMV']} />
                    <Line type="monotone" dataKey="cmv" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ fill: 'hsl(var(--primary))', r: 4 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </TabsContent>
        )}

        {/* === BLOCK 2: Eficiência Estoque === */}
        {visibleSubtabs.includes('estoque') && (
          <TabsContent value="estoque" className="space-y-4 mt-3">
            <div className="grid grid-cols-2 gap-2">
              <KPICard label="Giro de Estoque" value={formatFixedBR(data.giroEstoque, 2)} sub="consumo/estoque" variant="default" />
              <KPICard label="Cobertura" value={`${formatFixedBR(data.coberturaSemanas, 1)} sem`} variant="gold" />
              <KPICard label="Ruptura" value={fmtPct(data.rupturaPercent)} sub={`${data.itensAbaixoMinimo.length} itens`} variant={data.rupturaPercent > 0 ? 'destructive' : 'success'} />
              <KPICard label="Perdas (R$)" value={fmtR$(data['perdasR$'])} sub={`${formatFixedBR(data.perdasKg, 1)} kg`} variant="destructive" />
              <KPICard label="Valor em Estoque" value={fmtR$(data.valorTotalEstoque)} variant="gold" />
              <KPICard label="Parado" value={fmtPct(data.estoqueParadoPercent)} sub="> 4 sem" variant={data.estoqueParadoPercent > 20 ? 'destructive' : 'default'} />
            </div>

            {/* Salmon stock breakdown */}
            {(data.salmonBrutoKg > 0 || data.salmonLimpoKg > 0 || data.salmonComprasValor > 0) && (
              <div className="bg-card border border-primary/20 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                  🐟 Salmão — Estoque &amp; Compras
                </p>
                <div className="grid grid-cols-2 gap-2">
                  <KPICard label="Bruto em Estoque" value={`${formatFixedBR(data.salmonBrutoKg, 1)} kg`} variant="salmon" />
                  <KPICard label="Limpo Disponível" value={`${formatFixedBR(data.salmonLimpoKg, 1)} kg`} variant="salmon" />
                  <KPICard label="Valor Estoque Salmão" value={fmtR$(data.salmonValorEstoque)} variant="gold" />
                  <KPICard label="Compras no Período" value={fmtR$(data.salmonComprasValor)} sub={`${formatFixedBR(data.salmonComprasKg, 1)} kg`} variant="salmon" />
                </div>
              </div>
            )}

            {data.topMenorGiro.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">📉 Menor Giro</p>
                {data.topMenorGiro.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-border/30 last:border-0">
                    <span className="text-foreground">{item.nome || 'Sem nome'}</span>
                    <span className="text-destructive font-bold">{formatFixedBR(item.giro, 2)}</span>
                  </div>
                ))}
              </div>
            )}

            {data.topMaiorPerda.length > 0 && (
              <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-foreground uppercase tracking-wider">💸 Maiores Perdas</p>
                {data.topMaiorPerda.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-border/30 last:border-0">
                    <span className="text-foreground">{item.nome}</span>
                    <span className="text-destructive font-bold">{fmtR$(item.perda)}</span>
                  </div>
                ))}
              </div>
            )}

            {data.itensAbaixoMinimo.length > 0 && (
              <div className="bg-card border border-destructive/20 rounded-xl p-4 space-y-2">
                <p className="text-xs font-semibold text-destructive uppercase tracking-wider flex items-center gap-1.5">
                  <AlertTriangle className="w-3.5 h-3.5" /> Abaixo do Mínimo
                </p>
                {data.itensAbaixoMinimo.slice(0, 5).map((item, i) => (
                  <div key={i} className="flex items-center justify-between text-[11px] py-1 border-b border-border/30 last:border-0">
                    <span className="text-foreground">{item.nome}</span>
                    <span className="text-destructive font-bold">{formatFixedBR(item.saldo, 1)} / {item.minimo}</span>
                  </div>
                ))}
              </div>
            )}

            <GastosPorSetorChart period={period} />
          </TabsContent>
        )}

        {/* === BLOCK 3: Inteligência Compras === */}
        {visibleSubtabs.includes('compras') && (
          <TabsContent value="compras" className="space-y-4 mt-3">
            {data.comprasLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Carregando compras…</p>
              </div>
            ) : data.comprasError ? (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-3">
                <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
                <p className="text-sm text-destructive font-semibold">Erro ao carregar compras</p>
                <p className="text-xs text-muted-foreground">{data.comprasError}</p>
                <Button variant="outline" size="sm" onClick={() => setPeriod({ ...period })}>
                  Tentar novamente
                </Button>
              </div>
            ) : data.fornecedorStats.length > 0 ? (
              data.fornecedorStats.map((f, i) => (
                <div key={i} className="bg-card border border-border rounded-xl p-4 space-y-2 animate-fade-up">
                  <div className="flex items-center justify-between">
                    <p className="text-sm font-semibold text-foreground flex items-center gap-1.5">
                      <Building2 className="w-3.5 h-3.5 text-primary" /> {f.nome}
                    </p>
                    <span className="text-[10px] text-muted-foreground">#{i + 1}</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 text-[11px]">
                    <div><p className="text-[10px] text-muted-foreground">Ticket Médio</p><p className="font-bold text-foreground">{fmtR$(f.ticketMedio)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Freq. Semanal</p><p className="font-bold text-foreground">{f.freqSemanal.toFixed(1)}x</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Preço Médio/kg</p><p className="font-bold text-foreground">{fmtR$(f.precoMedio)}</p></div>
                    <div><p className="text-[10px] text-muted-foreground">Variação Preço</p><p className={`font-bold ${Math.abs(f.variacaoPreco) > 10 ? 'text-destructive' : 'text-success'}`}>{fmtPct(f.variacaoPreco)}</p></div>
                    <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Impacto Financeiro</p><p className="font-bold text-warning">{fmtR$(f.impactoFinanceiro)}</p></div>
                  </div>
                </div>
              ))
            ) : (
              <div className="bg-card border border-border rounded-xl p-6 text-center">
                <Building2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                <p className="text-sm text-muted-foreground">Sem dados de fornecedores no período</p>
              </div>
            )}
          </TabsContent>
        )}

        {/* === BLOCK 4: Tendência === */}
        {visibleSubtabs.includes('tendencia') && (
          <TabsContent value="tendencia" className="space-y-4 mt-3">
            {data.tendenciaLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Carregando tendências…</p>
              </div>
            ) : data.tendenciaError ? (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-3">
                <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
                <p className="text-sm text-destructive font-semibold">Erro ao carregar tendências</p>
                <p className="text-xs text-muted-foreground">{data.tendenciaError}</p>
                <Button variant="outline" size="sm" onClick={() => setPeriod({ ...period })}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">💰 Custo por Semana (W1–W5)</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart data={data.custoSemanal}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [safeFmt(v, fmtR$), 'Custo']} />
                      <Bar dataKey="custo" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">📊 CMV por Semana</p>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={data.cmvSemanal}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                      <XAxis dataKey="semana" tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} />
                      <YAxis tick={{ fontSize: 10, fill: 'hsl(var(--muted-foreground))' }} unit="%" />
                      <Tooltip contentStyle={chartTooltipStyle} formatter={(v: unknown) => [safeFmt(v, n => `${n.toFixed(1)}%`), 'CMV']} />
                      <Line type="monotone" dataKey="cmv" stroke="hsl(var(--accent))" strokeWidth={2} dot={{ fill: 'hsl(var(--accent))', r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">🔄 Período Atual vs Anterior</p>
                  {data.comparativoMes.map(c => {
                    const diff = c.anterior > 0 ? ((c.atual - c.anterior) / c.anterior) * 100 : 0;
                    return (
                      <div key={c.label} className="flex items-center justify-between text-[11px] py-1.5 border-b border-border/30 last:border-0">
                        <span className="text-foreground font-medium">{c.label}</span>
                        <div className="flex items-center gap-3">
                          <span className="text-muted-foreground">{fmtR$(c.anterior)}</span>
                          <span className="text-foreground font-bold">{fmtR$(c.atual)}</span>
                          <span className={`text-[10px] font-bold ${diff > 0 ? (c.label === 'Faturamento' ? 'text-success' : 'text-destructive') : (c.label === 'Faturamento' ? 'text-destructive' : 'text-success')}`}>
                            {diff > 0 ? '↑' : '↓'} {Math.abs(diff).toFixed(0)}%
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <KPICard label="Volatilidade" value={fmtBRL(data.volatilidade)} sub="Desvio padrão custo/kg" variant={data.volatilidade > 5 ? 'destructive' : 'default'} />
                </div>

                <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider">🗓 Consumo por Dia da Semana</p>
                  <p className="text-[10px] text-muted-foreground italic">Análise comportamental apenas</p>
                  <div className="flex items-end gap-1 h-20">
                    {data.heatmapDiaSemana.map(h => {
                      const max = Math.max(...data.heatmapDiaSemana.map(x => x.valor), 1);
                      const pct = (h.valor / max) * 100;
                      return (
                        <div key={h.dia} className="flex-1 flex flex-col items-center gap-1">
                          <div className="w-full rounded-t" style={{ height: `${Math.max(4, pct)}%`, background: pct > 70 ? 'hsl(var(--primary))' : pct > 30 ? 'hsl(var(--accent))' : 'hsl(var(--muted))' }} />
                          <span className="text-[9px] text-muted-foreground">{h.dia}</span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>
        )}

        {/* === BLOCK 5: Score & Simulação === */}
        {visibleSubtabs.includes('score') && (
          <TabsContent value="score" className="space-y-4 mt-3">
            {data.scoreLoading ? (
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="w-6 h-6 animate-spin text-primary" />
                <p className="text-xs text-muted-foreground">Calculando scores…</p>
              </div>
            ) : data.scoreError ? (
              <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-6 text-center space-y-3">
                <AlertTriangle className="w-6 h-6 text-destructive mx-auto" />
                <p className="text-sm text-destructive font-semibold">Erro ao carregar scores</p>
                <p className="text-xs text-muted-foreground">{data.scoreError}</p>
                <Button variant="outline" size="sm" onClick={() => setPeriod({ ...period })}>
                  Tentar novamente
                </Button>
              </div>
            ) : (
              <>
                {data.scoreSuppliers.length > 0 ? (
                  <div className="bg-card border border-border rounded-xl p-4 space-y-2">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Zap className="w-3.5 h-3.5 text-warning" /> Score de Eficiência (0–100)
                    </p>
                    <p className="text-[9px] text-muted-foreground">Preço 40% · Estabilidade 20% · Entrega 20% · Impacto 20%</p>
                    {data.scoreSuppliers.map((item, i) => (
                      <div key={i} className="flex items-center justify-between text-[11px] py-1.5 border-b border-border/30 last:border-0">
                        <div className="flex items-center gap-1.5">
                          <ConfidenceBadge confidence={item.confidence} />
                          <span className="text-foreground font-medium">{item.supplier_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="flex gap-1 text-[8px] text-muted-foreground">
                            <span title="Preço">P:{item.price_score}</span>
                            <span title="Estabilidade">E:{item.stability_score}</span>
                            <span title="Entrega">D:{item.delivery_score}</span>
                            <span title="Impacto">I:{item.impact_score}</span>
                          </div>
                          <ScoreBadge score={item.score_total} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl p-6 text-center">
                    <Zap className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                    <p className="text-sm text-muted-foreground">Sem dados de score no período</p>
                  </div>
                )}

                {/* Simulador Estratégico — gated by simulate permission */}
                {canSimulate ? (
                  <div className="bg-card border border-primary/20 rounded-xl p-4 space-y-3">
                    <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                      <Calculator className="w-3.5 h-3.5 text-primary" /> 🔥 Simulador Estratégico
                    </p>

                    <div className="space-y-2">
                      <div>
                        <label className="text-[10px] text-muted-foreground">Reduzir desperdício em (%)</label>
                        <DecimalInput value={simDesperdicioReduz} onValueChange={(raw) => setSimDesperdicioReduz(raw)} maxDecimals={1} suffix="%" className="h-8 text-xs bg-secondary border-border mt-1" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Reduzir consumo/cliente em (%)</label>
                        <DecimalInput value={simConsumoReduz} onValueChange={(raw) => setSimConsumoReduz(raw)} maxDecimals={1} suffix="%" className="h-8 text-xs bg-secondary border-border mt-1" />
                      </div>
                      <div>
                        <label className="text-[10px] text-muted-foreground">Meta CMV (%)</label>
                        <DecimalInput value={simMetaCMV} onValueChange={(raw) => setSimMetaCMV(raw)} maxDecimals={1} suffix="%" className="h-8 text-xs bg-secondary border-border mt-1" />
                      </div>
                    </div>

                    <div className="bg-secondary/50 rounded-lg p-3 space-y-1.5">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Resultado da Simulação</p>
                      {data.simulationLoading ? (
                        <div className="flex items-center gap-2 py-2">
                          <Loader2 className="w-4 h-4 animate-spin text-primary" />
                          <span className="text-[11px] text-muted-foreground">Simulando…</span>
                        </div>
                      ) : data.simulationError ? (
                        <p className="text-[11px] text-destructive">{data.simulationError}</p>
                      ) : sim ? (
                        <div className="grid grid-cols-2 gap-2 text-[11px]">
                          <div><p className="text-[10px] text-muted-foreground">Novo CMV</p><p className={`font-bold ${(sim.novo_cmv_percent ?? 0) <= (parseDecimal(simMetaCMV) ?? 0) ? 'text-success' : 'text-destructive'}`}>{sim.novo_cmv_percent != null ? fmtPct(sim.novo_cmv_percent) : '—'}</p></div>
                          <div><p className="text-[10px] text-muted-foreground">Nova Margem</p><p className="font-bold text-success">{sim.nova_margem_abs != null ? fmtR$(sim.nova_margem_abs) : '—'}</p></div>
                          <div className="col-span-2"><p className="text-[10px] text-muted-foreground">Economia Mensal Projetada</p><p className="font-bold text-warning text-base">{fmtR$(sim.economia_mensal_estimativa)}</p></div>
                        </div>
                      ) : (
                        <p className="text-[11px] text-muted-foreground">Ajuste os parâmetros acima</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="bg-card border border-border rounded-xl p-4 text-center space-y-2">
                    <ShieldX className="w-6 h-6 text-muted-foreground mx-auto" />
                    <p className="text-[11px] text-muted-foreground">Simulador requer permissão <code className="text-[10px]">relatorios:score:simulate</code></p>
                  </div>
                )}

                {/* Projeção 4 semanas */}
                <div className="bg-card border border-warning/20 rounded-xl p-4 space-y-2">
                  <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
                    <Brain className="w-3.5 h-3.5 text-warning" /> 🔥 Projeção 4 Semanas
                  </p>
                  <div className="grid grid-cols-2 gap-2">
                    <KPICard label="Projeção Custo" value={fmtR$(data.projecao4Semanas)} variant={data.projecaoAlerta ? 'destructive' : 'gold'} />
                    <KPICard label="Status" value={data.projecaoAlerta ? '⚠️ Acima meta' : '✅ Dentro'} variant={data.projecaoAlerta ? 'destructive' : 'success'} />
                  </div>
                  {data.projecaoAlerta && (
                    <div className="bg-destructive/10 border border-destructive/30 rounded-lg px-3 py-2 mt-1">
                      <p className="text-[11px] text-destructive font-medium">⚠️ Alerta estratégico: projeção de custo ultrapassa a meta de CMV de {data.metaCMV}%</p>
                    </div>
                  )}
                </div>
              </>
            )}
          </TabsContent>
        )}

        {/* === BLOCK 6: Análise por Item === */}
        {visibleSubtabs.includes('itens') && (
          <TabsContent value="itens" className="mt-3">
            <AnaliseItemView period={period} />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}

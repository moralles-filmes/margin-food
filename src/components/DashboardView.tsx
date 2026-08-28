import { useState, useMemo } from 'react';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { useSalmonDashboard } from '@/hooks/useSalmonDashboard';
import { TrendingUp, TrendingDown, DollarSign, Fish, Scale, Percent, Users, BarChart3, Zap, AlertTriangle, Clock, ShieldAlert, ClipboardList, Droplets, Loader2 } from 'lucide-react';
import PeriodFilter, { PeriodRange, getDefaultRange } from './PeriodFilter';
import { eachWeekOfInterval, endOfWeek } from 'date-fns';
import { Button } from '@/components/ui/button';
import { TabId } from '@/types/salmon';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { todayBR, formatInBR, formatFixedBR, fmtBRL, formatPercentBR, formatIntegerBR, formatDecimalBR } from '@/lib/formatters';
import ValidadeAlertCard from './ValidadeAlertCard';
import KpiCard from '@/components/ui/KpiCard';
import type { KpiVariant } from '@/components/ui/KpiCard';
import { axisProps, gridProps, tooltipProps, chartValueFormatters, SEMANTIC_CHART_COLORS } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';

const VARIANT_MAP: Record<string, KpiVariant> = {
  default: 'default', salmon: 'primary', gold: 'gold', success: 'success', destructive: 'danger',
};
interface DashboardViewProps {
  store: ReturnType<typeof useSalmonStore>;
  onNavigate?: (tab: TabId) => void;
}

export default function DashboardView({ store, onNavigate }: DashboardViewProps) {
  const { lotesLimpos, auditorias, metasProvisionadas, dailyRecords, entries } = store;
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());

  // Server-side dashboard data
  const dash = useSalmonDashboard(period);

  const now = new Date();
  const mesAno = formatInBR(now, 'yyyy-MM');

  // Weekly loss chart (still client-side from store manipulations for granularity)
  const filteredManips = useMemo(() => {
    const start = period.start.getTime();
    const end = period.end.getTime();
    return store.manipulations.filter(m => {
      const d = new Date(m.date).getTime();
      return d >= start && d <= end;
    });
  }, [store.manipulations, period]);

  const weeklyLossData = useMemo(() => {
    if (filteredManips.length === 0) return [];
    const dates = filteredManips.map(m => new Date(m.date));
    const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
    const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
    const weeks = eachWeekOfInterval({ start: minDate, end: maxDate }, { weekStartsOn: 1 });
    return weeks.map(weekStart => {
      const wEnd = endOfWeek(weekStart, { weekStartsOn: 1 });
      const weekManips = filteredManips.filter(m => { const d = new Date(m.date); return d >= weekStart && d <= wEnd; });
      return {
        semana: formatInBR(weekStart, 'dd/MM'),
        'perdaR$': Math.round(weekManips.reduce((s, m) => s + (m.perdaValor || 0), 0) * 100) / 100,
        perdaKg: Math.round(weekManips.reduce((s, m) => s + m.lossKg, 0) * 100) / 100,
      };
    });
  }, [filteredManips]);

  // Meta g/cliente (still needs dailyRecords for monthly granularity)
  const metaProv = metasProvisionadas.find(m => m.mesAno === mesAno);
  const totalCustomersMonth = dailyRecords
    .filter(r => r.date.startsWith(mesAno))
    .reduce((s, r) => s + r.customers, 0);
  const monthManips = store.manipulations.filter(m => m.date.startsWith(mesAno.replace('-', '-')));
  const monthConsumed = monthManips.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0);
  const realGramasCliente = totalCustomersMonth > 0 ? (monthConsumed * 1000) / totalCustomersMonth : 0;

  // Expiry from lotesLimpos (client-side, manageable volume)
  const vencidos = lotesLimpos.filter(l => l.status === 'VENCIDO');
  const venceHoje = lotesLimpos.filter(l => l.status === 'VENCE_HOJE');
  const emRisco = [...vencidos, ...venceHoje];
  const kgEmRisco = emRisco.reduce((s, l) => s + l.kgRestante, 0);
  const valorEmRisco = emRisco.reduce((s, l) => s + l.kgRestante * l.custoKg, 0);

  // Month loss from server data
  const monthLossValue = dash.perdaValor;

  // Loading state
  if (dash.loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary" />
        <span className="ml-3 text-sm text-muted-foreground">Carregando dashboard...</span>
      </div>
    );
  }

  if (dash.error) {
    return (
      <div className="bg-destructive-soft border border-destructive-border rounded-xl p-6 text-center">
        <AlertTriangle className="w-8 h-8 text-destructive mx-auto mb-2" />
        <p className="text-sm text-destructive font-semibold">Erro ao carregar dashboard</p>
        <p className="text-xs text-muted-foreground mt-1">{dash.error}</p>
      </div>
    );
  }

  const cmv = dash.cmvSalmonPercent ?? 0;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Dashboard</h2>
        <p className="text-xs text-muted-foreground">Visão geral — semana/mês</p>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {/* Stock alerts */}
      {(dash.lowGross || dash.lowClean) && (
        <div className="bg-destructive-soft border border-destructive-border rounded-xl p-3 flex items-start gap-2 animate-scale-in">
          <AlertTriangle className="w-4 h-4 text-destructive shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-destructive">Estoque Baixo</p>
            {dash.lowGross && <p className="text-[11px] text-destructive mt-1">Bruto: {formatFixedBR(dash.saldoBrutoKg, 1)} kg (mín: {dash.minGrossKg} kg)</p>}
            {dash.lowClean && <p className="text-[11px] text-destructive mt-0.5">Limpo: {formatFixedBR(dash.estoqueLimpoKg, 1)} kg (mín: {dash.minCleanKg} kg)</p>}
          </div>
        </div>
      )}

      {dash.daysRemaining > 0 && dash.daysRemaining < 7 && (
        <div className="bg-warning-soft border border-warning-border rounded-xl p-3 flex items-start gap-2 animate-scale-in">
          <TrendingUp className="w-4 h-4 text-warning shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-semibold text-warning">Previsão de Compra</p>
            <p className="text-[11px] text-muted-foreground mt-1">Estoque acaba em ~{dash.daysRemaining} dias • Consumo: {formatFixedBR(dash.avgDailyConsumptionKg, 1)} kg/dia</p>
          </div>
        </div>
      )}

      {/* Validity Alerts */}
      <ValidadeAlertCard lotesLimpos={lotesLimpos} />

      {/* Clean Stock Quick View */}
      <div className="bg-card border border-success-border rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Droplets className="w-3.5 h-3.5 text-success" /> Estoque Limpo
        </p>
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-muted-foreground">Disponível</p>
            <p className="text-lg font-display font-bold text-success">{formatFixedBR(dash.estoqueLimpoKg, 1)} kg</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Lotes ativos</p>
            <p className="text-lg font-display font-bold text-foreground">{lotesLimpos.length}</p>
          </div>
          <div>
            <p className="text-[10px] text-muted-foreground">Em risco</p>
            <p className={`text-lg font-display font-bold ${emRisco.length > 0 ? 'text-destructive' : 'text-success'}`}>
              {formatFixedBR(kgEmRisco, 1)} kg
            </p>
            {valorEmRisco > 0 && <p className="text-[10px] text-destructive">{fmtBRL(valorEmRisco)}</p>}
          </div>
        </div>
      </div>

      {/* Meta g/cliente */}
      {metaProv && (
        <div className="bg-card border border-primary-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5 text-primary" /> Meta g/Cliente (mês)
          </p>
          <div className="grid grid-cols-4 gap-2 text-[11px]">
            <div><p className="text-[10px] text-muted-foreground">Meta</p><p className="font-bold text-foreground">{metaProv.metaGramasPorCliente}g</p></div>
            <div><p className="text-[10px] text-muted-foreground">Realizado</p><p className="font-bold text-foreground">{formatFixedBR(realGramasCliente, 0)}g</p></div>
            <div><p className="text-[10px] text-muted-foreground">Diferença</p>
              <p className={`font-bold ${realGramasCliente > metaProv.metaGramasPorCliente * 1.1 ? 'text-destructive' : 'text-success'}`}>
                {formatFixedBR(realGramasCliente - metaProv.metaGramasPorCliente, 0)}g
              </p>
            </div>
            <div><p className="text-[10px] text-muted-foreground">Status</p>
              <p className={`font-bold ${realGramasCliente <= metaProv.metaGramasPorCliente ? 'text-success' : realGramasCliente <= metaProv.metaGramasPorCliente * 1.1 ? 'text-warning' : 'text-destructive'}`}>
                {realGramasCliente <= metaProv.metaGramasPorCliente ? '✅' : realGramasCliente <= metaProv.metaGramasPorCliente * 1.1 ? '⚠️' : '❌'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Planning shortcut */}
      <div className="bg-card border border-primary-border rounded-xl p-4 flex items-center justify-between animate-fade-up">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary-soft flex items-center justify-center">
            <ClipboardList className="w-5 h-5 text-primary-ink" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground">Planejamento de Compras</p>
            <p className="text-[11px] text-muted-foreground">Meta, projeção, ritmo semanal</p>
          </div>
        </div>
        <Button onClick={() => onNavigate?.('planning')} size="sm" className="bg-primary-strong text-primary-foreground border-0 text-xs">Abrir</Button>
      </div>

      {/* Audit summary */}
      {(() => {
        const auditMes = auditorias.filter(a => a.mesAno === mesAno);
        const overrides = auditMes.filter(a => a.overrideAlerta);
        const today = todayBR();
        const overrideHoje = auditMes.some(a => a.overrideAlerta && a.dataEntrada === today);
        if (auditMes.length === 0) return null;
        return (
          <div className="bg-card border border-destructive-border rounded-xl p-4 space-y-2 animate-fade-up">
            {overrideHoje && (
              <div className="bg-destructive-soft border border-destructive-border rounded-lg px-3 py-1.5 mb-1">
                <p className="text-[11px] text-destructive font-medium">⚠️ Houve compra acima do limite hoje</p>
              </div>
            )}
            <div className="flex items-center justify-between">
              <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
                <ShieldAlert className="w-3.5 h-3.5 text-destructive" /> Compras acima do limite (mês)
              </p>
            </div>
            <div className="grid grid-cols-2 gap-3 text-[11px]">
              <div><p className="text-[10px] text-muted-foreground">Overrides</p><p className="text-base font-display font-bold text-destructive">{overrides.length}</p></div>
              <div><p className="text-[10px] text-muted-foreground">Valor total</p><p className="text-base font-display font-bold text-foreground">{fmtBRL(overrides.reduce((s, a) => s + a.valorTotal, 0))}</p></div>
            </div>
          </div>
        );
      })()}

      {/* FIFO & Risk - now from server */}
      {(dash.fifoRecomendados.length > 0 || dash.lotesParados.length > 0) && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5 text-success" /> FIFO & Risco
          </p>
          <div>
            <p className="text-[10px] text-muted-foreground mb-1.5">Lotes recomendados (FIFO)</p>
            {dash.fifoRecomendados.slice(0, 3).map((lot, i) => (
              <div key={lot.entry_id} className="flex items-center justify-between py-1.5 text-[11px]">
                <div className="flex items-center gap-2">
                  <span className={`w-5 h-5 rounded-full flex items-center justify-center text-[9px] font-bold ${i === 0 ? 'bg-success-soft text-success' : 'bg-secondary text-muted-foreground'}`}>{i + 1}</span>
                  <span className="text-foreground font-medium">{lot.lot || '—'}</span>
                  <span className="text-muted-foreground">{lot.supplier}</span>
                </div>
                <span className="text-primary font-bold">{formatFixedBR(lot.balance_kg, 1)} kg</span>
              </div>
            ))}
          </div>
          {dash.lotesParados.length > 0 && (
            <div>
              <p className="text-[10px] text-destructive mb-1.5 flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Lotes parados</p>
              {dash.lotesParados.slice(0, 3).map(lot => (
                <div key={lot.entry_id} className="flex items-center justify-between py-1.5 text-[11px]">
                  <div className="flex items-center gap-2">
                    <span className="text-foreground font-medium">{lot.lot || '—'}</span>
                    <span className="text-destructive text-[10px]">{lot.days_since_movement}d parado</span>
                  </div>
                  <span className="text-muted-foreground">{formatFixedBR(lot.balance_kg, 1)} kg</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Cost & CMV */}
      <div className="bg-card border border-warning-border rounded-xl p-4 space-y-2">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <DollarSign className="w-3.5 h-3.5 text-warning" /> Custo & CMV
        </p>
        <div className="grid grid-cols-2 gap-3">
          <div><p className="text-[10px] text-muted-foreground">Custo médio/kg bruto</p><p className="text-lg font-display font-bold text-foreground">{fmtBRL(dash.avgCostPerKg)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Custo médio/kg limpo</p><p className="text-lg font-display font-bold text-warning">{fmtBRL(dash.custoMedioKgLimpo)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">CMV Salmão (%)</p><p className={`text-lg font-display font-bold ${cmv > 35 ? 'text-destructive' : 'text-success'}`}>{formatPercentBR(cmv)}</p></div>
          <div><p className="text-[10px] text-muted-foreground">Custo total período</p><p className="text-lg font-display font-bold text-foreground">{fmtBRL(dash.totalValue)}</p></div>
        </div>
      </div>

      {/* Loss KPIs */}
      {dash.manipulationCount > 0 && (
        <div className="bg-card border border-destructive-border rounded-xl p-4 space-y-3">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <TrendingDown className="w-3.5 h-3.5 text-destructive" /> Perdas no Período
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] text-muted-foreground">Perda total (kg)</p><p className="text-lg font-display font-bold text-destructive">{formatFixedBR(dash.perdaKg, 1)} kg</p></div>
            <div><p className="text-[10px] text-muted-foreground">Perda total (R$)</p><p className="text-lg font-display font-bold text-destructive">{fmtBRL(dash.perdaValor)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Aproveitamento médio</p><p className="text-lg font-display font-bold text-success">{formatPercentBR(dash.avgYieldPercent)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">Custo perdido no mês</p><p className="text-lg font-display font-bold text-destructive">{fmtBRL(monthLossValue)}</p></div>
          </div>
          {weeklyLossData.length > 0 && (
            <div className="mt-3">
              <p className="text-[10px] text-muted-foreground mb-2">Perda em R$ por semana</p>
              <ResponsiveContainer width="100%" height={160}>
                <BarChart data={weeklyLossData}>
                  <CartesianGrid {...gridProps} />
                  <XAxis dataKey="semana" {...axisProps} />
                  <YAxis {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} />
                  <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtBRL(Number(v))} />} />
                  <Bar dataKey="perdaR$" name="Perda" fill={SEMANTIC_CHART_COLORS.negative} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Financial Risk from Expiry */}
      {emRisco.length > 0 && (
        <div className="bg-card border border-destructive-border rounded-xl p-4 space-y-2">
          <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-destructive" /> Risco Financeiro (Validade)
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div><p className="text-[10px] text-muted-foreground">Kg vencido</p><p className="text-lg font-display font-bold text-destructive">{formatFixedBR(vencidos.reduce((s, l) => s + l.kgRestante, 0), 1)} kg</p></div>
            <div><p className="text-[10px] text-muted-foreground">Kg vencendo</p><p className="text-lg font-display font-bold text-warning">{formatFixedBR(venceHoje.reduce((s, l) => s + l.kgRestante, 0), 1)} kg</p></div>
            <div><p className="text-[10px] text-muted-foreground">R$ em risco</p><p className="text-lg font-display font-bold text-destructive">{fmtBRL(valorEmRisco)}</p></div>
            <div><p className="text-[10px] text-muted-foreground">% estoque em risco</p><p className="text-lg font-display font-bold text-destructive">{dash.estoqueLimpoKg > 0 ? formatPercentBR((kgEmRisco / dash.estoqueLimpoKg) * 100) : formatPercentBR(0)}</p></div>
          </div>
        </div>
      )}

      {/* KPIs - all from server now */}
      <div className="grid grid-cols-2 gap-3">
        <KpiCard label="Comprado" value={`${formatIntegerBR(dash.totalEntriesKg)} kg`} sub={`${dash.entriesCount} entradas`} icon={Scale} variant={VARIANT_MAP['salmon']} />
        <KpiCard label="Consumido" value={`${formatIntegerBR(dash.consumidoKg)} kg`} sub={`${dash.manipulationCount} manip.`} icon={Fish} variant={VARIANT_MAP['gold']} />
        <KpiCard label="Investido" value={fmtBRL(dash.totalValue)} sub={`Médio: ${fmtBRL(dash.avgCostPerKg)}/kg`} icon={DollarSign} />
        <KpiCard label="Perda Total" value={`${formatDecimalBR(dash.perdaKg, 1)} kg`} sub={`${fmtBRL(dash.perdaValor)} • ${formatPercentBR(dash.avgLossPercent)}`} icon={TrendingDown} variant="danger" />
        <KpiCard label="Aproveitamento" value={formatPercentBR(dash.avgYieldPercent)} sub="Média geral" icon={TrendingUp} variant="success" />
        <KpiCard label="CMV Real" value={formatPercentBR(cmv)} sub={dash.revenue > 0 ? `Fat: ${fmtBRL(dash.revenue)}` : 'Sem faturamento'} icon={Percent} variant={cmv > 35 ? 'danger' : 'success'} />
        <KpiCard label="Estoque Bruto" value={`${formatDecimalBR(dash.saldoBrutoKg, 1)} kg`} sub={fmtBRL(dash.saldoBrutoKg * dash.avgCostPerKg)} icon={BarChart3} variant={dash.lowGross ? 'danger' : 'default'} />
        <KpiCard label="Estoque Limpo" value={`${formatDecimalBR(dash.estoqueLimpoKg, 1)} kg`} sub={`${lotesLimpos.length} lotes`} icon={Droplets} variant={dash.lowClean ? 'danger' : 'success'} />
      </div>

      {entries.length === 0 && dash.totalEntriesKg === 0 && (
        <div className="text-center py-8">
          <div className="w-16 h-16 mx-auto rounded-2xl bg-primary-strong flex items-center justify-center mb-3 opacity-60">
            <Fish className="w-8 h-8 text-primary-foreground" />
          </div>
          <p className="text-sm text-muted-foreground">Nenhum dado ainda</p>
          <p className="text-xs text-muted-foreground mt-1">Comece registrando uma entrada de salmão</p>
        </div>
      )}
    </div>
  );
}

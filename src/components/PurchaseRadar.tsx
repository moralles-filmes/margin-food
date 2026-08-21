import { useMemo } from 'react';
import { SalmonEntry, MetaCompraMensal } from '@/types/salmon';
import { Radar, TrendingUp, AlertTriangle, CheckCircle2, BarChart3, Activity } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { getWeeksOfMonth, calcWeeklyIdeal } from './WeeklyBreakdown';
import { parseLocalDate, fmtBRL, formatPercentBR } from '@/lib/formatters';

const fmtR = fmtBRL;

const WEEKDAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

interface Props {
  entries: SalmonEntry[];
  targetMonth: string;
  compact?: boolean;
  metas?: MetaCompraMensal[];
  concentracaoLimite?: number;
  concentracaoAlta?: number;
  categoria?: string;
}

interface WeeklyAnalysis {
  weeklyChart: { label: string; gasto: number; ideal: number; diff: number; status: string; pct: number }[];
  gastoMes: number;
  estabilidade: number;
  estabilidadeStatus: 'alta' | 'media' | 'baixa';
  estabilidadeLabel: string;
  concentracaoMax: { label: string; pct: number };
  concentracaoStatus: 'ok' | 'atencao' | 'alta';
  concentracaoLabel: string;
  insights: string[];
  weekdayChart: { label: string; value: number; pct: number }[];
  maxWeekday: { label: string; value: number };
}

export default function PurchaseRadar({ entries, targetMonth, compact, metas, concentracaoLimite = 35, concentracaoAlta = 45 }: Props) {
  const analysis = useMemo<WeeklyAnalysis>(() => {
    const [year, month] = targetMonth.split('-').map(Number);
    const weeks = getWeeksOfMonth(year, month);
    const meta = metas?.find(m => m.mesAno === targetMonth);
    const metaValor = meta?.metaValorCompra || 0;

    // Filter entries for this month
    const monthEntries = entries.filter(e => {
      const d = parseLocalDate(e.date);
      return d.getFullYear() === year && d.getMonth() === month - 1;
    });

    // Gasto per week
    const weekGastos = weeks.map(w => {
      const gasto = monthEntries.reduce((sum, e) => {
        const day = parseLocalDate(e.date).getDate();
        return day >= w.startDay && day <= w.endDay ? sum + e.totalValue : sum;
      }, 0);
      return { ...w, gasto };
    });

    const gastoMes = weekGastos.reduce((s, w) => s + w.gasto, 0);
    const semanasNoMes = weeks.length;

    // Weekly chart with ideal (use calcWeeklyIdeal if meta exists)
    let weeklyChart: WeeklyAnalysis['weeklyChart'];
    if (metaValor > 0) {
      const weekData = calcWeeklyIdeal(entries, targetMonth, metaValor);
      weeklyChart = weekData.map(w => ({
        label: w.label, gasto: w.gasto, ideal: w.ideal, diff: w.diff, status: w.status,
        pct: w.ideal > 0 ? (w.gasto / w.ideal) * 100 : (w.gasto > 0 ? 150 : 0),
      }));
    } else {
      weeklyChart = weekGastos.map(w => ({
        label: w.label, gasto: w.gasto, ideal: 0, diff: 0, status: 'ok',
        pct: 0,
      }));
    }

    // BLOCO B — Estabilidade
    const mediaSemanal = gastoMes / Math.max(1, semanasNoMes);
    const desvios = weekGastos.map(w =>
      mediaSemanal > 0 ? Math.abs(w.gasto - mediaSemanal) / mediaSemanal : 0
    );
    const mediaDesvios = desvios.length > 0 ? desvios.reduce((s, d) => s + d, 0) / desvios.length : 0;
    const estabilidade = Math.max(0, Math.min(1, 1 - mediaDesvios));
    const estabilidadeStatus: 'alta' | 'media' | 'baixa' =
      estabilidade >= 0.75 ? 'alta' : estabilidade >= 0.50 ? 'media' : 'baixa';
    const estabilidadeLabel = estabilidadeStatus === 'alta'
      ? 'Compras distribuídas de forma equilibrada'
      : estabilidadeStatus === 'media'
        ? 'Distribuição moderada entre as semanas'
        : 'Compras concentradas em poucas semanas';

    // BLOCO C — Concentração
    const concentracaoPorSemana = weekGastos.map(w => ({
      label: w.label,
      pct: gastoMes > 0 ? (w.gasto / gastoMes) * 100 : 0,
    }));
    const concentracaoMax = concentracaoPorSemana.reduce((max, w) => w.pct > max.pct ? w : max, concentracaoPorSemana[0] || { label: 'W1', pct: 0 });
    const concentracaoStatus: 'ok' | 'atencao' | 'alta' =
      concentracaoMax.pct > concentracaoAlta ? 'alta'
        : concentracaoMax.pct > concentracaoLimite ? 'atencao' : 'ok';
    const concentracaoLabel = concentracaoStatus === 'ok'
      ? 'Concentração saudável'
      : concentracaoStatus === 'atencao'
        ? 'Risco de concentração elevada em uma única semana'
        : 'Alta concentração — distribuir melhor as compras';

    // Insights (max 3, no daily references)
    const insights: string[] = [];
    const maiorSemana = weekGastos.reduce((max, w) => w.gasto > max.gasto ? w : max, weekGastos[0]);
    if (maiorSemana && maiorSemana.gasto > 0) {
      insights.push(`Semana com maior gasto: ${maiorSemana.label} — ${fmtR(maiorSemana.gasto)}`);
    }
    if (metaValor > 0) {
      const maisProxima = weeklyChart.reduce((best, w) =>
        w.ideal > 0 && Math.abs(w.pct - 100) < Math.abs((best.pct || 999) - 100) ? w : best,
        weeklyChart[0]
      );
      if (maisProxima && maisProxima.ideal > 0) {
        insights.push(`Semana mais próxima do ideal: ${maisProxima.label}`);
      }
    }
    if (concentracaoMax.pct > concentracaoLimite) {
      insights.push(`Concentração maior que ${concentracaoLimite}% detectada na ${concentracaoMax.label}`);
    }

    // Weekday analysis (behavioral only)
    const perWeekday = [0, 0, 0, 0, 0, 0, 0];
    monthEntries.forEach(e => {
      const d = parseLocalDate(e.date);
      perWeekday[d.getDay()] += e.totalValue;
    });
    const weekdayOrder = [1, 2, 3, 4, 5, 6, 0];
    const weekdayChart = weekdayOrder.map(wd => ({
      label: WEEKDAY_LABELS[wd],
      value: perWeekday[wd],
      pct: gastoMes > 0 ? (perWeekday[wd] / gastoMes) * 100 : 0,
    }));
    const maxWeekday = weekdayChart.reduce((max, w) => w.value > max.value ? w : max, weekdayChart[0]);

    return {
      weeklyChart, gastoMes, estabilidade, estabilidadeStatus, estabilidadeLabel,
      concentracaoMax, concentracaoStatus, concentracaoLabel, insights,
      weekdayChart, maxWeekday,
    };
  }, [entries, targetMonth, metas, concentracaoLimite, concentracaoAlta]);

  const {
    weeklyChart, gastoMes, estabilidade, estabilidadeStatus, estabilidadeLabel,
    concentracaoMax, concentracaoStatus, concentracaoLabel, insights,
    weekdayChart, maxWeekday,
  } = analysis;

  const estabColor = { alta: 'text-success', media: 'text-warning', baixa: 'text-destructive' };
  const estabBg = { alta: 'bg-success/10 border-success/30', media: 'bg-warning/10 border-warning/30', baixa: 'bg-destructive/10 border-destructive/30' };
  const estabIcon = { alta: <CheckCircle2 className="w-4 h-4 text-success" />, media: <AlertTriangle className="w-4 h-4 text-warning" />, baixa: <AlertTriangle className="w-4 h-4 text-destructive" /> };
  const concColor = { ok: 'text-success', atencao: 'text-warning', alta: 'text-destructive' };
  const concBg = { ok: 'bg-success/10 border-success/30', atencao: 'bg-warning/10 border-warning/30', alta: 'bg-destructive/10 border-destructive/30' };

  // Compact view (for Entries tab)
  if (compact) {
    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-up">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <Radar className="w-3.5 h-3.5 text-primary" /> Radar de Compras
        </p>

        {/* Weekly mini bars */}
        <div className="space-y-1">
          {weeklyChart.map(w => (
            <div key={w.label} className="flex items-center gap-2 text-[10px]">
              <span className="w-6 font-medium text-muted-foreground">{w.label}</span>
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    w.status === 'estourado' ? 'bg-destructive' : w.status === 'atencao' ? 'bg-warning' : 'bg-primary'
                  }`}
                  style={{ width: `${Math.min(w.pct || (gastoMes > 0 ? (w.gasto / Math.max(...weeklyChart.map(x => x.gasto || 1))) * 100 : 0), 100)}%` }}
                />
              </div>
              <span className="w-16 text-right text-muted-foreground">{fmtR(w.gasto)}</span>
            </div>
          ))}
        </div>

        {/* Quick insights */}
        <div className="space-y-1 text-[10px]">
          {insights.slice(0, 2).map((ins, i) => (
            <p key={i} className="text-muted-foreground">📊 {ins}</p>
          ))}
          <p className={`flex items-center gap-1 ${estabColor[estabilidadeStatus]}`}>
            <Activity className="w-3 h-3" />
            Estabilidade: {formatPercentBR(estabilidade * 100)}
          </p>
        </div>
      </div>
    );
  }

  // Full view
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-5 animate-fade-up">
      <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
        <Radar className="w-3.5 h-3.5 text-primary" /> Radar de Compras
      </p>

      {gastoMes === 0 ? (
        <div className="text-center py-8 space-y-2">
          <BarChart3 className="w-8 h-8 text-muted-foreground/40 mx-auto" />
          <p className="text-sm text-muted-foreground">Sem compras no período</p>
          <p className="text-[10px] text-muted-foreground">Registre compras para ver a análise semanal</p>
        </div>
      ) : (
        <>
          {/* BLOCO A — Gasto por Semana */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Gasto por Semana</p>
            <div className="h-36">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={weeklyChart} barGap={2}>
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis hide />
                  <Tooltip
                    formatter={(value: number, name: string) => [fmtR(value), name === 'gasto' ? 'Gasto Real' : 'Ideal']}
                    contentStyle={{ fontSize: 11, borderRadius: 8, border: '1px solid hsl(var(--border))' }}
                  />
                  <Bar dataKey="gasto" radius={[4, 4, 0, 0]}>
                    {weeklyChart.map((w, i) => (
                      <Cell key={i} fill={
                        w.status === 'estourado' ? 'hsl(var(--destructive))'
                          : w.status === 'atencao' ? 'hsl(var(--warning))'
                            : 'hsl(var(--primary))'
                      } />
                    ))}
                  </Bar>
                  {weeklyChart.some(w => w.ideal > 0) && (
                    <Bar dataKey="ideal" fill="hsl(var(--success) / 0.3)" radius={[4, 4, 0, 0]} />
                  )}
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Per-week details */}
            <div className="space-y-1.5 mt-3">
              {weeklyChart.map(w => (
                <div key={w.label} className="flex items-center justify-between text-[11px]">
                  <div className="flex items-center gap-1.5">
                    {w.status === 'estourado' ? <span className="text-destructive">❌</span>
                      : w.status === 'atencao' ? <span className="text-warning">⚠️</span>
                        : <span className="text-success">✅</span>}
                    <span className="font-semibold text-foreground">{w.label}</span>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-foreground font-medium">{fmtR(w.gasto)}</span>
                    {w.ideal > 0 && (
                      <span className={`text-[10px] ${w.diff >= 0 ? 'text-success' : 'text-destructive'}`}>
                        {w.diff >= 0 ? `Sobra ${fmtBRL(w.diff)}` : `Acima ${fmtBRL(Math.abs(w.diff))}`}
                      </span>
                    )}
                  </div>
                </div>
              ))}
              {!weeklyChart.some(w => w.ideal > 0) && (
                <p className="text-[10px] text-warning italic">⚠️ Meta não configurada para este mês.</p>
              )}
            </div>
          </div>

          {/* BLOCO B — Estabilidade */}
          <div className={`rounded-lg border px-3 py-3 space-y-2 ${estabBg[estabilidadeStatus]}`}>
            <div className="flex items-center gap-2">
              {estabIcon[estabilidadeStatus]}
              <p className="text-[11px] font-semibold text-foreground">Estabilidade de Compra do Mês</p>
            </div>
            <div className="flex items-center gap-3">
              <span className={`text-2xl font-bold ${estabColor[estabilidadeStatus]}`}>
                {formatPercentBR(estabilidade * 100)}
              </span>
              <div className="flex-1">
                <div className="h-2 rounded-full bg-secondary overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all ${
                      estabilidadeStatus === 'alta' ? 'bg-success' : estabilidadeStatus === 'media' ? 'bg-warning' : 'bg-destructive'
                    }`}
                    style={{ width: `${estabilidade * 100}%` }}
                  />
                </div>
              </div>
            </div>
            <p className="text-[10px] text-muted-foreground">{estabilidadeLabel}</p>
          </div>

          {/* BLOCO C — Concentração */}
          <div className={`rounded-lg border px-3 py-3 space-y-1.5 ${concBg[concentracaoStatus]}`}>
            <p className="text-[11px] font-semibold text-foreground flex items-center gap-1.5">
              <TrendingUp className="w-3.5 h-3.5" /> Concentração Semanal
            </p>
            <div className="flex items-center justify-between">
              <span className="text-[11px] text-muted-foreground">Semana com maior concentração</span>
              <span className={`text-sm font-bold ${concColor[concentracaoStatus]}`}>
                {concentracaoMax.label} — {formatPercentBR(concentracaoMax.pct)}
              </span>
            </div>
            <p className="text-[10px] text-muted-foreground">{concentracaoLabel}</p>
          </div>

          {/* Insights */}
          {insights.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Insights</p>
              {insights.map((ins, i) => (
                <p key={i} className="text-[11px] text-muted-foreground">📊 {ins}</p>
              ))}
            </div>
          )}

          {/* Weekday analysis (behavioral only) */}
          <div>
            <p className="text-[10px] text-muted-foreground mb-2 uppercase tracking-wider font-medium">Análise por Dia da Semana <span className="normal-case">(comportamental)</span></p>
            <div className="space-y-1">
              {weekdayChart.map(w => (
                <div key={w.label} className="flex items-center gap-2 text-[10px]">
                  <span className={`w-6 font-medium ${w.label === maxWeekday.label ? 'text-primary' : 'text-muted-foreground'}`}>{w.label}</span>
                  <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${w.label === maxWeekday.label ? 'bg-primary' : 'bg-muted-foreground/30'}`}
                      style={{ width: `${maxWeekday.value > 0 ? (w.value / maxWeekday.value) * 100 : 0}%` }}
                    />
                  </div>
                  <span className="w-16 text-right text-muted-foreground">{fmtR(w.value)}</span>
                  <span className="w-8 text-right text-muted-foreground">{formatPercentBR(w.pct)}</span>
                </div>
              ))}
            </div>
            <p className="text-[9px] text-muted-foreground mt-1 italic">Apenas análise histórica — não utilizado para cálculo de meta ou projeção.</p>
          </div>
        </>
      )}
    </div>
  );
}

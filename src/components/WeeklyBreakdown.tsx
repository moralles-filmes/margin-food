import { useMemo } from 'react';
import { SalmonEntry, MetaCompraMensal } from '@/types/salmon';
import { getDaysInMonth } from 'date-fns';
import { CheckCircle2, AlertTriangle, XCircle, CalendarDays, Info } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';
import { useMetaMensal } from './MetaCompraCard';
import { parseLocalDate } from '@/lib/dateUtils';
import { todayBR } from '@/lib/datetime';
import { axisProps, gridProps, tooltipProps, SEMANTIC_CHART_COLORS } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';

import { fmtBRL } from '@/lib/formatters';
const fmtR = (v: number) => fmtBRL(v);

export interface WeekDef { label: string; startDay: number; endDay: number; days: number; }

export function getWeeksOfMonth(year: number, month: number): WeekDef[] {
  const daysInMonth = getDaysInMonth(new Date(year, month - 1));
  const weeks: WeekDef[] = [
    { label: 'W1', startDay: 1, endDay: 7, days: 7 },
    { label: 'W2', startDay: 8, endDay: 14, days: 7 },
    { label: 'W3', startDay: 15, endDay: 21, days: 7 },
    { label: 'W4', startDay: 22, endDay: 28, days: 7 },
  ];
  if (daysInMonth > 28) {
    weeks.push({ label: 'W5', startDay: 29, endDay: daysInMonth, days: daysInMonth - 28 });
  }
  return weeks;
}

export interface WeekData {
  label: string;
  startDay: number;
  endDay: number;
  days: number;
  gasto: number;
  ideal: number;
  diff: number;
  status: 'ok' | 'atencao' | 'estourado';
  progressPct: number;
}

export function calcWeeklyIdeal(
  entries: SalmonEntry[],
  targetMonth: string,
  metaValor: number,
): WeekData[] {
  const [year, month] = targetMonth.split('-').map(Number);
  const weeks = getWeeksOfMonth(year, month);
  const todayStr = todayBR(); // yyyy-MM-dd in BR timezone
  const [tY, tM, tD] = todayStr.split('-').map(Number);
  const isCurrentMonth = tY === year && tM === month;
  const currentDay = isCurrentMonth ? tD : (new Date(tY, tM - 1, tD) > new Date(year, month, 0) ? 999 : 0);

  // Gasto real por semana
  const weekGastos = weeks.map(w => {
    const gasto = entries.reduce((sum, e) => {
      const d = parseLocalDate(e.date);
      if (d.getFullYear() === year && d.getMonth() === month - 1) {
        const day = d.getDate();
        if (day >= w.startDay && day <= w.endDay) return sum + e.totalValue;
      }
      return sum;
    }, 0);
    return { ...w, gasto };
  });

  const gastoTotal = weekGastos.reduce((s, w) => s + w.gasto, 0);
  const restanteMeta = metaValor - gastoTotal;

  // Dias restantes por semana (a partir de hoje)
  const diasRestantesPorSemana = weekGastos.map(w => {
    if (currentDay > w.endDay) return 0; // semana já passou
    const start = Math.max(w.startDay, currentDay);
    return w.endDay - start + 1;
  });
  const diasRestantesTotal = diasRestantesPorSemana.reduce((s, d) => s + d, 0);

  return weekGastos.map((w, i) => {
    let ideal: number;
    if (restanteMeta <= 0 || diasRestantesTotal <= 0) {
      ideal = 0;
    } else {
      ideal = restanteMeta * (diasRestantesPorSemana[i] / diasRestantesTotal);
    }

    // For past weeks, ideal = gasto (already spent, can't change)
    if (currentDay > w.endDay) {
      ideal = w.gasto;
    }

    const diff = ideal - w.gasto;
    const ratio = ideal > 0 ? w.gasto / ideal : (w.gasto > 0 ? 1.5 : 0);
    const status: 'ok' | 'atencao' | 'estourado' =
      ratio >= 1 ? 'estourado' : ratio >= 0.9 ? 'atencao' : 'ok';
    const progressPct = Math.min(ratio * 100, 150);

    return { ...w, ideal, diff, status, progressPct };
  });
}

/** Get the week label for a given day of month */
export function getWeekForDay(day: number): string {
  if (day <= 7) return 'W1';
  if (day <= 14) return 'W2';
  if (day <= 21) return 'W3';
  if (day <= 28) return 'W4';
  return 'W5';
}

interface Props {
  entries: SalmonEntry[];
  metas: MetaCompraMensal[];
  targetMonth: string;
  compact?: boolean;
  categoria?: string;
  /** Server-side weekly breakdown — if provided, used for display */
  serverWeekly?: Record<string, number>;
}

export default function WeeklyBreakdown({ entries, metas, targetMonth, compact, categoria = 'salmao', serverWeekly }: Props) {
  const { meta, projecao } = useMetaMensal(entries, metas, targetMonth, categoria);
  const metaValor = meta?.metaValorCompra || 0;

  const weekData = useMemo(
    () => calcWeeklyIdeal(entries, targetMonth, metaValor),
    [entries, targetMonth, metaValor]
  );

  const totalGasto = weekData.reduce((s, w) => s + w.gasto, 0);
  const totalIdeal = weekData.reduce((s, w) => s + w.ideal, 0);

  const statusIcon = {
    ok: <CheckCircle2 className="w-3 h-3 text-success" />,
    atencao: <AlertTriangle className="w-3 h-3 text-warning" />,
    estourado: <XCircle className="w-3 h-3 text-destructive" />,
  };

  const barColor = { ok: 'bg-success', atencao: 'bg-warning', estourado: 'bg-destructive' };

  const chartData = weekData.map(w => ({
    name: w.label,
    real: Math.round(w.gasto),
    ideal: Math.round(w.ideal),
  }));

  if (compact) {
    // Dashboard compact view
    const todayCompactStr = todayBR();
    const [year, month] = targetMonth.split('-').map(Number);
    const [tcY, tcM, tcD] = todayCompactStr.split('-').map(Number);
    const isCurrentMonth = tcY === year && tcM === month;
    const currentWeekLabel = isCurrentMonth ? getWeekForDay(tcD) : null;
    const currentWeek = currentWeekLabel ? weekData.find(w => w.label === currentWeekLabel) : null;

    return (
      <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-up">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-primary" /> Ritmo Semanal
        </p>

        {/* Current week highlight */}
        {currentWeek && meta && (
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Semana atual ({currentWeek.label})</span>
              <span className="flex items-center gap-1">{statusIcon[currentWeek.status]}</span>
            </div>
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-muted-foreground">Real / Ideal</span>
              <span className="text-foreground font-bold">{fmtR(currentWeek.gasto)} / {fmtR(currentWeek.ideal)}</span>
            </div>
            {/* Thermometer */}
            <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor[currentWeek.status]}`}
                style={{ width: `${Math.min(currentWeek.progressPct, 100)}%` }}
              />
              {/* 100% marker */}
              <div className="absolute top-0 h-full w-px bg-foreground/30" style={{ left: '100%' }} />
            </div>
            <div className="text-[10px] text-right">
              <span className={currentWeek.diff >= 0 ? 'text-success' : 'text-destructive'}>
                {currentWeek.diff >= 0 ? `Sobra ${fmtR(currentWeek.diff)}` : `Acima ${fmtR(Math.abs(currentWeek.diff))}`}
              </span>
            </div>
          </div>
        )}

        {/* Mini bars W1-W5 */}
        <div className="space-y-1">
          {weekData.map(w => (
            <div key={w.label} className="flex items-center gap-2 text-[10px]">
              <span className="w-6 text-muted-foreground font-medium">{w.label}</span>
              <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden relative">
                <div
                  className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor[w.status]}`}
                  style={{ width: `${Math.min(w.progressPct, 100)}%` }}
                />
              </div>
              <span className="w-14 text-right text-muted-foreground">{fmtR(w.gasto)}</span>
              {statusIcon[w.status]}
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Full view (Entries)
  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <CalendarDays className="w-3.5 h-3.5 text-primary" /> Ritmo Ideal por Semana
        </p>
        <div className="group relative">
          <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
          <div className="absolute right-0 top-5 z-10 w-52 p-2 bg-popover border border-border rounded-lg shadow-lg text-[10px] text-muted-foreground hidden group-hover:block">
            O ideal semanal se ajusta automaticamente conforme o gasto do mês e os dias restantes.
          </div>
        </div>
      </div>

      {/* Chart: Real vs Ideal */}
      <div className="h-36">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} barGap={2}>
            <CartesianGrid {...gridProps} />
            <XAxis dataKey="name" {...axisProps} />
            <YAxis hide />
            <Tooltip
              {...tooltipProps}
              content={<ChartTooltip valueFormatter={v => fmtR(Number(v))} />}
            />
            <Bar dataKey="real" name="Gasto Real" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
            <Bar dataKey="ideal" name="Ideal" fill={SEMANTIC_CHART_COLORS.projected} fillOpacity={0.3} radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>

      {/* Detailed table with thermometers */}
      <div className="space-y-2">
        {weekData.map(w => (
          <div key={w.label} className="space-y-1">
            <div className="flex items-center justify-between text-[11px]">
              <div className="flex items-center gap-1.5">
                {statusIcon[w.status]}
                <span className="text-foreground font-semibold">{w.label}</span>
              </div>
              <span className={`text-[10px] font-medium ${w.diff >= 0 ? 'text-success' : 'text-destructive'}`}>
                {w.diff >= 0 ? `Sobra ${fmtR(w.diff)}` : `Acima ${fmtR(Math.abs(w.diff))}`}
              </span>
            </div>
            {/* Thermometer bar */}
            <div className="relative h-3 rounded-full bg-secondary overflow-hidden">
              <div
                className={`absolute left-0 top-0 h-full rounded-full transition-all ${barColor[w.status]}`}
                style={{ width: `${Math.min(w.progressPct, 100)}%` }}
              />
              {/* 100% marker line */}
              <div className="absolute top-0 h-full w-px bg-foreground/40" style={{ left: `${Math.min(100, 100)}%` }} />
            </div>
            <div className="flex items-center justify-between text-[10px] text-muted-foreground">
              <span>{fmtR(w.gasto)} / {fmtR(w.ideal)}</span>
              <span>{w.ideal > 0 ? `${(w.progressPct).toFixed(0)}%` : '—'}</span>
            </div>
          </div>
        ))}

        {/* Footer total */}
        <div className="flex items-center justify-between text-[11px] pt-2 border-t border-border/50 font-bold">
          <span className="text-foreground">Total</span>
          <span className="text-foreground">{fmtR(totalGasto)} / {meta ? fmtR(meta.metaValorCompra) : '—'}</span>
        </div>
      </div>

      <p className="text-[9px] text-muted-foreground italic">
        O ideal semanal se ajusta automaticamente conforme o gasto do mês e os dias restantes.
      </p>

      <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-primary inline-block" /> Real</span>
        <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-sm bg-chart-projected/30 inline-block" /> Ideal</span>
        <span className="flex items-center gap-1"><CheckCircle2 className="w-2.5 h-2.5 text-success" /> OK</span>
        <span className="flex items-center gap-1"><AlertTriangle className="w-2.5 h-2.5 text-warning" /> 90%+</span>
        <span className="flex items-center gap-1"><XCircle className="w-2.5 h-2.5 text-destructive" /> 100%+</span>
      </div>
    </div>
  );
}

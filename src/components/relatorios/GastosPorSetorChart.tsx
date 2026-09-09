import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect } from 'react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts';
import { PeriodRange } from '@/components/PeriodFilter';
import { Switch } from '@/components/ui/switch';
import { Loader2, PieChart as PieIcon } from 'lucide-react';
import { format } from 'date-fns';
import { fmtBRL } from '@/lib/money';
import { SERIES_COLORS, tooltipProps } from '@/lib/chartTheme';
import { ChartTooltip } from '@/components/ui/ChartTooltip';

import { useCan } from '@/permissions/hooks';
interface SectorBreakdown {
  sector: string;
  value: number;
  percent: number;
}

interface SpendBySectorData {
  total_spend: number;
  updated_at: string;
  breakdown: SectorBreakdown[];
}

// Paleta categórica centralizada — ver src/lib/chartTheme.ts
const SECTOR_COLORS = SERIES_COLORS;

const fmtR$ = fmtBRL;

export default function GastosPorSetorChart({
 period }: { period: PeriodRange }) {
  const supabase = useSupabase();
  const canViewRbac = useCan('relatorios:cmv:view');
  const [data, setData] = useState<SpendBySectorData | null>(null);
  const [loading, setLoading] = useState(false);
  const [includeLosses, setIncludeLosses] = useState(true);

  useEffect(() => {
    async function fetch() {
      setLoading(true);
      try {
        const startStr = format(period.start, 'yyyy-MM-dd');
        const endStr = format(period.end, 'yyyy-MM-dd');
        const { data: result, error } = await supabase.rpc('get_spend_by_sector', {
          p_start_date: startStr,
          p_end_date: endStr,
          p_include_losses: includeLosses,
        });
        if (error) throw error;
        setData(result as unknown as SpendBySectorData);
      } catch (err) {
        console.error('Error fetching spend by sector:', err);
      } finally {
        setLoading(false);
      }
    }
    fetch();
  }, [period, includeLosses, supabase]);

  const breakdown = data?.breakdown || [];

  if (!canViewRbac) return null;

  return (
    <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-fade-up">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-foreground uppercase tracking-wider flex items-center gap-1.5">
          <PieIcon className="w-3.5 h-3.5 text-primary" /> 🍕 Gastos por Setor
        </p>
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Incluir perdas</span>
          <Switch checked={includeLosses} onCheckedChange={setIncludeLosses} className="scale-75" />
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center h-40">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : breakdown.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <PieIcon className="w-8 h-8 text-muted-foreground mb-2" />
          <p className="text-xs text-muted-foreground">Sem dados de saídas de estoque no período selecionado.</p>
        </div>
      ) : (
        <div className="flex items-start gap-4">
          {/* Donut chart */}
          <div className="relative w-40 h-40 shrink-0">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={breakdown}
                  dataKey="value"
                  nameKey="sector"
                  cx="50%"
                  cy="50%"
                  innerRadius={35}
                  outerRadius={60}
                  paddingAngle={2}
                  stroke="none"
                >
                  {breakdown.map((_, i) => (
                    <Cell key={i} fill={SECTOR_COLORS[i % SECTOR_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip {...tooltipProps} content={<ChartTooltip valueFormatter={v => fmtR$(Number(v))} />} />
              </PieChart>
            </ResponsiveContainer>
            {/* Center total */}
            <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
              <span className="text-[9px] text-muted-foreground">Total</span>
              <span className="text-[11px] font-bold text-foreground">{fmtR$(data?.total_spend || 0)}</span>
            </div>
          </div>

          {/* Legend list */}
          <div className="flex-1 space-y-1.5 min-w-0">
            {breakdown.map((item, i) => (
              <div key={item.sector} className="flex items-center gap-2 text-[11px]">
                <div
                  className="w-2.5 h-2.5 rounded-sm shrink-0"
                  style={{ backgroundColor: SECTOR_COLORS[i % SECTOR_COLORS.length] }}
                />
                <span className="text-foreground font-medium truncate flex-1">{item.sector}</span>
                <span className="text-muted-foreground whitespace-nowrap">{fmtR$(item.value)}</span>
                <span className="text-primary font-bold whitespace-nowrap">{item.percent}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

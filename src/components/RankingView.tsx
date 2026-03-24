import { useState, useMemo } from 'react';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { Trophy, Medal, DollarSign, TrendingDown, TrendingUp, Scale, Hash } from 'lucide-react';
import PeriodFilter, { PeriodRange, getDefaultRange, filterByPeriod } from './PeriodFilter';
import { fmtBRL, formatPercentBR, formatDecimalBR, formatIntegerBR } from '@/lib/formatters';

interface RankingViewProps {
  store: ReturnType<typeof useSalmonStore>;
}

const medals = ['🥇', '🥈', '🥉'];

export default function RankingView({ store }: RankingViewProps) {
  const { entries, manipulations } = store;
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());

  const filteredEntries = filterByPeriod(entries, period);
  const filteredManips = filterByPeriod(manipulations, period);

  const stats = useMemo(() => {
    const supplierNames = [...new Set(filteredEntries.map(e => e.supplier))];
    return supplierNames.map(name => {
      const sEntries = filteredEntries.filter(e => e.supplier === name);
      const sManips = filteredManips.filter(m => m.supplier === name);
      const totalKg = sEntries.reduce((s, e) => s + e.grossKg, 0);
      const totalValue = sEntries.reduce((s, e) => s + e.totalValue, 0);
      const avgPrice = totalKg > 0 ? totalValue / totalKg : 0;
      const avgLoss = sManips.length > 0 ? sManips.reduce((s, m) => s + m.lossPercent, 0) / sManips.length : 0;
      const avgYield = sManips.length > 0 ? sManips.reduce((s, m) => s + m.yieldPercent, 0) / sManips.length : 0;
      const cleanKg = sManips.reduce((s, m) => s + m.cleanKg, 0);
      const costPerCleanKg = cleanKg > 0 ? totalValue / cleanKg : 0;
      const score = avgYield - avgLoss - (avgPrice / 10);
      return { name, totalKg, totalValue, avgPrice, avgLoss, avgYield, costPerCleanKg, purchases: sEntries.length, score };
    }).sort((a, b) => b.score - a.score);
  }, [filteredEntries, filteredManips]);

  // Best/worst lot
  const lotStats = useMemo(() => {
    const lots = [...new Set(filteredManips.map(m => m.lot).filter(Boolean))];
    return lots.map(lot => {
      const lm = filteredManips.filter(m => m.lot === lot);
      const avgYield = lm.reduce((s, m) => s + m.yieldPercent, 0) / lm.length;
      const avgLoss = lm.reduce((s, m) => s + m.lossPercent, 0) / lm.length;
      return { lot, avgYield, avgLoss, count: lm.length };
    }).sort((a, b) => b.avgYield - a.avgYield);
  }, [filteredManips]);

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">Ranking de Fornecedores</h2>
        <p className="text-xs text-muted-foreground">Score baseado em rendimento, perda e preço</p>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {/* Lot ranking */}
      {lotStats.length > 0 && (
        <div className="bg-card border border-border rounded-xl p-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2 font-medium">Ranking de Lotes</p>
          <div className="flex items-center gap-3 text-[11px]">
            {lotStats[0] && (
               <span className="text-success">🏆 Melhor: <strong>{lotStats[0].lot}</strong> ({formatPercentBR(lotStats[0].avgYield)} rend.)</span>
             )}
             {lotStats.length > 1 && lotStats[lotStats.length - 1] && (
               <span className="text-destructive">⚠️ Pior: <strong>{lotStats[lotStats.length - 1].lot}</strong> ({formatPercentBR(lotStats[lotStats.length - 1].avgYield)})</span>
            )}
          </div>
        </div>
      )}

      {stats.length === 0 ? (
        <div className="text-center py-12">
          <Trophy className="w-12 h-12 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm text-muted-foreground">Sem dados no período</p>
        </div>
      ) : (
        <div className="space-y-3">
          {stats.map((s, i) => (
            <div key={s.name} className={`bg-card border rounded-xl p-4 animate-fade-up ${i === 0 ? 'border-accent/40 glow-salmon' : 'border-border'}`} style={{ animationDelay: `${i * 80}ms` }}>
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                  <span className="text-2xl">{medals[i] || `#${i + 1}`}</span>
                  <div>
                    <p className="text-sm font-bold text-foreground">{s.name}</p>
                    <p className="text-[10px] text-muted-foreground">{s.purchases} compras • {formatIntegerBR(s.totalKg)} kg total</p>
                   </div>
                 </div>
                 <div className={`px-2 py-1 rounded-lg text-xs font-bold ${i === 0 ? 'gradient-gold text-accent-foreground' : 'bg-secondary text-muted-foreground'}`}>
                   {formatDecimalBR(s.score, 1)} pts
                 </div>
               </div>
               <div className="grid grid-cols-3 gap-2">
                 <StatItem icon={DollarSign} label="R$/kg" value={fmtBRL(s.avgPrice)} />
                 <StatItem icon={TrendingUp} label="Rendimento" value={formatPercentBR(s.avgYield)} color="text-success" />
                 <StatItem icon={TrendingDown} label="Perda" value={formatPercentBR(s.avgLoss)} color="text-destructive" />
                 <StatItem icon={Scale} label="R$/kg limpo" value={fmtBRL(s.costPerCleanKg)} color="text-primary" />
                 <StatItem icon={Hash} label="Volume" value={`${formatIntegerBR(s.totalKg)} kg`} />
                <StatItem icon={Medal} label="Compras" value={`${s.purchases}`} />
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function StatItem({ icon: Icon, label, value, color }: { icon: typeof DollarSign; label: string; value: string; color?: string }) {
  return (
    <div className="bg-secondary/50 rounded-lg p-2">
      <div className="flex items-center gap-1 mb-0.5">
        <Icon className="w-3 h-3 text-muted-foreground" />
        <span className="text-[9px] text-muted-foreground uppercase tracking-wider">{label}</span>
      </div>
      <p className={`text-xs font-semibold ${color || 'text-foreground'}`}>{value}</p>
    </div>
  );
}

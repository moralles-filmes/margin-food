import { useState } from 'react';
import { fmtBRL } from '@/lib/money';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { Warehouse, Droplets, Clock, Settings2, Check, AlertTriangle, Zap, ShieldAlert } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { toast } from 'sonner';
import PeriodFilter, { PeriodRange, getDefaultRange, filterByPeriod } from './PeriodFilter';
import { formatDisplayBR, formatInBR } from '@/lib/datetime';
import ValidadeAlertCard from './ValidadeAlertCard';

function parseLocalDate(d: string) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }

interface StockViewProps {
  store: ReturnType<typeof useSalmonStore>;
  onStartManipulation?: (entryId: string) => void;
}

export default function StockView({ store, onStartManipulation }: StockViewProps) {
  const { stock, stockConfig, setStockConfig, avgDailyConsumption, daysRemaining, entries, manipulations, staleLots, lotesLimpos } = store;
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());
  const [showConfig, setShowConfig] = useState(false);
  const [minGross, setMinGross] = useState(String(stockConfig.minGrossKg));
  const [minClean, setMinClean] = useState(String(stockConfig.minCleanKg));
  const [staleDays, setStaleDays] = useState(String(stockConfig.staleDaysLimit || 7));

  const filteredEntries = filterByPeriod(entries, period);
  const filteredManips = filterByPeriod(manipulations, period);

  const lowGross = stock.grossKg <= stockConfig.minGrossKg;
  const lowClean = stock.cleanKg <= stockConfig.minCleanKg;

  const handleSaveConfig = () => {
    setStockConfig({
      ...stockConfig,
      minGrossKg: parseDecimal(minGross) ?? 0,
      minCleanKg: parseDecimal(minClean) ?? 0,
      staleDaysLimit: parseDecimal(staleDays) ?? 7,
    });
    toast.success('Configurações atualizadas!');
    setShowConfig(false);
  };

  const movements = [
    ...filteredEntries.map(e => ({ type: 'in' as const, date: e.date, desc: `+${e.grossKg} kg bruto • ${e.supplier}`, id: e.id })),
    ...filteredManips.map(m => ({ type: 'out' as const, date: m.date, desc: `-${m.grossKg} kg bruto → ${m.cleanKg} kg limpo`, id: m.id })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

  // Clean lots grouped by status
  const frescos = lotesLimpos.filter(l => l.status === 'FRESCO');
  const venceHoje = lotesLimpos.filter(l => l.status === 'VENCE_HOJE');
  const vencidos = lotesLimpos.filter(l => l.status === 'VENCIDO');

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Estoque</h2>
          <p className="text-xs text-muted-foreground">Bruto, limpo e rastreabilidade</p>
        </div>
        <Button variant="outline" size="sm" className="gap-1.5 text-xs border-border text-muted-foreground" onClick={() => setShowConfig(!showConfig)}>
          <Settings2 className="w-3.5 h-3.5" /> Config
        </Button>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {showConfig && (
        <div className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
          <p className="text-xs font-semibold text-foreground">⚙️ Configurações de Estoque</p>
          <div className="grid grid-cols-3 gap-3">
            <div><Label className="text-[11px] text-muted-foreground">Mín. Bruto (kg)</Label><DecimalInput value={minGross} onValueChange={(raw) => setMinGross(raw)} maxDecimals={1} placeholder="0" className="bg-secondary border-border text-foreground" /></div>
            <div><Label className="text-[11px] text-muted-foreground">Mín. Limpo (kg)</Label><DecimalInput value={minClean} onValueChange={(raw) => setMinClean(raw)} maxDecimals={1} placeholder="0" className="bg-secondary border-border text-foreground" /></div>
            <div><Label className="text-[11px] text-muted-foreground">Alerta parado (dias)</Label><DecimalInput value={staleDays} onValueChange={(raw) => setStaleDays(raw)} maxDecimals={0} placeholder="7" className="bg-secondary border-border text-foreground" /></div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowConfig(false)}>Cancelar</Button>
            <Button size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1" onClick={handleSaveConfig}><Check className="w-3.5 h-3.5" /> Salvar</Button>
          </div>
        </div>
      )}

      {/* Stale Lots Alert */}
      {staleLots.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 rounded-xl p-4 space-y-2 animate-scale-in">
          <p className="text-xs font-semibold text-destructive flex items-center gap-1.5"><AlertTriangle className="w-4 h-4" /> Lotes Parados ({staleLots.length})</p>
          {staleLots.slice(0, 5).map(lot => (
            <div key={lot.entryId} className="flex items-center justify-between bg-card/50 rounded-lg p-2.5">
              <div>
                <span className="text-xs font-semibold text-foreground">{lot.lot || 'Sem lote'}</span>
                <span className="text-[10px] text-muted-foreground ml-2">{lot.supplier}</span>
                <p className="text-[10px] text-destructive">⚠️ Parado há {lot.daysSinceMovement} dias — saldo {lot.balanceKg.toFixed(1)} kg</p>
              </div>
              {onStartManipulation && (
                <Button size="sm" variant="outline" className="h-7 text-[10px] border-primary/30 text-primary gap-1" onClick={() => onStartManipulation(lot.entryId)}>
                  <Zap className="w-3 h-3" /> Manipular
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Validity Alert */}
      <ValidadeAlertCard lotesLimpos={lotesLimpos} />

      {/* Gross Stock */}
      <div className={`bg-card border rounded-xl p-4 ${lowGross ? 'border-destructive/50 glow-salmon' : 'border-border'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lowGross ? 'bg-destructive/15' : 'bg-primary/15'}`}>
            <Warehouse className={`w-4 h-4 ${lowGross ? 'text-destructive' : 'text-primary'}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Estoque Bruto</p>
            {lowGross && <p className="text-[10px] text-destructive">⚠️ Abaixo do mínimo ({stockConfig.minGrossKg} kg)</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><p className="text-2xl font-display font-bold text-foreground">{stock.grossKg.toFixed(1)}</p><p className="text-[10px] text-muted-foreground">kg disponível</p></div>
          <div><p className="text-lg font-display font-bold text-warning">{fmtBRL(stock.grossValue)}</p><p className="text-[10px] text-muted-foreground">valor estoque</p></div>
          <div><p className="text-lg font-display font-bold text-primary">{fmtBRL(stock.avgCostPerKg)}</p><p className="text-[10px] text-muted-foreground">custo médio/kg</p></div>
        </div>
      </div>

      {/* Clean Stock */}
      <div className={`bg-card border rounded-xl p-4 ${lowClean ? 'border-destructive/50' : 'border-success/30'}`}>
        <div className="flex items-center gap-2 mb-3">
          <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lowClean ? 'bg-destructive/15' : 'bg-success/15'}`}>
            <Droplets className={`w-4 h-4 ${lowClean ? 'text-destructive' : 'text-success'}`} />
          </div>
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider">Estoque Limpo</p>
            {lowClean && <p className="text-[10px] text-destructive">⚠️ Abaixo do mínimo ({stockConfig.minCleanKg} kg)</p>}
          </div>
        </div>
        <div className="grid grid-cols-3 gap-3">
          <div><p className="text-2xl font-display font-bold text-foreground">{stock.cleanKg.toFixed(1)}</p><p className="text-[10px] text-muted-foreground">kg limpo</p></div>
          <div><p className="text-lg font-display font-bold text-foreground flex items-center gap-1"><Clock className="w-3.5 h-3.5 text-muted-foreground" />{daysRemaining !== Infinity ? daysRemaining : '∞'}</p><p className="text-[10px] text-muted-foreground">dias restantes</p></div>
          <div><p className="text-lg font-display font-bold text-foreground">{avgDailyConsumption.toFixed(1)}</p><p className="text-[10px] text-muted-foreground">kg/dia consumo</p></div>
        </div>

        {/* Clean lots detail */}
        {lotesLimpos.length > 0 && (
          <div className="mt-3 pt-3 border-t border-border/30 space-y-1.5">
            <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium">Lotes Limpos Rastreados</p>
            {lotesLimpos.slice(0, 8).map(l => (
              <div key={l.manipulacaoId} className="flex items-center justify-between text-[11px] py-1">
                <div className="flex items-center gap-2">
                  <span className={`w-2 h-2 rounded-full ${l.status === 'FRESCO' ? 'bg-success' : l.status === 'VENCE_HOJE' ? 'bg-accent' : 'bg-destructive'}`} />
                  <span className="text-foreground font-medium">{l.lote || '—'}</span>
                  <span className="text-muted-foreground">{l.fornecedor}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-success font-bold">{l.kgRestante.toFixed(1)} kg</span>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded ${l.status === 'FRESCO' ? 'bg-success/10 text-success' : l.status === 'VENCE_HOJE' ? 'bg-warning/10 text-warning' : 'bg-destructive/10 text-destructive'}`}>
                    {l.status === 'FRESCO' ? 'Fresco' : l.status === 'VENCE_HOJE' ? 'Vence hoje' : 'Vencido'}
                  </span>
                  <span className="text-[10px] text-muted-foreground">Val: {formatInBR(parseLocalDate(l.dataValidade), 'dd/MM')}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Movement History */}
      <div className="bg-card border border-border rounded-xl p-4">
        <p className="text-xs text-muted-foreground font-medium uppercase tracking-wider mb-3">Movimentações no Período</p>
        <div className="space-y-2">
          {movements.slice(0, 15).map(item => (
            <div key={item.id} className="flex items-center gap-2 text-[11px]">
              <div className={`w-1.5 h-1.5 rounded-full ${item.type === 'in' ? 'bg-success' : 'bg-primary'}`} />
              <span className="text-muted-foreground">{formatDisplayBR(parseLocalDate(item.date))}</span>
              <span className="text-foreground">{item.desc}</span>
            </div>
          ))}
          {movements.length === 0 && <p className="text-[11px] text-muted-foreground text-center py-2">Sem movimentações no período</p>}
        </div>
      </div>
    </div>
  );
}

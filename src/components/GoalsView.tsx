import { useState } from 'react';
import { useCan } from '@/permissions/hooks';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { NumericInput } from '@/components/ui/numeric-input';
import { parseDecimal } from '@/components/ui/decimal-input';
import { Users, Fish, Target, Check } from 'lucide-react';
import { toast } from 'sonner';
import PeriodFilter, { PeriodRange, getDefaultRange, filterByPeriod } from './PeriodFilter';
import { todayBR, formatDateBR, formatDecimalBR, formatPercentBR, parseLocalDate } from '@/lib/formatters';

function parseLocalDateGoals(d: string) { const [y, m, dd] = d.split('-').map(Number); return new Date(y, m - 1, dd); }

interface GoalsViewProps {
  store: ReturnType<typeof useSalmonStore>;
}

export default function GoalsView({ store }: GoalsViewProps) {
  const { dailyRecords, manipulations, metasProvisionadas, saveMetaProvisionada } = store;
  const canEditMetas = useCan('salmon:metas:edit');
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());
  const [showMetaForm, setShowMetaForm] = useState(false);
  const [metaForm, setMetaForm] = useState({ mesAno: todayBR().slice(0, 7), gramas: '' });

  const filtered = filterByPeriod(dailyRecords, period);
  const filteredManips = filterByPeriod(manipulations, period);

  const totalCustomers = filtered.reduce((s, r) => s + r.customers, 0);
  const totalCleanKg = filteredManips.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0);
  const totalFish = filteredManips.reduce((s, m) => s + m.fishCount, 0);

  const kgPerCustomer = totalCustomers > 0 ? totalCleanKg / totalCustomers : 0;
  const fishPerCustomer = totalCustomers > 0 ? totalFish / totalCustomers : 0;

  // Provisioned goal for current view month
  const hojeBR = todayBR();
  const mesAnoAtual = hojeBR.slice(0, 7); // 'yyyy-MM'
  const metaProv = metasProvisionadas.find(m => m.mesAno === mesAnoAtual);

  // Month calculation for meta comparison
  const [gy, gm] = mesAnoAtual.split('-').map(Number);
  const monthStart = new Date(gy, gm - 1, 1);
  const monthRecords = dailyRecords.filter(r => {
    const [y, mo, d] = r.date.split('-').map(Number);
    return new Date(y, mo - 1, d) >= monthStart;
  });
  const monthManips = manipulations.filter(m => {
    const [y, mo, d] = m.date.split('-').map(Number);
    return new Date(y, mo - 1, d) >= monthStart;
  });
  const monthCustomers = monthRecords.reduce((s, r) => s + r.customers, 0);
  const monthConsumed = monthManips.reduce((s, m) => s + (m.cleanKg - m.leftoverKg), 0);
  const realGramas = monthCustomers > 0 ? (monthConsumed * 1000) / monthCustomers : 0;
  const diffGramas = metaProv ? realGramas - metaProv.metaGramasPorCliente : 0;
  const pctDiff = metaProv && metaProv.metaGramasPorCliente > 0 ? (diffGramas / metaProv.metaGramasPorCliente) * 100 : 0;

  const getMetaStatus = () => {
    if (!metaProv) return null;
    if (realGramas <= metaProv.metaGramasPorCliente) return { label: '✅ Dentro da meta', color: 'text-success' };
    if (realGramas <= metaProv.metaGramasPorCliente * 1.1) return { label: '⚠️ Levemente acima', color: 'text-warning' };
    return { label: '❌ Muito acima', color: 'text-destructive' };
  };
  const metaStatus = getMetaStatus();

  const handleMetaSave = async () => {
    const gramas = parseDecimal(metaForm.gramas);
    if (!gramas || gramas <= 0) { toast.error('Informe a meta em gramas'); return; }
    await saveMetaProvisionada({ mesAno: metaForm.mesAno, metaGramasPorCliente: gramas });
    toast.success('Meta provisionada salva!');
    setShowMetaForm(false);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Metas por Cliente</h2>
          <p className="text-xs text-muted-foreground">Provisionado vs realizado (g/cliente)</p>
        </div>
        <div className="flex gap-1.5">
          <Button onClick={() => setShowMetaForm(!showMetaForm)} size="sm" variant="outline" className="gap-1 text-xs border-primary/30 text-primary">
            <Target className="w-3.5 h-3.5" /> Meta
          </Button>
        </div>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {/* Info banner: faturamento migrado */}
      <div className="bg-muted/50 border border-border rounded-lg p-3 text-xs text-muted-foreground">
        💡 O lançamento de faturamento diário foi migrado para <strong>Financeiro → Fechamento de Caixa</strong>.
      </div>

      {/* Meta Provisionada Card */}
      {metaProv && (
        <div className="bg-card border border-primary/20 rounded-xl p-4 space-y-3 animate-fade-up">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Target className="w-3.5 h-3.5 text-primary" /> Meta Provisionada — {mesAnoAtual}
            </p>
            {metaStatus && <span className={`text-xs font-bold ${metaStatus.color}`}>{metaStatus.label}</span>}
          </div>
          <div className="grid grid-cols-4 gap-2">
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Meta</p>
              <p className="text-sm font-bold text-foreground">{metaProv.metaGramasPorCliente}g</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Realizado</p>
               <p className="text-sm font-bold text-foreground">{formatDecimalBR(realGramas, 0)}g</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">Diferença</p>
              <p className={`text-sm font-bold ${diffGramas > 0 ? 'text-destructive' : 'text-success'}`}>{diffGramas > 0 ? '+' : ''}{formatDecimalBR(diffGramas, 0)}g</p>
            </div>
            <div className="bg-secondary/50 rounded-lg p-2 text-center">
              <p className="text-[10px] text-muted-foreground">% desvio</p>
              <p className={`text-sm font-bold ${pctDiff > 10 ? 'text-destructive' : pctDiff > 0 ? 'text-warning' : 'text-success'}`}>{pctDiff > 0 ? '+' : ''}{formatPercentBR(pctDiff / 100)}</p>
            </div>
          </div>
          <div className="text-[10px] text-muted-foreground">
            {monthCustomers} clientes • {formatDecimalBR(monthConsumed, 1)} kg consumido no mês
          </div>
        </div>
      )}

      {!metaProv && (
        <div className="bg-card border border-border rounded-xl p-4 text-center">
          <Target className="w-8 h-8 mx-auto text-muted-foreground/30 mb-2" />
          <p className="text-xs text-muted-foreground">Nenhuma meta provisionada para {mesAnoAtual}</p>
          {canEditMetas && (
            <Button size="sm" variant="outline" className="mt-2 text-xs border-primary/30 text-primary" onClick={() => setShowMetaForm(true)}>
              Definir Meta
            </Button>
          )}
        </div>
      )}

      {/* Meta Form */}
      {showMetaForm && canEditMetas && (
        <div className="bg-card border border-primary/20 rounded-xl p-4 space-y-3 animate-scale-in">
          <p className="text-xs font-semibold text-foreground">Definir Meta g/Cliente</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Mês/Ano</Label>
              <Input type="month" value={metaForm.mesAno} onChange={e => setMetaForm(f => ({ ...f, mesAno: e.target.value }))} className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Meta (gramas/cliente)</Label>
              <NumericInput
                value={metaForm.gramas}
                onValueChange={(raw) => setMetaForm(f => ({ ...f, gramas: raw }))}
                decimals={0}
                placeholder="150"
                className="bg-secondary border-border text-foreground"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="ghost" size="sm" onClick={() => setShowMetaForm(false)}>Cancelar</Button>
            <Button size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1" onClick={handleMetaSave}><Check className="w-3.5 h-3.5" /> Salvar</Button>
          </div>
        </div>
      )}

      {/* KPIs — only client/consumption metrics, no revenue */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Users className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider">Clientes</span></div>
          <p className="text-lg font-display font-bold text-foreground">{totalCustomers}</p>
        </div>
        <div className="bg-card border border-border rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-1"><Fish className="w-3.5 h-3.5 text-primary" /><span className="text-[10px] text-muted-foreground uppercase tracking-wider">g/Cliente</span></div>
          <p className="text-lg font-display font-bold text-foreground">{formatDecimalBR(kgPerCustomer * 1000, 0)}g</p>
          <p className="text-[10px] text-muted-foreground">{formatDecimalBR(fishPerCustomer, 1)} peixes/cliente</p>
        </div>
      </div>

      {/* Daily records list — show only clients, no revenue or add form */}
      <div className="space-y-2">
        {filtered.map((r, i) => (
          <div key={r.id} className="bg-card border border-border rounded-xl p-3 flex items-center justify-between animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <div>
              <p className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(r.date))}</p>
              <div className="flex items-center gap-3 mt-0.5">
                <span className="text-sm text-foreground">{r.customers} clientes</span>
              </div>
            </div>
          </div>
        ))}
        {filtered.length === 0 && <p className="text-center text-sm text-muted-foreground py-8">Nenhum registro no período</p>}
      </div>
    </div>
  );
}

import { useState, useMemo } from 'react';
import { SalmonEntry, MetaCompraMensal, Supplier } from '@/types/salmon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CurrencyInput } from '@/components/ui/brl-input';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Calculator, ArrowRight, CheckCircle2, AlertTriangle, XCircle, Zap } from 'lucide-react';
import { useMetaMensal, calcProjecao, getMetaStatus } from './MetaCompraCard';
import { calcWeeklyIdeal, getWeekForDay } from './WeeklyBreakdown';
import { calcBudgetPressure } from './BudgetPressure';
import { todayBR } from '@/lib/datetime';

import { fmtBRL, normalizeBRLMoneyToNumber } from '@/lib/formatters';
const fmtR = (v: number) => fmtBRL(v);

/** Typed simulation result */
interface SimMetrics {
  gastoMes: number; pct: number; status: string; restante: number;
  mediaSemanal: number; projecaoFim: number; difMeta: number;
  weekGasto: number; weekIdeal: number;
}
interface SimPressure {
  pressaoAjustada: number; pressaoStatus: string;
  risco: number; riscoStatus: string;
  indiceConsistencia: number; historicoSuficiente: boolean;
}
interface SimNoMeta { noMeta: true; }
interface SimResult {
  noMeta: false; alerts: { type: 'error' | 'warning'; msg: string }[];
  before: SimMetrics; after: SimMetrics;
  meta: MetaCompraMensal; simWeekLabel: string;
  pressureBefore: SimPressure; pressureAfter: SimPressure;
}
type SimOutput = SimNoMeta | SimResult | null;

interface SimuladorProps {
  open: boolean;
  onClose: () => void;
  entries: SalmonEntry[];
  metas: MetaCompraMensal[];
  activeSuppliers: Supplier[];
  targetMonth: string;
  onApply?: (data: { date: string; totalValue: string; lot: string; supplier: string; grossKg: string }) => void;
}

function StatusBadge({ status }: { status: string }) {
  const cfg: Record<string, { icon: typeof CheckCircle2; color: string; label: string }> = {
    boa: { icon: CheckCircle2, color: 'text-success', label: '✅ Boa' },
    perto: { icon: AlertTriangle, color: 'text-warning', label: '⚠️ Atenção' },
    estourado: { icon: XCircle, color: 'text-destructive', label: '❌ Estourado' },
    'sem-meta': { icon: AlertTriangle, color: 'text-muted-foreground', label: 'Sem meta' },
    ok: { icon: CheckCircle2, color: 'text-success', label: '✅ OK' },
    atencao: { icon: AlertTriangle, color: 'text-warning', label: '⚠️ Atenção' },
  };
  const c = cfg[status] || cfg['sem-meta'];
  const Icon = c.icon;
  return <span className={`flex items-center gap-1 text-[10px] font-bold ${c.color}`}><Icon className="w-3 h-3" />{c.label}</span>;
}

function CompareRow({ label, before, after, highlight }: { label: string; before: string; after: string; highlight?: boolean }) {
  return (
    <div className="grid grid-cols-[1fr_80px_16px_80px] gap-1 items-center text-[11px] py-0.5">
      <span className="text-muted-foreground truncate">{label}</span>
      <span className="text-right text-foreground">{before}</span>
      <ArrowRight className="w-3 h-3 text-muted-foreground mx-auto" />
      <span className={`text-right font-bold ${highlight ? 'text-destructive' : 'text-foreground'}`}>{after}</span>
    </div>
  );
}

export default function SimuladorCompra({ open, onClose, entries, metas, activeSuppliers, targetMonth, onApply }: SimuladorProps) {
  const [simDate, setSimDate] = useState(todayBR());
  const [simValor, setSimValor] = useState('');
  const [simLot, setSimLot] = useState('');
  const [simSupplier, setSimSupplier] = useState('');
  const [simKg, setSimKg] = useState('');
  const [simulated, setSimulated] = useState(false);

  const valor = normalizeBRLMoneyToNumber(simValor) || 0;
  const simMonth = simDate.slice(0, 7);

  const realMeta = useMetaMensal(entries, metas, simMonth);
  const metaValor = realMeta.meta?.metaValorCompra || 0;

  const sim: SimOutput = useMemo(() => {
    if (!simulated || valor <= 0) return null;

    const meta = metas.find(m => m.mesAno === simMonth);
    if (!meta) return { noMeta: true } as SimNoMeta;

    // Before
    const projBefore = calcProjecao(entries, simMonth, meta);
    const weeklyBefore = calcWeeklyIdeal(entries, simMonth, meta.metaValorCompra);
    const pctBefore = meta.metaValorCompra > 0 ? (projBefore.gastoMes / meta.metaValorCompra) * 100 : 0;
    const statusBefore = getMetaStatus(pctBefore, meta.alertaAmareloPercent, meta.alertaVermelhoPercent);

    // After
    const fakeEntry: SalmonEntry = {
      id: '__sim__', date: simDate, lot: simLot, sif: '', supplier: simSupplier,
      totalValue: valor, boxes: 0, units: 0, grossKg: parseDecimal(simKg) || 0, notes: '', createdAt: '',
    };
    const simEntries = [...entries, fakeEntry];
    const projAfter = calcProjecao(simEntries, simMonth, meta);
    const weeklyAfter = calcWeeklyIdeal(simEntries, simMonth, meta.metaValorCompra);
    const pctAfter = meta.metaValorCompra > 0 ? (projAfter.gastoMes / meta.metaValorCompra) * 100 : 0;
    const statusAfter = getMetaStatus(pctAfter, meta.alertaAmareloPercent, meta.alertaVermelhoPercent);

    // Week of simulated date
    const simDay = parseInt(simDate.split('-')[2]);
    const simWeekLabel = getWeekForDay(simDay);
    const weekBefore = weeklyBefore.find(w => w.label === simWeekLabel);
    const weekAfter = weeklyAfter.find(w => w.label === simWeekLabel);

    // Budget Pressure before/after
    const simWeekIndex = simDay <= 7 ? 1 : simDay <= 14 ? 2 : simDay <= 21 ? 3 : simDay <= 28 ? 4 : 5;
    const pressureBefore = calcBudgetPressure(entries, simMonth, meta.metaValorCompra);
    const pressureAfter = calcBudgetPressure(entries, simMonth, meta.metaValorCompra, undefined, valor, simWeekIndex);

    // Alerts
    const alerts: { type: 'error' | 'warning'; msg: string }[] = [];
    if (projAfter.gastoMes >= meta.metaValorCompra) alerts.push({ type: 'error', msg: 'Essa compra estoura a meta mensal.' });
    if (projAfter.projecaoFimMes >= meta.metaValorCompra && projBefore.projecaoFimMes < meta.metaValorCompra) alerts.push({ type: 'warning', msg: 'A projeção indica estouro até o fim do mês.' });
    if (weekAfter && weekBefore && weekAfter.gasto > weekAfter.ideal && weekBefore.gasto <= (weekBefore.ideal || 0)) alerts.push({ type: 'warning', msg: `Essa compra estoura o orçamento ideal da semana ${simWeekLabel}.` });
    if (pressureAfter.riscoStatus === 'alto' && pressureBefore.riscoStatus !== 'alto') alerts.push({ type: 'warning', msg: 'Risco de estouro passa para ALTO após essa compra.' });

    return {
      noMeta: false, alerts,
      before: { gastoMes: projBefore.gastoMes, pct: pctBefore, status: statusBefore, restante: meta.metaValorCompra - projBefore.gastoMes, mediaSemanal: projBefore.mediaSemanal, projecaoFim: projBefore.projecaoFimMes, difMeta: projBefore.difMeta, weekGasto: weekBefore?.gasto || 0, weekIdeal: weekBefore?.ideal || 0 },
      after: { gastoMes: projAfter.gastoMes, pct: pctAfter, status: statusAfter, restante: meta.metaValorCompra - projAfter.gastoMes, mediaSemanal: projAfter.mediaSemanal, projecaoFim: projAfter.projecaoFimMes, difMeta: projAfter.difMeta, weekGasto: weekAfter?.gasto || 0, weekIdeal: weekAfter?.ideal || 0 },
      meta, simWeekLabel,
      pressureBefore, pressureAfter,
    };
  }, [simulated, valor, simDate, entries, metas, simMonth, simLot, simSupplier, simKg]);

  const handleSimulate = () => {
    if (valor <= 0) return;
    setSimulated(true);
  };

  const handleClear = () => {
    setSimValor(''); setSimLot(''); setSimSupplier(''); setSimKg('');
    setSimDate(todayBR());
    setSimulated(false);
  };

  const handleApply = () => {
    onApply?.({ date: simDate, totalValue: simValor, lot: simLot, supplier: simSupplier, grossKg: simKg });
    onClose();
    handleClear();
  };

  return (
    <Sheet open={open} onOpenChange={o => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="max-h-[90vh] overflow-y-auto rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2 text-base">
            <Calculator className="w-5 h-5 text-primary" /> Simulador de Compra
          </SheetTitle>
        </SheetHeader>

        <div className="space-y-4 pt-4">
          {/* Form */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">Valor (R$) *</Label>
              <CurrencyInput value={simValor} onValueChange={(raw) => { setSimValor(raw); setSimulated(false); }} showPrefix maxDecimals={2} placeholder="0,00" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Data</Label>
              <Input type="date" value={simDate} onChange={e => { setSimDate(e.target.value); setSimulated(false); }} className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Fornecedor</Label>
              <select value={simSupplier} onChange={e => setSimSupplier(e.target.value)} className="w-full h-10 rounded-md border border-border bg-secondary px-3 text-sm text-foreground">
                <option value="">—</option>
                {activeSuppliers.map(s => <option key={s.id} value={s.name}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Kg bruto</Label>
              <DecimalInput value={simKg} onValueChange={(raw) => setSimKg(raw)} maxDecimals={1} placeholder="0" className="bg-secondary border-border text-foreground" />
            </div>
          </div>

          <div className="flex gap-2">
            <Button onClick={handleSimulate} size="sm" className="gradient-salmon text-primary-foreground border-0 gap-1.5 flex-1" disabled={!simValor}>
              <Zap className="w-4 h-4" /> Simular
            </Button>
            <Button onClick={handleClear} variant="outline" size="sm">Limpar</Button>
          </div>

          {/* Results */}
          {simulated && sim && (
            <>
              {sim.noMeta ? (
                <div className="bg-secondary rounded-xl p-4 text-center">
                  <p className="text-sm text-muted-foreground">Meta não configurada para {simMonth}</p>
                </div>
              ) : (() => {
                const s = sim as SimResult;
                return (
                <div className="space-y-3">
                  {/* Alerts */}
                  {s.alerts?.length > 0 && (
                    <div className="space-y-1.5">
                      {s.alerts.map((a, i) => (
                        <div key={i} className={`rounded-lg px-3 py-2 flex items-center gap-2 text-[11px] ${a.type === 'error' ? 'bg-destructive/10 border border-destructive/30 text-destructive' : 'bg-warning/10 border border-warning/30 text-warning'}`}>
                          {a.type === 'error' ? <XCircle className="w-3.5 h-3.5 shrink-0" /> : <AlertTriangle className="w-3.5 h-3.5 shrink-0" />}
                          {a.msg}
                        </div>
                      ))}
                    </div>
                  )}

                  {/* A) Meta do mês */}
                  <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Meta do Mês</p>
                    <CompareRow label="Gasto" before={fmtR(s.before.gastoMes)} after={fmtR(s.after.gastoMes)} />
                    <CompareRow label="% da meta" before={`${s.before.pct.toFixed(1)}%`} after={`${s.after.pct.toFixed(1)}%`} highlight={s.after.pct >= 100} />
                    <div className="grid grid-cols-[1fr_80px_16px_80px] gap-1 items-center text-[11px] py-0.5">
                      <span className="text-muted-foreground">Status</span>
                      <span className="text-right"><StatusBadge status={s.before.status} /></span>
                      <ArrowRight className="w-3 h-3 text-muted-foreground mx-auto" />
                      <span className="text-right"><StatusBadge status={s.after.status} /></span>
                    </div>
                    <CompareRow label="Restante" before={fmtR(s.before.restante)} after={fmtR(s.after.restante)} highlight={s.after.restante < 0} />
                  </div>

                  {/* B) Projeção mensal (base semanal) */}
                  <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Projeção Mensal (Base Semanal)</p>
                    <CompareRow label="Média semanal" before={`${fmtR(s.before.mediaSemanal)}/sem`} after={`${fmtR(s.after.mediaSemanal)}/sem`} />
                    <CompareRow label="Projeção fim" before={fmtR(s.before.projecaoFim)} after={fmtR(s.after.projecaoFim)} highlight={s.after.difMeta < 0} />
                    <CompareRow
                      label="Tendência"
                      before={s.before.difMeta >= 0 ? `Sobra ${fmtR(s.before.difMeta)}` : `Estoura ${fmtR(Math.abs(s.before.difMeta))}`}
                      after={s.after.difMeta >= 0 ? `Sobra ${fmtR(s.after.difMeta)}` : `Estoura ${fmtR(Math.abs(s.after.difMeta))}`}
                      highlight={s.after.difMeta < 0}
                    />
                  </div>

                  {/* C) Semana */}
                  <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                    <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Semana {s.simWeekLabel}</p>
                    <CompareRow label="Gasto semana" before={fmtR(s.before.weekGasto)} after={fmtR(s.after.weekGasto)} />
                    <CompareRow label="Ideal semana" before={fmtR(s.before.weekIdeal)} after={fmtR(s.after.weekIdeal)} />
                    <CompareRow label="Diferença" before={fmtR(s.before.weekIdeal - s.before.weekGasto)} after={fmtR(s.after.weekIdeal - s.after.weekGasto)} highlight={s.after.weekGasto > s.after.weekIdeal} />
                  </div>

                  {/* D) Pressão Orçamentária */}
                  {s.pressureBefore && (
                    <div className="bg-secondary/50 rounded-xl p-3 space-y-1">
                      <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Pressão & Risco</p>
                      <CompareRow
                        label="Pressão ajustada"
                        before={`${(s.pressureBefore.pressaoAjustada * 100).toFixed(0)}%`}
                        after={`${(s.pressureAfter.pressaoAjustada * 100).toFixed(0)}%`}
                        highlight={s.pressureAfter.pressaoStatus === 'critico'}
                      />
                      <CompareRow
                        label="Risco de estouro"
                        before={`${(s.pressureBefore.risco * 100).toFixed(0)}%`}
                        after={`${(s.pressureAfter.risco * 100).toFixed(0)}%`}
                        highlight={s.pressureAfter.riscoStatus === 'alto'}
                      />
                      {s.pressureAfter.historicoSuficiente && (
                        <CompareRow
                          label="Consistência"
                          before={`${(s.pressureBefore.indiceConsistencia * 100).toFixed(0)}%`}
                          after={`${(s.pressureAfter.indiceConsistencia * 100).toFixed(0)}%`}
                        />
                      )}
                    </div>
                  )}
                  {onApply && (
                    <Button onClick={handleApply} size="sm" variant="outline" className="w-full gap-1.5 text-xs">
                      <ArrowRight className="w-3.5 h-3.5" /> Usar esses valores na Entrada
                    </Button>
                  )}
                </div>
                );
              })()}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

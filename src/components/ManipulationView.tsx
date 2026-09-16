import { useState, useMemo } from 'react';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { DecimalInput, parseDecimal } from '@/components/ui/decimal-input';
import { Plus, Check, ChevronLeft, ChevronRight, Edit2, Trash2, AlertTriangle, Snowflake, Package, Lock, AlertCircle, Zap, DollarSign, Printer, Loader2 } from 'lucide-react';
import { useCan } from '@/permissions/hooks';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import PeriodFilter, { PeriodRange, getDefaultRange, filterByPeriod } from './PeriodFilter';
import { todayBR, formatDateBR, fmtBRL, formatPercentBR, formatFixedBR } from '@/lib/formatters';
import SmartSuggestionCard from './SmartSuggestionCard';
import EtiquetaModal from './EtiquetaModal';
import { Manipulation } from '@/types/salmon';

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

interface ManipulationViewProps {
  store: ReturnType<typeof useSalmonStore>;
  preSelectedEntryId?: string | null;
  onClearPreSelected?: () => void;
}

interface WizardData {
  entryId: string;
  lot: string;
  sif: string;
  supplier: string;
  fishCount: string;
  grossKg: string;
  cleanKg: string;
  divergenciaLote: boolean;
  divergenciaMotivo: string;
}

const emptyWizard: WizardData = {
  entryId: '', lot: '', sif: '', supplier: '',
  fishCount: '', grossKg: '', cleanKg: '',
  divergenciaLote: false, divergenciaMotivo: '',
};

export default function ManipulationView({ store, preSelectedEntryId, onClearPreSelected }: ManipulationViewProps) {
  const toast = useScopedToast();
  const { manipulations, addManipulation, updateManipulation, deleteManipulation, recordLeftover, stock, availableLots, suppliers, suggestedLot, entries, stockConfig, smartSuggestion } = store;
  const canCreate = useCan('salmon:manipulacao:create');
  const canDelete = useCan('salmon:manipulacao:delete');
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());
  const [selectedDate, setSelectedDate] = useState<string>(todayBR());
  const [wizard, setWizard] = useState<WizardData>(emptyWizard);
  const [step, setStep] = useState(0);
  const [confirmed, setConfirmed] = useState<boolean[]>([false, false, false, false, false, false]);
  const [showWizard, setShowWizard] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [leftoverForm, setLeftoverForm] = useState<{ id: string; kg: string } | null>(null);
  const [showDivergenceDialog, setShowDivergenceDialog] = useState(false);
  const [pendingDivergenceStep, setPendingDivergenceStep] = useState<number | null>(null);
  const [etiquetaManip, setEtiquetaManip] = useState<Manipulation | null>(null);

  const filtered = filterByPeriod(manipulations, period);

  const selectedLot = useMemo(() => {
    return availableLots.find(l => l.entryId === wizard.entryId) || null;
  }, [availableLots, wizard.entryId]);

  const effectiveLotBalance = useMemo(() => {
    if (!selectedLot) return 0;
    if (editingId) {
      const editingManip = manipulations.find(m => m.id === editingId);
      return selectedLot.balanceKg + (editingManip?.grossKg || 0);
    }
    return selectedLot.balanceKg;
  }, [selectedLot, editingId, manipulations]);

  const grossKg = parseDecimal(wizard.grossKg) ?? 0;
  const cleanKg = parseDecimal(wizard.cleanKg) ?? 0;
  const exceedsLotStock = grossKg > effectiveLotBalance;

  const lossKg = grossKg - cleanKg;
  const lossPercent = grossKg > 0 ? (lossKg / grossKg) * 100 : 0;
  const yieldPercent = grossKg > 0 ? (cleanKg / grossKg) * 100 : 0;

  const lotCostPerKg = selectedLot?.costPerKgBruto || 0;
  const custoManipulacao = grossKg * lotCostPerKg;
  const custoKgLimpo = cleanKg > 0 ? custoManipulacao / cleanKg : 0;

  const perdaValorPreview = lossKg * lotCostPerKg;
  const valorTotalBrutoPreview = grossKg * lotCostPerKg;
  const valorTotalLimpoPreview = cleanKg * lotCostPerKg;

  const perdaPercentAlerta = stockConfig.perdaPercentAlerta ?? 15;
  const perdaValorAlerta = stockConfig.perdaValorAlerta ?? 500;

  const supplierHistory = useMemo(() => {
    if (!selectedLot) return null;
    const supManips = manipulations.filter(m => m.supplier === selectedLot.supplier);
    if (supManips.length === 0) return null;
    const avgYield = supManips.reduce((s, m) => s + m.yieldPercent, 0) / supManips.length;
    return { avgYield, count: supManips.length };
  }, [selectedLot, manipulations]);

  // Compute dataValidade for etiqueta
  const getDataValidade = (dateStr: string) => {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(y, m - 1, d + (stockConfig.validadePadraoDias || 2));
    return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`;
  };

  const handleLotSelect = (entryId: string) => {
    const lot = availableLots.find(l => l.entryId === entryId);
    if (!lot) return;
    if (lot.costPerKgBruto <= 0) {
      toast.error('Este lote não tem custo cadastrado. Corrija a Entrada antes de manipular.');
      return;
    }
    setWizard(w => ({
      ...w,
      entryId: lot.entryId, lot: lot.lot, sif: lot.sif, supplier: lot.supplier,
      divergenciaLote: false, divergenciaMotivo: '',
    }));
  };

  const startNewWizard = (preEntryId?: string) => {
    const targetId = preEntryId || suggestedLot?.entryId;
    const initialWizard = { ...emptyWizard };
    if (targetId) {
      const lot = availableLots.find(l => l.entryId === targetId);
      if (lot && lot.costPerKgBruto > 0) {
        initialWizard.entryId = lot.entryId;
        initialWizard.lot = lot.lot;
        initialWizard.sif = lot.sif;
        initialWizard.supplier = lot.supplier;
      }
    }
    setWizard(initialWizard);
    setStep(0);
    setConfirmed([false, false, false, false, false, false]);
    setShowWizard(true);
    setEditingId(null);
    onClearPreSelected?.();
  };

  useMemo(() => {
    if (canCreate && preSelectedEntryId && !showWizard) {
      startNewWizard(preSelectedEntryId);
    }
  }, [preSelectedEntryId, canCreate]);

  const handleUseSuggestion = (kgBruto: number, _kgLimpo: number, peixes: number) => {
    if (!canCreate) return;
    if (!showWizard) startNewWizard();
    setWizard(w => ({
      ...w,
      grossKg: String(kgBruto),
      fishCount: String(peixes),
    }));
    toast.success('Sugestão aplicada! Preencha o kg limpo após manipulação.');
  };

  const startEdit = (m: typeof manipulations[0]) => {
    setSelectedDate(m.date);
    setWizard({
      entryId: m.entryId, lot: m.lot, sif: m.sif, supplier: m.supplier,
      fishCount: String(m.fishCount), grossKg: String(m.grossKg), cleanKg: String(m.cleanKg),
      divergenciaLote: m.divergenciaLote || false, divergenciaMotivo: m.divergenciaMotivo || '',
    });
    setStep(0);
    setConfirmed([true, true, true, true, true, true]);
    setShowWizard(true);
    setEditingId(m.id);
  };

  const confirmStep = () => {
    if (step === 0 && !wizard.entryId) { toast.error('Selecione um lote'); return; }
    if (step === 4 && exceedsLotStock) { toast.error(`Kg bruto excede saldo do lote (${formatFixedBR(effectiveLotBalance, 1)} kg)`); return; }
    if (step === 5 && cleanKg > grossKg) { toast.error('Kg limpo não pode ser maior que bruto'); return; }
    const newConfirmed = [...confirmed];
    newConfirmed[step] = true;
    setConfirmed(newConfirmed);
    if (step < 5) setStep(step + 1);
  };

  const handleStepInputEnter = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (step === 5 && confirmed[step]) {
      handleSave();
    } else {
      confirmStep();
    }
  };

  const goBack = () => {
    if (step > 0) {
      const newConfirmed = [...confirmed];
      newConfirmed[step] = false;
      setConfirmed(newConfirmed);
      setStep(step - 1);
    }
  };

  const handleSave = async () => {
    const gKg = parseDecimal(wizard.grossKg) ?? 0;
    const cKg = parseDecimal(wizard.cleanKg) ?? 0;
    if (!wizard.entryId) { toast.error('Selecione um lote'); return; }
    if (!gKg || !cKg) { toast.error('Preencha kg bruto e limpo'); return; }
    if (cKg > gKg) { toast.error('Kg limpo > kg bruto'); return; }
    if (gKg > effectiveLotBalance) { toast.error('Excede saldo do lote'); return; }
    if (lotCostPerKg <= 0) { toast.error('Lote sem custo — corrija a entrada'); return; }

    const data = {
      entryId: wizard.entryId,
      date: selectedDate,
      lot: wizard.lot, sif: wizard.sif, supplier: wizard.supplier,
      fishCount: parseInt(wizard.fishCount) || 0,
      grossKg: gKg, cleanKg: cKg, leftoverKg: 0,
      leftoverRecorded: false,
      custoKgBrutoLote: lotCostPerKg,
      custoManipulacao: gKg * lotCostPerKg,
      custoKgLimpo: cKg > 0 ? (gKg * lotCostPerKg) / cKg : 0,
      divergenciaLote: wizard.divergenciaLote || undefined,
      divergenciaMotivo: wizard.divergenciaMotivo || undefined,
    };

    if (editingId) {
      updateManipulation(editingId, data);
      toast.success('Manipulação atualizada!');
      setShowWizard(false);
      setEditingId(null);
    } else {
      const saved = await addManipulation(data);
      toast.success('Manipulação registrada! Estoque limpo atualizado.');
      setShowWizard(false);
      setEditingId(null);
      // Show etiqueta modal
      setEtiquetaManip(saved);
    }
  };

  const [leftoverSaving, setLeftoverSaving] = useState(false);

  const handleLeftoverSave = async () => {
    if (!canCreate || !leftoverForm || leftoverSaving) return;
    const kg = parseDecimal(leftoverForm.kg) ?? 0;
    const m = manipulations.find(x => x.id === leftoverForm.id);
    if (!m) return;
    if (kg > m.cleanKg) { toast.error('Sobra não pode exceder kg limpo'); return; }
    setLeftoverSaving(true);
    try {
      await recordLeftover(m.id, kg);
      const consumoReal = m.cleanKg - kg;
      toast.success(`Sobra: ${kg} kg • Consumo real: ${formatFixedBR(consumoReal, 1)} kg`);
      setLeftoverForm(null);
    } catch {
      // error already toasted in store
    } finally {
      setLeftoverSaving(false);
    }
  };

  const handleDivergenceConfirm = (motivo: string) => {
    setWizard(w => ({ ...w, divergenciaLote: true, divergenciaMotivo: motivo }));
    setShowDivergenceDialog(false);
    if (pendingDivergenceStep !== null) {
      const newConfirmed = [...confirmed];
      newConfirmed[pendingDivergenceStep] = true;
      setConfirmed(newConfirmed);
      if (pendingDivergenceStep < 5) setStep(pendingDivergenceStep + 1);
      setPendingDivergenceStep(null);
    }
  };

  const stepLabels = [
    'Selecione o lote', 'SIF (do lote)', 'Fornecedor (do lote)',
    'Quantos peixes você irá manipular?', 'Quantos quilos bruto tem o total dos peixes?',
    'Quantos quilos limpos sobrou?',
  ];

  const supplierObj = selectedLot ? suppliers.find(s => s.name === selectedLot.supplier) : null;
  const isSupplierInactive = supplierObj ? !supplierObj.active : false;
  const isSuggested = (entryId: string) => suggestedLot?.entryId === entryId;
  const selectedIsNotSuggested = wizard.entryId && suggestedLot && wizard.entryId !== suggestedLot.entryId;

  const expirationLabel = (lot: { expirationDate?: string; daysToExpire?: number }) => {
    if (!lot.expirationDate) return 'Sem validade';
    const d = lot.daysToExpire;
    if (d === undefined) return `Val. ${formatDateBR(parseLocalDate(lot.expirationDate))}`;
    if (d < 0) return `Vencido há ${Math.abs(d)}d`;
    if (d === 0) return 'Vence hoje';
    return `Vence em ${d}d`;
  };
  const expirationTone = (lot: { expirationStatus?: 'VENCIDO' | 'VENCE_EM_BREVE' | 'OK' }) =>
    lot.expirationStatus === 'VENCIDO' ? 'text-destructive'
      : lot.expirationStatus === 'VENCE_EM_BREVE' ? 'text-warning'
      : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Manipulação</h2>
          <p className="text-xs text-muted-foreground">Estoque bruto: {formatFixedBR(stock.grossKg, 1)} kg • Limpo: {formatFixedBR(stock.cleanKg, 1)} kg</p>
        </div>
        {!showWizard && canCreate && (
          <Button onClick={() => startNewWizard()} size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1.5">
            <Plus className="w-4 h-4" /> Nova
          </Button>
        )}
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {/* Smart Suggestion */}
      {!showWizard && canCreate && (
        <SmartSuggestionCard suggestion={smartSuggestion} onUseSuggestion={handleUseSuggestion} />
      )}

      {/* Wizard */}
      {showWizard && (
        <div className="space-y-3 animate-scale-in">
          <div className="bg-card border border-primary/30 rounded-xl p-4 glow-salmon">
            <div className="flex items-center justify-between mb-3">
              <div>
                <p className="text-sm text-muted-foreground uppercase tracking-wider font-medium">Manipulação do dia</p>
                <DateInput value={selectedDate} onValueChange={setSelectedDate} className="h-8 w-auto text-sm bg-secondary border-border text-foreground mt-1" />
              </div>
              <Button variant="ghost" size="sm" className="text-sm text-muted-foreground" onClick={() => setShowWizard(false)}>Cancelar</Button>
            </div>

            <div className="flex gap-1 mb-4">
              {stepLabels.map((_, i) => (
                <div key={i} className={`h-1 flex-1 rounded-full transition-all ${i <= step ? 'bg-primary-strong' : 'bg-secondary'}`} />
              ))}
            </div>

            <div className="bg-secondary/50 rounded-xl p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs text-muted-foreground uppercase tracking-wider">Pergunta {step + 1}/6</span>
                {confirmed[step] && <span className="text-xs text-success flex items-center gap-1"><Check className="w-3 h-3" /> Confirmado</span>}
              </div>

              <p className="text-base font-semibold text-foreground">{stepLabels[step]}</p>

              {/* STEP 0: Lot Select */}
              {step === 0 && (
                <div className="space-y-2">
                  {availableLots.length === 0 ? (
                    <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
                      <Package className="w-4 h-4" /> Nenhum lote disponível em estoque.
                    </div>
                  ) : (
                    <>
                      {suggestedLot && (
                        <button onClick={() => handleLotSelect(suggestedLot.entryId)} className="w-full p-2.5 rounded-lg bg-success/10 border border-success/30 text-left text-sm hover:bg-success/20 transition-all flex items-center gap-2">
                          <Zap className="w-4 h-4 text-success shrink-0" />
                          <div className="flex-1">
                            <span className="text-sm font-bold text-success">
                              {suggestedLot.expirationDate ? 'Usar o que vence primeiro (recomendado)' : 'Usar o lote mais antigo (recomendado)'}
                            </span>
                            <p className="text-xs text-muted-foreground">
                              {suggestedLot.lot || 'Sem lote'} • {suggestedLot.supplier} • {formatFixedBR(suggestedLot.balanceKg, 1)} kg • {expirationLabel(suggestedLot)}
                            </p>
                          </div>
                        </button>
                      )}
                      {selectedIsNotSuggested && (
                        <div className="flex items-center gap-2 p-2 rounded-lg bg-warning/10 border border-warning/20 text-xs text-warning">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" /> Existe outro lote que vence antes deste.
                        </div>
                      )}
                      <div className="space-y-1.5 max-h-52 overflow-y-auto">
                        {availableLots.map(lot => (
                          <button key={lot.entryId} onClick={() => handleLotSelect(lot.entryId)} className={`w-full text-left p-3 rounded-lg border transition-all text-sm ${wizard.entryId === lot.entryId ? 'border-primary bg-primary/10' : 'border-border bg-card hover:border-primary/50'}`}>
                            <div className="flex items-center justify-between gap-2">
                              <div className="flex flex-wrap items-center gap-2 min-w-0">
                                <span className="font-semibold text-foreground">{lot.lot || 'Sem lote'}</span>
                                {isSuggested(lot.entryId) && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-success/15 text-success font-bold">1º a sair</span>}
                                {lot.expirationStatus === 'VENCIDO' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive font-bold">Vencido</span>}
                                {lot.expirationStatus === 'VENCE_EM_BREVE' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-warning/15 text-warning font-bold">{expirationLabel(lot)}</span>}
                                {lot.isStale && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-destructive/15 text-destructive">Parado {lot.daysSinceMovement}d</span>}
                              </div>
                              <span className="text-sm font-bold text-primary shrink-0">{formatFixedBR(lot.balanceKg, 1)} kg</span>
                            </div>
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 mt-1 text-xs text-muted-foreground">
                              <span>SIF: {lot.sif || '—'}</span><span>•</span><span>{lot.supplier || '—'}</span><span>•</span>
                              <span className={expirationTone(lot)}>
                                {lot.expirationDate ? `Val. ${formatDateBR(parseLocalDate(lot.expirationDate))}` : `Ent. ${formatDateBR(parseLocalDate(lot.entryDate))}`}
                              </span><span>•</span>
                              <span className="text-warning">{fmtBRL(lot.costPerKgBruto)}/kg</span>
                            </div>
                            {lot.avgYield !== undefined && <div className="text-xs text-warning mt-1">Rend. histórico: {formatPercentBR(lot.avgYield)}</div>}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                  {selectedLot && (
                    <div className="mt-2 p-3 rounded-lg bg-primary/5 border border-primary/20 space-y-1">
                      <p className="text-xs text-muted-foreground uppercase tracking-wider">Detalhes do lote</p>
                      <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                        <span className="text-muted-foreground">Fornecedor:</span>
                        <span className="text-foreground font-medium flex flex-wrap items-center gap-1">
                          {selectedLot.supplier}
                          {isSupplierInactive && <span className="text-[10px] px-1 py-0.5 rounded bg-destructive/10 text-destructive">Inativo</span>}
                        </span>
                        <span className="text-muted-foreground">SIF:</span><span className="text-foreground">{selectedLot.sif || '—'}</span>
                        <span className="text-muted-foreground">Saldo:</span><span className="text-primary font-bold">{formatFixedBR(selectedLot.balanceKg, 1)} kg</span>
                        <span className="text-muted-foreground">Custo/kg:</span><span className="text-warning font-bold">{fmtBRL(selectedLot.costPerKgBruto)}</span>
                        <span className="text-muted-foreground">Entrada:</span><span className="text-foreground">{formatDateBR(parseLocalDate(selectedLot.entryDate))}</span>
                        <span className="text-muted-foreground">Validade:</span>
                        <span className={`font-medium ${expirationTone(selectedLot)}`}>
                          {selectedLot.expirationDate
                            ? `${formatDateBR(parseLocalDate(selectedLot.expirationDate))} (${expirationLabel(selectedLot)})`
                            : 'Não informada'}
                        </span>
                      </div>
                      {selectedLot.expirationStatus === 'VENCIDO' && (
                        <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                          <AlertTriangle className="w-3 h-3 shrink-0" /> Lote vencido — confirme com a chefia antes de manipular.
                        </p>
                      )}
                      {supplierHistory && (
                        <p className="text-xs text-warning mt-1">📊 Fornecedor: {formatPercentBR(supplierHistory.avgYield)} rendimento ({supplierHistory.count} manip.)</p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {step === 1 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={wizard.sif} readOnly className="bg-secondary border-border text-foreground opacity-70 text-base md:text-base" />
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  <p className="text-xs text-muted-foreground">Vinculado ao lote selecionado</p>
                  {!wizard.sif && <p className="text-xs text-destructive flex items-center gap-1"><AlertCircle className="w-3 h-3" /> Lote sem SIF.</p>}
                </div>
              )}

              {step === 2 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Input value={wizard.supplier} readOnly className="bg-secondary border-border text-foreground opacity-70 text-base md:text-base" />
                    <Lock className="w-4 h-4 text-muted-foreground" />
                  </div>
                  {isSupplierInactive && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Fornecedor inativo.</p>}
                  <p className="text-xs text-muted-foreground">Vinculado ao lote</p>
                </div>
              )}

              {step === 3 && (
                <DecimalInput value={wizard.fishCount} onValueChange={(raw) => setWizard(w => ({ ...w, fishCount: raw }))} onKeyDown={handleStepInputEnter} maxDecimals={0} placeholder="0" className="bg-card border-border text-foreground h-12 text-lg md:text-lg" autoFocus />
              )}

              {step === 4 && (
                <div className="space-y-2">
                  <DecimalInput value={wizard.grossKg} onValueChange={(raw) => setWizard(w => ({ ...w, grossKg: raw }))} onKeyDown={handleStepInputEnter} maxDecimals={1} placeholder="0,0" className={`bg-card border-border text-foreground h-12 text-lg md:text-lg ${exceedsLotStock ? 'border-destructive' : ''}`} autoFocus />
                  {exceedsLotStock && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Excede saldo ({formatFixedBR(effectiveLotBalance, 1)} kg)</p>}
                  <p className="text-xs text-muted-foreground">Saldo: {formatFixedBR(effectiveLotBalance, 1)} kg • Custo: {fmtBRL(lotCostPerKg)}/kg</p>
                </div>
              )}

              {step === 5 && (
                <div className="space-y-2">
                  <DecimalInput value={wizard.cleanKg} onValueChange={(raw) => setWizard(w => ({ ...w, cleanKg: raw }))} onKeyDown={handleStepInputEnter} maxDecimals={1} placeholder="0,0" className={`bg-card border-border text-foreground h-12 text-lg md:text-lg ${cleanKg > grossKg ? 'border-destructive' : ''}`} autoFocus />
                  {cleanKg > grossKg && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="w-3 h-3" /> Kg limpo não pode ser maior que bruto</p>}
                </div>
              )}

              {step > 0 && (
                <div className="flex flex-wrap gap-1.5 pt-1">
                  {confirmed[0] && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Lote: {wizard.lot || '—'}</span>}
                  {step > 1 && confirmed[1] && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">SIF: {wizard.sif || '—'}</span>}
                  {step > 2 && confirmed[2] && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Forn: {wizard.supplier || '—'}</span>}
                  {step > 3 && confirmed[3] && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Peixes: {wizard.fishCount}</span>}
                  {step > 4 && confirmed[4] && <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/10 text-primary">Bruto: {wizard.grossKg} kg</span>}
                </div>
              )}

              <div className="flex items-center justify-between pt-2">
                <Button variant="ghost" size="sm" onClick={goBack} disabled={step === 0} className="text-sm gap-1">
                  <ChevronLeft className="w-3.5 h-3.5" /> Voltar
                </Button>
                {step === 5 && confirmed[step] ? (
                  <Button size="sm" className="bg-primary-strong text-primary-foreground border-0 text-sm" onClick={handleSave}>Salvar Manipulação</Button>
                ) : (
                  <Button size="sm" className="bg-primary-strong text-primary-foreground border-0 text-sm gap-1" onClick={confirmStep} disabled={step === 0 && availableLots.length === 0}>
                    Confirmar <ChevronRight className="w-3.5 h-3.5" />
                  </Button>
                )}
              </div>
            </div>

            {/* Live preview */}
            {grossKg > 0 && cleanKg > 0 && (
              <div className="mt-3 p-2.5 rounded-lg bg-secondary/30 space-y-2">
                <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">📦 Dados Operacionais</p>
                <div className="grid grid-cols-2 gap-2">
                  <div className="text-center"><p className="text-xs text-muted-foreground">Kg Bruto</p><p className="text-base font-bold text-foreground">{formatFixedBR(grossKg, 1)} kg</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Kg Limpo</p><p className="text-base font-bold text-success">{formatFixedBR(cleanKg, 1)} kg</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Perda</p><p className="text-base font-bold text-destructive">{formatFixedBR(lossKg, 1)} kg ({formatPercentBR(lossPercent)})</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Aproveitamento</p><p className="text-base font-bold text-success">{formatPercentBR(yieldPercent)}</p></div>
                </div>

                <div className="border-t border-border/30 pt-2">
                  <p className="text-xs text-muted-foreground uppercase tracking-wider font-medium">💰 Dados Financeiros</p>
                  <div className="grid grid-cols-3 gap-2 mt-1">
                    <div className="text-center"><p className="text-xs text-muted-foreground">Valor bruto</p><p className="text-sm font-bold text-foreground">{fmtBRL(valorTotalBrutoPreview)}</p></div>
                    <div className="text-center"><p className="text-xs text-muted-foreground">Aproveitado</p><p className="text-sm font-bold text-success">{fmtBRL(valorTotalLimpoPreview)}</p></div>
                    <div className="text-center"><p className="text-xs text-muted-foreground">Perda R$</p>
                      <p className={`text-sm font-bold ${(lossPercent > perdaPercentAlerta || perdaValorPreview > perdaValorAlerta) ? 'text-destructive animate-pulse' : 'text-destructive'}`}>
                        {fmtBRL(perdaValorPreview)}
                      </p>
                    </div>
                  </div>
                  {(lossPercent > perdaPercentAlerta || perdaValorPreview > perdaValorAlerta) && (
                    <div className="mt-1.5 p-1.5 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      Perda acima do limite
                    </div>
                  )}
                </div>

                <div className="border-t border-border/30 pt-2 grid grid-cols-2 gap-2">
                  <div className="text-center"><p className="text-xs text-muted-foreground">Custo manipulação</p><p className="text-base font-bold text-warning">{fmtBRL(custoManipulacao)}</p></div>
                  <div className="text-center"><p className="text-xs text-muted-foreground">Custo/kg limpo</p><p className="text-base font-bold text-warning">{fmtBRL(custoKgLimpo)}</p></div>
                </div>

                {/* Validity preview */}
                <div className="border-t border-border/30 pt-2 text-center">
                  <p className="text-xs text-muted-foreground">📅 Validade estimada</p>
                  <p className="text-base font-bold text-warning">{formatDateBR(parseLocalDate(getDataValidade(selectedDate)))}</p>
                </div>
              </div>
            )}

            {wizard.divergenciaLote && (
              <div className="mt-2 p-2 rounded-lg bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 mt-0.5 shrink-0" />
                <div><p className="font-medium">Divergência registrada</p><p>{wizard.divergenciaMotivo}</p></div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Divergence Dialog */}
      {showDivergenceDialog && (
        <DivergenceDialog
          onConfirm={handleDivergenceConfirm}
          onCancel={() => { setShowDivergenceDialog(false); setPendingDivergenceStep(null); }}
        />
      )}

      {/* Etiqueta Modal */}
      {etiquetaManip && (
        <EtiquetaModal
          manipulation={etiquetaManip}
          dataValidade={getDataValidade(etiquetaManip.date)}
          onClose={() => setEtiquetaManip(null)}
        />
      )}

      {/* List */}
      <div className="space-y-2">
        {filtered.map((m, i) => (
          <div key={m.id} className="bg-card border border-border rounded-xl p-4 animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-foreground">{m.supplier || 'Sem fornecedor'}</span>
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{m.lot}</span>
                {m.divergenciaLote && <span className="text-[9px] px-1 py-0.5 rounded bg-destructive/10 text-destructive">⚠ Divergência</span>}
              </div>
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(m.date))}</span>
                <button onClick={() => setEtiquetaManip(m)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-warning/10 hover:text-warning" title="Imprimir etiqueta">
                  <Printer className="w-3.5 h-3.5" />
                </button>
                {canCreate && (
                  <button onClick={() => startEdit(m)} className="p-1.5 rounded-lg text-muted-foreground hover:bg-secondary"><Edit2 className="w-3.5 h-3.5" /></button>
                )}
                {canDelete && (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button className="p-1.5 rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive"><Trash2 className="w-3.5 h-3.5" /></button>
                  </AlertDialogTrigger>
                  <AlertDialogContent>
                    <AlertDialogHeader>
                      <AlertDialogTitle>Excluir manipulação?</AlertDialogTitle>
                      <AlertDialogDescription>Lote {m.lot} • {m.grossKg} kg bruto — devolverá saldo ao estoque.</AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel>Cancelar</AlertDialogCancel>
                      <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={async () => { try { await deleteManipulation(m.id); toast.success('Manipulação excluída!'); } catch { /* erro já tratado no store */ } }}>Excluir</AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
                )}
              </div>
            </div>

            {/* Operational data */}
            <div className="grid grid-cols-4 gap-1.5 text-[11px]">
              <div><span className="text-muted-foreground">Peixes</span><br /><span className="font-medium text-foreground">{m.fishCount}</span></div>
              <div><span className="text-muted-foreground">Bruto</span><br /><span className="font-medium text-foreground">{m.grossKg} kg</span></div>
              <div><span className="text-muted-foreground">Limpo</span><br /><span className="font-medium text-success">{m.cleanKg} kg</span></div>
              <div>
                <span className="text-muted-foreground">Perda</span><br />
                <span className="font-medium text-destructive">{formatFixedBR(m.lossKg, 1)} kg • {formatPercentBR(m.lossPercent)}</span>
                {m.perdaValor != null && (
                  <span className={`block font-bold ${((m.lossPercent > perdaPercentAlerta) || ((m.perdaValor || 0) > perdaValorAlerta)) ? 'text-destructive' : 'text-destructive/70'}`}>
                    {fmtBRL(m.perdaValor)}
                  </span>
                )}
              </div>
            </div>

            {/* Financial row */}
            {m.valorTotalBruto != null && (
              <div className="grid grid-cols-3 gap-1.5 text-[11px] mt-1.5 pt-1.5 border-t border-border/30">
                <div><span className="text-muted-foreground">Valor bruto</span><p className="font-medium text-foreground">{fmtBRL(m.valorTotalBruto || 0)}</p></div>
                <div><span className="text-muted-foreground">Aproveitado</span><p className="font-medium text-success">{fmtBRL(m.valorTotalLimpo || 0)}</p></div>
                <div><span className="text-muted-foreground">Perda R$</span>
                  <p className={`font-bold ${((m.lossPercent > perdaPercentAlerta) || ((m.perdaValor || 0) > perdaValorAlerta)) ? 'text-destructive' : 'text-destructive/70'}`}>{fmtBRL(m.perdaValor || 0)}</p>
                </div>
              </div>
            )}

            {/* Cost row */}
            {m.custoManipulacao != null && (
              <div className="grid grid-cols-3 gap-1.5 text-[11px] mt-1.5 pt-1.5 border-t border-border/30">
                <div className="flex items-center gap-1"><DollarSign className="w-3 h-3 text-warning" /><span className="text-muted-foreground">Custo:</span> <span className="font-medium text-warning">{fmtBRL(m.custoManipulacao)}</span></div>
                <div><span className="text-muted-foreground">R$/kg bruto:</span> <span className="font-medium text-foreground">{fmtBRL(m.custoKgBrutoLote || 0)}</span></div>
                <div><span className="text-muted-foreground">R$/kg limpo:</span> <span className="font-medium text-warning">{fmtBRL(m.custoKgLimpo || 0)}</span></div>
              </div>
            )}

            <div className="flex items-center justify-between mt-2 pt-2 border-t border-border/50">
              <div className="flex items-center gap-3 text-[11px]">
                <span className="text-muted-foreground">Rend: <span className="text-primary font-medium">{formatPercentBR(m.yieldPercent)}</span></span>
                {m.leftoverRecorded && <span className="text-warning">🧊 Sobra: {m.leftoverKg} kg</span>}
                {!m.leftoverRecorded && <span className="text-muted-foreground text-[10px]">📦 Em estoque limpo</span>}
              </div>
              {canCreate && (leftoverForm?.id === m.id ? (
                <div className="flex items-center gap-1.5 animate-scale-in">
                  <DecimalInput value={leftoverForm.kg} onValueChange={(raw) => setLeftoverForm({ ...leftoverForm, kg: raw })} maxDecimals={1} placeholder="kg sobra" className="h-7 w-20 text-xs bg-secondary border-border text-foreground" autoFocus />
                  <Button size="sm" className="h-7 text-[10px] bg-primary-strong text-primary-foreground border-0 px-2" onClick={handleLeftoverSave} disabled={!canCreate || leftoverSaving}>{leftoverSaving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Check className="w-3 h-3" />}</Button>
                  <Button size="sm" variant="ghost" className="h-7 text-[10px] px-2" onClick={() => setLeftoverForm(null)}>✕</Button>
                </div>
              ) : (
                <Button size="sm" variant="outline" className="h-7 text-[10px] border-warning/30 text-warning hover:bg-warning/10 gap-1" onClick={() => setLeftoverForm({ id: m.id, kg: String(m.leftoverKg || '') })}>
                  <Snowflake className="w-3 h-3" /> Sobra do dia
                </Button>
              ))}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma manipulação no período</p>
        )}
      </div>
    </div>
  );
}

function DivergenceDialog({ onConfirm, onCancel }: { onConfirm: (motivo: string) => void; onCancel: () => void }) {
  const [motivo, setMotivo] = useState('');
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-background/80 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl p-5 w-[90%] max-w-sm space-y-3 animate-scale-in">
        <div className="flex items-center gap-2 text-destructive">
          <AlertTriangle className="w-5 h-5" />
          <p className="font-semibold">Registrar Divergência</p>
        </div>
        <p className="text-xs text-muted-foreground">Informe o motivo da divergência neste lote.</p>
        <Input value={motivo} onChange={e => setMotivo(e.target.value)} placeholder="Motivo da divergência..." className="bg-secondary border-border text-foreground" autoFocus />
        <div className="flex gap-2">
          <Button variant="ghost" size="sm" onClick={onCancel} className="flex-1">Cancelar</Button>
          <Button size="sm" className="flex-1 bg-destructive text-destructive-foreground" onClick={() => motivo.trim() ? onConfirm(motivo) : null} disabled={!motivo.trim()}>Confirmar</Button>
        </div>
      </div>
    </div>
  );
}

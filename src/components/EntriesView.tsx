import { useRef, useState } from 'react';
import { useCan } from '@/permissions/hooks';
import { useSalmonStore } from '@/hooks/useSalmonStore';
import { novaSemente } from '@/lib/idempotencia';
import { chaveEntradaSalmao } from '@/domain/estoque/idempotencia';
import type { SalmonEntry } from '@/types/salmon';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Label } from '@/components/ui/label';
import { Plus, Copy, ChevronDown, ChevronUp, Pencil, Trash2, X, Check, Calculator } from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import PeriodFilter, { PeriodRange, getDefaultRange, filterByPeriod } from './PeriodFilter';
import QuickSupplierDialog from './compras/QuickSupplierDialog';
import { endOfMonth } from 'date-fns';
import { useMetaMensal, getMetaStatus, calcProjecao } from './MetaCompraCard';
import { calcWeeklyIdeal, getWeekForDay } from './WeeklyBreakdown';
import PurchaseRadar from './PurchaseRadar';
import SimuladorCompra from './SimuladorCompra';
import { todayBR, formatInBR, formatDateBR, fmtBRL, formatFixedBR, normalizeBRLMoneyToNumber, parseLocalDate } from '@/lib/formatters';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

const fmtR = (v: number) => fmtBRL(v);

interface EntriesViewProps {
  store: ReturnType<typeof useSalmonStore>;
}

const emptyForm = () => ({
  date: todayBR(),
  expirationDate: '',
  lot: '', sif: '', supplier: '', totalValue: '', pricePerKg: '',
  boxes: '', units: '', grossKg: '', notes: '',
});

export default function EntriesView({ store }: EntriesViewProps) {
  const toast = useScopedToast();
  const { entries, addEntry, updateEntry, deleteEntry, activeSuppliers, addSupplier, metasCompra, saveMetaCompra, addAuditoria } = store;
  const canCreate = useCan('salmon:entradas:create');
  const canEdit = useCan('salmon:entradas:edit');
  const canDelete = useCan('salmon:entradas:delete');
  const [period, setPeriod] = useState<PeriodRange>(getDefaultRange());
  const [showForm, setShowForm] = useState(false);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showQuickSupplier, setShowQuickSupplier] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [budgetConfirmPending, setBudgetConfirmPending] = useState<((motivo: string) => void) | null>(null);
  const [budgetAlertMsg, setBudgetAlertMsg] = useState('');
  const [overrideMotivo, setOverrideMotivo] = useState('');
  const [showSimulador, setShowSimulador] = useState(false);
  const [saving, setSaving] = useState(false);
  // Trava síncrona: cobre o submit e o "Continuar mesmo assim" do alerta de
  // orçamento — `saving` só desabilita os botões no próximo render.
  const salvandoRef = useRef(false);
  // Semente do formulário: troca a cada formulário limpo. A chave enviada
  // combina a semente com os dados da entrada (chaveEntradaSalmao).
  const [semente, setSemente] = useState(novaSemente);

  const filtered = filterByPeriod(entries, period);
  const lots = [...new Set(entries.map(e => e.lot).filter(Boolean))];

  const periodStart = period.start;
  const periodEnd = period.end;
  const isMonthFilter = periodStart.getDate() === 1 &&
    periodEnd.getDate() === endOfMonth(periodStart).getDate() &&
    periodStart.getMonth() === periodEnd.getMonth() &&
    periodStart.getFullYear() === periodEnd.getFullYear();
  
  const targetMonth = isMonthFilter
    ? formatInBR(periodStart, 'yyyy-MM')
    : formatInBR(new Date(), 'yyyy-MM');

  const metaInfo = useMetaMensal(entries, metasCompra, targetMonth);

  const resetForm = () => {
    setForm(emptyForm());
    setEditingId(null);
    setShowForm(false);
    setSemente(novaSemente());
  };

  const doSave = async (
    data: any,
    clientRequestId: string | undefined,
    auditOverride?: { tipos: string[]; motivo: string },
  ) => {
    if (salvandoRef.current) return;
    salvandoRef.current = true;
    setSaving(true);
    try {
      if (editingId) {
        await updateEntry(editingId, data);
        toast.success('Entrada atualizada!');
        resetForm();
        return;
      }
      const newEntry = await addEntry(data, { clientRequestId });
      toast.success('Entrada registrada!');
      // A entrada já está gravada: a auditoria de orçamento não pode impedir a
      // limpeza do formulário.
      try {
        registrarAuditoria(newEntry, data, auditOverride);
      } catch (auditError) {
        console.error('[EntriesView] auditoria de orçamento', auditError);
      }
      resetForm();
    } catch {
      // O store já mostrou o erro. O formulário fica como está: enviar de novo a
      // mesma entrada reaproveita a chave e não grava o salmão duas vezes.
    } finally {
      salvandoRef.current = false;
      setSaving(false);
    }
  };

  const registrarAuditoria = (
    newEntry: SalmonEntry,
    data: Omit<SalmonEntry, 'id' | 'createdAt'>,
    auditOverride?: { tipos: string[]; motivo: string },
  ) => {
    if (newEntry && metaInfo.meta) {
      const entryMonth = data.date.slice(0, 7);
      const projectedGasto = metaInfo.gastoMes + data.totalValue;
      const projectedPercent = metaInfo.meta.metaValorCompra > 0 ? (projectedGasto / metaInfo.meta.metaValorCompra) * 100 : 0;
      const statusMeta = getMetaStatus(projectedPercent, metaInfo.meta.alertaAmareloPercent, metaInfo.meta.alertaVermelhoPercent);
      const projNova = calcProjecao(entries, entryMonth, metaInfo.meta, data.totalValue);
      const statusProj = projNova.statusProjecao;

      const entryDay = parseInt(data.date.split('-')[2]);
      const weekLabel = getWeekForDay(entryDay);
      const weeklyData = calcWeeklyIdeal(entries, entryMonth, metaInfo.meta.metaValorCompra);
      const week = weeklyData.find((w: any) => w.label === weekLabel);
      const gastoSemanaPos = week ? week.gasto + data.totalValue : 0;
      const statusSemana: 'boa' | 'perto' | 'estourado' = week && week.ideal > 0
        ? gastoSemanaPos >= week.ideal ? 'estourado' : gastoSemanaPos >= week.ideal * 0.9 ? 'perto' : 'boa'
        : 'boa';

      const isOverride = !!auditOverride;
      const needsAudit = statusMeta !== 'boa' || statusProj !== 'boa' || statusSemana !== 'boa' || isOverride;

      if (needsAudit) {
        addAuditoria({
          entradaId: newEntry.id,
          dataEntrada: data.date,
          valorTotal: data.totalValue,
          fornecedor: data.supplier,
          mesAno: entryMonth,
          statusMetaNoMomento: statusMeta,
          statusProjecaoNoMomento: statusProj,
          statusSemanaNoMomento: statusSemana,
          overrideAlerta: isOverride,
          overrideTipo: auditOverride?.tipos || [],
          overrideMotivo: auditOverride?.motivo || '',
          createdBy: 'Operador',
          overrideUser: isOverride ? 'Operador' : '',
          overrideAt: isOverride ? todayBR() + 'T00:00:00Z' : '',
        });
      }
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (salvandoRef.current) return;
    const grossKg = normalizeBRLMoneyToNumber(form.grossKg);
    const totalValue = normalizeBRLMoneyToNumber(form.totalValue);
    if (!grossKg || !totalValue) { toast.error('Preencha kg bruto e valor total'); return; }
    if (form.expirationDate && form.expirationDate < form.date) {
      toast.error('A validade não pode ser anterior à data de entrada');
      return;
    }

    const data = {
      date: form.date, expirationDate: form.expirationDate, lot: form.lot, sif: form.sif, supplier: form.supplier,
      totalValue, pricePerKg: form.pricePerKg ? normalizeBRLMoneyToNumber(form.pricePerKg) ?? undefined : undefined,
      boxes: parseInt(form.boxes) || 0, units: parseInt(form.units) || 0, grossKg, notes: form.notes,
    };
    // Chave derivada dos dados: repetir a MESMA entrada devolve a já gravada;
    // mudar qualquer campo gera outra. A edição (replace) não usa chave.
    const clientRequestId = editingId ? undefined : chaveEntradaSalmao(semente, data);

    // Budget alerts (weekly + monthly only)
    if (!editingId && metaInfo.meta) {
      const entryMonth = form.date.slice(0, 7);
      if (entryMonth === metaInfo.mesAno) {
        const projectedGasto = metaInfo.gastoMes + totalValue;
        const projectedPercent = metaInfo.meta.metaValorCompra > 0 ? (projectedGasto / metaInfo.meta.metaValorCompra) * 100 : 0;
        const projectedStatus = getMetaStatus(projectedPercent, metaInfo.meta.alertaAmareloPercent, metaInfo.meta.alertaVermelhoPercent);

        const projNova = calcProjecao(entries, metaInfo.mesAno, metaInfo.meta, totalValue);
        const projStatus = projNova.statusProjecao;

        // Meta mensal alert
        if (projectedStatus === 'estourado' && metaInfo.status !== 'estourado') {
          setBudgetAlertMsg(`Essa compra vai estourar a meta mensal (${fmtR(projectedGasto)} de ${fmtR(metaInfo.meta.metaValorCompra)}). Deseja continuar?`);
          setBudgetConfirmPending(() => (motivo: string) => doSave(data, clientRequestId, { tipos: ['meta_mensal'], motivo }));
          return;
        }
        // Projeção mensal alert
        if (projStatus === 'estourado' && metaInfo.projecao.statusProjecao !== 'estourado') {
          setBudgetAlertMsg(`Com essa compra, a projeção indica estouro até o fim do mês (projeção: ${fmtR(projNova.projecaoFimMes)}). Continuar?`);
          setBudgetConfirmPending(() => (motivo: string) => doSave(data, clientRequestId, { tipos: ['projecao'], motivo }));
          return;
        }
        if (projectedStatus === 'perto' && metaInfo.status === 'boa') {
          toast.warning('Atenção: você está chegando perto da meta mensal.');
        }

        // Weekly ideal alert
        const entryDay = parseInt(form.date.split('-')[2]);
        const weekLabel = getWeekForDay(entryDay);
        const weeklyData = calcWeeklyIdeal(entries, metaInfo.mesAno, metaInfo.meta.metaValorCompra);
        const week = weeklyData.find(w => w.label === weekLabel);
        if (week) {
          const gastoSemanaPos = week.gasto + totalValue;
          if (week.ideal > 0 && gastoSemanaPos >= week.ideal && week.gasto < week.ideal) {
            setBudgetAlertMsg(`Você vai estourar o orçamento ideal da semana ${weekLabel} (${fmtR(gastoSemanaPos)} / ${fmtR(week.ideal)}). Continuar?`);
            setBudgetConfirmPending(() => (motivo: string) => doSave(data, clientRequestId, { tipos: ['semana'], motivo }));
            return;
          }
          if (week.ideal > 0 && gastoSemanaPos >= week.ideal * 0.9 && week.gasto < week.ideal * 0.9) {
            toast.warning(`Esta compra coloca a semana ${weekLabel} acima de 90% do ideal.`);
          }
        }
      }
    }

    void doSave(data, clientRequestId);
  };

  const startEdit = (entry: typeof entries[0]) => {
    setForm({
      date: entry.date, expirationDate: entry.expirationDate || '', lot: entry.lot, sif: entry.sif, supplier: entry.supplier,
      totalValue: String(entry.totalValue), pricePerKg: entry.pricePerKg ? String(entry.pricePerKg) : '',
      boxes: String(entry.boxes), units: String(entry.units), grossKg: String(entry.grossKg), notes: entry.notes,
    });
    setEditingId(entry.id);
    setShowForm(true);
    setExpandedId(null);
  };

  const duplicateEntry = (entry: typeof entries[0]) => {
    setForm({
      // Validade não é duplicada: é uma compra nova, com lote e validade próprios.
      date: todayBR(), expirationDate: '', lot: entry.lot, sif: entry.sif, supplier: entry.supplier,
      totalValue: String(entry.totalValue), pricePerKg: entry.pricePerKg ? String(entry.pricePerKg) : '',
      boxes: String(entry.boxes), units: String(entry.units), grossKg: String(entry.grossKg), notes: entry.notes,
    });
    setEditingId(null);
    setShowForm(true);
    toast.info('Dados duplicados — edite e salve');
  };

  const confirmDelete = async () => {
    if (!deleteId) return;
    const id = deleteId;
    setDeleteId(null);
    try {
      await deleteEntry(id);
      toast.success('Entrada excluída!');
      if (expandedId === id) setExpandedId(null);
    } catch {
      // deleteEntry já exibiu o toast de erro específico
    }
  };

  const handleQuickSupplier = (name: string) => {
    addSupplier({ name, cnpj: '', contact: '', notes: '', active: true, categoriasAtendidas: [], prazoEntregaPadrao: 0, formaPagamentoPadrao: '' });
    setForm(f => ({ ...f, supplier: name }));
    setShowQuickSupplier(false);
    toast.success(`Fornecedor "${name}" cadastrado!`);
  };

  const calcPricePerKg = () => {
    const v = normalizeBRLMoneyToNumber(form.totalValue);
    const kg = normalizeBRLMoneyToNumber(form.grossKg);
    if (v && kg) return `${fmtBRL(v / kg)}/kg`;
    return '—';
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground">Entradas</h2>
          <p className="text-xs text-muted-foreground">{filtered.length} registros no período</p>
        </div>
        <div className="flex gap-2">
          {canCreate && (
            <Button onClick={() => { resetForm(); setShowForm(!showForm); }} size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1.5">
              <Plus className="w-4 h-4" /> Nova
            </Button>
          )}
          <Button onClick={() => setShowSimulador(true)} size="sm" variant="outline" className="gap-1.5 text-xs">
            <Calculator className="w-4 h-4" /> Simular
          </Button>
        </div>
      </div>

      <PeriodFilter current={period} onChange={setPeriod} />

      {/* Radar de Compras */}
      {(isMonthFilter || targetMonth === formatInBR(new Date(), 'yyyy-MM')) && (
        <PurchaseRadar
          entries={entries}
          targetMonth={targetMonth}
          metas={metasCompra}
          compact
        />
      )}

      {showForm && (
        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-xl p-4 space-y-3 animate-scale-in">
          <div className="flex items-center justify-between mb-1">
            <span className="text-sm font-semibold text-foreground">
              {editingId ? '✏️ Editando entrada' : '➕ Nova entrada'}
            </span>
            {editingId && (
              <Button type="button" variant="ghost" size="sm" onClick={resetForm} className="gap-1 text-xs text-muted-foreground">
                <X className="w-3 h-3" /> Cancelar edição
              </Button>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-[11px] text-muted-foreground">Data</Label>
              <DateInput value={form.date} onValueChange={v => setForm(f => ({ ...f, date: v }))} className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Validade</Label>
              <DateInput value={form.expirationDate} onValueChange={v => setForm(f => ({ ...f, expirationDate: v }))} className="bg-secondary border-border text-foreground" />
              <p className="text-[10px] text-muted-foreground mt-1">Define a ordem de uso na Manipulação (vence primeiro, sai primeiro)</p>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Lote</Label>
              <Input value={form.lot} onChange={e => setForm(f => ({ ...f, lot: e.target.value }))} list="lots" placeholder="Lote" className="bg-secondary border-border text-foreground" />
              <datalist id="lots">{lots.map(l => <option key={l} value={String(l)} />)}</datalist>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">SIF</Label>
              <Input value={form.sif} onChange={e => setForm(f => ({ ...f, sif: e.target.value }))} placeholder="SIF" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Fornecedor</Label>
              <div className="flex flex-col gap-1">
                <select
                  value={form.supplier}
                  onChange={e => setForm(f => ({ ...f, supplier: e.target.value }))}
                  className="w-full h-10 rounded-md border border-border bg-secondary px-3 text-sm text-foreground"
                >
                  <option value="">Selecione...</option>
                  {activeSuppliers.map(s => (
                    <option key={s.id} value={s.name}>{s.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => setShowQuickSupplier(true)} className="text-[10px] text-primary hover:underline self-start">+ Novo fornecedor</button>
              </div>
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Valor Total (R$)</Label>
              <CurrencyInput value={form.totalValue} onValueChange={raw => setForm(f => ({ ...f, totalValue: raw }))} showPrefix placeholder="0,00" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Kg Bruto</Label>
              <Input type="text" inputMode="decimal" value={form.grossKg} onChange={e => setForm(f => ({ ...f, grossKg: e.target.value }))} placeholder="0,0" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Caixas</Label>
              <Input type="text" inputMode="decimal" value={form.boxes} onChange={e => setForm(f => ({ ...f, boxes: e.target.value }))} placeholder="0" className="bg-secondary border-border text-foreground" />
            </div>
            <div>
              <Label className="text-[11px] text-muted-foreground">Unidades</Label>
              <Input type="text" inputMode="decimal" value={form.units} onChange={e => setForm(f => ({ ...f, units: e.target.value }))} placeholder="0" className="bg-secondary border-border text-foreground" />
            </div>
          </div>
          <div>
            <Label className="text-[11px] text-muted-foreground">Observações</Label>
            <Input value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} placeholder="Notas..." className="bg-secondary border-border text-foreground" />
          </div>
          <div className="flex items-center justify-between pt-1">
            <span className="text-xs text-muted-foreground">Custo/kg: <strong className="text-primary">{calcPricePerKg()}</strong></span>
            <div className="flex gap-2">
              <Button type="button" variant="ghost" size="sm" onClick={resetForm}>Cancelar</Button>
              <Button type="submit" size="sm" className="bg-primary-strong text-primary-foreground border-0 gap-1" disabled={saving}>
                {saving ? 'Salvando...' : editingId ? <><Check className="w-3.5 h-3.5" /> Atualizar</> : 'Salvar'}
              </Button>
            </div>
          </div>
        </form>
      )}

      <div className="space-y-2">
        {filtered.map((entry, i) => (
          <div key={entry.id} className="bg-card border border-border rounded-xl overflow-hidden animate-fade-up" style={{ animationDelay: `${i * 50}ms` }}>
            <button onClick={() => setExpandedId(expandedId === entry.id ? null : entry.id)} className="w-full flex items-center justify-between p-3 text-left">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground">{entry.supplier || 'Sem fornecedor'}</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground">{entry.lot}</span>
                </div>
                <div className="flex items-center gap-3 mt-1">
                  <span className="text-xs text-muted-foreground">{formatDateBR(parseLocalDate(entry.date))}</span>
                  {entry.expirationDate && (
                    <span className={`text-xs font-medium ${entry.expirationDate < todayBR() ? 'text-destructive' : 'text-muted-foreground'}`}>
                      Val. {formatDateBR(parseLocalDate(entry.expirationDate))}
                    </span>
                  )}
                  <span className="text-xs text-primary font-medium">{formatFixedBR(entry.grossKg, 1)} kg</span>
                  <span className="text-xs text-warning font-medium">{fmtBRL(entry.totalValue)}</span>
                </div>
              </div>
              {expandedId === entry.id ? <ChevronUp className="w-4 h-4 text-muted-foreground" /> : <ChevronDown className="w-4 h-4 text-muted-foreground" />}
            </button>
            {expandedId === entry.id && (
              <div className="px-3 pb-3 border-t border-border/50 pt-2 space-y-2 animate-scale-in">
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div>
                    <span className="text-muted-foreground">Validade:</span>{' '}
                    <span className={entry.expirationDate && entry.expirationDate < todayBR() ? 'text-destructive font-medium' : 'text-foreground'}>
                      {entry.expirationDate ? formatDateBR(parseLocalDate(entry.expirationDate)) : '—'}
                    </span>
                  </div>
                  <div><span className="text-muted-foreground">SIF:</span> <span className="text-foreground">{entry.sif || '—'}</span></div>
                  <div><span className="text-muted-foreground">Caixas:</span> <span className="text-foreground">{formatFixedBR(entry.boxes, 0)}</span></div>
                  <div><span className="text-muted-foreground">Peixes:</span> <span className="text-foreground">{formatFixedBR(entry.units, 0)}</span></div>
                  <div><span className="text-muted-foreground">R$/kg:</span> <span className="text-primary">{fmtBRL(entry.pricePerKg || (entry.totalValue / entry.grossKg))}</span></div>
                </div>
                {entry.notes && <p className="text-[11px] text-muted-foreground italic">{entry.notes}</p>}
                <div className="flex gap-2 pt-1">
                  {canEdit && (
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => startEdit(entry)}>
                      <Pencil className="w-3 h-3" /> Editar
                    </Button>
                  )}
                  {canCreate && (
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-muted-foreground" onClick={() => duplicateEntry(entry)}>
                      <Copy className="w-3 h-3" /> Duplicar
                    </Button>
                  )}
                  {canDelete && (
                    <Button variant="ghost" size="sm" className="gap-1 text-xs text-destructive" onClick={() => setDeleteId(entry.id)}>
                      <Trash2 className="w-3 h-3" /> Excluir
                    </Button>
                  )}
                </div>
              </div>
            )}
          </div>
        ))}
        {filtered.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-8">Nenhuma entrada no período</p>
        )}
      </div>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteId} onOpenChange={open => !open && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir entrada?</AlertDialogTitle>
            <AlertDialogDescription>
              Essa ação não pode ser desfeita. O estoque será recalculado automaticamente.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete} className="bg-destructive text-destructive-foreground">Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Budget exceeded confirmation */}
      <AlertDialog open={!!budgetConfirmPending} onOpenChange={open => { if (!open) { setBudgetConfirmPending(null); setOverrideMotivo(''); } }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>⚠️ Limite será ultrapassado</AlertDialogTitle>
            <AlertDialogDescription>{budgetAlertMsg}</AlertDialogDescription>
          </AlertDialogHeader>
          <div className="px-6 pb-2 space-y-2">
            <Label className="text-xs text-muted-foreground">Motivo do override (obrigatório)</Label>
            <Input
              value={overrideMotivo}
              onChange={e => setOverrideMotivo(e.target.value)}
              placeholder="Ex: Demanda urgente, promoção do fornecedor..."
              className="bg-secondary border-border text-foreground text-sm"
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => { setBudgetConfirmPending(null); setOverrideMotivo(''); }}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={!overrideMotivo.trim() || saving}
              onClick={() => { budgetConfirmPending?.(overrideMotivo.trim()); setBudgetConfirmPending(null); setOverrideMotivo(''); }}
              className="bg-destructive text-destructive-foreground disabled:opacity-50"
            >
              Continuar mesmo assim
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Simulador */}
      <SimuladorCompra
        open={showSimulador}
        onClose={() => setShowSimulador(false)}
        entries={entries}
        metas={metasCompra}
        activeSuppliers={activeSuppliers}
        targetMonth={targetMonth}
        onApply={(data) => {
          setForm(f => ({ ...f, ...data }));
          setEditingId(null);
          setShowForm(true);
          setShowSimulador(false);
        }}
      />
      <QuickSupplierDialog 
        open={showQuickSupplier}
        onOpenChange={setShowQuickSupplier}
        onSuccess={(name) => {
          setForm(f => ({ ...f, supplier: name }));
        }}
      />
    </div>
  );
}

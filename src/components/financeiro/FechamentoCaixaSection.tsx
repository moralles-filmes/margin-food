import { useState, useEffect, useCallback, useMemo } from 'react';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { MoneyInput } from '@/components/ui/numeric-input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { cacheInvalidate } from '@/components/cmv/cmvCache';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, RefreshCw, DollarSign, Calendar, FileDown, FileSpreadsheet, AlertTriangle } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { startOfMonth, endOfMonth } from 'date-fns';
import { formatDateBR, formatDisplayBR, todayBR } from '@/lib/datetime';
import { fmtBRL, normalizeBRLMoneyToNumber, formatFixedBR, parseLocalDate } from '@/lib/formatters';
import { useCan } from '@/permissions/hooks';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { APP_NAME } from '@/lib/brand';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import DateRangePresets from './DateRangePresets';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RTooltip,
  CartesianGrid,
} from 'recharts';

// ── Types ──

interface FechamentoRow {
  id: string;
  data: string;
  faturamento_bruto: number;
  taxas: number;
  descontos: number;
  faturamento_liquido: number;
  observacao: string | null;
  created_at: string;
  updated_at: string;
}

// ── NoAccess fallback ──

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <AlertTriangle className="w-8 h-8" />
      <p className="text-sm">Você não tem permissão para acessar esta seção.</p>
    </div>
  );
}

// ── Component ──

export default function FechamentoCaixaSection() {
  const canView = useCan('financeiro:fechamento:view');
  const canCreate = useCan('financeiro:fechamento:create');
  const canEdit = useCan('financeiro:fechamento:edit');
  const canDelete = useCan('financeiro:fechamento:delete');
  const canExport = useCan('financeiro:fechamento:export');

  const { confirm, ConfirmDialog } = useConfirmDialog();

  const [items, setItems] = useState<FechamentoRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);

  // Filters
  const now = new Date();
  const [startDate, setStartDate] = useState(formatDateBR(startOfMonth(now)));
  const [endDate, setEndDate] = useState(formatDateBR(endOfMonth(now)));

  // Form (string-based for MoneyInput)
  const [formData, setFormData] = useState('');
  const [formBruto, setFormBruto] = useState('');
  const [formTaxas, setFormTaxas] = useState('');
  const [formDescontos, setFormDescontos] = useState('');
  const [formObs, setFormObs] = useState('');

  // ── Load ──

  const load = useCallback(async () => {
    if (loading && items.length > 0) return; // prevent double-load
    setLoading(true);
    let query = supabase
      .from('financeiro_fechamento_caixa')
      .select('id, data, faturamento_bruto, taxas, descontos, faturamento_liquido, observacao, created_at, updated_at');
    if (startDate) query = query.gte('data', startDate);
    if (endDate) query = query.lte('data', endDate);
    query = query.order('data', { ascending: false });
    const { data, error } = await query;

    if (error) {
      toast.error('Erro ao carregar fechamentos');
      console.error(error);
    } else {
      setItems((data || []) as FechamentoRow[]);
    }
    setLoading(false);
  }, [startDate, endDate]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh
  useDataEvent('financeiro:fechamento', load);

  // ── Form helpers ──

  const parseMoney = (v: string) => normalizeBRLMoneyToNumber(v) ?? 0;

  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setFormData(todayBR());
    setFormBruto('');
    setFormTaxas('');
    setFormDescontos('');
    setFormObs('');
    setShowForm(false);
  };
  const fechFormSnapshot = { formData, formBruto, formTaxas, formDescontos, formObs };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: fechFormSnapshot, onClose: resetForm });

  const openNew = () => {
    resetForm();
    setFormData(todayBR());
    setShowForm(true);
  };

  const openEdit = (row: FechamentoRow) => {
    setEditId(row.id);
    setEditUpdatedAt(row.updated_at);
    setFormData(row.data);
    setFormBruto(String(row.faturamento_bruto));
    setFormTaxas(String(row.taxas || 0));
    setFormDescontos(String(row.descontos || 0));
    setFormObs(row.observacao || '');
    setShowForm(true);
  };

  // ── Save ──

  const save = async () => {
    if (saving) return;
    const bruto = parseMoney(formBruto);
    const taxas = parseMoney(formTaxas);
    const descontos = parseMoney(formDescontos);

    if (!formData) { toast.error('Data obrigatória'); return; }
    if (bruto < 0) { toast.error('Faturamento bruto não pode ser negativo'); return; }
    if (taxas < 0) { toast.error('Taxas não podem ser negativas'); return; }
    if (descontos < 0) { toast.error('Descontos não podem ser negativos'); return; }
    if (descontos > bruto) { toast.error('Descontos não podem ser maiores que o faturamento bruto'); return; }

    // Future date warning
    if (formData > todayBR()) {
      const ok = await confirm({
        title: 'Data futura',
        description: 'Você está registrando um fechamento em data futura. Deseja continuar?',
      });
      if (!ok) return;
    }

    setSaving(true);
    const { error } = await supabase.rpc('rpc_upsert_fechamento_caixa', {
      p_data: formData,
      p_faturamento_bruto: bruto,
      p_taxas: taxas,
      p_descontos: descontos,
      p_observacao: formObs || null,
      p_expected_updated_at: editUpdatedAt,
    });

    if (error) {
      if (error.message?.includes('OPTIMISTIC_LOCK_CONFLICT')) {
        toast.error('Este fechamento foi alterado por outro usuário. Atualize a tela e tente novamente.');
      } else {
        toast.error(error.message);
      }
    } else {
      toast.success(editId ? 'Fechamento atualizado' : 'Fechamento registrado');
      cacheInvalidate('calcular_cmv');
      cacheInvalidate('get_ranking');
      resetForm();
      load();
      emitDataEvent('financeiro:fechamento');
    }
    setSaving(false);
  };

  // ── Delete ──

  const remove = async (id: string) => {
    const ok = await confirm({
      title: 'Excluir fechamento de caixa',
      description: 'Esta ação removerá o fechamento do dia e pode impactar CMV, dashboards e relatórios. Deseja continuar?',
      variant: 'destructive',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    try {
      const { error } = await supabase.rpc('rpc_delete_fechamento_caixa', { p_id: id });
      if (error) throw error;
      toast.success('Fechamento excluído');
      cacheInvalidate('calcular_cmv');
      cacheInvalidate('get_ranking');
      load();
      emitDataEvent('financeiro:fechamento');
    } catch (err: unknown) {
      console.error('[FechamentoCaixaSection.remove]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
  };

  // ── Aggregates ──

  const totalBruto = items.reduce((s, r) => s + Number(r.faturamento_bruto), 0);
  const totalLiquido = items.reduce((s, r) => s + Number(r.faturamento_liquido), 0);

  const liquidoEstimado = useMemo(() => {
    const b = parseMoney(formBruto);
    const t = parseMoney(formTaxas);
    const d = parseMoney(formDescontos);
    return b - t - d;
  }, [formBruto, formTaxas, formDescontos]);

  // ── Trend chart data ──

  const chartData = useMemo(() =>
    [...items]
      .sort((a, b) => a.data.localeCompare(b.data))
      .map(r => ({
        data: formatDateBR(parseLocalDate(r.data)),
        liquido: Number(r.faturamento_liquido),
      })),
    [items]
  );

  // ── Export PDF ──

  const exportPdf = async () => {
    if (exportingPdf) return;
    setExportingPdf(true);
    try {
      const doc = new jsPDF();
      doc.setFontSize(16);
      doc.text(APP_NAME, 14, 15);
      doc.setFontSize(10);
      doc.text(`Fechamento de Caixa — ${formatDateBR(parseLocalDate(startDate))} a ${formatDateBR(parseLocalDate(endDate))}`, 14, 22);
      doc.setFontSize(8);
      doc.text(`Dias: ${items.length} | Bruto: ${fmtBRL(totalBruto)} | Líquido: ${fmtBRL(totalLiquido)}`, 14, 28);

      autoTable(doc, {
        startY: 35,
        head: [['Data', 'Bruto', 'Taxas', 'Descontos', 'Líquido', 'Observação']],
        body: items.map(r => [
          formatDateBR(parseLocalDate(r.data)),
          fmtBRL(Number(r.faturamento_bruto)),
          fmtBRL(Number(r.taxas)),
          fmtBRL(Number(r.descontos)),
          fmtBRL(Number(r.faturamento_liquido)),
          r.observacao || '—',
        ]),
        styles: { fontSize: 8, cellPadding: 3 },
        headStyles: { fillColor: [220, 80, 50], textColor: 255 },
      });

      doc.setFontSize(7);
      doc.text(`Gerado por ${APP_NAME}`, 14, doc.internal.pageSize.height - 10);
      doc.save(`fechamento-caixa-${startDate}-${endDate}.pdf`);
      toast.success('PDF exportado');
    } catch {
      toast.error('Erro ao exportar PDF');
    }
    setExportingPdf(false);
  };

  // ── Export Excel ──

  const exportExcel = async () => {
    if (exportingExcel) return;
    setExportingExcel(true);
    try {
      const rows = items.map(r => ({
        Data: formatDateBR(parseLocalDate(r.data)),
        'Faturamento Bruto': Number(r.faturamento_bruto),
        Taxas: Number(r.taxas),
        Descontos: Number(r.descontos),
        'Faturamento Líquido': Number(r.faturamento_liquido),
        Observação: r.observacao || '',
      }));
      rows.push({
        Data: 'TOTAL',
        'Faturamento Bruto': totalBruto,
        Taxas: items.reduce((s, r) => s + Number(r.taxas), 0),
        Descontos: items.reduce((s, r) => s + Number(r.descontos), 0),
        'Faturamento Líquido': totalLiquido,
        Observação: '',
      });
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Fechamento');
      XLSX.writeFile(wb, `fechamento-caixa-${startDate}-${endDate}.xlsx`);
      toast.success('Excel exportado');
    } catch {
      toast.error('Erro ao exportar Excel');
    }
    setExportingExcel(false);
  };

  // ── Guard ──

  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      <ConfirmDialog />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-primary" /> Fechamento de Caixa
          </h2>
          <p className="text-sm text-muted-foreground">Faturamento diário — fonte canônica para CMV e relatórios</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1">
            <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-36 h-9 text-xs" />
            <span className="text-muted-foreground text-xs">—</span>
            <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-36 h-9 text-xs" />
          </div>
          <Button variant="outline" size="sm" onClick={load} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>

          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || items.length === 0}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}

          {canCreate && (
            <Dialog open={showForm} onOpenChange={open => { if (!open) guardedClose(); else openNew(); }}>
              <DialogTrigger asChild>
                <Button size="sm"><Plus className="w-4 h-4 mr-1" /> Novo Dia</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>{editId ? 'Editar Fechamento' : 'Novo Fechamento'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-3">
                  <div>
                    <Label>Data</Label>
                    <Input type="date" value={formData} onChange={e => setFormData(e.target.value)} />
                  </div>
                  <div>
                    <Label>Faturamento Bruto (R$)</Label>
                    <MoneyInput
                      value={formBruto}
                      onValueChange={(raw) => setFormBruto(raw)}
                      placeholder="0,00"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Taxas (R$)</Label>
                      <MoneyInput
                        value={formTaxas}
                        onValueChange={(raw) => setFormTaxas(raw)}
                        placeholder="0,00"
                      />
                    </div>
                    <div>
                      <Label>Descontos (R$)</Label>
                      <MoneyInput
                        value={formDescontos}
                        onValueChange={(raw) => setFormDescontos(raw)}
                        placeholder="0,00"
                      />
                    </div>
                  </div>
                  <div>
                    <Label>Observação</Label>
                    <Textarea value={formObs} onChange={e => setFormObs(e.target.value)} placeholder="Opcional" rows={2} />
                  </div>
                  <div className="bg-muted/50 rounded-lg p-3">
                    <p className="text-xs text-muted-foreground">Líquido estimado:</p>
                    <p className="text-lg font-bold text-foreground">{fmtBRL(liquidoEstimado)}</p>
                  </div>
                  <Button onClick={save} className="w-full" disabled={saving}>
                    {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Registrar'}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <DateRangePresets
        from={startDate}
        to={endDate}
        onChange={(s, e) => { setStartDate(s); setEndDate(e); }}
      />

      {/* Summary cards */}
      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          {[1, 2, 3].map(i => (
            <Card key={i}><CardContent className="p-4 space-y-2">
              <Skeleton className="h-3 w-24" />
              <Skeleton className="h-8 w-32" />
            </CardContent></Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Dias registrados</p>
              <p className="text-2xl font-bold text-foreground">{items.length}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Bruto</p>
              <p className="text-2xl font-bold text-success">{fmtBRL(totalBruto)}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">Total Líquido</p>
              <p className="text-2xl font-bold text-primary">{fmtBRL(totalLiquido)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Trend chart */}
      {!loading && chartData.length >= 2 && (
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted-foreground mb-2">Tendência — Faturamento Líquido Diário</p>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={chartData}>
                <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                <XAxis dataKey="data" tick={{ fontSize: 10 }} className="text-muted-foreground" />
                <YAxis tick={{ fontSize: 10 }} tickFormatter={v => `${formatFixedBR(v / 1000, 0)}k`} className="text-muted-foreground" />
                <RTooltip formatter={(v: number) => fmtBRL(v)} />
                <Area type="monotone" dataKey="liquido" className="fill-primary/20 stroke-primary" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Table */}
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Data</TableHead>
            <TableHead className="text-right">Bruto</TableHead>
            <TableHead className="text-right">Taxas</TableHead>
            <TableHead className="text-right">Descontos</TableHead>
            <TableHead className="text-right">Líquido</TableHead>
            <TableHead>Obs</TableHead>
            {(canEdit || canDelete) && <TableHead className="w-20">Ações</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            Array.from({ length: 5 }).map((_, i) => (
              <TableRow key={i}>
                {Array.from({ length: 7 }).map((_, j) => (
                  <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
                ))}
              </TableRow>
            ))
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">
              <Calendar className="w-8 h-8 mx-auto mb-2 opacity-30" />
              Nenhum fechamento no período
            </TableCell></TableRow>
          ) : items.map(row => (
            <TableRow key={row.id}>
              <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(row.data))}</TableCell>
              <TableCell className="text-right font-medium text-success">{fmtBRL(Number(row.faturamento_bruto))}</TableCell>
              <TableCell className="text-right text-muted-foreground">{fmtBRL(Number(row.taxas))}</TableCell>
              <TableCell className="text-right text-muted-foreground">{fmtBRL(Number(row.descontos))}</TableCell>
              <TableCell className="text-right font-bold">{fmtBRL(Number(row.faturamento_liquido))}</TableCell>
              <TableCell className="text-muted-foreground text-xs max-w-[150px] truncate">{row.observacao || '—'}</TableCell>
              {(canEdit || canDelete) && (
                <TableCell>
                  <div className="flex gap-1">
                    {canEdit && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(row)}>
                        <Edit className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => remove(row.id)}>
                        <Trash2 className="w-3.5 h-3.5 text-destructive" />
                      </Button>
                    )}
                  </div>
                </TableCell>
              )}
            </TableRow>
          ))}
        </TableBody>
      </Table>
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}


import { useState, useEffect, useCallback, useMemo } from 'react';
import { fmtBRL, formatInBR, formatDecimalBR } from '@/lib/formatters';
import { BRLInput } from '@/components/ui/brl-input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Progress } from '@/components/ui/progress';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { subMonths } from 'date-fns';
import { Plus, Target, AlertTriangle, Pencil, Trash2, FileDown, FileSpreadsheet, Copy, Loader2, ShieldAlert } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { useDataEvent, emitDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions/hooks';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from 'xlsx';

// ─── Types ───

interface OrcamentoItem {
  id: string;
  categoria_id: string;
  categoriaNome: string;
  categoriaTipo: string;
  valorOrcado: number;
  valorRealizado: number;
  pctExecucao: number;
  statusExecucao: 'ok' | 'alerta' | 'estourado';
  valorExcedido: number;
  updated_at: string;
}

interface Categoria {
  id: string;
  nome: string;
  tipo: string;
}

// ─── Helpers ───

function formatMonthBR(value: string): string {
  const d = new Date(value + '-01');
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function NoAccess() {
  return (
    <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-2">
      <ShieldAlert className="w-10 h-10" />
      <p className="font-medium">Acesso negado</p>
      <p className="text-sm">Você não tem permissão para acessar o Orçamento.</p>
    </div>
  );
}

// ─── Component ───

export default function OrcamentoSection() {
  const [items, setItems] = useState<OrcamentoItem[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mesAtual, setMesAtual] = useState(formatInBR(new Date(), 'yyyy-MM'));

  // Dialog state
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState({ categoria_id: '', valor_orcado: 0 });
  const handleCloseOrcDialog = () => { setDialogOpen(false); setEditingId(null); setForm({ categoria_id: '', valor_orcado: 0 }); };
  const { showConfirm: showOrcConfirm, guardedClose: guardedOrcClose, confirmClose: confirmOrcClose, cancelClose: cancelOrcClose } = useFormDirtyGuard({ current: form, onClose: handleCloseOrcDialog });

  // Copy month dialog
  const [copyDialogOpen, setCopyDialogOpen] = useState(false);
  const [copyFromMes, setCopyFromMes] = useState('');
  const [copying, setCopying] = useState(false);

  // RBAC
  const canView = useCan('financeiro:orcamento:view');
  const canEdit = useCan('financeiro:orcamento:edit');
  const canDelete = useCan('financeiro:orcamento:delete');
  const canExport = useCan('financeiro:orcamento:export');

  const { confirm, ConfirmDialog } = useConfirmDialog();

  const meses = useMemo(
    () => Array.from({ length: 12 }, (_, i) => formatInBR(subMonths(new Date(), i), 'yyyy-MM')),
    [],
  );

  // ── Load data via RPC ──
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [execRes, catRes] = await Promise.all([
        supabase.rpc('orcamento_execucao_mensal', { p_mes: mesAtual }),
        supabase.from('fin_categorias').select('id, nome, tipo').eq('ativo', true).eq('tipo', 'despesa').order('nome'),
      ]);

      if (execRes.error) throw execRes.error;

      const data = (execRes.data as unknown as OrcamentoItem[] | null) || [];
      setItems(data.map((d) => ({
        id: d.id,
        categoria_id: d.categoria_id,
        categoriaNome: d.categoriaNome,
        categoriaTipo: d.categoriaTipo,
        valorOrcado: Number(d.valorOrcado),
        valorRealizado: Number(d.valorRealizado),
        pctExecucao: Number(d.pctExecucao),
        statusExecucao: d.statusExecucao as 'ok' | 'alerta' | 'estourado',
        valorExcedido: Number(d.valorExcedido),
        updated_at: d.updated_at || '',
      })));
      setCategorias((catRes.data || []) as Categoria[]);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar orçamento');
    }
    setLoading(false);
  }, [mesAtual]);

  useEffect(() => { load(); }, [load]);

  // Auto-refresh
  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:cadastros', load);
  useDataEvent('financeiro:orcamento', load);

  // ── Save (create or update) via RPC ──
  const save = async () => {
    if (saving) return;
    const catId = editingId ? items.find(i => i.id === editingId)?.categoria_id : form.categoria_id;
    if (!catId || form.valor_orcado <= 0) {
      toast.error('Categoria e valor obrigatórios');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('_guarded_upsert_orcamento', {
        p_categoria_id: catId,
        p_mes_ano: mesAtual,
        p_valor: form.valor_orcado,
      });
      if (error) throw error;
      toast.success(editingId ? 'Orçamento atualizado' : 'Orçamento criado');
      setDialogOpen(false);
      setEditingId(null);
      setForm({ categoria_id: '', valor_orcado: 0 });
      emitDataEvent('financeiro:orcamento');
    } catch (err: any) {
      console.error(err);
      if (err?.message?.includes('23505') || err?.code === '23505') {
        toast.error('Já existe orçamento para esta categoria neste mês');
      } else {
        toast.error('Erro ao salvar orçamento');
      }
    }
    setSaving(false);
  };

  // ── Delete via RPC ──
  const handleDelete = async (item: OrcamentoItem) => {
    const ok = await confirm({
      title: 'Excluir Orçamento',
      description: `Deseja excluir o orçamento da categoria "${item.categoriaNome}"?`,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const { error } = await supabase.rpc('_guarded_delete_orcamento', {
        p_id: item.id,
        p_expected_updated_at: item.updated_at,
      });
      if (error) {
        if (error.message?.includes('OPTIMISTIC_LOCK_CONFLICT')) {
          toast.error('O registro foi alterado por outro usuário. Atualize a lista.');
        } else {
          throw error;
        }
        return;
      }
      toast.success('Orçamento excluído');
      emitDataEvent('financeiro:orcamento');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao excluir');
    }
  };

  // ── Open edit dialog ──
  const openEdit = (item: OrcamentoItem) => {
    setEditingId(item.id);
    setForm({ categoria_id: item.categoria_id, valor_orcado: item.valorOrcado });
    setDialogOpen(true);
  };

  // ── Open create dialog ──
  const openCreate = () => {
    setEditingId(null);
    setForm({ categoria_id: '', valor_orcado: 0 });
    setDialogOpen(true);
  };

  // ── Copy from another month (single RPC call, no N+1) ──
  const handleCopy = async () => {
    if (!copyFromMes || copying) return;
    setCopying(true);
    try {
      const { data, error } = await supabase.rpc('copiar_orcamento_mes', {
        p_origem: copyFromMes,
        p_destino: mesAtual,
      });
      if (error) throw error;
      const inserted = typeof data === 'number' ? data : 0;
      if (inserted === 0) {
        toast.error(`Nenhum orçamento encontrado em ${formatMonthBR(copyFromMes)} ou categorias já existem`);
      } else {
        toast.success(`${inserted} orçamento(s) copiado(s) de ${formatMonthBR(copyFromMes)}`);
      }
      setCopyDialogOpen(false);
      emitDataEvent('financeiro:orcamento');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao copiar orçamentos');
    }
    setCopying(false);
  };

  // ── Totals ──
  const totalOrcado = items.reduce((s, c) => s + c.valorOrcado, 0);
  const totalRealizado = items.reduce((s, c) => s + c.valorRealizado, 0);
  const pctGlobal = totalOrcado > 0 ? formatDecimalBR((totalRealizado / totalOrcado) * 100, 1) : '—';

  const fmt = fmtBRL;

  // ── Available categories for creation (exclude already budgeted) ──
  const categoriasDisponiveis = useMemo(() => {
    const usadas = new Set(items.map(i => i.categoria_id));
    return categorias.filter(c => !usadas.has(c.id));
  }, [categorias, items]);

  // ── PDF Export ──
  const gerarPDF = () => {
    if (items.length === 0) return;
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text('Orçamento vs Realizado', w / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Período: ${formatMonthBR(mesAtual)}  |  Orçado: ${fmt(totalOrcado)}  |  Realizado: ${fmt(totalRealizado)}  |  Execução: ${pctGlobal}%`, w / 2, 26, { align: 'center' });

    autoTable(doc, {
      startY: 34,
      head: [['Categoria', 'Orçado', 'Realizado', '% Exec.', 'Status', 'Excedido']],
      body: items.map(i => [
        i.categoriaNome,
        fmt(i.valorOrcado),
        fmt(i.valorRealizado),
        `${i.pctExecucao}%`,
        i.statusExecucao === 'estourado' ? 'ESTOURADO' : i.statusExecucao === 'alerta' ? 'ALERTA' : 'OK',
        i.valorExcedido > 0 ? fmt(i.valorExcedido) : '—',
      ]),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`orcamento-${mesAtual}.pdf`);
    toast.success('PDF gerado');
  };

  // ── Excel Export ──
  const gerarExcel = () => {
    if (items.length === 0) return;
    const wb = XLSX.utils.book_new();
    const rows = [
      ['Categoria', 'Orçado', 'Realizado', '% Execução', 'Status', 'Excedido'],
      ...items.map(i => [
        i.categoriaNome,
        i.valorOrcado,
        i.valorRealizado,
        `${i.pctExecucao}%`,
        i.statusExecucao === 'estourado' ? 'ESTOURADO' : i.statusExecucao === 'alerta' ? 'ALERTA' : 'OK',
        i.valorExcedido > 0 ? i.valorExcedido : 0,
      ]),
      [],
      ['TOTAL', totalOrcado, totalRealizado, `${pctGlobal}%`, '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws['!cols'] = [{ wch: 30 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 12 }, { wch: 15 }];
    XLSX.utils.book_append_sheet(wb, ws, 'Orçamento');
    XLSX.writeFile(wb, `orcamento-${mesAtual}.xlsx`);
    toast.success('Excel gerado');
  };

  // ── RBAC: block entire view ──
  if (!canView) return <NoAccess />;

  return (
    <div className="space-y-4">
      <ConfirmDialog />

      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Orçamento vs Realizado</h2>
          <p className="text-sm text-muted-foreground">
            Despesas por competência • Orçado: {fmt(totalOrcado)} | Realizado: {fmt(totalRealizado)} | Exec: {pctGlobal}%
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={mesAtual} onValueChange={setMesAtual}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map(m => <SelectItem key={m} value={m}>{formatMonthBR(m)}</SelectItem>)}</SelectContent>
          </Select>

          {canEdit && (
            <>
              <Button size="sm" onClick={openCreate}>
                <Plus className="w-4 h-4 mr-1" /> Novo
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
                <Copy className="w-4 h-4 mr-1" /> Copiar Mês
              </Button>
            </>
          )}

          {canExport && items.length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={gerarPDF}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={gerarExcel}>
                <FileSpreadsheet className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Content */}
      {loading ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground flex items-center justify-center gap-2">
          <Loader2 className="w-5 h-5 animate-spin" /> Carregando...
        </CardContent></Card>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum orçamento definido para {formatMonthBR(mesAtual)}.</p>
          <p className="text-sm">Clique em "Novo" para definir metas por categoria de despesa.</p>
        </CardContent></Card>
      ) : (
        <div className="space-y-3">
          {items.map(item => (
            <Card key={item.id} className={
              item.statusExecucao === 'estourado' ? 'border-destructive/50' :
              item.statusExecucao === 'alerta' ? 'border-warning/50' : ''
            }>
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <div className="flex items-center gap-2">
                    {item.statusExecucao === 'estourado' && <AlertTriangle className="w-4 h-4 text-destructive" />}
                    {item.statusExecucao === 'alerta' && <AlertTriangle className="w-4 h-4 text-warning" />}
                    <span className="font-medium">{item.categoriaNome}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className={`text-sm font-bold ${
                      item.statusExecucao === 'estourado' ? 'text-destructive' :
                      item.statusExecucao === 'alerta' ? 'text-warning' : 'text-success'
                    }`}>
                      {item.pctExecucao}%
                    </span>
                    {canEdit && (
                      <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(item)}>
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                    )}
                    {canDelete && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(item)}>
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <Progress value={Math.min(item.pctExecucao, 100)} className="h-2 mb-2" />
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>Realizado: {fmt(item.valorRealizado)}</span>
                  <span>Orçado: {fmt(item.valorOrcado)}</span>
                  {item.statusExecucao === 'estourado' && (
                    <span className="text-destructive font-medium">Excedido em {fmt(item.valorExcedido)}</span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) guardedOrcClose(); else setDialogOpen(true); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingId ? 'Editar Orçamento' : 'Novo Orçamento'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label>Categoria de Despesa</Label>
              {editingId ? (
                <p className="text-sm font-medium mt-1">{items.find(i => i.id === editingId)?.categoriaNome}</p>
              ) : (
                <Select value={form.categoria_id} onValueChange={v => setForm({ ...form, categoria_id: v })}>
                  <SelectTrigger><SelectValue placeholder="Selecione uma categoria" /></SelectTrigger>
                  <SelectContent>
                    {categoriasDisponiveis.map(c => (
                      <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
            <div>
              <Label>Valor Orçado (R$)</Label>
              <BRLInput numericValue={form.valor_orcado} onNumericChange={v => setForm({ ...form, valor_orcado: v })} showPrefix />
            </div>
            <Button onClick={save} className="w-full" disabled={saving}>
              {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : null}
              {saving ? 'Salvando...' : editingId ? 'Atualizar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Copy Month Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Copiar Orçamento de Outro Mês</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Copiar orçamentos para <strong>{formatMonthBR(mesAtual)}</strong>. Categorias já existentes serão ignoradas.
            </p>
            <div>
              <Label>Copiar de</Label>
              <Select value={copyFromMes} onValueChange={setCopyFromMes}>
                <SelectTrigger><SelectValue placeholder="Selecione o mês de origem" /></SelectTrigger>
                <SelectContent>
                  {meses.filter(m => m !== mesAtual).map(m => (
                    <SelectItem key={m} value={m}>{formatMonthBR(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCopy} className="w-full" disabled={copying || !copyFromMes}>
              {copying ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Copy className="w-4 h-4 mr-1" />}
              {copying ? 'Copiando...' : 'Copiar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
      <FormCloseConfirmDialog open={showOrcConfirm} onConfirmLeave={confirmOrcClose} onCancelLeave={cancelOrcClose} />
    </div>
  );
}

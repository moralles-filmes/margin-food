import { useState, useEffect, useCallback } from 'react';
import type { CursorListResponse, FinStatusCounts } from '@/types/financeiro';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { fmtBRL, formatDateBR, formatPercentBR, parseLocalDate } from '@/lib/formatters';
import { BRLInput } from '@/components/ui/brl-input';
import { useCan } from '@/permissions/hooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Plus, FileDown, RefreshCw, Trash2, Repeat, Ban, X } from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { gerarPDFContasReceber } from '@/lib/pdfFinanceiro';
import { todayBR } from '@/lib/datetime';
import CategoryCombobox from './CategoryCombobox';
import TableActions from '@/components/ui/TableActions';
import * as XLSX from 'xlsx';

/* ─── Types ─── */
interface ContaReceber {
  id: string;
  descricao: string;
  cliente: string | null;
  valor: number;
  status: string;
  data_vencimento: string;
  categoria_id: string | null;
  updated_at: string;
}

interface RateioLine {
  key: string;
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
}

interface Categoria { id: string; nome: string; tipo: string; codigo: string | null; centro_custo_padrao_id: string | null; }
interface Centro { id: string; nome: string; }
interface Conta { id: string; nome: string; }

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  RASCUNHO: { label: 'Rascunho', color: 'bg-muted text-muted-foreground' },
  A_RECEBER: { label: 'A Receber', color: 'bg-primary/10 text-primary border-primary/20' },
  RECEBIDO: { label: 'Recebido', color: 'bg-success/10 text-success border-success/20' },
  VENCIDO: { label: 'Vencido', color: 'bg-destructive/10 text-destructive border-destructive/20' },
  CANCELADO: { label: 'Cancelado', color: 'bg-muted text-muted-foreground' },
};

const PAGE_SIZE = 50;


function SkeletonRows() {
  return (<>{Array.from({ length: 5 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 6 }).map((_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  ))}</>);
}

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

export default function ContasReceberSection() {
  const canView = useCan('financeiro:receber:view');
  const canCreate = useCan('financeiro:receber:create');
  const canEdit = useCan('financeiro:receber:edit');
  const canExport = useCan('financeiro:receber:export');

  const [items, setItems] = useState<ContaReceber[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [centros, setCentros] = useState<Centro[]>([]);
  const [contas, setContas] = useState<Conta[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [filtroStatus, setFiltroStatus] = useState('todos');
  const [hasMore, setHasMore] = useState(false);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [serverTotals, setServerTotals] = useState({ totalPendente: 0, vencidas: 0 });

  const [form, setForm] = useState({
    descricao: '', valor: 0, data_vencimento: todayBR(), data_competencia: '',
    cliente: '', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'pix', observacoes: '',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);
  const [editingItem, setEditingItem] = useState<ContaReceber | null>(null);
  const [isDeletingId, setIsDeletingId] = useState<string | null>(null);

  useEffect(() => { if (canView) load(); }, [canView]);
  useEffect(() => { if (!canView) return; setCursorDate(null); setCursorId(null); setItems([]); loadPage(null, null); loadTotals(); }, [filtroStatus, canView]);
  useDataEvent('financeiro:cadastros', useCallback(() => { if (canView) loadAux(); }, [canView]));
  useDataEvent('financeiro:receber', useCallback(() => { if (canView) { loadPage(null, null); loadTotals(); } }, [canView]));

  if (!canView) return <NoAccess />;

  const loadPage = async (cDate: string | null, cId: string | null) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_fin_contas_receber_cursor', {
      p_status: filtroStatus !== 'todos' ? filtroStatus : null,
      p_limit: PAGE_SIZE, p_cursor_date: cDate, p_cursor_id: cId,
    });
    if (error) { console.error(error); setLoading(false); return; }
    const result = (data as unknown) as CursorListResponse<ContaReceber> | null;
    const newItems: ContaReceber[] = result?.items || [];
    setHasMore(result?.has_more || false);
    if (!cDate) setItems(newItems); else setItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) { const last = newItems[newItems.length - 1]; setCursorDate(last.data_vencimento); setCursorId(last.id); }
    setLoading(false);
  };

  const loadTotals = async () => {
    const { data } = await supabase.rpc('get_fin_counts_by_status');
    if (data) { const d = (data as unknown) as FinStatusCounts; setServerTotals({ totalPendente: Number(d.total_receber_pendente) || 0, vencidas: Number(d.vencidas_receber) || 0 }); }
  };

  const loadAux = async () => {
    const [catRes, ccRes, contRes] = await Promise.all([
      supabase.from('fin_categorias').select('id, nome, tipo, codigo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCategorias((catRes.data as Categoria[]) || []);
    setCentros((ccRes.data as Centro[]) || []);
    setContas((contRes.data as Conta[]) || []);
  };

  const load = async () => {
    setCursorDate(null); setCursorId(null);
    await Promise.all([loadPage(null, null), loadAux()]);
    loadTotals();
  };

  /* ─── Rateio helpers ─── */
  const addRateioLine = () => setRateioLines(prev => [...prev, { key: crypto.randomUUID(), categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0 }]);
  const removeRateioLine = (key: string) => setRateioLines(prev => prev.filter(l => l.key !== key));
  const updateRateioLine = (key: string, field: string, value: any) => {
    setRateioLines(prev => prev.map(l => {
      if (l.key !== key) return l;
      const updated = { ...l, [field]: value };
      if (field === 'categoria_id') {
        const cat = categorias.find(c => c.id === value);
        if (cat?.centro_custo_padrao_id) updated.centro_custo_id = cat.centro_custo_padrao_id;
      }
      return updated;
    }));
  };
  const ratearIgualmente = () => {
    if (rateioLines.length === 0) return;
    const perLine = Math.floor((form.valor / rateioLines.length) * 100) / 100;
    const remainder = form.valor - perLine * rateioLines.length;
    setRateioLines(prev => prev.map((l, i) => ({ ...l, valor: i === 0 ? perLine + Math.round(remainder * 100) / 100 : perLine, percentual: Math.round((100 / prev.length) * 10) / 10 })));
  };
  const totalRateio = rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0);
  const diffRateio = form.valor - totalRateio;
  const rateioValido = rateioLines.length === 0 || Math.abs(diffRateio) < 0.01;

  const handleCloseForm = () => {
    setForm({ descricao: '', valor: 0, data_vencimento: todayBR(), data_competencia: '', cliente: '', categoria_id: '', centro_custo_id: '', conta_id: '', forma_pagamento: 'pix', observacoes: '', recorrente: false, frequencia: 'mensal', parcelas: 0 });
    setRateioLines([]);
    setEditingItem(null);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: handleCloseForm });

  const handleEdit = async (item: ContaReceber) => {
    setLoading(true);
    try {
      const { data: detail, error: detailErr } = await supabase
        .from('fin_contas_receber')
        .select('*')
        .eq('id', item.id)
        .single();
      
      if (detailErr) throw detailErr;

      const { data: rates, error: rateErr } = await supabase
        .from('fin_lancamento_rateios')
        .select('*')
        .eq('lancamento_id', item.id);
      
      if (rateErr) throw rateErr;

      setEditingItem(detail);
      setForm({
        descricao: detail.descricao,
        valor: detail.valor,
        data_vencimento: detail.data_vencimento,
        data_competencia: detail.data_competencia || '',
        cliente: detail.cliente || '',
        categoria_id: detail.categoria_id || '',
        centro_custo_id: detail.centro_custo_id || '',
        conta_id: detail.conta_id || '',
        forma_pagamento: detail.forma_pagamento || 'pix',
        observacoes: detail.observacoes || '',
        recorrente: detail.recorrente || false,
        frequencia: (detail.recorrencia_config as any)?.frequencia || 'mensal',
        parcelas: (detail.recorrencia_config as any)?.parcelas || 0,
      });

      setRateioLines(rates.map(r => ({
        key: r.id,
        categoria_id: r.categoria_id,
        centro_custo_id: r.centro_custo_id,
        valor: r.valor,
        percentual: r.percentual,
      })));

      setShowForm(true);
    } catch (err: any) {
      toast.error('Erro ao carregar detalhes: ' + err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (item: ContaReceber) => {
    setIsDeletingId(item.id);
    try {
      const { error } = await (supabase.rpc as any)('_guarded_delete_conta_receber', { p_id: item.id });
      if (error) throw error;
      toast.success('Conta excluída');
      load();
      emitDataEvent('financeiro:receber');
    } catch (err: any) {
      toast.error('Erro ao excluir: ' + err.message);
    } finally {
      setIsDeletingId(null);
    }
  };

  /* ─── Save via RPC ─── */
  const save = async () => {
    if (saving) return;
    if (!form.descricao.trim() || form.valor <= 0) { toast.error('Descrição e valor obrigatórios'); return; }
    if (rateioLines.length > 0 && !rateioValido) { toast.error('Rateio incompleto'); return; }

    setSaving(true);
    try {
      let catId: string | null = null;
      let ccId: string | null = null;
      if (rateioLines.length === 1) { catId = rateioLines[0].categoria_id || null; ccId = rateioLines[0].centro_custo_id || null; }
      else if (form.categoria_id) catId = form.categoria_id;
      if (form.centro_custo_id && !ccId) ccId = form.centro_custo_id;

      const rateiosPayload = rateioLines.length > 1
        ? rateioLines.map(r => ({ categoria_id: r.categoria_id || null, centro_custo_id: r.centro_custo_id || null, valor: r.valor, percentual: r.percentual }))
        : [];

      const recorrencia = form.recorrente
        ? { frequencia: form.frequencia, parcelas: form.parcelas || null, parcelas_geradas: 0 }
        : null;

      // @enterprise-exception: as unknown needed — RPC expects Json for p_rateios/p_recorrencia but we send objects
      const { error } = await (supabase.rpc as any)(editingItem ? '_guarded_update_conta_receber' : '_guarded_create_conta_receber', {
        p_id: editingItem?.id, // Only used in update
        p_descricao: form.descricao,
        p_cliente: form.cliente || null,
        p_valor: form.valor,
        p_data_vencimento: form.data_vencimento,
        p_data_competencia: form.data_competencia || null,
        p_categoria_id: catId,
        p_centro_custo_id: ccId,
        p_conta_id: form.conta_id || null,
        p_forma_pagamento: form.forma_pagamento,
        p_observacoes: form.observacoes || null,
        p_rateios: JSON.stringify(rateiosPayload),
        p_recorrencia: recorrencia ? JSON.stringify(recorrencia) : null,
        p_expected_updated_at: editingItem?.updated_at, // Only used in update
      });

      if (error) { toast.error(error.message); return; }
      toast.success(editingItem ? 'Conta atualizada' : 'Conta a receber criada');
      handleCloseForm();
      load();
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Receive (existing RPC) ─── */
  const receber = async (item: ContaReceber) => {
    if (saving) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('receive_conta_receber', { p_id: item.id, p_expected_updated_at: item.updated_at });
      if (error) { toast.error(error.message); load(); return; }
      toast.success('Recebimento registrado + lançamento gerado');
      load();
      emitDataEvent('financeiro:receber');
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  /* ─── Export ─── */
  const exportExcel = () => {
    const rows = items.map(i => ({
      Descrição: i.descricao,
      Cliente: i.cliente || '',
      Valor: i.valor,
      Status: STATUS_CONFIG[i.status]?.label || i.status,
      Vencimento: formatDateBR(parseLocalDate(i.data_vencimento)),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Contas a Receber');
    XLSX.writeFile(wb, 'contas_a_receber.xlsx');
  };

  const fmt = fmtBRL;
  const today = todayBR();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Contas a Receber</h2>
          <p className="text-sm text-muted-foreground">
            {serverTotals.vencidas > 0 && <span className="text-destructive font-medium">{serverTotals.vencidas} vencida(s) • </span>}
            Total pendente: {fmt(serverTotals.totalPendente)}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={() => gerarPDFContasReceber({ items })} disabled={items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Select value={filtroStatus} onValueChange={setFiltroStatus}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="todos">Todos</SelectItem>
              <SelectItem value="A_RECEBER">A Receber</SelectItem>
              <SelectItem value="RECEBIDO">Recebido</SelectItem>
              <SelectItem value="VENCIDO">Vencido</SelectItem>
            </SelectContent>
          </Select>
          {canCreate && (
            <Dialog open={showForm} onOpenChange={(o) => { if (!o) guardedClose(); else setShowForm(true); }}>
              <DialogTrigger asChild><Button size="sm"><Plus className="w-4 h-4 mr-1" /> Nova Conta</Button></DialogTrigger>
              <DialogContent className="max-w-lg">
                <DialogHeader>
                  <div className="flex items-center justify-between">
                    <DialogTitle>{editingItem ? 'Editar Conta a Receber' : 'Nova Conta a Receber'}</DialogTitle>
                    <button type="button" onClick={guardedClose} aria-label="Fechar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
                  </div>
                </DialogHeader>
                <div className="space-y-3 max-h-[70vh] overflow-y-auto pr-1">
                  <div><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm({...form, descricao: e.target.value})} /></div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Valor (R$)</Label><BRLInput numericValue={form.valor} onNumericChange={v => setForm({...form, valor: v})} showPrefix /></div>
                    <div><Label>Vencimento</Label><Input type="date" value={form.data_vencimento} onChange={e => setForm({...form, data_vencimento: e.target.value})} /></div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Data Competência</Label><Input type="date" value={form.data_competencia} onChange={e => setForm({...form, data_competencia: e.target.value})} /></div>
                    <div><Label>Cliente</Label><Input value={form.cliente} onChange={e => setForm({...form, cliente: e.target.value})} /></div>
                  </div>

                  {/* Rateio por Categoria */}
                  <div className="border border-border rounded-lg p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <Label className="text-sm font-semibold">Rateio por Categoria</Label>
                      <div className="flex gap-1">
                        {rateioLines.length > 1 && form.valor > 0 && (
                          <Button type="button" size="sm" variant="outline" onClick={ratearIgualmente} className="text-xs h-7">🧮 Ratear Igual</Button>
                        )}
                        <Button type="button" size="sm" variant="outline" onClick={addRateioLine} className="text-xs h-7"><Plus className="w-3 h-3 mr-1" /> Linha</Button>
                      </div>
                    </div>
                    {rateioLines.length === 0 ? (
                      <p className="text-xs text-muted-foreground text-center py-2">Nenhuma linha de rateio. Clique "+ Linha" para categorizar.</p>
                    ) : (
                      <>
                        <Table>
                          <TableHeader><TableRow>
                            <TableHead className="text-xs">Categoria</TableHead>
                            <TableHead className="text-xs">Centro Custo</TableHead>
                            <TableHead className="text-xs w-24">Valor</TableHead>
                            <TableHead className="text-xs w-16">%</TableHead>
                            <TableHead className="text-xs w-8"></TableHead>
                          </TableRow></TableHeader>
                          <TableBody>
                            {rateioLines.map(line => (
                              <TableRow key={line.key}>
                                <TableCell className="p-1">
                                  <CategoryCombobox value={line.categoria_id} onValueChange={v => updateRateioLine(line.key, 'categoria_id', v)} options={categorias.filter(c => c.tipo === 'receita')} />
                                </TableCell>
                                <TableCell className="p-1">
                                  <Select value={line.centro_custo_id} onValueChange={v => updateRateioLine(line.key, 'centro_custo_id', v)}>
                                    <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Auto" /></SelectTrigger>
                                    <SelectContent>{centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                                  </Select>
                                </TableCell>
                                <TableCell className="p-1">
                                  <BRLInput numericValue={line.valor || 0} onNumericChange={val => {
                                    const pct = form.valor > 0 ? (val / form.valor) * 100 : 0;
                                    updateRateioLine(line.key, 'valor', val);
                                    updateRateioLine(line.key, 'percentual', Math.round(pct * 10) / 10);
                                  }} showPrefix className="h-8 text-xs" />
                                </TableCell>
                                <TableCell className="p-1 text-xs text-muted-foreground text-center">{line.percentual ? formatPercentBR(line.percentual, 1) : '—'}</TableCell>
                                <TableCell className="p-1"><Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRateioLine(line.key)}><Trash2 className="w-3 h-3 text-destructive" /></Button></TableCell>
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                        <div className="flex items-center justify-between text-xs px-1">
                          <span className="text-muted-foreground">Total rateado: <strong>{fmt(totalRateio)}</strong></span>
                          {Math.abs(diffRateio) >= 0.01 && <span className="text-destructive font-medium">Diferença: {fmt(diffRateio)}</span>}
                          {Math.abs(diffRateio) < 0.01 && rateioLines.length > 0 && <span className="text-success font-medium">✅ Rateio fechado</span>}
                        </div>
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div><Label>Conta</Label>
                      <Select value={form.conta_id} onValueChange={v => setForm({...form, conta_id: v})}>
                        <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                        <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                      </Select>
                    </div>
                    <div><Label>Forma</Label>
                      <Select value={form.forma_pagamento} onValueChange={v => setForm({...form, forma_pagamento: v})}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pix">PIX</SelectItem>
                          <SelectItem value="boleto">Boleto</SelectItem>
                          <SelectItem value="dinheiro">Dinheiro</SelectItem>
                          <SelectItem value="cartao">Cartão</SelectItem>
                          <SelectItem value="transferencia">Transferência</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                  <div><Label>Observações</Label><Textarea value={form.observacoes} onChange={e => setForm({...form, observacoes: e.target.value})} /></div>

                  {/* Recorrência */}
                  <div className="border-t border-border pt-3 mt-1">
                    <div className="flex items-center justify-between">
                      <Label className="flex items-center gap-2"><Repeat className="w-4 h-4 text-muted-foreground" /> Recorrente</Label>
                      <Switch checked={form.recorrente} onCheckedChange={v => setForm({...form, recorrente: v})} />
                    </div>
                    {form.recorrente && (
                      <div className="grid grid-cols-2 gap-3 mt-3">
                        <div><Label>Frequência</Label>
                          <Select value={form.frequencia} onValueChange={v => setForm({...form, frequencia: v})}>
                            <SelectTrigger><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="mensal">Mensal</SelectItem>
                              <SelectItem value="semanal">Semanal</SelectItem>
                              <SelectItem value="quinzenal">Quinzenal</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div><Label>Parcelas (0 = ∞)</Label>
                          <Input type="text" inputMode="numeric" value={form.parcelas || ''} onChange={e => setForm({...form, parcelas: parseInt(e.target.value, 10) || 0})} placeholder="0" />
                        </div>
                      </div>
                    )}
                  </div>

                  <Button onClick={save} className="w-full" disabled={saving || (rateioLines.length > 0 && !rateioValido)}>
                    {saving ? (editingItem ? 'Salvando...' : 'Criando...') : (editingItem ? 'Salvar Alterações' : 'Criar Conta a Receber')}
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Vencimento</TableHead>
            <TableHead>Descrição</TableHead>
            <TableHead>Cliente</TableHead>
            <TableHead>Valor</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Ações</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading && items.length === 0 ? (
            <SkeletonRows />
          ) : items.length === 0 ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-8">Nenhuma conta a receber</TableCell></TableRow>
          ) : items.map(item => {
            const sc = STATUS_CONFIG[item.status] || STATUS_CONFIG.RASCUNHO;
            const isVencida = item.data_vencimento < today && !['RECEBIDO', 'CANCELADO'].includes(item.status);
            return (
              <TableRow key={item.id} className={isVencida ? 'bg-destructive/5' : ''}>
                <TableCell className={`font-mono text-sm ${isVencida ? 'text-destructive font-bold' : ''}`}>{formatDateBR(parseLocalDate(item.data_vencimento))}</TableCell>
                <TableCell className="font-medium max-w-[200px] truncate">{item.descricao}</TableCell>
                <TableCell className="text-muted-foreground">{item.cliente || '—'}</TableCell>
                <TableCell className="font-bold text-success">{fmt(item.valor)}</TableCell>
                <TableCell><span className={`text-xs px-2 py-0.5 rounded-full border ${sc.color}`}>{sc.label}</span></TableCell>
                <TableCell>
                  <div className="flex gap-1 items-center justify-end">
                    {item.status === 'A_RECEBER' && canEdit && (
                      <Button size="sm" variant="default" onClick={() => receber(item)} disabled={saving} className="text-xs h-7">Receber</Button>
                    )}
                    {(item.status === 'A_RECEBER' || item.status === 'VENCIDO' || item.status === 'RASCUNHO') && (
                      <TableActions
                        onEdit={() => handleEdit(item)}
                        onDelete={() => handleDelete(item)}
                        editPermission="financeiro:receber:edit"
                        deletePermission="financeiro:receber:delete"
                        isDeleting={isDeletingId === item.id}
                      />
                    )}
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      {hasMore && items.length > 0 && (
        <div className="flex justify-center">
          <Button variant="outline" size="sm" onClick={() => loadPage(cursorDate, cursorId)} disabled={loading}>
            {loading ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
            Carregar mais
          </Button>
        </div>
      )}
      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
    </div>
  );
}

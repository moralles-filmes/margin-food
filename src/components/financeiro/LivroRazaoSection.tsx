import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { todayBR, formatDateBR } from '@/lib/datetime';
import { fmtBRL } from '@/lib/money';
import { BRLInput } from '@/components/ui/brl-input';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import CategoryCombobox from '@/components/financeiro/CategoryCombobox';
import {
  Plus, Edit, Trash2, TrendingUp, TrendingDown, ArrowUpRight,
  RefreshCw, Link2, Repeat, ShieldAlert, Download, X
} from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import * as XLSX from 'xlsx';

// ─── Types ───
interface Lancamento {
  id: string;
  tipo: string;
  status: string;
  valor: number;
  descricao: string | null;
  observacoes: string | null;
  conta_id: string | null;
  conta_destino_id: string | null;
  categoria_id: string | null;
  centro_custo_id: string | null;
  data_competencia: string;
  data_vencimento: string | null;
  data_pagamento: string | null;
  forma_pagamento: string | null;
  origem: string;
  recorrente: boolean;
  recorrencia_config: Record<string, unknown> | null;
  conciliado: boolean | null;
  referencia_id: string | null;
  updated_at: string;
}

interface RateioLine {
  key: string;
  categoria_id: string;
  centro_custo_id: string;
  valor: number;
  percentual: number;
  observacao: string;
}

interface CategoriaRef { id: string; nome: string; tipo: string; centro_custo_padrao_id: string | null }
interface CentroCustoRef { id: string; nome: string }
interface ContaRef { id: string; nome: string }

// ─── Helpers ───
function fmtDateBR(d: string) {
  if (!d) return '—';
  const [y, m, day] = d.split('-');
  return `${day}/${m}/${y}`;
}

function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium text-foreground">Acesso negado</p>
      <p className="text-sm text-muted-foreground">Você não tem permissão para visualizar lançamentos.</p>
    </div>
  );
}

function SkeletonTableRows() {
  return (
    <>
      {[...Array(5)].map((_, i) => (
        <TableRow key={i}>
          {[...Array(7)].map((_, j) => (
            <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
          ))}
        </TableRow>
      ))}
    </>
  );
}

const ORIGEM_LABEL: Record<string, { text: string; cls: string; tooltip: string }> = {
  manual: { text: 'Manual', cls: 'bg-muted text-muted-foreground border-border', tooltip: 'Lançamento criado manualmente no Livro Razão' },
  conciliacao: { text: 'Conciliação', cls: 'bg-primary/10 text-primary border-primary/20', tooltip: 'Lançamento criado a partir da conciliação bancária' },
  espelho_cp: { text: 'Espelho CP', cls: 'bg-warning/10 text-warning-foreground border-warning/20', tooltip: 'Lançamento gerado pela baixa de uma Conta a Pagar' },
  espelho_cr: { text: 'Espelho CR', cls: 'bg-success/10 text-success border-success/20', tooltip: 'Lançamento gerado pelo recebimento de uma Conta a Receber' },
  transferencia: { text: 'Transferência', cls: 'bg-accent text-accent-foreground border-border', tooltip: 'Movimentação entre contas financeiras' },
};

const STATUS_COLOR: Record<string, string> = {
  PREVISTO: 'bg-warning/10 text-warning-foreground border-warning/20',
  REALIZADO: 'bg-success/10 text-success border-success/20',
  CANCELADO: 'bg-muted text-muted-foreground border-muted',
};

interface LivroRazaoProps {
  initialContaId?: string;
}

export default function LivroRazaoSection({ initialContaId }: LivroRazaoProps = {}) {
  const { user } = useAuth();
  const canView = useCan('financeiro:lancamentos:view');
  const canCreate = useCan('financeiro:lancamentos:create');
  const canEdit = useCan('financeiro:lancamentos:edit');
  const canDelete = useCan('financeiro:lancamentos:delete');
  const canExport = useCan('financeiro:lancamentos:export');

  const [items, setItems] = useState<Lancamento[]>([]);
  const [categorias, setCategorias] = useState<CategoriaRef[]>([]);
  const [centros, setCentros] = useState<CentroCustoRef[]>([]);
  const [contas, setContas] = useState<ContaRef[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [editPrevStatus, setEditPrevStatus] = useState<string | null>(null);
  const [justificativa, setJustificativa] = useState('');
  const [filtroTipo, setFiltroTipo] = useState('todos');
  const [filtroOrigem, setFiltroOrigem] = useState('todos');
  const [filtroConta, setFiltroConta] = useState(initialContaId || 'todos');
  const [filtroDataDe, setFiltroDataDe] = useState(() => {
    const d = new Date(); d.setDate(d.getDate() - 30);
    return formatDateBR(d);
  });
  const [filtroDataAte, setFiltroDataAte] = useState(() => todayBR());

  const PAGE_SIZE = 50;
  const [hasMore, setHasMore] = useState(false);
  const [cursorDate, setCursorDate] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);

  const [form, setForm] = useState({
    tipo: 'DESPESA', valor: 0, data_competencia: todayBR(),
    data_vencimento: '', data_pagamento: '',
    descricao: '', conta_id: '', conta_destino_id: '',
    forma_pagamento: 'pix', status: 'PREVISTO',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);

  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ─── Pagination ───
  const loadPage = useCallback(async (cDate: string | null, cId: string | null) => {
    setLoading(true);
    const { data, error } = await supabase.rpc('list_fin_lancamentos_cursor', {
      p_start: filtroDataDe,
      p_end: filtroDataAte,
      p_tipo: filtroTipo !== 'todos' ? filtroTipo : null,
      p_conta_id: filtroConta !== 'todos' ? filtroConta : null,
      p_origem: filtroOrigem !== 'todos' ? filtroOrigem : null,
      p_limit: PAGE_SIZE,
      p_cursor_date: cDate,
      p_cursor_id: cId,
    });
    if (error) { console.error(error); setLoading(false); return; }
    const result = data as unknown as { items: Lancamento[]; has_more: boolean } | null;
    const newItems = result?.items || [];
    setHasMore(result?.has_more || false);
    if (!cDate) setItems(newItems);
    else setItems(prev => [...prev, ...newItems]);
    if (newItems.length > 0) {
      const last = newItems[newItems.length - 1];
      setCursorDate(last.data_competencia);
      setCursorId(last.id);
    }
    setLoading(false);
  }, [filtroDataDe, filtroDataAte, filtroTipo, filtroConta, filtroOrigem]);

  const load = useCallback(async () => {
    setCursorDate(null);
    setCursorId(null);
    const [_, catRes, ccRes, contRes] = await Promise.all([
      loadPage(null, null),
      supabase.from('fin_categorias').select('id, nome, tipo, centro_custo_padrao_id').eq('ativo', true).order('nome'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
      supabase.from('fin_contas').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setCategorias((catRes.data as CategoriaRef[]) || []);
    setCentros((ccRes.data as CentroCustoRef[]) || []);
    setContas((contRes.data as ContaRef[]) || []);
  }, [loadPage]);

  useEffect(() => { if (canView) load(); }, [load, canView]);
  useEffect(() => { setCursorDate(null); setCursorId(null); setItems([]); loadPage(null, null); }, [filtroTipo, filtroOrigem, filtroConta, filtroDataDe, filtroDataAte, loadPage]);
  useDataEvent('financeiro:lancamentos', load);

  if (!canView) return <NoAccess />;

  const fmt = fmtBRL;
  const catNome = (id: string) => categorias.find(c => c.id === id)?.nome || '';
  const contaNome = (id: string) => contas.find(c => c.id === id)?.nome || '—';

  const totalRateio = rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0);
  const diffRateio = (form.valor || 0) - totalRateio;
  const rateioValido = rateioLines.length === 0 || Math.abs(diffRateio) < 0.01;

  // ─── Rateio helpers ───
  const addRateioLine = () => {
    setRateioLines(prev => [...prev, { key: crypto.randomUUID(), categoria_id: '', centro_custo_id: '', valor: 0, percentual: 0, observacao: '' }]);
  };

  const updateRateioLine = (key: string, field: string, value: string | number) => {
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

  const removeRateioLine = (key: string) => setRateioLines(prev => prev.filter(l => l.key !== key));

  const ratearIgualmente = () => {
    if (rateioLines.length === 0) return;
    const total = form.valor || 0;
    const perLine = Math.floor((total / rateioLines.length) * 100) / 100;
    const remainder = total - perLine * rateioLines.length;
    setRateioLines(prev => prev.map((l, i) => ({
      ...l,
      valor: i === 0 ? perLine + Math.round(remainder * 100) / 100 : perLine,
      percentual: Math.round((100 / prev.length) * 10) / 10,
    })));
  };

  // ─── Form ───
  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setEditPrevStatus(null);
    setJustificativa('');
    setForm({ tipo: 'DESPESA', valor: 0, data_competencia: todayBR(), data_vencimento: '', data_pagamento: '', descricao: '', conta_id: '', conta_destino_id: '', forma_pagamento: 'pix', status: 'PREVISTO', recorrente: false, frequencia: 'mensal', parcelas: 0 });
    setRateioLines([]);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: resetForm });

  const openEdit = (item: Lancamento) => {
    // Block editing conciliados
    if (item.conciliado) {
      toast.error('Lançamentos conciliados devem ser desconciliados antes da edição.');
      return;
    }

    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setEditPrevStatus(item.status);
    setJustificativa('');

    if (item.tipo === 'TRANSFERENCIA') {
      setForm({
        tipo: 'TRANSFERENCIA', valor: item.valor, data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
        descricao: item.observacoes || item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: item.conta_destino_id || '',
        forma_pagamento: 'TRANSFERENCIA', status: item.status, recorrente: false, frequencia: 'mensal', parcelas: 0,
      });
    } else {
      setForm({
        tipo: item.tipo, valor: item.valor, data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
        descricao: item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: '',
        forma_pagamento: item.forma_pagamento || 'pix', status: item.status, recorrente: item.recorrente || false, frequencia: 'mensal', parcelas: 0,
      });
    }
    setShowForm(true);
  };

  const deleteLancamento = async (item: Lancamento) => {
    const ok = await confirm({ title: 'Excluir lançamento', description: 'Tem certeza que deseja excluir este lançamento? Esta ação não pode ser desfeita.', confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    setSaving(true);
    try {
      if (item.tipo === 'TRANSFERENCIA') {
        const { error } = await supabase.rpc('delete_transfer', { p_lancamento_id: item.id });
        if (error) throw error;
        toast.success('Transferência excluída (ambos os lados)');
      } else {
        const { error } = await supabase.from('fin_lancamentos').delete().eq('id', item.id);
        if (error) throw error;
        toast.success('Lançamento excluído');
      }
      load();
      emitDataEvent('financeiro:lancamentos');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Erro ao excluir';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  const save = async () => {
    if (saving) return;
    if (!form.descricao.trim()) { toast.error('Descrição obrigatória'); return; }

    // === TRANSFER FLOW ===
    if (form.tipo === 'TRANSFERENCIA') {
      if (!form.conta_id || !form.conta_destino_id) { toast.error('Selecione conta origem e destino'); return; }
      if (form.conta_id === form.conta_destino_id) { toast.error('Contas devem ser diferentes'); return; }
      if (!form.valor || form.valor <= 0) { toast.error('Valor obrigatório'); return; }

      setSaving(true);
      try {
        if (editId) {
          const { error } = await supabase.rpc('update_transfer', {
            p_lancamento_id: editId,
            p_valor: form.valor,
            p_data_competencia: form.data_competencia,
            p_descricao: form.descricao || '',
            p_conta_origem_id: form.conta_id,
            p_conta_destino_id: form.conta_destino_id,
          });
          if (error) { toast.error(error.message); return; }
          toast.success('Transferência atualizada (ambos os lados)');
        } else {
          const { error } = await supabase.rpc('create_transfer', {
            p_conta_origem: form.conta_id,
            p_conta_destino: form.conta_destino_id,
            p_valor: form.valor,
            p_data: form.data_competencia,
            p_descricao: form.descricao || '',
            p_created_by: user?.id || null,
          });
          if (error) { toast.error(error.message); return; }
          toast.success('Transferência registrada com sucesso!');
        }
        resetForm();
        load();
        emitDataEvent('financeiro:lancamentos');
      } finally {
        setSaving(false);
      }
      return;
    }

    // === NORMAL FLOW ===
    const valorFinal = rateioLines.length > 0 ? totalRateio : form.valor;
    if (!valorFinal || valorFinal <= 0) { toast.error('Valor obrigatório'); return; }
    if (rateioLines.length > 0 && !rateioValido) { toast.error(`Rateio incompleto. Ajuste os valores para totalizar ${fmt(form.valor)}.`); return; }
    if (rateioLines.length > 0 && rateioLines.some(l => !l.categoria_id)) { toast.error('Todas as linhas de rateio precisam de categoria'); return; }

    // Justificativa required for REALIZADO edits
    if (editId && editPrevStatus === 'REALIZADO' && !justificativa.trim()) {
      toast.error('Justificativa obrigatória para edição de lançamento REALIZADO.');
      return;
    }

    // Duplicate check (new only)
    if (!editId) {
      const tolerance = valorFinal * 0.02;
      const cpTable = form.tipo === 'DESPESA' ? 'fin_contas_pagar' : 'fin_contas_receber';
      const statusFilter = form.tipo === 'DESPESA' ? ['AGUARDANDO_APROVACAO', 'APROVADO'] : ['A_RECEBER'];
      const { data: possibleDups } = await supabase.from(cpTable)
        .select('id, descricao, valor, data_vencimento, status')
        .in('status', statusFilter)
        .gte('valor', valorFinal - tolerance)
        .lte('valor', valorFinal + tolerance)
        .limit(5);

      if (possibleDups && possibleDups.length > 0) {
        const dupDescriptions = possibleDups.map((d: { descricao: string; valor: number; data_vencimento: string }) =>
          `• ${d.descricao} — ${fmt(d.valor)} (venc: ${d.data_vencimento})`
        ).join('\n');
        const proceed = await confirm({
          title: '⚠️ Possível duplicidade detectada',
          description: `Encontramos ${form.tipo === 'DESPESA' ? 'Conta(s) a Pagar' : 'Conta(s) a Receber'} com valor semelhante:\n\n${dupDescriptions}\n\nDeseja criar o lançamento mesmo assim?`,
          confirmLabel: 'Criar mesmo assim',
          variant: 'destructive',
        });
        if (!proceed) return;
      }
    }

    setSaving(true);
    try {
      const rateiosPayload = rateioLines.length > 0
        ? rateioLines.map(l => ({
            categoria_id: l.categoria_id,
            centro_custo_id: l.centro_custo_id || null,
            valor: l.valor,
            percentual: l.percentual || null,
            observacao: l.observacao || null,
          }))
        : [];

      const rpcParams: Record<string, unknown> = {
        p_id: editId || null,
        p_tipo: form.tipo,
        p_status: form.status,
        p_valor: valorFinal,
        p_conta_id: form.conta_id || null,
        p_categoria_id: rateioLines.length === 1 ? rateioLines[0].categoria_id : null,
        p_centro_custo_id: rateioLines.length === 1 ? (rateioLines[0].centro_custo_id || null) : null,
        p_data_competencia: form.data_competencia,
        p_data_vencimento: form.data_vencimento || null,
        p_data_pagamento: form.data_pagamento || (form.status === 'REALIZADO' ? form.data_competencia : null),
        p_descricao: form.descricao,
        p_observacoes: null,
        p_forma_pagamento: form.forma_pagamento,
        p_origem: 'manual',
        p_recorrente: form.recorrente,
        p_recorrencia_config: form.recorrente ? JSON.stringify({ frequencia: form.frequencia, parcelas: form.parcelas || null, parcelas_geradas: 0 }) : null,
        p_rateios: JSON.stringify(rateiosPayload),
        p_updated_at: editUpdatedAt || null,
        p_justificativa_edicao: justificativa.trim() || null,
      };

      const { data, error } = await supabase.rpc('_guarded_upsert_lancamento' as any, rpcParams as any);
      if (error) {
        if (error.message?.includes('CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuário. Recarregue a página.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success(editId ? 'Lançamento atualizado' : (form.recorrente ? 'Lançamento recorrente criado!' : 'Lançamento criado'));
      resetForm();
      load();
      emitDataEvent('financeiro:lancamentos');
    } finally {
      setSaving(false);
    }
  };

  // ─── Export ───
  const exportExcel = () => {
    const rows = items.map(item => ({
      data_competencia: fmtDateBR(item.data_competencia),
      descricao: item.descricao || '',
      tipo: item.tipo,
      status: item.status,
      conta: contaNome(item.conta_id || ''),
      categoria: catNome(item.categoria_id || ''),
      valor: item.valor,
      origem: item.origem,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Lançamentos');
    XLSX.writeFile(wb, 'lancamentos.xlsx');
    toast.success('Exportação concluída');
  };

  const handleVerOrigem = (item: Lancamento) => {
    const origem = item.origem || (item.tipo === 'TRANSFERENCIA' ? 'transferencia' : 'manual');
    if (origem === 'espelho_cp' && item.referencia_id) {
      toast.info('Navegando para Conta a Pagar vinculada...');
    } else if (origem === 'espelho_cr' && item.referencia_id) {
      toast.info('Navegando para Conta a Receber vinculada...');
    } else if (origem === 'conciliacao') {
      toast.info('Lançamento originado da conciliação bancária');
    } else {
      openEdit(item);
    }
  };

  // ─── Render ───
  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Livro Razão</h2>
            <p className="text-sm text-muted-foreground">Ledger central — registra todas as movimentações financeiras realizadas</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} className="w-36 h-9 text-xs" />
            <span className="text-muted-foreground text-xs">até</span>
            <Input type="date" value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} className="w-36 h-9 text-xs" />
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="RECEITA">Receitas</SelectItem>
                <SelectItem value="DESPESA">Despesas</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferências</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas origens</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="conciliacao">Conciliação</SelectItem>
                <SelectItem value="espelho_cp">Espelho CP</SelectItem>
                <SelectItem value="espelho_cr">Espelho CR</SelectItem>
                <SelectItem value="transferencia">Transferência</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroConta} onValueChange={setFiltroConta}>
              <SelectTrigger className="w-36 h-9"><SelectValue placeholder="Conta" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas contas</SelectItem>
                {contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
              </SelectContent>
            </Select>
            {canExport && (
              <Button size="sm" variant="outline" onClick={exportExcel}>
                <Download className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            {canCreate && (
              <>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setForm(f => ({ ...f, tipo: 'DESPESA' })); setShowForm(true); }} disabled={saving}>
                  <TrendingDown className="w-4 h-4 mr-1 text-destructive" /> Nova Despesa
                </Button>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setForm(f => ({ ...f, tipo: 'RECEITA' })); setShowForm(true); }} disabled={saving}>
                  <TrendingUp className="w-4 h-4 mr-1 text-success" /> Nova Receita
                </Button>
                <Button size="sm" variant="outline" onClick={() => { resetForm(); setForm(f => ({ ...f, tipo: 'TRANSFERENCIA' })); setShowForm(true); }} disabled={saving}>
                  <ArrowUpRight className="w-4 h-4 mr-1" /> Nova Transferência
                </Button>
              </>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descrição</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Ações</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <SkeletonTableRows />
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lançamento encontrado</TableCell></TableRow>
            ) : items.map(item => {
              const orig = ORIGEM_LABEL[item.origem || (item.tipo === 'TRANSFERENCIA' ? 'transferencia' : 'manual')] || ORIGEM_LABEL.manual;
              return (
                <TableRow key={item.id}>
                  <TableCell className="font-mono text-sm">{fmtDateBR(item.data_competencia)}</TableCell>
                  <TableCell className="font-medium max-w-[250px]">
                    {item.recorrente && <Repeat className="w-3 h-3 inline mr-1 text-muted-foreground" />}
                    <span className="truncate block">{item.descricao}</span>
                    {item.tipo === 'TRANSFERENCIA' && item.conta_id && item.conta_destino_id && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <ArrowUpRight className="w-3 h-3" />
                        {contaNome(item.conta_id)} → {contaNome(item.conta_destino_id)}
                      </span>
                    )}
                    {item.conciliado && <span className="text-[10px] text-success ml-1">✓ Conciliado</span>}
                  </TableCell>
                  <TableCell>
                    <Badge variant={item.tipo === 'RECEITA' ? 'default' : item.tipo === 'DESPESA' ? 'destructive' : 'outline'}>
                      {item.tipo === 'TRANSFERENCIA' ? 'Transf.' : item.tipo}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <TooltipProvider delayDuration={200}>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full border cursor-help ${orig.cls}`}>{orig.text}</span>
                        </TooltipTrigger>
                        <TooltipContent side="top" className="max-w-[220px] text-xs">{orig.tooltip}</TooltipContent>
                      </Tooltip>
                    </TooltipProvider>
                  </TableCell>
                  <TableCell className={`font-bold ${item.tipo === 'RECEITA' ? 'text-success' : item.tipo === 'TRANSFERENCIA' ? 'text-foreground' : 'text-destructive'}`}>
                    {item.tipo === 'RECEITA' ? '+' : item.tipo === 'TRANSFERENCIA' ? '' : '-'} {fmt(item.valor)}
                  </TableCell>
                  <TableCell><span className={`text-xs px-2 py-0.5 rounded-full border ${STATUS_COLOR[item.status] || ''}`}>{item.status}</span></TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-7 w-7" title="Ver origem" onClick={() => handleVerOrigem(item)}>
                        <Link2 className="w-3.5 h-3.5 text-muted-foreground" />
                      </Button>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} disabled={saving}>
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLancamento(item)} disabled={saving}>
                          <Trash2 className="w-3.5 h-3.5 text-destructive" />
                        </Button>
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
      </div>

      {/* Form Dialog */}
      {canCreate && (
        <Dialog open={showForm} onOpenChange={o => { if (!o) guardedClose(); }}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <div className="flex items-center justify-between">
                <DialogTitle>{editId ? 'Editar Lançamento' : 'Novo Lançamento'}</DialogTitle>
                <button type="button" onClick={guardedClose} aria-label="Fechar" className="p-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"><X className="w-4 h-4" /></button>
              </div>
            </DialogHeader>
            <div className="space-y-3 max-h-[75vh] overflow-y-auto pr-1">
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Tipo</Label>
                  <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })} disabled={!!editId && form.tipo === 'TRANSFERENCIA'}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RECEITA">Receita</SelectItem>
                      <SelectItem value="DESPESA">Despesa</SelectItem>
                      <SelectItem value="TRANSFERENCIA">Transferência</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div><Label>Valor Total (R$)</Label><BRLInput numericValue={form.valor} onNumericChange={v => setForm({ ...form, valor: v })} showPrefix /></div>
                <div><Label>Status</Label>
                  <Select value={form.status} onValueChange={v => setForm({ ...form, status: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PREVISTO">Previsto</SelectItem>
                      <SelectItem value="REALIZADO">Realizado</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div><Label>Descrição</Label><Input value={form.descricao} onChange={e => setForm({ ...form, descricao: e.target.value })} /></div>
              <div className="grid grid-cols-3 gap-3">
                <div><Label>Data Competência</Label><Input type="date" value={form.data_competencia} onChange={e => setForm({ ...form, data_competencia: e.target.value })} /></div>
                <div><Label>Data Vencimento</Label><Input type="date" value={form.data_vencimento} onChange={e => setForm({ ...form, data_vencimento: e.target.value })} /></div>
                <div><Label>Data Pagamento</Label><Input type="date" value={form.data_pagamento} onChange={e => setForm({ ...form, data_pagamento: e.target.value })} /></div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div><Label>{form.tipo === 'TRANSFERENCIA' ? 'Conta Origem' : 'Conta'}</Label>
                  <Select value={form.conta_id} onValueChange={v => setForm({ ...form, conta_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                    <SelectContent>{contas.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                {form.tipo === 'TRANSFERENCIA' ? (
                  <div><Label>Conta Destino</Label>
                    <Select value={form.conta_destino_id} onValueChange={v => setForm({ ...form, conta_destino_id: v })}>
                      <SelectTrigger><SelectValue placeholder="Selecione" /></SelectTrigger>
                      <SelectContent>{contas.filter(c => c.id !== form.conta_id).map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                ) : (
                  <div><Label>Forma</Label>
                    <Select value={form.forma_pagamento} onValueChange={v => setForm({ ...form, forma_pagamento: v })}>
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
                )}
              </div>

              {/* Rateio - non-transfers only */}
              {form.tipo !== 'TRANSFERENCIA' && (
                <div className="border border-border rounded-lg p-3 space-y-3">
                  <div className="flex items-center justify-between">
                    <Label className="text-sm font-semibold">Rateio por Categoria</Label>
                    <div className="flex gap-1">
                      {rateioLines.length > 1 && form.valor > 0 && (
                        <Button type="button" size="sm" variant="outline" onClick={ratearIgualmente} className="text-xs h-7">
                          🧮 Ratear Igual
                        </Button>
                      )}
                      <Button type="button" size="sm" variant="outline" onClick={addRateioLine} className="text-xs h-7">
                        <Plus className="w-3 h-3 mr-1" /> Linha
                      </Button>
                    </div>
                  </div>
                  {rateioLines.length === 0 ? (
                    <p className="text-xs text-muted-foreground text-center py-2">Nenhuma linha de rateio. Clique "+ Linha" para categorizar o lançamento.</p>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="text-xs">Categoria</TableHead>
                            <TableHead className="text-xs">Centro Custo</TableHead>
                            <TableHead className="text-xs w-24">Valor</TableHead>
                            <TableHead className="text-xs w-16">%</TableHead>
                            <TableHead className="text-xs w-8"></TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rateioLines.map(line => (
                            <TableRow key={line.key}>
                              <TableCell className="p-1">
                                <CategoryCombobox
                                  value={line.categoria_id}
                                  onValueChange={v => updateRateioLine(line.key, 'categoria_id', v)}
                                  options={categorias.filter(c => c.tipo === form.tipo.toLowerCase())}
                                />
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
                              <TableCell className="p-1 text-xs text-muted-foreground text-center">
                                {line.percentual ? `${line.percentual}%` : '—'}
                              </TableCell>
                              <TableCell className="p-1">
                                <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => removeRateioLine(line.key)}>
                                  <Trash2 className="w-3 h-3 text-destructive" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                      <div className="flex items-center justify-between text-xs px-1">
                        <span className="text-muted-foreground">Total rateado: <strong>{fmt(totalRateio)}</strong></span>
                        {Math.abs(diffRateio) >= 0.01 && (
                          <span className="text-destructive font-medium">Diferença: {fmt(diffRateio)}</span>
                        )}
                        {Math.abs(diffRateio) < 0.01 && rateioLines.length > 0 && (
                          <span className="text-success font-medium">✅ Rateio fechado</span>
                        )}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Recorrência - non-transfers only */}
              {form.tipo !== 'TRANSFERENCIA' && (
                <div className="border-t border-border pt-3 mt-1">
                  <div className="flex items-center gap-2">
                    <input type="checkbox" checked={form.recorrente} onChange={e => setForm({ ...form, recorrente: e.target.checked })} id="chk_recorrente" />
                    <Label htmlFor="chk_recorrente" className="text-sm">Lançamento recorrente</Label>
                  </div>
                  {form.recorrente && (
                    <div className="grid grid-cols-2 gap-3 mt-3">
                      <div><Label>Frequência</Label>
                        <Select value={form.frequencia} onValueChange={v => setForm({ ...form, frequencia: v })}>
                          <SelectTrigger><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="mensal">Mensal</SelectItem>
                            <SelectItem value="semanal">Semanal</SelectItem>
                            <SelectItem value="quinzenal">Quinzenal</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div><Label>Parcelas (0 = ∞)</Label>
                        <Input type="text" inputMode="numeric" value={form.parcelas || ''} onChange={e => setForm({ ...form, parcelas: parseInt(e.target.value, 10) || 0 })} placeholder="0" />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {form.tipo === 'TRANSFERENCIA' && (
                <div className="bg-muted/50 rounded-lg p-3 text-sm">
                  <p className="text-muted-foreground text-xs">
                    ⚡ Transferências criam automaticamente dois lançamentos vinculados (saída da origem + entrada no destino) e não afetam relatórios de receitas/despesas.
                  </p>
                </div>
              )}

              {/* Justificativa for REALIZADO edits */}
              {editId && editPrevStatus === 'REALIZADO' && (
                <div className="border border-warning/30 bg-warning/5 rounded-lg p-3 space-y-2">
                  <Label className="text-sm font-semibold text-warning-foreground">⚠️ Justificativa obrigatória</Label>
                  <p className="text-xs text-muted-foreground">Este lançamento já está REALIZADO. Informe o motivo da alteração.</p>
                  <Textarea
                    value={justificativa}
                    onChange={e => setJustificativa(e.target.value)}
                    placeholder="Motivo da alteração..."
                    className="min-h-[60px]"
                  />
                </div>
              )}

              <Button onClick={save} className="w-full" disabled={saving || (form.tipo !== 'TRANSFERENCIA' && rateioLines.length > 0 && !rateioValido)}>
                {saving ? 'Salvando...' : editId ? 'Atualizar' : (form.tipo === 'TRANSFERENCIA' ? 'Registrar Transferência' : 'Criar Lançamento')}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      )}

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
      <ConfirmDialog />
    </>
  );
}

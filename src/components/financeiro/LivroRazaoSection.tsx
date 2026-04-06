import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { fmtBRL, formatDateBR, todayBR, parseLocalDate } from '@/lib/formatters';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  TrendingUp, TrendingDown, ArrowUpRight,
  RefreshCw, Link2, Repeat, ShieldAlert, Download, Edit, Trash2,
} from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import ContaDetailDialog, { type ContaDetailData, type ContaDetailRateio } from './ContaDetailDialog';
import ContaFormDialog, { type ContaFormData, type RateioLine } from './ContaFormDialog';
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

interface CategoriaRef { id: string; nome: string; tipo: string; centro_custo_padrao_id: string | null }
interface CentroCustoRef { id: string; nome: string }
interface ContaRef { id: string; nome: string }

// ─── Helpers ───
function NoAccess() {
  return (
    <div className="bg-card border border-border rounded-xl p-8 text-center">
      <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
      <p className="font-medium text-foreground">Acesso negado</p>
      <p className="text-sm text-muted-foreground">Voce nao tem permissao para visualizar lancamentos.</p>
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
  manual: { text: 'Manual', cls: 'bg-muted text-muted-foreground border-border', tooltip: 'Lancamento criado manualmente no Livro Razao' },
  conciliacao: { text: 'Conciliacao', cls: 'bg-primary/10 text-primary border-primary/20', tooltip: 'Lancamento criado a partir da conciliacao bancaria' },
  espelho_cp: { text: 'Espelho CP', cls: 'bg-warning/10 text-warning-foreground border-warning/20', tooltip: 'Lancamento gerado pela baixa de uma Conta a Pagar' },
  espelho_cr: { text: 'Espelho CR', cls: 'bg-success/10 text-success border-success/20', tooltip: 'Lancamento gerado pelo recebimento de uma Conta a Receber' },
  transferencia: { text: 'Transferencia', cls: 'bg-accent text-accent-foreground border-border', tooltip: 'Movimentacao entre contas financeiras' },
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

  const [form, setForm] = useState<ContaFormData>({
    tipo: 'DESPESA', valor: 0, data_competencia: todayBR(),
    data_vencimento: '', data_pagamento: '',
    descricao: '', conta_id: '', conta_destino_id: '',
    forma_pagamento: 'pix', status: 'PREVISTO',
    recorrente: false, frequencia: 'mensal', parcelas: 0,
    observacoes: '', categoria_id: '', centro_custo_id: '',
  });
  const [rateioLines, setRateioLines] = useState<RateioLine[]>([]);

  // Detail dialog state
  const [showDetail, setShowDetail] = useState(false);
  const [detailData, setDetailData] = useState<ContaDetailData | null>(null);
  const [detailRawItem, setDetailRawItem] = useState<Lancamento | null>(null);

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
  const contaNome = (id: string) => contas.find(c => c.id === id)?.nome || '-';

  /* ─── Detail view ─── */
  const openDetail = async (item: Lancamento) => {
    try {
      const { data: rates } = await supabase
        .from('fin_lancamento_rateios')
        .select('*, fin_categorias(nome), fin_centros_custo(nome)')
        .eq('lancamento_id', item.id);

      const rateios: ContaDetailRateio[] = (rates || []).map((r: any) => ({
        categoria_nome: r.fin_categorias?.nome || categorias.find(c => c.id === r.categoria_id)?.nome || '-',
        centro_custo_nome: r.fin_centros_custo?.nome || centros.find(c => c.id === r.centro_custo_id)?.nome || '',
        valor: r.valor,
        percentual: r.percentual,
      }));

      if (rateios.length === 0 && item.categoria_id) {
        rateios.push({
          categoria_nome: catNome(item.categoria_id),
          centro_custo_nome: item.centro_custo_id ? centros.find(c => c.id === item.centro_custo_id)?.nome || '' : '',
          valor: item.valor,
          percentual: 100,
        });
      }

      setDetailData({
        id: item.id,
        descricao: item.descricao || '',
        valor: item.valor,
        status: item.status,
        tipo: item.tipo,
        origem: item.origem,
        data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento,
        data_pagamento: item.data_pagamento,
        forma_pagamento: item.forma_pagamento,
        conta_nome: item.conta_id ? contaNome(item.conta_id) : null,
        categoria_nome: item.categoria_id ? catNome(item.categoria_id) : (rateios.length > 1 ? `${rateios.length} informadas` : null),
        centro_custo_nome: item.centro_custo_id ? centros.find(c => c.id === item.centro_custo_id)?.nome || null : null,
        observacoes: item.observacoes,
        conciliado: item.conciliado,
        recorrente: item.recorrente,
        rateios,
        updated_at: item.updated_at,
      });
      setDetailRawItem(item);
      setShowDetail(true);
    } catch (err: any) {
      toast.error('Erro ao carregar detalhes: ' + err.message);
    }
  };

  // ─── Form ───
  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setEditPrevStatus(null);
    setJustificativa('');
    setForm({ tipo: 'DESPESA', valor: 0, data_competencia: todayBR(), data_vencimento: '', data_pagamento: '', descricao: '', conta_id: '', conta_destino_id: '', forma_pagamento: 'pix', status: 'PREVISTO', recorrente: false, frequencia: 'mensal', parcelas: 0, observacoes: '', categoria_id: '', centro_custo_id: '' });
    setRateioLines([]);
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: resetForm });

  const openEdit = async (item: Lancamento) => {
    if (item.conciliado) {
      toast.error('Lancamentos conciliados devem ser desconciliados antes da edicao.');
      return;
    }
    if (item.origem === 'espelho_cp') {
      toast.error('Este lancamento foi gerado por uma Conta a Pagar. Edite diretamente em Contas a Pagar.');
      return;
    }
    if (item.origem === 'espelho_cr') {
      toast.error('Este lancamento foi gerado por uma Conta a Receber. Edite diretamente em Contas a Receber.');
      return;
    }

    setEditId(item.id);
    setEditUpdatedAt(item.updated_at);
    setEditPrevStatus(item.status);
    setJustificativa('');

    // Load rateios from database
    const { data: rates, error: rateErr } = await supabase
      .from('fin_lancamento_rateios')
      .select('*')
      .eq('lancamento_id', item.id);
    if (rateErr) {
      toast.error('Erro ao carregar rateios: ' + rateErr.message);
      return;
    }

    const loadedRateios: RateioLine[] = (rates || []).map((r: any) => ({
      key: r.id,
      categoria_id: r.categoria_id,
      centro_custo_id: r.centro_custo_id || '',
      valor: r.valor,
      percentual: r.percentual,
    }));
    setRateioLines(loadedRateios);

    if (item.tipo === 'TRANSFERENCIA') {
      setForm({
        tipo: 'TRANSFERENCIA', valor: item.valor, data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
        descricao: item.observacoes || item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: item.conta_destino_id || '',
        forma_pagamento: 'TRANSFERENCIA', status: item.status, recorrente: false, frequencia: 'mensal', parcelas: 0,
        observacoes: '', categoria_id: '', centro_custo_id: '',
      });
    } else {
      setForm({
        tipo: item.tipo, valor: item.valor, data_competencia: item.data_competencia,
        data_vencimento: item.data_vencimento || '', data_pagamento: item.data_pagamento || '',
        descricao: item.descricao || '', conta_id: item.conta_id || '', conta_destino_id: '',
        forma_pagamento: item.forma_pagamento || 'pix', status: item.status, recorrente: item.recorrente || false, frequencia: 'mensal', parcelas: 0,
        observacoes: item.observacoes || '',
        categoria_id: item.categoria_id || '',
        centro_custo_id: item.centro_custo_id || '',
      });
    }
    setShowDetail(false);
    setShowForm(true);
  };

  const deleteLancamento = async (item: Lancamento) => {
    const ok = await confirm({ title: 'Excluir lancamento', description: 'Tem certeza que deseja excluir este lancamento? Esta acao nao pode ser desfeita.', confirmLabel: 'Excluir', variant: 'destructive' });
    if (!ok) return;
    setSaving(true);
    try {
      if (item.tipo === 'TRANSFERENCIA') {
        const { error } = await supabase.rpc('delete_transfer', { p_lancamento_id: item.id });
        if (error) throw error;
        toast.success('Transferencia excluida (ambos os lados)');
      } else {
        const { error } = await supabase.from('fin_lancamentos').delete().eq('id', item.id);
        if (error) throw error;
        toast.success('Lancamento excluido');
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
    if (!form.descricao.trim()) { toast.error('Descricao obrigatoria'); return; }

    // === TRANSFER FLOW ===
    if (form.tipo === 'TRANSFERENCIA') {
      if (!form.conta_id || !form.conta_destino_id) { toast.error('Selecione conta origem e destino'); return; }
      if (form.conta_id === form.conta_destino_id) { toast.error('Contas devem ser diferentes'); return; }
      if (!form.valor || form.valor <= 0) { toast.error('Valor obrigatorio'); return; }

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
          toast.success('Transferencia atualizada (ambos os lados)');
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
          toast.success('Transferencia registrada com sucesso!');
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
    const totalRateio = rateioLines.reduce((s, l) => s + Number(l.valor || 0), 0);
    const diffRateio = (form.valor || 0) - totalRateio;
    const rateioValido = rateioLines.length === 0 || Math.abs(diffRateio) < 0.01;
    const valorFinal = rateioLines.length > 0 ? totalRateio : form.valor;
    if (!valorFinal || valorFinal <= 0) { toast.error('Valor obrigatorio'); return; }
    if (rateioLines.length > 0 && !rateioValido) { toast.error(`Rateio incompleto. Ajuste os valores para totalizar ${fmt(form.valor)}.`); return; }
    if (rateioLines.length > 0 && rateioLines.some(l => !l.categoria_id)) { toast.error('Todas as linhas de rateio precisam de categoria'); return; }

    if (editId && editPrevStatus === 'REALIZADO' && !justificativa.trim()) {
      toast.error('Justificativa obrigatoria para edicao de lancamento REALIZADO.');
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
          `- ${d.descricao} — ${fmt(d.valor)} (venc: ${d.data_vencimento})`
        ).join('\n');
        const proceed = await confirm({
          title: 'Possivel duplicidade detectada',
          description: `Encontramos ${form.tipo === 'DESPESA' ? 'Conta(s) a Pagar' : 'Conta(s) a Receber'} com valor semelhante:\n\n${dupDescriptions}\n\nDeseja criar o lancamento mesmo assim?`,
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
            observacao: null,
          }))
        : [];

      const rpcParams: Record<string, unknown> = {
        p_id: editId || null,
        p_tipo: form.tipo,
        p_status: form.status,
        p_valor: valorFinal,
        p_conta_id: form.conta_id || null,
        p_categoria_id: rateioLines.length === 1 ? rateioLines[0].categoria_id : (form.categoria_id || null),
        p_centro_custo_id: rateioLines.length === 1 ? (rateioLines[0].centro_custo_id || null) : (form.centro_custo_id || null),
        p_data_competencia: form.data_competencia,
        p_data_vencimento: form.data_vencimento || null,
        p_data_pagamento: form.data_pagamento || (form.status === 'REALIZADO' ? form.data_competencia : null),
        p_descricao: form.descricao,
        p_observacoes: form.observacoes || null,
        p_forma_pagamento: form.forma_pagamento,
        p_origem: 'manual',
        p_recorrente: form.recorrente,
        p_recorrencia_config: form.recorrente ? JSON.stringify({ frequencia: form.frequencia, parcelas: form.parcelas || null, parcelas_geradas: 0 }) : null,
        p_rateios: rateiosPayload,
        p_updated_at: editUpdatedAt || null,
        p_justificativa_edicao: justificativa.trim() || null,
      };

      const { data, error } = await supabase.rpc('_guarded_upsert_lancamento' as any, rpcParams as any);
      if (error) {
        if (error.message?.includes('CONFLICT')) {
          toast.error('Este registro foi alterado por outro usuario. Recarregue a pagina.');
        } else {
          toast.error(error.message);
        }
        return;
      }

      toast.success(editId ? 'Lancamento atualizado' : (form.recorrente ? 'Lancamento recorrente criado!' : 'Lancamento criado'));
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
      data_competencia: formatDateBR(parseLocalDate(item.data_competencia)),
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
    XLSX.utils.book_append_sheet(wb, ws, 'Lancamentos');
    XLSX.writeFile(wb, 'lancamentos.xlsx');
    toast.success('Exportacao concluida');
  };

  // ─── Render ───
  return (
    <>
      <div className="space-y-4">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h2 className="text-xl font-bold text-foreground">Livro Razao</h2>
            <p className="text-sm text-muted-foreground">Ledger central — registra todas as movimentacoes financeiras realizadas</p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Input type="date" value={filtroDataDe} onChange={e => setFiltroDataDe(e.target.value)} className="w-36 h-9 text-xs" />
            <span className="text-muted-foreground text-xs">ate</span>
            <Input type="date" value={filtroDataAte} onChange={e => setFiltroDataAte(e.target.value)} className="w-36 h-9 text-xs" />
            <Select value={filtroTipo} onValueChange={setFiltroTipo}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos</SelectItem>
                <SelectItem value="RECEITA">Receitas</SelectItem>
                <SelectItem value="DESPESA">Despesas</SelectItem>
                <SelectItem value="TRANSFERENCIA">Transferencias</SelectItem>
              </SelectContent>
            </Select>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas origens</SelectItem>
                <SelectItem value="manual">Manual</SelectItem>
                <SelectItem value="conciliacao">Conciliacao</SelectItem>
                <SelectItem value="espelho_cp">Espelho CP</SelectItem>
                <SelectItem value="espelho_cr">Espelho CR</SelectItem>
                <SelectItem value="transferencia">Transferencia</SelectItem>
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
                  <ArrowUpRight className="w-4 h-4 mr-1" /> Nova Transferencia
                </Button>
              </>
            )}
          </div>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Data</TableHead>
              <TableHead>Descricao</TableHead>
              <TableHead>Tipo</TableHead>
              <TableHead>Origem</TableHead>
              <TableHead>Valor</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-20">Acoes</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading && items.length === 0 ? (
              <SkeletonTableRows />
            ) : items.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center text-muted-foreground py-8">Nenhum lancamento encontrado</TableCell></TableRow>
            ) : items.map(item => {
              const orig = ORIGEM_LABEL[item.origem || (item.tipo === 'TRANSFERENCIA' ? 'transferencia' : 'manual')] || ORIGEM_LABEL.manual;
              return (
                <TableRow
                  key={item.id}
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => openDetail(item)}
                >
                  <TableCell className="font-mono text-sm">{formatDateBR(parseLocalDate(item.data_competencia))}</TableCell>
                  <TableCell className="font-medium max-w-[250px]">
                    {item.recorrente && <Repeat className="w-3 h-3 inline mr-1 text-muted-foreground" />}
                    <span className="truncate block">{item.descricao}</span>
                    {item.tipo === 'TRANSFERENCIA' && item.conta_id && item.conta_destino_id && (
                      <span className="text-[10px] text-muted-foreground flex items-center gap-1 mt-0.5">
                        <ArrowUpRight className="w-3 h-3" />
                        {contaNome(item.conta_id)} → {contaNome(item.conta_destino_id)}
                      </span>
                    )}
                    {item.conciliado && <span className="text-[10px] text-success ml-1">Conciliado</span>}
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
                    <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                      {canEdit && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => openEdit(item)} disabled={saving} title="Editar">
                          <Edit className="w-3.5 h-3.5" />
                        </Button>
                      )}
                      {canDelete && (
                        <Button size="icon" variant="ghost" className="h-7 w-7" onClick={() => deleteLancamento(item)} disabled={saving} title="Excluir">
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

      {/* Detail Dialog */}
      <ContaDetailDialog
        open={showDetail}
        onOpenChange={setShowDetail}
        data={detailData}
        variant="lancamento"
        canEdit={canEdit}
        saving={saving}
        onEdit={() => detailRawItem && openEdit(detailRawItem)}
      />

      {/* Form Dialog */}
      <ContaFormDialog
        open={showForm}
        onOpenChange={o => { if (!o) guardedClose(); }}
        variant="lancamento"
        form={form}
        onFormChange={setForm}
        rateioLines={rateioLines}
        onRateioLinesChange={setRateioLines}
        categorias={categorias}
        centros={centros}
        contas={contas}
        isEditing={!!editId}
        saving={saving}
        onSave={save}
        onClose={guardedClose}
        editPrevStatus={editPrevStatus}
        justificativa={justificativa}
        onJustificativaChange={setJustificativa}
      />

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
      <ConfirmDialog />
    </>
  );
}

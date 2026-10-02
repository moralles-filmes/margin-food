import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { fmtBRL, formatInBR, formatPercentBR } from '@/lib/formatters';
import { BRLInput } from '@/components/ui/brl-input';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/ui/StatusBadge';
import { useScopedToast } from '@/hooks/useScopedToast';
import { subMonths } from 'date-fns';
import {
  Target, ChevronRight, ChevronDown, Trash2, FileDown, FileSpreadsheet,
  Copy, Loader2, ShieldAlert, Lock, Save,
} from 'lucide-react';
import { useDataEvent, useEmitDataEvent } from '@/lib/dataEvents';
import { useCan } from '@/permissions/hooks';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import jsPDF from 'jspdf';
import autoTable from 'jspdf-autotable';
import * as XLSX from '@/lib/safeXlsx';
import { mapFinanceiroDeleteError } from '@/lib/financeiroErrorMap';
import { cn } from '@/lib/utils';

// ─── Types ───

interface CatNode {
  id: string;
  nome: string;
  codigo: string;
  tipo: 'receita' | 'despesa';
  parent_id: string | null;
  ordem: number;
  children: CatNode[];
}

interface OrcamentoRow {
  id: string;
  categoria_id: string;
  valor_orcado: number;
  updated_at: string;
}

type StatusExecucao = 'ok' | 'alerta' | 'estourado';

interface FlatRow {
  key: string;
  categoriaId: string | null;
  codigo: string;
  nome: string;
  tipo: 'receita' | 'despesa';
  depth: number;
  hasChildren: boolean;
  isLeaf: boolean;
  isSectionHeader?: boolean;
  isTotalRow?: boolean;
  isUnassigned?: boolean;
  orcado: number;
  realizado: number;
  ownBudget: OrcamentoRow | null;
  locked: boolean;
}

// ─── Helpers ───

function formatMonthBR(value: string): string {
  // Parse "yyyy-MM" como data LOCAL (não UTC) — evita recuo de um mês no rótulo em BRT.
  const [y, m] = value.split('-').map(Number);
  const d = new Date(y, m - 1, 1);
  const label = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' }).format(d);
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildOrcamentoTree(items: Omit<CatNode, 'children'>[]): CatNode[] {
  const map = new Map<string, CatNode>();
  const roots: CatNode[] = [];
  for (const item of items) map.set(item.id, { ...item, children: [] });
  for (const node of map.values()) {
    if (node.parent_id && map.has(node.parent_id)) {
      map.get(node.parent_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortNodes = (nodes: CatNode[]) => {
    nodes.sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));
    nodes.forEach(n => sortNodes(n.children));
  };
  sortNodes(roots);
  return roots;
}

function computeStatus(tipo: 'receita' | 'despesa', orcado: number, realizado: number): StatusExecucao | null {
  if (!orcado) return null;
  if (tipo === 'despesa') {
    if (realizado > orcado) return 'estourado';
    if (realizado > orcado * 0.8) return 'alerta';
    return 'ok';
  }
  if (realizado < orcado * 0.8) return 'estourado';
  if (realizado < orcado) return 'alerta';
  return 'ok';
}

const STATUS_LABEL: Record<'receita' | 'despesa', Record<StatusExecucao, string>> = {
  despesa: { ok: 'Em linha', alerta: 'Atenção', estourado: 'Estourado' },
  receita: { ok: 'Em linha', alerta: 'Atenção', estourado: 'Abaixo da meta' },
};
const STATUS_VARIANT: Record<StatusExecucao, string> = { ok: 'ok', alerta: 'atencao', estourado: 'critico' };

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
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const [categorias, setCategorias] = useState<Omit<CatNode, 'children'>[]>([]);
  const [orcamentos, setOrcamentos] = useState<OrcamentoRow[]>([]);
  const [realizadoMap, setRealizadoMap] = useState<Record<string, number>>({});
  const [semCategoria, setSemCategoria] = useState<{ receita: number; despesa: number }>({ receita: 0, despesa: 0 });
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [mesAtual, setMesAtual] = useState(formatInBR(new Date(), 'yyyy-MM'));
  const [expanded, setExpanded] = useState<Set<string>>(new Set(['_receitas', '_despesas']));
  const [edits, setEdits] = useState<Record<string, number>>({});

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

  const orcamentosByCategoria = useMemo(() => {
    const map: Record<string, OrcamentoRow> = {};
    orcamentos.forEach(o => { map[o.categoria_id] = o; });
    return map;
  }, [orcamentos]);

  // ── Load data via RPC ──
  const load = useCallback(async () => {
    setLoading(true);
    setEdits({});
    try {
      const { data, error } = await supabase.rpc('get_fin_orcamento_arvore', { p_mes: mesAtual });
      if (error) throw error;
      const result = data as {
        categorias?: Omit<CatNode, 'children'>[];
        orcamentos?: OrcamentoRow[];
        valores_realizado?: Record<string, number>;
        valores_sem_categoria?: { receita?: number; despesa?: number };
      } | null;
      setCategorias(result?.categorias || []);
      setOrcamentos((result?.orcamentos || []).map(o => ({ ...o, valor_orcado: Number(o.valor_orcado) })));
      setRealizadoMap(result?.valores_realizado || {});
      setSemCategoria({
        receita: Number(result?.valores_sem_categoria?.receita) || 0,
        despesa: Number(result?.valores_sem_categoria?.despesa) || 0,
      });
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar orçamento');
    }
    setLoading(false);
  }, [mesAtual, supabase, toast]);

  useEffect(() => { load(); }, [load]);

  useDataEvent('financeiro:lancamentos', load);
  useDataEvent('financeiro:cadastros', load);
  useDataEvent('financeiro:orcamento', load);

  // Auto-expand top-level categories
  useEffect(() => {
    if (categorias.length > 0) {
      setExpanded(prev => {
        const next = new Set(prev);
        next.add('_receitas');
        next.add('_despesas');
        categorias.filter(c => !c.parent_id).forEach(c => next.add(c.id));
        return next;
      });
    }
  }, [categorias]);

  const tree = useMemo(() => buildOrcamentoTree(categorias), [categorias]);

  // ── Rollups (aware of unsaved edits) ──
  const calcOrcado = useCallback((node: CatNode): number => {
    if (node.children.length === 0) {
      if (node.id in edits) return edits[node.id];
      return orcamentosByCategoria[node.id]?.valor_orcado ?? 0;
    }
    const ownBudget = orcamentosByCategoria[node.id];
    if (ownBudget) return ownBudget.valor_orcado;
    return node.children.reduce((sum, child) => sum + calcOrcado(child), 0);
  }, [edits, orcamentosByCategoria]);

  const calcRealizado = useCallback((node: CatNode): number => {
    let total = realizadoMap[node.id] || 0;
    for (const child of node.children) total += calcRealizado(child);
    return total;
  }, [realizadoMap]);

  // ── Flatten tree into rows (DFC/DRE-style: seções Receitas/Despesas) ──
  const rows = useMemo<FlatRow[]>(() => {
    const result: FlatRow[] = [];

    const flatten = (nodes: CatNode[], depth: number, ancestorLocked: boolean) => {
      for (const node of nodes) {
        const hasChildren = node.children.length > 0;
        const ownBudget = orcamentosByCategoria[node.id] || null;
        const locked = ancestorLocked;
        result.push({
          key: node.id,
          categoriaId: node.id,
          codigo: node.codigo,
          nome: node.nome,
          tipo: node.tipo,
          depth,
          hasChildren,
          isLeaf: !hasChildren,
          orcado: calcOrcado(node),
          realizado: calcRealizado(node),
          ownBudget: hasChildren ? ownBudget : null,
          locked,
        });
        if (expanded.has(node.id) && hasChildren) {
          // Legado no pai bloqueia edição de TODAS as folhas descendentes.
          flatten(node.children, depth + 1, ancestorLocked || !!ownBudget);
        }
      }
    };

    // Realizado sem categoria (ou em categoria inativa) não tem linha na árvore, mas entra
    // no total da seção — senão o total diverge do Dashboard e da Apresentação Sócios.
    const pushSemCategoria = (tipo: 'receita' | 'despesa') => {
      const realizado = semCategoria[tipo];
      if (!realizado) return;
      result.push({
        key: `_sem_categoria_${tipo}`, categoriaId: null, codigo: '', nome: 'Sem categoria', tipo,
        depth: 1, hasChildren: false, isLeaf: false, isUnassigned: true,
        orcado: 0, realizado, ownBudget: null, locked: false,
      });
    };

    const receitaNodes = tree.filter(n => n.tipo === 'receita');
    const despesaNodes = tree.filter(n => n.tipo === 'despesa');
    const totalReceitas = receitaNodes.reduce((s, n) => s + calcOrcado(n), 0);
    const totalReceitasReal = receitaNodes.reduce((s, n) => s + calcRealizado(n), 0) + semCategoria.receita;
    const totalDespesas = despesaNodes.reduce((s, n) => s + calcOrcado(n), 0);
    const totalDespesasReal = despesaNodes.reduce((s, n) => s + calcRealizado(n), 0) + semCategoria.despesa;

    result.push({
      key: '_receitas', categoriaId: null, codigo: '', nome: 'TOTAL DE RECEITAS', tipo: 'receita',
      depth: 0, hasChildren: receitaNodes.length > 0 || semCategoria.receita !== 0, isLeaf: false, isSectionHeader: true,
      orcado: totalReceitas, realizado: totalReceitasReal, ownBudget: null, locked: false,
    });
    if (expanded.has('_receitas')) {
      flatten(receitaNodes, 1, false);
      pushSemCategoria('receita');
    }

    result.push({
      key: '_despesas', categoriaId: null, codigo: '', nome: 'TOTAL DE DESPESAS', tipo: 'despesa',
      depth: 0, hasChildren: despesaNodes.length > 0 || semCategoria.despesa !== 0, isLeaf: false, isSectionHeader: true,
      orcado: totalDespesas, realizado: totalDespesasReal, ownBudget: null, locked: false,
    });
    if (expanded.has('_despesas')) {
      flatten(despesaNodes, 1, false);
      pushSemCategoria('despesa');
    }

    result.push({
      key: '_resultado', categoriaId: null, codigo: '', nome: 'RESULTADO PROJETADO', tipo: 'receita',
      depth: 0, hasChildren: false, isLeaf: false, isTotalRow: true,
      orcado: totalReceitas - totalDespesas, realizado: totalReceitasReal - totalDespesasReal,
      ownBudget: null, locked: false,
    });

    return result;
  }, [tree, expanded, calcOrcado, calcRealizado, orcamentosByCategoria, semCategoria]);

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── Pending edits ──
  const dirtyItems = useMemo(() => {
    return Object.entries(edits)
      .filter(([categoriaId, valor]) => valor !== (orcamentosByCategoria[categoriaId]?.valor_orcado ?? 0))
      .map(([categoriaId, valor]) => ({
        categoria_id: categoriaId,
        valor_orcado: valor > 0 ? valor : null,
        orcamento_id: orcamentosByCategoria[categoriaId]?.id ?? null,
        expected_updated_at: orcamentosByCategoria[categoriaId]?.updated_at ?? null,
      }));
  }, [edits, orcamentosByCategoria]);

  const handleEditLeaf = (categoriaId: string, value: number) => {
    setEdits(prev => ({ ...prev, [categoriaId]: value }));
  };

  // ── Save all pending leaf edits in one transaction ──
  const handleSaveAll = async () => {
    if (saving || dirtyItems.length === 0) return;
    setSaving(true);
    try {
      const { error } = await supabase.rpc('_guarded_bulk_upsert_orcamento', {
        p_mes_ano: mesAtual,
        p_items: dirtyItems,
      });
      if (error) throw error;
      toast.success(`${dirtyItems.length} meta(s) salva(s)`);
      setEdits({});
      emitDataEvent('financeiro:orcamento');
    } catch (err: unknown) {
      console.error(err);
      const errorShape = typeof err === 'object' && err !== null ? err as { message?: unknown } : {};
      const message = typeof errorShape.message === 'string' ? errorShape.message : '';
      if (message.includes('OPTIMISTIC_LOCK')) {
        toast.error('Algum item foi alterado por outra pessoa. Recarregue e tente novamente.');
      } else if (message.includes('ORCAMENTO_HIERARQUIA_CONFLITANTE')) {
        toast.error('Defina o orçamento no pai ou nos filhos, nunca nos dois no mesmo mês.');
      } else if (message.includes('PERMISSION_DENIED')) {
        toast.error('Você não tem permissão para esta alteração.');
      } else {
        toast.error('Erro ao salvar orçamento. Nada foi alterado.');
      }
    }
    setSaving(false);
  };

  // ── Delete legacy budget saved directly on a parent category ──
  const handleDeleteOwnBudget = async (row: FlatRow) => {
    if (!row.ownBudget) return;
    const ok = await confirm({
      title: 'Excluir Orçamento',
      description: `Deseja excluir o orçamento de "${row.nome}"? As sub-categorias poderão ser orçadas individualmente depois.`,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) return;
    try {
      const { error } = await supabase.rpc('_guarded_delete_orcamento', {
        p_id: row.ownBudget.id,
        p_expected_updated_at: row.ownBudget.updated_at,
      });
      if (error) throw error;
      toast.success('Orçamento excluído');
      emitDataEvent('financeiro:orcamento');
    } catch (err: unknown) {
      console.error('[OrcamentoSection.handleDeleteOwnBudget]', err);
      toast.error(mapFinanceiroDeleteError(err));
    }
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

  // ── Totals for header ──
  const totalReceitaRow = rows.find(r => r.key === '_receitas');
  const totalDespesaRow = rows.find(r => r.key === '_despesas');
  const fmt = fmtBRL;

  // ── PDF Export ──
  const gerarPDF = () => {
    const exportRows = rows.filter(r => !r.isSectionHeader && !r.isTotalRow && (r.categoriaId || r.isUnassigned));
    if (exportRows.length === 0) return;
    const doc = new jsPDF();
    const w = doc.internal.pageSize.getWidth();
    doc.setFontSize(16);
    doc.text('Orçamento vs Realizado', w / 2, 18, { align: 'center' });
    doc.setFontSize(10);
    doc.text(`Período: ${formatMonthBR(mesAtual)}  |  Regime de caixa (Livro Razão)`, w / 2, 26, { align: 'center' });
    doc.text(
      `Receita: ${fmt(totalReceitaRow?.realizado ?? 0)} / ${fmt(totalReceitaRow?.orcado ?? 0)}  |  Despesa: ${fmt(totalDespesaRow?.realizado ?? 0)} / ${fmt(totalDespesaRow?.orcado ?? 0)} (realizado / orçado)`,
      w / 2, 31, { align: 'center' },
    );

    autoTable(doc, {
      startY: 38,
      head: [['Tipo', 'Categoria', 'Orçado', 'Realizado', '% Exec.', 'Status']],
      body: exportRows.map(r => {
        const status = computeStatus(r.tipo, r.orcado, r.realizado);
        return [
          r.tipo === 'receita' ? 'Receita' : 'Despesa',
          `${'  '.repeat(r.depth)}${r.nome}`,
          fmt(r.orcado),
          fmt(r.realizado),
          r.orcado > 0 ? `${formatPercentBR((r.realizado / r.orcado) * 100, 1)}` : '—',
          status ? STATUS_LABEL[r.tipo][status] : '—',
        ];
      }),
      theme: 'striped',
      headStyles: { fillColor: [30, 41, 59] },
    });

    doc.save(`orcamento-${mesAtual}.pdf`);
    toast.success('PDF gerado');
  };

  // ── Excel Export ──
  const gerarExcel = () => {
    const exportRows = rows.filter(r => !r.isSectionHeader && !r.isTotalRow && (r.categoriaId || r.isUnassigned));
    if (exportRows.length === 0) return;
    const wb = XLSX.utils.book_new();
    const dataRows = [
      ['Tipo', 'Categoria', 'Orçado', 'Realizado', '% Execução', 'Status'],
      ...exportRows.map(r => {
        const status = computeStatus(r.tipo, r.orcado, r.realizado);
        return [
          r.tipo === 'receita' ? 'Receita' : 'Despesa',
          `${'  '.repeat(r.depth)}${r.nome}`,
          r.orcado,
          r.realizado,
          r.orcado > 0 ? `${formatPercentBR((r.realizado / r.orcado) * 100, 1)}` : '',
          status ? STATUS_LABEL[r.tipo][status] : '',
        ];
      }),
      [],
      ['Total Receitas', '', totalReceitaRow?.orcado ?? 0, totalReceitaRow?.realizado ?? 0, '', ''],
      ['Total Despesas', '', totalDespesaRow?.orcado ?? 0, totalDespesaRow?.realizado ?? 0, '', ''],
    ];
    const ws = XLSX.utils.aoa_to_sheet(dataRows);
    ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 15 }, { wch: 15 }, { wch: 12 }, { wch: 16 }];
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
            Caixa (Livro Razão) • Receita {fmt(totalReceitaRow?.realizado ?? 0)} / {fmt(totalReceitaRow?.orcado ?? 0)} • Despesa {fmt(totalDespesaRow?.realizado ?? 0)} / {fmt(totalDespesaRow?.orcado ?? 0)} (realizado / orçado)
          </p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Select value={mesAtual} onValueChange={setMesAtual}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map(m => <SelectItem key={m} value={m}>{formatMonthBR(m)}</SelectItem>)}</SelectContent>
          </Select>

          {canEdit && (
            <>
              <Button size="sm" onClick={handleSaveAll} disabled={saving || dirtyItems.length === 0}>
                {saving ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <Save className="w-4 h-4 mr-1" />}
                {saving ? 'Salvando...' : dirtyItems.length > 0 ? `Salvar (${dirtyItems.length})` : 'Salvar'}
              </Button>
              <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)}>
                <Copy className="w-4 h-4 mr-1" /> Copiar Mês
              </Button>
            </>
          )}

          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={gerarPDF} disabled={loading}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={gerarExcel} disabled={loading}>
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
      ) : categorias.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Target className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma categoria operacional cadastrada.</p>
          <p className="text-sm">Configure a estrutura em Cadastros Base primeiro.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Categoria</TableHead>
                  <TableHead className="text-right w-[180px]">Orçado (R$)</TableHead>
                  <TableHead className="text-right w-[160px]">Realizado (R$)</TableHead>
                  <TableHead className="text-right w-[100px]">% Exec.</TableHead>
                  <TableHead className="w-[130px]">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map(row => {
                  const status = computeStatus(row.tipo, row.orcado, row.realizado);
                  const pct = row.orcado > 0 ? formatPercentBR((row.realizado / row.orcado) * 100, 1) : '—';
                  const canEditThisLeaf = canEdit && row.isLeaf && !row.locked && !row.isSectionHeader && !row.isTotalRow;
                  const currentEditValue = row.categoriaId && row.categoriaId in edits
                    ? edits[row.categoriaId]
                    : row.orcado;

                  return (
                    <TableRow
                      key={row.key}
                      className={cn(
                        row.isTotalRow && 'bg-primary/5 font-bold border-t-2 border-primary/20',
                        row.isSectionHeader && 'bg-muted/50 border-t border-border',
                      )}
                    >
                      <TableCell
                        className={cn(
                          'flex items-center gap-1',
                          row.isSectionHeader && 'font-bold text-sm uppercase tracking-wider',
                          row.isTotalRow && 'font-bold text-base',
                          row.depth === 1 && !row.isSectionHeader && 'font-semibold text-xs uppercase tracking-wider',
                          row.depth > 1 && 'font-medium',
                        )}
                        style={{ paddingLeft: `${row.depth * 20 + 12}px` }}
                      >
                        {row.hasChildren ? (
                          <button
                            onClick={() => toggleExpand(row.key)}
                            className="w-5 h-5 flex items-center justify-center rounded hover:bg-muted shrink-0"
                          >
                            {expanded.has(row.key) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        ) : (
                          <span className="w-5 shrink-0" />
                        )}
                        {row.codigo && <span className="font-mono text-xs text-muted-foreground mr-1">{row.codigo}</span>}
                        <span className="truncate">{row.nome}</span>
                        {row.locked && (
                          <Lock className="w-3 h-3 text-muted-foreground shrink-0" aria-label="Orçamento definido em categoria superior" />
                        )}
                      </TableCell>

                      <TableCell className="text-right">
                        {canEditThisLeaf ? (
                          <BRLInput
                            numericValue={currentEditValue}
                            onNumericChange={v => row.categoriaId && handleEditLeaf(row.categoriaId, v)}
                            showPrefix
                            className="h-8 text-right ml-auto max-w-[160px]"
                          />
                        ) : row.ownBudget ? (
                          <div className="flex items-center justify-end gap-1">
                            <span className="font-mono font-semibold">{fmt(row.ownBudget.valor_orcado)}</span>
                            {canDelete && (
                              <Button
                                variant="ghost" size="icon" className="h-6 w-6 text-destructive"
                                title="Excluir orçamento deste nível"
                                onClick={() => handleDeleteOwnBudget(row)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            )}
                          </div>
                        ) : (
                          <span className={cn(
                            'font-mono',
                            (row.isTotalRow || row.isSectionHeader) && 'font-bold text-base',
                            row.depth === 1 && !row.isSectionHeader && 'font-semibold',
                            row.locked && 'text-muted-foreground',
                          )}>
                            {row.locked || row.isUnassigned ? '—' : fmt(row.orcado)}
                          </span>
                        )}
                      </TableCell>

                      <TableCell className={cn(
                        'text-right font-mono',
                        (row.isTotalRow || row.isSectionHeader) && 'font-bold text-base',
                        row.depth === 1 && !row.isSectionHeader && 'font-semibold',
                      )}>
                        {fmt(row.realizado)}
                      </TableCell>

                      <TableCell className="text-right text-muted-foreground text-sm">{pct}</TableCell>

                      <TableCell>
                        {status && <StatusBadge status={STATUS_VARIANT[status]} label={STATUS_LABEL[row.tipo][status]} />}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

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
    </div>
  );
}

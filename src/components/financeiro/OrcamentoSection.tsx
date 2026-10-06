import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useMemo, useRef, useId } from 'react';
import { fmtBRL, formatInBR, formatPercentBR } from '@/lib/formatters';
import { BRLInput } from '@/components/ui/brl-input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import StatusBadge from '@/components/ui/StatusBadge';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { useScopedToast } from '@/hooks/useScopedToast';
import { subMonths } from 'date-fns';
import {
  Target, ChevronRight, ChevronDown, Trash2, FileDown, FileSpreadsheet,
  Copy, Loader2, Lock, Save, TrendingUp, TrendingDown, Scale,
} from 'lucide-react';
import { FinKpiGrid, FinNote, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ListaCarregando, ResumoCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';
import { useRetornoFoco } from './useRetornoFoco';
import { devolverFoco, elementoComFoco } from './devolverFoco';
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

/**
 * Abaixo desta largura do contêiner a tabela vira lista (Redesign V2, Fase 06A). Uma só marcação no
 * DOM (D45): cada folha tem um campo de orçado e a árvore abre e fecha — duas cópias duplicariam os
 * campos e o estado de foco.
 */
const LIMITE_LISTA_PX = 860;

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
  // Estado só de apresentação: mês dos valores exibidos (última carga bem-sucedida) e falha de leitura.
  const [mesCarregado, setMesCarregado] = useState<string | null>(null);
  const [erro, setErro] = useState(false);
  const requisicao = useRef(0);
  const mesId = useId();
  const copiarDeId = useId();
  const retornoCopiar = useRetornoFoco();
  const [listaRef, listaEstreita] = useConteinerEstreito(LIMITE_LISTA_PX);

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
    const atual = ++requisicao.current;
    setLoading(true);
    setEdits({});
    try {
      const { data, error } = await supabase.rpc('get_fin_orcamento_arvore', { p_mes: mesAtual });
      // Só a resposta mais recente entra na tela (troca rápida de mês).
      if (atual !== requisicao.current) return;
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
      setMesCarregado(mesAtual);
      setErro(false);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar orçamento');
      setErro(true);
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
    // A confirmação abre sem gatilho: o foco volta à lixeira se nada for excluído (D68).
    const origem = elementoComFoco();
    const ok = await confirm({
      title: 'Excluir Orçamento',
      description: `Deseja excluir o orçamento de "${row.nome}"? As sub-categorias poderão ser orçadas individualmente depois.`,
      confirmLabel: 'Excluir',
      variant: 'destructive',
    });
    if (!ok) { devolverFoco(origem); return; }
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
      devolverFoco(origem);
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
  if (!canView) return <AccessDenied description="Você não tem permissão para acessar o Orçamento." />;

  // ── Apresentação (Redesign V2, Fase 06A): mesmas linhas, somas e regras acima ──
  const totalResultadoRow = rows.find(r => r.key === '_resultado');
  // Esqueleto na primeira carga e na troca de mês: as linhas de outro mês não podem ficar visíveis
  // (nem editáveis — o Salvar gravaria no mês novo). Recarga do mesmo mês mantém a tabela montada.
  const primeiraCarga = loading && mesCarregado !== mesAtual;
  const temBloqueadas = rows.some(r => r.locked);
  const execucao = (row?: FlatRow) => (row && row.orcado > 0 ? `${formatPercentBR((row.realizado / row.orcado) * 100, 1)} executado` : null);
  // Sem nenhuma meta na seção, o card diz que não há orçamento em vez de "Orçado: R$0,00".
  const orcadoDoCard = (row?: FlatRow) => (row && row.orcado !== 0
    ? `Orçado: ${fmt(row.orcado)}${execucao(row) ? ` · ${execucao(row)}` : ''}`
    : 'Sem orçamento no mês');
  const valoresResumo = [
    fmt(totalReceitaRow?.realizado ?? 0),
    fmt(totalDespesaRow?.realizado ?? 0),
    fmt(totalResultadoRow?.realizado ?? 0),
  ];
  const resumoGrid = kpiGridClassFor(longestValueLength(valoresResumo), 3);

  const linhaFundo = (row: FlatRow) => cn(
    row.isTotalRow && 'bg-primary-soft border-t-2 border-primary-border',
    row.isSectionHeader && 'bg-muted border-t-2 border-border',
  );
  const nomePeso = (row: FlatRow) => cn(
    row.isSectionHeader && 'font-bold text-sm uppercase tracking-wider',
    row.isTotalRow && 'font-bold text-base',
    row.depth === 1 && !row.isSectionHeader && 'font-semibold text-xs uppercase tracking-wider',
    row.depth > 1 && 'font-medium text-sm',
  );
  const valorPeso = (row: FlatRow) => cn(
    (row.isTotalRow || row.isSectionHeader) && 'font-bold text-base',
    row.depth === 1 && !row.isSectionHeader && 'font-semibold',
  );

  const abrirFechar = (row: FlatRow) => {
    if (!row.hasChildren) return <span aria-hidden="true" className="w-7 shrink-0" />;
    const aberto = expanded.has(row.key);
    return (
      <button
        type="button"
        onClick={() => toggleExpand(row.key)}
        aria-expanded={aberto}
        aria-label={`${aberto ? 'Recolher' : 'Expandir'} ${row.nome}`}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        {aberto ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
      </button>
    );
  };

  const nomeDaLinha = (row: FlatRow) => (
    <span className={cn('min-w-0 break-words', nomePeso(row))}>
      {row.codigo && <span className="mr-1.5 font-mono text-xs font-normal normal-case tracking-normal text-muted-foreground">{row.codigo}</span>}
      {row.nome}
      {row.locked && (
        <>
          <Lock aria-hidden="true" className="ml-1.5 inline h-3 w-3 align-[-1px] text-muted-foreground" />
          <span className="sr-only"> (orçamento definido em categoria superior)</span>
        </>
      )}
    </span>
  );

  // Mesmas condições de antes: só folha não bloqueada recebe campo; orçamento legado de pai tem lixeira.
  const orcadoDaLinha = (row: FlatRow, compacto: boolean) => {
    const canEditThisLeaf = canEdit && row.isLeaf && !row.locked && !row.isSectionHeader && !row.isTotalRow;
    const currentEditValue = row.categoriaId && row.categoriaId in edits
      ? edits[row.categoriaId]
      : row.orcado;
    if (canEditThisLeaf) {
      return (
        <BRLInput
          numericValue={currentEditValue}
          onNumericChange={v => row.categoriaId && handleEditLeaf(row.categoriaId, v)}
          showPrefix
          aria-label={`Orçado de ${row.nome}`}
          className={cn('h-8 text-right', compacto ? 'w-full max-w-[180px]' : 'ml-auto max-w-[160px]')}
        />
      );
    }
    if (row.ownBudget) {
      return (
        <div className={cn('flex items-center gap-1', !compacto && 'justify-end')}>
          <span className="whitespace-nowrap font-semibold tabular-nums">{fmt(row.ownBudget.valor_orcado)}</span>
          {canDelete && (
            <Button
              variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-destructive hover:bg-destructive-soft hover:text-destructive"
              aria-label={`Excluir orçamento de ${row.nome}`}
              title="Excluir orçamento deste nível"
              onClick={() => handleDeleteOwnBudget(row)}
            >
              <Trash2 aria-hidden="true" className="w-4 h-4" />
            </Button>
          )}
        </div>
      );
    }
    return (
      <span className={cn('whitespace-nowrap tabular-nums', valorPeso(row), row.locked && 'text-muted-foreground')}>
        {row.locked || row.isUnassigned ? '—' : fmt(row.orcado)}
        {row.locked && <span className="sr-only"> (orçado na categoria superior)</span>}
        {row.isUnassigned && <span className="sr-only"> (sem categoria: não recebe orçamento)</span>}
      </span>
    );
  };

  const statusDaLinha = (row: FlatRow) => {
    const status = computeStatus(row.tipo, row.orcado, row.realizado);
    return status ? <StatusBadge status={STATUS_VARIANT[status]} label={STATUS_LABEL[row.tipo][status]} /> : null;
  };
  const pctDaLinha = (row: FlatRow) => (row.orcado > 0 ? formatPercentBR((row.realizado / row.orcado) * 100, 1) : '—');

  return (
    <div className="space-y-6">
      <ConfirmDialog />

      <FinScreenHeader
        title="Orçamento vs Realizado"
        description="Caixa (Livro Razão) · categorias operacionais ativas · realizado comparado ao orçado do mês"
        actions={(canEdit || canExport) ? (
          <>
            {canEdit && (
              <>
                <Button size="sm" onClick={handleSaveAll} disabled={saving || dirtyItems.length === 0}>
                  {saving ? <Loader2 aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : <Save aria-hidden="true" className="w-4 h-4 mr-1" />}
                  {saving ? 'Salvando...' : dirtyItems.length > 0 ? `Salvar (${dirtyItems.length})` : 'Salvar'}
                </Button>
                {/* Convite a gravar só depois de uma leitura bem-sucedida do mês (D65). A recarga do mesmo mês
                    (ex.: depois de copiar) não desabilita, senão o foco não teria para onde voltar ao fechar o diálogo. */}
                <Button variant="outline" size="sm" onClick={() => setCopyDialogOpen(true)} disabled={primeiraCarga || erro}>
                  <Copy aria-hidden="true" className="w-4 h-4 mr-1" /> Copiar Mês
                </Button>
              </>
            )}

            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={gerarPDF} disabled={loading || erro}>
                  <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={gerarExcel} disabled={loading || erro}>
                  <FileSpreadsheet aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
                </Button>
              </>
            )}
          </>
        ) : undefined}
      />

      <div className="flex flex-wrap items-end gap-3 rounded-summary border bg-card p-4 shadow-card">
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={mesId} className="text-xs text-muted-foreground">Mês</Label>
          <Select value={mesAtual} onValueChange={setMesAtual}>
            <SelectTrigger id={mesId} className="h-9 w-52 max-w-full"><SelectValue /></SelectTrigger>
            <SelectContent>{meses.map(m => <SelectItem key={m} value={m}>{formatMonthBR(m)}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        {dirtyItems.length > 0 && (
          <p role="status" className="pb-2 text-xs font-medium text-warning">
            {dirtyItems.length} alteração(ões) ainda não salva(s). Trocar de mês descarta o que foi digitado.
          </p>
        )}
      </div>

      {/* Content */}
      {erro ? (
        <ErrorState
          title="Não foi possível carregar o orçamento"
          description={`Nenhum valor foi exibido para ${formatMonthBR(mesAtual)}. Tente novamente.`}
          onRetry={() => { void load(); }}
          retrying={loading}
        />
      ) : primeiraCarga ? (
        <>
          <FinSectionGroup id="orc-resumo" title="Resumo do mês" caption="Carregando…">
            <ResumoCarregando cards={3} className={resumoGrid} />
          </FinSectionGroup>
          <FinSectionGroup id="orc-categorias" title="Categorias">
            <div ref={listaRef}><ListaCarregando estreito={listaEstreita} texto="Carregando o orçamento…" /></div>
          </FinSectionGroup>
        </>
      ) : categorias.length === 0 ? (
        <EmptyState
          icon={Target}
          title="Nenhuma categoria operacional cadastrada."
          description="Configure a estrutura em Cadastros Base primeiro."
        />
      ) : (
        <>
          <FinSectionGroup
            id="orc-resumo"
            title="Resumo do mês"
            caption={`${mesCarregado ? formatMonthBR(mesCarregado) : ''} · realizado pelo regime de caixa${loading ? ' · atualizando…' : ''}`}
          >
            <FinKpiGrid className={resumoGrid}>
              <KpiCard
                appearance="summary"
                icon={TrendingUp}
                variant="success"
                label="Receita realizada"
                value={valoresResumo[0]}
                sub={orcadoDoCard(totalReceitaRow)}
              />
              <KpiCard
                appearance="summary"
                icon={TrendingDown}
                variant="danger"
                label="Despesa realizada"
                value={valoresResumo[1]}
                sub={orcadoDoCard(totalDespesaRow)}
              />
              <KpiCard
                appearance="summary"
                icon={Scale}
                label="Resultado realizado"
                value={valoresResumo[2]}
                valueTone={(totalResultadoRow?.realizado ?? 0) < 0 ? 'negative' : 'default'}
                sub={`Resultado projetado (orçado): ${fmt(totalResultadoRow?.orcado ?? 0)}`}
              />
            </FinKpiGrid>
            {dirtyItems.length > 0 && (
              <FinNote>Os valores orçados incluem as alterações ainda não salvas.</FinNote>
            )}
          </FinSectionGroup>

          <FinSectionGroup
            id="orc-categorias"
            title="Categorias"
            caption="Orçado editável nas categorias sem subcategorias · status pela execução do orçado"
          >
            {temBloqueadas && (
              <FinNote>
                Categorias com cadeado têm o orçamento definido na categoria superior: o valor fica lá. Exclua o orçamento do nível de cima para orçar as subcategorias.
              </FinNote>
            )}
            <div ref={listaRef} className="overflow-hidden rounded-summary border bg-card shadow-card">
              {listaEstreita ? (
                <ul aria-label="Orçamento por categoria">
                  {rows.map(row => (
                    <li key={row.key} className={cn('border-t px-3 py-2.5 first:border-t-0', linhaFundo(row))}>
                      <div className="flex items-start gap-1" style={{ paddingLeft: `${row.depth * 12}px` }}>
                        {abrirFechar(row)}
                        <div className="min-w-0 flex-1 pt-1">{nomeDaLinha(row)}</div>
                      </div>
                      <dl className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2 text-xs" style={{ paddingLeft: `${row.depth * 12 + 32}px` }}>
                        <div className="col-span-2 sm:col-span-1">
                          <dt className="text-muted-foreground">Orçado</dt>
                          <dd className="mt-0.5 text-sm">{orcadoDaLinha(row, true)}</dd>
                        </div>
                        <div className="col-span-2 sm:col-span-1">
                          <dt className="text-muted-foreground">Realizado</dt>
                          <dd className={cn('mt-0.5 whitespace-nowrap text-sm tabular-nums', valorPeso(row))}>{fmt(row.realizado)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">% Exec.</dt>
                          <dd className="mt-0.5 tabular-nums text-foreground">{pctDaLinha(row)}</dd>
                        </div>
                        <div>
                          <dt className="text-muted-foreground">Status</dt>
                          <dd className="mt-0.5">{statusDaLinha(row) ?? '—'}</dd>
                        </div>
                      </dl>
                    </li>
                  ))}
                </ul>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Categoria</TableHead>
                      <TableHead className="text-right w-[180px]">Orçado (R$)</TableHead>
                      <TableHead className="text-right w-[160px]">Realizado (R$)</TableHead>
                      <TableHead className="text-right w-[100px]">% Exec.</TableHead>
                      <TableHead className="w-[150px]">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map(row => (
                      <TableRow key={row.key} className={linhaFundo(row)}>
                        <TableCell className="py-2" style={{ paddingLeft: `${row.depth * 20 + 8}px` }}>
                          <div className="flex items-center gap-1">
                            {abrirFechar(row)}
                            {nomeDaLinha(row)}
                          </div>
                        </TableCell>
                        <TableCell className="py-2 text-right">{orcadoDaLinha(row, false)}</TableCell>
                        <TableCell className={cn('whitespace-nowrap py-2 text-right tabular-nums', valorPeso(row))}>
                          {fmt(row.realizado)}
                        </TableCell>
                        <TableCell className="whitespace-nowrap py-2 text-right text-sm tabular-nums text-muted-foreground">{pctDaLinha(row)}</TableCell>
                        <TableCell className="py-2">{statusDaLinha(row)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </FinSectionGroup>
        </>
      )}

      {/* Copy Month Dialog */}
      <Dialog open={copyDialogOpen} onOpenChange={setCopyDialogOpen}>
        <DialogContent {...retornoCopiar}>
          <DialogHeader>
            <DialogTitle>Copiar Orçamento de Outro Mês</DialogTitle>
            <DialogDescription>
              Copiar orçamentos para <strong className="text-foreground">{formatMonthBR(mesAtual)}</strong>. Categorias já existentes serão ignoradas.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor={copiarDeId}>Copiar de</Label>
              <Select value={copyFromMes} onValueChange={setCopyFromMes}>
                <SelectTrigger id={copiarDeId}><SelectValue placeholder="Selecione o mês de origem" /></SelectTrigger>
                <SelectContent>
                  {meses.filter(m => m !== mesAtual).map(m => (
                    <SelectItem key={m} value={m}>{formatMonthBR(m)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleCopy} className="w-full" disabled={copying || !copyFromMes}>
              {copying ? <Loader2 aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : <Copy aria-hidden="true" className="w-4 h-4 mr-1" />}
              {copying ? 'Copiando...' : 'Copiar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

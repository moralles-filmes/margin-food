import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import { emitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import {
  ChevronRight, ChevronDown, Plus, Edit, Trash2, FolderTree,
  FileText, Wand2, Search, Download, ShieldAlert, ArrowUp, ArrowDown, GripVertical
} from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { cn, includesNormalized } from '@/lib/utils';
import * as XLSX from '@/lib/safeXlsx';

// ─── Types ───
export interface CatNode {
  id: string;
  nome: string;
  codigo: string;
  tipo: 'receita' | 'despesa';
  parent_id: string | null;
  ordem: number;
  centro_custo_padrao_id: string | null;
  grupo: string | null;
  linha_dre: string | null;
  system_key: string | null;
  excluir_dos_totais: boolean;
  ativo: boolean;
  updated_at: string;
  children: CatNode[];
}

interface CentroCusto {
  id: string;
  nome: string;
}

type CatRow = Omit<CatNode, 'children'>;

// ─── Tree helpers ───
export function buildTree(items: CatRow[]): CatNode[] {
  const map = new Map<string, CatNode>();
  const roots: CatNode[] = [];

  for (const item of items) {
    map.set(item.id, { ...item, children: [] });
  }
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

function createsCycle(nodeId: string, newParentId: string | null, allNodes: CatRow[]): boolean {
  if (!newParentId || newParentId === nodeId) return newParentId === nodeId;
  // Walk up from newParentId, check if we hit nodeId
  let current: string | null = newParentId;
  const visited = new Set<string>();
  while (current) {
    if (current === nodeId) return true;
    if (visited.has(current)) break;
    visited.add(current);
    const parent = allNodes.find(n => n.id === current);
    current = parent?.parent_id ?? null;
  }
  return false;
}

function filterTree(nodes: CatNode[], search: string): CatNode[] {
  if (!search) return nodes;
  const filter = (list: CatNode[]): CatNode[] => {
    const result: CatNode[] = [];
    for (const node of list) {
      const filteredChildren = filter(node.children);
      if (includesNormalized(node.nome, search) || includesNormalized(node.codigo, search) || filteredChildren.length > 0) {
        result.push({ ...node, children: filteredChildren });
      }
    }
    return result;
  };
  return filter(nodes);
}

function collectLeafIds(nodes: CatNode[], depth = 0): string[] {
  const ids: string[] = [];
  for (const node of nodes) {
    if (node.children.length === 0 && depth > 0) ids.push(node.id);
    ids.push(...collectLeafIds(node.children, depth + 1));
  }
  return ids;
}

// ─── Skeleton loading ───
function SkeletonTree() {
  return (
    <Card>
      <CardContent className="p-3 space-y-2">
        {[...Array(6)].map((_, i) => (
          <div key={i} className="flex items-center gap-2 py-1.5 px-2" style={{ paddingLeft: `${(i % 3) * 20 + 8}px` }}>
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-12" />
            <Skeleton className="h-4 flex-1" />
            <Skeleton className="h-5 w-16 rounded-full" />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}

// ─── NoAccess ───
function NoAccess() {
  return (
    <Card>
      <CardContent className="p-8 text-center text-muted-foreground">
        <ShieldAlert className="w-10 h-10 mx-auto mb-3 opacity-30" />
        <p className="font-medium">Acesso negado</p>
        <p className="text-sm mt-1">Você não tem permissão para visualizar os cadastros base.</p>
      </CardContent>
    </Card>
  );
}

// ─── Drag context ───
interface DragContext {
  dragId: string | null;
  dragTipo: string | null;
  dragParentId: string | null;
  dropTargetId: string | null;
}

// ─── Tree Row ───
interface TreeRowProps {
  node: CatNode;
  depth: number;
  expanded: Set<string>;
  toggleExpand: (id: string) => void;
  onEdit: (node: CatNode) => void;
  onAdd: (parentId: string, parentCodigo: string, parentTipo: string) => void;
  onDelete: (node: CatNode) => void;
  onMove: (id: string, direction: 'up' | 'down') => void;
  canEdit: boolean;
  canCreate: boolean;
  canDelete: boolean;
  saving: boolean;
  isFirst: boolean;
  isLast: boolean;
  dragCtx: DragContext;
  onDragStart: (id: string, tipo: string, parentId: string | null) => void;
  onDragOver: (e: React.DragEvent, targetId: string, targetTipo: string, targetParentId: string | null) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent, targetId: string) => void;
  selectedIds: Set<string>;
  onToggleSelect: (id: string) => void;
}

function TreeRow({
  node, depth, expanded, toggleExpand, onEdit, onAdd, onDelete, onMove,
  canEdit, canCreate, canDelete, saving, isFirst, isLast,
  dragCtx, onDragStart, onDragOver, onDragEnd, onDrop,
  selectedIds, onToggleSelect,
}: TreeRowProps) {
  const isExpanded = expanded.has(node.id);
  const hasChildren = node.children.length > 0;
  const isTopLevel = depth === 0;
  const isLeaf = !hasChildren && depth > 0;
  const isDragging = dragCtx.dragId === node.id;
  const isDropTarget = dragCtx.dropTargetId === node.id && dragCtx.dragId !== node.id;
  const isSystemCategory = node.system_key !== null;
  const canDrop = dragCtx.dragId !== null
    && dragCtx.dragId !== node.id
    && dragCtx.dragTipo === node.tipo
    && dragCtx.dragParentId === (node.parent_id ?? null)
    && !isSystemCategory;

  return (
    <>
      <div
        className={cn(
          'group flex items-center gap-1 py-1.5 px-2 rounded-md transition-colors hover:bg-muted/50',
          isTopLevel && 'bg-muted/30 mt-2 first:mt-0',
          isDragging && 'opacity-40',
          isDropTarget && canDrop && 'ring-2 ring-primary/50 bg-primary/5',
        )}
        style={{ paddingLeft: `${depth * 20 + 8}px` }}
        onDragOver={(e) => {
          if (canDrop) {
            e.preventDefault();
            onDragOver(e, node.id, node.tipo, node.parent_id);
          }
        }}
        onDrop={(e) => {
          if (canDrop) {
            e.preventDefault();
            onDrop(e, node.id);
          }
        }}
      >
        {/* Drag handle */}
        {canEdit && !isSystemCategory && (
          <span
            draggable
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              onDragStart(node.id, node.tipo, node.parent_id);
            }}
            onDragEnd={onDragEnd}
            className="cursor-grab active:cursor-grabbing w-5 h-5 flex items-center justify-center shrink-0 text-muted-foreground/40 hover:text-muted-foreground"
            title="Arrastar para reordenar"
          >
            <GripVertical className="w-3.5 h-3.5" />
          </span>
        )}

        <button
          onClick={() => hasChildren && toggleExpand(node.id)}
          className={cn('w-5 h-5 flex items-center justify-center rounded', hasChildren ? 'hover:bg-muted cursor-pointer' : 'cursor-default')}
          tabIndex={hasChildren ? 0 : -1}
          aria-label={hasChildren ? (isExpanded ? 'Recolher' : 'Expandir') : undefined}
        >
          {hasChildren ? (
            isExpanded ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" /> : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
          ) : (
            <FileText className="w-3 h-3 text-muted-foreground/50" />
          )}
        </button>

        {canDelete && isLeaf && !isSystemCategory && (
          <Checkbox
            checked={selectedIds.has(node.id)}
            onCheckedChange={() => onToggleSelect(node.id)}
            disabled={saving}
            className="shrink-0"
            aria-label={`Selecionar ${node.nome}`}
          />
        )}

        <span className="font-mono text-xs text-muted-foreground w-12 shrink-0">{node.codigo}</span>

        <span className={cn('flex-1 text-sm truncate', isTopLevel ? 'font-bold text-foreground uppercase tracking-wide text-xs' : 'font-medium text-foreground')}>
          {node.nome}
        </span>

        <Badge variant={node.tipo === 'receita' ? 'default' : 'secondary'} className="text-[10px] h-5">
          {node.tipo}
        </Badge>

        {node.excluir_dos_totais && (
          <Badge variant="outline" className="text-[10px] h-5 whitespace-nowrap">
            Fora dos totais
          </Badge>
        )}

        <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {canEdit && !isSystemCategory && !isFirst && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove(node.id, 'up')} title="Subir" disabled={saving}>
              <ArrowUp className="w-3 h-3" />
            </Button>
          )}
          {canEdit && !isSystemCategory && !isLast && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onMove(node.id, 'down')} title="Descer" disabled={saving}>
              <ArrowDown className="w-3 h-3" />
            </Button>
          )}
          {canCreate && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onAdd(node.id, node.codigo, node.tipo)} title="Adicionar sub-item" disabled={saving}>
              <Plus className="w-3 h-3" />
            </Button>
          )}
          {canEdit && !isSystemCategory && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onEdit(node)} title="Editar" disabled={saving}>
              <Edit className="w-3 h-3" />
            </Button>
          )}
          {canDelete && isLeaf && !isSystemCategory && (
            <Button size="icon" variant="ghost" className="h-6 w-6" onClick={() => onDelete(node)} title="Desativar" disabled={saving}>
              <Trash2 className="w-3 h-3 text-destructive" />
            </Button>
          )}
        </div>
      </div>

      {isExpanded && node.children.map((child, idx) => (
        <TreeRow
          key={child.id}
          node={child}
          depth={depth + 1}
          expanded={expanded}
          toggleExpand={toggleExpand}
          onEdit={onEdit}
          onAdd={onAdd}
          onDelete={onDelete}
          onMove={onMove}
          canEdit={canEdit}
          canCreate={canCreate}
          canDelete={canDelete}
          saving={saving}
          isFirst={idx === 0}
          isLast={idx === node.children.length - 1}
          dragCtx={dragCtx}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDrop={onDrop}
          selectedIds={selectedIds}
          onToggleSelect={onToggleSelect}
        />
      ))}
    </>
  );
}

// ─── Grupo / Linha DRE options ───
const GRUPO_OPTIONS = [
  'receita_operacional', 'outras_receitas', 'receita_financeira',
  'cmv', 'impostos', 'taxa', 'pessoal', 'ocupacao', 'utilidades',
  'marketing', 'administrativa', 'manutencao', 'financeira',
  'investimento', 'empréstimo', 'aporte', 'dividendos',
];

const LINHA_DRE_OPTIONS = [
  'CMV', 'Deduções', 'Despesas Operacionais', 'Despesas Financeiras',
];

// ─── Projection fields ───
const CATEGORY_FIELDS = `
  id,
  nome,
  codigo,
  tipo,
  parent_id,
  ordem,
  centro_custo_padrao_id,
  grupo,
  linha_dre,
  system_key,
  excluir_dos_totais,
  ativo,
  created_at,
  updated_at
` as const;

// ─── Main component ───
export default function CadastroBaseTree() {
  const { user } = useAuth();
  const canView = useCan('financeiro:cadastros:view');
  const canCreate = useCan('financeiro:cadastros:create');
  const canEdit = useCan('financeiro:cadastros:edit');
  const canDelete = useCan('financeiro:cadastros:delete');
  const canExport = useCan('financeiro:cadastros:export');

  const [items, setItems] = useState<CatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [showForm, setShowForm] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [editUpdatedAt, setEditUpdatedAt] = useState<string | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    nome: '', codigo: '', tipo: 'despesa', grupo: '', linha_dre: '',
    parent_id: '', centro_custo_padrao_id: '', ordem: 0,
  });
  const [centros, setCentros] = useState<CentroCusto[]>([]);
  const [dragCtx, setDragCtx] = useState<DragContext>({
    dragId: null, dragTipo: null, dragParentId: null, dropTargetId: null,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ─── Data loading ───
  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const [catRes, ccRes] = await Promise.all([
      supabase.from('fin_categorias').select(CATEGORY_FIELDS).eq('ativo', true).order('ordem').order('codigo'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    setItems((catRes.data as CatRow[] | null) || []);
    setCentros((ccRes.data as CentroCusto[] | null) || []);
    setLoading(false);
  }, [canView]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:cadastros', load);

  const tree = buildTree(items);
  const hasRegularCategories = items.some(item => item.system_key === null);
  const filteredTree = filterTree(tree, search);
  // Leaves currently visible/selectable — used to prune stale selection (search filter, background reload).
  const visibleLeafIds = new Set(collectLeafIds(filteredTree));
  const visibleSelectedCount = Array.from(selectedIds).filter(id => visibleLeafIds.has(id)).length;

  const toggleExpand = (id: string) => {
    setExpanded(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const expandAll = () => setExpanded(new Set(items.map(i => i.id)));
  const collapseAll = () => setExpanded(new Set());

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const selectAllLeaves = () => setSelectedIds(new Set(collectLeafIds(filteredTree)));
  const deselectAll = () => setSelectedIds(new Set());

  // ─── Form handlers ───
  const openAdd = (parentId: string, parentCodigo: string, parentTipo: string) => {
    const siblings = items.filter(i => i.parent_id === parentId);
    const nextNum = siblings.length + 1;
    const nextCodigo = `${parentCodigo}.${String(nextNum).padStart(2, '0')}`;
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({
      nome: '', codigo: nextCodigo, tipo: parentTipo, grupo: '', linha_dre: '',
      parent_id: parentId, centro_custo_padrao_id: '', ordem: nextNum * 10,
    });
    setShowForm(true);
  };

  const openAddRoot = () => {
    const rootCount = items.filter(i => !i.parent_id).length;
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({
      nome: '', codigo: String(rootCount + 1), tipo: 'despesa', grupo: '', linha_dre: '',
      parent_id: '', centro_custo_padrao_id: '', ordem: (rootCount + 1) * 10,
    });
    setShowForm(true);
  };

  const openEdit = (node: CatNode) => {
    setEditId(node.id);
    setEditUpdatedAt(node.updated_at);
    setForm({
      nome: node.nome,
      codigo: node.codigo || '',
      tipo: node.tipo,
      grupo: node.grupo || '',
      linha_dre: node.linha_dre || '',
      parent_id: node.parent_id || '',
      centro_custo_padrao_id: node.centro_custo_padrao_id || '',
      ordem: node.ordem || 0,
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setEditId(null);
    setEditUpdatedAt(null);
    setForm({ nome: '', codigo: '', tipo: 'despesa', grupo: '', linha_dre: '', parent_id: '', centro_custo_padrao_id: '', ordem: 0 });
    setShowForm(false);
  };
  const { showConfirm, guardedClose, confirmClose, cancelClose } = useFormDirtyGuard({ current: form, onClose: resetForm });

  // ─── Early return if no permission ───
  if (!canView) return <NoAccess />;

  const save = async () => {
    if (saving) return;
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }

    // Cycle detection on edit
    if (editId && form.parent_id) {
      if (createsCycle(editId, form.parent_id, items)) {
        toast.error('Operação inválida: criaria um ciclo na árvore.');
        return;
      }
    }

    setSaving(true);
    try {
      const payload = {
        nome: form.nome,
        codigo: form.codigo || '',
        tipo: form.tipo,
        grupo: form.grupo || null,
        linha_dre: form.linha_dre || null,
        parent_id: form.parent_id || null,
        centro_custo_padrao_id: form.centro_custo_padrao_id || null,
        ordem: form.ordem || 0,
      };

      if (editId) {
        // Optimistic locking via updated_at
        let query = supabase.from('fin_categorias').update(payload).eq('id', editId);
        if (editUpdatedAt) {
          query = query.eq('updated_at', editUpdatedAt);
        }
        const { data, error } = await query.select('id');
        if (error) { toast.error(error.message); return; }
        if (!data || data.length === 0) {
          toast.error('Registro foi alterado por outro usuário. Atualize a tela.');
          return;
        }
        toast.success('Categoria atualizada');
      } else {
        const insertPayload = { ...payload, created_by: user?.id };
        const { error } = await supabase.from('fin_categorias').insert(insertPayload);
        if (error) { toast.error(error.message); return; }
        toast.success('Categoria criada');
      }
      resetForm();
      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      setSaving(false);
    }
  };

  // ─── Delete with confirmation + link check ───
  const handleDelete = async (node: CatNode) => {
    if (node.children.length > 0) {
      toast.error('Remova os sub-itens primeiro');
      return;
    }

    // Check for linked records
    const [lancRes, rateioRes] = await Promise.all([
      supabase.from('fin_lancamentos').select('id').eq('categoria_id', node.id).limit(1),
      supabase.from('fin_lancamento_rateios').select('id').eq('categoria_id', node.id).limit(1),
    ]);

    if ((lancRes.data && lancRes.data.length > 0) || (rateioRes.data && rateioRes.data.length > 0)) {
      toast.error('Categoria possui lançamentos vinculados e não pode ser desativada.');
      return;
    }

    const ok = await confirm({
      title: 'Desativar categoria',
      description: `Deseja desativar a categoria "${node.nome}"? Esta ação pode ser revertida.`,
      variant: 'destructive',
      confirmLabel: 'Desativar',
    });
    if (!ok) return;

    setSaving(true);
    try {
      const { error } = await supabase.from('fin_categorias').update({ ativo: false }).eq('id', node.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Categoria desativada');
      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      setSaving(false);
    }
  };

  // ─── Bulk delete (multi-select) ───
  const handleBulkDelete = async () => {
    // Intersect with currently visible leaves: selectedIds isn't pruned when the tree is
    // filtered by search or silently reloaded (useDataEvent) elsewhere, so a stale id could
    // point at a category the user can no longer see and no longer intends to delete.
    const ids = Array.from(selectedIds).filter(id => visibleLeafIds.has(id));
    if (ids.length === 0) return;

    const ok = await confirm({
      title: 'Excluir categorias selecionadas',
      description: `Deseja desativar ${ids.length} categoria(s) selecionada(s)? Esta ação pode ser revertida.`,
      variant: 'destructive',
      confirmLabel: 'Excluir',
    });
    if (!ok) return;

    setSaving(true);
    try {
      const excluidas: string[] = [];
      const bloqueadas: string[] = [];

      for (const id of ids) {
        const nome = items.find(i => i.id === id)?.nome || id;

        const [lancRes, rateioRes] = await Promise.all([
          supabase.from('fin_lancamentos').select('id').eq('categoria_id', id).limit(1),
          supabase.from('fin_lancamento_rateios').select('id').eq('categoria_id', id).limit(1),
        ]);
        if ((lancRes.data && lancRes.data.length > 0) || (rateioRes.data && rateioRes.data.length > 0)) {
          bloqueadas.push(`${nome} (vinculada a lançamentos)`);
          continue;
        }

        const { error } = await supabase.from('fin_categorias').update({ ativo: false }).eq('id', id);
        if (error) {
          bloqueadas.push(`${nome} (${error.message})`);
          continue;
        }
        excluidas.push(id);
      }

      setSelectedIds(new Set());

      if (bloqueadas.length === 0) {
        toast.success(`${excluidas.length} categoria(s) excluída(s)`);
      } else if (excluidas.length === 0) {
        toast.error(`Nenhuma categoria excluída. Bloqueadas: ${bloqueadas.join('; ')}`);
      } else {
        toast.warning(`${excluidas.length} excluída(s), ${bloqueadas.length} bloqueada(s): ${bloqueadas.join('; ')}`);
      }

      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      setSaving(false);
    }
  };

  // ─── Reorder category ───
  const handleMove = async (categoryId: string, direction: 'up' | 'down') => {
    if (saving) return;
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('reorder_fin_categoria', {
        p_category_id: categoryId,
        p_direction: direction,
      });
      if (error) { toast.error(error.message); return; }
      const result = data as { status: string; message?: string } | null;
      if (result?.status === 'noop') {
        toast.info(result.message || 'Já está na posição limite');
        return;
      }
      await load();
      emitDataEvent('financeiro:cadastros');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao reordenar');
    } finally {
      setSaving(false);
    }
  };

  // ─── Drag and Drop handlers ───
  const handleDragStart = (id: string, tipo: string, parentId: string | null) => {
    setDragCtx({ dragId: id, dragTipo: tipo, dragParentId: parentId, dropTargetId: null });
  };

  const handleDragOver = (_e: React.DragEvent, targetId: string, _tipo: string, _parentId: string | null) => {
    setDragCtx(prev => ({ ...prev, dropTargetId: targetId }));
  };

  const handleDragEnd = () => {
    setDragCtx({ dragId: null, dragTipo: null, dragParentId: null, dropTargetId: null });
  };

  const handleDrop = async (_e: React.DragEvent, targetId: string) => {
    const { dragId, dragTipo, dragParentId } = dragCtx;
    handleDragEnd();
    if (!dragId || dragId === targetId || saving) return;

    // Get siblings in current order (same parent + same tipo)
    const siblings = items
      .filter(i => i.tipo === dragTipo && (i.parent_id ?? null) === (dragParentId ?? null))
      .sort((a, b) => a.ordem - b.ordem || a.codigo.localeCompare(b.codigo));

    const dragIndex = siblings.findIndex(s => s.id === dragId);
    const dropIndex = siblings.findIndex(s => s.id === targetId);
    if (dragIndex === -1 || dropIndex === -1) return;

    // Move item from dragIndex to dropIndex
    const reordered = [...siblings];
    const [moved] = reordered.splice(dragIndex, 1);
    reordered.splice(dropIndex, 0, moved);

    // Build batch payload
    const payload = reordered.map((item, idx) => ({ id: item.id, ordem: (idx + 1) * 10 }));

    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('batch_reorder_fin_categorias', {
        p_items: payload,
      });
      if (error) { toast.error(error.message); return; }
      await load();
      emitDataEvent('financeiro:cadastros');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao reordenar');
    } finally {
      setSaving(false);
    }
  };

  // ─── Seed via RPC ───
  const seedDefaults = async () => {
    if (hasRegularCategories) {
      toast.error('Já existem categorias cadastradas.');
      return;
    }
    setSeeding(true);
    try {
      const { data, error } = await supabase.rpc('seed_default_categories' as any);
      if (error) { toast.error(error.message); return; }
      const result = data as { status: string; quantidade_inserida: number } | null;
      toast.success(`Modelo padrão carregado: ${result?.quantidade_inserida ?? 0} categorias`);
      load();
      emitDataEvent('financeiro:cadastros');
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar modelo padrão');
    } finally {
      setSeeding(false);
    }
  };

  // ─── Export Excel ───
  const exportExcel = () => {
    const flattenForExport = (nodes: CatNode[], result: Record<string, string | number | boolean>[] = []): Record<string, string | number | boolean>[] => {
      for (const n of nodes) {
        const cc = centros.find(c => c.id === n.centro_custo_padrao_id);
        result.push({
          codigo: n.codigo,
          nome: n.nome,
          tipo: n.tipo,
          grupo: n.grupo || '',
          linha_dre: n.linha_dre || '',
          centro_custo: cc?.nome || '',
          parent_id: n.parent_id || '',
          ordem: n.ordem,
          ativo: n.ativo,
        });
        if (n.children.length > 0) flattenForExport(n.children, result);
      }
      return result;
    };

    const rows = flattenForExport(tree);
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Categorias');
    XLSX.writeFile(wb, 'categorias_financeiras.xlsx');
    toast.success('Exportação concluída');
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Estrutura de Categorias</h2>
          <p className="text-sm text-muted-foreground">
            Árvore hierárquica de receitas e despesas — base para DRE e DFC
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={expandAll}>Expandir Tudo</Button>
          <Button variant="outline" size="sm" onClick={collapseAll}>Recolher</Button>
          {canDelete && collectLeafIds(filteredTree).length > 0 && (
            <>
              <Button variant="outline" size="sm" onClick={selectAllLeaves}>Selecionar Todas</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Desmarcar</Button>
            </>
          )}
          {visibleSelectedCount > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={saving}>
              <Trash2 className="w-4 h-4 mr-1" /> Excluir Selecionadas ({visibleSelectedCount})
            </Button>
          )}
          {canExport && (
            <Button variant="outline" size="sm" onClick={exportExcel}>
              <Download className="w-4 h-4 mr-1" /> Excel
            </Button>
          )}
          {canCreate && !hasRegularCategories && (
            <Button variant="outline" size="sm" onClick={seedDefaults} disabled={seeding}>
              <Wand2 className={cn('w-4 h-4 mr-1', seeding && 'animate-spin')} /> Modelo Padrão
            </Button>
          )}
          {canCreate && (
            <Button size="sm" onClick={openAddRoot} disabled={saving}>
              <Plus className="w-4 h-4 mr-1" /> Nova Raiz
            </Button>
          )}
        </div>
      </div>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
        <Input
          placeholder="Buscar categoria..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {loading ? (
        <SkeletonTree />
      ) : filteredTree.length === 0 && !search ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <FolderTree className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma categoria cadastrada</p>
          <p className="text-sm mt-1">Clique em "Modelo Padrão" para carregar a estrutura inicial.</p>
        </CardContent></Card>
      ) : filteredTree.length === 0 && search ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Search className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhuma categoria encontrada</p>
          <p className="text-sm mt-1">Tente outro termo de busca.</p>
        </CardContent></Card>
      ) : (
        <Card>
          <CardContent className="p-3">
            {filteredTree.map((node, idx) => (
              <TreeRow
                key={node.id}
                node={node}
                depth={0}
                expanded={expanded}
                toggleExpand={toggleExpand}
                onEdit={openEdit}
                onAdd={openAdd}
                onDelete={handleDelete}
                onMove={handleMove}
                canEdit={canEdit}
                canCreate={canCreate}
                canDelete={canDelete}
                saving={saving}
                isFirst={idx === 0 || (idx > 0 && filteredTree[idx - 1].tipo !== node.tipo)}
                isLast={idx === filteredTree.length - 1 || (idx < filteredTree.length - 1 && filteredTree[idx + 1].tipo !== node.tipo)}
                dragCtx={dragCtx}
                onDragStart={handleDragStart}
                onDragOver={handleDragOver}
                onDragEnd={handleDragEnd}
                onDrop={handleDrop}
                selectedIds={selectedIds}
                onToggleSelect={toggleSelect}
              />
            ))}
          </CardContent>
        </Card>
      )}

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Código</Label><Input value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ex: 3.01.01" /></div>
              <div><Label>Ordem</Label><Input type="number" value={form.ordem} onChange={e => setForm({ ...form, ordem: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div><Label>Nome</Label><Input value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div><Label>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div><Label>Grupo</Label>
                <Select value={form.grupo || '_none'} onValueChange={v => setForm({ ...form, grupo: v === '_none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {GRUPO_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div><Label>Linha DRE</Label>
                <Select value={form.linha_dre || '_none'} onValueChange={v => setForm({ ...form, linha_dre: v === '_none' ? '' : v })}>
                  <SelectTrigger><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhuma</SelectItem>
                    {LINHA_DRE_OPTIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div><Label>Centro de Custo Padrão</Label>
              <Select value={form.centro_custo_padrao_id || '_none'} onValueChange={v => setForm({ ...form, centro_custo_padrao_id: v === '_none' ? '' : v })}>
                <SelectTrigger><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <Button onClick={save} className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : editId ? 'Atualizar' : 'Criar'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <FormCloseConfirmDialog open={showConfirm} onConfirmLeave={confirmClose} onCancelLeave={cancelClose} />
      <ConfirmDialog />
    </div>
  );
}

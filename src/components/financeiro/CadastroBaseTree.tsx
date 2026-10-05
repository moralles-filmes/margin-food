import { useCompanyId } from '@/hooks/useCompanyId';
import { withCompanyId } from '@/lib/companyPayload';
import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef, useId } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useCan } from '@/permissions';
import { useEmitDataEvent, useDataEvent } from '@/lib/dataEvents';
import { useConfirmDialog } from '@/hooks/useConfirmDialog';
import { useScopedToast } from '@/hooks/useScopedToast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Checkbox } from '@/components/ui/checkbox';
import StatusBadge from '@/components/ui/StatusBadge';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import {
  ChevronRight, ChevronDown, Plus, Edit, Trash2, FolderTree,
  FileText, Wand2, Search, Download, ArrowUp, ArrowDown, GripVertical, ChevronsDown, ChevronsUp,
} from 'lucide-react';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { cn, includesNormalized } from '@/lib/utils';
import * as XLSX from '@/lib/safeXlsx';
import { FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { useRetornoFoco } from './useRetornoFoco';
import { devolverFoco, elementoComFoco } from './devolverFoco';
import { categoriaTipoBadge } from './fechamentoView';

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
    <div role="status" className="space-y-2 rounded-summary border bg-card p-3">
      <span className="sr-only">Carregando categorias…</span>
      {[...Array(6)].map((_, i) => (
        <div key={i} aria-hidden="true" className="flex items-center gap-2 py-1.5 px-2" style={{ paddingLeft: `${(i % 3) * 20 + 8}px` }}>
          <Skeleton className="h-4 w-4 rounded" />
          <Skeleton className="h-4 w-12" />
          <Skeleton className="h-4 flex-1" />
          <Skeleton className="h-5 w-16 rounded-full" />
        </div>
      ))}
    </div>
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
  /** Durante a busca os grupos com resultado ficam abertos (só exibição; `expanded` não muda). */
  abertoPelaBusca: boolean;
  /** Ids com sub-itens ativos na árvore inteira: a busca poda os filhos, mas um grupo não vira folha por isso. */
  paisReais: Set<string>;
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

const acaoLinha = 'h-8 w-8 text-muted-foreground hover:text-foreground';

function TreeRow({
  node, depth, expanded, abertoPelaBusca, paisReais, toggleExpand, onEdit, onAdd, onDelete, onMove,
  canEdit, canCreate, canDelete, saving, isFirst, isLast,
  dragCtx, onDragStart, onDragOver, onDragEnd, onDrop,
  selectedIds, onToggleSelect,
}: TreeRowProps) {
  const hasChildren = node.children.length > 0;
  const isExpanded = hasChildren && (abertoPelaBusca || expanded.has(node.id));
  const isTopLevel = depth === 0;
  const isLeaf = !hasChildren && !paisReais.has(node.id) && depth > 0;
  const isDragging = dragCtx.dragId === node.id;
  const isDropTarget = dragCtx.dropTargetId === node.id && dragCtx.dragId !== node.id;
  const isSystemCategory = node.system_key !== null;
  const canDrop = dragCtx.dragId !== null
    && dragCtx.dragId !== node.id
    && dragCtx.dragTipo === node.tipo
    && dragCtx.dragParentId === (node.parent_id ?? null)
    && !isSystemCategory;
  const tipo = categoriaTipoBadge(node.tipo);

  return (
    <li>
      <div
        className={cn(
          'flex flex-wrap items-center gap-x-2 gap-y-1 rounded-md py-1 pr-2 transition-colors hover:bg-card-hover [@container(min-width:40rem)]:flex-nowrap',
          isTopLevel && 'bg-muted',
          isDragging && 'outline-dashed outline-1 outline-border',
          isDropTarget && canDrop && 'bg-primary-soft ring-2 ring-primary',
        )}
        style={{ paddingLeft: `${depth * 20 + 4}px` }}
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
        <div className="flex min-w-0 flex-1 basis-60 items-center gap-1">
          {/* Arrastar só com mouse; pelo teclado, "Subir"/"Descer" fazem a mesma reordenação. */}
          {canEdit && !isSystemCategory && (
            <span
              draggable
              onDragStart={(e) => {
                e.dataTransfer.effectAllowed = 'move';
                onDragStart(node.id, node.tipo, node.parent_id);
              }}
              onDragEnd={onDragEnd}
              aria-hidden="true"
              className="flex h-8 w-5 shrink-0 cursor-grab items-center justify-center text-muted-foreground hover:text-foreground active:cursor-grabbing"
              title="Arrastar para reordenar"
            >
              <GripVertical className="h-3.5 w-3.5" />
            </span>
          )}

          {hasChildren ? (
            <button
              type="button"
              onClick={() => toggleExpand(node.id)}
              disabled={abertoPelaBusca}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-secondary hover:text-foreground disabled:cursor-default disabled:hover:bg-transparent"
              aria-expanded={isExpanded}
              aria-label={`${isExpanded ? 'Recolher' : 'Expandir'} ${node.nome}`}
              title={abertoPelaBusca ? 'Aberta durante a busca' : undefined}
            >
              {isExpanded ? <ChevronDown aria-hidden="true" className="h-4 w-4" /> : <ChevronRight aria-hidden="true" className="h-4 w-4" />}
            </button>
          ) : (
            <span aria-hidden="true" className="flex h-8 w-8 shrink-0 items-center justify-center text-muted-foreground">
              <FileText className="h-3.5 w-3.5" />
            </span>
          )}

          {canDelete && isLeaf && !isSystemCategory && (
            <Checkbox
              checked={selectedIds.has(node.id)}
              onCheckedChange={() => onToggleSelect(node.id)}
              disabled={saving}
              className="mr-1 shrink-0"
              aria-label={`Selecionar ${node.nome}`}
            />
          )}

          <span className="min-w-[3.5rem] shrink-0 font-mono text-xs text-muted-foreground">{node.codigo}</span>

          <span className={cn(
            'min-w-0 break-words',
            isTopLevel ? 'text-xs font-bold uppercase tracking-wide text-foreground' : 'text-sm font-medium text-foreground',
          )}>
            {node.nome}
          </span>
        </div>

        <div className="flex w-full flex-wrap items-center justify-between gap-1.5 [@container(min-width:40rem)]:ml-auto [@container(min-width:40rem)]:w-auto [@container(min-width:40rem)]:justify-end">
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge status={tipo.status} label={tipo.label} />
            {node.excluir_dos_totais && <StatusBadge status="neutral" label="Fora dos totais" />}
            {isSystemCategory && (
              <span title="Categoria de sistema: não é editada, desativada nem reordenada aqui">
                <StatusBadge status="info" label="Sistema" />
              </span>
            )}
          </div>

          {/* Mesmas ações e condições de antes; a ação que não se aplica à linha deixa o espaço vazio
              (só quando o perfil tem a permissão), para as ações ficarem alinhadas em coluna. */}
          <div className="flex items-center">
            {canEdit && (!isSystemCategory && !isFirst ? (
              <Button size="icon" variant="ghost" className={acaoLinha} onClick={() => onMove(node.id, 'up')} title={`Subir ${node.nome}`} aria-label={`Subir ${node.nome}`} disabled={saving}>
                <ArrowUp aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : <span aria-hidden="true" className="h-8 w-8" />)}
            {canEdit && (!isSystemCategory && !isLast ? (
              <Button size="icon" variant="ghost" className={acaoLinha} onClick={() => onMove(node.id, 'down')} title={`Descer ${node.nome}`} aria-label={`Descer ${node.nome}`} disabled={saving}>
                <ArrowDown aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : <span aria-hidden="true" className="h-8 w-8" />)}
            {canCreate && (
              <Button size="icon" variant="ghost" className={acaoLinha} onClick={() => onAdd(node.id, node.codigo, node.tipo)} title={`Adicionar sub-item em ${node.nome}`} aria-label={`Adicionar sub-item em ${node.nome}`} disabled={saving}>
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            )}
            {canEdit && (!isSystemCategory ? (
              <Button size="icon" variant="ghost" className={acaoLinha} onClick={() => onEdit(node)} title={`Editar ${node.nome}`} aria-label={`Editar ${node.nome}`} disabled={saving}>
                <Edit aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : <span aria-hidden="true" className="h-8 w-8" />)}
            {canDelete && (isLeaf && !isSystemCategory ? (
              <Button size="icon" variant="ghost" className="h-8 w-8 text-destructive hover:text-destructive" onClick={() => onDelete(node)} title={`Desativar ${node.nome}`} aria-label={`Desativar ${node.nome}`} disabled={saving}>
                <Trash2 aria-hidden="true" className="h-3.5 w-3.5" />
              </Button>
            ) : <span aria-hidden="true" className="h-8 w-8" />)}
          </div>
        </div>
      </div>

      {isExpanded && (
        <ul className="space-y-0.5">
          {node.children.map((child, idx) => (
            <TreeRow
              key={child.id}
              node={child}
              depth={depth + 1}
              expanded={expanded}
              abertoPelaBusca={abertoPelaBusca}
              paisReais={paisReais}
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
        </ul>
      )}
    </li>
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
  const emitDataEvent = useEmitDataEvent();
  const toast = useScopedToast();
  const supabase = useSupabase();
  const { companyId } = useCompanyId();
  const { user } = useAuth();
  const canView = useCan('financeiro:cadastros:view');
  const canCreate = useCan('financeiro:cadastros:create');
  const canEdit = useCan('financeiro:cadastros:edit');
  const canDelete = useCan('financeiro:cadastros:delete');
  const canExport = useCan('financeiro:cadastros:export');

  const [items, setItems] = useState<CatRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  // Trava síncrona: `saving` só chega ao botão no próximo render, e dois cliques
  // no mesmo render gravavam a categoria duas vezes.
  const salvandoRef = useRef(false);
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
  // Só apresentação: leitura que falhou não é "nenhuma categoria" (a lista vazia viraria convite ao Modelo Padrão).
  const [erro, setErro] = useState(false);
  const [centrosErro, setCentrosErro] = useState(false);
  const retornoForm = useRetornoFoco();
  const buscaId = useId();
  const campoId = useId();

  const { confirm, ConfirmDialog } = useConfirmDialog();

  // ─── Data loading ───
  const load = useCallback(async () => {
    if (!canView) return;
    setLoading(true);
    const [catRes, ccRes] = await Promise.all([
      supabase.from('fin_categorias').select(CATEGORY_FIELDS).eq('ativo', true).order('ordem').order('codigo'),
      supabase.from('fin_centros_custo').select('id, nome').eq('ativo', true).order('nome'),
    ]);
    if (catRes.error) console.error('[CadastroBaseTree.load] categorias', catRes.error);
    if (ccRes.error) console.error('[CadastroBaseTree.load] centros', ccRes.error);
    setErro(Boolean(catRes.error));
    setCentrosErro(Boolean(ccRes.error));
    setItems((catRes.data as CatRow[] | null) || []);
    setCentros((ccRes.data as CentroCusto[] | null) || []);
    setLoading(false);
  }, [canView, supabase]);

  useEffect(() => { load(); }, [load]);
  useDataEvent('financeiro:cadastros', load);

  const tree = buildTree(items);
  // Categorias de sistema (raízes NÃO OPERACIONAIS) têm filhos lazy-criados
  // (Descontos Obtidos/Concedidos) com system_key NULL — contá-los como
  // "categoria regular" bloqueava o Modelo Padrão mesmo sem nada cadastrado.
  const systemSubtreeIds = new Set<string>();
  for (const item of items) {
    if (item.system_key !== null) systemSubtreeIds.add(item.id);
  }
  let grew = true;
  while (grew) {
    grew = false;
    for (const item of items) {
      if (item.parent_id && systemSubtreeIds.has(item.parent_id) && !systemSubtreeIds.has(item.id)) {
        systemSubtreeIds.add(item.id);
        grew = true;
      }
    }
  }
  const hasRegularCategories = items.some(item => item.system_key === null && !systemSubtreeIds.has(item.id));
  const filteredTree = filterTree(tree, search);
  // A busca poda os filhos: um grupo que casa só pelo nome voltaria como "folha" (com seleção e Desativar).
  // Folha é decidida pela árvore inteira — com a busca abrindo os grupos (D64) isso ficava ao alcance de um clique.
  const paisReais = new Set(items.map(i => i.parent_id).filter((id): id is string => !!id));
  const folhasVisiveis = collectLeafIds(filteredTree).filter(id => !paisReais.has(id));
  // Leaves currently visible/selectable — used to prune stale selection (search filter, background reload).
  const visibleLeafIds = new Set(folhasVisiveis);
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
  const selectAllLeaves = () => setSelectedIds(new Set(folhasVisiveis));
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
  if (!canView) return <AccessDenied title="Acesso negado" description="Você não tem permissão para visualizar os cadastros base." />;

  const save = async () => {
    if (salvandoRef.current) return;
    if (!form.nome.trim()) { toast.error('Nome obrigatório'); return; }

    // Cycle detection on edit
    if (editId && form.parent_id) {
      if (createsCycle(editId, form.parent_id, items)) {
        toast.error('Operação inválida: criaria um ciclo na árvore.');
        return;
      }
    }

    salvandoRef.current = true;
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
        const { error } = await supabase.from('fin_categorias').insert(withCompanyId(companyId, insertPayload));
        if (error) { toast.error(error.message); return; }
        toast.success('Categoria criada');
      }
      resetForm();
      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      salvandoRef.current = false;
      setSaving(false);
    }
  };

  // ─── Delete with confirmation + link check ───
  const handleDelete = async (node: CatNode) => {
    // Só foco: a confirmação abre sem gatilho; ao cancelar, o foco volta ao botão da linha.
    const origemFoco = elementoComFoco();
    if (node.children.length > 0 || paisReais.has(node.id)) {
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
    if (!ok) { devolverFoco(origemFoco); return; }

    setSaving(true);
    try {
      const { error } = await supabase.from('fin_categorias').update({ ativo: false }).eq('id', node.id);
      if (error) { toast.error(error.message); return; }
      toast.success('Categoria desativada');
      load();
      emitDataEvent('financeiro:cadastros');
    } finally {
      setSaving(false);
      devolverFoco(origemFoco);
    }
  };

  // ─── Bulk delete (multi-select) ───
  const handleBulkDelete = async () => {
    // Intersect with currently visible leaves: selectedIds isn't pruned when the tree is
    // filtered by search or silently reloaded (useDataEvent) elsewhere, so a stale id could
    // point at a category the user can no longer see and no longer intends to delete.
    const ids = Array.from(selectedIds).filter(id => visibleLeafIds.has(id));
    if (ids.length === 0) return;
    const origemFoco = elementoComFoco();

    const ok = await confirm({
      title: 'Excluir categorias selecionadas',
      description: `Deseja desativar ${ids.length} categoria(s) selecionada(s)? Esta ação pode ser revertida.`,
      variant: 'destructive',
      confirmLabel: 'Excluir',
    });
    if (!ok) { devolverFoco(origemFoco); return; }

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
      devolverFoco(origemFoco);
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

  // ─── Apresentação ───
  const leafCount = folhasVisiveis.length;
  // Só depois de uma leitura que deu certo: lista vazia por falha ou carregamento não é "sem categorias".
  const podeModeloPadrao = canCreate && !hasRegularCategories && !loading && !erro;
  const parentNome = form.parent_id ? items.find(i => i.id === form.parent_id)?.nome : undefined;
  const legenda = loading && items.length > 0
    ? 'Atualizando…'
    : loading || erro
    ? undefined
    : search
      ? 'Busca: categorias encontradas e os grupos acima delas'
      : `${items.length === 1 ? '1 categoria ativa' : `${items.length} categorias ativas`}`;
  const ids = {
    codigo: `${campoId}-codigo`,
    ordem: `${campoId}-ordem`,
    nome: `${campoId}-nome`,
    tipo: `${campoId}-tipo`,
    grupo: `${campoId}-grupo`,
    linha: `${campoId}-linha`,
    centro: `${campoId}-centro`,
  };

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Estrutura de Categorias"
        description="Árvore hierárquica de receitas e despesas — base para DRE e DFC"
        actions={(
          <>
            {canExport && (
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={loading || erro || centrosErro}>
                <Download aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
              </Button>
            )}
            {podeModeloPadrao && (
              <Button variant="outline" size="sm" onClick={seedDefaults} disabled={seeding}>
                <Wand2 aria-hidden="true" className={cn('w-4 h-4 mr-1', seeding && 'animate-spin')} /> Modelo Padrão
              </Button>
            )}
            {canCreate && (
              <Button size="sm" onClick={openAddRoot} disabled={saving}>
                <Plus aria-hidden="true" className="w-4 h-4 mr-1" /> Nova Raiz
              </Button>
            )}
          </>
        )}
      />

      <div className="space-y-3 rounded-summary border bg-card p-4 shadow-card">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor={buscaId} className="text-xs text-muted-foreground">Buscar categoria</Label>
          <div className="relative">
            <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              id={buscaId}
              type="search"
              placeholder="Nome ou código..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="h-9 pl-9"
            />
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t pt-3">
          <Button variant="outline" size="sm" onClick={expandAll} disabled={!!search}>
            <ChevronsDown aria-hidden="true" className="w-4 h-4 mr-1" /> Expandir tudo
          </Button>
          <Button variant="outline" size="sm" onClick={collapseAll} disabled={!!search}>
            <ChevronsUp aria-hidden="true" className="w-4 h-4 mr-1" /> Recolher tudo
          </Button>
          {canDelete && leafCount > 0 && (
            <>
              <span aria-hidden="true" className="mx-1 hidden h-5 w-px bg-border sm:block" />
              <Button variant="outline" size="sm" onClick={selectAllLeaves}>Selecionar todas</Button>
              <Button variant="outline" size="sm" onClick={deselectAll}>Desmarcar</Button>
            </>
          )}
          {visibleSelectedCount > 0 && (
            <Button variant="destructive" size="sm" onClick={handleBulkDelete} disabled={saving} className="sm:ml-auto">
              <Trash2 aria-hidden="true" className="w-4 h-4 mr-1" /> Excluir selecionadas ({visibleSelectedCount})
            </Button>
          )}
        </div>
        {search && (
          <p className="text-xs text-muted-foreground">Durante a busca, os grupos acima das categorias encontradas ficam abertos.</p>
        )}
      </div>

      <FinSectionGroup id="cad-categorias" title="Categorias" caption={legenda}>
        {/* Esqueleto só na primeira carga: numa recarga (depois de Subir/Descer, salvar, desativar) a árvore
            continua montada, e o foco fica no botão em vez de voltar ao topo da página. */}
        {loading && items.length === 0 ? (
          <SkeletonTree />
        ) : erro ? (
          <ErrorState title="Não foi possível carregar as categorias" onRetry={() => { void load(); }} retrying={loading} />
        ) : filteredTree.length === 0 && !search ? (
          <EmptyState
            icon={FolderTree}
            title="Nenhuma categoria cadastrada"
            description={canCreate
              ? 'Clique em "Modelo Padrão" para carregar a estrutura inicial.'
              : 'Ainda não há categorias ativas nesta unidade.'}
          />
        ) : filteredTree.length === 0 && search ? (
          <EmptyState
            icon={Search}
            title="Nenhuma categoria encontrada"
            description="Tente outro termo de busca."
            actionLabel="Limpar busca"
            onAction={() => setSearch('')}
          />
        ) : (
          <div className="rounded-summary border bg-card p-2 shadow-card [container-type:inline-size]">
            <ul className="space-y-0.5">
              {filteredTree.map((node, idx) => (
                <TreeRow
                  key={node.id}
                  node={node}
                  depth={0}
                  expanded={expanded}
                  abertoPelaBusca={!!search}
                  paisReais={paisReais}
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
            </ul>
          </div>
        )}
      </FinSectionGroup>

      {/* Form Dialog */}
      <Dialog open={showForm} onOpenChange={(open) => { if (!open) guardedClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto" {...retornoForm}>
          <DialogHeader>
            <DialogTitle>{editId ? 'Editar Categoria' : 'Nova Categoria'}</DialogTitle>
            <DialogDescription>
              {editId
                ? 'Altere os dados da categoria.'
                : parentNome ? `Sub-item de ${parentNome}.` : 'Categoria raiz da árvore.'}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={ids.codigo}>Código</Label><Input id={ids.codigo} value={form.codigo} onChange={e => setForm({ ...form, codigo: e.target.value })} placeholder="Ex: 3.01.01" /></div>
              <div className="space-y-1.5"><Label htmlFor={ids.ordem}>Ordem</Label><Input id={ids.ordem} type="number" step="1" min="0" value={form.ordem} onChange={e => setForm({ ...form, ordem: parseInt(e.target.value) || 0 })} /></div>
            </div>
            <div className="space-y-1.5"><Label htmlFor={ids.nome}>Nome</Label><Input id={ids.nome} value={form.nome} onChange={e => setForm({ ...form, nome: e.target.value })} /></div>
            <div className="space-y-1.5"><Label htmlFor={ids.tipo}>Tipo</Label>
              <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                <SelectTrigger id={ids.tipo}><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="receita">Receita</SelectItem>
                  <SelectItem value="despesa">Despesa</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="space-y-1.5"><Label htmlFor={ids.grupo}>Grupo</Label>
                <Select value={form.grupo || '_none'} onValueChange={v => setForm({ ...form, grupo: v === '_none' ? '' : v })}>
                  <SelectTrigger id={ids.grupo}><SelectValue placeholder="Nenhum" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhum</SelectItem>
                    {GRUPO_OPTIONS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5"><Label htmlFor={ids.linha}>Linha DRE</Label>
                <Select value={form.linha_dre || '_none'} onValueChange={v => setForm({ ...form, linha_dre: v === '_none' ? '' : v })}>
                  <SelectTrigger id={ids.linha}><SelectValue placeholder="Nenhuma" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="_none">Nenhuma</SelectItem>
                    {LINHA_DRE_OPTIONS.map(l => <SelectItem key={l} value={l}>{l}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1.5"><Label htmlFor={ids.centro}>Centro de Custo Padrão</Label>
              <Select value={form.centro_custo_padrao_id || '_none'} onValueChange={v => setForm({ ...form, centro_custo_padrao_id: v === '_none' ? '' : v })}>
                <SelectTrigger id={ids.centro}><SelectValue placeholder="Nenhum" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="_none">Nenhum</SelectItem>
                  {centros.map(c => <SelectItem key={c.id} value={c.id}>{c.nome}</SelectItem>)}
                </SelectContent>
              </Select>
              {centrosErro && (
                <p role="alert" className="text-xs text-destructive">
                  Os centros de custo não carregaram; a lista acima pode estar vazia.
                </p>
              )}
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

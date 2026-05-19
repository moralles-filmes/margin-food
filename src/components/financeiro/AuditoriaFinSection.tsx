import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { parseUTCToBR, formatDateBR, parseLocalDate } from '@/lib/formatters';
import { RefreshCw, Shield, Search, FileDown, Ban, ChevronDown, ChevronRight, Plus, Pencil, Trash2, Users } from 'lucide-react';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from 'xlsx';

/* ─── Types ─── */
interface AuditoriaFinItem {
  id: string;
  created_at: string;
  acao: string;
  entidade: string;
  entidade_id: string | null;
  justificativa: string | null;
  antes: Record<string, unknown> | null;
  depois: Record<string, unknown> | null;
  user_id: string | null;
  user_nome: string | null;
  user_email: string | null;
  origem_log: 'fin_audit_logs' | 'audit_logs';
  metadata: Record<string, unknown> | null;
}

interface AuditSummary {
  total: number;
  inserts: number;
  updates: number;
  deletes: number;
  usuarios_ativos: number;
}

interface RPCResult {
  items: AuditoriaFinItem[];
  has_more: boolean;
  next_cursor_created_at: string | null;
  next_cursor_id: string | null;
  summary: AuditSummary;
}

const PAGE_SIZE = 50;

const ENTIDADES = [
  'todos', 'fin_lancamentos', 'fin_contas_pagar', 'fin_contas_receber',
  'fin_contas', 'fin_categorias', 'fin_orcamentos', 'fin_centros_custo',
  'fin_plano_contas', 'fin_lancamento_rateios',
];

const ACOES = ['todos', 'INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CANCEL'];

const acaoColor: Record<string, string> = {
  INSERT: 'bg-success/10 text-success border-success/30',
  UPDATE: 'bg-warning/10 text-warning border-warning/30',
  DELETE: 'bg-destructive/10 text-destructive border-destructive/30',
  APPROVE: 'bg-primary/10 text-primary border-primary/30',
  REJECT: 'bg-destructive/10 text-destructive border-destructive/30',
  CANCEL: 'bg-muted text-muted-foreground border-border',
};

function NoAccess() {
  return (
    <div className="flex items-center justify-center py-16 text-muted-foreground">
      <Ban className="w-5 h-5 mr-2" /> Acesso negado
    </div>
  );
}

function SkeletonRows() {
  return (<>{Array.from({ length: 6 }).map((_, i) => (
    <TableRow key={i}>
      {Array.from({ length: 6 }).map((_, j) => (
        <TableCell key={j}><Skeleton className="h-4 w-full" /></TableCell>
      ))}
    </TableRow>
  ))}</>);
}

/* ─── Diff helper ─── */
function DiffView({ antes, depois }: { antes: Record<string, unknown> | null; depois: Record<string, unknown> | null }) {
  if (!antes && !depois) return <p className="text-xs text-muted-foreground">Sem dados de alteração</p>;

  const allKeys = new Set([
    ...Object.keys(antes || {}),
    ...Object.keys(depois || {}),
  ]);

  const changedKeys = Array.from(allKeys).filter(k => {
    const a = antes ? JSON.stringify(antes[k]) : undefined;
    const d = depois ? JSON.stringify(depois[k]) : undefined;
    return a !== d;
  });

  if (changedKeys.length === 0 && antes && depois) {
    return <p className="text-xs text-muted-foreground">Nenhuma diferença detectada</p>;
  }

  return (
    <div className="grid grid-cols-2 gap-4 text-xs max-h-60 overflow-auto">
      <div>
        <p className="font-semibold text-muted-foreground mb-1">Antes</p>
        {antes ? (
          <div className="space-y-0.5">
            {changedKeys.map(k => (
              <div key={k} className="flex gap-1">
                <span className="text-muted-foreground">{k}:</span>
                <span className="text-destructive font-mono break-all">{JSON.stringify(antes[k] ?? null)}</span>
              </div>
            ))}
          </div>
        ) : <span className="text-muted-foreground italic">—</span>}
      </div>
      <div>
        <p className="font-semibold text-muted-foreground mb-1">Depois</p>
        {depois ? (
          <div className="space-y-0.5">
            {changedKeys.map(k => (
              <div key={k} className="flex gap-1">
                <span className="text-muted-foreground">{k}:</span>
                <span className="text-success font-mono break-all">{JSON.stringify(depois[k] ?? null)}</span>
              </div>
            ))}
          </div>
        ) : <span className="text-muted-foreground italic">—</span>}
      </div>
    </div>
  );
}

function entidadeToRoute(entidade: string, entidade_id: string | null): string | null {
  if (!entidade_id) return null;
  const map: Record<string, string> = {
    fin_lancamentos: 'lancamentos',
    fin_contas_pagar: 'contas-pagar',
    fin_contas_receber: 'contas-receber',
    fin_categorias: 'cadastros',
    fin_contas: 'contas',
    fin_orcamentos: 'orcamento',
  };
  const tab = map[entidade];
  return tab ? `/financeiro/${tab}?id=${entidade_id}` : null;
}

export default function AuditoriaFinSection() {
  const canView = useCan('financeiro:auditoria:view');
  const canExport = useCan('financeiro:auditoria:export');

  const [items, setItems] = useState<AuditoriaFinItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorState, setErrorState] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [cursorCreatedAt, setCursorCreatedAt] = useState<string | null>(null);
  const [cursorId, setCursorId] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const [filtroEntidade, setFiltroEntidade] = useState('todos');
  const [filtroAcao, setFiltroAcao] = useState('todos');
  const [busca, setBusca] = useState('');
  const [dias, setDias] = useState(30);

  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const load = useCallback(async (append = false) => {
    if (!canView) return;
    if (append) {
      if (loadingMore) return;
      setLoadingMore(true);
    } else {
      if (loading && items.length > 0) return;
      setLoading(true);
      setErrorState(false);
    }

    try {
      const params: Record<string, unknown> = {
        p_entidade: filtroEntidade === 'todos' ? null : filtroEntidade,
        p_acao: filtroAcao === 'todos' ? null : filtroAcao,
        p_search: busca.trim() || null,
        p_dias: dias,
        p_limit: PAGE_SIZE,
      };

      if (append && cursorCreatedAt && cursorId) {
        params.p_cursor_created_at = cursorCreatedAt;
        params.p_cursor_id = cursorId;
      }

      const { data, error } = await supabase.rpc('_guarded_list_fin_audit_logs', params as any);

      if (error) {
        console.error(error);
        if (error.message?.includes('PERMISSION_DENIED')) {
          toast.error('Seu perfil não possui permissão para visualizar auditoria.');
        } else {
          toast.error('Erro ao carregar logs de auditoria');
        }
        setErrorState(true);
        return;
      }

      const result = data as unknown as RPCResult;
      const newItems = result.items || [];

      if (append) {
        setItems(prev => [...prev, ...newItems]);
      } else {
        setItems(newItems);
        setSummary(result.summary);
      }

      setHasMore(result.has_more);
      setCursorCreatedAt(result.next_cursor_created_at);
      setCursorId(result.next_cursor_id);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar auditoria');
      setErrorState(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [canView, filtroEntidade, filtroAcao, busca, dias, cursorCreatedAt, cursorId]);

  const reload = useCallback(() => {
    setCursorCreatedAt(null);
    setCursorId(null);
    setItems([]);
    // need to trigger load after state resets
  }, []);

  // Auto-load on filter changes
  useEffect(() => {
    setCursorCreatedAt(null);
    setCursorId(null);
    setItems([]);
  }, [filtroEntidade, filtroAcao, dias]);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorCreatedAt(null);
      setCursorId(null);
      setItems([]);
    }, 400);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [busca]);

  // Load when items reset
  useEffect(() => {
    if (items.length === 0 && canView) {
      load(false);
    }
  }, [items.length, canView, filtroEntidade, filtroAcao, dias, busca]);

  // Auto-refresh (debounced)
  const debouncedReload = useCallback(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setCursorCreatedAt(null);
      setCursorId(null);
      setItems([]);
    }, 500);
  }, []);

  useDataEvent('financeiro:lancamentos', debouncedReload);
  useDataEvent('financeiro:pagar', debouncedReload);
  useDataEvent('financeiro:receber', debouncedReload);
  useDataEvent('financeiro:cadastros', debouncedReload);
  useDataEvent('financeiro:orcamento', debouncedReload);

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  if (!canView) return <NoAccess />;

  const exportExcel = async () => {
    if (exportingExcel || items.length === 0) return;
    setExportingExcel(true);
    try {
      const rows = items.map(l => ({
        'Data/Hora': parseUTCToBR(l.created_at),
        Ação: l.acao,
        Entidade: l.entidade,
        Registro: l.entidade_id || '—',
        Usuário: l.user_nome || l.user_email || l.user_id || '—',
        Email: l.user_email || '—',
        Justificativa: l.justificativa || '—',
        Origem: l.origem_log,
      }));
      const ws = XLSX.utils.json_to_sheet(rows);
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Auditoria Financeira');
      XLSX.writeFile(wb, 'auditoria_financeira.xlsx');
    } finally {
      setExportingExcel(false);
    }
  };

  const exportPdf = async () => {
    if (exportingPdf || items.length === 0) return;
    setExportingPdf(true);
    try {
      const { default: jsPDF } = await import('jspdf');
      const { default: autoTable } = await import('jspdf-autotable');
      const doc = new jsPDF({ orientation: 'landscape' });
      doc.setFontSize(14);
      doc.text('Auditoria Financeira', 14, 15);
      doc.setFontSize(9);
      doc.text(`Período: ${dias} dias | ${items.length} registros`, 14, 23);

      autoTable(doc, {
        startY: 30,
        head: [['Data/Hora', 'Ação', 'Entidade', 'Registro', 'Usuário', 'Justificativa']],
        body: items.map(l => [
          parseUTCToBR(l.created_at),
          l.acao,
          l.entidade,
          l.entidade_id || '—',
          l.user_nome || l.user_email || '—',
          (l.justificativa || '—').slice(0, 60),
        ]),
        styles: { fontSize: 7 },
        headStyles: { fillColor: [30, 41, 59] },
      });

      doc.save('auditoria_financeira.pdf');
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-xl font-bold text-foreground">Auditoria Financeira</h2>
          <p className="text-sm text-muted-foreground">{items.length} registro(s) carregado(s)</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canExport && (
            <>
              <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> PDF
              </Button>
              <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || items.length === 0}>
                <FileDown className="w-4 h-4 mr-1" /> Excel
              </Button>
            </>
          )}
          <Button variant="outline" size="sm" onClick={() => { setCursorCreatedAt(null); setCursorId(null); setItems([]); }} disabled={loading}>
            <RefreshCw className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
          </Button>
        </div>
      </div>

      {/* Summary KPIs */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground">Total</p>
            <p className="text-lg font-bold">{summary.total}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Plus className="w-3 h-3 text-success" /> Inserções</p>
            <p className="text-lg font-bold text-success">{summary.inserts}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Pencil className="w-3 h-3 text-warning" /> Alterações</p>
            <p className="text-lg font-bold text-warning">{summary.updates}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Trash2 className="w-3 h-3 text-destructive" /> Exclusões</p>
            <p className="text-lg font-bold text-destructive">{summary.deletes}</p>
          </CardContent></Card>
          <Card><CardContent className="p-3">
            <p className="text-xs text-muted-foreground flex items-center gap-1"><Users className="w-3 h-3 text-primary" /> Usuários</p>
            <p className="text-lg font-bold text-primary">{summary.usuarios_ativos}</p>
          </CardContent></Card>
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        <div className="relative flex-1 min-w-[180px]">
          <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
          <Input placeholder="Buscar..." value={busca} onChange={e => setBusca(e.target.value)} className="pl-8" />
        </div>
        <Select value={filtroEntidade} onValueChange={setFiltroEntidade}>
          <SelectTrigger className="w-44"><SelectValue placeholder="Entidade" /></SelectTrigger>
          <SelectContent>{ENTIDADES.map(e => <SelectItem key={e} value={e}>{e === 'todos' ? 'Todas entidades' : e.replace('fin_', '')}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={filtroAcao} onValueChange={setFiltroAcao}>
          <SelectTrigger className="w-32"><SelectValue placeholder="Ação" /></SelectTrigger>
          <SelectContent>{ACOES.map(a => <SelectItem key={a} value={a}>{a === 'todos' ? 'Todas ações' : a}</SelectItem>)}</SelectContent>
        </Select>
        <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
          <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="7">7 dias</SelectItem>
            <SelectItem value="30">30 dias</SelectItem>
            <SelectItem value="90">90 dias</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Content */}
      {errorState && !loading ? (
        <Card className="border-destructive/50">
          <CardContent className="p-8 text-center text-destructive">
            <Shield className="w-10 h-10 mx-auto mb-3 opacity-50" />
            <p className="font-medium">Erro ao carregar auditoria</p>
            <Button variant="outline" size="sm" className="mt-3" onClick={() => { setCursorCreatedAt(null); setCursorId(null); setItems([]); }}>Tentar novamente</Button>
          </CardContent>
        </Card>
      ) : loading && items.length === 0 ? (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8"></TableHead>
              <TableHead>Data/Hora</TableHead>
              <TableHead>Ação</TableHead>
              <TableHead>Entidade</TableHead>
              <TableHead>Registro</TableHead>
              <TableHead>Usuário</TableHead>
              <TableHead>Justificativa</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody><SkeletonRows /></TableBody>
        </Table>
      ) : items.length === 0 ? (
        <Card><CardContent className="p-8 text-center text-muted-foreground">
          <Shield className="w-10 h-10 mx-auto mb-3 opacity-30" />
          <p className="font-medium">Nenhum log de auditoria encontrado</p>
          <p className="text-sm">Os logs são gerados automaticamente ao criar, editar ou aprovar registros financeiros.</p>
        </CardContent></Card>
      ) : (
        <>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-8"></TableHead>
                <TableHead>Data/Hora</TableHead>
                <TableHead>Ação</TableHead>
                <TableHead>Entidade</TableHead>
                <TableHead>Registro</TableHead>
                <TableHead>Usuário</TableHead>
                <TableHead>Justificativa</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map(log => {
                const isExpanded = expandedIds.has(log.id);
                const route = entidadeToRoute(log.entidade, log.entidade_id);
                const hasDiff = log.antes || log.depois;

                return (
                  <Collapsible key={log.id} asChild open={isExpanded} onOpenChange={() => toggleExpand(log.id)}>
                    <>
                      <CollapsibleTrigger asChild>
                        <TableRow className={`cursor-pointer hover:bg-muted/60 ${hasDiff ? '' : 'opacity-80'}`}>
                          <TableCell className="w-8 text-muted-foreground">
                            {hasDiff ? (isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />) : null}
                          </TableCell>
                          <TableCell className="font-mono text-xs whitespace-nowrap">
                            {parseUTCToBR(log.created_at)}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={acaoColor[log.acao] || ''}>
                              {log.acao}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm">{(log.entidade || '').replace('fin_', '')}</TableCell>
                          <TableCell className="text-xs font-mono text-muted-foreground">
                            {route ? (
                              <a href={route} className="text-primary hover:underline" title={log.entidade_id || ''}>
                                {(log.entidade_id || '').slice(0, 8)}…
                              </a>
                            ) : log.entidade_id ? (
                              <span title={log.entidade_id}>{log.entidade_id.slice(0, 8)}…</span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <div className="text-sm">{log.user_nome || log.user_email || '—'}</div>
                            {log.user_nome && log.user_email && (
                              <div className="text-[10px] text-muted-foreground">{log.user_email}</div>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                            {log.justificativa || '—'}
                          </TableCell>
                        </TableRow>
                      </CollapsibleTrigger>
                      <CollapsibleContent asChild>
                        <TableRow className="bg-muted/30">
                          <TableCell colSpan={7} className="p-4">
                            <DiffView antes={log.antes} depois={log.depois} />
                            {log.origem_log === 'audit_logs' && (
                              <p className="text-[10px] text-muted-foreground mt-2">Origem: log global</p>
                            )}
                          </TableCell>
                        </TableRow>
                      </CollapsibleContent>
                    </>
                  </Collapsible>
                );
              })}
            </TableBody>
          </Table>

          {hasMore && (
            <div className="text-center">
              <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loadingMore}>
                {loadingMore ? <RefreshCw className="w-4 h-4 mr-1 animate-spin" /> : null}
                Carregar mais
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}

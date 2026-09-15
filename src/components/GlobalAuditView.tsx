import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useCallback, useEffect, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateInput } from '@/components/ui/DateInput';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ScrollArea } from '@/components/ui/scroll-area';
import { ShieldCheck, Search, ChevronDown, Eye, Filter, Download } from 'lucide-react';
import { format, subDays } from 'date-fns';
import { cn, normalizeSearchText } from '@/lib/utils';
import { CursorState } from '@/hooks/useCursorPagination';

import { useCan } from '@/permissions/hooks';
interface AuditLog {
  id: string;
  created_at: string;
  actor_user_id: string | null;
  actor_email: string | null;
  actor_role: string | null;
  source: string;
  module: string;
  entity: string;
  entity_id: string | null;
  action: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  success: boolean;
  log_scope: string;
  scope_reason: string;
}

const PAGE_SIZE = 50;

const MODULES = [
  { value: 'all', label: 'Todos' },
  { value: 'financeiro', label: 'Financeiro' },
  { value: 'compras', label: 'Compras' },
  { value: 'estoque', label: 'Estoque' },
  { value: 'inventario', label: 'Inventário' },
  { value: 'salmon', label: 'Salmão' },
  { value: 'rh', label: 'RH' },
  { value: 'perf', label: 'Performance' },
  { value: 'system', label: 'Sistema' },
];

const ACTIONS = [
  { value: 'all', label: 'Todas' },
  { value: 'CREATE', label: 'Criar' },
  { value: 'UPDATE', label: 'Atualizar' },
  { value: 'DELETE', label: 'Excluir' },
  { value: 'PAY', label: 'Pagar' },
  { value: 'RECEIVE', label: 'Receber' },
  { value: 'TRANSFER_CREATE', label: 'Transferência' },
  { value: 'TRANSFER_DELETE', label: 'Excluir Transf.' },
  { value: 'FERIAS_APPROVE', label: 'Aprovar Férias' },
  { value: 'MIRROR', label: 'Espelhar' },
  { value: 'CANCEL_MIRROR', label: 'Cancelar Espelho' },
  { value: 'STORNO', label: 'Estorno' },
  { value: 'JOB_RUN', label: 'Job' },
  { value: 'SLOW_QUERY', label: 'Slow Query' },
];

const ACTION_COLORS: Record<string, string> = {
  CREATE: 'bg-success-soft text-success',
  UPDATE: 'bg-info-soft text-info',
  DELETE: 'bg-destructive-soft text-destructive',
  PAY: 'bg-warning-soft text-warning',
  RECEIVE: 'bg-success-soft text-success',
  TRANSFER_CREATE: 'bg-info-soft text-info',
  TRANSFER_DELETE: 'bg-destructive-soft text-destructive',
  FERIAS_APPROVE: 'bg-success-soft text-success',
  MIRROR: 'bg-info-soft text-info',
  CANCEL_MIRROR: 'bg-warning-soft text-warning',
  STORNO: 'bg-destructive-soft text-destructive',
  JOB_RUN: 'bg-info-soft text-info',
  SLOW_QUERY: 'bg-warning-soft text-warning',
};

export default function GlobalAuditView() {
  const supabase = useSupabase();
  const canViewRbac = useCan('configuracoes:auditoria-sistema:view');
  const canGlobal = useCan('system:global:manage');
  const [logScope, setLogScope] = useState('TENANT');
  const [logs, setLogs] = useState<AuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasMore, setHasMore] = useState(true);
  const [profiles, setProfiles] = useState<Record<string, string>>({});
  const cursorRef = useRef<CursorState | null>(null);
  const requestRef = useRef(0);
  const invalidateRequest = useCallback(() => { requestRef.current++; }, []);

  // Filters
  const [dateFrom, setDateFrom] = useState(format(subDays(new Date(), 7), 'yyyy-MM-dd'));
  const [dateTo, setDateTo] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [moduleFilter, setModuleFilter] = useState('all');
  const [actionFilter, setActionFilter] = useState('all');
  const [search, setSearch] = useState('');

  // Detail modal
  const [detail, setDetail] = useState<AuditLog | null>(null);

  const buildQuery = useCallback((cursor: CursorState | null) => {
    if (logScope !== 'TENANT') {
      return supabase.rpc('list_restricted_logs', { p_table: 'audit_logs', p_scope: logScope, p_limit: PAGE_SIZE + 1,
        ...(cursor ? { p_cursor_at: cursor.created_at, p_cursor_id: cursor.id } : {}) });
    }
    let query = supabase
      .from('audit_logs')
      .select('id, created_at, actor_user_id, actor_email, actor_role, source, module, entity, entity_id, action, before, after, metadata, success, log_scope, scope_reason')
      .eq('log_scope', 'TENANT')
      .gte('created_at', `${dateFrom}T00:00:00`)
      .lte('created_at', `${dateTo}T23:59:59`)
      .order('created_at', { ascending: false })
      .order('id', { ascending: false })
      .limit(PAGE_SIZE + 1);

    if (moduleFilter !== 'all') query = query.eq('module', moduleFilter);
    if (actionFilter !== 'all') query = query.eq('action', actionFilter);
    if (search) {
      // Busca accent-insensitive via coluna gerada entity_unaccent.
      // entity_id é uuid::text — não tem acentos, mas case-insensitive via ILIKE.
      const term = normalizeSearchText(search).replace(/[%_\\]/g, '\\$&');
      // eslint-disable-next-line no-restricted-syntax -- entity_unaccent já normalizada; entity_id é uuid::text sem acentos
      query = query.or(`entity_unaccent.ilike.%${term}%,entity_id::text.ilike.%${term}%`);
    }

    // Cursor-based: fetch records older than cursor
    if (cursor) {
      query = query.or(`created_at.lt.${cursor.created_at},and(created_at.eq.${cursor.created_at},id.lt.${cursor.id})`);
    }

    return query;
  }, [supabase, logScope, dateFrom, dateTo, moduleFilter, actionFilter, search]);

  const fetchLogs = useCallback(async (cursor: CursorState | null, append: boolean) => {
    const request = ++requestRef.current;
    if (!canViewRbac || (logScope !== 'TENANT' && !canGlobal)) { setLogs([]); setLoading(false); return; }
    setLoading(true);
    const { data, error } = await buildQuery(cursor);
    if (request !== requestRef.current) return;
    if (error) { console.error(error); setLoading(false); return; }

    const all = (data || []) as unknown as AuditLog[];
    const hasNext = all.length > PAGE_SIZE;
    const pageData = hasNext ? all.slice(0, PAGE_SIZE) : all;

    setHasMore(hasNext);
    if (pageData.length > 0) {
      const last = pageData[pageData.length - 1];
      cursorRef.current = { created_at: last.created_at, id: last.id };
    }

    if (append) setLogs(prev => [...prev, ...pageData]);
    else setLogs(pageData);

    // Fetch profiles for new actor_user_ids
    const userIds = [...new Set(pageData.map(l => l.actor_user_id).filter(Boolean))] as string[];
    const missing = userIds.filter(id => !profiles[id]);
    if (missing.length > 0) {
      const { data: profs } = await supabase.rpc('list_profiles_minimal', { p_search: '', p_limit: 200 });
      if (request !== requestRef.current) return;
      if (profs) {
        const newProfiles = { ...profiles };
        const rows = profs as Array<{ id: string; nome?: string; email?: string }>;
        rows.filter(p => missing.includes(p.id)).forEach(p => { newProfiles[p.id] = p.nome || p.email || ''; });
        setProfiles(newProfiles);
      }
    }

    setLoading(false);
  }, [buildQuery, profiles, supabase, canViewRbac, canGlobal, logScope]);

  const resetAndFetch = useCallback(() => {
    cursorRef.current = null;
    fetchLogs(null, false);
  }, [fetchLogs]);

  useEffect(() => {
    setDetail(null);
    setLogs([]);
    setProfiles({});
    resetAndFetch();
    return invalidateRequest;
  }, [supabase, dateFrom, dateTo, moduleFilter, actionFilter, logScope, canViewRbac, canGlobal, invalidateRequest]);

  const handleSearch = () => resetAndFetch();
  const loadMore = () => { if (hasMore && !loading) fetchLogs(cursorRef.current, true); };

  const exportCSV = () => {
    const headers = ['Data', 'Módulo', 'Ação', 'Entidade', 'ID', 'Usuário', 'Source', 'Sucesso', 'Procedência'];
    const rows = logs.map(l => [
      format(new Date(l.created_at), 'dd/MM/yyyy HH:mm:ss'),
      l.module, l.action, l.entity, l.entity_id || '',
      profiles[l.actor_user_id || ''] || l.actor_user_id || 'Sistema',
      l.source, l.success ? 'Sim' : 'Não',
      l.scope_reason === 'legacy_resource_correlated' ? 'Histórico: autoria não verificada' : l.scope_reason,
    ]);
    const csv = [headers, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `audit_trail_${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
  };


  if (!canViewRbac) return null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-display font-bold text-foreground flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-primary" /> Auditoria do Sistema
          </h2>
          <p className="text-xs text-muted-foreground">{logScope === 'TENANT' ? 'Auditoria da unidade' : logScope === 'GLOBAL' ? 'Eventos globais' : 'Histórico sem atribuição comprovada'} — {logs.length} registros</p>
        </div>
        <Button onClick={exportCSV} size="sm" variant="outline" className="gap-1.5 text-xs">
          <Download className="w-3.5 h-3.5" /> CSV
        </Button>
      </div>

      {canGlobal && <SearchableSelect value={logScope} onValueChange={setLogScope} options={[
        { value: 'TENANT', label: 'Unidade atual' }, { value: 'GLOBAL', label: 'Eventos globais' },
        { value: 'AMBIGUOUS', label: 'Histórico ambíguo (restrito)' },
      ]} placeholder="Escopo da auditoria" />}
      {/* Filters */}
      {logScope === 'TENANT' && <Card>
        <CardContent className="pt-4">
          <div className="flex items-center gap-1.5 mb-3">
            <Filter className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-semibold text-foreground">Filtros</span>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <div>
              <Label className="text-[10px] text-muted-foreground">De</Label>
              <DateInput value={dateFrom} onValueChange={setDateFrom} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Até</Label>
              <DateInput value={dateTo} onValueChange={setDateTo} className="h-8 text-xs" />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Módulo</Label>
              <SearchableSelect
                value={moduleFilter}
                onValueChange={setModuleFilter}
                options={MODULES.map(m => ({ value: m.value, label: m.label }))}
                placeholder="Todos"
                searchPlaceholder="Buscar módulo..."
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Ação</Label>
              <SearchableSelect
                value={actionFilter}
                onValueChange={setActionFilter}
                options={ACTIONS.map(a => ({ value: a.value, label: a.label }))}
                placeholder="Todas"
                searchPlaceholder="Buscar ação..."
                className="h-8 text-xs"
              />
            </div>
            <div>
              <Label className="text-[10px] text-muted-foreground">Busca</Label>
              <div className="flex gap-1">
                <Input value={search} onChange={e => setSearch(e.target.value)} placeholder="entidade/id..." className="h-8 text-xs" onKeyDown={e => e.key === 'Enter' && handleSearch()} />
                <Button size="icon" variant="outline" className="h-8 w-8 shrink-0" onClick={handleSearch}>
                  <Search className="w-3.5 h-3.5" />
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>}

      {/* Table */}
      <Card>
        <CardContent className="pt-4 px-0">
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-12">
              <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">Nenhum registro encontrado</div>
          ) : (
            <>
              <ScrollArea className="max-h-[60vh]">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-[10px] w-[130px]">Data</TableHead>
                      <TableHead className="text-[10px]">Módulo</TableHead>
                      <TableHead className="text-[10px]">Ação</TableHead>
                      <TableHead className="text-[10px]">Entidade</TableHead>
                      <TableHead className="text-[10px]">Usuário</TableHead>
                      <TableHead className="text-[10px]">Source</TableHead>
                      <TableHead className="text-[10px] w-10"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map(log => (
                      <TableRow key={log.id} className="cursor-pointer" onClick={() => setDetail(log)}>
                        <TableCell className="text-[11px] text-muted-foreground font-mono">
                          {format(new Date(log.created_at), 'dd/MM/yyyy HH:mm:ss')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="text-[9px] font-normal">{log.module}</Badge>
                        </TableCell>
                        <TableCell>
                          <span className={cn('text-[10px] font-medium px-1.5 py-0.5 rounded', ACTION_COLORS[log.action] || 'bg-muted text-muted-foreground')}>
                            {log.action}
                          </span>
                        </TableCell>
                        <TableCell className="text-[11px]">
                          <span className="text-foreground">{log.entity}</span>
                          {log.entity_id && (
                            <span className="text-muted-foreground ml-1 font-mono text-[9px]">
                              {log.entity_id.slice(0, 8)}…
                            </span>
                          )}
                        </TableCell>
                        <TableCell className="text-[11px] text-muted-foreground">
                          {profiles[log.actor_user_id || ''] || (log.actor_user_id ? log.actor_user_id.slice(0, 8) + '…' : 'Sistema')}
                        </TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-[9px]">{log.source}</Badge>
                          {log.scope_reason === 'legacy_resource_correlated' && <span className="block text-[9px] text-muted-foreground">Histórico não verificado</span>}
                        </TableCell>
                        <TableCell>
                          <Eye className="w-3.5 h-3.5 text-muted-foreground" />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </ScrollArea>
              {hasMore && (
                <div className="flex justify-center pt-3 px-4">
                  <Button variant="outline" size="sm" className="gap-1.5 text-xs" onClick={loadMore} disabled={loading}>
                    <ChevronDown className="w-3.5 h-3.5" /> Carregar mais
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Detail Modal */}
      <Dialog open={!!detail} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-sm">
              <ShieldCheck className="w-4 h-4 text-primary" /> Detalhes do Log
            </DialogTitle>
          </DialogHeader>
          {detail && (
            <div className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <InfoRow label="Data" value={format(new Date(detail.created_at), 'dd/MM/yyyy HH:mm:ss')} />
                <InfoRow label="Módulo" value={detail.module} />
                <InfoRow label="Ação" value={detail.action} />
                <InfoRow label="Entidade" value={detail.entity} />
                <InfoRow label="ID" value={detail.entity_id || '—'} mono />
                <InfoRow label="Usuário" value={profiles[detail.actor_user_id || ''] || detail.actor_user_id || 'Sistema'} />
                <InfoRow label="Source" value={detail.source} />
                <InfoRow label="Escopo" value={detail.log_scope} />
                <InfoRow label="Evidência de atribuição" value={detail.scope_reason} />
                <InfoRow label="Sucesso" value={detail.success ? '✅ Sim' : '❌ Não'} />
              </div>

              {detail.before && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Before</p>
                  <pre className="bg-muted rounded-lg p-3 text-[10px] font-mono overflow-x-auto max-h-40 text-foreground">
                    {JSON.stringify(detail.before, null, 2)}
                  </pre>
                </div>
              )}
              {detail.after && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">After</p>
                  <pre className="bg-muted rounded-lg p-3 text-[10px] font-mono overflow-x-auto max-h-40 text-foreground">
                    {JSON.stringify(detail.after, null, 2)}
                  </pre>
                </div>
              )}
              {detail.metadata && (
                <div>
                  <p className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Metadata</p>
                  <pre className="bg-muted rounded-lg p-3 text-[10px] font-mono overflow-x-auto max-h-40 text-foreground">
                    {JSON.stringify(detail.metadata, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className={cn('text-foreground font-medium', mono && 'font-mono text-[10px]')}>{value}</p>
    </div>
  );
}

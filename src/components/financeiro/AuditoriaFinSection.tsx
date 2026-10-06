import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useState, useEffect, useCallback, useRef, useId, type MouseEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import StatusBadge from '@/components/ui/StatusBadge';
import KpiCard from '@/components/ui/KpiCard';
import EmptyState from '@/components/ui/EmptyState';
import ErrorState from '@/components/ui/ErrorState';
import AccessDenied from '@/components/ui/AccessDenied';
import { kpiGridClassFor, longestValueLength } from '@/components/ui/kpiGrid';
import { useScopedToast } from '@/hooks/useScopedToast';
import { parseUTCToBR, formatIntegerBR } from '@/lib/formatters';
import { RefreshCw, Shield, Search, FileDown, ChevronDown, ChevronRight, Plus, Pencil, Trash2, Users, Activity } from 'lucide-react';
import { useCan } from '@/permissions/hooks';
import { useDataEvent } from '@/lib/dataEvents';
import * as XLSX from '@/lib/safeXlsx';
import { cn } from '@/lib/utils';
import { FinKpiGrid, FinScreenHeader, FinSectionGroup } from './finV2Layout';
import { ListaCarregando, ResumoCarregando } from './ContasParts';
import { useConteinerEstreito } from './useConteinerEstreito';

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
  'fin_lancamento_rateios',
];

const ACOES = ['todos', 'INSERT', 'UPDATE', 'DELETE', 'APPROVE', 'REJECT', 'CANCEL'];

// Mesmas cores de antes (inserção verde, alteração âmbar, exclusão/recusa vermelha, aprovação azul,
// cancelamento neutro), agora por token, sem opacidade.
const ACAO_STATUS: Record<string, string> = {
  INSERT: 'success',
  UPDATE: 'warning',
  DELETE: 'danger',
  APPROVE: 'info',
  REJECT: 'danger',
  CANCEL: 'neutral',
};

/** Abaixo desta largura do contêiner a tabela de 7 colunas vira lista (uma só marcação, D45). */
const LIMITE_LISTA_PX = 900;

/* ─── Diff helper ─── */
function ValorDoCampo({ valor, tom }: { valor: unknown; tom: 'antes' | 'depois' }) {
  const cor = tom === 'antes' ? 'text-destructive' : 'text-success';
  // Objeto/lista (rateio, metadados) em JSON indentado; o resto como antes (JSON compacto).
  if (valor !== null && typeof valor === 'object') {
    return <pre className={cn('m-0 whitespace-pre-wrap break-words font-mono text-xs', cor)}>{JSON.stringify(valor, null, 2)}</pre>;
  }
  return <span className={cn('break-all font-mono text-xs', cor)}>{JSON.stringify(valor ?? null)}</span>;
}

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

  // Campo · Antes · Depois em colunas só quando o próprio painel é largo; no celular cada campo
  // empilha "Antes" e "Depois" com rótulo (antes: duas colunas fixas ilegíveis).
  return (
    <div className="max-h-80 overflow-auto rounded-md border bg-card [container-type:inline-size]">
      <div aria-hidden="true" className="hidden border-b bg-muted px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground [@container(min-width:40rem)]:grid [@container(min-width:40rem)]:grid-cols-[minmax(7rem,11rem)_1fr_1fr] [@container(min-width:40rem)]:gap-3">
        <span>Campo</span><span>Antes</span><span>Depois</span>
      </div>
      <dl className="divide-y">
        {changedKeys.map(k => (
          <div key={k} className="grid gap-1.5 px-3 py-2 [@container(min-width:40rem)]:grid-cols-[minmax(7rem,11rem)_1fr_1fr] [@container(min-width:40rem)]:gap-3">
            <dt className="break-all text-xs font-medium text-foreground">{k}</dt>
            <dd className="m-0 min-w-0">
              <span className="mr-1 text-[11px] font-medium text-muted-foreground [@container(min-width:40rem)]:sr-only">Antes:</span>
              {antes ? <ValorDoCampo valor={antes[k]} tom="antes" /> : <span className="text-xs italic text-muted-foreground">—</span>}
            </dd>
            <dd className="m-0 min-w-0">
              <span className="mr-1 text-[11px] font-medium text-muted-foreground [@container(min-width:40rem)]:sr-only">Depois:</span>
              {depois ? <ValorDoCampo valor={depois[k]} tom="depois" /> : <span className="text-xs italic text-muted-foreground">—</span>}
            </dd>
          </div>
        ))}
      </dl>
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
  const toast = useScopedToast();
  const supabase = useSupabase();
  const canView = useCan('financeiro:auditoria:view');
  const canExport = useCan('financeiro:auditoria:export');
  const buscaId = useId();
  const entidadeId = useId();
  const acaoId = useId();
  const diasId = useId();
  const detalheId = useId();
  const [listaRef, listaEstreita] = useConteinerEstreito(LIMITE_LISTA_PX);

  const [items, setItems] = useState<AuditoriaFinItem[]>([]);
  const [summary, setSummary] = useState<AuditSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [errorState, setErrorState] = useState(false);
  // Estado só de apresentação: falha ao carregar a página seguinte (a lista já carregada fica) e os
  // filtros com que o resumo foi contado no servidor.
  const [erroMais, setErroMais] = useState(false);
  const [filtrosDoResumo, setFiltrosDoResumo] = useState<{ dias: number; entidade: string; acao: string } | null>(null);
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
      setErroMais(false);
    } else {
      if (loading && items.length > 0) return;
      setLoading(true);
      setErrorState(false);
      setErroMais(false);
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
        if (append) setErroMais(true); else setErrorState(true);
        return;
      }

      const result = data as unknown as RPCResult;
      const newItems = result.items || [];

      if (append) {
        setItems(prev => [...prev, ...newItems]);
      } else {
        setItems(newItems);
        setSummary(result.summary);
        setFiltrosDoResumo({ dias, entidade: filtroEntidade, acao: filtroAcao });
      }

      setHasMore(result.has_more);
      setCursorCreatedAt(result.next_cursor_created_at);
      setCursorId(result.next_cursor_id);
    } catch (err) {
      console.error(err);
      toast.error('Erro ao carregar auditoria');
      if (append) setErroMais(true); else setErrorState(true);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [canView, loadingMore, loading, items.length, filtroEntidade, filtroAcao, busca, dias, cursorCreatedAt, cursorId, supabase, toast]);

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

  if (!canView) return <AccessDenied description="Você não tem permissão para visualizar a auditoria financeira." />;

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

  const recarregar = () => { setCursorCreatedAt(null); setCursorId(null); setItems([]); };

  // ── Apresentação (Redesign V2, Fase 06A) ──
  const primeiraCarga = loading && items.length === 0;
  const valoresResumo = summary ? [summary.total, summary.inserts, summary.updates, summary.deletes, summary.usuarios_ativos].map(n => formatIntegerBR(n)) : [];
  const resumoGrid = kpiGridClassFor(longestValueLength(valoresResumo), 3);
  const nomeEntidade = (e: string) => (e === 'todos' ? 'todas as entidades' : e.replace('fin_', ''));
  const legendaResumo = filtrosDoResumo
    ? `Últimos ${filtrosDoResumo.dias} dias · ${nomeEntidade(filtrosDoResumo.entidade)} · ${filtrosDoResumo.acao === 'todos' ? 'todas as ações' : filtrosDoResumo.acao}`
    : undefined;

  const acaoBadge = (acao: string) => <StatusBadge status={ACAO_STATUS[acao] ?? 'neutral'} label={acao} size="md" />;
  const entidade = (log: AuditoriaFinItem) => (log.entidade || '').replace('fin_', '');
  const registro = (log: AuditoriaFinItem) => {
    const route = entidadeToRoute(log.entidade, log.entidade_id);
    if (route) {
      return (
        <a href={route} className="font-mono text-xs text-primary underline-offset-2 hover:underline" title={log.entidade_id || ''} aria-label={`Registro ${log.entidade_id}`}>
          {(log.entidade_id || '').slice(0, 8)}…
        </a>
      );
    }
    if (log.entidade_id) return <span className="font-mono text-xs text-muted-foreground" title={log.entidade_id}>{log.entidade_id.slice(0, 8)}…</span>;
    return <span className="text-xs text-muted-foreground">—</span>;
  };
  const usuario = (log: AuditoriaFinItem) => (
    <>
      <span className="block break-words text-sm text-foreground">{log.user_nome || log.user_email || '—'}</span>
      {log.user_nome && log.user_email && <span className="block break-all text-xs text-muted-foreground">{log.user_email}</span>}
    </>
  );
  const detalhe = (log: AuditoriaFinItem) => (
    <div id={`${detalheId}-${log.id}`} className="space-y-3">
      <dl className="grid gap-x-6 gap-y-2 text-xs sm:grid-cols-2">
        <div className="min-w-0">
          <dt className="font-medium text-muted-foreground">Registro</dt>
          <dd className="break-all font-mono text-foreground">{log.entidade_id || '—'}</dd>
        </div>
        {log.origem_log === 'audit_logs' && (
          <div>
            <dt className="font-medium text-muted-foreground">Origem</dt>
            <dd className="text-foreground">Log global</dd>
          </div>
        )}
        {log.justificativa && (
          <div className="min-w-0 sm:col-span-2">
            <dt className="font-medium text-muted-foreground">Justificativa</dt>
            <dd className="break-words text-foreground">{log.justificativa}</dd>
          </div>
        )}
      </dl>
      <DiffView antes={log.antes} depois={log.depois} />
    </div>
  );
  const rotuloDetalhe = (log: AuditoriaFinItem, aberto: boolean) =>
    `${aberto ? 'Ocultar' : 'Ver'} detalhes: ${log.acao} em ${entidade(log)}, ${parseUTCToBR(log.created_at)}`;
  // Clique na linha continua abrindo o detalhe, sem disputar com o link do registro e com o botão.
  const cliqueNaLinha = (id: string) => (e: MouseEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('a,button')) return;
    toggleExpand(id);
  };

  return (
    <div className="space-y-6">
      <FinScreenHeader
        title="Auditoria Financeira"
        description="Criações, alterações, aprovações e exclusões registradas no Financeiro"
        actions={(
          <>
            {canExport && (
              <>
                <Button variant="outline" size="sm" onClick={exportPdf} disabled={exportingPdf || items.length === 0}>
                  <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> PDF
                </Button>
                <Button variant="outline" size="sm" onClick={exportExcel} disabled={exportingExcel || items.length === 0}>
                  <FileDown aria-hidden="true" className="w-4 h-4 mr-1" /> Excel
                </Button>
              </>
            )}
            <Button variant="outline" size="sm" onClick={recarregar} disabled={loading}>
              <RefreshCw aria-hidden="true" className={`w-4 h-4 mr-1 ${loading ? 'animate-spin' : ''}`} /> Atualizar
            </Button>
          </>
        )}
      />

      {/* Filters */}
      <div className="grid gap-3 rounded-summary border bg-card p-4 shadow-card sm:grid-cols-2 lg:grid-cols-[minmax(12rem,1fr)_auto_auto_auto]">
        <div className="flex min-w-0 flex-col gap-1.5 sm:col-span-2 lg:col-span-1">
          <Label htmlFor={buscaId} className="text-xs text-muted-foreground">Buscar</Label>
          <div className="relative">
            <Search aria-hidden="true" className="w-4 h-4 absolute left-2.5 top-2.5 text-muted-foreground" />
            <Input id={buscaId} placeholder="Entidade, ação, justificativa, usuário ou registro" value={busca} onChange={e => setBusca(e.target.value)} className="h-9 pl-8" />
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={entidadeId} className="text-xs text-muted-foreground">Entidade</Label>
          <Select value={filtroEntidade} onValueChange={setFiltroEntidade}>
            <SelectTrigger id={entidadeId} className="h-9 w-full lg:w-48"><SelectValue placeholder="Entidade" /></SelectTrigger>
            <SelectContent>{ENTIDADES.map(e => <SelectItem key={e} value={e}>{e === 'todos' ? 'Todas entidades' : e.replace('fin_', '')}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={acaoId} className="text-xs text-muted-foreground">Ação</Label>
          <Select value={filtroAcao} onValueChange={setFiltroAcao}>
            <SelectTrigger id={acaoId} className="h-9 w-full lg:w-36"><SelectValue placeholder="Ação" /></SelectTrigger>
            <SelectContent>{ACOES.map(a => <SelectItem key={a} value={a}>{a === 'todos' ? 'Todas ações' : a}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="flex min-w-0 flex-col gap-1.5">
          <Label htmlFor={diasId} className="text-xs text-muted-foreground">Período</Label>
          <Select value={String(dias)} onValueChange={v => setDias(Number(v))}>
            <SelectTrigger id={diasId} className="h-9 w-full lg:w-40"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Últimos 7 dias</SelectItem>
              <SelectItem value="30">Últimos 30 dias</SelectItem>
              <SelectItem value="90">Últimos 90 dias</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Content */}
      {errorState && !loading ? (
        <ErrorState
          title="Erro ao carregar auditoria"
          description="Nenhum evento foi exibido. Tente novamente."
          onRetry={recarregar}
        />
      ) : primeiraCarga ? (
        <>
          <FinSectionGroup id="aud-resumo" title="Resumo do período" caption="Carregando…">
            <ResumoCarregando cards={5} className={resumoGrid} />
          </FinSectionGroup>
          <FinSectionGroup id="aud-eventos" title="Eventos">
            <div ref={listaRef}><ListaCarregando estreito={listaEstreita} texto="Carregando eventos de auditoria…" /></div>
          </FinSectionGroup>
        </>
      ) : (
        <>
          {summary && (
            <FinSectionGroup
              id="aud-resumo"
              title="Resumo do período"
              caption={legendaResumo}
            >
              <FinKpiGrid className={resumoGrid}>
                <KpiCard appearance="summary" icon={Activity} label="Total" value={valoresResumo[0]} sub="Eventos com os filtros de entidade e ação" />
                <KpiCard appearance="summary" icon={Plus} variant="success" label="Inserções" value={valoresResumo[1]} sub="Ação INSERT" />
                <KpiCard appearance="summary" icon={Pencil} variant="warning" label="Alterações" value={valoresResumo[2]} sub="Ação UPDATE" />
                <KpiCard appearance="summary" icon={Trash2} variant="danger" label="Exclusões" value={valoresResumo[3]} sub="Ação DELETE" />
                <KpiCard appearance="summary" icon={Users} variant="primary" label="Usuários" value={valoresResumo[4]} sub="Distintos, com evento no período" />
              </FinKpiGrid>
              <p className="text-xs text-muted-foreground">
                Contagem do servidor sobre todo o período, com os filtros de entidade e ação; a busca não altera estas contagens.
              </p>
            </FinSectionGroup>
          )}

          <FinSectionGroup
            id="aud-eventos"
            title="Eventos"
            caption={items.length > 0
              ? `${formatIntegerBR(items.length)} carregado(s), do mais recente ao mais antigo${hasMore ? ' · há mais eventos para carregar' : ''}`
              : undefined}
          >
            <div ref={listaRef}>
              {items.length === 0 ? (
                <EmptyState
                  icon={Shield}
                  title="Nenhum log de auditoria encontrado"
                  description="Os logs são gerados automaticamente ao criar, editar ou aprovar registros financeiros."
                />
              ) : listaEstreita ? (
                <ul aria-label="Eventos de auditoria" className="divide-y rounded-summary border bg-card shadow-card">
                  {items.map(log => {
                    const aberto = expandedIds.has(log.id);
                    return (
                      <li key={log.id} className="px-4 py-3">
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="break-words text-sm font-medium text-foreground">{entidade(log)}</p>
                            <p className="text-xs tabular-nums text-muted-foreground">{parseUTCToBR(log.created_at)}</p>
                          </div>
                          {acaoBadge(log.acao)}
                        </div>
                        <div className="mt-2 text-xs">{usuario(log)}</div>
                        {log.justificativa && <p className="mt-1 line-clamp-2 break-words text-xs text-muted-foreground">{log.justificativa}</p>}
                        <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                          {registro(log)}
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            aria-expanded={aberto}
                            aria-controls={aberto ? `${detalheId}-${log.id}` : undefined}
                            aria-label={rotuloDetalhe(log, aberto)}
                            onClick={() => toggleExpand(log.id)}
                          >
                            {aberto ? <ChevronDown aria-hidden="true" className="w-4 h-4 mr-1" /> : <ChevronRight aria-hidden="true" className="w-4 h-4 mr-1" />}
                            {aberto ? 'Ocultar detalhes' : 'Ver detalhes'}
                          </Button>
                        </div>
                        {aberto && <div className="mt-3 rounded-md bg-muted p-3">{detalhe(log)}</div>}
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <div className="overflow-hidden rounded-summary border bg-card shadow-card">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"><span className="sr-only">Detalhes</span></TableHead>
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
                        const aberto = expandedIds.has(log.id);
                        return [
                          <TableRow key={log.id} className="cursor-pointer" onClick={cliqueNaLinha(log.id)}>
                            <TableCell className="w-10 py-2">
                              <button
                                type="button"
                                aria-expanded={aberto}
                                aria-controls={aberto ? `${detalheId}-${log.id}` : undefined}
                                aria-label={rotuloDetalhe(log, aberto)}
                                onClick={() => toggleExpand(log.id)}
                                className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                              >
                                {aberto ? <ChevronDown aria-hidden="true" className="w-4 h-4" /> : <ChevronRight aria-hidden="true" className="w-4 h-4" />}
                              </button>
                            </TableCell>
                            <TableCell className="whitespace-nowrap font-mono text-xs">{parseUTCToBR(log.created_at)}</TableCell>
                            <TableCell>{acaoBadge(log.acao)}</TableCell>
                            <TableCell className="text-sm">{entidade(log)}</TableCell>
                            <TableCell>{registro(log)}</TableCell>
                            <TableCell className="min-w-[160px]">{usuario(log)}</TableCell>
                            <TableCell className="max-w-[240px] truncate text-sm text-muted-foreground">{log.justificativa || '—'}</TableCell>
                          </TableRow>,
                          aberto && (
                            <TableRow key={`${log.id}-detalhe`} className="bg-muted hover:bg-muted">
                              <TableCell colSpan={7} className="p-4">{detalhe(log)}</TableCell>
                            </TableRow>
                          ),
                        ];
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}

              {erroMais && (
                <ErrorState
                  compact
                  className="mt-3"
                  title="Não foi possível carregar mais eventos"
                  description="Os eventos acima continuam válidos. Tente de novo."
                  onRetry={() => { void load(true); }}
                  retrying={loadingMore}
                />
              )}

              {hasMore && !erroMais && (
                <div className="mt-3 text-center">
                  <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loadingMore}>
                    {loadingMore ? <RefreshCw aria-hidden="true" className="w-4 h-4 mr-1 animate-spin" /> : null}
                    Carregar mais
                  </Button>
                  <p className="mt-1 text-xs text-muted-foreground">Próximos {PAGE_SIZE} eventos, do mais recente ao mais antigo</p>
                </div>
              )}
            </div>
          </FinSectionGroup>
        </>
      )}
    </div>
  );
}

import { useSupabase } from '@/contexts/CompanyScopeContext';
import { useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  ClipboardList,
  Download,
  FileCheck2,
  FileText,
  History,
  Loader2,
  MonitorPlay,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  ShieldCheck,
  XCircle,
} from 'lucide-react';
import { useScopedToast } from '@/hooks/useScopedToast';
import { useScopeActivity } from '@/hooks/useScopeActivity';
import {
  addCalendarDays,
  buildPresentationMeetingFollowUp,
  buildPresentationMeetingSnapshot,
  comparePresentationMeetingRevisions,
  parsePresentationMinutesExport,
  PRESENTATION_MINUTES_EXPORT_VERSION,
  type NormalizedDateRange,
  type PresentationComparisonMode,
  type PresentationMeetingDraft,
  type PresentationMeetingStatus,
  type PresentationPlanData,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import {
  PresentationMeetingMutationError,
  fetchPresentationMinutesExport,
  usePresentationMeetingDetail,
  usePresentationMeetingMutations,
  usePresentationMeetings,
  usePresentationPreviousMeetingDetail,
} from '@/hooks/usePresentationMeetings';
import {
  usePresentationDecisions,
  usePresentationResponsibleProfiles,
} from '@/hooks/usePresentationDecisions';
import {
  readPresentationDecisionUrlState,
  readPresentationMeetingUrlState,
  writePresentationDecisionUrlState,
  writePresentationMeetingUrlState,
} from '@/lib/presentationDetailNavigation';
import { todayBR } from '@/lib/formatters';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { DateInput } from '@/components/ui/DateInput';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import PresentationMeetingEditorDialog from './PresentationMeetingEditorDialog';

const STATUS_LABELS: Record<PresentationMeetingStatus, string> = {
  DRAFT: 'Rascunho',
  IN_PROGRESS: 'Em andamento',
  IN_REVIEW: 'Em revisão',
  APPROVED: 'Aprovada',
  CANCELLED: 'Cancelada',
};

const EVENT_LABELS: Record<string, string> = {
  SESSION_CREATED: 'Sessão preparada',
  SESSION_UPDATED: 'Pauta ou dados da sessão atualizados',
  SESSION_STARTED: 'Reunião iniciada e snapshot congelado',
  MINUTES_SUBMITTED: 'Ata enviada para revisão',
  MINUTES_APPROVED: 'Ata aprovada',
  MINUTES_RETURNED: 'Ata devolvida para correção',
  SESSION_REOPENED: 'Sessão reaberta',
  SESSION_CANCELLED: 'Sessão cancelada',
};

type TransitionKind = 'start' | 'submit' | 'approve' | 'return' | 'cancel' | 'reopen';

function formatDate(value: string | null): string {
  if (!value) return 'Não informado';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleDateString('pt-BR');
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : parsed.toLocaleString('pt-BR');
}

function statusVariant(status: PresentationMeetingStatus) {
  if (status === 'APPROVED') return 'success' as const;
  if (status === 'CANCELLED') return 'destructive' as const;
  if (status === 'IN_PROGRESS') return 'info' as const;
  if (status === 'IN_REVIEW') return 'warning' as const;
  return 'outline' as const;
}

function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = 'none';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function safeFilename(title: string, extension: 'pdf' | 'pptx'): string {
  const normalized = title.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').toLowerCase();
  return `ata-executiva-${normalized || 'sessao'}.${extension}`;
}

function mutationMessage(error: unknown): string {
  if (!(error instanceof PresentationMeetingMutationError)) return 'Não foi possível concluir a operação.';
  const messages: Record<string, string> = {
    OPTIMISTIC_LOCK_CONFLICT: 'A sessão mudou em outra tela. Recarregue ou reaplique sua edição conscientemente.',
    PERMISSION_DENIED: 'Sua permissão não permite esta operação.',
    PARTICIPANT_OUT_OF_TENANT: 'Um participante não pertence mais à empresa atual.',
    RESPONSIBLE_OUT_OF_TENANT: 'O responsável pela ata não pertence mais à empresa atual.',
    REFERENCE_OUT_OF_TENANT_OR_PERIOD: 'Uma referência não pertence à empresa ou não é compatível com o período.',
    SNAPSHOT_REFERENCE_MISSING: 'A pauta e as referências do snapshot ficaram divergentes. Recarregue a sessão.',
    TRANSITION_INVALID: 'Esta transição não é permitida no estado atual.',
    STATUS_INVALID: 'O estado da sessão mudou. Recarregue antes de continuar.',
  };
  return messages[error.code] ?? error.message;
}

export default function PresentationMeetingGovernance({
  companyId,
  userId,
  period,
  granularity,
  comparisonMode,
  rankingLimit,
  plan,
  canManage,
  canApprove,
  canExport,
}: {
  companyId: string;
  userId: string;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  comparisonMode: PresentationComparisonMode;
  rankingLimit: number;
  plan: PresentationPlanData;
  canManage: boolean;
  canApprove: boolean;
  canExport: boolean;
}) {
  const toast = useScopedToast();
  const isScopeActive = useScopeActivity();
  const supabase = useSupabase();
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlState = readPresentationMeetingUrlState(searchParams);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingExisting, setEditingExisting] = useState(false);
  const [meetingModeOpen, setMeetingModeOpen] = useState(false);
  const [transition, setTransition] = useState<TransitionKind | null>(null);
  const [justification, setJustification] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);
  const [conflictDraft, setConflictDraft] = useState<PresentationMeetingDraft | null>(null);
  const [exporting, setExporting] = useState<'pdf' | 'pptx' | null>(null);

  const profilesQuery = usePresentationResponsibleProfiles(companyId, true);
  const decisionsQuery = usePresentationDecisions(companyId, {
    period,
    dueFilter: 'all',
    search: '',
    page: 1,
    pageSize: 50,
  }, true);
  const listQuery = usePresentationMeetings(companyId, {
    period,
    status: urlState.status,
    responsibleUserId: urlState.responsibleUserId,
    participantUserId: urlState.participantUserId,
    search: urlState.search,
    page: urlState.page,
  }, true);
  const detailQuery = usePresentationMeetingDetail(companyId, urlState.sessionId, true);
  const previousQuery = usePresentationPreviousMeetingDetail(
    companyId,
    detailQuery.data?.session.previousSessionId ?? undefined,
    Boolean(detailQuery.data?.session.previousSessionId),
  );
  const mutations = usePresentationMeetingMutations(companyId);
  const detail = detailQuery.data;
  const profiles = profilesQuery.data ?? [];
  const sessions = listQuery.data?.items ?? [];
  const decisions = decisionsQuery.data?.items ?? [];
  const currentRevision = detail?.revisions.find(revision => revision.id === (urlState.revisionId ?? detail.session.currentRevisionId)) ?? null;
  const previousRevision = previousQuery.data?.revisions.find(revision => revision.id === previousQuery.data?.session.currentRevisionId)
    ?? previousQuery.data?.revisions.find(revision => revision.state === 'APPROVED')
    ?? null;
  const comparison = detail ? comparePresentationMeetingRevisions({
    previousSessionId: detail.session.previousSessionId,
    previous: previousRevision,
    current: currentRevision,
  }) : { state: 'no-previous-session' as const };
  const dueWindowEnd = urlState.followUpDueEnd ?? addCalendarDays(todayBR(), 30);
  const followUp = detail ? buildPresentationMeetingFollowUp({ detail, dueWindowEnd, today: todayBR() }) : null;
  const selectedAgendaIndex = detail
    ? Math.max(0, detail.agendaItems.findIndex(item => item.id === urlState.agendaItemId))
    : 0;
  const selectedAgendaItem = detail?.agendaItems[selectedAgendaIndex];
  const staleReferences = detail?.agendaItems.filter(item => {
    if (!item.referenceId || item.referenceVersion === null) return false;
    const current = detail.canonicalReferences.find(reference => reference.id === item.referenceId);
    return Boolean(current && (current.version !== item.referenceVersion || current.status !== item.referenceStatus));
  }) ?? [];

  const setUrlState = (patch: Partial<typeof urlState>) => {
    if (!isScopeActive()) return;
    const next = writePresentationMeetingUrlState(searchParams, { ...urlState, ...patch });
    navigate(`${location.pathname}?${next.toString()}`, { replace: true });
  };

  const selectSession = (sessionId?: string) => setUrlState({
    sessionId,
    agendaItemId: undefined,
    revisionId: undefined,
  });

  const handleSave = async (draft: PresentationMeetingDraft): Promise<boolean> => {
    try {
      if (editingExisting && detail) {
        await mutations.saveSession.mutateAsync({
          sessionId: detail.session.id,
          draft,
          expectedStatus: detail.session.status as 'DRAFT' | 'IN_PROGRESS',
          expectedUpdatedAt: detail.session.updatedAt,
        });
        toast.success('Sessão atualizada com trilha auditável.');
      } else {
        const created = await mutations.createSession.mutateAsync({ period, granularity, draft });
        selectSession(created.id);
        toast.success('Sessão executiva preparada.');
      }
      setConflict(null);
      setConflictDraft(null);
      return true;
    } catch (error) {
      console.error('Erro ao salvar sessão executiva:', error);
      const message = mutationMessage(error);
      if (error instanceof PresentationMeetingMutationError && error.code === 'OPTIMISTIC_LOCK_CONFLICT') {
        setConflict(message);
        setConflictDraft(draft);
      } else toast.error(message);
      return false;
    }
  };

  const reapplyConflict = async () => {
    if (!detail || !conflictDraft) return;
    const refreshed = await detailQuery.refetch();
    if (!refreshed.data || !['DRAFT', 'IN_PROGRESS'].includes(refreshed.data.session.status)) {
      toast.error('A sessão não está mais editável. A edição local permanece no formulário.');
      return;
    }
    try {
      await mutations.saveSession.mutateAsync({
        sessionId: refreshed.data.session.id,
        draft: conflictDraft,
        expectedStatus: refreshed.data.session.status as 'DRAFT' | 'IN_PROGRESS',
        expectedUpdatedAt: refreshed.data.session.updatedAt,
      });
      setConflict(null);
      setConflictDraft(null);
      setEditorOpen(false);
      toast.success('Edição local reaplicada sobre a versão recarregada.');
    } catch (error) {
      console.error('Erro ao reaplicar edição da ata:', error);
      setConflict(mutationMessage(error));
    }
  };

  const confirmTransition = async () => {
    if (!detail || !transition) return;
    try {
      if (transition === 'start') {
        const snapshot = buildPresentationMeetingSnapshot({
          plan,
          period,
          granularity,
          comparisonMode,
          rankingLimit,
          canonicalReferences: detail.canonicalReferences,
        });
        await mutations.startSession.mutateAsync({
          sessionId: detail.session.id,
          snapshot,
          expectedUpdatedAt: detail.session.updatedAt,
        });
        toast.success('Reunião iniciada; o snapshot foi congelado.');
      } else if (transition === 'submit') {
        await mutations.submitMinutes.mutateAsync({
          sessionId: detail.session.id,
          revisionReason: justification,
          expectedUpdatedAt: detail.session.updatedAt,
        });
        toast.success('Ata enviada para revisão em nova versão imutável.');
      } else {
        const targetStatus = transition === 'approve'
          ? 'APPROVED'
          : transition === 'return'
            ? 'IN_PROGRESS'
            : transition === 'cancel'
              ? 'CANCELLED'
              : detail.session.snapshot ? 'IN_PROGRESS' : 'DRAFT';
        await mutations.transitionSession.mutateAsync({
          sessionId: detail.session.id,
          expectedStatus: detail.session.status,
          targetStatus,
          justification,
          expectedUpdatedAt: detail.session.updatedAt,
        });
        toast.success(transition === 'approve' ? 'Ata aprovada.' : transition === 'return' ? 'Ata devolvida para correção.' : transition === 'cancel' ? 'Sessão cancelada.' : 'Sessão reaberta.');
      }
      setTransition(null);
      setJustification('');
    } catch (error) {
      console.error('Erro na transição da sessão:', error);
      toast.error(mutationMessage(error));
    }
  };

  const openDecisionFlow = (decisionId?: string) => {
    const decisionState = readPresentationDecisionUrlState(searchParams);
    const next = writePresentationDecisionUrlState(searchParams, { ...decisionState, decisionId });
    navigate(`${location.pathname}?${next.toString()}`, { replace: true });
    window.requestAnimationFrame(() => document.getElementById('presentation-governance')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    if (!decisionId) toast.info('Use “Registrar decisão” no fluxo canônico abaixo; a ata não cria decisões por texto.');
  };

  const runExport = async (kind: 'pdf' | 'pptx') => {
    if (!detail || !followUp || !canExport || exporting) return;
    setExporting(kind);
    try {
      const exportDetail = await fetchPresentationMinutesExport(supabase, detail.session.id);
      const revision = exportDetail.revisions.find(item => item.id === (urlState.revisionId ?? exportDetail.session.currentRevisionId)) ?? null;
      const exportFollowUp = buildPresentationMeetingFollowUp({ detail: exportDetail, dueWindowEnd, today: todayBR() });
      const exportComparison = comparePresentationMeetingRevisions({
        previousSessionId: exportDetail.session.previousSessionId,
        previous: previousRevision,
        current: revision,
      });
      const payload = parsePresentationMinutesExport({
        contractVersion: PRESENTATION_MINUTES_EXPORT_VERSION,
        detail: exportDetail,
        revision,
        followUp: exportFollowUp,
        comparison: exportComparison,
        exportedAt: new Date().toISOString(),
        draftWatermark: exportDetail.session.status !== 'APPROVED' || revision?.state !== 'APPROVED',
      });
      if (kind === 'pdf') {
        const { createPresentationMinutesPdfBlob } = await import('@/lib/presentationMinutesPdfExport');
        const blob = await createPresentationMinutesPdfBlob(payload);
        if (isScopeActive()) downloadBlob(blob, safeFilename(detail.session.title, 'pdf'));
      } else {
        const { createPresentationMinutesPptxBlob } = await import('@/lib/presentationMinutesPptxExport');
        const blob = await createPresentationMinutesPptxBlob(payload);
        if (isScopeActive()) downloadBlob(blob, safeFilename(detail.session.title, 'pptx'));
      }
      toast.success(`${kind === 'pdf' ? 'PDF' : 'PowerPoint'} da ata gerado${payload.draftWatermark ? ' com marca RASCUNHO' : ''}.`);
    } catch (error) {
      console.error('Erro ao exportar ata executiva:', error);
      toast.error('Não foi possível exportar a ata.');
    } finally {
      setExporting(null);
    }
  };

  const profileOptions = profiles.map(profile => ({ value: profile.id, label: `${profile.nome} - ${profile.email}` }));
  const filteredFollowUpReferences = !followUp
    ? []
    : urlState.followUpFilter === 'overdue'
      ? followUp.overdueActions
      : urlState.followUpFilter === 'due-soon'
        ? followUp.dueSoonActions
        : urlState.followUpFilter === 'no-due-date'
          ? followUp.noDueDateActions
          : urlState.followUpFilter === 'no-priority'
            ? followUp.noPriorityActions
            : urlState.followUpFilter === 'changed'
              ? followUp.changedSinceSnapshot
              : detail?.canonicalReferences ?? [];

  return (
    <section id="presentation-meetings" aria-labelledby="presentation-meetings-title" className="scroll-mt-6 space-y-4">
      <Card>
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle id="presentation-meetings-title" className="flex items-center gap-2"><ClipboardList className="h-5 w-5 text-primary-ink" aria-hidden="true" /> Reuniões e atas</CardTitle>
            <CardDescription>Ritual executivo versionado. A ata registra evidência e referências, sem virar fonte financeira ou operacional.</CardDescription>
          </div>
          {canManage ? <Button type="button" onClick={() => { setEditingExisting(false); setConflict(null); setEditorOpen(true); }}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Preparar reunião</Button> : null}
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-5">
            <Input aria-label="Buscar sessão" placeholder="Buscar por título" value={urlState.search} onChange={event => setUrlState({ search: event.target.value, page: 1 })} />
            <Select value={urlState.status ?? 'all'} onValueChange={value => setUrlState({ status: value === 'all' ? undefined : value as PresentationMeetingStatus, page: 1 })}>
              <SelectTrigger aria-label="Filtrar estado da sessão"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="all">Todos os estados</SelectItem>{Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
            </Select>
            <SearchableSelect ariaLabel="Filtrar responsável pela ata" value={urlState.responsibleUserId ?? ''} options={profileOptions} placeholder="Todos os responsáveis" onValueChange={responsibleUserId => setUrlState({ responsibleUserId: responsibleUserId || undefined, page: 1 })} />
            <SearchableSelect ariaLabel="Filtrar participante" value={urlState.participantUserId ?? ''} options={profileOptions} placeholder="Todos os participantes" onValueChange={participantUserId => setUrlState({ participantUserId: participantUserId || undefined, page: 1 })} />
            <div className="flex items-center justify-end gap-2 text-sm text-muted-foreground">Página {urlState.page}</div>
          </div>

          {listQuery.isPending ? <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando sessões...</div> : null}
          {listQuery.error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Falha ao carregar sessões</AlertTitle><AlertDescription><Button type="button" size="sm" variant="outline" onClick={() => { void listQuery.refetch(); }}>Tentar novamente</Button></AlertDescription></Alert> : null}
          {!listQuery.isPending && sessions.length === 0 ? <p className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">Nenhuma sessão explícita encontrada neste período e filtro.</p> : null}
          <div className="grid gap-3 lg:grid-cols-2">
            {sessions.map(session => (
              <button key={session.id} type="button" onClick={() => selectSession(session.id)} className={`rounded-lg border p-4 text-left transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${session.id === urlState.sessionId ? 'border-primary bg-primary/5' : 'hover:bg-muted/40'}`}>
                <div className="flex items-start justify-between gap-3"><span className="font-semibold">{session.title}</span><Badge variant={statusVariant(session.status)}>{STATUS_LABELS[session.status]}</Badge></div>
                <p className="mt-2 text-sm text-muted-foreground">{formatDate(session.meetingDate)} · {session.minutesResponsibleName}</p>
                <p className="mt-1 text-xs text-muted-foreground">{session.participantCount} participante(s) · {session.agendaItemCount} item(ns) · {session.unresolvedAgendaCount} pendente(s)</p>
              </button>
            ))}
          </div>
          {listQuery.data ? <div className="flex justify-end gap-2"><Button type="button" size="sm" variant="outline" disabled={urlState.page <= 1} onClick={() => setUrlState({ page: urlState.page - 1 })}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Anterior</Button><Button type="button" size="sm" variant="outline" disabled={!listQuery.data.hasMore} onClick={() => setUrlState({ page: urlState.page + 1 })}>Próxima <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button></div> : null}
        </CardContent>
      </Card>

      {urlState.sessionId && detailQuery.isPending ? <Card aria-busy="true"><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando ata...</CardContent></Card> : null}
      {urlState.sessionId && detailQuery.error ? <Alert variant="destructive"><AlertCircle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Sessão indisponível</AlertTitle><AlertDescription>O ID é inválido, pertence a outro tenant ou não está acessível. Nenhuma outra sessão foi selecionada como fallback.</AlertDescription></Alert> : null}

      {detail ? (
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div><CardTitle>{detail.session.title}</CardTitle><CardDescription>{formatDate(detail.session.meetingDate)} · responsável {detail.session.minutesResponsibleName} · versão da sessão {detail.session.version}</CardDescription></div>
              <Badge variant={statusVariant(detail.session.status)}>{STATUS_LABELS[detail.session.status]}</Badge>
            </div>
          </CardHeader>
          <CardContent className="space-y-6">
            {staleReferences.length ? <Alert><RefreshCw className="h-4 w-4" aria-hidden="true" /><AlertTitle>Referências alteradas em outra sessão</AlertTitle><AlertDescription>{staleReferences.length} item(ns) apontam para decisão/ação com versão ou estado atual diferente. As notas locais foram preservadas; revise antes de nova versão da ata.</AlertDescription></Alert> : null}
            <div className="flex flex-wrap gap-2">
              {canManage && ['DRAFT', 'IN_PROGRESS'].includes(detail.session.status) ? <Button type="button" variant="outline" onClick={() => { setEditingExisting(true); setConflict(null); setEditorOpen(true); }}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Editar pauta e notas</Button> : null}
              {detail.session.status === 'DRAFT' && canManage ? <Button type="button" onClick={() => setTransition('start')}><MonitorPlay className="mr-2 h-4 w-4" aria-hidden="true" /> Iniciar reunião</Button> : null}
              {detail.session.status === 'IN_PROGRESS' ? <Button type="button" variant="outline" onClick={() => { setMeetingModeOpen(true); setUrlState({ agendaItemId: detail.agendaItems[0]?.id }); }}><MonitorPlay className="mr-2 h-4 w-4" aria-hidden="true" /> Modo reunião</Button> : null}
              {detail.session.status === 'IN_PROGRESS' && canManage ? <Button type="button" onClick={() => setTransition('submit')}><FileCheck2 className="mr-2 h-4 w-4" aria-hidden="true" /> Enviar para revisão</Button> : null}
              {detail.session.status === 'IN_REVIEW' && canApprove ? <><Button type="button" onClick={() => setTransition('approve')}><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Aprovar ata</Button><Button type="button" variant="outline" onClick={() => setTransition('return')}><RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" /> Devolver para correção</Button></> : null}
              {['DRAFT', 'IN_PROGRESS', 'IN_REVIEW', 'APPROVED'].includes(detail.session.status) && canApprove ? <Button type="button" variant="destructive" onClick={() => setTransition('cancel')}><XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar</Button> : null}
              {['APPROVED', 'CANCELLED'].includes(detail.session.status) && canApprove ? <Button type="button" variant="outline" onClick={() => setTransition('reopen')}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Reabrir</Button> : null}
              {canExport ? <><Button type="button" variant="outline" disabled={Boolean(exporting)} onClick={() => { void runExport('pdf'); }}><FileText className="mr-2 h-4 w-4" aria-hidden="true" /> {exporting === 'pdf' ? 'Gerando...' : 'Ata PDF'}</Button><Button type="button" variant="outline" disabled={Boolean(exporting)} onClick={() => { void runExport('pptx'); }}><Download className="mr-2 h-4 w-4" aria-hidden="true" /> {exporting === 'pptx' ? 'Gerando...' : 'Ata PowerPoint'}</Button></> : null}
            </div>
            {detail.session.status === 'DRAFT' ? <p className="text-xs text-muted-foreground">Exportações desta sessão recebem marca textual RASCUNHO. Aprovação nunca é inferida.</p> : null}
            {detail.session.status === 'IN_REVIEW' && canApprove ? <p className="text-xs text-muted-foreground">O sistema registra preparador e aprovador, mas não impede autoaprovação. Esse risco de segregação fica visível na trilha.</p> : null}

            <div className="grid gap-4 md:grid-cols-3">
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Período</p><p className="font-medium">{formatDate(detail.session.period.start)} a {formatDate(addCalendarDays(detail.session.period.endExclusive, -1))}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Participantes</p><p className="font-medium">{detail.participants.map(participant => participant.nameSnapshot).join(', ') || 'Nenhum'}</p></div>
              <div><p className="text-xs uppercase tracking-wide text-muted-foreground">Snapshot</p><p className="font-medium">{detail.session.snapshot ? `${detail.session.snapshot.contractVersion} · ${formatTimestamp(detail.session.snapshot.capturedAt)}` : 'Ainda não capturado'}</p></div>
            </div>

            <section className="space-y-3" aria-labelledby="meeting-agenda-title">
              <div className="flex flex-wrap items-center justify-between gap-2"><h3 id="meeting-agenda-title" className="font-semibold">Pauta e conclusões</h3><Button type="button" size="sm" variant="outline" onClick={() => openDecisionFlow()}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Registrar decisão no fluxo canônico</Button></div>
              <ol className="space-y-3">
                {detail.agendaItems.map(item => (
                  <li key={item.id} id={`agenda-${item.id}`} className="rounded-lg border p-4">
                    <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold">{item.position}. {item.title}</p><p className="text-xs text-muted-foreground">{item.itemType} · referência v{item.referenceVersion ?? 'não aplicável'}</p></div><Badge variant={item.reviewState === 'CONCLUDED' ? 'success' : item.reviewState === 'CANCELLED' ? 'destructive' : item.reviewState === 'DISCUSSED' ? 'info' : 'outline'}>{item.reviewState}</Badge></div>
                    <p className="mt-3 text-sm"><span className="font-medium">Objetivo:</span> {item.objective || 'Não registrado'}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground"><span className="font-medium text-foreground">Discussão:</span> {item.discussionNotes || 'Não registrada'}</p>
                    <p className="mt-2 whitespace-pre-wrap text-sm"><span className="font-medium">Conclusão:</span> {item.conclusion || 'Não registrada'}</p>
                    {item.referenceId ? <Button type="button" size="sm" variant="link" className="mt-2 h-auto px-0" onClick={() => {
                      const reference = detail.canonicalReferences.find(candidate => candidate.id === item.referenceId);
                      openDecisionFlow(reference?.decisionId);
                    }}>Abrir {item.referenceType === 'ACTION' ? 'ação na decisão' : 'decisão'} canônica</Button> : null}
                  </li>
                ))}
              </ol>
            </section>

            <Separator />
            <section className="space-y-4" aria-labelledby="meeting-follow-up-title">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div><h3 id="meeting-follow-up-title" className="font-semibold">Follow-up entre reuniões</h3><p className="text-xs text-muted-foreground">Sem percentual, score de risco ou causalidade financeira inferidos.</p></div>
                <div className="flex flex-wrap items-end gap-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="follow-up-filter">Exibir</Label>
                    <Select value={urlState.followUpFilter} onValueChange={value => setUrlState({ followUpFilter: value as typeof urlState.followUpFilter })}>
                      <SelectTrigger id="follow-up-filter" className="w-[190px]"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas as referências</SelectItem>
                        <SelectItem value="overdue">Ações vencidas</SelectItem>
                        <SelectItem value="due-soon">Ações na janela</SelectItem>
                        <SelectItem value="no-due-date">Ações sem prazo</SelectItem>
                        <SelectItem value="no-priority">Ações sem prioridade</SelectItem>
                        <SelectItem value="changed">Mudanças desde o início</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="follow-up-due-end">Vencimentos até</Label><DateInput id="follow-up-due-end" value={dueWindowEnd} min={todayBR()} onValueChange={followUpDueEnd => setUrlState({ followUpDueEnd })} /></div>
                </div>
              </div>
              {comparison.state === 'no-previous-session' ? <Alert><AlertTitle>Sem base de comparação</AlertTitle><AlertDescription>Nenhuma sessão anterior foi explicitamente selecionada.</AlertDescription></Alert> : comparison.state === 'incompatible-period' ? <Alert><AlertTitle>Comparação incompatível</AlertTitle><AlertDescription>A versão anterior não é compatível com a ata atual.</AlertDescription></Alert> : <p className="text-sm text-muted-foreground">{comparison.differences.length} diferença(s) factual(is) entre as versões comparadas.</p>}
              {followUp ? <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
                {[
                  ['Ações vencidas', followUp.overdueActions.length],
                  ['Ações na janela', followUp.dueSoonActions.length],
                  ['Ações sem prazo', followUp.noDueDateActions.length],
                  ['Ações sem prioridade', followUp.noPriorityActions.length],
                  ['Pauta pendente', followUp.unresolvedAgendaItems.length],
                ].map(([label, value]) => <div key={String(label)} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{label}</p><p className="text-xl font-semibold">{value}</p></div>)}
              </div> : null}
              {followUp?.changedSinceSnapshot.length ? <Alert><History className="h-4 w-4" aria-hidden="true" /><AlertTitle>Mudanças desde o início</AlertTitle><AlertDescription>{followUp.changedSinceSnapshot.map(reference => `${reference.title} (${reference.status}, v${reference.version})`).join('; ')}</AlertDescription></Alert> : null}
              {followUp ? (
                <div className="grid gap-3 lg:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium">Decisões por estado</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-3">
                      {Object.entries(followUp.decisionsByStatus).map(([status, count]) => <div key={status}><dt className="text-xs text-muted-foreground">{status}</dt><dd className="font-semibold">{count}</dd></div>)}
                    </dl>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-medium">Ações por estado</p>
                    <dl className="mt-3 grid grid-cols-2 gap-2 text-sm sm:grid-cols-4">
                      {Object.entries(followUp.actionsByStatus).map(([status, count]) => <div key={status}><dt className="text-xs text-muted-foreground">{status}</dt><dd className="font-semibold">{count}</dd></div>)}
                    </dl>
                  </div>
                </div>
              ) : null}
              <div className="rounded-lg border p-4">
                <p className="text-sm font-medium">Itens do filtro</p>
                {filteredFollowUpReferences.length === 0 ? <p className="mt-2 text-sm text-muted-foreground">Nenhuma referência explícita corresponde a este filtro.</p> : (
                  <ul className="mt-3 space-y-2">
                    {filteredFollowUpReferences.map(reference => (
                      <li key={`${reference.entityType}:${reference.id}`} className="flex flex-wrap items-start justify-between gap-2 text-sm">
                        <div><p className="font-medium">{reference.title}</p><p className="text-xs text-muted-foreground">{reference.entityType === 'ACTION' ? 'Ação' : 'Decisão'} · {reference.status} · v{reference.version}{reference.dueDate ? ` · prazo ${formatDate(reference.dueDate)}` : reference.entityType === 'ACTION' ? ' · sem prazo' : ''}</p></div>
                        <Button type="button" size="sm" variant="link" className="h-auto px-0" onClick={() => openDecisionFlow(reference.decisionId)}>Abrir fluxo canônico</Button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {comparison.state === 'available' && comparison.differences.length ? <details><summary className="cursor-pointer text-sm font-medium">Ver comparação factual</summary><ul className="mt-2 space-y-1 text-sm text-muted-foreground">{comparison.differences.map(item => <li key={item.path}>{item.path}: {String(item.before ?? 'ausente')} → {String(item.after ?? 'ausente')}</li>)}</ul></details> : null}
            </section>

            <Separator />
            <section className="space-y-3" aria-labelledby="meeting-revisions-title">
              <h3 id="meeting-revisions-title" className="font-semibold">Revisões da ata</h3>
              {detail.revisions.length === 0 ? <p className="text-sm text-muted-foreground">Nenhuma versão enviada para revisão.</p> : <div className="flex flex-wrap gap-2">{detail.revisions.map(revision => <Button key={revision.id} type="button" size="sm" variant={revision.id === currentRevision?.id ? 'default' : 'outline'} onClick={() => setUrlState({ revisionId: revision.id })}>v{revision.revisionNumber} · {revision.state}</Button>)}</div>}
              {currentRevision ? <div className="rounded-lg border p-4 text-sm"><p><span className="font-medium">Motivo:</span> {currentRevision.revisionReason}</p><p className="mt-1 text-muted-foreground">Criada por {currentRevision.createdByName} em {formatTimestamp(currentRevision.createdAt)} · aprovada por {currentRevision.approvedByName ?? 'não aprovada'} em {formatTimestamp(currentRevision.approvedAt)}</p><p className="mt-1 text-xs text-muted-foreground">ID {currentRevision.id}</p></div> : null}
            </section>

            <Separator />
            <section className="space-y-3" aria-labelledby="meeting-timeline-title">
              <h3 id="meeting-timeline-title" className="font-semibold">Timeline auditável</h3>
              {detail.timeline.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento.</p> : <ol className="space-y-3 border-l pl-5">{detail.timeline.map(event => <li key={event.id} className="relative"><span className="absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" /><p className="text-sm font-medium">{EVENT_LABELS[event.eventType] ?? event.eventType}</p><p className="text-xs text-muted-foreground">{event.actorName} · {formatTimestamp(event.createdAt)}</p>{event.justification ? <p className="mt-1 text-xs text-muted-foreground">Justificativa: {event.justification}</p> : null}</li>)}</ol>}
            </section>
          </CardContent>
        </Card>
      ) : null}

      <PresentationMeetingEditorDialog
        open={editorOpen}
        onOpenChange={setEditorOpen}
        companyId={companyId}
        userId={userId}
        period={period}
        granularity={granularity}
        profiles={profiles}
        decisions={decisions}
        previousSessions={sessions}
        existingDetail={editingExisting ? detail : undefined}
        saving={mutations.createSession.isPending || mutations.saveSession.isPending}
        conflict={conflict}
        onReloadConflict={async () => { await detailQuery.refetch(); setConflict(null); setConflictDraft(null); }}
        onReapplyConflict={reapplyConflict}
        onSave={handleSave}
      />

      <Dialog open={Boolean(transition)} onOpenChange={open => { if (!open) { setTransition(null); setJustification(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{transition === 'start' ? 'Iniciar reunião' : transition === 'submit' ? 'Enviar ata para revisão' : 'Confirmar transição da ata'}</DialogTitle>
            <DialogDescription>{transition === 'start' ? 'A base exibida e as versões das decisões e ações serão congeladas. O snapshot não será recalculado depois.' : 'A operação é explícita, usa optimistic locking e ficará na timeline antes/depois.'}</DialogDescription>
          </DialogHeader>
          {transition !== 'start' ? <div className="space-y-1.5"><Label htmlFor="meeting-transition-reason">{transition === 'submit' ? 'Motivo desta versão' : 'Justificativa'} *</Label><Textarea id="meeting-transition-reason" value={justification} maxLength={4000} rows={4} onChange={event => setJustification(event.target.value)} /></div> : null}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setTransition(null)}>Voltar</Button><Button type="button" disabled={(transition !== 'start' && !justification.trim()) || mutations.startSession.isPending || mutations.submitMinutes.isPending || mutations.transitionSession.isPending} onClick={() => { void confirmTransition(); }}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={meetingModeOpen} onOpenChange={setMeetingModeOpen}>
        <DialogContent className="max-w-4xl">
          <DialogHeader><DialogTitle>Modo reunião</DialogTitle><DialogDescription>{detail?.session.title} · item {detail?.agendaItems.length ? selectedAgendaIndex + 1 : 0} de {detail?.agendaItems.length ?? 0}</DialogDescription></DialogHeader>
          {selectedAgendaItem ? <article className="dark min-h-[360px] space-y-5 rounded-lg border bg-card p-6 text-card-foreground"><div><p className="text-sm font-semibold uppercase tracking-wider text-primary">{selectedAgendaItem.itemType}</p><h2 className="mt-2 text-3xl font-bold">{selectedAgendaItem.title}</h2></div><div><p className="text-sm text-muted-foreground">Objetivo ou pergunta</p><p className="mt-1 text-lg">{selectedAgendaItem.objective || 'Não registrado'}</p></div><div><p className="text-sm text-muted-foreground">Notas registradas</p><p className="mt-1 whitespace-pre-wrap">{selectedAgendaItem.discussionNotes || 'Ainda não registradas'}</p></div><div><p className="text-sm text-muted-foreground">Conclusão</p><p className="mt-1 whitespace-pre-wrap">{selectedAgendaItem.conclusion || 'Ainda não registrada'}</p></div></article> : <p className="py-16 text-center text-muted-foreground">A pauta está vazia.</p>}
          <DialogFooter className="sm:justify-between"><div className="flex gap-2"><Button type="button" variant="outline" disabled={selectedAgendaIndex <= 0} onClick={() => setUrlState({ agendaItemId: detail?.agendaItems[selectedAgendaIndex - 1]?.id })}><ChevronLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Anterior</Button><Button type="button" variant="outline" disabled={!detail || selectedAgendaIndex >= detail.agendaItems.length - 1} onClick={() => setUrlState({ agendaItemId: detail?.agendaItems[selectedAgendaIndex + 1]?.id })}>Próximo <ChevronRight className="ml-1 h-4 w-4" aria-hidden="true" /></Button></div>{canManage ? <Button type="button" onClick={() => { setMeetingModeOpen(false); setEditingExisting(true); setEditorOpen(true); }}><Pencil className="mr-2 h-4 w-4" aria-hidden="true" /> Registrar notas</Button> : null}</DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

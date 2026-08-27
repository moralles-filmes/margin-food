import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CalendarClock,
  CheckCircle2,
  Clock3,
  History,
  Loader2,
  LockKeyhole,
  Plus,
  RefreshCw,
  ShieldCheck,
  UserRound,
  XCircle,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  buildPresentationDecisionSnapshot,
  comparePresentationDecisionSnapshot,
  parsePresentationDecisionActionDraft,
  addCalendarDays,
  type NormalizedDateRange,
  type PresentationActionPriority,
  type PresentationActionStatus,
  type PresentationComparisonMode,
  type PresentationDecisionAction,
  type PresentationDecisionStatus,
  type PresentationPlanData,
  type PresentationScenarioDraft,
  type PresentationScenarioResult,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import {
  PresentationDecisionMutationError,
  usePresentationDecisionDetail,
  usePresentationDecisionMutations,
  usePresentationDecisions,
  usePresentationResponsibleProfiles,
} from '@/hooks/usePresentationDecisions';
import {
  readPresentationDecisionUrlState,
  writePresentationDecisionUrlState,
} from '@/lib/presentationDetailNavigation';
import { fmtBRL, formatDateTimeBR, formatPercentBR, todayBR } from '@/lib/formatters';
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
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import PresentationDecisionRegisterDialog from './PresentationDecisionRegisterDialog';

interface Props {
  companyId: string;
  userId: string;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  comparisonMode: PresentationComparisonMode;
  plan: PresentationPlanData;
  scenarioResult?: PresentationScenarioResult;
  scenarioDraft?: PresentationScenarioDraft;
  canManage: boolean;
  canApprove: boolean;
}

const STATUS_LABELS: Record<PresentationDecisionStatus, string> = {
  DRAFT: 'Rascunho',
  APPROVED: 'Aprovada',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Encerrada',
  CANCELLED: 'Cancelada',
};

const ACTION_STATUS_LABELS: Record<PresentationActionStatus, string> = {
  PENDING: 'Pendente',
  IN_PROGRESS: 'Em andamento',
  COMPLETED: 'Concluída',
  CANCELLED: 'Cancelada',
};

const PRIORITY_LABELS: Record<PresentationActionPriority, string> = {
  LOW: 'Baixa',
  MEDIUM: 'Média',
  HIGH: 'Alta',
  CRITICAL: 'Crítica',
};

const EMPTY_ACTION_EDIT = {
  id: '', description: '', responsibleUserId: '', dueDate: '', priority: '' as PresentationActionPriority | '',
};

const EVENT_LABELS: Record<string, string> = {
  DECISION_CREATED: 'Decisão registrada',
  DRAFT_UPDATED: 'Rascunho atualizado',
  REVISION_CREATED: 'Nova revisão criada',
  DECISION_APPROVED: 'Decisão aprovada',
  DECISION_IN_PROGRESS: 'Decisão iniciada',
  DECISION_COMPLETED: 'Decisão encerrada',
  DECISION_CANCELLED: 'Decisão cancelada',
  DECISION_REOPENED: 'Decisão reaberta',
  ACTION_CREATED: 'Ação criada',
  ACTION_UPDATED: 'Ação atualizada',
  ACTION_STATUS_CHANGED: 'Estado da ação alterado',
  ACTION_REOPENED: 'Ação reaberta',
};

function statusVariant(status: PresentationDecisionStatus | PresentationActionStatus) {
  if (status === 'COMPLETED') return 'success' as const;
  if (status === 'CANCELLED') return 'destructive' as const;
  if (status === 'IN_PROGRESS') return 'info' as const;
  if (status === 'APPROVED') return 'warning' as const;
  return 'outline' as const;
}

function formatDateOnly(value: string | null): string {
  if (!value) return 'Não informado';
  const parsed = new Date(`${value}T12:00:00`);
  return Number.isNaN(parsed.getTime()) ? 'Data inválida' : parsed.toLocaleDateString('pt-BR');
}

function formatTimestamp(value: string | null): string {
  if (!value) return 'Não informado';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? 'Data indisponível' : formatDateTimeBR(parsed);
}

function formatMetric(key: string, value: number | null): string {
  if (value === null) return 'Indisponível';
  return key === 'marginPercent' ? formatPercentBR(value, 1) : fmtBRL(value);
}

function isOverdue(action: PresentationDecisionAction): boolean {
  return Boolean(
    action.dueDate
    && action.dueDate < todayBR()
    && action.status !== 'COMPLETED'
    && action.status !== 'CANCELLED',
  );
}

export default function PresentationDecisionGovernance({
  companyId,
  userId,
  period,
  granularity,
  comparisonMode,
  plan,
  scenarioResult,
  scenarioDraft,
  canManage,
  canApprove,
}: Props) {
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const urlState = readPresentationDecisionUrlState(searchParams);
  const [registerOpen, setRegisterOpen] = useState(false);
  const [draftEdit, setDraftEdit] = useState({ title: '', context: '', responsibleUserId: '' });
  const [actionEdit, setActionEdit] = useState(EMPTY_ACTION_EDIT);
  const [actionInitial, setActionInitial] = useState(EMPTY_ACTION_EDIT);
  const [actionEditorOpen, setActionEditorOpen] = useState(false);
  const [revisionOpen, setRevisionOpen] = useState(false);
  const [revisionForm, setRevisionForm] = useState({ sourceMode: comparisonMode as PresentationComparisonMode | 'scenario', reason: '' });
  const [revisionInitial, setRevisionInitial] = useState({ sourceMode: comparisonMode as PresentationComparisonMode | 'scenario', reason: '' });
  const [discardTarget, setDiscardTarget] = useState<'action' | 'revision' | null>(null);
  const [transition, setTransition] = useState<null | {
    type: 'decision' | 'action';
    target: PresentationDecisionStatus | PresentationActionStatus;
    action?: PresentationDecisionAction;
  }>(null);
  const [justification, setJustification] = useState('');
  const [conflict, setConflict] = useState<string | null>(null);

  const profilesQuery = usePresentationResponsibleProfiles(companyId, true);
  const listQuery = usePresentationDecisions(companyId, {
    period,
    status: urlState.status,
    responsibleUserId: urlState.responsibleUserId,
    dueFilter: urlState.dueFilter,
    search: urlState.search,
    page: urlState.page,
  }, true);
  const detailQuery = usePresentationDecisionDetail(companyId, urlState.decisionId, true);
  const mutations = usePresentationDecisionMutations(companyId);
  const profiles = useMemo(() => profilesQuery.data ?? [], [profilesQuery.data]);
  const profileOptions = useMemo(() => profiles.map(profile => ({
    value: profile.id,
    label: profile.email ? `${profile.nome} - ${profile.email}` : profile.nome,
  })), [profiles]);
  const detail = detailQuery.data;
  const decision = detail?.decision;
  const currentRevision = detail?.revisions.find(revision => revision.id === decision?.currentRevisionId);
  const comparison = currentRevision ? comparePresentationDecisionSnapshot(currentRevision.snapshot, plan) : null;

  const setUrlState = (patch: Partial<typeof urlState>) => {
    const nextState = { ...urlState, ...patch };
    const next = writePresentationDecisionUrlState(searchParams, nextState);
    navigate(`${location.pathname}?${next.toString()}`, { replace: true });
  };

  useEffect(() => {
    if (!decision) return;
    setDraftEdit({
      title: decision.title,
      context: decision.context,
      responsibleUserId: decision.executiveResponsibleUserId ?? '',
    });
  }, [decision]);

  const counts = useMemo(() => {
    const actions = detail?.actions ?? [];
    return {
      pending: actions.filter(action => action.status === 'PENDING').length,
      inProgress: actions.filter(action => action.status === 'IN_PROGRESS').length,
      completed: actions.filter(action => action.status === 'COMPLETED').length,
      overdue: actions.filter(isOverdue).length,
    };
  }, [detail?.actions]);

  const handleMutationError = (error: unknown, fallback: string) => {
    console.error(fallback, error);
    if (error instanceof PresentationDecisionMutationError && error.code === 'OPTIMISTIC_LOCK_CONFLICT') {
      setConflict('Outra pessoa atualizou este registro. Sua edição local foi preservada; recarregue os dados e reaplique conscientemente.');
      return;
    }
    toast.error(error instanceof Error ? error.message : fallback);
  };

  const saveDraft = async () => {
    if (!decision || !draftEdit.title.trim() || !draftEdit.context.trim()) return;
    try {
      await mutations.updateDraft.mutateAsync({
        decisionId: decision.id,
        title: draftEdit.title.trim(),
        context: draftEdit.context.trim(),
        executiveResponsibleUserId: draftEdit.responsibleUserId || null,
        expectedUpdatedAt: decision.updatedAt,
      });
      toast.success('Rascunho atualizado.');
    } catch (error) {
      handleMutationError(error, 'Não foi possível atualizar o rascunho.');
    }
  };

  const saveAction = async () => {
    if (!decision || !actionEdit.description.trim() || !actionEdit.responsibleUserId) {
      toast.error('Informe descrição e responsável.');
      return;
    }
    try {
      const parsed = parsePresentationDecisionActionDraft({
        description: actionEdit.description,
        responsibleUserId: actionEdit.responsibleUserId,
        dueDate: actionEdit.dueDate || null,
        priority: actionEdit.priority || null,
      }, profiles);
      const existing = detail?.actions.find(action => action.id === actionEdit.id);
      if (existing) {
        await mutations.updateAction.mutateAsync({
          decisionId: decision.id,
          actionId: existing.id,
          description: parsed.description,
          responsibleUserId: parsed.responsibleUserId,
          dueDate: parsed.dueDate,
          priority: parsed.priority,
          expectedStatus: existing.status,
          expectedUpdatedAt: existing.updatedAt,
        });
        toast.success('Ação atualizada.');
      } else {
        await mutations.createAction.mutateAsync({
          decisionId: decision.id,
          description: parsed.description,
          responsibleUserId: parsed.responsibleUserId,
          dueDate: parsed.dueDate,
          priority: parsed.priority,
          expectedDecisionStatus: decision.status,
          expectedDecisionUpdatedAt: decision.updatedAt,
        });
        toast.success('Ação criada.');
      }
      setActionEdit(EMPTY_ACTION_EDIT);
      setActionInitial(EMPTY_ACTION_EDIT);
      setActionEditorOpen(false);
    } catch (error) {
      handleMutationError(error, 'Não foi possível salvar a ação.');
    }
  };

  const createRevision = async () => {
    if (!decision || !revisionForm.reason.trim()) return;
    try {
      const snapshot = buildPresentationDecisionSnapshot({
        plan,
        period,
        granularity,
        mode: revisionForm.sourceMode,
        scenarioResult,
        scenarioDraft,
      });
      await mutations.addRevision.mutateAsync({
        decisionId: decision.id,
        referenceType: snapshot.referenceType,
        snapshot,
        reason: revisionForm.reason.trim(),
        expectedStatus: decision.status,
        expectedUpdatedAt: decision.updatedAt,
      });
      toast.success('Nova revisão criada como rascunho.');
      setRevisionOpen(false);
      setRevisionForm({ sourceMode: comparisonMode, reason: '' });
    } catch (error) {
      handleMutationError(error, 'Não foi possível criar a revisão.');
    }
  };

  const confirmTransition = async () => {
    if (!decision || !transition || !justification.trim()) return;
    try {
      if (transition.type === 'decision') {
        await mutations.transitionDecision.mutateAsync({
          decisionId: decision.id,
          expectedStatus: decision.status,
          targetStatus: transition.target as PresentationDecisionStatus,
          justification: justification.trim(),
          expectedUpdatedAt: decision.updatedAt,
        });
      } else if (transition.action) {
        await mutations.transitionAction.mutateAsync({
          decisionId: decision.id,
          actionId: transition.action.id,
          expectedStatus: transition.action.status,
          targetStatus: transition.target as PresentationActionStatus,
          outcomeNote: justification.trim(),
          expectedUpdatedAt: transition.action.updatedAt,
        });
      }
      toast.success('Transição registrada com auditoria.');
      setTransition(null);
      setJustification('');
    } catch (error) {
      handleMutationError(error, 'Não foi possível registrar a transição.');
    }
  };

  const openTransition = (
    type: 'decision' | 'action',
    target: PresentationDecisionStatus | PresentationActionStatus,
    action?: PresentationDecisionAction,
  ) => {
    if (type === 'action' && target === 'IN_PROGRESS' && action && decision) {
      void mutations.transitionAction.mutateAsync({
        decisionId: decision.id,
        actionId: action.id,
        expectedStatus: action.status,
        targetStatus: 'IN_PROGRESS',
        outcomeNote: null,
        expectedUpdatedAt: action.updatedAt,
      }).then(() => {
        toast.success('Ação iniciada.');
      }).catch(error => handleMutationError(error, 'Não foi possível iniciar a ação.'));
      return;
    }
    setJustification('');
    setTransition({ type, target, action });
  };

  const beginActionEdit = (action?: PresentationDecisionAction) => {
    setActionEditorOpen(true);
    const next: typeof EMPTY_ACTION_EDIT = action ? {
      id: action.id,
      description: action.description,
      responsibleUserId: action.responsibleUserId ?? '',
      dueDate: action.dueDate ?? '',
      priority: action.priority ?? '',
    } : EMPTY_ACTION_EDIT;
    setActionEdit(next);
    setActionInitial(next);
  };

  const discardEditor = (target: 'action' | 'revision') => {
    if (target === 'action') {
      setActionEditorOpen(false);
      setActionEdit(EMPTY_ACTION_EDIT);
      setActionInitial(EMPTY_ACTION_EDIT);
    } else {
      const next = { sourceMode: comparisonMode as PresentationComparisonMode | 'scenario', reason: '' };
      setRevisionOpen(false);
      setRevisionForm(next);
      setRevisionInitial(next);
    }
  };

  const requestDiscard = (target: 'action' | 'revision') => {
    const dirty = target === 'action'
      ? JSON.stringify(actionEdit) !== JSON.stringify(actionInitial)
      : JSON.stringify(revisionForm) !== JSON.stringify(revisionInitial);
    if (dirty) setDiscardTarget(target);
    else discardEditor(target);
  };

  const openRevisionEditor = () => {
    const next = { sourceMode: comparisonMode as PresentationComparisonMode | 'scenario', reason: '' };
    setRevisionForm(next);
    setRevisionInitial(next);
    setRevisionOpen(true);
  };

  return (
    <section id="presentation-governance" aria-labelledby="presentation-governance-title" className="scroll-mt-6 space-y-4">
      <Card className="border-primary/25">
        <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <CardTitle id="presentation-governance-title" className="flex items-center gap-2 text-lg">
              <ShieldCheck className="h-5 w-5 text-gold-dark dark:text-primary" aria-hidden="true" />
              Decisões e compromissos
            </CardTitle>
            <CardDescription>
              Governança executiva com snapshots históricos, responsáveis, prazos e trilha auditável.
            </CardDescription>
          </div>
          {canManage ? (
            <Button type="button" onClick={() => setRegisterOpen(true)}>
              <Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Registrar decisão
            </Button>
          ) : null}
        </CardHeader>
        <CardContent className="space-y-4">
          {!canManage && !canApprove ? (
            <Alert>
              <LockKeyhole className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Somente leitura</AlertTitle>
              <AlertDescription>Você pode consultar decisões, mas não gerenciar ou aprovar.</AlertDescription>
            </Alert>
          ) : null}

          {profilesQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Responsáveis indisponíveis</AlertTitle>
              <AlertDescription>As decisões continuam visíveis, mas filtros e atribuições de responsável estão indisponíveis.</AlertDescription>
            </Alert>
          ) : null}

          {(listQuery.isFetching && !listQuery.isPending) || (detailQuery.isFetching && !detailQuery.isPending) ? (
            <p className="flex items-center gap-2 text-xs text-muted-foreground" role="status">
              <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" /> Atualizando dados compartilhados...
            </p>
          ) : null}

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-4">
            <div className="space-y-1.5">
              <Label htmlFor="decision-search">Buscar decisão</Label>
              <Input
                id="decision-search"
                value={urlState.search}
                maxLength={100}
                onChange={event => setUrlState({ search: event.target.value, page: 1 })}
                placeholder="Título..."
              />
            </div>
            <div className="space-y-1.5">
              <Label>Estado</Label>
              <Select value={urlState.status ?? 'all'} onValueChange={value => setUrlState({
                status: value === 'all' ? undefined : value as PresentationDecisionStatus,
                page: 1,
              })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {Object.entries(STATUS_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>Responsável</Label>
              <SearchableSelect
                value={urlState.responsibleUserId ?? ''}
                onValueChange={value => setUrlState({ responsibleUserId: value || undefined, page: 1 })}
                options={profileOptions}
                placeholder="Todos"
                ariaLabel="Filtrar decisões por responsável"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Prazo das ações</Label>
              <Select value={urlState.dueFilter} onValueChange={value => setUrlState({
                dueFilter: value as typeof urlState.dueFilter,
                page: 1,
              })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="overdue">Com ações vencidas</SelectItem>
                  <SelectItem value="upcoming">Com prazo futuro</SelectItem>
                  <SelectItem value="no-deadline">Sem prazo informado</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {listQuery.isPending ? (
            <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando decisões...
            </div>
          ) : listQuery.isError ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" aria-hidden="true" />
              <AlertTitle>Decisões indisponíveis</AlertTitle>
              <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                <span>{listQuery.error instanceof Error ? listQuery.error.message : 'Falha ao carregar.'}</span>
                <Button type="button" variant="outline" size="sm" onClick={() => { void listQuery.refetch(); }}>Tentar novamente</Button>
              </AlertDescription>
            </Alert>
          ) : listQuery.data?.items.length === 0 ? (
            <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
              Nenhuma decisão encontrada para os filtros atuais.
            </div>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {listQuery.data?.items.map(item => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setUrlState({ decisionId: item.id })}
                  className="rounded-lg border bg-card p-4 text-left transition-colors hover:border-primary/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-pressed={urlState.decisionId === item.id}
                >
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-foreground">{item.title}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {formatDateOnly(item.period.start)} a {formatDateOnly(addCalendarDays(item.period.endExclusive, -1))} · {item.referenceType === 'SCENARIO' ? 'SIMULAÇÃO' : 'Base canônica'}
                      </p>
                    </div>
                    <Badge variant={statusVariant(item.status)}>{STATUS_LABELS[item.status]}</Badge>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                    <span className="inline-flex items-center gap-1"><UserRound className="h-3.5 w-3.5" aria-hidden="true" /> {item.executiveResponsibleName ?? 'Responsável não informado'}</span>
                    <span>{item.actionCounts.pending} pendente(s)</span>
                    <span>{item.actionCounts.inProgress} em andamento</span>
                    {item.actionCounts.overdue > 0 ? <span className="font-semibold text-destructive">{item.actionCounts.overdue} vencida(s)</span> : null}
                  </div>
                </button>
              ))}
            </div>
          )}

          {listQuery.data && listQuery.data.totalCount > listQuery.data.pageSize ? (
            <div className="flex items-center justify-between gap-3">
              <p className="text-xs text-muted-foreground">{listQuery.data.totalCount} decisões</p>
              <div className="flex gap-2">
                <Button type="button" size="sm" variant="outline" disabled={urlState.page <= 1} onClick={() => setUrlState({ page: urlState.page - 1 })}>Anterior</Button>
                <Button type="button" size="sm" variant="outline" disabled={!listQuery.data.hasMore} onClick={() => setUrlState({ page: urlState.page + 1 })}>Próxima</Button>
              </div>
            </div>
          ) : null}
        </CardContent>
      </Card>

      {conflict ? (
        <Alert variant="destructive">
          <RefreshCw className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Conflito de concorrência</AlertTitle>
          <AlertDescription className="space-y-2">
            <p>{conflict}</p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="outline" onClick={() => { void detailQuery.refetch(); setConflict(null); }}>Recarregar dados mais recentes</Button>
              <Button type="button" size="sm" variant="ghost" onClick={() => setConflict(null)}>Manter edição para reaplicar</Button>
            </div>
          </AlertDescription>
        </Alert>
      ) : null}

      {urlState.decisionId ? (
        detailQuery.isPending ? (
          <Card aria-busy="true"><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Carregando detalhe...</CardContent></Card>
        ) : detailQuery.isError ? (
          <Alert variant="destructive">
            <AlertTitle>Detalhe indisponível</AlertTitle>
            <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
              <span>{detailQuery.error instanceof Error ? detailQuery.error.message : 'A decisão não existe ou pertence a outra empresa.'}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => setUrlState({ decisionId: undefined })}>Fechar</Button>
            </AlertDescription>
          </Alert>
        ) : decision && detail && currentRevision ? (
          <Card>
            <CardHeader className="gap-3 sm:flex-row sm:items-start sm:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <CardTitle>{decision.title}</CardTitle>
                  <Badge variant={statusVariant(decision.status)}>{STATUS_LABELS[decision.status]}</Badge>
                  {decision.referenceType === 'SCENARIO' ? <Badge variant="warning">SIMULAÇÃO</Badge> : null}
                </div>
                <CardDescription>
                  Revisão {currentRevision.revisionNumber} · snapshot em {formatTimestamp(currentRevision.snapshot.capturedAt)} · corte {formatDateOnly(currentRevision.snapshot.cutoffDate)}
                </CardDescription>
              </div>
              <Button type="button" variant="ghost" size="sm" onClick={() => setUrlState({ decisionId: undefined })}>Fechar detalhe</Button>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="rounded-lg border bg-muted/20 p-4">
                <p className="text-sm font-semibold text-foreground">Contexto registrado</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-muted-foreground">{decision.context}</p>
                <div className="mt-3 grid gap-2 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                  <span>Autor: {decision.createdByName}</span>
                  <span>Responsável: {decision.executiveResponsibleName ?? 'Não informado'}</span>
                  <span>Aprovador: {decision.approvedByName ?? 'Ainda não aprovado'}</span>
                  <span>Atualizado em: {formatTimestamp(decision.updatedAt)}</span>
                </div>
              </div>

              {canManage && decision.status === 'DRAFT' ? (
                <div className="space-y-3 rounded-lg border p-4">
                  <h3 className="font-semibold">Editar rascunho</h3>
                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="space-y-1.5"><Label htmlFor="edit-decision-title">Título</Label><Input id="edit-decision-title" value={draftEdit.title} maxLength={200} onChange={event => setDraftEdit(value => ({ ...value, title: event.target.value }))} /></div>
                    <div className="space-y-1.5"><Label>Responsável executivo</Label><SearchableSelect value={draftEdit.responsibleUserId} onValueChange={value => setDraftEdit(current => ({ ...current, responsibleUserId: value }))} options={profileOptions} placeholder="Não informado" ariaLabel="Responsável executivo" /></div>
                  </div>
                  <div className="space-y-1.5"><Label htmlFor="edit-decision-context">Contexto</Label><Textarea id="edit-decision-context" value={draftEdit.context} maxLength={10000} rows={4} onChange={event => setDraftEdit(value => ({ ...value, context: event.target.value }))} /></div>
                  <Button type="button" size="sm" onClick={() => { void saveDraft(); }} disabled={mutations.updateDraft.isPending}>Salvar rascunho</Button>
                </div>
              ) : null}

              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4" aria-label="Resumo das ações">
                {[
                  { label: 'Pendentes', value: counts.pending, icon: Clock3 },
                  { label: 'Em andamento', value: counts.inProgress, icon: CalendarClock },
                  { label: 'Concluídas', value: counts.completed, icon: CheckCircle2 },
                  { label: 'Vencidas', value: counts.overdue, icon: AlertCircle },
                ].map(item => (
                  <div key={item.label} className="rounded-lg border p-3">
                    <item.icon className="mb-2 h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <p className="text-2xl font-bold">{item.value}</p>
                    <p className="text-xs text-muted-foreground">{item.label}</p>
                  </div>
                ))}
              </div>

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Plano de ação</h3>
                  {canManage && !['COMPLETED', 'CANCELLED'].includes(decision.status) ? <Button type="button" size="sm" variant="outline" onClick={() => beginActionEdit()}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Nova ação</Button> : null}
                </div>

                {canManage && actionEditorOpen ? (
                  <div className="space-y-3 rounded-lg border border-primary/25 p-4">
                    <p className="text-sm font-semibold">{actionEdit.id ? 'Editar ação' : 'Nova ação'}</p>
                    <div className="space-y-1.5"><Label htmlFor="action-description">Descrição objetiva</Label><Textarea id="action-description" value={actionEdit.description} maxLength={1000} rows={3} onChange={event => setActionEdit(current => ({ ...current, description: event.target.value }))} /></div>
                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="space-y-1.5"><Label>Responsável *</Label><SearchableSelect value={actionEdit.responsibleUserId} onValueChange={value => setActionEdit(current => ({ ...current, responsibleUserId: value }))} options={profileOptions} placeholder="Selecione" ariaLabel="Responsável da ação" /></div>
                      <div className="space-y-1.5"><Label htmlFor="action-due">Prazo opcional</Label><DateInput id="action-due" value={actionEdit.dueDate} onValueChange={value => setActionEdit(current => ({ ...current, dueDate: value }))} /></div>
                      <div className="space-y-1.5"><Label>Prioridade opcional</Label><Select value={actionEdit.priority || 'none'} onValueChange={value => setActionEdit(current => ({ ...current, priority: value === 'none' ? '' : value as PresentationActionPriority }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="none">Não informada</SelectItem>{Object.entries(PRIORITY_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent></Select></div>
                    </div>
                    <div className="flex gap-2"><Button type="button" size="sm" onClick={() => { void saveAction(); }} disabled={mutations.createAction.isPending || mutations.updateAction.isPending}>Salvar ação</Button><Button type="button" size="sm" variant="ghost" onClick={() => requestDiscard('action')}>Descartar edição</Button></div>
                  </div>
                ) : null}

                {detail.actions.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhuma ação assumida.</p> : (
                  <div className="space-y-2">
                    {detail.actions.map(action => (
                      <div key={action.id} className="rounded-lg border p-4">
                        <div className="flex flex-wrap items-start justify-between gap-2">
                          <div>
                            <p className="font-medium text-foreground">{action.description}</p>
                            <p className="mt-1 text-xs text-muted-foreground">Responsável: {action.responsibleName} · Prazo: {formatDateOnly(action.dueDate)}{action.priority ? ` · Prioridade: ${PRIORITY_LABELS[action.priority]}` : ''}</p>
                          </div>
                          <div className="flex flex-wrap items-center gap-2">
                            {isOverdue(action) ? <Badge variant="destructive">Vencida</Badge> : null}
                            <Badge variant={statusVariant(action.status)}>{ACTION_STATUS_LABELS[action.status]}</Badge>
                          </div>
                        </div>
                        {action.outcomeNote ? <p className="mt-2 text-xs text-muted-foreground">Observação: {action.outcomeNote}</p> : null}
                        {canManage && !['COMPLETED', 'CANCELLED'].includes(decision.status) ? (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {!['COMPLETED', 'CANCELLED'].includes(action.status) ? <Button type="button" size="sm" variant="outline" onClick={() => beginActionEdit(action)}>Editar</Button> : null}
                            {action.status === 'PENDING' && ['APPROVED', 'IN_PROGRESS'].includes(decision.status) ? <Button type="button" size="sm" variant="outline" onClick={() => openTransition('action', 'IN_PROGRESS', action)}>Iniciar</Button> : null}
                            {['PENDING', 'IN_PROGRESS'].includes(action.status) && ['APPROVED', 'IN_PROGRESS'].includes(decision.status) ? <Button type="button" size="sm" onClick={() => openTransition('action', 'COMPLETED', action)}>Concluir</Button> : null}
                            {['PENDING', 'IN_PROGRESS'].includes(action.status) ? <Button type="button" size="sm" variant="destructive" onClick={() => openTransition('action', 'CANCELLED', action)}>Cancelar</Button> : null}
                            {['COMPLETED', 'CANCELLED'].includes(action.status) ? <Button type="button" size="sm" variant="outline" onClick={() => openTransition('action', 'PENDING', action)}>Reabrir</Button> : null}
                          </div>
                        ) : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h3 className="font-semibold">Snapshot aprovado e revisões</h3>
                  {canManage && !['COMPLETED', 'CANCELLED'].includes(decision.status) ? <Button type="button" size="sm" variant="outline" onClick={openRevisionEditor}><History className="mr-2 h-4 w-4" aria-hidden="true" /> Nova revisão</Button> : null}
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {Object.entries(currentRevision.snapshot.metrics).map(([key, value]) => (
                    <div key={key} className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">{key}</p><p className="mt-1 font-semibold">{formatMetric(key, value)}</p></div>
                  ))}
                </div>
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-semibold">Fontes e fórmulas</p>
                    <dl className="mt-2 space-y-1 text-xs text-muted-foreground">
                      <div><dt className="inline font-semibold text-foreground">Fórmula: </dt><dd className="inline">{currentRevision.snapshot.formulaVersion}</dd></div>
                      <div><dt className="inline font-semibold text-foreground">Semântica: </dt><dd className="inline">{currentRevision.snapshot.metricFormulaVersion}</dd></div>
                      {Object.entries(currentRevision.snapshot.sources).map(([key, value]) => <div key={key}><dt className="inline font-semibold text-foreground">{key}: </dt><dd className="inline">{value}</dd></div>)}
                    </dl>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-sm font-semibold">Premissas explícitas</p>
                    {currentRevision.snapshot.assumptions.length === 0 ? <p className="mt-2 text-xs text-muted-foreground">Referência canônica sem alavancas de simulação.</p> : <ul className="mt-2 space-y-1 text-xs text-muted-foreground">{currentRevision.snapshot.assumptions.map(item => <li key={item.id}>{item.label}: {item.exactValue || String(item.calculatedInputValue)}</li>)}</ul>}
                  </div>
                </div>
                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Regras preservadas no snapshot</summary>
                  <pre className="mt-3 max-h-64 overflow-auto whitespace-pre-wrap break-words text-xs text-muted-foreground">{JSON.stringify(currentRevision.snapshot.rules, null, 2)}</pre>
                </details>

                <details className="rounded-lg border p-4">
                  <summary className="cursor-pointer text-sm font-semibold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">Histórico de {detail.revisions.length} revisão(ões)</summary>
                  <div className="mt-3 space-y-2">{detail.revisions.map(revision => <div key={revision.id} className="rounded border p-3 text-xs text-muted-foreground"><p className="font-semibold text-foreground">Revisão {revision.revisionNumber} · {revision.referenceType === 'SCENARIO' ? 'SIMULAÇÃO' : 'Base canônica'}</p><p>{revision.revisionReason}</p><p>Criada por {revision.createdByName} em {formatTimestamp(revision.createdAt)} · {revision.approvedAt ? `Aprovada por ${revision.approvedByName ?? 'Usuário removido'} em ${formatTimestamp(revision.approvedAt)}` : 'Não aprovada'}</p></div>)}</div>
                </details>
              </div>

              {currentRevision.approvedAt && comparison ? (
                <div className="space-y-3">
                  <h3 className="font-semibold">Snapshot aprovado × Base atual</h3>
                  {comparison.state === 'unavailable' ? (
                    <Alert><AlertCircle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Comparação indisponível</AlertTitle><AlertDescription>As referências não são semanticamente compatíveis: {comparison.reason}.</AlertDescription></Alert>
                  ) : (
                    <>
                      <p className="text-xs text-muted-foreground">Snapshot: {formatTimestamp(comparison.snapshotCapturedAt)} · Base atual: {formatTimestamp(comparison.currentGeneratedAt)}. A comparação não atribui causalidade às ações.</p>
                      <div className="overflow-x-auto"><table className="w-full min-w-[620px] text-sm"><thead><tr className="border-b text-left"><th className="p-2">Métrica</th><th className="p-2 text-right">Snapshot aprovado</th><th className="p-2 text-right">Base atual</th><th className="p-2 text-right">Variação</th><th className="p-2">Leitura determinística</th></tr></thead><tbody>{comparison.metrics.map(metric => <tr key={metric.key} className="border-b"><td className="p-2">{metric.key}</td><td className="p-2 text-right">{formatMetric(metric.key, metric.snapshot)}</td><td className="p-2 text-right">{formatMetric(metric.key, metric.current)}</td><td className="p-2 text-right">{metric.absoluteChange === null ? 'Indisponível' : formatMetric(metric.key, metric.absoluteChange)}{metric.percentChange === null ? '' : ` (${formatPercentBR(metric.percentChange, 1)})`}</td><td className="p-2">{metric.favorability === 'favorable' ? 'Favorável pela regra da métrica' : metric.favorability === 'unfavorable' ? 'Desfavorável pela regra da métrica' : metric.favorability === 'neutral' ? 'Sem variação material' : 'Indisponível'}</td></tr>)}</tbody></table></div>
                    </>
                  )}
                </div>
              ) : null}

              <div className="space-y-3">
                <h3 className="font-semibold">Timeline auditável</h3>
                {detail.timeline.length === 0 ? <p className="text-sm text-muted-foreground">Nenhum evento disponível.</p> : <ol className="space-y-3 border-l pl-5">{detail.timeline.map(event => <li key={event.id} className="relative"><span className="absolute -left-[1.55rem] top-1.5 h-2.5 w-2.5 rounded-full border-2 border-background bg-primary" aria-hidden="true" /><p className="text-sm font-medium">{EVENT_LABELS[event.eventType] ?? event.eventType}</p><p className="text-xs text-muted-foreground">{event.actorName} · {formatTimestamp(event.createdAt)}</p>{event.justification ? <p className="mt-1 text-xs text-muted-foreground">Justificativa: {event.justification}</p> : null}</li>)}</ol>}
              </div>

              {canApprove ? (
                <div className="flex flex-wrap gap-2 border-t pt-4">
                  {decision.status === 'DRAFT' ? <Button type="button" onClick={() => openTransition('decision', 'APPROVED')}><ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" /> Aprovar</Button> : null}
                  {['APPROVED', 'IN_PROGRESS'].includes(decision.status) ? <Button type="button" onClick={() => openTransition('decision', 'COMPLETED')} disabled={counts.pending + counts.inProgress > 0}><CheckCircle2 className="mr-2 h-4 w-4" aria-hidden="true" /> Encerrar decisão</Button> : null}
                  {['DRAFT', 'APPROVED', 'IN_PROGRESS'].includes(decision.status) ? <Button type="button" variant="destructive" onClick={() => openTransition('decision', 'CANCELLED')}><XCircle className="mr-2 h-4 w-4" aria-hidden="true" /> Cancelar decisão</Button> : null}
                  {['COMPLETED', 'CANCELLED'].includes(decision.status) ? <Button type="button" variant="outline" onClick={() => openTransition('decision', 'DRAFT')}><RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Reabrir como nova revisão</Button> : null}
                  {decision.status === 'DRAFT' ? <p className="w-full text-xs text-muted-foreground">A autoaprovação não é proibida por regra canônica; o evento registra autor e aprovador para revisão do risco.</p> : null}
                </div>
              ) : null}
            </CardContent>
          </Card>
        ) : null
      ) : null}

      <PresentationDecisionRegisterDialog
        open={registerOpen}
        onOpenChange={setRegisterOpen}
        companyId={companyId}
        userId={userId}
        period={period}
        granularity={granularity}
        defaultMode={comparisonMode}
        plan={plan}
        scenarioResult={scenarioResult}
        scenarioDraft={scenarioDraft}
        profiles={profiles}
        onCreated={decisionId => setUrlState({ decisionId })}
      />

      <Dialog open={revisionOpen} onOpenChange={open => { if (!open) requestDiscard('revision'); }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Criar nova revisão</DialogTitle><DialogDescription>O snapshot anterior permanece imutável. Se a decisão estava aprovada, ela volta a rascunho para nova aprovação.</DialogDescription></DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5"><Label>Nova referência</Label><Select value={revisionForm.sourceMode} onValueChange={value => setRevisionForm(current => ({ ...current, sourceMode: value as typeof current.sourceMode }))}><SelectTrigger><SelectValue /></SelectTrigger><SelectContent><SelectItem value="actual">Realizado atual</SelectItem><SelectItem value="budget">Orçado atual</SelectItem><SelectItem value="projection" disabled={plan.projection.state !== 'available'}>Projeção atual</SelectItem><SelectItem value="scenario" disabled={!scenarioResult || scenarioResult.activeLevers.length === 0}>Cenário explícito - SIMULAÇÃO</SelectItem></SelectContent></Select></div>
            <div className="space-y-1.5"><Label htmlFor="revision-reason">Motivo da revisão *</Label><Textarea id="revision-reason" value={revisionForm.reason} maxLength={4000} rows={4} onChange={event => setRevisionForm(current => ({ ...current, reason: event.target.value }))} /></div>
          </div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => requestDiscard('revision')}>Cancelar</Button><Button type="button" onClick={() => { void createRevision(); }} disabled={!revisionForm.reason.trim() || mutations.addRevision.isPending}>Criar revisão</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(transition)} onOpenChange={open => { if (!open) { setTransition(null); setJustification(''); } }}>
        <DialogContent>
          <DialogHeader><DialogTitle>Confirmar transição</DialogTitle><DialogDescription>Esta operação exige justificativa e será registrada na timeline antes/depois.</DialogDescription></DialogHeader>
          <div className="space-y-1.5"><Label htmlFor="transition-reason">Justificativa/observação *</Label><Textarea id="transition-reason" value={justification} maxLength={4000} rows={4} onChange={event => setJustification(event.target.value)} /></div>
          <DialogFooter><Button type="button" variant="outline" onClick={() => setTransition(null)}>Voltar</Button><Button type="button" onClick={() => { void confirmTransition(); }} disabled={!justification.trim() || mutations.transitionDecision.isPending || mutations.transitionAction.isPending}>Confirmar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <FormCloseConfirmDialog
        open={discardTarget !== null}
        onConfirmLeave={() => {
          if (discardTarget) discardEditor(discardTarget);
          setDiscardTarget(null);
        }}
        onCancelLeave={() => setDiscardTarget(null)}
      />
    </section>
  );
}

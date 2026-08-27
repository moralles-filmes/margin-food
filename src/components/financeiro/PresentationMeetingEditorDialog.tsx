import { useEffect, useMemo, useRef, useState } from 'react';
import { ArrowDown, ArrowUp, Plus, Trash2, UserPlus, X } from 'lucide-react';
import type {
  NormalizedDateRange,
  PresentationAgendaItemDraft,
  PresentationAgendaItemType,
  PresentationDecisionSummary,
  PresentationMeetingDetail,
  PresentationMeetingDraft,
  PresentationMeetingSummary,
  PresentationResponsibleProfile,
  TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { usePresentationDecisionDetail } from '@/hooks/usePresentationDecisions';
import {
  clearPresentationMeetingDraft,
  loadPresentationMeetingDraft,
  savePresentationMeetingDraft,
} from '@/lib/presentationMeetingDraft';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { DateInput } from '@/components/ui/DateInput';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import FormCloseConfirmDialog from '@/components/ui/FormCloseConfirmDialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';

const TYPE_LABELS: Record<PresentationAgendaItemType, string> = {
  FINANCIAL_OVERVIEW: 'Visão geral financeira',
  REVENUE: 'Receita',
  EXPENSE: 'Despesa',
  RESULT: 'Resultado',
  MARGIN: 'Margem',
  CMV: 'CMV',
  CATEGORY_RANKING: 'Categoria ou ranking',
  PAYABLES_RECEIVABLES: 'Contas a pagar ou receber',
  SCENARIO: 'Cenário da Fase 10',
  DECISION: 'Decisão da Fase 11',
  ACTION: 'Ação da Fase 11',
  FREE_TEXT: 'Item textual livre',
};

const EMPTY_ITEM: PresentationAgendaItemDraft = {
  itemType: 'FREE_TEXT',
  title: '',
  objective: '',
  discussionNotes: '',
  conclusion: null,
  reviewState: 'PENDING',
  referenceType: null,
  referenceId: null,
};

function newScopeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return '00000000-0000-4000-8000-000000000012';
}

function detailToDraft(detail: PresentationMeetingDetail): PresentationMeetingDraft {
  return {
    title: detail.session.title,
    context: detail.session.context,
    meetingDate: detail.session.meetingDate,
    minutesResponsibleUserId: detail.session.minutesResponsibleUserId ?? '',
    participantUserIds: detail.participants.flatMap(participant => participant.userId ? [participant.userId] : []),
    previousSessionId: detail.session.previousSessionId,
    agendaItems: detail.agendaItems.map(item => ({
      id: item.id,
      itemType: item.itemType,
      title: item.title,
      objective: item.objective,
      discussionNotes: item.discussionNotes,
      conclusion: item.conclusion,
      reviewState: item.reviewState,
      referenceType: item.referenceType,
      referenceId: item.referenceId,
    })),
  };
}

function emptyDraft(): PresentationMeetingDraft {
  return {
    title: '',
    context: '',
    meetingDate: '',
    minutesResponsibleUserId: '',
    participantUserIds: [],
    previousSessionId: null,
    agendaItems: [],
  };
}

function AgendaItemEditor({
  companyId,
  item,
  index,
  total,
  decisions,
  existingDetail,
  onChange,
  onMove,
  onRemove,
}: {
  companyId: string;
  item: PresentationAgendaItemDraft;
  index: number;
  total: number;
  decisions: readonly PresentationDecisionSummary[];
  existingDetail?: PresentationMeetingDetail;
  onChange: (item: PresentationAgendaItemDraft) => void;
  onMove: (direction: -1 | 1) => void;
  onRemove: () => void;
}) {
  const existingAction = existingDetail?.canonicalReferences.find(reference => (
    reference.entityType === 'ACTION' && reference.id === item.referenceId
  ));
  const [actionDecisionId, setActionDecisionId] = useState(existingAction?.decisionId ?? '');
  const actionDecisionQuery = usePresentationDecisionDetail(
    companyId,
    actionDecisionId || undefined,
    item.itemType === 'ACTION' && Boolean(actionDecisionId),
  );
  const decisionOptions = useMemo(() => decisions.map(decision => ({
    value: decision.id,
    label: `${decision.title} - ${decision.status} - v${decision.version}`,
  })), [decisions]);
  const actionOptions = useMemo(() => (actionDecisionQuery.data?.actions ?? []).map(action => ({
    value: action.id,
    label: `${action.description} - ${action.status} - v${action.version}`,
  })), [actionDecisionQuery.data?.actions]);

  const changeType = (itemType: PresentationAgendaItemType) => {
    setActionDecisionId('');
    onChange({
      ...item,
      itemType,
      referenceType: itemType === 'DECISION' ? 'DECISION' : itemType === 'ACTION' ? 'ACTION' : null,
      referenceId: null,
    });
  };

  return (
    <fieldset className="space-y-3 rounded-lg border bg-card/60 p-4">
      <legend className="px-1 text-sm font-semibold">Item {index + 1}</legend>
      <div className="flex flex-wrap justify-end gap-2">
        <Button type="button" size="icon" variant="outline" aria-label={`Mover item ${index + 1} para cima`} disabled={index === 0} onClick={() => onMove(-1)}>
          <ArrowUp className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" size="icon" variant="outline" aria-label={`Mover item ${index + 1} para baixo`} disabled={index === total - 1} onClick={() => onMove(1)}>
          <ArrowDown className="h-4 w-4" aria-hidden="true" />
        </Button>
        <Button type="button" size="icon" variant="destructive" aria-label={`Remover item ${index + 1}`} onClick={onRemove}>
          <Trash2 className="h-4 w-4" aria-hidden="true" />
        </Button>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor={`agenda-type-${index}`}>Tipo *</Label>
          <Select value={item.itemType} onValueChange={value => changeType(value as PresentationAgendaItemType)}>
            <SelectTrigger id={`agenda-type-${index}`}><SelectValue /></SelectTrigger>
            <SelectContent>{Object.entries(TYPE_LABELS).map(([value, label]) => <SelectItem key={value} value={value}>{label}</SelectItem>)}</SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`agenda-title-${index}`}>Título *</Label>
          <Input id={`agenda-title-${index}`} value={item.title} maxLength={200} onChange={event => onChange({ ...item, title: event.target.value })} />
        </div>
      </div>
      {item.itemType === 'DECISION' ? (
        <div className="space-y-1.5">
          <Label>Decisão canônica *</Label>
          <SearchableSelect
            value={item.referenceId ?? ''}
            options={decisionOptions}
            placeholder="Selecione a decisão"
            ariaLabel={`Decisão canônica do item ${index + 1}`}
            onValueChange={referenceId => onChange({ ...item, referenceType: 'DECISION', referenceId })}
          />
        </div>
      ) : null}
      {item.itemType === 'ACTION' ? (
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label>Decisão da ação *</Label>
            <SearchableSelect
              value={actionDecisionId}
              options={decisionOptions}
              placeholder="Selecione a decisão"
              ariaLabel={`Decisão da ação do item ${index + 1}`}
              onValueChange={value => { setActionDecisionId(value); onChange({ ...item, referenceType: 'ACTION', referenceId: null }); }}
            />
          </div>
          <div className="space-y-1.5">
            <Label>Ação canônica *</Label>
            <SearchableSelect
              value={item.referenceId ?? ''}
              options={actionOptions}
              placeholder={actionDecisionId ? 'Selecione a ação' : 'Selecione primeiro a decisão'}
              ariaLabel={`Ação canônica do item ${index + 1}`}
              disabled={!actionDecisionId || actionDecisionQuery.isPending}
              onValueChange={referenceId => onChange({ ...item, referenceType: 'ACTION', referenceId })}
            />
          </div>
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor={`agenda-objective-${index}`}>Objetivo ou pergunta</Label>
        <Textarea id={`agenda-objective-${index}`} value={item.objective} maxLength={2000} rows={2} onChange={event => onChange({ ...item, objective: event.target.value })} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={`agenda-notes-${index}`}>Notas da discussão</Label>
        <Textarea id={`agenda-notes-${index}`} value={item.discussionNotes} maxLength={20000} rows={4} onChange={event => onChange({ ...item, discussionNotes: event.target.value })} />
        <p className="text-xs text-muted-foreground">Texto não cria nem altera decisões ou ações automaticamente.</p>
      </div>
      <div className="grid gap-3 md:grid-cols-[1fr_220px]">
        <div className="space-y-1.5">
          <Label htmlFor={`agenda-conclusion-${index}`}>Conclusão textual</Label>
          <Textarea id={`agenda-conclusion-${index}`} value={item.conclusion ?? ''} maxLength={10000} rows={3} onChange={event => onChange({ ...item, conclusion: event.target.value || null })} />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor={`agenda-state-${index}`}>Revisão do item</Label>
          <Select value={item.reviewState} onValueChange={value => onChange({ ...item, reviewState: value as PresentationAgendaItemDraft['reviewState'] })}>
            <SelectTrigger id={`agenda-state-${index}`}><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="PENDING">Pendente</SelectItem>
              <SelectItem value="DISCUSSED">Discutido</SelectItem>
              <SelectItem value="CONCLUDED">Concluído</SelectItem>
              <SelectItem value="CANCELLED">Cancelado</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </fieldset>
  );
}

export default function PresentationMeetingEditorDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  period,
  granularity,
  profiles,
  decisions,
  previousSessions,
  existingDetail,
  saving,
  conflict,
  onReloadConflict,
  onReapplyConflict,
  onSave,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  profiles: readonly PresentationResponsibleProfile[];
  decisions: readonly PresentationDecisionSummary[];
  previousSessions: readonly PresentationMeetingSummary[];
  existingDetail?: PresentationMeetingDetail;
  saving: boolean;
  conflict?: string | null;
  onReloadConflict?: () => Promise<void>;
  onReapplyConflict?: () => Promise<void>;
  onSave: (draft: PresentationMeetingDraft) => Promise<boolean>;
}) {
  const newDraftScopeIdRef = useRef(newScopeId());
  const draftScopeId = existingDetail?.session.id ?? newDraftScopeIdRef.current;
  const skipAutosaveScopeRef = useRef<string | null>(null);
  const [draft, setDraft] = useState<PresentationMeetingDraft>(emptyDraft);
  const [initial, setInitial] = useState('');
  const [confirmClose, setConfirmClose] = useState(false);
  const [restored, setRestored] = useState(false);
  const [participantToAdd, setParticipantToAdd] = useState('');
  const [agendaKeys, setAgendaKeys] = useState<string[]>([]);

  useEffect(() => {
    if (!open) return;
    // Para sessão ainda não criada, o UUID local permanece estável entre
    // fechar/reabrir o diálogo nesta aba, sem herdar o escopo da última edição.
    skipAutosaveScopeRef.current = draftScopeId;
    const base = existingDetail ? detailToDraft(existingDetail) : emptyDraft();
    const local = loadPresentationMeetingDraft({ userId, companyId, sessionId: draftScopeId });
    const next = local ?? base;
    setDraft(next);
    setInitial(JSON.stringify(base));
    setRestored(Boolean(local));
    setParticipantToAdd('');
    setAgendaKeys(next.agendaItems.map(item => item.id ?? newScopeId()));
  }, [companyId, draftScopeId, existingDetail, open, userId]);

  const isDirty = JSON.stringify(draft) !== initial;
  const validForLocalDraft = Boolean(
    draft.title.trim()
    && draft.meetingDate
    && draft.minutesResponsibleUserId
    && draft.participantUserIds.length
    && draft.agendaItems.length
    && draft.agendaItems.every(item => item.title.trim() && (
      item.itemType !== 'DECISION' && item.itemType !== 'ACTION' || item.referenceId
    )),
  );

  useEffect(() => {
    if (!open) return;
    // Ao trocar de uma sessão existente para uma nova, o efeito ainda enxerga
    // o formulário anterior por um ciclo. Não o copie para o novo escopo.
    if (skipAutosaveScopeRef.current === draftScopeId) {
      skipAutosaveScopeRef.current = null;
      return;
    }
    if (!isDirty || !validForLocalDraft) return;
    try {
      savePresentationMeetingDraft({ userId, companyId, sessionId: draftScopeId, draft });
    } catch (error) {
      console.error('Não foi possível preservar o rascunho local da ata:', error);
    }
  }, [companyId, draft, draftScopeId, isDirty, open, userId, validForLocalDraft]);

  const profileOptions = profiles.map(profile => ({
    value: profile.id,
    label: profile.email ? `${profile.nome} - ${profile.email}` : profile.nome,
  }));
  const selectedParticipants = draft.participantUserIds.map(id => profiles.find(profile => profile.id === id)).filter(Boolean) as PresentationResponsibleProfile[];
  const participantOptions = profileOptions.filter(option => !draft.participantUserIds.includes(option.value));
  const previousOptions = previousSessions
    .filter(session => session.id !== existingDetail?.session.id)
    .map(session => ({ value: session.id, label: `${session.meetingDate} - ${session.title} - ${session.status}` }));

  const requestClose = () => {
    if (isDirty) setConfirmClose(true);
    else onOpenChange(false);
  };
  const moveAgenda = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= draft.agendaItems.length) return;
    const agendaItems = [...draft.agendaItems];
    [agendaItems[index], agendaItems[target]] = [agendaItems[target], agendaItems[index]];
    setDraft(current => ({ ...current, agendaItems }));
    setAgendaKeys(current => {
      const next = [...current];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };
  const submit = async () => {
    const saved = await onSave(draft);
    if (!saved) return;
    clearPresentationMeetingDraft({ userId, companyId, sessionId: draftScopeId });
    setInitial(JSON.stringify(draft));
    onOpenChange(false);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={value => { if (!value) requestClose(); }}>
        <DialogContent className="max-h-[92vh] max-w-5xl overflow-y-auto" onEscapeKeyDown={event => { if (isDirty) { event.preventDefault(); setConfirmClose(true); } }}>
          <DialogHeader>
            <DialogTitle>{existingDetail ? 'Editar sessão executiva' : 'Preparar reunião'}</DialogTitle>
            <DialogDescription>
              Período {period.start} a {period.endExclusive} · granularidade {granularity}. Data, responsável, participantes e pauta só serão registrados ao salvar.
            </DialogDescription>
          </DialogHeader>
          {restored ? (
            <Alert><AlertTitle>Rascunho local restaurado</AlertTitle><AlertDescription>Notas preservadas nesta sessão do navegador foram recuperadas. Revise antes de salvar.</AlertDescription></Alert>
          ) : null}
          {conflict ? (
            <Alert variant="destructive">
              <AlertTitle>Conflito de concorrência</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>{conflict} Sua edição local e suas notas continuam neste formulário.</p>
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="outline" onClick={() => { void onReloadConflict?.(); }}>Recarregar versão do banco</Button>
                  <Button type="button" size="sm" variant="outline" onClick={() => { void onReapplyConflict?.(); }}>Reaplicar conscientemente</Button>
                </div>
              </AlertDescription>
            </Alert>
          ) : null}
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="meeting-title">Título *</Label>
              <Input id="meeting-title" value={draft.title} maxLength={200} onChange={event => setDraft(current => ({ ...current, title: event.target.value }))} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="meeting-date">Data da reunião *</Label>
              <DateInput id="meeting-date" value={draft.meetingDate} onValueChange={meetingDate => setDraft(current => ({ ...current, meetingDate }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Responsável pela ata *</Label>
              <SearchableSelect ariaLabel="Responsável pela ata" value={draft.minutesResponsibleUserId} options={profileOptions} placeholder="Selecione explicitamente" onValueChange={minutesResponsibleUserId => setDraft(current => ({ ...current, minutesResponsibleUserId }))} />
            </div>
            <div className="space-y-1.5">
              <Label>Sessão anterior</Label>
              <SearchableSelect ariaLabel="Sessão anterior" value={draft.previousSessionId ?? ''} options={previousOptions} placeholder="Sem base de comparação" allowClear onValueChange={previousSessionId => setDraft(current => ({ ...current, previousSessionId: previousSessionId || null }))} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="meeting-context">Contexto da apresentação</Label>
            <Textarea id="meeting-context" value={draft.context} maxLength={10000} rows={3} onChange={event => setDraft(current => ({ ...current, context: event.target.value }))} />
          </div>
          <section className="space-y-3" aria-labelledby="participants-editor-title">
            <h3 id="participants-editor-title" className="font-semibold">Participantes explicitamente incluídos *</h3>
            <div className="flex gap-2">
              <div className="min-w-0 flex-1"><SearchableSelect value={participantToAdd} options={participantOptions} placeholder="Selecione um participante" onValueChange={setParticipantToAdd} /></div>
              <Button type="button" variant="outline" disabled={!participantToAdd} onClick={() => {
                if (!participantToAdd) return;
                setDraft(current => ({ ...current, participantUserIds: [...current.participantUserIds, participantToAdd] }));
                setParticipantToAdd('');
              }}><UserPlus className="mr-2 h-4 w-4" aria-hidden="true" /> Incluir</Button>
            </div>
            <ul className="flex flex-wrap gap-2">
              {selectedParticipants.map(profile => (
                <li key={profile.id} className="flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1.5 text-sm">
                  <span>{profile.nome}</span>
                  <button type="button" className="rounded-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring" aria-label={`Remover ${profile.nome}`} onClick={() => setDraft(current => ({ ...current, participantUserIds: current.participantUserIds.filter(id => id !== profile.id) }))}>
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </li>
              ))}
            </ul>
          </section>
          <section className="space-y-3" aria-labelledby="agenda-editor-title">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><h3 id="agenda-editor-title" className="font-semibold">Pauta estruturada *</h3><p className="text-xs text-muted-foreground">A ordem é persistida; use os botões de mover para operação por teclado.</p></div>
              <Button type="button" variant="outline" onClick={() => {
                setDraft(current => ({ ...current, agendaItems: [...current.agendaItems, { ...EMPTY_ITEM }] }));
                setAgendaKeys(current => [...current, newScopeId()]);
              }}><Plus className="mr-2 h-4 w-4" aria-hidden="true" /> Adicionar item</Button>
            </div>
            {draft.agendaItems.length === 0 ? <p className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">Nenhum item informado.</p> : null}
            {draft.agendaItems.map((item, index) => (
              <AgendaItemEditor
                key={agendaKeys[index] ?? item.id ?? `agenda-${index}`}
                companyId={companyId}
                item={item}
                index={index}
                total={draft.agendaItems.length}
                decisions={decisions}
                existingDetail={existingDetail}
                onChange={next => setDraft(current => ({ ...current, agendaItems: current.agendaItems.map((candidate, itemIndex) => itemIndex === index ? next : candidate) }))}
                onMove={direction => moveAgenda(index, direction)}
                onRemove={() => {
                  setDraft(current => ({ ...current, agendaItems: current.agendaItems.filter((_candidate, itemIndex) => itemIndex !== index) }));
                  setAgendaKeys(current => current.filter((_key, itemIndex) => itemIndex !== index));
                }}
              />
            ))}
          </section>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={requestClose}>Cancelar</Button>
            <Button type="button" disabled={!validForLocalDraft || saving} onClick={() => { void submit(); }}>
              {saving ? 'Salvando...' : existingDetail ? 'Salvar alterações' : 'Criar sessão'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FormCloseConfirmDialog
        open={confirmClose}
        onConfirmLeave={() => { setConfirmClose(false); onOpenChange(false); }}
        onCancelLeave={() => setConfirmClose(false)}
      />
    </>
  );
}

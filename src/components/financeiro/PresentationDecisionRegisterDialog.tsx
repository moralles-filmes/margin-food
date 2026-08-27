import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  buildPresentationDecisionSnapshot,
  assertPresentationResponsibleInTenant,
  type NormalizedDateRange,
  type PresentationComparisonMode,
  type PresentationPlanData,
  type PresentationResponsibleProfile,
  type PresentationScenarioDraft,
  type PresentationScenarioResult,
  type TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { usePresentationDecisionMutations } from '@/hooks/usePresentationDecisions';
import { useFormDirtyGuard } from '@/hooks/useFormDirtyGuard';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
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

interface RegistrationDraft {
  title: string;
  context: string;
  sourceMode: PresentationComparisonMode | 'scenario';
  executiveResponsibleUserId: string;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string;
  userId: string;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  defaultMode: PresentationComparisonMode;
  plan: PresentationPlanData;
  scenarioResult?: PresentationScenarioResult;
  scenarioDraft?: PresentationScenarioDraft;
  profiles: readonly PresentationResponsibleProfile[];
  onCreated: (decisionId: string) => void;
}

const DRAFT_TTL_MS = 24 * 60 * 60 * 1000;
const DRAFT_MAX_BYTES = 64_000;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function byteLength(value: string): number {
  return new TextEncoder().encode(value).length;
}

function isRegistrationDraft(value: unknown): value is RegistrationDraft {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const draft = value as Partial<RegistrationDraft>;
  return typeof draft.title === 'string'
    && draft.title.length <= 200
    && typeof draft.context === 'string'
    && draft.context.length <= 10_000
    && (draft.sourceMode === 'actual'
      || draft.sourceMode === 'budget'
      || draft.sourceMode === 'projection'
      || draft.sourceMode === 'scenario')
    && typeof draft.executiveResponsibleUserId === 'string'
    && (draft.executiveResponsibleUserId === '' || UUID_PATTERN.test(draft.executiveResponsibleUserId));
}

function createInitialDraft(defaultMode: PresentationComparisonMode): RegistrationDraft {
  return { title: '', context: '', sourceMode: defaultMode, executiveResponsibleUserId: '' };
}

function storageKey(companyId: string, userId: string, period: NormalizedDateRange) {
  return `presentation-decision-draft:${companyId}:${userId}:${period.start}:${period.endExclusive}`;
}

export default function PresentationDecisionRegisterDialog({
  open,
  onOpenChange,
  companyId,
  userId,
  period,
  granularity,
  defaultMode,
  plan,
  scenarioResult,
  scenarioDraft,
  profiles,
  onCreated,
}: Props) {
  const [draft, setDraft] = useState<RegistrationDraft>(() => createInitialDraft(defaultMode));
  const [hydrated, setHydrated] = useState(false);
  const mutations = usePresentationDecisionMutations(companyId);
  const key = useMemo(() => storageKey(companyId, userId, period), [companyId, period, userId]);
  const close = () => onOpenChange(false);
  const dirtyGuard = useFormDirtyGuard({ current: draft, onClose: close });
  const hasScenario = Boolean(scenarioResult && scenarioDraft && scenarioResult.activeLevers.length > 0);
  const budgetAvailable = plan.budget.revenue !== null
    && plan.budget.expense !== null
    && plan.budget.result !== null;
  const projectionAvailable = plan.projection.state === 'available' && Boolean(plan.projection.metrics);
  const responsibleOptions = profiles.map(profile => ({
    value: profile.id,
    label: profile.email ? `${profile.nome} - ${profile.email}` : profile.nome,
  }));

  useEffect(() => {
    if (!open || hydrated) return;
    let next = createInitialDraft(defaultMode);
    try {
      const stored = sessionStorage.getItem(key);
      if (stored) {
        if (byteLength(stored) > DRAFT_MAX_BYTES) throw new Error('DRAFT_TOO_LARGE');
        const parsed = JSON.parse(stored) as { savedAt?: number; draft?: RegistrationDraft };
        if (
          typeof parsed.savedAt === 'number'
          && Number.isFinite(parsed.savedAt)
          && Date.now() - parsed.savedAt <= DRAFT_TTL_MS
          && isRegistrationDraft(parsed.draft)
        ) {
          next = parsed.draft;
        } else {
          sessionStorage.removeItem(key);
        }
      }
    } catch (error) {
      console.error('Erro ao restaurar rascunho da decisão:', error);
      sessionStorage.removeItem(key);
    }
    if (next.sourceMode === 'scenario' && !hasScenario) next.sourceMode = defaultMode;
    setDraft(next);
    setHydrated(true);
  }, [defaultMode, hasScenario, hydrated, key, open]);

  useEffect(() => {
    if (!open || !hydrated) return;
    try {
      const serialized = JSON.stringify({ savedAt: Date.now(), draft });
      if (byteLength(serialized) > DRAFT_MAX_BYTES) throw new Error('DRAFT_TOO_LARGE');
      sessionStorage.setItem(key, serialized);
    } catch (error) {
      console.error('Erro ao salvar rascunho da decisão:', error);
    }
  }, [draft, hydrated, key, open]);

  useEffect(() => {
    if (open) return;
    setHydrated(false);
    setDraft(createInitialDraft(defaultMode));
  }, [defaultMode, open]);

  useEffect(() => {
    if (hydrated) dirtyGuard.markClean();
    // A hidratação define a referência limpa inicial; mudanças seguintes não
    // devem reexecutar markClean.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hydrated]);

  const submit = async () => {
    if (!draft.title.trim() || !draft.context.trim()) {
      toast.error('Informe título e contexto/justificativa.');
      return;
    }
    try {
      const snapshot = buildPresentationDecisionSnapshot({
        plan,
        period,
        granularity,
        mode: draft.sourceMode,
        scenarioResult,
        scenarioDraft,
      });
      const responsibleUserId = draft.executiveResponsibleUserId
        ? assertPresentationResponsibleInTenant(draft.executiveResponsibleUserId, profiles)
        : null;
      const result = await mutations.createDecision.mutateAsync({
        title: draft.title.trim(),
        context: draft.context.trim(),
        period,
        granularity,
        referenceType: snapshot.referenceType,
        snapshot,
        executiveResponsibleUserId: responsibleUserId,
      });
      sessionStorage.removeItem(key);
      toast.success('Decisão registrada como rascunho.');
      onCreated(result.id);
      onOpenChange(false);
    } catch (error) {
      console.error('Erro ao registrar decisão:', error);
      toast.error(error instanceof Error ? error.message : 'Não foi possível registrar a decisão.');
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={next => { if (!next) dirtyGuard.guardedClose(); }}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle>Registrar decisão</DialogTitle>
            <DialogDescription>
              Cria um rascunho governado com snapshot imutável da referência escolhida. Nenhum dado financeiro será alterado.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="decision-title">Título *</Label>
              <Input
                id="decision-title"
                value={draft.title}
                maxLength={200}
                onChange={event => setDraft(current => ({ ...current, title: event.target.value }))}
                aria-describedby="decision-title-help"
              />
              <p id="decision-title-help" className="text-xs text-muted-foreground">Até 200 caracteres.</p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="decision-context">Contexto e justificativa *</Label>
              <Textarea
                id="decision-context"
                value={draft.context}
                maxLength={10000}
                rows={5}
                onChange={event => setDraft(current => ({ ...current, context: event.target.value }))}
                aria-describedby="decision-context-help"
              />
              <p id="decision-context-help" className="text-xs text-muted-foreground">
                Registre o raciocínio apresentado pelos sócios; o sistema não inventa justificativas.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="decision-reference">Referência do snapshot</Label>
                <Select
                  value={draft.sourceMode}
                  onValueChange={value => setDraft(current => ({
                    ...current,
                    sourceMode: value as RegistrationDraft['sourceMode'],
                  }))}
                >
                  <SelectTrigger id="decision-reference"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="actual">Base canônica - realizado</SelectItem>
                    <SelectItem value="budget" disabled={!budgetAvailable}>Base canônica - orçado</SelectItem>
                    <SelectItem value="projection" disabled={!projectionAvailable}>Base canônica - projeção</SelectItem>
                    <SelectItem value="scenario" disabled={!hasScenario}>Cenário explícito - SIMULAÇÃO</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Responsável executivo</Label>
                <SearchableSelect
                  modal
                  value={draft.executiveResponsibleUserId}
                  onValueChange={value => setDraft(current => ({ ...current, executiveResponsibleUserId: value }))}
                  options={responsibleOptions}
                  placeholder="Não informado"
                  searchPlaceholder="Buscar responsável..."
                  ariaLabel="Responsável executivo da decisão"
                />
              </div>
            </div>

            {draft.sourceMode === 'scenario' ? (
              <Alert>
                <AlertTriangle className="h-4 w-4" aria-hidden="true" />
                <AlertTitle>SIMULAÇÃO</AlertTitle>
                <AlertDescription>
                  O impacto esperado e as premissas explícitas serão congelados como evidência; não são previsão garantida.
                </AlertDescription>
              </Alert>
            ) : null}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={dirtyGuard.guardedClose}>Cancelar</Button>
            <Button
              type="button"
              onClick={() => { void submit(); }}
              disabled={mutations.createDecision.isPending || !draft.title.trim() || !draft.context.trim()}
            >
              {mutations.createDecision.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : null}
              Registrar decisão
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <FormCloseConfirmDialog
        open={dirtyGuard.showConfirm}
        onConfirmLeave={dirtyGuard.confirmClose}
        onCancelLeave={dirtyGuard.cancelClose}
      />
    </>
  );
}

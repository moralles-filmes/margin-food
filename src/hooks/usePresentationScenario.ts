import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  DataAvailability,
  NormalizedDateRange,
  PresentationPlanCategory,
  PresentationPlanData,
  PresentationScenarioBaselineMode,
  PresentationScenarioDraft,
  PresentationScenarioResult,
  TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import {
  PRESENTATION_SCENARIO_MAX_STORAGE_BYTES,
  PresentationScenarioValidationError,
  buildPresentationScenario,
  createEmptyPresentationScenarioDraft,
  parsePresentationScenarioDraft,
  presentationScenarioHasChanges,
} from '@/domain/financeiro/presentation';

const STORAGE_PREFIX = 'moralles:presentation-scenario:v1';
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export interface PresentationScenarioStorageContext {
  userId: string | null | undefined;
  companyId: string | null | undefined;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  rankingLimit: number;
}

export interface UsePresentationScenarioOptions extends PresentationScenarioStorageContext {
  enabled: boolean;
  baselineMode: PresentationScenarioBaselineMode;
  planAvailability: DataAvailability<PresentationPlanData>;
  categories: readonly PresentationPlanCategory[];
}

export function buildPresentationScenarioStorageKey(
  context: PresentationScenarioStorageContext,
): string | null {
  if (!context.userId || !UUID_PATTERN.test(context.userId)) return null;
  if (!context.companyId || !UUID_PATTERN.test(context.companyId)) return null;
  if (!Number.isInteger(context.rankingLimit) || context.rankingLimit < 1 || context.rankingLimit > 50) return null;
  return [
    STORAGE_PREFIX,
    context.userId,
    context.companyId,
    context.period.start,
    context.period.endExclusive,
    context.granularity,
    context.rankingLimit,
  ].join(':');
}

export function readPresentationScenarioDraft(
  storage: Pick<Storage, 'getItem' | 'removeItem'>,
  key: string,
): PresentationScenarioDraft | null {
  const raw = storage.getItem(key);
  if (!raw) return null;
  if (raw.length > PRESENTATION_SCENARIO_MAX_STORAGE_BYTES) {
    storage.removeItem(key);
    throw new PresentationScenarioValidationError(
      'PAYLOAD_TOO_LARGE',
      'sessionStorage',
      'Rascunho local excede o limite seguro.',
    );
  }
  try {
    return parsePresentationScenarioDraft(JSON.parse(raw));
  } catch (error) {
    storage.removeItem(key);
    throw error;
  }
}

export function writePresentationScenarioDraft(
  storage: Pick<Storage, 'setItem'>,
  key: string,
  draft: PresentationScenarioDraft,
): void {
  const serialized = JSON.stringify(parsePresentationScenarioDraft(draft));
  if (serialized.length > PRESENTATION_SCENARIO_MAX_STORAGE_BYTES) {
    throw new PresentationScenarioValidationError(
      'PAYLOAD_TOO_LARGE',
      'sessionStorage',
      'Rascunho local excede o limite seguro.',
    );
  }
  storage.setItem(key, serialized);
}

function scenarioAvailability(
  enabled: boolean,
  planAvailability: DataAvailability<PresentationPlanData>,
  result: PresentationScenarioResult | null,
  validationError: PresentationScenarioValidationError | null,
): DataAvailability<PresentationScenarioResult> {
  if (!enabled) return { state: 'unavailable', reason: 'permission-denied' };
  if (planAvailability.state === 'loading' || planAvailability.state === 'idle') return { state: 'loading' };
  if (planAvailability.state === 'unavailable') return { state: 'unavailable', reason: planAvailability.reason };
  if (planAvailability.state === 'error') return { state: 'error', message: planAvailability.message };
  if (validationError) return { state: 'error', message: validationError.message };
  if (result) return { state: result.activeLevers.length > 0 ? 'available' : 'empty', data: result };
  return { state: 'idle' };
}

export function usePresentationScenario(options: UsePresentationScenarioOptions) {
  const baselineModeRef = useRef(options.baselineMode);
  baselineModeRef.current = options.baselineMode;
  const storageKey = useMemo(() => buildPresentationScenarioStorageKey({
    userId: options.userId,
    companyId: options.companyId,
    period: {
      start: options.period.start,
      endExclusive: options.period.endExclusive,
    },
    granularity: options.granularity,
    rankingLimit: options.rankingLimit,
  }), [
    options.userId,
    options.companyId,
    options.period.start,
    options.period.endExclusive,
    options.granularity,
    options.rankingLimit,
  ]);
  const [state, setState] = useState(() => ({
    key: null as string | null,
    draft: createEmptyPresentationScenarioDraft(options.baselineMode),
  }));
  const [storageError, setStorageError] = useState<string | null>(null);

  useEffect(() => {
    if (!options.enabled || !storageKey || typeof sessionStorage === 'undefined') {
      setState({ key: storageKey, draft: createEmptyPresentationScenarioDraft(baselineModeRef.current) });
      return;
    }
    try {
      const stored = readPresentationScenarioDraft(sessionStorage, storageKey);
      setState({
        key: storageKey,
        draft: { ...(stored ?? createEmptyPresentationScenarioDraft(baselineModeRef.current)), baselineMode: baselineModeRef.current },
      });
      setStorageError(null);
    } catch (error) {
      console.error('Erro ao restaurar rascunho local do cenário:', error);
      setState({ key: storageKey, draft: createEmptyPresentationScenarioDraft(baselineModeRef.current) });
      setStorageError('O rascunho local estava inválido e foi descartado com segurança.');
    }
  }, [options.enabled, storageKey]);

  useEffect(() => {
    setState(current => current.draft.baselineMode === options.baselineMode
      ? current
      : { ...current, draft: { ...current.draft, baselineMode: options.baselineMode } });
  }, [options.baselineMode]);

  useEffect(() => {
    if (!options.enabled || !storageKey || state.key !== storageKey || typeof sessionStorage === 'undefined') return;
    try {
      writePresentationScenarioDraft(sessionStorage, storageKey, state.draft);
      setStorageError(null);
    } catch (error) {
      console.error('Erro ao salvar rascunho local do cenário:', error);
      setStorageError('Não foi possível salvar o rascunho local nesta sessão.');
    }
  }, [options.enabled, state, storageKey]);

  const setDraft = useCallback((update: PresentationScenarioDraft | ((current: PresentationScenarioDraft) => PresentationScenarioDraft)) => {
    setState(current => ({
      ...current,
      draft: typeof update === 'function' ? update(current.draft) : update,
    }));
  }, []);

  const calculation = useMemo(() => {
    if (options.planAvailability.state !== 'available') {
      return { result: null, error: null };
    }
    try {
      const input = {
        plan: options.planAvailability.data,
        categories: options.categories,
        period: options.period,
        granularity: options.granularity,
      };
      const resultWithoutSensitivity = buildPresentationScenario({
        ...input,
        draft: { ...state.draft, sensitivity: null },
      });
      if (!state.draft.sensitivity) return { result: resultWithoutSensitivity, error: null };
      try {
        return {
          result: buildPresentationScenario({
            ...input,
            draft: state.draft,
          }),
          error: null,
        };
      } catch (error) {
        if (error instanceof PresentationScenarioValidationError) {
          return { result: resultWithoutSensitivity, error };
        }
        throw error;
      }
    } catch (error) {
      if (error instanceof PresentationScenarioValidationError) return { result: null, error };
      throw error;
    }
  }, [
    options.categories,
    options.granularity,
    options.period,
    options.planAvailability,
    state.draft,
  ]);

  const clearDraft = useCallback(() => {
    if (storageKey && typeof sessionStorage !== 'undefined') sessionStorage.removeItem(storageKey);
    setState(current => ({
      ...current,
      draft: createEmptyPresentationScenarioDraft(options.baselineMode),
    }));
    setStorageError(null);
  }, [options.baselineMode, storageKey]);

  return {
    draft: state.draft,
    setDraft,
    clearDraft,
    result: calculation.result,
    validationError: calculation.error,
    storageError,
    storageKey,
    isDirty: presentationScenarioHasChanges(state.draft),
    availability: scenarioAvailability(
      options.enabled,
      options.planAvailability,
      calculation.result,
      calculation.error,
    ),
  };
}

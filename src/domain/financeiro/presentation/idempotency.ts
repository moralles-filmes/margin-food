/**
 * Chaves de idempotência da criação de sessão executiva e de decisão
 * (`_guarded_create_presentation_session` / `_guarded_create_presentation_decision`).
 *
 * O conteúdo aqui precisa ser o MESMO que o servidor guarda em
 * `idempotency_fingerprint` e compara no reenvio: campo que entra na chave mas
 * não na comparação faria um retry legítimo virar REQUEST_ID_REUTILIZADO, e o
 * contrário deixaria operações diferentes com a mesma chave. Semente, derivação
 * e o porquê: `@/lib/chaveOperacao`.
 */

import { chaveOperacao } from '@/lib/chaveOperacao';
import type { PresentationDecisionReferenceType, PresentationDecisionSnapshot } from './decisions';
import type { PresentationMeetingDraft } from './meetings';
import type { NormalizedDateRange, TimeSeriesGranularity } from './contracts';

/** Sessão executiva: tudo o que o usuário informou no editor + período e granularidade. */
export function presentationSessionCreateKey(
  semente: string,
  input: {
    period: NormalizedDateRange;
    granularity: TimeSeriesGranularity;
    draft: PresentationMeetingDraft;
  },
): Promise<string> {
  return chaveOperacao(semente, {
    tipo: 'presentation-session',
    period: { start: input.period.start, endExclusive: input.period.endExclusive },
    granularity: input.granularity,
    draft: input.draft,
  });
}

/**
 * Decisão: as escolhas do usuário. O snapshot fica fora — `capturedAt` muda a
 * cada tentativa e as métricas podem ser recarregadas entre o envio que perdeu
 * a resposta e o retry; incluí-los faria o retry criar uma 2ª decisão. O
 * cenário (`scenarioDraft`) entra: é entrada do usuário e muda a decisão.
 */
export function presentationDecisionCreateKey(
  semente: string,
  input: {
    title: string;
    context: string;
    period: NormalizedDateRange;
    granularity: TimeSeriesGranularity;
    referenceType: PresentationDecisionReferenceType;
    snapshot: PresentationDecisionSnapshot;
    executiveResponsibleUserId: string | null;
  },
): Promise<string> {
  return chaveOperacao(semente, {
    tipo: 'presentation-decision',
    title: input.title,
    context: input.context,
    period: { start: input.period.start, endExclusive: input.period.endExclusive },
    granularity: input.granularity,
    referenceType: input.referenceType,
    sourceMode: input.snapshot.sourceMode,
    scenarioDraft: input.snapshot.scenarioDraft ?? null,
    executiveResponsibleUserId: input.executiveResponsibleUserId,
  });
}

import { describe, expect, it } from 'vitest';
import {
  presentationDecisionCreateKey,
  presentationSessionCreateKey,
  type PresentationDecisionSnapshot,
  type PresentationMeetingDraft,
} from '@/domain/financeiro/presentation';

const USER_A = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
const period = { start: '2026-09-01', endExclusive: '2026-10-01' };

const draft: PresentationMeetingDraft = {
  title: 'Reunião de setembro',
  context: 'Fechamento do mês',
  meetingDate: '2026-09-30',
  minutesResponsibleUserId: USER_A,
  participantUserIds: [USER_A, USER_B],
  previousSessionId: null,
  agendaItems: [{
    itemType: 'FREE_TEXT',
    title: 'Resultado',
    objective: '',
    discussionNotes: '',
    conclusion: null,
    reviewState: 'PENDING',
    referenceType: null,
    referenceId: null,
  }],
};

describe('presentationSessionCreateKey (chave derivada da criação de sessão)', () => {
  it('repetir o mesmo envio reaproveita a chave — o retry não abre 2ª sessão', async () => {
    const a = await presentationSessionCreateKey('s1', { period, granularity: 'month', draft });
    const b = await presentationSessionCreateKey('s1', {
      period: { ...period },
      granularity: 'month',
      draft: { ...draft, agendaItems: draft.agendaItems.map(item => ({ ...item })) },
    });
    expect(a).toBe(b);
    expect(a).toMatch(/^[0-9a-f]{64}$/);
  });

  it('qualquer mudança no que o usuário informou gera chave nova sozinha', async () => {
    const base = await presentationSessionCreateKey('s1', { period, granularity: 'month', draft });
    const variantes: PresentationMeetingDraft[] = [
      { ...draft, title: 'Reunião de outubro' },
      { ...draft, minutesResponsibleUserId: USER_B },
      { ...draft, participantUserIds: [USER_B, USER_A] },
      { ...draft, agendaItems: [{ ...draft.agendaItems[0], title: 'Despesas' }] },
    ];
    for (const variante of variantes) {
      expect(await presentationSessionCreateKey('s1', { period, granularity: 'month', draft: variante })).not.toBe(base);
    }
    expect(await presentationSessionCreateKey('s1', { period, granularity: 'year', draft })).not.toBe(base);
  });

  it('semente nova = sessão nova, mesmo com o mesmo conteúdo', async () => {
    expect(await presentationSessionCreateKey('s2', { period, granularity: 'month', draft }))
      .not.toBe(await presentationSessionCreateKey('s1', { period, granularity: 'month', draft }));
  });
});

function snapshot(patch: Partial<PresentationDecisionSnapshot> = {}): PresentationDecisionSnapshot {
  return {
    contractVersion: 'presentation-decision-snapshot-v1.0',
    referenceType: 'BASE',
    sourceMode: 'actual',
    period,
    granularity: 'month',
    capturedAt: '2026-09-30T12:00:00.000Z',
    cutoffDate: '2026-09-29',
    formulaVersion: 'presentation-plan-v1.0',
    metricFormulaVersion: 'managerial-result-v1.0',
    sources: { actual: 'fin_lancamentos', budget: 'fin_orcamentos', cmvTarget: 'metas_cmv.meta_cmv_total' },
    rules: {},
    metrics: { revenue: 100, expense: 50, result: 50, marginPercent: 50, cmv: null, cmvPercent: null },
    assumptions: [],
    ...patch,
  };
}

const decision = {
  title: 'Cortar frete',
  context: 'Frete subiu 20%',
  period,
  granularity: 'month' as const,
  referenceType: 'BASE' as const,
  snapshot: snapshot(),
  executiveResponsibleUserId: USER_A as string | null,
};

describe('presentationDecisionCreateKey (chave derivada do registro de decisão)', () => {
  it('snapshot recapturado no retry (capturedAt, métricas recarregadas) mantém a chave', async () => {
    const primeira = await presentationDecisionCreateKey('s1', decision);
    const retry = await presentationDecisionCreateKey('s1', {
      ...decision,
      snapshot: snapshot({
        capturedAt: '2026-09-30T12:05:00.000Z',
        metrics: { revenue: 120, expense: 50, result: 70, marginPercent: 58.3, cmv: null, cmvPercent: null },
      }),
    });
    expect(retry).toBe(primeira);
  });

  it('muda com as escolhas do usuário: texto, responsável, fonte e cenário', async () => {
    const base = await presentationDecisionCreateKey('s1', decision);
    expect(await presentationDecisionCreateKey('s1', { ...decision, title: 'Cortar frete já' })).not.toBe(base);
    expect(await presentationDecisionCreateKey('s1', { ...decision, context: 'Outro motivo' })).not.toBe(base);
    expect(await presentationDecisionCreateKey('s1', { ...decision, executiveResponsibleUserId: null })).not.toBe(base);
    expect(await presentationDecisionCreateKey('s1', { ...decision, snapshot: snapshot({ sourceMode: 'budget' }) })).not.toBe(base);

    const cenario = (nome: string) => ({ version: '1.0', name: nome }) as unknown as PresentationDecisionSnapshot['scenarioDraft'];
    const comCenario = { ...decision, referenceType: 'SCENARIO' as const, snapshot: snapshot({ referenceType: 'SCENARIO', sourceMode: 'scenario', scenarioDraft: cenario('A') }) };
    const outroCenario = { ...comCenario, snapshot: snapshot({ referenceType: 'SCENARIO', sourceMode: 'scenario', scenarioDraft: cenario('B') }) };
    expect(await presentationDecisionCreateKey('s1', outroCenario)).not.toBe(await presentationDecisionCreateKey('s1', comCenario));
  });

  it('semente nova = decisão nova, mesmo com as mesmas escolhas', async () => {
    expect(await presentationDecisionCreateKey('s2', decision)).not.toBe(await presentationDecisionCreateKey('s1', decision));
  });
});

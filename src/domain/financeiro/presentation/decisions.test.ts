import { describe, expect, it } from 'vitest';
import {
  assertPresentationResponsibleInTenant,
  buildPresentationDecisionSnapshot,
  comparePresentationDecisionSnapshot,
  isValidPresentationDecisionTransition,
  parsePresentationDecisionActionDraft,
  parsePresentationDecisionDetail,
  parsePresentationDecisionSnapshot,
  parsePresentationDecisionTransition,
  PRESENTATION_DECISION_API_VERSION,
  PRESENTATION_DECISION_MAX_SNAPSHOT_BYTES,
} from './decisions';
import { createEmptyPresentationScenarioDraft } from './scenario';
import {
  AUTHOR_ID,
  RESPONSIBLE_ID,
  createPresentationDecisionDetail,
} from '@/test/fixtures/presentationDecision';
import {
  createPresentationScenarioDraftFixture,
  createPresentationScenarioResult,
} from '@/test/fixtures/presentationScenario';
import { createPresentationPlanData } from '@/test/fixtures/presentationSocios';

const period = { start: '2026-03-01', endExclusive: '2026-04-01' } as const;
const profiles = [{ id: RESPONSIBLE_ID, nome: 'Responsável', email: 'responsavel@empresa.test', avatarUrl: null }];

describe('contratos de decisões da Apresentação Sócios', () => {
  it.each([
    ['actual' as const, 1_200, 700, 500],
    ['budget' as const, 1_100, 650, 450],
    ['projection' as const, 1_860, 1_085, 775],
  ])('registra a base %s sem recalcular ou preencher ausência com zero', (mode, revenue, expense, result) => {
    const snapshot = buildPresentationDecisionSnapshot({
      plan: createPresentationPlanData(),
      period,
      granularity: 'month',
      mode,
      capturedAt: '2026-03-20T10:00:00-03:00',
    });
    expect(snapshot).toMatchObject({
      referenceType: 'BASE',
      sourceMode: mode,
      metrics: { revenue, expense, result },
      formulaVersion: 'presentation-plan-v1.0',
      sources: {
        actual: 'fin_lancamentos',
        budget: 'fin_orcamentos',
        cmvTarget: 'metas_cmv.meta_cmv_total',
      },
    });
  });

  it('preserva cenário válido, alavancas explícitas e representação monetária exata', () => {
    const result = createPresentationScenarioResult();
    const draft = createPresentationScenarioDraftFixture();
    const snapshot = buildPresentationDecisionSnapshot({
      plan: createPresentationPlanData(),
      period,
      granularity: 'month',
      mode: 'scenario',
      scenarioResult: result,
      scenarioDraft: draft,
      capturedAt: '2026-03-20T10:00:00-03:00',
    });
    expect(snapshot.referenceType).toBe('SCENARIO');
    expect(snapshot.formulaVersion).toBe('presentation-scenario-v1.0');
    expect(snapshot.assumptions).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: 'revenue-total', exactValue: '100,00', calculatedInputValue: 100 }),
    ]));
    expect(JSON.stringify(snapshot)).not.toMatch(/NaN|Infinity/);
  });

  it('rejeita cenário vazio, cenário não finito e fórmula/source incompatíveis', () => {
    expect(() => buildPresentationDecisionSnapshot({
      plan: createPresentationPlanData(),
      period,
      granularity: 'month',
      mode: 'scenario',
      scenarioResult: createPresentationScenarioResult(),
      scenarioDraft: createEmptyPresentationScenarioDraft(),
    })).toThrowError();

    const valid = buildPresentationDecisionSnapshot({
      plan: createPresentationPlanData(),
      period,
      granularity: 'month',
      mode: 'actual',
    });
    expect(() => parsePresentationDecisionSnapshot({
      ...valid,
      metrics: { ...valid.metrics, result: Number.POSITIVE_INFINITY },
    })).toThrowError(expect.objectContaining({ code: 'NON_FINITE_NUMBER' }));
    expect(() => parsePresentationDecisionSnapshot({
      ...valid,
      formulaVersion: 'presentation-scenario-v1.0',
    })).toThrowError(expect.objectContaining({ code: 'FORMULA_INCOMPATIBLE' }));
    expect(() => parsePresentationDecisionSnapshot({
      ...valid,
      sources: { ...valid.sources, actual: 'fonte-paralela' },
    })).toThrowError(expect.objectContaining({ code: 'SOURCE_INCOMPATIBLE' }));
  });

  it('mantém o snapshot histórico independente de mudanças posteriores na fonte canônica', () => {
    const plan = createPresentationPlanData();
    const snapshot = buildPresentationDecisionSnapshot({ plan, period, granularity: 'month', mode: 'actual' });
    const changedPlan = createPresentationPlanData({
      actual: { ...plan.actual, revenue: 9_999, result: 9_299 },
    });
    expect(snapshot.metrics.revenue).toBe(1_200);
    expect(changedPlan.actual.revenue).toBe(9_999);
    expect(snapshot.metrics).not.toBe(changedPlan.actual);
  });

  it('preserva revisão aprovada no detalhe e rejeita substituição/estrutura auditável inválida', () => {
    const detail = createPresentationDecisionDetail();
    const parsed = parsePresentationDecisionDetail(structuredClone(detail));
    expect(parsed.revisions).toHaveLength(1);
    expect(parsed.revisions[0].approvedAt).not.toBeNull();
    expect(parsed.decision.currentRevisionId).toBe(parsed.revisions[0].id);

    expect(() => parsePresentationDecisionDetail({
      ...structuredClone(detail),
      contractVersion: 'unknown',
    })).toThrowError(expect.objectContaining({ code: 'UNKNOWN_VERSION' }));
    expect(() => parsePresentationDecisionDetail({
      ...structuredClone(detail),
      decision: { ...detail.decision, currentRevisionId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
    })).toThrowError(expect.objectContaining({ code: 'REVISION_INVALID' }));
  });

  it('valida transições possíveis, justificativa, UUID e timestamp esperados', () => {
    expect(isValidPresentationDecisionTransition('DRAFT', 'APPROVED')).toBe(true);
    expect(isValidPresentationDecisionTransition('APPROVED', 'DRAFT')).toBe(false);
    expect(parsePresentationDecisionTransition({
      contractVersion: PRESENTATION_DECISION_API_VERSION,
      entity: 'decision',
      entityId: AUTHOR_ID,
      expectedStatus: 'DRAFT',
      targetStatus: 'APPROVED',
      justification: 'Aprovada após revisão explícita.',
      expectedUpdatedAt: '2026-03-20T10:00:00-03:00',
    })).toMatchObject({ targetStatus: 'APPROVED' });
    expect(() => parsePresentationDecisionTransition({
      contractVersion: PRESENTATION_DECISION_API_VERSION,
      entity: 'decision',
      entityId: AUTHOR_ID,
      expectedStatus: 'APPROVED',
      targetStatus: 'DRAFT',
      justification: 'Tentativa inválida.',
      expectedUpdatedAt: '2026-03-20T10:00:00-03:00',
    })).toThrowError(expect.objectContaining({ code: 'TRANSITION_INVALID' }));
    expect(() => parsePresentationDecisionTransition({
      contractVersion: PRESENTATION_DECISION_API_VERSION,
      entity: 'decision',
      entityId: 'não-é-uuid',
      expectedStatus: 'DRAFT',
      targetStatus: 'APPROVED',
      justification: '',
      expectedUpdatedAt: 'data-inválida',
    })).toThrowError();
  });

  it('rejeita responsável externo ao conjunto tenant-scoped e campos excessivos', () => {
    expect(assertPresentationResponsibleInTenant(RESPONSIBLE_ID, profiles)).toBe(RESPONSIBLE_ID);
    expect(() => assertPresentationResponsibleInTenant(AUTHOR_ID, profiles))
      .toThrowError(expect.objectContaining({ code: 'RESPONSIBLE_OUT_OF_TENANT' }));
    expect(() => parsePresentationDecisionActionDraft({
      description: 'x'.repeat(1_001),
      responsibleUserId: RESPONSIBLE_ID,
      dueDate: '2026-04-10',
      priority: null,
    }, profiles)).toThrowError(expect.objectContaining({ code: 'MALFORMED_PAYLOAD' }));
  });

  it('limita o payload e rejeita percentuais inventados quando receita é zero', () => {
    const snapshot = buildPresentationDecisionSnapshot({
      plan: createPresentationPlanData(), period, granularity: 'month', mode: 'actual',
    });
    expect(() => parsePresentationDecisionSnapshot({
      ...snapshot,
      rules: { huge: 'x'.repeat(PRESENTATION_DECISION_MAX_SNAPSHOT_BYTES) },
    })).toThrowError(expect.objectContaining({ code: 'PAYLOAD_TOO_LARGE' }));
    expect(() => parsePresentationDecisionSnapshot({
      ...snapshot,
      metrics: { ...snapshot.metrics, revenue: 0, marginPercent: 0, cmvPercent: 0 },
    })).toThrowError(expect.objectContaining({ code: 'METRIC_INCOMPATIBLE' }));
  });

  it('compara fatos equivalentes sem inferir causalidade e mantém base zero indisponível', () => {
    const plan = createPresentationPlanData();
    const snapshot = buildPresentationDecisionSnapshot({ plan, period, granularity: 'month', mode: 'actual' });
    const comparison = comparePresentationDecisionSnapshot(snapshot, createPresentationPlanData({
      generatedAt: '2026-08-26T12:00:00-03:00',
      actual: { ...plan.actual, revenue: 1_300, expense: 680, result: 620 },
    }));
    expect(comparison.state).toBe('available');
    if (comparison.state !== 'available') return;
    expect(comparison.metrics.find(metric => metric.key === 'revenue')).toMatchObject({
      absoluteChange: 100,
      favorability: 'favorable',
    });
    const zeroSnapshot = parsePresentationDecisionSnapshot({
      ...snapshot,
      metrics: { revenue: 0, expense: -20, result: 20, marginPercent: null, cmv: null, cmvPercent: null },
    });
    const zeroComparison = comparePresentationDecisionSnapshot(zeroSnapshot, createPresentationPlanData({
      actual: { revenue: 10, expense: -20, result: 30, marginPercent: 300, cmv: null, cmvPercent: null },
    }));
    expect(zeroComparison.state).toBe('available');
    if (zeroComparison.state === 'available') {
      expect(zeroComparison.metrics.find(metric => metric.key === 'revenue')?.percentChange).toBeNull();
    }
  });

  it.each([
    ['period-incompatible', createPresentationPlanData({ range: { start: '2026-04-01', endExclusive: '2026-05-01' } })],
    ['source-incompatible', createPresentationPlanData({
      sources: {
        actual: 'outra_fonte',
        budget: 'fin_orcamentos',
        cmvTarget: 'metas_cmv.meta_cmv_total',
      } as unknown as ReturnType<typeof createPresentationPlanData>['sources'],
    })],
  ] as const)('marca comparação %s como indisponível', (reason, currentPlan) => {
    const snapshot = buildPresentationDecisionSnapshot({
      plan: createPresentationPlanData(), period, granularity: 'month', mode: 'actual',
    });
    expect(comparePresentationDecisionSnapshot(snapshot, currentPlan)).toEqual({ state: 'unavailable', reason });
  });
});

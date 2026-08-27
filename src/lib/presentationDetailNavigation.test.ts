import { describe, expect, it } from 'vitest';
import { normalizePresentationPeriod } from '@/domain/financeiro/presentation';
import {
  buildPresentationDashboardPath,
  buildPresentationDetailPath,
  buildPresentationSearchParams,
  copyPresentationDecisionParams,
  readPresentationDecisionUrlState,
  readPresentationMeetingUrlState,
  readPresentationCategoryId,
  readPresentationNavigationContext,
  readPresentationReturnAnchor,
  writePresentationDecisionUrlState,
  writePresentationMeetingUrlState,
} from '@/lib/presentationDetailNavigation';

describe('navegação dos detalhes da Apresentação Sócios', () => {
  it('serializa e restaura período, datas, granularidade, ranking e posição de retorno', () => {
    const filter = { kind: 'month-range' as const, startMonth: '2026-01', endMonth: '2026-03' };
    const period = normalizePresentationPeriod(filter);
    const categoryId = '123e4567-e89b-42d3-a456-426614174000';
    const params = buildPresentationSearchParams(
      { filter, granularity: 'month', rankingLimit: 15, comparisonMode: 'budget' },
      period,
      { categoryId, returnAnchor: 'financial-tree' },
    );

    expect(params.get('from')).toBe('2026-01-01');
    expect(params.get('to')).toBe('2026-04-01');
    expect(params.get('mode')).toBe('budget');
    expect(readPresentationCategoryId(params)).toBe(categoryId);
    expect(readPresentationReturnAnchor(params)).toBe('financial-tree');
    expect(readPresentationNavigationContext(params, '2026-08-25')).toMatchObject({
      filter,
      granularity: 'month',
      rankingLimit: 15,
      comparisonMode: 'budget',
    });
    expect(buildPresentationDetailPath('cmv', params)).toContain('/financeiro/relatorio-socios/cmv?');
    expect(buildPresentationDashboardPath(params)).toContain('/financeiro/relatorio-socios?');
  });

  it('preserva o modo Total com limites explícitos no deep link', () => {
    const filter = { kind: 'all-time' as const };
    const period = normalizePresentationPeriod(filter, {
      availableBounds: { minDate: '2024-02-01', maxDate: '2026-08-25' },
    });
    const params = buildPresentationSearchParams(
      { filter, granularity: 'year', rankingLimit: 20, comparisonMode: 'projection' },
      period,
    );

    expect(readPresentationNavigationContext(params, '2026-08-25')).toEqual({
      filter,
      granularity: 'year',
      rankingLimit: 20,
      comparisonMode: 'projection',
      availableBounds: { minDate: '2024-02-01', maxDate: '2026-08-25' },
    });
  });

  it('descarta categoria e contexto inválidos sem produzir intervalo inseguro', () => {
    const params = new URLSearchParams('period=custom&from=invalida&to=2026-01-01&category=outro-tenant&rankingLimit=999');
    const context = readPresentationNavigationContext(params, '2026-08-25');
    expect(context.filter).toEqual({ kind: 'month', month: '2026-08' });
    expect(context.rankingLimit).toBe(10);
    expect(readPresentationCategoryId(params)).toBeUndefined();
  });

  it('valida, serializa e preserva decisão e filtros executivos no deep link', () => {
    const decisionId = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const responsibleId = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
    const base = new URLSearchParams('period=month&month=2026-03&granularity=month&rankingLimit=15&mode=budget');
    const params = writePresentationDecisionUrlState(base, {
      decisionId,
      status: 'IN_PROGRESS',
      responsibleUserId: responsibleId,
      dueFilter: 'overdue',
      search: 'custos executivos',
      page: 3,
    });
    expect(readPresentationDecisionUrlState(params)).toEqual({
      decisionId,
      status: 'IN_PROGRESS',
      responsibleUserId: responsibleId,
      dueFilter: 'overdue',
      search: 'custos executivos',
      page: 3,
    });
    expect(readPresentationNavigationContext(params, '2026-08-25')).toMatchObject({
      filter: { kind: 'month', month: '2026-03' },
      granularity: 'month',
      rankingLimit: 15,
      comparisonMode: 'budget',
    });
    const target = copyPresentationDecisionParams(params, new URLSearchParams('period=month&month=2026-04'));
    expect(readPresentationDecisionUrlState(target)).toEqual(readPresentationDecisionUrlState(params));
    expect(buildPresentationDashboardPath(target)).toContain(`decision=${decisionId}`);
  });

  it('descarta UUID, enum, prazo e paginação inválidos sem escolher outro registro', () => {
    const params = new URLSearchParams(
      'decision=outro-tenant&decisionResponsible=invalido&decisionStatus=HIDDEN&decisionDue=never&decisionPage=-4&decisionSearch=' + 'x'.repeat(150),
    );
    expect(readPresentationDecisionUrlState(params)).toEqual({
      decisionId: undefined,
      responsibleUserId: undefined,
      status: undefined,
      dueFilter: 'all',
      search: 'x'.repeat(100),
      page: 1,
    });
  });

  it('preserva sessão, pauta, revisão e filtros de follow-up no deep link', () => {
    const sessionId = '11111111-2222-4111-8111-111111111111';
    const agendaItemId = '55555555-2222-4555-8555-555555555555';
    const revisionId = '33333333-2222-4333-8333-333333333333';
    const responsibleId = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc';
    const participantId = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd';
    const base = new URLSearchParams('period=month&month=2026-03&granularity=month&mode=actual');
    const params = writePresentationMeetingUrlState(base, {
      sessionId,
      agendaItemId,
      revisionId,
      status: 'IN_REVIEW',
      responsibleUserId: responsibleId,
      participantUserId: participantId,
      followUpFilter: 'due-soon',
      followUpDueEnd: '2026-04-20',
      search: 'ritual março',
      page: 4,
    });
    expect(readPresentationMeetingUrlState(params)).toEqual({
      sessionId,
      agendaItemId,
      revisionId,
      status: 'IN_REVIEW',
      responsibleUserId: responsibleId,
      participantUserId: participantId,
      followUpFilter: 'due-soon',
      followUpDueEnd: '2026-04-20',
      search: 'ritual março',
      page: 4,
    });
    const target = copyPresentationDecisionParams(params, new URLSearchParams('period=month&month=2026-04'));
    expect(readPresentationMeetingUrlState(target)).toEqual(readPresentationMeetingUrlState(params));
  });

  it('descarta deep link de reunião inválido sem selecionar outra sessão como fallback', () => {
    const params = new URLSearchParams(
      `session=outro-tenant&agendaItem=inválido&revision=ruim&sessionStatus=HIDDEN&sessionResponsible=x&sessionParticipant=y&followUp=risk&followUpDueEnd=2026-99-99&sessionPage=10001&sessionSearch=${'x'.repeat(150)}`,
    );
    expect(readPresentationMeetingUrlState(params)).toEqual({
      sessionId: undefined,
      agendaItemId: undefined,
      revisionId: undefined,
      responsibleUserId: undefined,
      participantUserId: undefined,
      status: undefined,
      followUpFilter: 'all',
      followUpDueEnd: undefined,
      search: 'x'.repeat(100),
      page: 1,
    });
  });
});

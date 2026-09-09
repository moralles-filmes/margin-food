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
  it('preserva Total ao trocar de unidade antes de descobrir os limites da nova loja', () => {
    const context = readPresentationNavigationContext(new URLSearchParams('period=all-time&presentationUnit=B'), '2026-09-09');
    expect(context.filter).toEqual({ kind:'all-time' });
    expect(context.availableBounds).toBeUndefined();
  });
  it('serializa e restaura período, datas, granularidade, ranking e posição de retorno', () => {
    const filter = { kind: 'month-range' as const, startMonth: '2026-01', endMonth: '2026-03' };
    const period = normalizePresentationPeriod(filter);
    const categoryId = '123e4567-e89b-42d3-a456-426614174000';
    const params = buildPresentationSearchParams(
      {
        filter,
        granularity: 'month',
        rankingLimit: 15,
        comparisonMode: 'budget',
        historyYears: [2024, 2025, 2026],
      },
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
      historyYears: [2024, 2025, 2026],
    });
    expect(buildPresentationDetailPath('cmv', params)).toContain('/financeiro/apresentacao-socios/cmv?');
    const expensePath = buildPresentationDetailPath('expenses', params);
    expect(expensePath).toContain('/financeiro/apresentacao-socios/expenses?');
    const expenseParams = new URL(expensePath, 'https://local.test').searchParams;
    expect(expenseParams.get('category')).toBe(categoryId);
    expect(expenseParams.get('from')).toBe('2026-01-01');
    expect(expenseParams.get('to')).toBe('2026-04-01');
    expect(expenseParams.get('granularity')).toBe('month');
    expect(expenseParams.get('mode')).toBe('budget');
    expect(expenseParams.get('years')).toBe('2024,2025,2026');
    expect(buildPresentationDashboardPath(params)).toContain('/financeiro/apresentacao-socios?');
  });

  it('preserva o modo Total com limites explícitos no deep link', () => {
    const filter = { kind: 'all-time' as const };
    const period = normalizePresentationPeriod(filter, {
      availableBounds: { minDate: '2024-02-01', maxDate: '2026-08-25' },
    });
    const params = buildPresentationSearchParams(
      {
        filter,
        granularity: 'year',
        rankingLimit: 20,
        comparisonMode: 'projection',
        historyYears: [2025, 2026],
      },
      period,
    );

    expect(readPresentationNavigationContext(params, '2026-08-25')).toEqual({
      filter,
      granularity: 'year',
      rankingLimit: 20,
      comparisonMode: 'projection',
      historyYears: [2025, 2026],
      availableBounds: { minDate: '2024-02-01', maxDate: '2026-08-25' },
    });
  });

  it('restaura de um a três anos e rejeita um quarto ano no deep link', () => {
    const valid = readPresentationNavigationContext(
      new URLSearchParams('period=month&month=2026-03&years=2024,2025,2026'),
      '2026-08-25',
    );
    expect(valid.historyYears).toEqual([2024, 2025, 2026]);

    const invalid = readPresentationNavigationContext(
      new URLSearchParams('period=month&month=2026-03&years=2023,2024,2025,2026'),
      '2026-08-25',
    );
    expect(invalid.historyYears).toEqual([2024, 2025, 2026]);
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

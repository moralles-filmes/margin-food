import { lazy, Suspense, useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { AlertCircle, BarChart3, Loader2, RefreshCw, ShieldX, Star } from 'lucide-react';
import type {
  AvailablePeriodBounds,
  DataAvailability,
  PresentationComparisonMode,
  PresentationPeriodFilter,
  TimeSeriesGranularity,
} from '@/domain/financeiro/presentation';
import { normalizePresentationPeriod, presentationRevenueMonthFromPeriod } from '@/domain/financeiro/presentation';
import { comparePresentationDecisionSnapshot } from '@/domain/financeiro/presentation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import PresentationAnalytics from '@/components/financeiro/PresentationAnalytics';
import PresentationDetailPage from '@/components/financeiro/PresentationDetailPage';
import PresentationExpensesDetailPage from '@/components/financeiro/PresentationExpensesDetailPage';
import PresentationDecisionGovernance from '@/components/financeiro/PresentationDecisionGovernance';
import PresentationMeetingGovernance from '@/components/financeiro/PresentationMeetingGovernance';
import PresentationPeriodFilters from '@/components/financeiro/PresentationPeriodFilters';
import PresentationScenarioSection from '@/components/financeiro/PresentationScenarioSection';
import { usePresentationSocios } from '@/hooks/usePresentationSocios';
import { usePresentationRevenue } from '@/hooks/usePresentationRevenue';
import { usePresentationExpenses } from '@/hooks/usePresentationExpenses';
import { usePresentationCategoryMetadata } from '@/hooks/usePresentationCategoryMetadata';
import { usePresentationPlan } from '@/hooks/usePresentationPlan';
import { usePresentationScenario } from '@/hooks/usePresentationScenario';
import { usePresentationDecisionDetail } from '@/hooks/usePresentationDecisions';
import { todayBR } from '@/lib/formatters';
import {
  attachPresentationPlan,
  attachPresentationDecision,
  attachPresentationScenario,
  attachPresentationRevenue,
  attachPresentationExpenses,
  attachPresentationInsights,
  type PresentationSociosData,
} from '@/lib/financeiroPresentationAdapter';
import {
  createPresentationFilterDraftFromFilter,
} from '@/lib/presentationFilters';
import {
  buildPresentationDashboardPath,
  buildPresentationDetailPath,
  buildPresentationSearchParams,
  copyPresentationDecisionParams,
  PRESENTATION_BASE_PATH,
  readPresentationCategoryId,
  readPresentationNavigationContext,
  readPresentationDecisionUrlState,
  readPresentationReturnAnchor,
  type PresentationDetailTarget,
  type PresentationReturnAnchor,
} from '@/lib/presentationDetailNavigation';
import { useCan } from '@/permissions/hooks';
import { useAuth } from '@/contexts/AuthContext';

const PresentationMode = lazy(() => import('@/components/financeiro/PresentationMode'));

function sameBounds(left?: AvailablePeriodBounds, right?: AvailablePeriodBounds): boolean {
  return left?.minDate === right?.minDate && left?.maxDate === right?.maxDate;
}

function planFiltersForDetail(target: PresentationDetailTarget | undefined) {
  if (target === 'revenue' || target === 'ranking-revenue') {
    return { categoryNature: 'RECEITA' as const };
  }
  if (target === 'expense' || target === 'ranking-expense') {
    return { categoryNature: 'DESPESA' as const };
  }
  if (target === 'cmv') {
    return { categoryNature: 'DESPESA' as const, categoryGroup: 'cmv' };
  }
  return {};
}

export function PresentationRequestState({
  availability,
  onRetry,
}: {
  availability: DataAvailability<PresentationSociosData>;
  onRetry: () => void;
}) {
  if (availability.state === 'unavailable' && availability.reason === 'permission-denied') {
    return (
      <Card>
        <CardContent className="flex flex-col items-center justify-center gap-2 p-12 text-center">
          <ShieldX className="h-10 w-10 text-muted-foreground/50" aria-hidden="true" />
          <h2 className="font-semibold text-foreground">Acesso restrito</h2>
          <p className="text-sm text-muted-foreground">
            É necessária a permissão financeiro:relatorio-socios:view para acessar esta apresentação.
          </p>
        </CardContent>
      </Card>
    );
  }

  if (availability.state === 'error') {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" aria-hidden="true" />
        <AlertTitle>Erro ao carregar a apresentação</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
          <span>{availability.message}</span>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" /> Tentar novamente
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (availability.state === 'loading' || availability.state === 'idle') {
    return (
      <Card aria-busy="true">
        <CardContent className="space-y-4 p-6">
          <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            Carregando dados consolidados da apresentação...
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map(item => <Skeleton key={item} className="h-32" />)}
          </div>
          <Skeleton className="h-72" />
        </CardContent>
      </Card>
    );
  }

  return null;
}

export default function ApresentacaoSociosSection({
  detailTarget,
  invalidDetail = false,
}: {
  detailTarget?: PresentationDetailTarget;
  invalidDetail?: boolean;
}) {
  const { profile, user } = useAuth();
  const canView = useCan('financeiro:relatorio-socios:view');
  const canExport = useCan('financeiro:relatorio-socios:export');
  const canSimulate = useCan('financeiro:relatorio-socios:simulate');
  const canManageDecisions = useCan('financeiro:relatorio-socios:manage');
  const canApproveDecisions = useCan('financeiro:relatorio-socios:approve');
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const today = useMemo(() => todayBR(), []);
  const initialNavigation = useMemo(
    () => readPresentationNavigationContext(searchParams, today),
    // O estado de rota só deve inicializar o workspace; mudanças seguintes são
    // controladas pelos filtros e preservadas ao navegar entre detalhes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );
  const initialDraft = useMemo(
    () => createPresentationFilterDraftFromFilter(initialNavigation.filter, today),
    [initialNavigation.filter, today],
  );
  const [filter, setFilter] = useState<PresentationPeriodFilter>(initialNavigation.filter);
  const [granularity, setGranularity] = useState<TimeSeriesGranularity>(initialNavigation.granularity);
  const [rankingLimit, setRankingLimit] = useState(initialNavigation.rankingLimit);
  const [comparisonMode, setComparisonMode] = useState<PresentationComparisonMode>(initialNavigation.comparisonMode);
  const [historyYears, setHistoryYears] = useState<readonly number[]>(initialNavigation.historyYears);
  const [availableBounds, setAvailableBounds] = useState<AvailablePeriodBounds | undefined>(initialNavigation.availableBounds);
  const [workspaceView, setWorkspaceView] = useState<'presentation' | 'preparation'>(
    detailTarget ? 'preparation' : 'presentation',
  );
  const query = usePresentationSocios({
    companyId: profile?.company_id,
    filter,
    availableBounds,
    granularity,
    rankingLimit,
    enabled: canView,
  });
  const revenueMonth = presentationRevenueMonthFromPeriod(query.definition.context.period);
  const revenueQuery = usePresentationRevenue({
    companyId: profile?.company_id,
    month: revenueMonth,
    historyYears,
    enabled: canView,
  });
  const expensesQuery = usePresentationExpenses({
    companyId: profile?.company_id,
    month: revenueMonth,
    historyYears,
    enabled: canView,
  });
  const categoryMetadataQuery = usePresentationCategoryMetadata(profile?.company_id, canView);
  const categoryId = readPresentationCategoryId(searchParams);
  const decisionUrlState = readPresentationDecisionUrlState(searchParams);
  const returnAnchor = readPresentationReturnAnchor(searchParams);
  const planDetailFilters = planFiltersForDetail(detailTarget);
  const planQuery = usePresentationPlan({
    companyId: profile?.company_id,
    range: query.definition.context.period,
    granularity,
    enabled: canView,
    pageSize: 50,
  });
  const fetchNextPlanPage = planQuery.fetchNextPage;
  const detailPlanQuery = usePresentationPlan({
    companyId: profile?.company_id,
    range: query.definition.context.period,
    granularity,
    categoryNature: planDetailFilters.categoryNature,
    categoryGroup: planDetailFilters.categoryGroup,
    categoryId,
    enabled: canView && Boolean(detailTarget) && detailTarget !== 'expenses',
  });
  const presentationData = useMemo(
    () => query.data
      ? attachPresentationPlan(
          attachPresentationInsights(
            attachPresentationExpenses(
              attachPresentationRevenue(query.data, revenueQuery.availability),
              expensesQuery.availability,
            ),
          ),
          planQuery.availability,
        )
      : undefined,
    [expensesQuery.availability, planQuery.availability, query.data, revenueQuery.availability],
  );
  const scenarioPlanAvailability = useMemo(() => (
    canSimulate
    && planQuery.availability.state === 'available'
    && (planQuery.hasNextPage || planQuery.isFetchingNextPage)
      ? { state: 'loading' as const }
      : planQuery.availability
  ), [canSimulate, planQuery.availability, planQuery.hasNextPage, planQuery.isFetchingNextPage]);
  const scenario = usePresentationScenario({
    enabled: canSimulate,
    userId: user?.id,
    companyId: profile?.company_id,
    period: query.definition.context.period,
    granularity,
    rankingLimit,
    baselineMode: comparisonMode,
    planAvailability: scenarioPlanAvailability,
    categories: planQuery.categories,
  });
  const presentationDataWithScenario = useMemo(() => {
    if (!presentationData || !scenario.result || scenario.validationError) return presentationData;
    return attachPresentationScenario(presentationData, {
      state: scenario.result.activeLevers.length > 0 ? 'available' : 'empty',
      data: scenario.result,
    });
  }, [presentationData, scenario.result, scenario.validationError]);
  const exportDecisionQuery = usePresentationDecisionDetail(
    profile?.company_id,
    decisionUrlState.decisionId,
    canView && canExport,
  );
  const presentationDataWithDecision = useMemo(() => {
    if (!presentationDataWithScenario || !exportDecisionQuery.data || !planQuery.firstPage) {
      return presentationDataWithScenario;
    }
    const detail = exportDecisionQuery.data;
    const revision = detail.revisions.find(item => item.id === detail.decision.currentRevisionId);
    if (!revision?.approvedAt || detail.decision.status === 'DRAFT') return presentationDataWithScenario;
    return attachPresentationDecision(presentationDataWithScenario, {
      state: 'available',
      data: {
        detail,
        comparison: comparePresentationDecisionSnapshot(revision.snapshot, planQuery.firstPage),
      },
      fetchedAt: detail.fetchedAt,
    });
  }, [exportDecisionQuery.data, planQuery.firstPage, presentationDataWithScenario]);

  useEffect(() => {
    const nextBounds = query.data?.availableBounds;
    if (nextBounds && !sameBounds(availableBounds, nextBounds)) setAvailableBounds(nextBounds);
  }, [availableBounds, query.data?.availableBounds]);

  useEffect(() => {
    if (detailTarget) setWorkspaceView('preparation');
  }, [detailTarget]);

  useEffect(() => {
    if (query.error) console.error('Erro ao carregar Apresentação Sócios:', query.error);
  }, [query.error]);

  useEffect(() => {
    if (revenueQuery.error) console.error('Erro ao carregar Faturamento da Apresentação Sócios:', revenueQuery.error);
  }, [revenueQuery.error]);

  useEffect(() => {
    if (expensesQuery.error) console.error('Erro ao carregar Despesas da Apresentação Sócios:', expensesQuery.error);
  }, [expensesQuery.error]);

  useEffect(() => {
    if (categoryMetadataQuery.error) {
      console.error('Erro ao carregar metadados gerenciais da Apresentação Sócios:', categoryMetadataQuery.error);
    }
  }, [categoryMetadataQuery.error]);

  useEffect(() => {
    if (!canSimulate || !planQuery.hasNextPage || planQuery.isFetchingNextPage) return;
    void fetchNextPlanPage();
  }, [canSimulate, fetchNextPlanPage, planQuery.hasNextPage, planQuery.isFetchingNextPage]);

  useEffect(() => {
    if (detailTarget || !returnAnchor) return;
    const idByAnchor: Record<PresentationReturnAnchor, string> = {
      'executive-summary': 'presentation-executive-summary',
      plan: 'presentation-plan',
      'financial-tree': 'presentation-financial-tree',
      'open-items': 'presentation-open-items',
      rankings: 'presentation-rankings',
    };
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(idByAnchor[returnAnchor])?.scrollIntoView({ block: 'start' });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [detailTarget, returnAnchor, query.availability.state]);

  const buildContextParams = (
    nextFilter: PresentationPeriodFilter,
    nextGranularity: TimeSeriesGranularity,
    nextRankingLimit: number,
    nextComparisonMode: PresentationComparisonMode,
    detail?: { categoryId?: string; returnAnchor: PresentationReturnAnchor },
    nextHistoryYears: readonly number[] = historyYears,
  ) => {
    const period = normalizePresentationPeriod(nextFilter, { availableBounds });
    const params = buildPresentationSearchParams(
      {
        filter: nextFilter,
        granularity: nextGranularity,
        rankingLimit: nextRankingLimit,
        comparisonMode: nextComparisonMode,
        historyYears: nextHistoryYears,
      },
      period,
      detail,
    );
    return copyPresentationDecisionParams(searchParams, params);
  };

  const syncCurrentRoute = (
    nextFilter: PresentationPeriodFilter,
    nextGranularity: TimeSeriesGranularity,
    nextRankingLimit: number,
    nextComparisonMode: PresentationComparisonMode,
    nextHistoryYears: readonly number[] = historyYears,
  ) => {
    if (!location.pathname.startsWith(PRESENTATION_BASE_PATH)) return;
    const params = buildContextParams(
      nextFilter,
      nextGranularity,
      nextRankingLimit,
      nextComparisonMode,
      { categoryId, returnAnchor: returnAnchor ?? 'executive-summary' },
      nextHistoryYears,
    );
    const path = detailTarget
      ? buildPresentationDetailPath(detailTarget, params)
      : buildPresentationDashboardPath(params);
    navigate(path, { replace: true });
  };

  const handleApplyFilter = (nextFilter: PresentationPeriodFilter) => {
    setFilter(nextFilter);
    syncCurrentRoute(nextFilter, granularity, rankingLimit, comparisonMode);
  };

  const handleGranularityChange = (nextGranularity: TimeSeriesGranularity) => {
    setGranularity(nextGranularity);
    syncCurrentRoute(filter, nextGranularity, rankingLimit, comparisonMode);
  };

  const handleRankingLimitChange = (nextRankingLimit: number) => {
    setRankingLimit(nextRankingLimit);
    syncCurrentRoute(filter, granularity, nextRankingLimit, comparisonMode);
  };

  const handleComparisonModeChange = (nextMode: PresentationComparisonMode) => {
    setComparisonMode(nextMode);
    syncCurrentRoute(filter, granularity, rankingLimit, nextMode);
  };

  const handleHistoryYearsChange = (nextHistoryYears: readonly number[]) => {
    setHistoryYears(nextHistoryYears);
    syncCurrentRoute(filter, granularity, rankingLimit, comparisonMode, nextHistoryYears);
  };

  const openDetail = ({
    target,
    categoryId: nextCategoryId,
    returnAnchor: nextReturnAnchor,
  }: {
    target: PresentationDetailTarget;
    categoryId?: string;
    returnAnchor: PresentationReturnAnchor;
  }) => {
    const params = buildContextParams(filter, granularity, rankingLimit, comparisonMode, {
      categoryId: nextCategoryId,
      returnAnchor: nextReturnAnchor,
    });
    navigate(buildPresentationDetailPath(target, params));
  };

  const backToDashboard = () => {
    const params = buildContextParams(filter, granularity, rankingLimit, comparisonMode, {
      returnAnchor: returnAnchor ?? 'executive-summary',
    });
    navigate(buildPresentationDashboardPath(params));
  };

  const selectDetailCategory = (nextCategoryId?: string, targetOverride?: PresentationDetailTarget) => {
    if (!detailTarget) return;
    const params = buildContextParams(filter, granularity, rankingLimit, comparisonMode, {
      categoryId: nextCategoryId,
      returnAnchor: returnAnchor ?? 'financial-tree',
    });
    navigate(buildPresentationDetailPath(targetOverride ?? detailTarget, params));
  };

  const requestState = (
    <PresentationRequestState
      availability={query.availability}
      onRetry={() => { void query.refetch(); }}
    />
  );
  const periodFilters = (
    <PresentationPeriodFilters
      initialDraft={initialDraft}
      availableBounds={availableBounds}
      unitName={profile?.company_name}
      granularity={granularity}
      rankingLimit={rankingLimit}
      historyYears={historyYears}
      isFetching={query.isFetching || revenueQuery.isFetching || expensesQuery.isFetching}
      onApply={handleApplyFilter}
      onGranularityChange={handleGranularityChange}
      onRankingLimitChange={handleRankingLimitChange}
      onHistoryYearsChange={handleHistoryYearsChange}
    />
  );

  if (!canView) return requestState;

  if (!detailTarget && workspaceView === 'presentation' && presentationDataWithDecision) {
    return (
      <Suspense
        fallback={(
          <div className="flex min-h-[32rem] items-center justify-center rounded-xl border border-border bg-card" role="status">
            <Loader2 className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden="true" />
            Preparando apresentação...
          </div>
        )}
      >
        <PresentationMode
          data={presentationDataWithDecision}
          canExport={canExport}
          displayMode="embedded"
          unitName={profile?.company_name}
          toolbar={periodFilters}
          onClose={() => setWorkspaceView('preparation')}
          onOpenExpenseCategory={(nextCategoryId) => openDetail({
            target: 'expenses',
            categoryId: nextCategoryId,
            returnAnchor: 'financial-tree',
          })}
          onOpenResultDetail={(target) => openDetail({
            target,
            returnAnchor: 'executive-summary',
          })}
        />
      </Suspense>
    );
  }

  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold tracking-tight text-foreground">Apresentação Sócios</h1>
                <Star className="h-5 w-5 text-gold-dark dark:text-primary" aria-hidden="true" />
              </div>
              <p className="text-sm text-muted-foreground">
                Visão gerencial do resultado da loja
              </p>
            </div>
          </div>
        </div>
        {!detailTarget && presentationDataWithDecision ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => setWorkspaceView('presentation')}
            className="min-h-11 px-5 font-semibold shadow-sm"
          >
            <BarChart3 className="mr-2 h-4 w-4" aria-hidden="true" />
            Voltar à apresentação
          </Button>
        ) : null}
      </header>

      {periodFilters}

      {invalidDetail ? (
        <Alert variant="destructive">
          <AlertTitle>Detalhe inválido</AlertTitle>
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>O endereço informado não corresponde a um detalhe da Apresentação Sócios.</span>
            <Button type="button" variant="outline" size="sm" onClick={backToDashboard}>Voltar ao dashboard</Button>
          </AlertDescription>
        </Alert>
      ) : presentationData
        ? (
            detailTarget === 'expenses' ? (
              <PresentationExpensesDetailPage
                companyId={profile?.company_id}
                availability={expensesQuery.availability}
                categoryId={categoryId}
                unitName={profile?.company_name}
                onBack={backToDashboard}
                onSelectCategory={nextCategoryId => selectDetailCategory(nextCategoryId, 'expenses')}
              />
            ) : detailTarget ? (
              <PresentationDetailPage
                companyId={profile?.company_id}
                target={detailTarget}
                data={presentationData}
                categoryMetadata={categoryMetadataQuery.data}
                categoryId={categoryId}
                rankingLimit={rankingLimit}
                unitName={profile?.company_name}
                onBack={backToDashboard}
                onSelectCategory={selectDetailCategory}
                planAvailability={detailTarget === 'revenue'
                  || detailTarget === 'expense'
                  || detailTarget === 'ranking-revenue'
                  || detailTarget === 'ranking-expense'
                  ? detailPlanQuery.availability
                  : planQuery.availability}
                planCategories={detailPlanQuery.categories}
                comparisonMode={comparisonMode}
                onComparisonModeChange={handleComparisonModeChange}
                planHasMore={Boolean(detailPlanQuery.hasNextPage)}
                planLoadingMore={detailPlanQuery.isFetchingNextPage}
                onPlanLoadMore={() => { void detailPlanQuery.fetchNextPage(); }}
              />
            ) : (
              <>
                <PresentationAnalytics
                data={presentationData}
                categoryMetadata={categoryMetadataQuery.data}
                categoryMetadataLoading={categoryMetadataQuery.isPending}
                onOpenDetail={openDetail}
                planAvailability={planQuery.availability}
                planCategories={planQuery.categories}
                comparisonMode={comparisonMode}
                onComparisonModeChange={handleComparisonModeChange}
                planHasMore={Boolean(planQuery.hasNextPage)}
                planLoadingMore={planQuery.isFetchingNextPage}
                onPlanLoadMore={() => { void planQuery.fetchNextPage(); }}
                scenarioSection={(
                  <PresentationScenarioSection
                    canSimulate={canSimulate}
                    planAvailability={scenarioPlanAvailability}
                    categories={planQuery.categories}
                    draft={scenario.draft}
                    result={scenario.result}
                    validationError={scenario.validationError}
                    storageError={scenario.storageError}
                    isDirty={scenario.isDirty}
                    hasMoreCategories={Boolean(planQuery.hasNextPage)}
                    loadingMoreCategories={planQuery.isFetchingNextPage}
                    onLoadMoreCategories={() => { void planQuery.fetchNextPage(); }}
                    onDraftChange={scenario.setDraft}
                    onBaselineModeChange={handleComparisonModeChange}
                    onClear={scenario.clearDraft}
                  />
                )}
                />
                {planQuery.firstPage && profile?.company_id && user?.id ? (
                  <>
                    <PresentationMeetingGovernance
                      companyId={profile.company_id}
                      userId={user.id}
                      period={query.definition.context.period}
                      granularity={granularity}
                      comparisonMode={comparisonMode}
                      rankingLimit={rankingLimit}
                      plan={planQuery.firstPage}
                      canManage={canManageDecisions}
                      canApprove={canApproveDecisions}
                      canExport={canExport}
                    />
                    <PresentationDecisionGovernance
                      companyId={profile.company_id}
                      userId={user.id}
                      period={query.definition.context.period}
                      granularity={granularity}
                      comparisonMode={comparisonMode}
                      plan={planQuery.firstPage}
                      scenarioResult={scenario.validationError ? undefined : scenario.result}
                      scenarioDraft={scenario.validationError ? undefined : scenario.draft}
                      canManage={canManageDecisions}
                      canApprove={canApproveDecisions}
                    />
                  </>
                ) : (
                  <Card aria-busy={planQuery.isPending}>
                    <CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                      {planQuery.isPending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <AlertCircle className="h-4 w-4" aria-hidden="true" />}
                      A governança de decisões aguarda a base canônica do período.
                    </CardContent>
                  </Card>
                )}
              </>
            )
          )
        : requestState}
    </div>
  );
}

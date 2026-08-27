import { useMemo } from 'react';
import type {
  CategoryCompositionSection,
  PresentationPlanData,
  PresentationRankingItem,
  PresentationSlide,
  PresentationScenarioResult,
  PresentationDecisionDetail,
  PresentationDecisionComparison,
  PresentationTimeSeries,
} from '@/domain/financeiro/presentation';
import { buildPresentationPlanIndicators } from '@/domain/financeiro/presentation';
import { cn } from '@/lib/utils';
import {
  PRESENTATION_REGIME_LABEL,
  PRESENTATION_SOURCE_LABEL,
  availabilityMessage,
  buildExecutiveMetricDisplays,
  flattenPresentationCategories,
  formatPresentationSeriesLabel,
  presentationGeneratedLabel,
  presentationActionStatusLabel,
  presentationDecisionStatusLabel,
} from '@/lib/presentationFormatting';
import { fmtBRL, fmtBRLCompact, formatIntegerBR, formatPercentBR } from '@/lib/formatters';

interface PresentationSlideCanvasProps {
  slide: PresentationSlide;
  generatedAt: string;
  slideNumber: number;
  totalSlides: number;
  className?: string;
}

const TONE_CLASSES = {
  positive: 'text-emerald-300',
  negative: 'text-rose-300',
  result: 'text-white',
  neutral: 'text-slate-100',
} as const;

function EmptyState({ message }: { message: string }) {
  return (
    <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-white/20 bg-white/[0.03] px-8 text-center text-[clamp(0.85rem,1.4cqw,1.35rem)] text-slate-300">
      {message}
    </div>
  );
}

function PlanComparisonLayout({ plan }: { plan: PresentationPlanData }) {
  const indicators = buildPresentationPlanIndicators(plan);
  const formatValue = (unit: 'currency' | 'percent', value: number | null) => {
    if (value === null) return 'Não configurado';
    return unit === 'currency' ? fmtBRL(value) : formatPercentBR(value, 1);
  };
  const statusColor = {
    favorable: 'text-emerald-300',
    unfavorable: 'text-rose-300',
    'on-target': 'text-slate-100',
    'not-configured': 'text-slate-400',
    partial: 'text-amber-200',
    unavailable: 'text-slate-400',
  } as const;

  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-8">
      <div className="grid grid-cols-5 gap-6">
        {indicators.map(indicator => (
          <section key={indicator.key} className="min-w-0 border-l-2 border-[#d6b85f]/70 pl-4">
            <h3 className="min-h-12 text-[clamp(0.72rem,1cqw,1rem)] font-semibold leading-tight text-slate-200">{indicator.label}</h3>
            <p className="mt-3 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-slate-400">Realizado</p>
            <p className="mt-1 truncate text-[clamp(0.9rem,1.45cqw,1.4rem)] font-bold text-white">{formatValue(indicator.unit, indicator.actual)}</p>
            <p className="mt-3 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-slate-400">Orçado</p>
            <p className="mt-1 truncate text-[clamp(0.82rem,1.2cqw,1.15rem)] font-semibold text-[#d6b85f]">{formatValue(indicator.unit, indicator.budget)}</p>
            <p className="mt-3 text-[clamp(0.58rem,0.75cqw,0.75rem)] uppercase tracking-wide text-slate-400">Projeção</p>
            <p className="mt-1 truncate text-[clamp(0.78rem,1.05cqw,1rem)] text-slate-200">{formatValue(indicator.unit, indicator.projection)}</p>
            <p className={cn('mt-4 text-[clamp(0.62rem,0.82cqw,0.82rem)] font-semibold', statusColor[indicator.status])}>{indicator.statusLabel}</p>
          </section>
        ))}
      </div>
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-8 border-t border-white/15 pt-5">
        <p className="text-[clamp(0.66rem,0.9cqw,0.9rem)] leading-relaxed text-slate-300">
          Projeção determinística: realizado acumulado / {plan.projection.sampleDays} dias transcorridos × {plan.projection.totalDays} dias totais. Orçamento mensal proporcional aos dias do intervalo; contas em aberto não entram.
        </p>
        <div className="text-right">
          <p className="text-[clamp(0.6rem,0.78cqw,0.78rem)] text-slate-400">Meta percentual de CMV</p>
          <p className="mt-1 text-[clamp(0.9rem,1.3cqw,1.25rem)] font-bold text-[#d6b85f]">
            {plan.budget.cmvTargetPercent === null ? 'Não configurada' : formatPercentBR(plan.budget.cmvTargetPercent, 1)}
          </p>
        </div>
      </div>
    </div>
  );
}

function ScenarioImpactLayout({ scenario }: { scenario: PresentationScenarioResult }) {
  const metrics = [
    { label: 'Receita', baseline: scenario.baseline.revenue, value: scenario.scenario.revenue, impact: scenario.impact.revenue.absolute },
    { label: 'Despesas', baseline: scenario.baseline.expense, value: scenario.scenario.expense, impact: scenario.impact.expense.absolute },
    { label: 'Resultado', baseline: scenario.baseline.result, value: scenario.scenario.result, impact: scenario.impact.result.absolute },
    { label: 'Margem', baseline: scenario.baseline.marginPercent, value: scenario.scenario.marginPercent, impact: scenario.impact.margin.absolute, percent: true },
    { label: 'CMV', baseline: scenario.baseline.cmv, value: scenario.scenario.cmv, impact: scenario.impact.cmv.absolute },
  ];
  const ranking = [...scenario.activeLevers]
    .sort((left, right) => Math.abs(right.resultImpact) - Math.abs(left.resultImpact) || left.id.localeCompare(right.id))
    .slice(0, 5);
  const format = (value: number | null, percent = false) => value === null
    ? 'Indisponível'
    : percent ? formatPercentBR(value, 1) : fmtBRL(value);

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-7">
      <div className="flex items-center justify-between gap-5">
        <span className="border border-[#d6b85f]/60 bg-[#d6b85f]/10 px-4 py-2 text-[clamp(0.7rem,0.95cqw,0.95rem)] font-bold tracking-[0.18em] text-[#f3dfa0]">SIMULAÇÃO</span>
        <p className="text-right text-[clamp(0.62rem,0.82cqw,0.82rem)] text-slate-300">Base: {scenario.baselineMode === 'actual' ? 'Realizado' : scenario.baselineMode === 'budget' ? 'Orçado' : 'Projeção'} · corte {scenario.cutoffDate}</p>
      </div>
      <div className="grid grid-cols-5 gap-5">
        {metrics.map(metric => (
          <section key={metric.label} className="min-w-0 border-l-2 border-[#d6b85f]/70 pl-3">
            <h3 className="text-[clamp(0.68rem,0.9cqw,0.9rem)] font-semibold text-slate-300">{metric.label}</h3>
            <p className="mt-2 text-[clamp(0.56rem,0.7cqw,0.7rem)] uppercase tracking-wide text-slate-500">Base</p>
            <p className="mt-1 truncate text-[clamp(0.82rem,1.15cqw,1.1rem)] font-semibold text-slate-200">{format(metric.baseline, metric.percent)}</p>
            <p className="mt-2 text-[clamp(0.56rem,0.7cqw,0.7rem)] uppercase tracking-wide text-slate-500">Cenário</p>
            <p className="mt-1 truncate text-[clamp(0.9rem,1.35cqw,1.3rem)] font-bold text-white">{format(metric.value, metric.percent)}</p>
            <p className={cn('mt-2 text-[clamp(0.58rem,0.76cqw,0.76rem)] font-semibold', (metric.impact ?? 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
              Impacto {metric.impact === null ? 'indisponível' : metric.percent ? `${metric.impact.toFixed(1)} p.p.` : fmtBRL(metric.impact)}
            </p>
          </section>
        ))}
      </div>
      <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_minmax(0,0.8fr)] gap-8 border-t border-white/15 pt-5">
        <div>
          <h3 className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold text-white">Premissas explícitas</h3>
          <div className="mt-3 grid grid-cols-2 gap-x-5 gap-y-2">
            {scenario.activeLevers.slice(0, 6).map(lever => (
              <div key={lever.id} className="flex items-center justify-between gap-3 border-b border-white/10 pb-1.5 text-[clamp(0.58rem,0.75cqw,0.75rem)]">
                <span className="truncate text-slate-300">{lever.label}</span>
                <strong className={lever.resultImpact >= 0 ? 'text-emerald-300' : 'text-rose-300'}>{fmtBRL(lever.resultImpact)}</strong>
              </div>
            ))}
          </div>
        </div>
        <div>
          <h3 className="text-[clamp(0.72rem,1cqw,1rem)] font-semibold text-white">Ranking por impacto no resultado</h3>
          <ol className="mt-3 space-y-2">
            {ranking.map((lever, index) => (
              <li key={lever.id} className="grid grid-cols-[1.3rem_minmax(0,1fr)_auto] gap-2 text-[clamp(0.58rem,0.75cqw,0.75rem)]">
                <span className="font-bold text-[#d6b85f]">{index + 1}</span>
                <span className="truncate text-slate-300">{lever.label}</span>
                <strong className="text-white">{fmtBRL(lever.resultImpact)}</strong>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </div>
  );
}

function ScenarioSensitivityLayout({ scenario }: { scenario: PresentationScenarioResult }) {
  if (scenario.sensitivity.state !== 'available') return <EmptyState message="Sensibilidade não configurada." />;
  const sensitivity = scenario.sensitivity;
  const values = sensitivity.points.map(point => point.result);
  const minX = Math.min(...sensitivity.points.map(point => point.inputValue));
  const maxX = Math.max(...sensitivity.points.map(point => point.inputValue));
  const minY = Math.min(0, ...values);
  const maxY = Math.max(0, ...values);
  const xRange = Math.max(maxX - minX, 1);
  const yRange = Math.max(maxY - minY, 1);
  const x = (value: number) => 80 + ((value - minX) / xRange) * 850;
  const y = (value: number) => 320 - ((value - minY) / yRange) * 250;
  const path = sensitivity.points.map((point, index) => `${index === 0 ? 'M' : 'L'} ${x(point.inputValue)} ${y(point.result)}`).join(' ');
  const basePoint = sensitivity.points.find(point => point.isBase);
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="border border-[#d6b85f]/60 bg-[#d6b85f]/10 px-4 py-2 text-[clamp(0.7rem,0.95cqw,0.95rem)] font-bold tracking-[0.18em] text-[#f3dfa0]">SIMULAÇÃO</span>
        <p className="text-[clamp(0.62rem,0.82cqw,0.82rem)] text-slate-300">Demais alavancas mantidas fixas</p>
      </div>
      <div className="min-h-0 flex-1" role="img" aria-label={`Curva de sensibilidade de ${sensitivity.leverLabel} com ${sensitivity.points.length} pontos.`}>
        <svg viewBox="0 0 1000 360" className="h-full w-full" aria-hidden="true">
          {[0, 1, 2, 3].map(index => {
            const value = maxY - ((maxY - minY) * index) / 3;
            return <g key={index}><line x1="72" x2="950" y1={y(value)} y2={y(value)} stroke="#334155" /><text x="65" y={y(value) + 5} textAnchor="end" fill="#94a3b8" fontSize="13">{fmtBRLCompact(value)}</text></g>;
          })}
          <line x1="72" x2="950" y1={y(0)} y2={y(0)} stroke="#64748b" strokeWidth="1.5" />
          {basePoint ? <line x1={x(basePoint.inputValue)} x2={x(basePoint.inputValue)} y1="45" y2="325" stroke="#d6b85f" strokeDasharray="6 5" /> : null}
          <path d={path} fill="none" stroke="#d6b85f" strokeWidth="4" strokeLinejoin="round" />
          {sensitivity.points.map(point => (
            <circle key={point.inputValue} cx={x(point.inputValue)} cy={y(point.result)} r={point.isBase ? 7 : 3.5} fill={point.isBase ? '#ffffff' : '#d6b85f'} stroke="#d6b85f" strokeWidth="2" />
          ))}
          <text x="500" y="350" textAnchor="middle" fill="#cbd5e1" fontSize="14">{sensitivity.leverLabel} ({sensitivity.unit === 'currency' ? 'R$' : '%'})</text>
        </svg>
      </div>
      <div className="grid grid-cols-3 gap-5 border-t border-white/15 pt-3 text-[clamp(0.62rem,0.82cqw,0.82rem)]">
        <p className="text-slate-300">Faixa: <strong className="text-white">{sensitivity.unit === 'currency' ? `${fmtBRL(minX)} a ${fmtBRL(maxX)}` : `${formatPercentBR(minX, 2)} a ${formatPercentBR(maxX, 2)}`}</strong></p>
        <p className="text-slate-300">Configuração atual: <strong className="text-white">{basePoint ? sensitivity.unit === 'currency' ? fmtBRL(basePoint.inputValue) : formatPercentBR(basePoint.inputValue, 2) : 'Indisponível'}</strong></p>
        <p className="text-slate-300">Ponto de equilíbrio: <strong className="text-white">{sensitivity.breakEven.state === 'available' ? sensitivity.unit === 'currency' ? fmtBRL(sensitivity.breakEven.inputValue) : formatPercentBR(sensitivity.breakEven.inputValue, 2) : 'Indisponível com as informações atuais'}</strong></p>
      </div>
    </div>
  );
}

function TimeSeriesChart({ timeSeries }: { timeSeries: PresentationTimeSeries }) {
  const chart = useMemo(() => {
    const values = timeSeries.points.flatMap(point => [
      point.metrics.revenue,
      point.metrics.expense,
      point.metrics.result,
    ]);
    const rawMax = Math.max(0, ...values);
    const rawMin = Math.min(0, ...values);
    const padding = Math.max((rawMax - rawMin) * 0.08, 1);
    const max = rawMax + padding;
    const min = rawMin - (rawMin < 0 ? padding : 0);
    const range = Math.max(max - min, 1);
    const y = (value: number) => 320 - ((value - min) / range) * 270;
    const step = 880 / Math.max(timeSeries.points.length, 1);
    const resultPoints = timeSeries.points.map((point, index) => ({
      x: 80 + step * index + step / 2,
      y: y(point.metrics.result),
    }));
    return { y, step, resultPoints, min, max };
  }, [timeSeries]);

  if (timeSeries.points.length === 0) return <EmptyState message="Sem pontos na série temporal." />;

  const zeroY = chart.y(0);
  const linePath = chart.resultPoints
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');

  return (
    <div className="min-h-0 flex-1" role="img" aria-label="Série temporal de receitas, despesas e resultado operacional">
      <svg viewBox="0 0 1000 380" className="h-full w-full" aria-hidden="true">
        {[0, 1, 2, 3].map(index => {
          const value = chart.max - ((chart.max - chart.min) * index) / 3;
          const y = chart.y(value);
          return (
            <g key={index}>
              <line x1="72" x2="970" y1={y} y2={y} stroke="#334155" strokeWidth="1" />
              <text x="64" y={y + 5} textAnchor="end" fill="#94a3b8" fontSize="14">{fmtBRLCompact(value)}</text>
            </g>
          );
        })}
        <line x1="72" x2="970" y1={zeroY} y2={zeroY} stroke="#64748b" strokeWidth="1.5" />
        {timeSeries.points.map((point, index) => {
          const center = 80 + chart.step * index + chart.step / 2;
          const barWidth = Math.min(chart.step * 0.22, 22);
          const revenueY = chart.y(point.metrics.revenue);
          const expenseY = chart.y(point.metrics.expense);
          return (
            <g key={point.key}>
              <rect
                x={center - barWidth - 2}
                y={Math.min(revenueY, zeroY)}
                width={barWidth}
                height={Math.max(Math.abs(zeroY - revenueY), 1)}
                rx="2"
                fill="#34d399"
              />
              <rect
                x={center + 2}
                y={Math.min(expenseY, zeroY)}
                width={barWidth}
                height={Math.max(Math.abs(zeroY - expenseY), 1)}
                rx="2"
                fill="#fb7185"
              />
              <text x={center} y="353" textAnchor="middle" fill="#cbd5e1" fontSize="13">
                {formatPresentationSeriesLabel(point.key, timeSeries.granularity)}
              </text>
            </g>
          );
        })}
        <path d={linePath} fill="none" stroke="#d6b85f" strokeWidth="4" strokeLinejoin="round" />
        {chart.resultPoints.map((point, index) => (
          <circle key={timeSeries.points[index].key} cx={point.x} cy={point.y} r="5" fill="#d6b85f" />
        ))}
        <g transform="translate(720 18)" fontSize="14">
          <rect width="12" height="12" fill="#34d399" /><text x="18" y="11" fill="#e2e8f0">Receita</text>
          <rect x="92" width="12" height="12" fill="#fb7185" /><text x="110" y="11" fill="#e2e8f0">Despesa</text>
          <line x1="194" x2="210" y1="6" y2="6" stroke="#d6b85f" strokeWidth="4" /><text x="216" y="11" fill="#e2e8f0">Resultado</text>
        </g>
      </svg>
    </div>
  );
}

function CompositionColumn({
  title,
  nodes,
  tone,
}: {
  title: string;
  nodes: CategoryCompositionSection['revenue'];
  tone: 'revenue' | 'expense';
}) {
  const rows = flattenPresentationCategories(nodes);
  return (
    <section className="min-w-0">
      <div className="mb-2 flex items-center justify-between border-b border-white/15 pb-2">
        <h3 className={cn('text-[clamp(0.9rem,1.35cqw,1.3rem)] font-semibold', tone === 'revenue' ? 'text-emerald-300' : 'text-rose-300')}>{title}</h3>
        <span className="text-[clamp(0.65rem,0.8cqw,0.8rem)] text-slate-400">Direto / Acumulado</span>
      </div>
      {rows.length === 0 ? (
        <p className="py-6 text-center text-[clamp(0.75rem,1cqw,1rem)] text-slate-400">Sem valores nesta composição.</p>
      ) : (
        <div className="space-y-1">
          {rows.map(({ node, depth }, index) => (
            <div
              key={`${node.categoryId ?? node.name}-${index}`}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-white/[0.07] py-1.5"
            >
              <div className="min-w-0" style={{ paddingLeft: `${depth * 0.8}rem` }}>
                <p className={cn(
                  'truncate text-[clamp(0.72rem,1cqw,0.98rem)] text-slate-100',
                  depth === 0 && 'font-semibold',
                )}>
                  {depth > 0 ? '↳ ' : ''}{node.name}
                </p>
                <p className="text-[clamp(0.58rem,0.7cqw,0.72rem)] text-slate-400">{formatPercentBR(node.sharePercent, 1)} da composição</p>
              </div>
              <p className="whitespace-nowrap text-right font-mono text-[clamp(0.65rem,0.82cqw,0.82rem)] text-slate-300">
                {fmtBRL(node.directAmount)} <span className="text-slate-500">/</span> <strong className="text-white">{fmtBRL(node.amount)}</strong>
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

function CompositionLayout({ section }: { section: CategoryCompositionSection }) {
  return (
    <div className="grid min-h-0 flex-1 gap-8 md:grid-cols-2">
      <CompositionColumn title="Receitas" nodes={section.revenue} tone="revenue" />
      <CompositionColumn title="Despesas" nodes={section.expense} tone="expense" />
    </div>
  );
}

function RankingColumn({
  title,
  items,
  tone,
}: {
  title: string;
  items: readonly PresentationRankingItem[];
  tone: 'revenue' | 'expense';
}) {
  return (
    <section className="min-w-0">
      <h3 className={cn('mb-4 text-[clamp(1rem,1.5cqw,1.45rem)] font-semibold', tone === 'revenue' ? 'text-emerald-300' : 'text-rose-300')}>{title}</h3>
      {items.length === 0 ? (
        <p className="text-slate-400">Nenhuma categoria no período.</p>
      ) : (
        <ol className="space-y-2.5">
          {items.map(item => (
            <li key={`${item.rank}-${item.categoryId ?? item.label}`} className="grid grid-cols-[2.2rem_minmax(0,1fr)_auto] items-center gap-3 border-b border-white/10 pb-2.5">
              <span className="text-center text-[clamp(1rem,1.5cqw,1.45rem)] font-bold text-[#d6b85f]">{item.rank}</span>
              <div className="min-w-0">
                <p className="truncate text-[clamp(0.78rem,1.15cqw,1.1rem)] font-medium text-white">{item.label}</p>
                <p className="text-[clamp(0.65rem,0.8cqw,0.82rem)] text-slate-400">{formatPercentBR(item.sharePercent, 1)} da composição</p>
              </div>
              <strong className={cn('whitespace-nowrap font-mono text-[clamp(0.76rem,1.05cqw,1rem)]', tone === 'revenue' ? 'text-emerald-300' : 'text-rose-300')}>{fmtBRL(item.amount)}</strong>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function DecisionCommitmentsLayout({ decision }: { decision: PresentationDecisionDetail }) {
  const currentRevision = decision.revisions.find(revision => revision.id === decision.decision.currentRevisionId);
  if (!currentRevision) return <EmptyState message="Revisão aprovada indisponível." />;
  const statusLabel = presentationDecisionStatusLabel(decision.decision.status);
  const metrics = [
    ['Receita', currentRevision.snapshot.metrics.revenue],
    ['Despesa', currentRevision.snapshot.metrics.expense],
    ['Resultado', currentRevision.snapshot.metrics.result],
    ['Margem', currentRevision.snapshot.metrics.marginPercent],
  ] as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-5">
      <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)] gap-8">
        <section>
          <div className="flex flex-wrap items-center gap-3">
            <span className="border border-[#d6b85f]/60 bg-[#d6b85f]/10 px-3 py-1 text-[clamp(0.62rem,0.8cqw,0.8rem)] font-bold text-[#f3dfa0]">{statusLabel}</span>
            {decision.decision.referenceType === 'SCENARIO' ? <span className="text-[clamp(0.62rem,0.8cqw,0.8rem)] font-bold tracking-wider text-amber-200">SIMULAÇÃO</span> : null}
          </div>
          <p className="mt-4 text-[clamp(0.78rem,1.05cqw,1rem)] leading-relaxed text-slate-200">{decision.decision.context}</p>
          <div className="mt-4 space-y-1 text-[clamp(0.62rem,0.78cqw,0.78rem)] text-slate-400">
            <p>Responsável executivo: {decision.decision.executiveResponsibleName ?? 'Não informado'}</p>
            <p>Aprovador: {currentRevision.approvedByName ?? 'Usuário removido'}</p>
            <p>Revisão {currentRevision.revisionNumber} · corte {currentRevision.snapshot.cutoffDate}</p>
          </div>
        </section>
        <section className="grid grid-cols-2 content-start gap-4">
          {metrics.map(([label, value]) => (
            <div key={label} className="border-l-2 border-[#d6b85f]/70 pl-3">
              <p className="text-[clamp(0.58rem,0.72cqw,0.72rem)] text-slate-400">{label} esperado</p>
              <p className="mt-1 text-[clamp(0.9rem,1.3cqw,1.25rem)] font-bold text-white">{value === null ? 'Indisponível' : label === 'Margem' ? formatPercentBR(value, 1) : fmtBRL(value)}</p>
            </div>
          ))}
          <div className="col-span-2 border-t border-white/10 pt-3 text-[clamp(0.6rem,0.75cqw,0.75rem)] text-slate-400">
            {currentRevision.snapshot.assumptions.length === 0
              ? 'Referência canônica sem premissas de simulação.'
              : currentRevision.snapshot.assumptions.slice(0, 3).map(item => `${item.label}: ${item.exactValue || item.calculatedInputValue}`).join(' · ')}
            {currentRevision.snapshot.assumptions.length > 3 ? ` · +${currentRevision.snapshot.assumptions.length - 3} premissa(s) no snapshot` : ''}
          </div>
        </section>
      </div>
      <div className="min-h-0 border-t border-white/15 pt-4">
        <h3 className="mb-2 text-[clamp(0.72rem,0.95cqw,0.95rem)] font-semibold text-[#d6b85f]">Compromissos</h3>
        {decision.actions.length === 0 ? <p className="text-[clamp(0.68rem,0.85cqw,0.85rem)] text-slate-400">Nenhuma ação registrada.</p> : (
          <div className="grid gap-x-6 gap-y-2 md:grid-cols-2">
            {decision.actions.map(action => (
              <div key={action.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-3 border-b border-white/10 pb-2">
                <div>
                  <p className="text-[clamp(0.64rem,0.8cqw,0.8rem)] leading-snug text-slate-100">{action.description}</p>
                  <p className="mt-1 text-[clamp(0.55rem,0.66cqw,0.66rem)] text-slate-400">{action.responsibleName} · {action.dueDate ?? 'sem prazo'}</p>
                </div>
                <span className="text-[clamp(0.54rem,0.66cqw,0.66rem)] font-semibold text-[#d6b85f]">{presentationActionStatusLabel(action.status)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function DecisionFollowUpLayout({
  decision,
  comparison,
}: {
  decision: PresentationDecisionDetail;
  comparison: Extract<PresentationDecisionComparison, { state: 'available' }>;
}) {
  const labels = { revenue: 'Receita', expense: 'Despesa', result: 'Resultado', marginPercent: 'Margem', cmv: 'CMV' } as const;
  return (
    <div className="flex min-h-0 flex-1 flex-col justify-center gap-6">
      <div className="flex items-center justify-between gap-5 text-[clamp(0.62rem,0.8cqw,0.8rem)] text-slate-400">
        <span>{decision.decision.title}</span>
        <span>Snapshot {new Date(comparison.snapshotCapturedAt).toLocaleString('pt-BR')} · Base atual {new Date(comparison.currentGeneratedAt).toLocaleString('pt-BR')}</span>
      </div>
      <div className="grid grid-cols-[1.1fr_repeat(4,1fr)] border-y border-white/15 text-[clamp(0.68rem,0.9cqw,0.9rem)]">
        <div className="p-3 font-semibold text-slate-300">Métrica</div><div className="p-3 text-right font-semibold text-slate-300">Snapshot aprovado</div><div className="p-3 text-right font-semibold text-slate-300">Base atual</div><div className="p-3 text-right font-semibold text-slate-300">Variação</div><div className="p-3 font-semibold text-slate-300">Leitura</div>
        {comparison.metrics.map(metric => {
          const percent = metric.key === 'marginPercent';
          const format = (value: number | null) => value === null ? 'Indisponível' : percent ? formatPercentBR(value, 1) : fmtBRL(value);
          return (
            <div key={metric.key} className="contents">
              <div className="border-t border-white/10 p-3 text-white">{labels[metric.key]}</div>
              <div className="border-t border-white/10 p-3 text-right text-slate-200">{format(metric.snapshot)}</div>
              <div className="border-t border-white/10 p-3 text-right text-slate-200">{format(metric.current)}</div>
              <div className="border-t border-white/10 p-3 text-right text-slate-200">{format(metric.absoluteChange)}</div>
              <div className="border-t border-white/10 p-3 text-slate-300">{metric.favorability === 'favorable' ? 'Favorável' : metric.favorability === 'unfavorable' ? 'Desfavorável' : metric.favorability === 'neutral' ? 'Neutra' : 'Indisponível'}</div>
            </div>
          );
        })}
      </div>
      <p className="text-[clamp(0.62rem,0.78cqw,0.78rem)] text-slate-400">Comparação informativa entre métricas equivalentes. Não atribui causalidade às ações nem classifica a decisão como sucesso ou falha.</p>
    </div>
  );
}

function SlideContent({ slide }: { slide: PresentationSlide }) {
  if (slide.availability.state !== 'available' && slide.availability.state !== 'empty') {
    return <EmptyState message={availabilityMessage(slide.availability)} />;
  }

  const payload = slide.availability.data;
  if (slide.availability.state === 'empty' && payload.type !== 'cover') {
    return <EmptyState message={availabilityMessage(slide.availability)} />;
  }

  switch (payload.type) {
    case 'cover':
      return (
        <div className="flex flex-1 flex-col justify-center">
          <div className="mb-8 h-1.5 w-24 rounded-full bg-[#d6b85f]" />
          <p className="mb-3 text-[clamp(0.8rem,1.25cqw,1.2rem)] font-semibold uppercase tracking-[0.24em] text-slate-300">Visão executiva financeira</p>
          <h1 className="max-w-4xl text-[clamp(2.4rem,6cqw,5.8rem)] font-bold leading-[0.96] tracking-tight text-white">Apresentação<br /><span className="text-[#d6b85f]">Sócios</span></h1>
          <p className="mt-8 text-[clamp(1.1rem,2cqw,1.9rem)] text-slate-200">{payload.periodLabel}</p>
          <p className="mt-2 text-[clamp(0.75rem,1cqw,1rem)] text-slate-400">Resultado operacional por competência. Transferências excluídas.</p>
        </div>
      );
    case 'executive-summary': {
      const metrics = buildExecutiveMetricDisplays(payload.metrics.managerialResult, payload.deltas);
      return (
        <div className="grid flex-1 content-center gap-8 sm:grid-cols-2 xl:grid-cols-4">
          {metrics.map(metric => (
            <div key={metric.key} className="border-l-2 border-[#d6b85f]/70 pl-5">
              <p className="text-[clamp(0.78rem,1.05cqw,1rem)] font-medium text-slate-300">{metric.label}</p>
              <p className={cn('mt-3 break-words text-[clamp(1.45rem,2.5cqw,2.45rem)] font-bold tracking-tight', TONE_CLASSES[metric.tone], metric.tone === 'result' && metric.value < 0 && 'text-rose-300')}>{metric.formattedValue}</p>
              <p className="mt-4 text-[clamp(0.68rem,0.9cqw,0.9rem)] text-slate-400">vs. período anterior</p>
              <p className="mt-1 text-[clamp(0.74rem,1cqw,1rem)] font-semibold text-slate-100">{metric.comparison}</p>
            </div>
          ))}
        </div>
      );
    }
    case 'plan-comparison':
      return <PlanComparisonLayout plan={payload.plan} />;
    case 'scenario-impact':
      return <ScenarioImpactLayout scenario={payload.scenario} />;
    case 'scenario-sensitivity':
      return <ScenarioSensitivityLayout scenario={payload.scenario} />;
    case 'decision-commitments':
      return <DecisionCommitmentsLayout decision={payload.decision} />;
    case 'decision-follow-up':
      return <DecisionFollowUpLayout decision={payload.decision} comparison={payload.comparison} />;
    case 'time-series':
      return <TimeSeriesChart timeSeries={payload.timeSeries} />;
    case 'category-composition':
      return <CompositionLayout section={payload.composition} />;
    case 'rankings':
      return (
        <div className="grid min-h-0 flex-1 gap-10 md:grid-cols-2">
          <RankingColumn title="Principais receitas" items={payload.rankings.topRevenueCategories} tone="revenue" />
          <RankingColumn title="Principais despesas" items={payload.rankings.topExpenseCategories} tone="expense" />
        </div>
      );
    case 'open-items': {
      const payable = payload.indicators.accountsPayableOpen;
      const receivable = payload.indicators.accountsReceivableOpen;
      return (
        <div className="grid flex-1 content-center gap-12 md:grid-cols-2">
          {[
            { label: 'Contas a pagar em aberto', item: payable, tone: 'text-amber-300' },
            { label: 'Contas a receber em aberto', item: receivable, tone: 'text-slate-100' },
          ].map(({ label, item, tone }) => (
            <div key={label} className="border-t-4 border-[#d6b85f] pt-7">
              <p className="text-[clamp(1rem,1.5cqw,1.45rem)] font-semibold text-slate-300">{label}</p>
              <p className={cn('mt-5 text-[clamp(2rem,4cqw,4rem)] font-bold tracking-tight', tone)}>{fmtBRL(item.amount)}</p>
              <p className="mt-4 text-[clamp(0.9rem,1.2cqw,1.2rem)] text-slate-300">{formatIntegerBR(item.count)} título(s)</p>
              <p className="mt-2 text-[clamp(0.7rem,0.9cqw,0.9rem)] text-slate-400">Indicador em aberto - fora do resultado gerencial</p>
            </div>
          ))}
        </div>
      );
    }
    case 'non-operational':
      return (
        <div className="flex min-h-0 flex-1 flex-col gap-4">
          <div className="self-start border border-[#d6b85f]/50 bg-[#d6b85f]/10 px-4 py-2 text-[clamp(0.72rem,0.95cqw,0.95rem)] font-semibold text-amber-100">Fora do resultado operacional</div>
          <CompositionLayout section={payload.composition} />
        </div>
      );
    case 'highlights':
      return <EmptyState message="Destaques não solicitados nesta apresentação." />;
  }
}

export default function PresentationSlideCanvas({
  slide,
  generatedAt,
  slideNumber,
  totalSlides,
  className,
}: PresentationSlideCanvasProps) {
  return (
    <article
      className={cn(
        'presentation-slide flex aspect-video w-full flex-col overflow-hidden bg-[#090909] px-[5%] py-[4%] text-white shadow-2xl ring-1 ring-white/10 [container-type:inline-size]',
        'motion-safe:transition-opacity motion-safe:duration-200 motion-reduce:transition-none',
        className,
      )}
      aria-label={`Slide ${slideNumber} de ${totalSlides}: ${slide.title}`}
      data-slide-id={slide.id}
      data-slide-kind={slide.kind}
    >
      {slide.kind !== 'cover' ? (
        <header className="mb-[3%] shrink-0">
          <div className="mb-3 h-1 w-14 rounded-full bg-[#d6b85f]" />
          <h2 className="text-[clamp(1.45rem,3cqw,3rem)] font-bold leading-tight tracking-tight text-white">{slide.title}</h2>
          {slide.subtitle ? <p className="mt-2 max-w-5xl text-[clamp(0.7rem,1.05cqw,1rem)] text-slate-300">{slide.subtitle}</p> : null}
        </header>
      ) : null}

      <SlideContent slide={slide} />

      <footer className="mt-[2.5%] flex shrink-0 items-end justify-between gap-5 border-t border-white/10 pt-2 text-[clamp(0.55rem,0.72cqw,0.72rem)] text-slate-400">
        <span>{PRESENTATION_SOURCE_LABEL} · {PRESENTATION_REGIME_LABEL} · {presentationGeneratedLabel(generatedAt)}</span>
        <span className="whitespace-nowrap">{slideNumber} / {totalSlides}</span>
      </footer>
    </article>
  );
}

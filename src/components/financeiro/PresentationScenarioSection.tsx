import { useMemo, useState, type ReactNode } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  CheckCircle2,
  CircleHelp,
  Eraser,
  Info,
  Loader2,
  Minus,
  Plus,
  ShieldX,
  SlidersHorizontal,
  Trash2,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type {
  DataAvailability,
  PresentationPlanCategory,
  PresentationPlanData,
  PresentationScenarioActiveLever,
  PresentationScenarioAdjustmentDraft,
  PresentationScenarioBaselineMode,
  PresentationScenarioDraft,
  PresentationScenarioFavorability,
  PresentationScenarioMetricImpact,
  PresentationScenarioMetricSet,
  PresentationScenarioResult,
} from '@/domain/financeiro/presentation';
import { presentationScenarioModeAvailability } from '@/domain/financeiro/presentation';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CurrencyInput } from '@/components/ui/brl-input';
import { Input } from '@/components/ui/input';
import { NumericInput } from '@/components/ui/numeric-input';
import SearchableSelect from '@/components/ui/SearchableSelect';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { fmtBRL, formatDateBR, formatPercentBR, parseLocalDate } from '@/lib/formatters';
import { axisProps, gridProps, tooltipProps, chartValueFormatters, makeActiveDot } from '@/lib/chartTheme';
import { ChartTooltip, type ChartTooltipPayloadItem } from '@/components/ui/ChartTooltip';
import { cn } from '@/lib/utils';

interface PresentationScenarioSectionProps {
  canSimulate: boolean;
  planAvailability: DataAvailability<PresentationPlanData>;
  categories: readonly PresentationPlanCategory[];
  draft: PresentationScenarioDraft;
  result: PresentationScenarioResult | null;
  validationError: Error | null;
  storageError: string | null;
  isDirty: boolean;
  hasMoreCategories: boolean;
  loadingMoreCategories: boolean;
  onLoadMoreCategories: () => void;
  onDraftChange: (update: PresentationScenarioDraft | ((current: PresentationScenarioDraft) => PresentationScenarioDraft)) => void;
  onBaselineModeChange: (mode: PresentationScenarioBaselineMode) => void;
  onClear: () => void;
}

const BASELINE_LABELS: Record<PresentationScenarioBaselineMode, string> = {
  actual: 'Realizado',
  budget: 'Orçado',
  projection: 'Projeção',
};

function baselineHasCmv(plan: PresentationPlanData, mode: PresentationScenarioBaselineMode) {
  if (mode === 'actual') return plan.actual.cmv !== null;
  if (mode === 'budget') return plan.budget.cmv !== null;
  return plan.projection.metrics?.cmv !== null;
}

const FAVORABILITY_LABELS: Record<PresentationScenarioFavorability, string> = {
  favorable: 'Favorável',
  unfavorable: 'Desfavorável',
  neutral: 'Sem impacto',
  unavailable: 'Indisponível',
};

const FAVORABILITY_CLASSES: Record<PresentationScenarioFavorability, string> = {
  favorable: 'text-success',
  unfavorable: 'text-destructive',
  neutral: 'text-muted-foreground',
  unavailable: 'text-muted-foreground',
};

const MODE_UNAVAILABLE_LABELS = {
  'budget-not-configured': 'Orçamento monetário insuficiente para formar receita e despesa da base.',
  'projection-unavailable': 'Projeção indisponível para este período ou com amostra insuficiente.',
  'baseline-metrics-unavailable': 'A base não contém todas as métricas necessárias.',
  available: 'Disponível',
} as const;

function FavorabilityLabel({ value }: { value: PresentationScenarioFavorability }) {
  const Icon = value === 'favorable'
    ? ArrowUpRight
    : value === 'unfavorable'
      ? ArrowDownRight
      : value === 'neutral'
        ? Minus
        : CircleHelp;
  return (
    <span className={cn('inline-flex items-center gap-1 text-xs font-medium', FAVORABILITY_CLASSES[value])}>
      <Icon className="h-3.5 w-3.5" aria-hidden="true" /> {FAVORABILITY_LABELS[value]}
    </span>
  );
}

function formatMetricValue(key: string, value: number | null): string {
  if (value === null) return 'Indisponível';
  return key === 'margin' || key === 'cmvPercent' ? formatPercentBR(value, 1) : fmtBRL(value);
}

function formatMetricImpact(key: string, impact: PresentationScenarioMetricImpact): string {
  if (impact.absolute === null) return 'Indisponível';
  if (key === 'margin') return `${impact.absolute.toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })} p.p.`;
  const relative = impact.percent === null ? 'base zero' : formatPercentBR(impact.percent, 1);
  return `${fmtBRL(impact.absolute)} · ${relative}`;
}

function MetricComparisonCard({
  metricKey,
  label,
  result,
}: {
  metricKey: 'revenue' | 'expense' | 'result' | 'margin' | 'cmv';
  label: string;
  result: PresentationScenarioResult;
}) {
  const baselineValue = metricKey === 'margin' ? result.baseline.marginPercent : result.baseline[metricKey];
  const scenarioValue = metricKey === 'margin' ? result.scenario.marginPercent : result.scenario[metricKey];
  const impact = result.impact[metricKey];
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="pb-2">
        <CardTitle className="text-xs font-medium text-muted-foreground">{label}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div>
            <p className="text-muted-foreground">Base</p>
            <p className="mt-1 font-semibold text-foreground">{formatMetricValue(metricKey, baselineValue)}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Cenário</p>
            <p className="mt-1 font-semibold text-foreground">{formatMetricValue(metricKey, scenarioValue)}</p>
          </div>
        </div>
        <div className="border-t pt-2">
          <p className="text-[11px] text-muted-foreground">Impacto</p>
          <p className="mt-1 text-xs font-medium text-foreground">{formatMetricImpact(metricKey, impact)}</p>
          <div className="mt-1"><FavorabilityLabel value={impact.favorability} /></div>
        </div>
      </CardContent>
    </Card>
  );
}

function AdjustmentEditor({
  id,
  label,
  value,
  disabled = false,
  onChange,
}: {
  id: string;
  label: string;
  value: PresentationScenarioAdjustmentDraft;
  disabled?: boolean;
  onChange: (value: PresentationScenarioAdjustmentDraft) => void;
}) {
  return (
    <div className="space-y-2 rounded-lg border border-border/70 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label htmlFor={`${id}-value`} className="text-xs font-semibold text-foreground">{label}</label>
        <div className="inline-flex rounded-md border border-border bg-muted/30 p-0.5" role="group" aria-label={`Formato do ajuste de ${label}`}>
          {(['absolute', 'percentage'] as const).map(mode => (
            <Button
              key={mode}
              type="button"
              size="sm"
              variant={value.mode === mode ? 'secondary' : 'ghost'}
              aria-pressed={value.mode === mode}
              disabled={disabled}
              onClick={() => onChange({ mode, value: '' })}
              className="h-7 px-2 text-[11px]"
            >
              {mode === 'absolute' ? 'R$' : '% da base'}
            </Button>
          ))}
        </div>
      </div>
      {value.mode === 'absolute' ? (
        <CurrencyInput
          id={`${id}-value`}
          value={value.value}
          onValueChange={raw => onChange({ ...value, value: raw })}
          showPrefix
          disabled={disabled}
          aria-label={`${label}, ajuste absoluto em reais`}
        />
      ) : (
        <NumericInput
          id={`${id}-value`}
          value={value.value}
          onValueChange={raw => onChange({ ...value, value: raw })}
          allowNegative
          decimals={2}
          suffix="%"
          disabled={disabled}
          aria-label={`${label}, ajuste percentual sobre a base`}
        />
      )}
      <p className="text-[11px] text-muted-foreground">Vazio ou zero não altera a base.</p>
    </div>
  );
}

function categoryIsRelated(
  candidateId: string,
  selectedIds: ReadonlySet<string>,
  categories: ReadonlyMap<string, PresentationPlanCategory>,
): boolean {
  const followsSelectedAncestor = (startId: string, targets: ReadonlySet<string>) => {
    let current = categories.get(startId)?.parentCategoryId ?? null;
    const visited = new Set<string>();
    while (current) {
      if (targets.has(current)) return true;
      if (visited.has(current)) return true;
      visited.add(current);
      current = categories.get(current)?.parentCategoryId ?? null;
    }
    return false;
  };
  if (followsSelectedAncestor(candidateId, selectedIds)) return true;
  for (const selectedId of selectedIds) {
    if (followsSelectedAncestor(selectedId, new Set([candidateId]))) return true;
  }
  return false;
}

function baselineCategoryAvailable(
  category: PresentationPlanCategory,
  mode: PresentationScenarioBaselineMode,
  plan: PresentationPlanData,
): boolean {
  if (mode === 'actual') return true;
  if (mode === 'budget') return category.budgetAmount !== null;
  return plan.projection.state === 'available' && plan.projection.sampleDays > 0;
}

function ScenarioBridge({ result }: { result: PresentationScenarioResult }) {
  const steps = useMemo(() => {
    let running = result.baseline.result;
    const rows = result.activeLevers.map(lever => {
      const before = running;
      running += lever.resultImpact;
      return { id: lever.id, label: lever.label, before, after: running, impact: lever.resultImpact };
    });
    return rows;
  }, [result]);
  const maxMagnitude = Math.max(
    1,
    Math.abs(result.baseline.result),
    Math.abs(result.scenario.result),
    ...steps.flatMap(step => [Math.abs(step.before), Math.abs(step.after)]),
  );
  const description = `Ponte do resultado base ${fmtBRL(result.baseline.result)} ao resultado do cenário ${fmtBRL(result.scenario.result)}. ${steps.map(step => `${step.label}: ${fmtBRL(step.impact)}`).join('; ')}`;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Ponte do resultado</CardTitle>
        <p className="text-xs text-muted-foreground">Cada barra mostra o efeito isolado de uma premissa explícita.</p>
      </CardHeader>
      <CardContent>
        <div role="img" aria-label={description} className="space-y-3">
          <div className="grid grid-cols-[minmax(120px,1fr)_minmax(120px,2fr)_auto] items-center gap-3 text-xs">
            <span className="font-medium text-foreground">Resultado base</span>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-foreground/70" style={{ width: `${Math.max(3, (Math.abs(result.baseline.result) / maxMagnitude) * 100)}%` }} />
            </div>
            <strong>{fmtBRL(result.baseline.result)}</strong>
          </div>
          {steps.map(step => (
            <div key={step.id} className="grid grid-cols-[minmax(120px,1fr)_minmax(120px,2fr)_auto] items-center gap-3 text-xs">
              <span className="truncate text-muted-foreground">{step.label}</span>
              <div className="h-2 rounded-full bg-muted">
                <div
                  className={cn('h-2 rounded-full', step.impact >= 0 ? 'bg-success' : 'bg-destructive')}
                  style={{ width: `${Math.max(3, (Math.abs(step.impact) / maxMagnitude) * 100)}%` }}
                />
              </div>
              <span className={step.impact >= 0 ? 'text-success' : 'text-destructive'}>{fmtBRL(step.impact)}</span>
            </div>
          ))}
          <div className="grid grid-cols-[minmax(120px,1fr)_minmax(120px,2fr)_auto] items-center gap-3 border-t pt-3 text-xs">
            <span className="font-semibold text-foreground">Resultado cenário</span>
            <div className="h-2 rounded-full bg-muted">
              <div className="h-2 rounded-full bg-primary" style={{ width: `${Math.max(3, (Math.abs(result.scenario.result) / maxMagnitude) * 100)}%` }} />
            </div>
            <strong>{fmtBRL(result.scenario.result)}</strong>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function ActiveAssumptions({ result }: { result: PresentationScenarioResult }) {
  const ranked = useMemo(
    () => [...result.activeLevers].sort((left, right) => (
      Math.abs(right.resultImpact) - Math.abs(left.resultImpact)
      || left.label.localeCompare(right.label, 'pt-BR')
      || left.id.localeCompare(right.id)
    )),
    [result.activeLevers],
  );
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Premissas ativas</CardTitle>
        </CardHeader>
        <CardContent>
          {result.activeLevers.length === 0 ? (
            <p className="text-sm text-muted-foreground">Nenhuma alavanca explícita. O cenário é igual à base.</p>
          ) : (
            <ul className="space-y-2">
              {result.activeLevers.map(lever => (
                <li key={lever.id} className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-2 text-xs">
                  <span className="font-medium text-foreground">{lever.label}</span>
                  <span className="text-muted-foreground">
                    {lever.adjustmentMode === 'absolute' ? fmtBRL(lever.inputValue) : formatPercentBR(lever.inputValue, 2)}
                  </span>
                </li>
              ))}
            </ul>
          )}
          <div className="mt-4 space-y-1 text-[11px] text-muted-foreground">
            <p>Base: {BASELINE_LABELS[result.baselineMode]} · corte em {formatDateBR(parseLocalDate(result.cutoffDate))}</p>
            <p>Fontes: {result.sources.actual}, {result.sources.budget} e {result.sources.cmvTarget}.</p>
            <p>Fórmula: {result.formulaVersion}. Contas em aberto e transferências permanecem fora.</p>
          </div>
        </CardContent>
      </Card>

      <Card className="border-border/80 shadow-sm">
        <CardHeader>
          <CardTitle className="text-sm">Ranking por impacto no resultado</CardTitle>
        </CardHeader>
        <CardContent>
          {ranked.length === 0 ? (
            <p className="text-sm text-muted-foreground">Adicione uma alavanca para comparar impactos.</p>
          ) : (
            <ol className="space-y-2">
              {ranked.map((lever, index) => (
                <li key={lever.id} className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-2 border-b border-border/60 pb-2 text-xs">
                  <span className="font-bold text-primary-ink">{index + 1}</span>
                  <span className="truncate text-foreground">{lever.label}</span>
                  <span className={lever.resultImpact >= 0 ? 'text-success' : 'text-destructive'}>{fmtBRL(lever.resultImpact)}</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SensitivityChartTooltip({
  active,
  label,
  payload,
  unit,
}: {
  active?: boolean;
  label?: ReactNode;
  payload?: ChartTooltipPayloadItem[];
  unit: 'currency' | 'percent';
}) {
  const title = label == null
    ? undefined
    : unit === 'currency' ? fmtBRL(Number(label)) : formatPercentBR(Number(label), 2);
  return (
    <ChartTooltip
      active={active}
      label={label}
      payload={payload}
      title={title}
      valueFormatter={(value, item) => (item.name === 'Resultado' ? fmtBRL(Number(value)) : formatPercentBR(Number(value), 1))}
    />
  );
}

function SensitivityEditor({
  draft,
  result,
  onChange,
}: {
  draft: PresentationScenarioDraft;
  result: PresentationScenarioResult;
  onChange: (draft: PresentationScenarioDraft) => void;
}) {
  const activeLevers = result.activeLevers;
  const sensitivity = draft.sensitivity;
  const selectedLever = activeLevers.find(lever => lever.id === sensitivity?.leverId);
  const options = activeLevers.map(lever => ({ value: lever.id, label: lever.label }));
  const setField = (field: 'minValue' | 'maxValue' | 'stepValue', value: string) => {
    if (!sensitivity) return;
    onChange({ ...draft, sensitivity: { ...sensitivity, [field]: value } });
  };
  const sensitivityResult = result.sensitivity.state === 'available' ? result.sensitivity : null;

  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader className="flex-row items-start justify-between gap-3">
        <div>
          <CardTitle className="text-sm">Sensibilidade — uma variável por vez</CardTitle>
          <p className="mt-1 text-xs text-muted-foreground">A faixa e o passo são informados explicitamente; as demais alavancas ficam fixas.</p>
        </div>
        {sensitivity ? (
          <Button type="button" variant="ghost" size="sm" onClick={() => onChange({ ...draft, sensitivity: null })}>Remover análise</Button>
        ) : null}
      </CardHeader>
      <CardContent className="space-y-4">
        {!sensitivity ? (
          <Button
            type="button"
            variant="outline"
            disabled={activeLevers.length === 0}
            onClick={() => {
              const first = activeLevers[0];
              if (!first) return;
              onChange({
                ...draft,
                sensitivity: { leverId: first.id, minValue: '', maxValue: '', stepValue: '' },
              });
            }}
          >
            <SlidersHorizontal className="mr-2 h-4 w-4" aria-hidden="true" /> Configurar sensibilidade
          </Button>
        ) : (
          <>
            <div className="grid gap-3 md:grid-cols-4">
              <div className="md:col-span-1">
                <label className="mb-1.5 block text-xs font-medium text-foreground">Alavanca</label>
                <SearchableSelect
                  ariaLabel="Alavanca da sensibilidade"
                  value={sensitivity.leverId}
                  onValueChange={leverId => onChange({
                    ...draft,
                    sensitivity: { leverId, minValue: '', maxValue: '', stepValue: '' },
                  })}
                  options={options}
                  allowClear={false}
                  placeholder="Escolha uma alavanca"
                />
              </div>
              {(['minValue', 'maxValue', 'stepValue'] as const).map((field, index) => {
                const label = index === 0 ? 'Mínimo' : index === 1 ? 'Máximo' : 'Passo';
                const value = sensitivity[field];
                return (
                  <div key={field}>
                    <label htmlFor={`sensitivity-${field}`} className="mb-1.5 block text-xs font-medium text-foreground">{label}</label>
                    {selectedLever?.adjustmentMode === 'absolute' ? (
                      <CurrencyInput
                        id={`sensitivity-${field}`}
                        value={value}
                        onValueChange={raw => setField(field, raw)}
                        showPrefix
                      />
                    ) : (
                      <NumericInput
                        id={`sensitivity-${field}`}
                        value={value}
                        onValueChange={raw => setField(field, raw)}
                        allowNegative={field !== 'stepValue'}
                        decimals={2}
                        suffix="%"
                      />
                    )}
                  </div>
                );
              })}
            </div>

            {sensitivityResult ? (
              <div className="space-y-4">
                <div
                  className="h-64"
                  role="img"
                  aria-label={`Curva de sensibilidade de ${sensitivityResult.leverLabel}, com ${sensitivityResult.points.length} pontos de resultado e margem.`}
                >
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={sensitivityResult.points} margin={{ top: 12, right: 16, bottom: 8, left: 8 }}>
                      <CartesianGrid {...gridProps} vertical />
                      <XAxis dataKey="inputValue" {...axisProps} tickFormatter={value => sensitivityResult.unit === 'currency' ? chartValueFormatters.moneyCompact(value) : `${value}%`} />
                      <YAxis yAxisId="result" {...axisProps} tickFormatter={chartValueFormatters.moneyCompact} width={74} />
                      <YAxis yAxisId="margin" orientation="right" {...axisProps} tickFormatter={value => `${value.toFixed(1)}%`} width={52} />
                      <Tooltip {...tooltipProps} content={<SensitivityChartTooltip unit={sensitivityResult.unit} />} />
                      <ReferenceLine x={sensitivityResult.points.find(point => point.isBase)?.inputValue} stroke="hsl(var(--primary))" strokeDasharray="4 4" label="Atual" />
                      <Line yAxisId="result" type="linear" dataKey="result" name="Resultado" stroke="hsl(var(--primary))" strokeWidth={2.5} dot activeDot={makeActiveDot('hsl(var(--primary))')} />
                      <Line yAxisId="margin" type="linear" dataKey="marginPercent" name="Margem" stroke="hsl(var(--info))" strokeWidth={2} dot activeDot={makeActiveDot('hsl(var(--info))')} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
                <div className="rounded-lg border border-border/70 p-3 text-xs">
                  {sensitivityResult.breakEven.state === 'available' ? (
                    <p><strong>Ponto de equilíbrio derivado na faixa:</strong> {sensitivityResult.unit === 'currency' ? fmtBRL(sensitivityResult.breakEven.inputValue) : formatPercentBR(sensitivityResult.breakEven.inputValue, 2)}</p>
                  ) : (
                    <p className="text-muted-foreground">Ponto de equilíbrio indisponível com as informações atuais.</p>
                  )}
                </div>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader><TableRow><TableHead>Valor da alavanca</TableHead><TableHead>Resultado</TableHead><TableHead>Margem</TableHead><TableHead>Ponto</TableHead></TableRow></TableHeader>
                    <TableBody>
                      {sensitivityResult.points.map(point => (
                        <TableRow key={point.inputValue} className={point.isBase ? 'bg-primary/10' : undefined}>
                          <TableCell>{sensitivityResult.unit === 'currency' ? fmtBRL(point.inputValue) : formatPercentBR(point.inputValue, 2)}</TableCell>
                          <TableCell>{fmtBRL(point.result)}</TableCell>
                          <TableCell>{point.marginPercent === null ? 'Indisponível' : formatPercentBR(point.marginPercent, 1)}</TableCell>
                          <TableCell>{point.isBase ? <Badge variant="outline">Configuração atual</Badge> : 'Faixa'}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            ) : (
              <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Preencha mínimo, máximo e passo. A faixa deve incluir o valor atual da alavanca.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CategoryImpactTable({ result }: { result: PresentationScenarioResult }) {
  return (
    <Card className="border-border/80 shadow-sm">
      <CardHeader>
        <CardTitle className="text-sm">Impacto por categoria</CardTitle>
        <p className="text-xs text-muted-foreground">Rollup canônico da RPC; um ajuste aparece uma única vez e pais/descendentes não coexistem.</p>
      </CardHeader>
      <CardContent>
        {result.categoryRows.length === 0 ? (
          <p className="rounded-lg border border-dashed p-5 text-sm text-muted-foreground">Nenhuma categoria possui ajuste explícito.</p>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow><TableHead>Categoria</TableHead><TableHead>Natureza</TableHead><TableHead className="text-right">Base</TableHead><TableHead className="text-right">Ajuste</TableHead><TableHead className="text-right">Cenário</TableHead><TableHead>Favorabilidade</TableHead></TableRow></TableHeader>
              <TableBody>
                {result.categoryRows.map(row => (
                  <TableRow key={row.categoryId}>
                    <TableCell className="font-medium">{row.name}</TableCell>
                    <TableCell>{row.nature === 'RECEITA' ? 'Receita' : 'Despesa'}</TableCell>
                    <TableCell className="text-right">{fmtBRL(row.baseline)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(row.adjustment)}</TableCell>
                    <TableCell className="text-right">{fmtBRL(row.scenario)}</TableCell>
                    <TableCell><FavorabilityLabel value={row.favorability} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function ScenarioMetrics({ result }: { result: PresentationScenarioResult }) {
  const metrics = [
    { key: 'revenue' as const, label: 'Receita' },
    { key: 'expense' as const, label: 'Despesas' },
    { key: 'result' as const, label: 'Resultado' },
    { key: 'margin' as const, label: 'Margem' },
    { key: 'cmv' as const, label: 'CMV' },
  ];
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
      {metrics.map(metric => <MetricComparisonCard key={metric.key} metricKey={metric.key} label={metric.label} result={result} />)}
    </div>
  );
}

export default function PresentationScenarioSection({
  canSimulate,
  planAvailability,
  categories,
  draft,
  result,
  validationError,
  storageError,
  isDirty,
  hasMoreCategories,
  loadingMoreCategories,
  onLoadMoreCategories,
  onDraftChange,
  onBaselineModeChange,
  onClear,
}: PresentationScenarioSectionProps) {
  const [categoryToAdd, setCategoryToAdd] = useState('');
  const [confirmClear, setConfirmClear] = useState(false);
  const plan = planAvailability.state === 'available' ? planAvailability.data : null;
  const modeAvailability = plan ? presentationScenarioModeAvailability(plan) : null;
  const categoryMap = useMemo(() => new Map(categories.map(category => [category.categoryId, category])), [categories]);
  const selectedCategoryIds = useMemo(() => new Set(draft.categoryLevers.map(lever => lever.categoryId)), [draft.categoryLevers]);
  const categoryOptions = useMemo(() => plan ? categories
    .filter(category => baselineCategoryAvailable(category, draft.baselineMode, plan))
    .filter(category => !selectedCategoryIds.has(category.categoryId))
    .filter(category => !categoryIsRelated(category.categoryId, selectedCategoryIds, categoryMap))
    .map(category => ({
      value: category.categoryId,
      label: `${category.nature === 'RECEITA' ? 'Receita' : 'Despesa'} · ${category.name}`,
    })) : [], [categories, categoryMap, draft.baselineMode, plan, selectedCategoryIds]);
  const hasCmvCategoryLever = draft.categoryLevers.some(lever => (
    categoryMap.get(lever.categoryId)?.effectiveGroup === 'cmv' && lever.adjustment.value.trim() !== ''
  ));
  const cmvMoneyActive = draft.cmvMoney.value.trim() !== '';
  const cmvTargetActive = draft.cmvTargetPercent.trim() !== '';
  const cmvAvailable = plan ? baselineHasCmv(plan, draft.baselineMode) : false;

  const updateAdjustment = (
    field: 'totalRevenue' | 'totalExpense' | 'cmvMoney',
    value: PresentationScenarioAdjustmentDraft,
  ) => onDraftChange(current => ({ ...current, [field]: value }));

  const clear = () => {
    if (isDirty) setConfirmClear(true);
    else onClear();
  };

  return (
    <section id="presentation-scenario" aria-labelledby="presentation-scenario-title" className="scroll-mt-6 space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 id="presentation-scenario-title" className="text-sm font-semibold text-foreground">Cenários e sensibilidade</h2>
            <Badge className="bg-primary text-primary-foreground">SIMULAÇÃO</Badge>
          </div>
          <p className="mt-1 text-xs text-muted-foreground">Apoio à decisão com premissas informadas pelo usuário; não é previsão garantida.</p>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={clear}>
          <Eraser className="mr-2 h-4 w-4" aria-hidden="true" /> Limpar cenário
        </Button>
      </div>

      {!canSimulate ? (
        <Alert>
          <ShieldX className="h-4 w-4" aria-hidden="true" />
          <AlertTitle>Simulação sem permissão</AlertTitle>
          <AlertDescription>É necessária a permissão financeiro:relatorio-socios:simulate para editar cenários.</AlertDescription>
        </Alert>
      ) : planAvailability.state === 'loading' || planAvailability.state === 'idle' ? (
        <Card aria-busy="true"><CardContent className="flex items-center gap-2 p-6 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Preparando bases canônicas do cenário...</CardContent></Card>
      ) : planAvailability.state === 'error' ? (
        <Alert variant="destructive"><AlertTriangle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Cenários indisponíveis</AlertTitle><AlertDescription>{planAvailability.message}</AlertDescription></Alert>
      ) : planAvailability.state === 'unavailable' ? (
        <Alert><ShieldX className="h-4 w-4" aria-hidden="true" /><AlertTitle>Base sem acesso</AlertTitle><AlertDescription>As fontes canônicas necessárias não puderam ser consultadas.</AlertDescription></Alert>
      ) : plan ? (
        <>
          {storageError ? <Alert><Info className="h-4 w-4" aria-hidden="true" /><AlertTitle>Rascunho local</AlertTitle><AlertDescription>{storageError}</AlertDescription></Alert> : null}
          {validationError ? <Alert variant="destructive"><AlertTriangle className="h-4 w-4" aria-hidden="true" /><AlertTitle>Revise as premissas</AlertTitle><AlertDescription>{validationError.message}</AlertDescription></Alert> : null}
          {result?.warnings.map(warning => (
            <Alert key={warning}><Info className="h-4 w-4" aria-hidden="true" /><AlertTitle>Disponibilidade da base</AlertTitle><AlertDescription>{warning}</AlertDescription></Alert>
          ))}

          <Card className="border-primary/25 bg-primary/[0.03] shadow-sm">
            <CardContent className="space-y-4 p-4 sm:p-5">
              <div className="grid gap-4 lg:grid-cols-[minmax(220px,0.7fr)_minmax(0,1.3fr)]">
                <div>
                  <label htmlFor="scenario-name" className="mb-1.5 block text-xs font-semibold text-foreground">Nome local do cenário</label>
                  <Input
                    id="scenario-name"
                    value={draft.name}
                    maxLength={80}
                    onChange={event => onDraftChange(current => ({ ...current, name: event.target.value }))}
                    placeholder="Ex.: Renegociação de insumos"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">Rascunho salvo somente nesta sessão, isolado por usuário, empresa, período e filtros.</p>
                </div>
                <div>
                  <p className="mb-1.5 text-xs font-semibold text-foreground">Base explícita do cenário</p>
                  <div className="grid gap-2 sm:grid-cols-3" role="group" aria-label="Base do cenário">
                    {(Object.keys(BASELINE_LABELS) as PresentationScenarioBaselineMode[]).map(mode => {
                      const availability = modeAvailability?.[mode];
                      return (
                        <Button
                          key={mode}
                          type="button"
                          variant={draft.baselineMode === mode ? 'default' : 'outline'}
                          aria-label={`${BASELINE_LABELS[mode]}${!availability?.available ? ', indisponível' : ''}`}
                          aria-pressed={draft.baselineMode === mode}
                          aria-describedby={!availability?.available ? `scenario-mode-${mode}-reason` : undefined}
                          disabled={!availability?.available}
                          onClick={() => onBaselineModeChange(mode)}
                          className="h-auto min-h-11 flex-col items-start px-3 py-2 text-left"
                        >
                          <span>{BASELINE_LABELS[mode]}</span>
                          {!availability?.available ? <span id={`scenario-mode-${mode}-reason`} className="mt-0.5 text-[10px] opacity-75">Indisponível</span> : null}
                        </Button>
                      );
                    })}
                  </div>
                  {modeAvailability && !modeAvailability[draft.baselineMode].available ? (
                    <p className="mt-2 text-xs text-destructive">{MODE_UNAVAILABLE_LABELS[modeAvailability[draft.baselineMode].reason]}</p>
                  ) : null}
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/80 shadow-sm">
            <CardHeader>
              <CardTitle className="text-sm">Editor de alavancas explícitas</CardTitle>
              <p className="text-xs text-muted-foreground">Nenhuma alavanca recebe premissa padrão. Trocar R$ por percentual limpa o valor anterior.</p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid gap-3 lg:grid-cols-3">
                <AdjustmentEditor id="scenario-revenue" label="Receita total" value={draft.totalRevenue} onChange={value => updateAdjustment('totalRevenue', value)} />
                <AdjustmentEditor id="scenario-expense" label="Despesa total" value={draft.totalExpense} onChange={value => updateAdjustment('totalExpense', value)} />
                <AdjustmentEditor
                  id="scenario-cmv-money"
                  label="CMV monetário"
                  value={draft.cmvMoney}
                  disabled={cmvTargetActive || hasCmvCategoryLever || !cmvAvailable}
                  onChange={value => updateAdjustment('cmvMoney', value)}
                />
              </div>

              <div className="rounded-lg border border-border/70 p-3">
                <div className="grid gap-3 md:grid-cols-[minmax(0,1fr)_minmax(180px,0.35fr)] md:items-end">
                  <div>
                    <label htmlFor="scenario-cmv-target" className="text-xs font-semibold text-foreground">Meta percentual explícita de CMV sobre a receita do cenário</label>
                    <p className="mt-1 text-[11px] text-muted-foreground">Quando ativa, CMV = receita do cenário × percentual / 100. Receita não altera CMV sem esta premissa.</p>
                  </div>
                  <NumericInput
                    id="scenario-cmv-target"
                    value={draft.cmvTargetPercent}
                    onValueChange={raw => onDraftChange(current => ({ ...current, cmvTargetPercent: raw }))}
                    decimals={2}
                    suffix="%"
                    disabled={cmvMoneyActive || hasCmvCategoryLever || !cmvAvailable}
                    aria-label="Meta percentual explícita de CMV"
                  />
                </div>
              </div>

              <div className="space-y-3 border-t pt-4">
                <div className="flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-foreground">Categorias de receita ou despesa</p>
                    <p className="text-[11px] text-muted-foreground">Opções vêm do rollup operacional tenant-scoped de get_fin_presentation_plan.</p>
                  </div>
                  <div className="w-full sm:w-80">
                    <SearchableSelect
                      ariaLabel="Adicionar categoria ao cenário"
                      value={categoryToAdd}
                      onValueChange={categoryId => {
                        setCategoryToAdd('');
                        if (!categoryId) return;
                        onDraftChange(current => ({
                          ...current,
                          categoryLevers: [
                            ...current.categoryLevers,
                            { categoryId, adjustment: { mode: 'absolute', value: '' } },
                          ],
                        }));
                      }}
                      options={categoryOptions}
                      placeholder="Adicionar categoria..."
                      searchPlaceholder="Buscar categoria..."
                      emptyMessage="Nenhuma categoria compatível com a base."
                      allowClear={false}
                    />
                  </div>
                </div>
                {draft.categoryLevers.length === 0 ? (
                  <p className="rounded-lg border border-dashed p-4 text-sm text-muted-foreground">Nenhuma categoria adicionada.</p>
                ) : (
                  <div className="grid gap-3 lg:grid-cols-2">
                    {draft.categoryLevers.map(lever => {
                      const category = categoryMap.get(lever.categoryId);
                      return (
                        <div key={lever.categoryId} className="relative">
                          <AdjustmentEditor
                            id={`scenario-category-${lever.categoryId}`}
                            label={category ? `${category.nature === 'RECEITA' ? 'Receita' : 'Despesa'} · ${category.name}` : 'Categoria indisponível'}
                            value={lever.adjustment}
                            disabled={!category || ((cmvMoneyActive || cmvTargetActive) && category.effectiveGroup === 'cmv')}
                            onChange={adjustment => onDraftChange(current => ({
                              ...current,
                              categoryLevers: current.categoryLevers.map(item => item.categoryId === lever.categoryId ? { ...item, adjustment } : item),
                            }))}
                          />
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Remover ajuste da categoria ${category?.name ?? lever.categoryId}`}
                            onClick={() => onDraftChange(current => ({
                              ...current,
                              categoryLevers: current.categoryLevers.filter(item => item.categoryId !== lever.categoryId),
                              sensitivity: current.sensitivity?.leverId === `category:${lever.categoryId}` ? null : current.sensitivity,
                            }))}
                            className="absolute right-2 top-2 h-8 w-8 text-muted-foreground hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" aria-hidden="true" />
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}
                {hasMoreCategories ? (
                  <Button type="button" variant="outline" size="sm" onClick={onLoadMoreCategories} disabled={loadingMoreCategories}>
                    {loadingMoreCategories ? <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" /> : <Plus className="mr-2 h-4 w-4" aria-hidden="true" />}
                    Carregar mais categorias
                  </Button>
                ) : null}
              </div>
            </CardContent>
          </Card>

          {result ? (
            <>
              <ScenarioMetrics result={result} />
              <ScenarioBridge result={result} />
              <ActiveAssumptions result={result} />
              <CategoryImpactTable result={result} />
              <SensitivityEditor draft={draft} result={result} onChange={onDraftChange} />
            </>
          ) : (
            <Card><CardContent className="p-6 text-sm text-muted-foreground">Ajuste a base ou corrija as premissas para calcular o cenário.</CardContent></Card>
          )}
        </>
      ) : null}

      <AlertDialog open={confirmClear} onOpenChange={setConfirmClear}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Descartar alterações do cenário?</AlertDialogTitle>
            <AlertDialogDescription>O nome, as alavancas e a sensibilidade deste rascunho local serão removidos.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Continuar editando</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => { onClear(); setConfirmClear(false); }}
            >
              Descartar cenário
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}

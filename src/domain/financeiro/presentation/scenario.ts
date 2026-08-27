import type {
  NormalizedDateRange,
  TimeSeriesGranularity,
} from './contracts';
import type {
  PresentationPlanCategory,
  PresentationPlanData,
  PresentationPlanMetricSet,
} from './plan';

export const PRESENTATION_SCENARIO_FORMULA_VERSION = 'presentation-scenario-v1.0' as const;
export const PRESENTATION_SCENARIO_DRAFT_VERSION = '1.0' as const;
export const PRESENTATION_SCENARIO_BASELINE_MODES = ['actual', 'budget', 'projection'] as const;
export const PRESENTATION_SCENARIO_MAX_CATEGORY_LEVERS = 50;
export const PRESENTATION_SCENARIO_MAX_SENSITIVITY_POINTS = 101;
export const PRESENTATION_SCENARIO_MAX_STORAGE_BYTES = 64_000;
export const PRESENTATION_SCENARIO_MAX_RESULT_BYTES = 256_000;

export type PresentationScenarioBaselineMode = typeof PRESENTATION_SCENARIO_BASELINE_MODES[number];
export type PresentationScenarioAdjustmentMode = 'absolute' | 'percentage';
export type PresentationScenarioMetricKey = 'revenue' | 'expense' | 'result' | 'margin' | 'cmv';
export type PresentationScenarioFavorability = 'favorable' | 'unfavorable' | 'neutral' | 'unavailable';

export interface PresentationScenarioAdjustmentDraft {
  mode: PresentationScenarioAdjustmentMode;
  /** Decimal exato em texto; dinheiro e percentuais nunca são persistidos como float. */
  value: string;
}

export interface PresentationScenarioCategoryLeverDraft {
  categoryId: string;
  adjustment: PresentationScenarioAdjustmentDraft;
}

export interface PresentationScenarioSensitivityDraft {
  leverId: string;
  minValue: string;
  maxValue: string;
  stepValue: string;
}

export interface PresentationScenarioDraft {
  version: typeof PRESENTATION_SCENARIO_DRAFT_VERSION;
  name: string;
  baselineMode: PresentationScenarioBaselineMode;
  totalRevenue: PresentationScenarioAdjustmentDraft;
  totalExpense: PresentationScenarioAdjustmentDraft;
  cmvMoney: PresentationScenarioAdjustmentDraft;
  /** Meta exata de CMV sobre a receita do cenário; vazio significa inativa. */
  cmvTargetPercent: string;
  categoryLevers: readonly PresentationScenarioCategoryLeverDraft[];
  sensitivity: PresentationScenarioSensitivityDraft | null;
}

export interface PresentationScenarioMetricSet {
  revenue: number;
  expense: number;
  result: number;
  marginPercent: number | null;
  cmv: number | null;
  cmvPercent: number | null;
}

export interface PresentationScenarioMetricImpact {
  baseline: number | null;
  scenario: number | null;
  absolute: number | null;
  percent: number | null;
  favorability: PresentationScenarioFavorability;
}

export interface PresentationScenarioActiveLever {
  id: string;
  target: 'revenue-total' | 'expense-total' | 'category' | 'cmv-money' | 'cmv-percent-target';
  label: string;
  nature: 'RECEITA' | 'DESPESA' | 'CMV';
  categoryId: string | null;
  adjustmentMode: PresentationScenarioAdjustmentMode | 'target-percent';
  inputValue: number;
  metricImpact: number;
  resultImpact: number;
  favorability: PresentationScenarioFavorability;
}

export interface PresentationScenarioCategoryRow {
  categoryId: string;
  parentCategoryId: string | null;
  name: string;
  nature: 'RECEITA' | 'DESPESA';
  effectiveGroup: string | null;
  baseline: number;
  adjustment: number;
  scenario: number;
  impactPercent: number | null;
  favorability: PresentationScenarioFavorability;
}

export interface PresentationScenarioSensitivityPoint {
  inputValue: number;
  result: number;
  marginPercent: number | null;
  isBase: boolean;
}

export type PresentationScenarioBreakEven =
  | { state: 'available'; inputValue: number }
  | { state: 'unavailable'; reason: 'outside-configured-range' | 'no-linear-crossing' };

export type PresentationScenarioSensitivity =
  | { state: 'not-configured' }
  | {
      state: 'available';
      leverId: string;
      leverLabel: string;
      unit: 'currency' | 'percent';
      points: readonly PresentationScenarioSensitivityPoint[];
      breakEven: PresentationScenarioBreakEven;
    };

export interface PresentationScenarioModeAvailability {
  available: boolean;
  reason: 'available' | 'budget-not-configured' | 'projection-unavailable' | 'baseline-metrics-unavailable';
}

export interface PresentationScenarioResult {
  contractVersion: '1.0';
  baselineMode: PresentationScenarioBaselineMode;
  baselineSource: 'fin_lancamentos' | 'fin_orcamentos' | 'get_fin_presentation_plan.projection';
  scenarioName: string;
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
  cutoffDate: string;
  baseline: PresentationScenarioMetricSet;
  scenario: PresentationScenarioMetricSet;
  impact: Record<PresentationScenarioMetricKey, PresentationScenarioMetricImpact>;
  activeLevers: readonly PresentationScenarioActiveLever[];
  categoryRows: readonly PresentationScenarioCategoryRow[];
  sensitivity: PresentationScenarioSensitivity;
  availability: {
    modes: Record<PresentationScenarioBaselineMode, PresentationScenarioModeAvailability>;
    cmv: boolean;
  };
  sources: PresentationPlanData['sources'] & {
    baseline: PresentationScenarioResult['baselineSource'];
  };
  rules: PresentationPlanData['rules'] & {
    scenarioFormula: string;
    cmvFormula: string;
    categoryPrecedence: string;
    automaticCmvRecalculation: false;
    simulationLabel: 'SIMULAÇÃO';
  };
  formulaVersion: typeof PRESENTATION_SCENARIO_FORMULA_VERSION;
  warnings: readonly string[];
}

export interface BuildPresentationScenarioInput {
  draft: PresentationScenarioDraft;
  plan: PresentationPlanData;
  categories: readonly PresentationPlanCategory[];
  period: NormalizedDateRange;
  granularity: TimeSeriesGranularity;
}

export class PresentationScenarioValidationError extends Error {
  readonly code: string;
  readonly path: string;

  constructor(code: string, path: string, message: string) {
    super(message);
    this.name = 'PresentationScenarioValidationError';
    this.code = code;
    this.path = path;
  }
}

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_ABS_SCALED_VALUE = 100_000_000_000_000n;
const MAX_PERCENT_BASIS_POINTS = 10_000_000n;

function validationError(code: string, path: string, message: string): never {
  throw new PresentationScenarioValidationError(code, path, message);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoundedString(value: unknown, path: string, maximumLength: number, allowEmpty = true): string {
  if (typeof value !== 'string' || value.length > maximumLength || (!allowEmpty && value.length === 0)) {
    return validationError('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  }
  return value;
}

function readAdjustment(value: unknown, path: string): PresentationScenarioAdjustmentDraft {
  if (!isRecord(value)) return validationError('MALFORMED_PAYLOAD', path, `${path} inválido.`);
  if (value.mode !== 'absolute' && value.mode !== 'percentage') {
    return validationError('UNKNOWN_ENUM', `${path}.mode`, 'Formato de ajuste desconhecido.');
  }
  const raw = readBoundedString(value.value, `${path}.value`, 40);
  if (!/^[-+\dR$.,\s]*$/.test(raw)) {
    return validationError('MALFORMED_PAYLOAD', `${path}.value`, 'Valor de ajuste malformado.');
  }
  return { mode: value.mode, value: raw };
}

function readSensitivityDraft(value: unknown): PresentationScenarioSensitivityDraft | null {
  if (value === null) return null;
  if (!isRecord(value)) return validationError('MALFORMED_PAYLOAD', 'sensitivity', 'Sensibilidade inválida.');
  return {
    leverId: readBoundedString(value.leverId, 'sensitivity.leverId', 80, false),
    minValue: readBoundedString(value.minValue, 'sensitivity.minValue', 40),
    maxValue: readBoundedString(value.maxValue, 'sensitivity.maxValue', 40),
    stepValue: readBoundedString(value.stepValue, 'sensitivity.stepValue', 40),
  };
}

export function createEmptyPresentationScenarioDraft(
  baselineMode: PresentationScenarioBaselineMode = 'actual',
): PresentationScenarioDraft {
  const emptyAdjustment = (): PresentationScenarioAdjustmentDraft => ({ mode: 'absolute', value: '' });
  return {
    version: PRESENTATION_SCENARIO_DRAFT_VERSION,
    name: '',
    baselineMode,
    totalRevenue: emptyAdjustment(),
    totalExpense: emptyAdjustment(),
    cmvMoney: emptyAdjustment(),
    cmvTargetPercent: '',
    categoryLevers: [],
    sensitivity: null,
  };
}

export function parsePresentationScenarioDraft(value: unknown): PresentationScenarioDraft {
  if (!isRecord(value)) return validationError('MALFORMED_PAYLOAD', 'draft', 'Rascunho de cenário inválido.');
  if (value.version !== PRESENTATION_SCENARIO_DRAFT_VERSION) {
    return validationError('UNKNOWN_VERSION', 'version', 'Versão do rascunho incompatível.');
  }
  if (!PRESENTATION_SCENARIO_BASELINE_MODES.includes(value.baselineMode as PresentationScenarioBaselineMode)) {
    return validationError('UNKNOWN_ENUM', 'baselineMode', 'Base de cenário desconhecida.');
  }
  if (!Array.isArray(value.categoryLevers) || value.categoryLevers.length > PRESENTATION_SCENARIO_MAX_CATEGORY_LEVERS) {
    return validationError('PAYLOAD_TOO_LARGE', 'categoryLevers', 'Quantidade de alavancas por categoria excede o limite.');
  }
  const seen = new Set<string>();
  const categoryLevers = value.categoryLevers.map((item, index) => {
    if (!isRecord(item)) return validationError('MALFORMED_PAYLOAD', `categoryLevers[${index}]`, 'Alavanca de categoria inválida.');
    const categoryId = readBoundedString(item.categoryId, `categoryLevers[${index}].categoryId`, 36, false);
    if (!UUID_PATTERN.test(categoryId)) {
      return validationError('INVALID_UUID', `categoryLevers[${index}].categoryId`, 'Categoria sem UUID válido.');
    }
    if (seen.has(categoryId)) {
      return validationError('DUPLICATE_TARGET', `categoryLevers[${index}].categoryId`, 'Categoria repetida no cenário.');
    }
    seen.add(categoryId);
    return {
      categoryId,
      adjustment: readAdjustment(item.adjustment, `categoryLevers[${index}].adjustment`),
    };
  });
  const cmvTargetPercent = readBoundedString(value.cmvTargetPercent, 'cmvTargetPercent', 40);
  if (!/^[-+\d.,\s]*$/.test(cmvTargetPercent)) {
    return validationError('MALFORMED_PAYLOAD', 'cmvTargetPercent', 'Meta percentual de CMV malformada.');
  }
  return {
    version: PRESENTATION_SCENARIO_DRAFT_VERSION,
    name: readBoundedString(value.name, 'name', 80),
    baselineMode: value.baselineMode as PresentationScenarioBaselineMode,
    totalRevenue: readAdjustment(value.totalRevenue, 'totalRevenue'),
    totalExpense: readAdjustment(value.totalExpense, 'totalExpense'),
    cmvMoney: readAdjustment(value.cmvMoney, 'cmvMoney'),
    cmvTargetPercent,
    categoryLevers,
    sensitivity: readSensitivityDraft(value.sensitivity),
  };
}

function normalizeDecimal(value: string): { negative: boolean; integer: string; fraction: string } | null {
  let normalized = value.trim().replace(/[R$\s\u00a0]/g, '');
  if (!normalized || normalized === '-' || normalized === '+') return null;
  const negative = normalized.startsWith('-');
  if (negative || normalized.startsWith('+')) normalized = normalized.slice(1);
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  let decimalSeparator = '';
  if (lastComma >= 0 && lastDot >= 0) decimalSeparator = lastComma > lastDot ? ',' : '.';
  else if (lastComma >= 0) decimalSeparator = ',';
  else if (lastDot >= 0) decimalSeparator = '.';
  let integer = normalized;
  let fraction = '';
  if (decimalSeparator) {
    const position = normalized.lastIndexOf(decimalSeparator);
    integer = normalized.slice(0, position);
    fraction = normalized.slice(position + 1);
    const groupingSeparator = decimalSeparator === ',' ? '.' : ',';
    integer = integer.split(groupingSeparator).join('');
  }
  if (!/^\d+$/.test(integer || '0') || !/^\d*$/.test(fraction)) return null;
  return { negative, integer: integer || '0', fraction };
}

/** Converte texto decimal para inteiro escalado sem passar por float. */
export function parseExactScaledInteger(value: string, scale: number, path = 'value'): bigint {
  const parts = normalizeDecimal(value);
  if (!parts) return validationError('INVALID_NUMBER', path, 'Informe um valor numérico completo.');
  if (parts.fraction.length > scale) {
    return validationError('INVALID_SCALE', path, `Use no máximo ${scale} casas decimais.`);
  }
  const digits = `${parts.integer}${parts.fraction.padEnd(scale, '0')}`.replace(/^0+(?=\d)/, '');
  const scaled = BigInt(digits || '0') * (parts.negative ? -1n : 1n);
  if (scaled > MAX_ABS_SCALED_VALUE || scaled < -MAX_ABS_SCALED_VALUE) {
    return validationError('VALUE_TOO_LARGE', path, 'Valor excede o limite seguro da simulação.');
  }
  return scaled;
}

function moneyToCents(value: number | null, path: string): bigint | null {
  if (value === null) return null;
  if (!Number.isFinite(value)) return validationError('NON_FINITE', path, `${path} deve ser finito.`);
  const cents = BigInt(Math.round(value * 100));
  if (cents > MAX_ABS_SCALED_VALUE || cents < -MAX_ABS_SCALED_VALUE) {
    return validationError('VALUE_TOO_LARGE', path, `${path} excede o limite seguro.`);
  }
  return cents;
}

function centsToMoney(value: bigint): number {
  const numeric = Number(value) / 100;
  if (!Number.isFinite(numeric)) return validationError('NON_FINITE', 'result', 'Resultado não finito.');
  return numeric;
}

function roundDivide(numerator: bigint, denominator: bigint): bigint {
  if (denominator <= 0n) throw new RangeError('Denominator must be positive');
  const negative = numerator < 0n;
  const absolute = negative ? -numerator : numerator;
  const quotient = (absolute + denominator / 2n) / denominator;
  return negative ? -quotient : quotient;
}

function adjustmentToCents(
  baselineCents: bigint,
  adjustment: PresentationScenarioAdjustmentDraft,
  path: string,
): bigint {
  if (adjustment.value.trim() === '') return 0n;
  if (adjustment.mode === 'absolute') return parseExactScaledInteger(adjustment.value, 2, path);
  const basisPoints = parseExactScaledInteger(adjustment.value, 2, path);
  if (basisPoints > MAX_PERCENT_BASIS_POINTS || basisPoints < -MAX_PERCENT_BASIS_POINTS) {
    return validationError('VALUE_TOO_LARGE', path, 'Percentual excede o limite seguro da simulação.');
  }
  return roundDivide(baselineCents * basisPoints, 10_000n);
}

function percentage(numerator: bigint, denominator: bigint): number | null {
  if (denominator === 0n) return null;
  const value = (Number(numerator) / Number(denominator)) * 100;
  return Number.isFinite(value) ? value : null;
}

function metricSetFromPlan(metrics: PresentationPlanMetricSet): PresentationScenarioMetricSet | null {
  if (metrics.revenue === null || metrics.expense === null || metrics.result === null) return null;
  return {
    revenue: metrics.revenue,
    expense: metrics.expense,
    result: metrics.result,
    marginPercent: metrics.revenue === 0 ? null : metrics.marginPercent,
    cmv: metrics.cmv,
    cmvPercent: metrics.revenue === 0 ? null : metrics.cmvPercent,
  };
}

export function presentationScenarioModeAvailability(
  plan: PresentationPlanData,
): Record<PresentationScenarioBaselineMode, PresentationScenarioModeAvailability> {
  const actualAvailable = metricSetFromPlan(plan.actual) !== null;
  const budgetConfigured = plan.coverage.revenue.configured && plan.coverage.expense.configured;
  const budgetAvailable = budgetConfigured && metricSetFromPlan(plan.budget) !== null;
  const projectionAvailable = plan.projection.state === 'available'
    && plan.projection.metrics !== null
    && metricSetFromPlan(plan.projection.metrics) !== null;
  return {
    actual: {
      available: actualAvailable,
      reason: actualAvailable ? 'available' : 'baseline-metrics-unavailable',
    },
    budget: {
      available: budgetAvailable,
      reason: budgetAvailable
        ? 'available'
        : budgetConfigured ? 'baseline-metrics-unavailable' : 'budget-not-configured',
    },
    projection: {
      available: projectionAvailable,
      reason: projectionAvailable ? 'available' : 'projection-unavailable',
    },
  };
}

function baselineForMode(
  plan: PresentationPlanData,
  mode: PresentationScenarioBaselineMode,
): PresentationScenarioMetricSet {
  const availability = presentationScenarioModeAvailability(plan)[mode];
  if (!availability.available) {
    return validationError('BASELINE_UNAVAILABLE', 'baselineMode', 'A base selecionada está indisponível no período.');
  }
  const source = mode === 'actual'
    ? plan.actual
    : mode === 'budget'
      ? plan.budget
      : plan.projection.metrics;
  const metrics = source ? metricSetFromPlan(source) : null;
  if (!metrics) return validationError('BASELINE_UNAVAILABLE', 'baselineMode', 'Métricas da base selecionada estão indisponíveis.');
  return metrics;
}

function categoryBaselineCents(
  category: PresentationPlanCategory,
  mode: PresentationScenarioBaselineMode,
  plan: PresentationPlanData,
): bigint {
  if (mode === 'actual') return moneyToCents(category.actualAmount, `category.${category.categoryId}.actualAmount`)!;
  if (mode === 'budget') {
    const amount = moneyToCents(category.budgetAmount, `category.${category.categoryId}.budgetAmount`);
    if (amount === null) {
      return validationError('CATEGORY_BASELINE_UNAVAILABLE', category.categoryId, 'Categoria sem orçamento na base selecionada.');
    }
    return amount;
  }
  if (plan.projection.state !== 'available' || plan.projection.sampleDays <= 0) {
    return validationError('CATEGORY_BASELINE_UNAVAILABLE', category.categoryId, 'Projeção da categoria indisponível.');
  }
  const actual = moneyToCents(category.actualAmount, `category.${category.categoryId}.actualAmount`)!;
  return roundDivide(actual * BigInt(plan.projection.totalDays), BigInt(plan.projection.sampleDays));
}

function isActiveAdjustment(adjustment: PresentationScenarioAdjustmentDraft): boolean {
  if (adjustment.value.trim() === '') return false;
  return parseExactScaledInteger(adjustment.value, 2) !== 0n;
}

function resultFavorability(resultImpact: bigint): PresentationScenarioFavorability {
  if (resultImpact > 0n) return 'favorable';
  if (resultImpact < 0n) return 'unfavorable';
  return 'neutral';
}

function metricFavorability(
  key: PresentationScenarioMetricKey,
  baseline: number | null,
  scenario: number | null,
): PresentationScenarioFavorability {
  if (baseline === null || scenario === null) return 'unavailable';
  const delta = scenario - baseline;
  if (Math.abs(delta) < 0.0000001) return 'neutral';
  const higherIsBetter = key === 'revenue' || key === 'result' || key === 'margin';
  return (higherIsBetter ? delta > 0 : delta < 0) ? 'favorable' : 'unfavorable';
}

function buildMetricImpact(
  key: PresentationScenarioMetricKey,
  baseline: number | null,
  scenario: number | null,
): PresentationScenarioMetricImpact {
  if (baseline === null || scenario === null) {
    return { baseline, scenario, absolute: null, percent: null, favorability: 'unavailable' };
  }
  const absolute = scenario - baseline;
  return {
    baseline,
    scenario,
    absolute,
    percent: baseline === 0 ? null : (absolute / Math.abs(baseline)) * 100,
    favorability: metricFavorability(key, baseline, scenario),
  };
}

function assertNoHierarchyOverlap(
  categoryLevers: readonly PresentationScenarioCategoryLeverDraft[],
  categoryMap: ReadonlyMap<string, PresentationPlanCategory>,
): void {
  const selected = new Set(categoryLevers.map(lever => lever.categoryId));
  for (const lever of categoryLevers) {
    let parentId = categoryMap.get(lever.categoryId)?.parentCategoryId ?? null;
    const visited = new Set<string>();
    while (parentId) {
      if (visited.has(parentId)) return validationError('CATEGORY_HIERARCHY_CYCLE', lever.categoryId, 'Hierarquia de categorias contém ciclo.');
      if (selected.has(parentId)) {
        return validationError('CATEGORY_HIERARCHY_OVERLAP', lever.categoryId, 'Categoria pai e descendente não podem ser ajustadas juntas.');
      }
      visited.add(parentId);
      parentId = categoryMap.get(parentId)?.parentCategoryId ?? null;
    }
  }
}

interface ScenarioCore {
  baseline: PresentationScenarioMetricSet;
  scenario: PresentationScenarioMetricSet;
  activeLevers: PresentationScenarioActiveLever[];
  categoryRows: PresentationScenarioCategoryRow[];
  warnings: string[];
}

function calculateScenarioCore(
  input: BuildPresentationScenarioInput,
  draft: PresentationScenarioDraft,
): ScenarioCore {
  const baseline = baselineForMode(input.plan, draft.baselineMode);
  const baseRevenue = moneyToCents(baseline.revenue, 'baseline.revenue')!;
  const baseExpense = moneyToCents(baseline.expense, 'baseline.expense')!;
  const baseCmv = moneyToCents(baseline.cmv, 'baseline.cmv');
  const categoryMap = new Map(input.categories.map(category => [category.categoryId, category]));
  const activeCategoryDrafts = draft.categoryLevers.filter(lever => isActiveAdjustment(lever.adjustment));
  assertNoHierarchyOverlap(activeCategoryDrafts, categoryMap);

  const revenueTotalDelta = adjustmentToCents(baseRevenue, draft.totalRevenue, 'totalRevenue.value');
  const expenseTotalDelta = adjustmentToCents(baseExpense, draft.totalExpense, 'totalExpense.value');
  const cmvMoneyDelta = baseCmv === null
    ? (isActiveAdjustment(draft.cmvMoney)
      ? validationError('CMV_UNAVAILABLE', 'cmvMoney', 'CMV monetário indisponível na base selecionada.')
      : 0n)
    : adjustmentToCents(baseCmv, draft.cmvMoney, 'cmvMoney.value');
  const categoryRows: PresentationScenarioCategoryRow[] = [];
  const activeLevers: PresentationScenarioActiveLever[] = [];
  let revenueCategoryDelta = 0n;
  let expenseCategoryDelta = 0n;
  let cmvCategoryDelta = 0n;
  let hasActiveCmvCategoryLever = false;

  if (revenueTotalDelta !== 0n) {
    activeLevers.push({
      id: 'revenue-total',
      target: 'revenue-total',
      label: 'Receita total',
      nature: 'RECEITA',
      categoryId: null,
      adjustmentMode: draft.totalRevenue.mode,
      inputValue: Number(parseExactScaledInteger(draft.totalRevenue.value, 2)) / 100,
      metricImpact: centsToMoney(revenueTotalDelta),
      resultImpact: centsToMoney(revenueTotalDelta),
      favorability: resultFavorability(revenueTotalDelta),
    });
  }
  if (expenseTotalDelta !== 0n) {
    activeLevers.push({
      id: 'expense-total',
      target: 'expense-total',
      label: 'Despesa total',
      nature: 'DESPESA',
      categoryId: null,
      adjustmentMode: draft.totalExpense.mode,
      inputValue: Number(parseExactScaledInteger(draft.totalExpense.value, 2)) / 100,
      metricImpact: centsToMoney(expenseTotalDelta),
      resultImpact: centsToMoney(-expenseTotalDelta),
      favorability: resultFavorability(-expenseTotalDelta),
    });
  }

  for (const lever of activeCategoryDrafts) {
    const category = categoryMap.get(lever.categoryId);
    if (!category) {
      return validationError('CATEGORY_OUTSIDE_TENANT', lever.categoryId, 'Categoria não pertence ao conjunto tenant-scoped da base.');
    }
    const categoryBase = categoryBaselineCents(category, draft.baselineMode, input.plan);
    const delta = adjustmentToCents(categoryBase, lever.adjustment, `categoryLevers.${lever.categoryId}.value`);
    if (category.nature === 'RECEITA') revenueCategoryDelta += delta;
    else expenseCategoryDelta += delta;
    if (category.effectiveGroup === 'cmv') {
      cmvCategoryDelta += delta;
      hasActiveCmvCategoryLever = true;
    }
    const resultImpact = category.nature === 'RECEITA' ? delta : -delta;
    activeLevers.push({
      id: `category:${category.categoryId}`,
      target: 'category',
      label: category.name,
      nature: category.nature,
      categoryId: category.categoryId,
      adjustmentMode: lever.adjustment.mode,
      inputValue: Number(parseExactScaledInteger(lever.adjustment.value, 2)) / 100,
      metricImpact: centsToMoney(delta),
      resultImpact: centsToMoney(resultImpact),
      favorability: resultFavorability(resultImpact),
    });
    categoryRows.push({
      categoryId: category.categoryId,
      parentCategoryId: category.parentCategoryId,
      name: category.name,
      nature: category.nature,
      effectiveGroup: category.effectiveGroup,
      baseline: centsToMoney(categoryBase),
      adjustment: centsToMoney(delta),
      scenario: centsToMoney(categoryBase + delta),
      impactPercent: percentage(delta, categoryBase < 0n ? -categoryBase : categoryBase),
      favorability: resultFavorability(resultImpact),
    });
  }

  const cmvTargetActive = draft.cmvTargetPercent.trim() !== '';
  const cmvMoneyActive = cmvMoneyDelta !== 0n;
  if (cmvTargetActive && (cmvMoneyActive || hasActiveCmvCategoryLever)) {
    return validationError('CMV_LEVER_CONFLICT', 'cmvTargetPercent', 'CMV monetário e meta percentual de CMV são mutuamente exclusivos.');
  }
  if (cmvMoneyActive && hasActiveCmvCategoryLever) {
    return validationError('CMV_LEVER_CONFLICT', 'cmvMoney', 'Ajuste de CMV e categoria de CMV não podem ser aplicados juntos.');
  }

  const scenarioRevenue = baseRevenue + revenueTotalDelta + revenueCategoryDelta;
  let cmvDelta = cmvMoneyDelta + cmvCategoryDelta;
  let scenarioCmv = baseCmv === null ? null : baseCmv + cmvDelta;
  if (cmvTargetActive) {
    if (baseCmv === null) return validationError('CMV_UNAVAILABLE', 'cmvTargetPercent', 'CMV indisponível para aplicar meta percentual.');
    const targetBasisPoints = parseExactScaledInteger(draft.cmvTargetPercent, 2, 'cmvTargetPercent');
    if (targetBasisPoints < 0n || targetBasisPoints > MAX_PERCENT_BASIS_POINTS) {
      return validationError('INVALID_CMV_TARGET', 'cmvTargetPercent', 'Meta percentual de CMV deve ser positiva e finita.');
    }
    scenarioCmv = roundDivide(scenarioRevenue * targetBasisPoints, 10_000n);
    cmvDelta = scenarioCmv - baseCmv;
    activeLevers.push({
      id: 'cmv-percent-target',
      target: 'cmv-percent-target',
      label: 'Meta percentual de CMV',
      nature: 'CMV',
      categoryId: null,
      adjustmentMode: 'target-percent',
      inputValue: Number(targetBasisPoints) / 100,
      metricImpact: centsToMoney(cmvDelta),
      resultImpact: centsToMoney(-cmvDelta),
      favorability: resultFavorability(-cmvDelta),
    });
  } else if (cmvMoneyActive) {
    activeLevers.push({
      id: 'cmv-money',
      target: 'cmv-money',
      label: 'CMV monetário',
      nature: 'CMV',
      categoryId: null,
      adjustmentMode: draft.cmvMoney.mode,
      inputValue: Number(parseExactScaledInteger(draft.cmvMoney.value, 2)) / 100,
      metricImpact: centsToMoney(cmvMoneyDelta),
      resultImpact: centsToMoney(-cmvMoneyDelta),
      favorability: resultFavorability(-cmvMoneyDelta),
    });
  }

  const scenarioExpense = baseExpense + expenseTotalDelta + expenseCategoryDelta + (cmvTargetActive || cmvMoneyActive ? cmvDelta : 0n);
  const scenarioResult = scenarioRevenue - scenarioExpense;
  const unchangedResult = scenarioRevenue === baseRevenue && scenarioExpense === baseExpense;
  const unchangedCmv = scenarioCmv === baseCmv && scenarioRevenue === baseRevenue;
  const scenario: PresentationScenarioMetricSet = {
    revenue: centsToMoney(scenarioRevenue),
    expense: centsToMoney(scenarioExpense),
    result: centsToMoney(scenarioResult),
    marginPercent: unchangedResult ? baseline.marginPercent : percentage(scenarioResult, scenarioRevenue),
    cmv: scenarioCmv === null ? null : centsToMoney(scenarioCmv),
    cmvPercent: scenarioCmv === null
      ? null
      : unchangedCmv ? baseline.cmvPercent : percentage(scenarioCmv, scenarioRevenue),
  };
  const warnings: string[] = [];
  if (draft.baselineMode === 'budget' && (!input.plan.coverage.revenue.complete || !input.plan.coverage.expense.complete)) {
    warnings.push('O orçamento selecionado é parcial; somente valores monetários configurados participam da base.');
  }
  if (baseline.cmv === null) warnings.push('CMV indisponível na base selecionada por falta de configuração canônica.');
  if (scenarioRevenue === 0n) warnings.push('Margem indisponível porque a receita do cenário é zero.');

  activeLevers.sort((left, right) => left.id.localeCompare(right.id, 'pt-BR'));
  categoryRows.sort((left, right) => (
    left.nature.localeCompare(right.nature)
    || left.name.localeCompare(right.name, 'pt-BR')
    || left.categoryId.localeCompare(right.categoryId)
  ));
  return { baseline, scenario, activeLevers, categoryRows, warnings };
}

function replaceSensitivityLeverValue(
  draft: PresentationScenarioDraft,
  leverId: string,
  scaledValue: bigint,
): PresentationScenarioDraft {
  const value = `${scaledValue < 0n ? '-' : ''}${(scaledValue < 0n ? -scaledValue : scaledValue) / 100n},${String((scaledValue < 0n ? -scaledValue : scaledValue) % 100n).padStart(2, '0')}`;
  if (leverId === 'revenue-total') return { ...draft, totalRevenue: { ...draft.totalRevenue, value }, sensitivity: null };
  if (leverId === 'expense-total') return { ...draft, totalExpense: { ...draft.totalExpense, value }, sensitivity: null };
  if (leverId === 'cmv-money') return { ...draft, cmvMoney: { ...draft.cmvMoney, value }, sensitivity: null };
  if (leverId === 'cmv-percent-target') return { ...draft, cmvTargetPercent: value, sensitivity: null };
  if (leverId.startsWith('category:')) {
    const categoryId = leverId.slice('category:'.length);
    return {
      ...draft,
      sensitivity: null,
      categoryLevers: draft.categoryLevers.map(lever => (
        lever.categoryId === categoryId
          ? { ...lever, adjustment: { ...lever.adjustment, value } }
          : lever
      )),
    };
  }
  return validationError('SENSITIVITY_LEVER_UNKNOWN', 'sensitivity.leverId', 'Alavanca de sensibilidade desconhecida.');
}

function sensitivityCurrentValue(draft: PresentationScenarioDraft, leverId: string): bigint {
  if (leverId === 'revenue-total') return parseExactScaledInteger(draft.totalRevenue.value, 2);
  if (leverId === 'expense-total') return parseExactScaledInteger(draft.totalExpense.value, 2);
  if (leverId === 'cmv-money') return parseExactScaledInteger(draft.cmvMoney.value, 2);
  if (leverId === 'cmv-percent-target') return parseExactScaledInteger(draft.cmvTargetPercent, 2);
  if (leverId.startsWith('category:')) {
    const lever = draft.categoryLevers.find(item => `category:${item.categoryId}` === leverId);
    if (lever) return parseExactScaledInteger(lever.adjustment.value, 2);
  }
  return validationError('SENSITIVITY_LEVER_UNKNOWN', 'sensitivity.leverId', 'Alavanca de sensibilidade desconhecida.');
}

function buildSensitivity(
  input: BuildPresentationScenarioInput,
  core: ScenarioCore,
): PresentationScenarioSensitivity {
  const sensitivity = input.draft.sensitivity;
  if (!sensitivity) return { state: 'not-configured' };
  const lever = core.activeLevers.find(item => item.id === sensitivity.leverId);
  if (!lever) return validationError('SENSITIVITY_LEVER_INACTIVE', 'sensitivity.leverId', 'Escolha uma alavanca ativa para a sensibilidade.');
  const min = parseExactScaledInteger(sensitivity.minValue, 2, 'sensitivity.minValue');
  const max = parseExactScaledInteger(sensitivity.maxValue, 2, 'sensitivity.maxValue');
  const step = parseExactScaledInteger(sensitivity.stepValue, 2, 'sensitivity.stepValue');
  const current = sensitivityCurrentValue(input.draft, sensitivity.leverId);
  if (min > max) return validationError('SENSITIVITY_RANGE_INVALID', 'sensitivity', 'O mínimo deve ser menor ou igual ao máximo.');
  if (step <= 0n) return validationError('SENSITIVITY_STEP_INVALID', 'sensitivity.stepValue', 'O passo deve ser positivo.');
  if (current < min || current > max) {
    return validationError('SENSITIVITY_BASE_OUTSIDE_RANGE', 'sensitivity', 'A faixa deve incluir o valor atual da alavanca.');
  }
  const regularPointCount = Number((max - min) / step) + 1;
  const includesCurrent = (current - min) % step === 0n;
  const totalPointCount = regularPointCount + (includesCurrent ? 0 : 1);
  if (totalPointCount > PRESENTATION_SCENARIO_MAX_SENSITIVITY_POINTS) {
    return validationError('SENSITIVITY_TOO_MANY_POINTS', 'sensitivity', `A sensibilidade aceita no máximo ${PRESENTATION_SCENARIO_MAX_SENSITIVITY_POINTS} pontos.`);
  }
  const scaledPoints: bigint[] = [];
  for (let value = min; value <= max; value += step) scaledPoints.push(value);
  if (!includesCurrent) scaledPoints.push(current);
  scaledPoints.sort((left, right) => left < right ? -1 : left > right ? 1 : 0);
  const points = scaledPoints.map(value => {
    const draft = replaceSensitivityLeverValue(input.draft, sensitivity.leverId, value);
    const pointCore = calculateScenarioCore(input, draft);
    return {
      inputValue: Number(value) / 100,
      result: pointCore.scenario.result,
      marginPercent: pointCore.scenario.marginPercent,
      isBase: value === current,
    } satisfies PresentationScenarioSensitivityPoint;
  });

  let breakEven: PresentationScenarioBreakEven = { state: 'unavailable', reason: 'no-linear-crossing' };
  for (let index = 0; index < points.length; index += 1) {
    const point = points[index];
    if (point.result === 0) {
      breakEven = { state: 'available', inputValue: point.inputValue };
      break;
    }
    const next = points[index + 1];
    if (!next || Math.sign(point.result) === Math.sign(next.result)) continue;
    const inputValue = point.inputValue
      + ((0 - point.result) * (next.inputValue - point.inputValue)) / (next.result - point.result);
    if (Number.isFinite(inputValue)) breakEven = { state: 'available', inputValue };
    break;
  }
  return {
    state: 'available',
    leverId: lever.id,
    leverLabel: lever.label,
    unit: lever.adjustmentMode === 'absolute' ? 'currency' : 'percent',
    points,
    breakEven,
  };
}

function baselineSource(mode: PresentationScenarioBaselineMode): PresentationScenarioResult['baselineSource'] {
  if (mode === 'actual') return 'fin_lancamentos';
  if (mode === 'budget') return 'fin_orcamentos';
  return 'get_fin_presentation_plan.projection';
}

export function buildPresentationScenario(input: BuildPresentationScenarioInput): PresentationScenarioResult {
  const draft = parsePresentationScenarioDraft(input.draft);
  if (!ISO_DATE_PATTERN.test(input.period.start) || !ISO_DATE_PATTERN.test(input.period.endExclusive)) {
    return validationError('INVALID_PERIOD', 'period', 'Período do cenário inválido.');
  }
  const core = calculateScenarioCore(input, draft);
  const modes = presentationScenarioModeAvailability(input.plan);
  const source = baselineSource(draft.baselineMode);
  const result: PresentationScenarioResult = {
    contractVersion: '1.0',
    baselineMode: draft.baselineMode,
    baselineSource: source,
    scenarioName: draft.name.trim(),
    period: { ...input.period },
    granularity: input.granularity,
    cutoffDate: input.plan.projection.cutoffDate,
    baseline: core.baseline,
    scenario: core.scenario,
    impact: {
      revenue: buildMetricImpact('revenue', core.baseline.revenue, core.scenario.revenue),
      expense: buildMetricImpact('expense', core.baseline.expense, core.scenario.expense),
      result: buildMetricImpact('result', core.baseline.result, core.scenario.result),
      margin: buildMetricImpact('margin', core.baseline.marginPercent, core.scenario.marginPercent),
      cmv: buildMetricImpact('cmv', core.baseline.cmv, core.scenario.cmv),
    },
    activeLevers: core.activeLevers,
    categoryRows: core.categoryRows,
    sensitivity: buildSensitivity({ ...input, draft }, core),
    availability: { modes, cmv: core.baseline.cmv !== null },
    sources: { ...input.plan.sources, baseline: source },
    rules: {
      ...input.plan.rules,
      scenarioFormula: 'valor ajustado = valor base + ajuste absoluto + (valor base × ajuste percentual / 100)',
      cmvFormula: 'CMV percentual explícito = receita do cenário × percentual / 100',
      categoryPrecedence: 'rollup canônico da RPC; pai e descendente são mutuamente exclusivos',
      automaticCmvRecalculation: false,
      simulationLabel: 'SIMULAÇÃO',
    },
    formulaVersion: PRESENTATION_SCENARIO_FORMULA_VERSION,
    warnings: core.warnings,
  };
  return parsePresentationScenarioResult(result);
}

function assertFiniteOrNull(value: unknown, path: string): void {
  if (value !== null && (typeof value !== 'number' || !Number.isFinite(value))) {
    validationError('NON_FINITE', path, `${path} deve ser um número finito ou null.`);
  }
}

function assertFiniteNumber(value: unknown, path: string): void {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    validationError('NON_FINITE', path, `${path} deve ser um número finito.`);
  }
}

function assertMetricSet(value: unknown, path: string): void {
  if (!isRecord(value)) validationError('MISSING_METRIC', path, `${path} inválido.`);
  for (const key of ['revenue', 'expense', 'result']) {
    if (!(key in value)) validationError('MISSING_METRIC', `${path}.${key}`, `Métrica ${key} ausente.`);
    assertFiniteNumber(value[key], `${path}.${key}`);
  }
  for (const key of ['marginPercent', 'cmv', 'cmvPercent']) {
    if (!(key in value)) validationError('MISSING_METRIC', `${path}.${key}`, `Métrica ${key} ausente.`);
    assertFiniteOrNull(value[key], `${path}.${key}`);
  }
}

function assertScenarioResultSize(value: unknown): void {
  try {
    const serialized = JSON.stringify(value);
    if (typeof serialized !== 'string' || new TextEncoder().encode(serialized).byteLength > PRESENTATION_SCENARIO_MAX_RESULT_BYTES) {
      validationError('PAYLOAD_TOO_LARGE', 'scenario', 'Resposta de cenário excede o limite seguro.');
    }
  } catch (error) {
    if (error instanceof PresentationScenarioValidationError) throw error;
    validationError('MALFORMED_PAYLOAD', 'scenario', 'Resposta de cenário não serializável.');
  }
}

/** Validação defensiva do contrato consumido por canvas, PDF e PowerPoint. */
export function parsePresentationScenarioResult(value: unknown): PresentationScenarioResult {
  if (!isRecord(value)) return validationError('MALFORMED_PAYLOAD', 'scenario', 'Resposta de cenário inválida.');
  assertScenarioResultSize(value);
  if (value.contractVersion !== '1.0') return validationError('UNKNOWN_VERSION', 'contractVersion', 'Contrato de cenário incompatível.');
  if (value.formulaVersion !== PRESENTATION_SCENARIO_FORMULA_VERSION) {
    return validationError('UNKNOWN_VERSION', 'formulaVersion', 'Versão de fórmula ausente ou incompatível.');
  }
  if (!PRESENTATION_SCENARIO_BASELINE_MODES.includes(value.baselineMode as PresentationScenarioBaselineMode)) {
    return validationError('UNKNOWN_ENUM', 'baselineMode', 'Base de cenário desconhecida.');
  }
  const expectedSource = baselineSource(value.baselineMode as PresentationScenarioBaselineMode);
  if (value.baselineSource !== expectedSource) {
    return validationError('UNKNOWN_ENUM', 'baselineSource', 'Fonte da base incompatível com o modo selecionado.');
  }
  readBoundedString(value.scenarioName, 'scenarioName', 80);
  if (!isRecord(value.period)
    || typeof value.period.start !== 'string'
    || typeof value.period.endExclusive !== 'string'
    || !ISO_DATE_PATTERN.test(value.period.start)
    || !ISO_DATE_PATTERN.test(value.period.endExclusive)
    || value.period.start >= value.period.endExclusive) {
    return validationError('INVALID_PERIOD', 'period', 'Período do cenário inválido.');
  }
  if (value.granularity !== 'day' && value.granularity !== 'month' && value.granularity !== 'year') {
    return validationError('UNKNOWN_ENUM', 'granularity', 'Granularidade desconhecida.');
  }
  if (typeof value.cutoffDate !== 'string' || !ISO_DATE_PATTERN.test(value.cutoffDate)) {
    return validationError('INVALID_PERIOD', 'cutoffDate', 'Data de corte inválida.');
  }
  assertMetricSet(value.baseline, 'baseline');
  assertMetricSet(value.scenario, 'scenario');
  if (!isRecord(value.impact)) return validationError('MISSING_METRIC', 'impact', 'Impactos do cenário ausentes.');
  for (const key of ['revenue', 'expense', 'result', 'margin', 'cmv'] as const) {
    const impact = value.impact[key];
    if (!isRecord(impact)) return validationError('MISSING_METRIC', `impact.${key}`, `Impacto ${key} ausente.`);
    for (const metric of ['baseline', 'scenario', 'absolute', 'percent']) {
      if (!(metric in impact)) return validationError('MISSING_METRIC', `impact.${key}.${metric}`, `Métrica ${metric} ausente.`);
      assertFiniteOrNull(impact[metric], `impact.${key}.${metric}`);
    }
    if (!['favorable', 'unfavorable', 'neutral', 'unavailable'].includes(String(impact.favorability))) {
      return validationError('UNKNOWN_ENUM', `impact.${key}.favorability`, 'Favorabilidade desconhecida.');
    }
  }
  if (!Array.isArray(value.activeLevers) || value.activeLevers.length > PRESENTATION_SCENARIO_MAX_CATEGORY_LEVERS + 4) {
    return validationError('PAYLOAD_TOO_LARGE', 'activeLevers', 'Payload de alavancas excessivo.');
  }
  for (const [index, lever] of value.activeLevers.entries()) {
    if (!isRecord(lever)) return validationError('MALFORMED_PAYLOAD', `activeLevers[${index}]`, 'Alavanca inválida.');
    readBoundedString(lever.id, `activeLevers[${index}].id`, 80, false);
    readBoundedString(lever.label, `activeLevers[${index}].label`, 120, false);
    if (!['revenue-total', 'expense-total', 'category', 'cmv-money', 'cmv-percent-target'].includes(String(lever.target))) {
      return validationError('UNKNOWN_ENUM', `activeLevers[${index}].target`, 'Alvo de alavanca desconhecido.');
    }
    if (!['RECEITA', 'DESPESA', 'CMV'].includes(String(lever.nature))) {
      return validationError('UNKNOWN_ENUM', `activeLevers[${index}].nature`, 'Natureza de alavanca desconhecida.');
    }
    if (!['absolute', 'percentage', 'target-percent'].includes(String(lever.adjustmentMode))) {
      return validationError('UNKNOWN_ENUM', `activeLevers[${index}].adjustmentMode`, 'Formato de alavanca desconhecido.');
    }
    if (lever.target === 'category') {
      if (typeof lever.categoryId !== 'string' || !UUID_PATTERN.test(lever.categoryId)) {
        return validationError('INVALID_UUID', `activeLevers[${index}].categoryId`, 'Categoria sem UUID válido.');
      }
    } else if (lever.categoryId !== null) {
      return validationError('MALFORMED_PAYLOAD', `activeLevers[${index}].categoryId`, 'Alavanca total não pode apontar para categoria.');
    }
    for (const metric of ['inputValue', 'metricImpact', 'resultImpact']) {
      assertFiniteNumber(lever[metric], `activeLevers[${index}].${metric}`);
    }
    if (!['favorable', 'unfavorable', 'neutral', 'unavailable'].includes(String(lever.favorability))) {
      return validationError('UNKNOWN_ENUM', `activeLevers[${index}].favorability`, 'Favorabilidade desconhecida.');
    }
  }
  if (!Array.isArray(value.categoryRows) || value.categoryRows.length > PRESENTATION_SCENARIO_MAX_CATEGORY_LEVERS) {
    return validationError('PAYLOAD_TOO_LARGE', 'categoryRows', 'Payload de categorias excessivo.');
  }
  for (const [index, row] of value.categoryRows.entries()) {
    if (!isRecord(row)) return validationError('MALFORMED_PAYLOAD', `categoryRows[${index}]`, 'Categoria inválida.');
    if (typeof row.categoryId !== 'string' || !UUID_PATTERN.test(row.categoryId)) {
      return validationError('INVALID_UUID', `categoryRows[${index}].categoryId`, 'Categoria sem UUID válido.');
    }
    if (row.parentCategoryId !== null && (typeof row.parentCategoryId !== 'string' || !UUID_PATTERN.test(row.parentCategoryId))) {
      return validationError('INVALID_UUID', `categoryRows[${index}].parentCategoryId`, 'Categoria pai sem UUID válido.');
    }
    readBoundedString(row.name, `categoryRows[${index}].name`, 120, false);
    if (row.nature !== 'RECEITA' && row.nature !== 'DESPESA') {
      return validationError('UNKNOWN_ENUM', `categoryRows[${index}].nature`, 'Natureza de categoria desconhecida.');
    }
    if (row.effectiveGroup !== null) readBoundedString(row.effectiveGroup, `categoryRows[${index}].effectiveGroup`, 80, false);
    for (const metric of ['baseline', 'adjustment', 'scenario']) {
      assertFiniteNumber(row[metric], `categoryRows[${index}].${metric}`);
    }
    assertFiniteOrNull(row.impactPercent, `categoryRows[${index}].impactPercent`);
    if (!['favorable', 'unfavorable', 'neutral', 'unavailable'].includes(String(row.favorability))) {
      return validationError('UNKNOWN_ENUM', `categoryRows[${index}].favorability`, 'Favorabilidade desconhecida.');
    }
  }
  const sensitivity = value.sensitivity;
  if (!isRecord(sensitivity) || (sensitivity.state !== 'not-configured' && sensitivity.state !== 'available')) {
    return validationError('UNKNOWN_ENUM', 'sensitivity.state', 'Estado de sensibilidade desconhecido.');
  }
  if (sensitivity.state === 'available') {
    readBoundedString(sensitivity.leverId, 'sensitivity.leverId', 80, false);
    readBoundedString(sensitivity.leverLabel, 'sensitivity.leverLabel', 120, false);
    if (sensitivity.unit !== 'currency' && sensitivity.unit !== 'percent') {
      return validationError('UNKNOWN_ENUM', 'sensitivity.unit', 'Unidade de sensibilidade desconhecida.');
    }
    if (!Array.isArray(sensitivity.points) || sensitivity.points.length === 0 || sensitivity.points.length > PRESENTATION_SCENARIO_MAX_SENSITIVITY_POINTS) {
      return validationError('PAYLOAD_TOO_LARGE', 'sensitivity.points', 'Quantidade de pontos de sensibilidade excede o limite.');
    }
    sensitivity.points.forEach((point, index) => {
      if (!isRecord(point)) validationError('MALFORMED_PAYLOAD', `sensitivity.points[${index}]`, 'Ponto inválido.');
      assertFiniteNumber(point.inputValue, `sensitivity.points[${index}].inputValue`);
      assertFiniteNumber(point.result, `sensitivity.points[${index}].result`);
      assertFiniteOrNull(point.marginPercent, `sensitivity.points[${index}].marginPercent`);
      if (typeof point.isBase !== 'boolean') validationError('MALFORMED_PAYLOAD', `sensitivity.points[${index}].isBase`, 'Marcador da base inválido.');
    });
    if (!sensitivity.points.some(point => isRecord(point) && point.isBase === true)) {
      return validationError('MISSING_METRIC', 'sensitivity.points', 'Ponto-base da sensibilidade ausente.');
    }
    if (!isRecord(sensitivity.breakEven) || (sensitivity.breakEven.state !== 'available' && sensitivity.breakEven.state !== 'unavailable')) {
      return validationError('UNKNOWN_ENUM', 'sensitivity.breakEven.state', 'Estado de ponto de equilíbrio desconhecido.');
    }
    if (sensitivity.breakEven.state === 'available') {
      assertFiniteNumber(sensitivity.breakEven.inputValue, 'sensitivity.breakEven.inputValue');
    } else if (sensitivity.breakEven.reason !== 'outside-configured-range' && sensitivity.breakEven.reason !== 'no-linear-crossing') {
      return validationError('UNKNOWN_ENUM', 'sensitivity.breakEven.reason', 'Motivo de indisponibilidade desconhecido.');
    }
  }
  if (!isRecord(value.availability) || typeof value.availability.cmv !== 'boolean' || !isRecord(value.availability.modes)) {
    return validationError('MALFORMED_PAYLOAD', 'availability', 'Disponibilidade do cenário inválida.');
  }
  for (const mode of PRESENTATION_SCENARIO_BASELINE_MODES) {
    const availability = value.availability.modes[mode];
    if (!isRecord(availability) || typeof availability.available !== 'boolean') {
      return validationError('MALFORMED_PAYLOAD', `availability.modes.${mode}`, 'Disponibilidade da base inválida.');
    }
    if (!['available', 'budget-not-configured', 'projection-unavailable', 'baseline-metrics-unavailable'].includes(String(availability.reason))) {
      return validationError('UNKNOWN_ENUM', `availability.modes.${mode}.reason`, 'Motivo de indisponibilidade desconhecido.');
    }
  }
  if (!isRecord(value.sources)
    || value.sources.actual !== 'fin_lancamentos'
    || value.sources.budget !== 'fin_orcamentos'
    || value.sources.cmvTarget !== 'metas_cmv.meta_cmv_total'
    || value.sources.baseline !== expectedSource) {
    return validationError('MALFORMED_PAYLOAD', 'sources', 'Fontes canônicas do cenário inválidas.');
  }
  if (!isRecord(value.rules)) return validationError('MISSING_FORMULA', 'rules', 'Regras e fórmulas ausentes.');
  for (const formula of ['scenarioFormula', 'cmvFormula', 'categoryPrecedence']) {
    if (typeof value.rules[formula] !== 'string' || value.rules[formula].length === 0) {
      return validationError('MISSING_FORMULA', `rules.${formula}`, 'Fórmula obrigatória ausente.');
    }
    readBoundedString(value.rules[formula], `rules.${formula}`, 500, false);
  }
  if (value.rules.automaticCmvRecalculation !== false || value.rules.simulationLabel !== 'SIMULAÇÃO') {
    return validationError('MISSING_FORMULA', 'rules', 'Regras obrigatórias da simulação ausentes.');
  }
  if (!Array.isArray(value.warnings) || value.warnings.length > 20) {
    return validationError('PAYLOAD_TOO_LARGE', 'warnings', 'Quantidade de avisos excede o limite.');
  }
  for (const [index, warning] of value.warnings.entries()) {
    readBoundedString(warning, `warnings[${index}]`, 500, false);
  }
  return value as unknown as PresentationScenarioResult;
}

export function presentationScenarioHasChanges(draft: PresentationScenarioDraft): boolean {
  return draft.name.trim() !== ''
    || draft.totalRevenue.value.trim() !== ''
    || draft.totalExpense.value.trim() !== ''
    || draft.cmvMoney.value.trim() !== ''
    || draft.cmvTargetPercent.trim() !== ''
    || draft.categoryLevers.some(lever => lever.adjustment.value.trim() !== '')
    || draft.sensitivity !== null;
}

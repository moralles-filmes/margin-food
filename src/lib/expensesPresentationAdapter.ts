import {
  PRESENTATION_EXPENSES_CONTRACT_VERSION,
  PRESENTATION_EXPENSES_SOURCE,
  isPresentationYearMonth,
  normalizePresentationHistoryYears,
  type IsoDate,
  type PresentationExpenseNode,
  type PresentationExpenseOperationalClass,
  type PresentationExpensesAvailability,
  type PresentationExpensesCoverage,
  type PresentationExpensesData,
  type PresentationExpensesDeltaReason,
  type PresentationExpensesDeltaValue,
  type PresentationExpensesHistoryPoint,
  type PresentationExpensesMonthlyPoint,
  type PresentationExpensesPeriodCoverage,
  type PresentationExpensesPeriodSummary,
  type YearMonth,
} from '@/domain/financeiro/presentation';

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type FlatExpenseNode = Omit<PresentationExpenseNode, 'children'>;

export class PresentationExpensesPayloadError extends Error {
  readonly path: string;

  constructor(path: string, expectation: string) {
    super(`Payload inválido de Despesas: ${path} deve ser ${expectation}`);
    this.name = 'PresentationExpensesPayloadError';
    this.path = path;
  }
}

function fail(path: string, expectation: string): never {
  throw new PresentationExpensesPayloadError(path, expectation);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return fail(path, 'um objeto');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) return fail(path, 'uma lista');
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) return fail(path, 'um texto não vazio');
  return value;
}

function readNullableUuid(value: unknown, path: string): string | null {
  if (value === null) return null;
  const id = readString(value, path);
  if (!UUID_PATTERN.test(id)) return fail(path, 'um UUID ou null');
  return id;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fail(path, 'um número finito');
  return value;
}

function readInteger(value: unknown, path: string, minimum = 0): number {
  const parsed = readFiniteNumber(value, path);
  if (!Number.isInteger(parsed) || parsed < minimum) return fail(path, `um inteiro maior ou igual a ${minimum}`);
  return parsed;
}

function readIsoDate(value: unknown, path: string): IsoDate {
  const date = readString(value, path);
  if (!ISO_DATE_PATTERN.test(date)) return fail(path, 'uma data ISO yyyy-MM-dd');
  const [year, month, day] = date.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    parsed.getUTCFullYear() !== year
    || parsed.getUTCMonth() !== month - 1
    || parsed.getUTCDate() !== day
  ) return fail(path, 'uma data ISO válida');
  return date;
}

function readTimestamp(value: unknown, path: string): string {
  const timestamp = readString(value, path);
  if (!Number.isFinite(Date.parse(timestamp))) return fail(path, 'um timestamp ISO válido');
  return timestamp;
}

function readYearMonth(value: unknown, path: string): YearMonth {
  const month = readString(value, path);
  if (!isPresentationYearMonth(month)) return fail(path, 'um mês yyyy-MM válido');
  return month;
}

function shiftYearMonth(month: YearMonth, offset: number): YearMonth {
  const year = Number(month.slice(0, 4));
  const monthIndex = Number(month.slice(5, 7)) - 1 + offset;
  const shiftedYear = year + Math.floor(monthIndex / 12);
  const normalizedMonth = ((monthIndex % 12) + 12) % 12 + 1;
  if (shiftedYear < 1 || shiftedYear > 9999) return fail('payload.selectedMonth', 'um mês deslocável no contrato');
  return `${String(shiftedYear).padStart(4, '0')}-${String(normalizedMonth).padStart(2, '0')}`;
}

function readAvailability(value: unknown, path: string): PresentationExpensesAvailability {
  if (value !== 'available' && value !== 'empty' && value !== 'unavailable') {
    return fail(path, 'available, empty ou unavailable');
  }
  return value;
}

function readCoverage(value: unknown, path: string): PresentationExpensesCoverage {
  const record = readRecord(value, path);
  if (record.state === 'no-history') return { state: 'no-history' };
  if (record.state !== 'available') return fail(`${path}.state`, 'available ou no-history');
  const minDate = readIsoDate(record.minDate, `${path}.minDate`);
  const maxDate = readIsoDate(record.maxDate, `${path}.maxDate`);
  if (minDate > maxDate) return fail(path, 'uma cobertura ordenada');
  return { state: 'available', minDate, maxDate };
}

function readPeriodCoverage(value: unknown, path: string): PresentationExpensesPeriodCoverage {
  const record = readRecord(value, path);
  if (record.state === 'no-history') return { state: 'no-history' };
  if (record.state === 'covered') {
    const firstDate = readIsoDate(record.firstDate, `${path}.firstDate`);
    const lastDate = readIsoDate(record.lastDate, `${path}.lastDate`);
    if (firstDate > lastDate) return fail(path, 'datas de movimento ordenadas');
    return { state: 'covered', firstDate, lastDate };
  }
  if (record.state === 'gap' || record.state === 'outside-range') {
    const availableFrom = readIsoDate(record.availableFrom, `${path}.availableFrom`);
    const availableThrough = readIsoDate(record.availableThrough, `${path}.availableThrough`);
    if (availableFrom > availableThrough) return fail(path, 'uma cobertura ordenada');
    return { state: record.state, availableFrom, availableThrough };
  }
  return fail(`${path}.state`, 'covered, gap, outside-range ou no-history');
}

function readPeriod(value: unknown, path: string): PresentationExpensesPeriodSummary {
  const record = readRecord(value, path);
  const state = readAvailability(record.state, `${path}.state`);
  const month = readYearMonth(record.month, `${path}.month`);
  const startDate = readIsoDate(record.startDate, `${path}.startDate`);
  const endExclusive = readIsoDate(record.endExclusive, `${path}.endExclusive`);
  const total = readFiniteNumber(record.total, `${path}.total`);
  const quantity = readInteger(record.quantity, `${path}.quantity`);
  const coverage = readPeriodCoverage(record.coverage, `${path}.coverage`);
  if (startDate !== `${month}-01` || startDate >= endExclusive) return fail(path, 'um mês calendário coerente');
  if ((state === 'available') !== (quantity > 0)) return fail(path, 'estado coerente com quantity');
  if (state === 'available' && coverage.state !== 'covered') return fail(`${path}.coverage`, 'covered quando há despesas');
  if (state === 'empty' && coverage.state !== 'gap') return fail(`${path}.coverage`, 'gap quando o mês está vazio');
  if (state === 'unavailable' && coverage.state !== 'outside-range' && coverage.state !== 'no-history') {
    return fail(`${path}.coverage`, 'outside-range ou no-history quando indisponível');
  }
  return { state, month, startDate, endExclusive, total, quantity, coverage };
}

function readDeltaValue(value: unknown, path: string): PresentationExpensesDeltaValue {
  const record = readRecord(value, path);
  if (record.state === 'available') {
    return { state: 'available', value: readFiniteNumber(record.value, `${path}.value`) };
  }
  if (record.state !== 'unavailable') return fail(`${path}.state`, 'available ou unavailable');
  const reason = readString(record.reason, `${path}.reason`) as PresentationExpensesDeltaReason;
  if (
    reason !== 'current-period-absent'
    && reason !== 'previous-period-absent'
    && reason !== 'zero-baseline'
  ) return fail(`${path}.reason`, 'um motivo conhecido');
  return { state: 'unavailable', reason };
}

function readMonthlyPoint(value: unknown, path: string): PresentationExpensesMonthlyPoint {
  const record = readRecord(value, path);
  const point = {
    yearMonth: readYearMonth(record.yearMonth, `${path}.yearMonth`),
    state: readAvailability(record.state, `${path}.state`),
    total: readFiniteNumber(record.total, `${path}.total`),
    quantity: readInteger(record.quantity, `${path}.quantity`),
  };
  if ((point.state === 'available') !== (point.quantity > 0)) {
    return fail(path, 'estado coerente com quantity');
  }
  return point;
}

function readHistoryPoint(value: unknown, path: string): PresentationExpensesHistoryPoint {
  const record = readRecord(value, path);
  const point = readMonthlyPoint(record, path);
  const year = readInteger(record.year, `${path}.year`, 1);
  const month = readInteger(record.month, `${path}.month`, 1);
  if (year > 9999 || month > 12) return fail(path, 'ano e mês válidos');
  if (point.yearMonth !== `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`) {
    return fail(`${path}.yearMonth`, 'coerente com year e month');
  }
  return { ...point, year, month };
}

function readOperationalClass(value: unknown, path: string): PresentationExpenseOperationalClass {
  if (value !== 'operational' && value !== 'non-operational') {
    return fail(path, 'operational ou non-operational');
  }
  return value;
}

function readFlatTree(value: unknown): readonly FlatExpenseNode[] {
  let uncategorizedCount = 0;
  return readArray(value, 'payload.tree').map((item, index) => {
    const path = `payload.tree[${index}]`;
    const record = readRecord(item, path);
    const categoryId = readNullableUuid(record.categoryId, `${path}.categoryId`);
    const parentId = readNullableUuid(record.parentId, `${path}.parentId`);
    const name = readString(record.name, `${path}.name`);
    const operationalClass = readOperationalClass(record.operationalClass, `${path}.operationalClass`);
    if (categoryId === null) {
      uncategorizedCount += 1;
      if (
        uncategorizedCount > 1
        || parentId !== null
        || name !== 'Sem categoria — Despesas'
        || operationalClass !== 'operational'
      ) return fail(path, 'o grupo único Sem categoria — Despesas');
    }
    return {
      categoryId,
      parentId,
      name,
      order: readInteger(record.order, `${path}.order`),
      operationalClass,
      directAmount: readFiniteNumber(record.directAmount, `${path}.directAmount`),
      amount: readFiniteNumber(record.amount, `${path}.amount`),
    };
  });
}

function buildExpenseTree(items: readonly FlatExpenseNode[]): PresentationExpenseNode[] {
  type MutableExpenseNode = PresentationExpenseNode & { children: MutableExpenseNode[] };
  const nodes = items.map<MutableExpenseNode>(item => ({ ...item, children: [] }));
  const byId = new Map<string, MutableExpenseNode>();
  items.forEach((item, index) => {
    if (item.categoryId === null) return;
    if (byId.has(item.categoryId)) fail(`payload.tree[${index}].categoryId`, 'único');
    byId.set(item.categoryId, nodes[index]);
  });
  const roots: MutableExpenseNode[] = [];
  items.forEach((item, index) => {
    const node = nodes[index];
    if (item.parentId === null || item.categoryId === null) {
      roots.push(node);
      return;
    }
    const parent = byId.get(item.parentId);
    if (!parent) fail(`payload.tree[${index}].parentId`, 'um pai presente na árvore');
    parent.children.push(node);
  });

  const visited = new Set<PresentationExpenseNode>();
  const validateNode = (node: PresentationExpenseNode, ancestors: ReadonlySet<PresentationExpenseNode>) => {
    if (ancestors.has(node)) fail('payload.tree', 'uma hierarquia sem ciclos');
    const nextAncestors = new Set(ancestors).add(node);
    node.children.forEach(child => validateNode(child, nextAncestors));
    const expectedAmount = node.directAmount
      + node.children.reduce((total, child) => total + child.amount, 0);
    if (Math.abs(expectedAmount - node.amount) > 0.011) {
      fail('payload.tree', 'valores próprios e agregados coerentes');
    }
    visited.add(node);
  };
  roots.forEach(root => validateNode(root, new Set()));
  if (visited.size !== nodes.length) fail('payload.tree', 'uma floresta completa e sem ciclos');
  return roots;
}

function validateDelta(
  current: PresentationExpensesPeriodSummary,
  previous: PresentationExpensesPeriodSummary,
  deltaRecord: Record<string, unknown>,
) {
  const absolute = readDeltaValue(deltaRecord.absolute, 'payload.delta.absolute');
  const percentage = readDeltaValue(deltaRecord.percentage, 'payload.delta.percentage');
  const meaning = readString(deltaRecord.meaning, 'payload.delta.meaning');
  const favorability = readString(deltaRecord.favorability, 'payload.delta.favorability');
  const comparable = current.state === 'available' && previous.state === 'available';
  const expectedMeaning = !comparable
    ? 'unavailable'
    : current.total > previous.total ? 'increase' : current.total < previous.total ? 'reduction' : 'unchanged';
  const expectedFavorability = expectedMeaning === 'increase'
    ? 'unfavorable'
    : expectedMeaning === 'reduction' ? 'favorable' : expectedMeaning === 'unchanged' ? 'neutral' : 'unavailable';
  if (meaning !== expectedMeaning || favorability !== expectedFavorability) {
    fail('payload.delta', 'a semântica inversa de aumento/redução de despesas');
  }
  if (comparable) {
    const expectedAbsolute = current.total - previous.total;
    if (absolute.state !== 'available' || Math.abs(absolute.value - expectedAbsolute) > 0.011) {
      fail('payload.delta.absolute', 'a diferença entre mês selecionado e anterior');
    }
    if (previous.total === 0) {
      if (percentage.state !== 'unavailable' || percentage.reason !== 'zero-baseline') {
        fail('payload.delta.percentage', 'zero-baseline quando a base anterior é zero');
      }
    } else {
      const expectedPercentage = (expectedAbsolute / previous.total) * 100;
      if (percentage.state !== 'available' || Math.abs(percentage.value - expectedPercentage) > 0.011) {
        fail('payload.delta.percentage', 'a variação percentual calculada no banco');
      }
    }
  } else {
    const expectedReason = current.state !== 'available'
      ? 'current-period-absent'
      : 'previous-period-absent';
    if (
      absolute.state !== 'unavailable'
      || absolute.reason !== expectedReason
      || percentage.state !== 'unavailable'
      || percentage.reason !== expectedReason
    ) {
      fail('payload.delta', 'motivo coerente com a ausência do período');
    }
  }
  return {
    absolute,
    percentage,
    meaning: meaning as PresentationExpensesData['delta']['meaning'],
    favorability: favorability as PresentationExpensesData['delta']['favorability'],
  };
}

export function adaptPresentationExpensesPayload(payload: unknown): PresentationExpensesData {
  const record = readRecord(payload, 'payload');
  if (record.contractVersion !== PRESENTATION_EXPENSES_CONTRACT_VERSION) {
    return fail('payload.contractVersion', PRESENTATION_EXPENSES_CONTRACT_VERSION);
  }
  const source = readRecord(record.source, 'payload.source');
  if (
    source.report !== PRESENTATION_EXPENSES_SOURCE.report
    || source.regime !== PRESENTATION_EXPENSES_SOURCE.regime
    || source.dateField !== PRESENTATION_EXPENSES_SOURCE.dateField
    || source.label !== PRESENTATION_EXPENSES_SOURCE.label
    || !Array.isArray(source.relations)
    || source.relations.length !== PRESENTATION_EXPENSES_SOURCE.relations.length
    || source.relations.some((relation, index) => relation !== PRESENTATION_EXPENSES_SOURCE.relations[index])
  ) return fail('payload.source', 'a fonte canônica versionada do DFC');

  const availability = readAvailability(record.availability, 'payload.availability');
  const selectedMonth = readYearMonth(record.selectedMonth, 'payload.selectedMonth');
  const previousMonth = readYearMonth(record.previousMonth, 'payload.previousMonth');
  if (previousMonth !== shiftYearMonth(selectedMonth, -1)) {
    return fail('payload.previousMonth', 'o mês imediatamente anterior');
  }
  const requestedYears = normalizePresentationHistoryYears(
    readArray(record.requestedYears, 'payload.requestedYears')
      .map((year, index) => readInteger(year, `payload.requestedYears[${index}]`, 1)),
  );
  const current = readPeriod(record.current, 'payload.current');
  const previous = readPeriod(record.previous, 'payload.previous');
  if (current.month !== selectedMonth || previous.month !== previousMonth) {
    return fail('payload', 'períodos coerentes com selectedMonth e previousMonth');
  }
  const rollingThreeMonths = readArray(record.rollingThreeMonths, 'payload.rollingThreeMonths')
    .map((point, index) => readMonthlyPoint(point, `payload.rollingThreeMonths[${index}]`));
  if (rollingThreeMonths.length !== 3) return fail('payload.rollingThreeMonths', 'três meses');
  rollingThreeMonths.forEach((point, index) => {
    if (point.yearMonth !== shiftYearMonth(selectedMonth, index - 2)) {
      fail(`payload.rollingThreeMonths[${index}].yearMonth`, 'a janela terminando no mês selecionado');
    }
  });
  const history = readArray(record.history, 'payload.history')
    .map((point, index) => readHistoryPoint(point, `payload.history[${index}]`));
  if (history.length !== requestedYears.length * 12) return fail('payload.history', 'doze meses por ano solicitado');
  history.forEach((point, index) => {
    const expectedYear = requestedYears[Math.floor(index / 12)];
    const expectedMonth = index % 12 + 1;
    if (point.year !== expectedYear || point.month !== expectedMonth) {
      fail(`payload.history[${index}]`, 'ordenado por ano e mês');
    }
  });
  const delta = validateDelta(current, previous, readRecord(record.delta, 'payload.delta'));
  const tree = buildExpenseTree(readFlatTree(record.tree));
  const treeTotal = tree.reduce((total, node) => total + node.amount, 0);
  if (Math.abs(treeTotal - current.total) > 0.011) {
    return fail('payload.tree', 'a soma exata das despesas do mês selecionado');
  }
  return {
    contractVersion: PRESENTATION_EXPENSES_CONTRACT_VERSION,
    source: PRESENTATION_EXPENSES_SOURCE,
    availability,
    selectedMonth,
    previousMonth,
    requestedYears,
    generatedAt: readTimestamp(record.generatedAt, 'payload.generatedAt'),
    coverage: readCoverage(record.coverage, 'payload.coverage'),
    current,
    previous,
    delta,
    rollingThreeMonths,
    history,
    tree,
  };
}

export function createSafeExpensesPayloadDiagnostic(
  payload: unknown,
  error: PresentationExpensesPayloadError,
) {
  const record = typeof payload === 'object' && payload !== null && !Array.isArray(payload)
    ? payload as Record<string, unknown>
    : null;
  return {
    error: { name: error.name, path: error.path },
    payload: {
      type: Array.isArray(payload) ? 'array' : payload === null ? 'null' : typeof payload,
      contractVersionType: typeof record?.contractVersion,
      rollingPointCount: Array.isArray(record?.rollingThreeMonths) ? record.rollingThreeMonths.length : undefined,
      historyCount: Array.isArray(record?.history) ? record.history.length : undefined,
      treeNodeCount: Array.isArray(record?.tree) ? record.tree.length : undefined,
    },
  };
}

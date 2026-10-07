/**
 * Borderô — estrutura única consumida pela tela e pelo PDF.
 *
 * O backend (`get_fin_bordero`) já devolve tudo em centavos inteiros e aplica as
 * regras (CP por data_vencimento, despesas do razão pela regra de caixa do DFC sem
 * baixas de CP, FIN-RATEIO, saldo por cache). Aqui só:
 *  1. validamos o contrato de transporte;
 *  2. juntamos contas já pagas e a vencer numa lista única de despesas do período;
 *  3. montamos a árvore com o mesmo `buildTree` do DRE/DFC (ordem → código);
 *  4. somamos subárvores em centavos inteiros (nunca float);
 *  5. conferimos as invariantes — divergência vira erro, nunca número exibido.
 */
import { buildTree, type CatNode } from '@/components/financeiro/CadastroBaseTree';
import { fmtBRL } from '@/lib/formatters';
import type { BorderoPeriod } from './period';

export const BORDERO_CONTRACT_VERSION = '1.0';
/** Mesmo nó sintético "Sem categoria — Despesas" do DFC. */
export const BORDERO_UNCATEGORIZED_ID = '00000000-0000-0000-0000-000000000102';

export interface BorderoCategory {
  id: string;
  name: string;
  code: string;
  parentId: string | null;
  sortOrder: number;
  kind: string;
  active: boolean;
  nonOperational: boolean;
  synthetic: boolean;
}

/** Conta a pagar em aberto (contrato `items`). */
export interface BorderoItem {
  allocationId: string;
  payableId: string;
  categoryId: string;
  description: string;
  supplier: string | null;
  dueDate: string;
  status: string;
  amountCents: number;
  split: boolean;
}

export type BorderoPaidSource = 'conta_pagar' | 'lancamento';

/** Despesa já paga (contrato `paidItems`): CP paga ou lançamento do razão. */
export interface BorderoPaidItem {
  allocationId: string;
  sourceId: string;
  source: BorderoPaidSource;
  /** `fin_lancamentos.origem` (manual, conciliacao, ajuste_pagamento…); null para CP. */
  origin: string | null;
  categoryId: string;
  description: string;
  supplier: string | null;
  /** Vencimento — só existe para conta a pagar. */
  dueDate: string | null;
  paidDate: string | null;
  /** Data que coloca a despesa no período: vencimento da CP ou pagamento do lançamento. */
  referenceDate: string;
  amountCents: number;
  split: boolean;
}

export interface BorderoAccount {
  id: string;
  name: string;
  kind: string;
  bank: string | null;
  balanceCents: number;
  balanceUpdatedAt: string | null;
  balanceAvailable: boolean;
}

export interface BorderoPayload {
  contractVersion: typeof BORDERO_CONTRACT_VERSION;
  period: BorderoPeriod;
  store: { id: string; name: string };
  generatedAt: string;
  categories: BorderoCategory[];
  items: BorderoItem[];
  totalPayableCents: number;
  payableCount: number;
  paidItems: BorderoPaidItem[];
  totalPaidCents: number;
  paidCount: number;
  totalExpenseCents: number;
  accounts: BorderoAccount[];
  totalAccountBalanceCents: number;
  projectedFinalBalanceCents: number;
  overdueBeforePeriod: { count: number; amountCents: number };
}

export type BorderoSettlement = 'paid' | 'open';

/** Linha de despesa do período — paga ou a vencer — como exibida na tela e no PDF. */
export interface BorderoEntry {
  allocationId: string;
  settlement: BorderoSettlement;
  source: BorderoPaidSource;
  sourceId: string;
  origin: string | null;
  categoryId: string;
  description: string;
  supplier: string | null;
  dueDate: string | null;
  paidDate: string | null;
  referenceDate: string;
  /** Status da conta a pagar; `PAGO` para toda despesa paga. */
  status: string;
  amountCents: number;
  split: boolean;
}

export interface BorderoCategoryNode {
  id: string;
  name: string;
  code: string;
  depth: number;
  active: boolean;
  nonOperational: boolean;
  synthetic: boolean;
  /** Soma da subárvore (pagas + a vencer), em centavos. */
  amountCents: number;
  paidCents: number;
  openCents: number;
  /** Quantidade de alocações na subárvore. */
  itemCount: number;
  /** Despesas lançadas diretamente nesta categoria. */
  items: BorderoEntry[];
  children: BorderoCategoryNode[];
}

export type BorderoFinalBalanceState = 'positive' | 'zero' | 'negative';

export interface BorderoReport {
  period: BorderoPeriod;
  store: { id: string; name: string };
  generatedAt: string;
  tree: BorderoCategoryNode[];
  /** Pagas e a vencer, na ordem da data de referência. */
  entries: BorderoEntry[];
  totalPaidCents: number;
  paidCount: number;
  totalPayableCents: number;
  payableCount: number;
  totalExpenseCents: number;
  accounts: BorderoAccount[];
  totalAccountBalanceCents: number;
  projectedFinalBalanceCents: number;
  finalBalanceState: BorderoFinalBalanceState;
  overdueBeforePeriod: { count: number; amountCents: number };
  hasUnavailableBalances: boolean;
}

export class BorderoContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'BorderoContractError';
  }
}

// ─── Leitura estrita do payload ─────────────────────────────────────────────

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new BorderoContractError(`${path} deve ser um objeto.`);
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) throw new BorderoContractError(`${path} deve ser uma lista.`);
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) throw new BorderoContractError(`${path} inválido.`);
  return value;
}

function readNullableString(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : readString(value, path);
}

function readIsoDate(value: unknown, path: string): string {
  const text = readString(value, path);
  if (!ISO_DATE_PATTERN.test(text)) throw new BorderoContractError(`${path} deve estar em yyyy-MM-dd.`);
  return text;
}

function readNullableIsoDate(value: unknown, path: string): string | null {
  return value === null || value === undefined ? null : readIsoDate(value, path);
}

function readCents(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value)) {
    throw new BorderoContractError(`${path} deve ser um valor inteiro em centavos.`);
  }
  return value;
}

function readInteger(value: unknown, path: string): number {
  const number = readCents(value, path);
  if (number < 0) throw new BorderoContractError(`${path} inválido.`);
  return number;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') throw new BorderoContractError(`${path} inválido.`);
  return value;
}

function readPaidSource(value: unknown, path: string): BorderoPaidSource {
  if (value !== 'conta_pagar' && value !== 'lancamento') throw new BorderoContractError(`${path} inválido.`);
  return value;
}

export function parseBorderoPayload(value: unknown): BorderoPayload {
  const root = readRecord(value, 'bordero');
  if (root.contractVersion !== BORDERO_CONTRACT_VERSION) {
    throw new BorderoContractError('bordero.contractVersion incompatível.');
  }
  const period = readRecord(root.period, 'bordero.period');
  const store = readRecord(root.store, 'bordero.store');
  const overdue = readRecord(root.overdueBeforePeriod, 'bordero.overdueBeforePeriod');

  return {
    contractVersion: BORDERO_CONTRACT_VERSION,
    period: {
      start: readIsoDate(period.start, 'bordero.period.start'),
      end: readIsoDate(period.end, 'bordero.period.end'),
    },
    store: {
      id: readString(store.id, 'bordero.store.id'),
      name: readString(store.name, 'bordero.store.name'),
    },
    generatedAt: readString(root.generatedAt, 'bordero.generatedAt'),
    categories: readArray(root.categories, 'bordero.categories').map((entry, index) => {
      const path = `bordero.categories[${index}]`;
      const category = readRecord(entry, path);
      return {
        id: readString(category.id, `${path}.id`),
        name: readString(category.name, `${path}.name`),
        code: typeof category.code === 'string' ? category.code : '',
        parentId: readNullableString(category.parentId, `${path}.parentId`),
        sortOrder: readCents(category.sortOrder, `${path}.sortOrder`),
        kind: readString(category.kind, `${path}.kind`),
        active: readBoolean(category.active, `${path}.active`),
        nonOperational: readBoolean(category.nonOperational, `${path}.nonOperational`),
        synthetic: readBoolean(category.synthetic, `${path}.synthetic`),
      };
    }),
    items: readArray(root.items, 'bordero.items').map((entry, index) => {
      const path = `bordero.items[${index}]`;
      const item = readRecord(entry, path);
      return {
        allocationId: readString(item.allocationId, `${path}.allocationId`),
        payableId: readString(item.payableId, `${path}.payableId`),
        categoryId: readString(item.categoryId, `${path}.categoryId`),
        description: readString(item.description, `${path}.description`),
        supplier: readNullableString(item.supplier, `${path}.supplier`),
        dueDate: readIsoDate(item.dueDate, `${path}.dueDate`),
        status: readString(item.status, `${path}.status`),
        amountCents: readCents(item.amountCents, `${path}.amountCents`),
        split: readBoolean(item.split, `${path}.split`),
      };
    }),
    totalPayableCents: readCents(root.totalPayableCents, 'bordero.totalPayableCents'),
    payableCount: readInteger(root.payableCount, 'bordero.payableCount'),
    paidItems: readArray(root.paidItems, 'bordero.paidItems').map((entry, index) => {
      const path = `bordero.paidItems[${index}]`;
      const item = readRecord(entry, path);
      return {
        allocationId: readString(item.allocationId, `${path}.allocationId`),
        sourceId: readString(item.sourceId, `${path}.sourceId`),
        source: readPaidSource(item.source, `${path}.source`),
        origin: readNullableString(item.origin, `${path}.origin`),
        categoryId: readString(item.categoryId, `${path}.categoryId`),
        description: readString(item.description, `${path}.description`),
        supplier: readNullableString(item.supplier, `${path}.supplier`),
        dueDate: readNullableIsoDate(item.dueDate, `${path}.dueDate`),
        paidDate: readNullableIsoDate(item.paidDate, `${path}.paidDate`),
        referenceDate: readIsoDate(item.referenceDate, `${path}.referenceDate`),
        amountCents: readCents(item.amountCents, `${path}.amountCents`),
        split: readBoolean(item.split, `${path}.split`),
      };
    }),
    totalPaidCents: readCents(root.totalPaidCents, 'bordero.totalPaidCents'),
    paidCount: readInteger(root.paidCount, 'bordero.paidCount'),
    totalExpenseCents: readCents(root.totalExpenseCents, 'bordero.totalExpenseCents'),
    accounts: readArray(root.accounts, 'bordero.accounts').map((entry, index) => {
      const path = `bordero.accounts[${index}]`;
      const account = readRecord(entry, path);
      return {
        id: readString(account.id, `${path}.id`),
        name: readString(account.name, `${path}.name`),
        kind: readString(account.kind, `${path}.kind`),
        bank: readNullableString(account.bank, `${path}.bank`),
        balanceCents: readCents(account.balanceCents, `${path}.balanceCents`),
        balanceUpdatedAt: readNullableString(account.balanceUpdatedAt, `${path}.balanceUpdatedAt`),
        balanceAvailable: readBoolean(account.balanceAvailable, `${path}.balanceAvailable`),
      };
    }),
    totalAccountBalanceCents: readCents(root.totalAccountBalanceCents, 'bordero.totalAccountBalanceCents'),
    projectedFinalBalanceCents: readCents(root.projectedFinalBalanceCents, 'bordero.projectedFinalBalanceCents'),
    overdueBeforePeriod: {
      count: readInteger(overdue.count, 'bordero.overdueBeforePeriod.count'),
      amountCents: readCents(overdue.amountCents, 'bordero.overdueBeforePeriod.amountCents'),
    },
  };
}

// ─── Montagem do relatório ──────────────────────────────────────────────────

export function borderoFinalBalanceState(cents: number): BorderoFinalBalanceState {
  if (cents > 0) return 'positive';
  if (cents < 0) return 'negative';
  return 'zero';
}

function toEntries(payload: BorderoPayload): BorderoEntry[] {
  const open: BorderoEntry[] = payload.items.map(item => ({
    allocationId: item.allocationId,
    settlement: 'open',
    source: 'conta_pagar',
    sourceId: item.payableId,
    origin: null,
    categoryId: item.categoryId,
    description: item.description,
    supplier: item.supplier,
    dueDate: item.dueDate,
    paidDate: null,
    referenceDate: item.dueDate,
    status: item.status,
    amountCents: item.amountCents,
    split: item.split,
  }));
  const paid: BorderoEntry[] = payload.paidItems.map(item => ({
    ...item,
    settlement: 'paid',
    status: 'PAGO',
  }));
  // Ordem estável: data de referência, depois pagas antes das a vencer no mesmo dia.
  return [...paid, ...open].sort((a, b) => a.referenceDate.localeCompare(b.referenceDate));
}

export function buildBorderoReport(payload: BorderoPayload): BorderoReport {
  const categoryIds = new Set(payload.categories.map(category => category.id));
  const entries = toEntries(payload);
  const entriesByCategory = new Map<string, BorderoEntry[]>();
  for (const entry of entries) {
    if (!categoryIds.has(entry.categoryId)) {
      throw new BorderoContractError(`Despesa ${entry.sourceId} aponta para categoria ausente na árvore.`);
    }
    const list = entriesByCategory.get(entry.categoryId) ?? [];
    list.push(entry);
    entriesByCategory.set(entry.categoryId, list);
  }

  const byId = new Map(payload.categories.map(category => [category.id, category]));
  // Mesma ordenação oficial do DRE/DFC (ordem → código), via buildTree compartilhado.
  const catNodes = buildTree(payload.categories.map(category => ({
    id: category.id,
    nome: category.name,
    codigo: category.code,
    tipo: category.kind === 'receita' ? 'receita' : 'despesa',
    parent_id: category.parentId,
    ordem: category.sortOrder,
    centro_custo_padrao_id: null,
    grupo: null,
    system_key: null,
    excluir_dos_totais: category.nonOperational,
    ativo: category.active,
    updated_at: '',
  })));

  const sumBy = (list: BorderoEntry[], settlement: BorderoSettlement) =>
    list.reduce((sum, entry) => (entry.settlement === settlement ? sum + entry.amountCents : sum), 0);

  const toNode = (node: CatNode, depth: number, visiting: Set<string>): BorderoCategoryNode => {
    if (visiting.has(node.id)) throw new BorderoContractError(`Ciclo na árvore de categorias (${node.id}).`);
    const nextVisiting = new Set(visiting).add(node.id);
    const source = byId.get(node.id)!;
    const items = entriesByCategory.get(node.id) ?? [];
    const children = node.children.map(child => toNode(child, depth + 1, nextVisiting));
    const paidCents = children.reduce((sum, child) => sum + child.paidCents, sumBy(items, 'paid'));
    const openCents = children.reduce((sum, child) => sum + child.openCents, sumBy(items, 'open'));
    return {
      id: node.id,
      name: source.name,
      code: source.code,
      depth,
      active: source.active,
      nonOperational: source.nonOperational,
      synthetic: source.synthetic,
      amountCents: paidCents + openCents,
      paidCents,
      openCents,
      itemCount: children.reduce((sum, child) => sum + child.itemCount, items.length),
      items,
      children,
    };
  };

  const tree = catNodes.map(node => toNode(node, 0, new Set()));

  const treePaid = tree.reduce((sum, node) => sum + node.paidCents, 0);
  const treeOpen = tree.reduce((sum, node) => sum + node.openCents, 0);
  const placedItems = tree.reduce((sum, node) => sum + node.itemCount, 0);
  const openItemsCents = payload.items.reduce((sum, item) => sum + item.amountCents, 0);
  const paidItemsCents = payload.paidItems.reduce((sum, item) => sum + item.amountCents, 0);
  const accountsCents = payload.accounts.reduce((sum, account) => sum + account.balanceCents, 0);

  if (placedItems !== entries.length || treeOpen !== openItemsCents || openItemsCents !== payload.totalPayableCents) {
    throw new BorderoContractError('Soma das categorias diverge do total a vencer.');
  }
  if (treePaid !== paidItemsCents || paidItemsCents !== payload.totalPaidCents) {
    throw new BorderoContractError('Soma das categorias diverge do total já pago.');
  }
  if (payload.totalPaidCents + payload.totalPayableCents !== payload.totalExpenseCents) {
    throw new BorderoContractError('Total de contas diverge de contas já pagas + contas a vencer.');
  }
  if (accountsCents !== payload.totalAccountBalanceCents) {
    throw new BorderoContractError('Soma das contas diverge do saldo das contas.');
  }
  if (payload.totalAccountBalanceCents - payload.totalPayableCents !== payload.projectedFinalBalanceCents) {
    throw new BorderoContractError('Saldo final provisionado diverge de saldo das contas - contas a vencer.');
  }

  return {
    period: payload.period,
    store: payload.store,
    generatedAt: payload.generatedAt,
    tree,
    entries,
    totalPaidCents: payload.totalPaidCents,
    paidCount: payload.paidCount,
    totalPayableCents: payload.totalPayableCents,
    payableCount: payload.payableCount,
    totalExpenseCents: payload.totalExpenseCents,
    accounts: payload.accounts,
    totalAccountBalanceCents: payload.totalAccountBalanceCents,
    projectedFinalBalanceCents: payload.projectedFinalBalanceCents,
    finalBalanceState: borderoFinalBalanceState(payload.projectedFinalBalanceCents),
    overdueBeforePeriod: payload.overdueBeforePeriod,
    hasUnavailableBalances: payload.accounts.some(account => !account.balanceAvailable),
  };
}

/** Contas em aberto do período com vencimento anterior a hoje (quantidade de contas, não de rateios). */
export function borderoOverdueInPeriod(report: BorderoReport, todayISO: string): { count: number; amountCents: number } {
  const sources = new Set<string>();
  let amountCents = 0;
  for (const entry of report.entries) {
    if (entry.settlement !== 'open' || !entry.dueDate || entry.dueDate >= todayISO) continue;
    sources.add(entry.sourceId);
    amountCents += entry.amountCents;
  }
  return { count: sources.size, amountCents };
}

// ─── Apresentação compartilhada (tela e PDF) ────────────────────────────────

/** "R$1.234,56" / "-R$1.234,56" — a partir de centavos inteiros. */
export function formatBorderoMoney(cents: number): string {
  const formatted = fmtBRL(Math.abs(cents) / 100);
  return cents < 0 ? `-${formatted}` : formatted;
}

export interface BorderoCategoryRow {
  node: BorderoCategoryNode;
  depth: number;
  hasChildren: boolean;
}

/**
 * Linhas de categoria na ordem da árvore. Raízes sempre aparecem (inclusive com
 * R$0,00, como no borderô de referência); descendentes sem nenhuma despesa só
 * aparecem com `includeEmpty`. `isExpanded` controla a abertura (PDF: tudo aberto).
 */
export function flattenBorderoCategories(
  tree: BorderoCategoryNode[],
  options: { includeEmpty: boolean; isExpanded: (id: string) => boolean },
): BorderoCategoryRow[] {
  const rows: BorderoCategoryRow[] = [];
  const visible = (node: BorderoCategoryNode) => options.includeEmpty || node.itemCount > 0;
  const walk = (nodes: BorderoCategoryNode[]) => {
    for (const node of nodes) {
      if (node.depth > 0 && !visible(node)) continue;
      const children = node.children.filter(visible);
      rows.push({ node, depth: node.depth, hasChildren: children.length > 0 || node.items.length > 0 });
      if (options.isExpanded(node.id)) walk(node.children);
    }
  };
  walk(tree);
  return rows;
}

export const BORDERO_FINAL_BALANCE_MESSAGE: Record<BorderoFinalBalanceState, string> = {
  positive: 'Saldo suficiente para cobrir as contas a vencer do período',
  zero: 'Saldo exatamente igual às contas a vencer do período',
  negative: 'Saldo insuficiente para cobrir as contas a vencer do período',
};

export const BORDERO_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovada',
  VENCIDO: 'Vencida',
  PAGO: 'Paga',
};

export type BorderoSituationTone = 'success' | 'warning' | 'danger' | 'info';

const PAID_ORIGIN_LABEL: Record<string, string> = {
  conciliacao: 'Paga · conciliação',
  manual: 'Paga · lançamento manual',
  ajuste_pagamento: 'Paga · juros/tarifa',
};

/** Situação de uma despesa — mesmo texto na tela e no PDF. */
export function borderoEntrySituation(entry: BorderoEntry, todayISO: string): { label: string; tone: BorderoSituationTone } {
  if (entry.settlement === 'paid') {
    const label = entry.source === 'conta_pagar'
      ? 'Paga'
      : PAID_ORIGIN_LABEL[entry.origin ?? ''] ?? 'Paga · lançamento';
    return { label, tone: 'success' };
  }
  if (entry.status === 'VENCIDO' || (entry.dueDate !== null && entry.dueDate < todayISO)) {
    return { label: 'Vencida', tone: 'danger' };
  }
  if (entry.status === 'AGUARDANDO_APROVACAO') return { label: 'Aguardando aprovação', tone: 'info' };
  return { label: 'A vencer', tone: 'warning' };
}

/** "Fornecedor — Descrição" (ou só a descrição). */
export function borderoEntryParty(entry: BorderoEntry): string {
  return entry.supplier && entry.supplier !== entry.description
    ? `${entry.supplier} — ${entry.description}`
    : entry.description;
}

/** Caminho "Raiz › Categoria" usado no detalhamento. */
export function borderoCategoryPaths(tree: BorderoCategoryNode[], separator = ' › '): Map<string, string> {
  const paths = new Map<string, string>();
  const walk = (nodes: BorderoCategoryNode[], prefix: string) => {
    for (const node of nodes) {
      const path = prefix ? `${prefix}${separator}${node.name}` : node.name;
      paths.set(node.id, path);
      walk(node.children, path);
    }
  };
  walk(tree, '');
  return paths;
}

/**
 * Borderô — estrutura única consumida pela tela e pelo PDF.
 *
 * O backend (`get_fin_bordero`) já devolve tudo em centavos inteiros e aplica as
 * regras (data_vencimento, status em aberto, FIN-RATEIO, saldo por cache). Aqui só:
 *  1. validamos o contrato de transporte;
 *  2. montamos a árvore com o mesmo `buildTree` do DRE/DFC (ordem → código);
 *  3. somamos subárvores em centavos inteiros (nunca float);
 *  4. conferimos as invariantes — divergência vira erro, nunca número exibido.
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
  accounts: BorderoAccount[];
  totalAccountBalanceCents: number;
  projectedFinalBalanceCents: number;
  overdueBeforePeriod: { count: number; amountCents: number };
}

export interface BorderoCategoryNode {
  id: string;
  name: string;
  code: string;
  depth: number;
  active: boolean;
  nonOperational: boolean;
  synthetic: boolean;
  /** Soma da subárvore (categoria + descendentes), em centavos. */
  amountCents: number;
  /** Quantidade de alocações na subárvore. */
  itemCount: number;
  /** Alocações lançadas diretamente nesta categoria. */
  items: BorderoItem[];
  children: BorderoCategoryNode[];
}

export type BorderoFinalBalanceState = 'positive' | 'zero' | 'negative';

export interface BorderoReport {
  period: BorderoPeriod;
  store: { id: string; name: string };
  generatedAt: string;
  tree: BorderoCategoryNode[];
  items: BorderoItem[];
  totalPayableCents: number;
  payableCount: number;
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

export function buildBorderoReport(payload: BorderoPayload): BorderoReport {
  const categoryIds = new Set(payload.categories.map(category => category.id));
  const itemsByCategory = new Map<string, BorderoItem[]>();
  for (const item of payload.items) {
    if (!categoryIds.has(item.categoryId)) {
      throw new BorderoContractError(`Conta ${item.payableId} aponta para categoria ausente na árvore.`);
    }
    const list = itemsByCategory.get(item.categoryId) ?? [];
    list.push(item);
    itemsByCategory.set(item.categoryId, list);
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
    linha_dre: null,
    system_key: null,
    excluir_dos_totais: category.nonOperational,
    ativo: category.active,
    updated_at: '',
  })));

  const toNode = (node: CatNode, depth: number, visiting: Set<string>): BorderoCategoryNode => {
    if (visiting.has(node.id)) throw new BorderoContractError(`Ciclo na árvore de categorias (${node.id}).`);
    const nextVisiting = new Set(visiting).add(node.id);
    const source = byId.get(node.id)!;
    const items = itemsByCategory.get(node.id) ?? [];
    const children = node.children.map(child => toNode(child, depth + 1, nextVisiting));
    const ownCents = items.reduce((sum, item) => sum + item.amountCents, 0);
    return {
      id: node.id,
      name: source.name,
      code: source.code,
      depth,
      active: source.active,
      nonOperational: source.nonOperational,
      synthetic: source.synthetic,
      amountCents: children.reduce((sum, child) => sum + child.amountCents, ownCents),
      itemCount: children.reduce((sum, child) => sum + child.itemCount, items.length),
      items,
      children,
    };
  };

  const tree = catNodes.map(node => toNode(node, 0, new Set()));

  const categoriesCents = tree.reduce((sum, node) => sum + node.amountCents, 0);
  const itemsCents = payload.items.reduce((sum, item) => sum + item.amountCents, 0);
  const accountsCents = payload.accounts.reduce((sum, account) => sum + account.balanceCents, 0);
  const placedItems = tree.reduce((sum, node) => sum + node.itemCount, 0);

  if (placedItems !== payload.items.length || categoriesCents !== itemsCents || itemsCents !== payload.totalPayableCents) {
    throw new BorderoContractError('Soma das categorias diverge do total a pagar.');
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
    items: payload.items,
    totalPayableCents: payload.totalPayableCents,
    payableCount: payload.payableCount,
    accounts: payload.accounts,
    totalAccountBalanceCents: payload.totalAccountBalanceCents,
    projectedFinalBalanceCents: payload.projectedFinalBalanceCents,
    finalBalanceState: borderoFinalBalanceState(payload.projectedFinalBalanceCents),
    overdueBeforePeriod: payload.overdueBeforePeriod,
    hasUnavailableBalances: payload.accounts.some(account => !account.balanceAvailable),
  };
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
 * R$0,00, como no borderô de referência); descendentes sem nenhum vencimento só
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
  positive: 'Saldo suficiente para cobrir os vencimentos do período',
  zero: 'Saldo exatamente igual aos vencimentos do período',
  negative: 'Saldo insuficiente para cobrir os vencimentos do período',
};

export const BORDERO_STATUS_LABEL: Record<string, string> = {
  AGUARDANDO_APROVACAO: 'Aguardando aprovação',
  APROVADO: 'Aprovada',
  VENCIDO: 'Vencida',
};

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

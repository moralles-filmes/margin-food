import type { BorderoAccount, BorderoCategory, BorderoItem, BorderoPayload } from '@/domain/financeiro/bordero';

const cat = (
  id: string,
  name: string,
  code: string,
  parentId: string | null,
  sortOrder: number,
  extra: Partial<BorderoCategory> = {},
): BorderoCategory => ({
  id, name, code, parentId, sortOrder, kind: 'despesa', active: true, nonOperational: false, synthetic: false, ...extra,
});

let allocationSeq = 0;
export const borderoItem = (categoryId: string, amountCents: number, extra: Partial<BorderoItem> = {}): BorderoItem => {
  allocationSeq += 1;
  const id = `a0000000-0000-4000-8000-${String(allocationSeq).padStart(12, '0')}`;
  return {
    allocationId: id,
    payableId: id,
    categoryId,
    description: `Conta ${allocationSeq}`,
    supplier: `Fornecedor ${allocationSeq}`,
    dueDate: '2026-09-02',
    status: 'APROVADO',
    amountCents,
    split: false,
    ...extra,
  };
};

export const borderoAccount = (name: string, balanceCents: number, extra: Partial<BorderoAccount> = {}): BorderoAccount => ({
  id: `f-${name}`,
  name,
  kind: 'corrente',
  bank: name,
  balanceCents,
  balanceUpdatedAt: '2026-09-02T12:00:00+00:00',
  balanceAvailable: true,
  ...extra,
});

/** Estrutura e valores do "pagamento semanal.pdf" de referência (31/08 a 06/09). */
export const BORDERO_CATEGORIES: BorderoCategory[] = [
  cat('c-cmv', 'CMV', '2', null, 10),
  cat('c-peixes', 'Peixes e frutos do mar', '2.01', 'c-cmv', 10),
  cat('c-diversos', 'Diversos', '2.02', 'c-cmv', 20),
  cat('c-op', 'Despesas operacionais', '3', null, 30),
  cat('c-adm', 'Despesas administrativas', '3.01', 'c-op', 10),
  cat('c-mkt', 'Despesas de vendas e marketing', '3.02', 'c-op', 20),
  cat('c-func', 'Despesas com funcionarios', '3.03', 'c-op', 30),
  cat('c-casa', 'Casa dos funcionarios', '3.04', 'c-op', 40),
  cat('c-transp', 'Transporte', '3.05', 'c-op', 50),
  cat('c-fin', 'Despesas financeiras', '4', null, 40),
  cat('c-tarifas', 'Tarifas bancarias', '4.01', 'c-fin', 10),
  cat('c-impostos', 'Impostos/ICMS/Sindicato', '4.02', 'c-fin', 20),
  cat('c-invest', 'Investimentos', '5', null, 50),
];

export function createBorderoPayload(overrides: Partial<BorderoPayload> = {}): BorderoPayload {
  const items = overrides.items ?? [
    borderoItem('c-peixes', 2_000_000, { supplier: 'Peixaria Atlantico', description: 'Salmao', dueDate: '2026-08-31' }),
    borderoItem('c-peixes', 1_799_109, { supplier: 'Peixaria Atlantico', description: 'Atum', dueDate: '2026-09-03' }),
    borderoItem('c-diversos', 3_006_346, { supplier: 'Ceasa', description: 'Hortifruti', dueDate: '2026-09-04' }),
    borderoItem('c-adm', 232_034, { supplier: 'Contabilidade', description: 'Honorarios', dueDate: '2026-09-05' }),
    borderoItem('c-func', 3_000_000, { supplier: null, description: 'Folha quinzenal', dueDate: '2026-09-05', status: 'AGUARDANDO_APROVACAO' }),
    borderoItem('c-func', 3_063_524, { supplier: 'INSS', description: 'Encargos', dueDate: '2026-09-06' }),
    borderoItem('c-casa', 81_346, { supplier: 'Imobiliaria', description: 'Aluguel casa', dueDate: '2026-09-06' }),
  ];
  const accounts = overrides.accounts ?? [
    borderoAccount('Banco A', 10_000_000),
    borderoAccount('Banco B', 7_000_000),
    borderoAccount('Caixa', 1_860_927, { kind: 'caixa', bank: null }),
  ];
  const totalPayableCents = items.reduce((sum, item) => sum + item.amountCents, 0);
  const totalAccountBalanceCents = accounts.reduce((sum, account) => sum + account.balanceCents, 0);
  return {
    contractVersion: '1.0',
    period: { start: '2026-08-31', end: '2026-09-06' },
    store: { id: 'store-a', name: 'Barbados Villagio' },
    generatedAt: '2026-09-02T15:30:00+00:00',
    categories: BORDERO_CATEGORIES,
    items,
    totalPayableCents,
    payableCount: new Set(items.map(item => item.payableId)).size,
    accounts,
    totalAccountBalanceCents,
    projectedFinalBalanceCents: totalAccountBalanceCents - totalPayableCents,
    overdueBeforePeriod: { count: 0, amountCents: 0 },
    ...overrides,
  };
}

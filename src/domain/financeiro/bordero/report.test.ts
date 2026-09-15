import { describe, expect, it } from 'vitest';
import {
  BORDERO_UNCATEGORIZED_ID,
  BorderoContractError,
  borderoEntrySituation,
  borderoOverdueInPeriod,
  buildBorderoPdfFileName,
  buildBorderoReport,
  flattenBorderoCategories,
  formatBorderoMoney,
  parseBorderoPayload,
  slugifyBorderoName,
} from '@/domain/financeiro/bordero';
import { borderoAccount, borderoItem, borderoPaidItem, createBorderoPayload } from '@/test/fixtures/bordero';

describe('Borderô — relatório em centavos', () => {
  it('reproduz os números do borderô de referência e a fórmula do saldo final', () => {
    const report = buildBorderoReport(parseBorderoPayload(createBorderoPayload()));
    expect(formatBorderoMoney(report.totalPayableCents)).toBe('R$131.823,59');
    expect(formatBorderoMoney(report.totalAccountBalanceCents)).toBe('R$188.609,27');
    expect(formatBorderoMoney(report.projectedFinalBalanceCents)).toBe('R$56.785,68');
    expect(report.projectedFinalBalanceCents).toBe(report.totalAccountBalanceCents - report.totalPayableCents);
    expect(report.finalBalanceState).toBe('positive');
    expect(report.tree.reduce((sum, node) => sum + node.openCents, 0)).toBe(report.totalPayableCents);
  });

  it('despesa completa: já pagas + a vencer = total de contas, e o saldo final só desconta as a vencer', () => {
    const report = buildBorderoReport(createBorderoPayload());
    expect(formatBorderoMoney(report.totalPaidCents)).toBe('R$15.045,90');
    expect(formatBorderoMoney(report.totalPayableCents)).toBe('R$131.823,59');
    expect(formatBorderoMoney(report.totalExpenseCents)).toBe('R$146.869,49');
    expect(report.paidCount).toBe(2);
    expect(report.entries).toHaveLength(9);
    expect(report.tree.reduce((sum, node) => sum + node.paidCents, 0)).toBe(report.totalPaidCents);
    expect(report.tree.reduce((sum, node) => sum + node.amountCents, 0)).toBe(report.totalExpenseCents);
    expect(report.projectedFinalBalanceCents).toBe(report.totalAccountBalanceCents - report.totalPayableCents);

    const peixes = report.tree[0].children.find(child => child.name === 'Peixes e frutos do mar')!;
    expect(peixes).toMatchObject({ paidCents: 1_500_000, openCents: 3_799_109, amountCents: 5_299_109, itemCount: 3 });
    expect(report.tree.find(node => node.name === 'Despesas financeiras')).toMatchObject({ paidCents: 4_590, openCents: 0 });
  });

  it('situação da despesa: paga (com origem), vencida no período, aguardando aprovação e a vencer', () => {
    const report = buildBorderoReport(createBorderoPayload({
      items: [
        borderoItem('c-adm', 100, { dueDate: '2026-09-01' }),
        borderoItem('c-adm', 200, { dueDate: '2026-09-01', payableId: 'x' }),
        borderoItem('c-adm', 300, { dueDate: '2026-09-02', status: 'AGUARDANDO_APROVACAO' }),
        borderoItem('c-adm', 400, { dueDate: '2026-09-05' }),
      ],
      paidItems: [
        borderoPaidItem('c-adm', 50),
        borderoPaidItem('c-adm', 60, { source: 'lancamento', origin: 'conciliacao', dueDate: null }),
        borderoPaidItem('c-adm', 70, { source: 'lancamento', origin: 'manual', dueDate: null }),
      ],
    }));
    const labels = report.entries.map(entry => borderoEntrySituation(entry, '2026-09-02').label);
    expect(labels).toEqual([
      'Paga', 'Paga · conciliação', 'Paga · lançamento manual',
      'Vencida', 'Vencida', 'Aguardando aprovação', 'A vencer',
    ]);
    expect(borderoOverdueInPeriod(report, '2026-09-02')).toEqual({ count: 2, amountCents: 300 });
  });

  it('agrupa pela árvore do DRE/DFC (ordem → código) e soma subcategorias', () => {
    const report = buildBorderoReport(createBorderoPayload());
    expect(report.tree.map(node => node.name)).toEqual(['CMV', 'Despesas operacionais', 'Despesas financeiras', 'Investimentos']);
    const cmv = report.tree[0];
    expect(cmv.openCents).toBe(3_799_109 + 3_006_346);
    const peixes = cmv.children.find(child => child.name === 'Peixes e frutos do mar')!;
    expect(peixes.openCents).toBe(3_799_109);
    expect(peixes.items).toHaveLength(3);
    expect(report.tree[3]).toMatchObject({ name: 'Investimentos', amountCents: 0, itemCount: 0 });
  });

  it('mostra raízes sempre e oculta subcategorias sem vencimento por padrão', () => {
    const report = buildBorderoReport(createBorderoPayload());
    const names = (includeEmpty: boolean) => flattenBorderoCategories(report.tree, { includeEmpty, isExpanded: () => true })
      .map(row => row.node.name);
    expect(names(false)).toEqual([
      'CMV', 'Peixes e frutos do mar', 'Diversos',
      'Despesas operacionais', 'Despesas administrativas', 'Despesas com funcionarios', 'Casa dos funcionarios',
      'Despesas financeiras', 'Tarifas bancarias', 'Investimentos',
    ]);
    expect(names(true)).toContain('Transporte');
    expect(names(true)).toContain('Impostos/ICMS/Sindicato');
    expect(flattenBorderoCategories(report.tree, { includeEmpty: false, isExpanded: () => false }).map(row => row.node.name))
      .toEqual(['CMV', 'Despesas operacionais', 'Despesas financeiras', 'Investimentos']);
  });

  it('TESTE 7 — saldo R$ 100.000,00 − vencer R$ 40.000,00 = R$ 60.000,00', () => {
    const payload = createBorderoPayload({
      items: [borderoItem('c-adm', 4_000_000)],
      accounts: [borderoAccount('Banco', 10_000_000)],
    });
    const report = buildBorderoReport(payload);
    expect(formatBorderoMoney(report.projectedFinalBalanceCents)).toBe('R$60.000,00');
    expect(report.finalBalanceState).toBe('positive');
  });

  it('TESTE 8 — saldo R$ 20.000,00 − vencer R$ 50.000,00 = -R$ 30.000,00 (negativo)', () => {
    const report = buildBorderoReport(createBorderoPayload({
      items: [borderoItem('c-adm', 5_000_000)],
      accounts: [borderoAccount('Banco', 2_000_000)],
    }));
    expect(report.projectedFinalBalanceCents).toBe(-3_000_000);
    expect(formatBorderoMoney(report.projectedFinalBalanceCents)).toBe('-R$30.000,00');
    expect(report.finalBalanceState).toBe('negative');
  });

  it('TESTE 9 — nenhuma conta: vencer R$ 0,00 e saldo final igual ao saldo', () => {
    const report = buildBorderoReport(createBorderoPayload({
      items: [],
      paidItems: [],
      accounts: [borderoAccount('Banco', 2_000_000)],
    }));
    expect(formatBorderoMoney(report.totalPayableCents)).toBe('R$0,00');
    expect(formatBorderoMoney(report.projectedFinalBalanceCents)).toBe('R$20.000,00');
    expect(report.tree.every(node => node.amountCents === 0)).toBe(true);
  });

  it('saldo final zero é estado neutro', () => {
    const report = buildBorderoReport(createBorderoPayload({
      items: [borderoItem('c-adm', 123_45)],
      accounts: [borderoAccount('Banco', 123_45)],
    }));
    expect(report.finalBalanceState).toBe('zero');
  });

  it('sem categoria usa o nó sintético do DFC e fecha a soma sem diferença de centavos', () => {
    const payload = createBorderoPayload();
    const withUncategorized = createBorderoPayload({
      categories: [...payload.categories, {
        id: BORDERO_UNCATEGORIZED_ID, name: 'Sem categoria — Despesas', code: 'S/C-D', parentId: null,
        sortOrder: 9981, kind: 'despesa', active: true, nonOperational: false, synthetic: true,
      }],
      items: [...payload.items, borderoItem(BORDERO_UNCATEGORIZED_ID, 1), borderoItem(BORDERO_UNCATEGORIZED_ID, 2)],
    });
    const report = buildBorderoReport(withUncategorized);
    expect(report.tree.at(-1)).toMatchObject({ id: BORDERO_UNCATEGORIZED_ID, amountCents: 3 });
    expect(formatBorderoMoney(report.totalPayableCents)).toBe('R$131.823,62');
  });

  it('recusa payload inconsistente em vez de exibir número divergente', () => {
    const payload = createBorderoPayload();
    expect(() => buildBorderoReport({ ...payload, totalPayableCents: payload.totalPayableCents + 1 })).toThrow(BorderoContractError);
    expect(() => buildBorderoReport({ ...payload, projectedFinalBalanceCents: payload.projectedFinalBalanceCents + 1 })).toThrow(/Saldo final/);
    expect(() => buildBorderoReport({ ...payload, totalAccountBalanceCents: payload.totalAccountBalanceCents - 1 })).toThrow(BorderoContractError);
    expect(() => buildBorderoReport({ ...payload, totalPaidCents: payload.totalPaidCents + 1 })).toThrow(/já pago/);
    expect(() => buildBorderoReport({ ...payload, totalExpenseCents: payload.totalExpenseCents + 1 })).toThrow(/Total de contas/);
    expect(() => buildBorderoReport({ ...payload, items: [...payload.items, borderoItem('categoria-inexistente', 0)] })).toThrow(/categoria ausente/);
  });

  it('valida o contrato de transporte (versão, centavos inteiros, datas ISO)', () => {
    const payload = createBorderoPayload();
    expect(() => parseBorderoPayload({ ...payload, contractVersion: '2.0' })).toThrow(/contractVersion/);
    expect(() => parseBorderoPayload({ ...payload, totalPayableCents: 1318.5 })).toThrow(/centavos/);
    expect(() => parseBorderoPayload({ ...payload, period: { start: '31/08/2026', end: '2026-09-06' } })).toThrow(/period\.start/);
    expect(() => parseBorderoPayload({ ...payload, store: { id: 'x', name: '' } })).toThrow(/store\.name/);
    const { paidItems: _paidItems, ...withoutPaid } = payload;
    expect(() => parseBorderoPayload(withoutPaid)).toThrow(/paidItems/);
    expect(() => parseBorderoPayload({ ...payload, paidItems: [{ ...payload.paidItems[0], source: 'boleto' }] })).toThrow(/source/);
  });

  it('formata dinheiro no padrão brasileiro com sinal antes do símbolo', () => {
    expect(formatBorderoMoney(123456)).toBe('R$1.234,56');
    expect(formatBorderoMoney(-123456)).toBe('-R$1.234,56');
    expect(formatBorderoMoney(0)).toBe('R$0,00');
  });
});

describe('Borderô — nome do arquivo PDF', () => {
  it('gera nomes amigáveis por semana, período e mês', () => {
    const period = { start: '2026-08-31', end: '2026-09-06' };
    expect(buildBorderoPdfFileName('Barbados Villagio', 'week', period)).toBe('bordero-barbados-villagio-31-08-2026-a-06-09-2026.pdf');
    expect(buildBorderoPdfFileName('Barbados Villagio', 'custom', period)).toBe('bordero-barbados-villagio-31-08-2026-a-06-09-2026.pdf');
    expect(buildBorderoPdfFileName('Barbados Villagio', 'month', { start: '2026-09-01', end: '2026-09-30' }))
      .toBe('bordero-barbados-villagio-setembro-2026.pdf');
    expect(buildBorderoPdfFileName('Ren Sushi', 'month', { start: '2026-03-01', end: '2026-03-31' }))
      .toBe('bordero-ren-sushi-marco-2026.pdf');
  });

  it('sanitiza acentos, barras e símbolos do nome da unidade', () => {
    expect(slugifyBorderoName('  Barbados Villágio / Matriz! ')).toBe('barbados-villagio-matriz');
    expect(slugifyBorderoName('../../etc')).toBe('etc');
    expect(slugifyBorderoName('***')).toBe('unidade');
  });
});

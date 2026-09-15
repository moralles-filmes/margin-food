import { describe, expect, it } from 'vitest';
import { buildBorderoPdfModel, createBorderoPdfBlob } from '@/lib/borderoPdfExport';
import { buildBorderoReport, formatBorderoMoney, formatBorderoPeriod } from '@/domain/financeiro/bordero';
import { borderoAccount, borderoItem, createBorderoPayload } from '@/test/fixtures/bordero';

async function readPdfText(blob: Blob): Promise<string> {
  return new TextDecoder('latin1').decode(new Uint8Array(await blob.arrayBuffer()));
}

const exportedAt = new Date('2026-09-02T18:45:00Z');

describe('Borderô — exportação PDF', () => {
  it('TESTE 10 — contém unidade, título, período, categorias, totais, saldo, saldo final e geração', async () => {
    const report = buildBorderoReport(createBorderoPayload());
    const { blob, model } = createBorderoPdfBlob(report, { mode: 'week', exportedAt });
    const text = await readPdfText(blob);

    expect(blob.type).toBe('application/pdf');
    expect(text.startsWith('%PDF-')).toBe(true);
    expect(text).toMatch(/\/MediaBox \[0 0 595\.2\d* 841\.8\d*\]/); // A4
    expect(text).toContain('Barbados Villagio');
    expect(text).toContain('BORDER');
    expect(text).toContain('31/08/2026 a 06/09/2026');
    for (const name of ['CMV', 'Peixes e frutos do mar', 'Diversos', 'Despesas administrativas', 'Despesas com funcionarios', 'Casa dos funcionarios', 'Investimentos']) {
      expect(text).toContain(name);
    }
    expect(text).toContain('R$37.991,09');
    expect(text).toContain('R$30.063,46');
    expect(text).toContain('R$2.320,34');
    expect(text).toContain('R$60.635,24');
    expect(text).toContain('R$813,46');
    expect(text).toContain('TOTAL A PAGAR');
    expect(text).toContain('R$131.823,59');
    expect(text).toContain('SALDO DAS CONTAS');
    expect(text).toContain('R$188.609,27');
    expect(text).toContain('SALDO FINAL PROVISIONADO');
    expect(text).toContain('R$56.785,68');
    expect(text).toContain('02/09/2026 15:45'); // gerado em (horário de Brasília)
    const totalPages = Number(/P.gina 1 de (\d+)/.exec(text)?.[1]);
    expect(totalPages).toBeGreaterThanOrEqual(1);
    expect(text).toMatch(new RegExp(`P.gina ${totalPages} de ${totalPages}`));
    expect(text).not.toMatch(/NaN|Infinity|undefined/);
    expect(text).toContain('(TOTAL A PAGAR) Tj');
    expect(text).not.toContain('(TOTAL A) Tj');
    expect(model.fileName).toBe('bordero-barbados-villagio-31-08-2026-a-06-09-2026.pdf');
  });

  it('TESTE 11 — o PDF usa exatamente os mesmos valores formatados da tela', () => {
    const report = buildBorderoReport(createBorderoPayload());
    const model = buildBorderoPdfModel(report, { mode: 'week', exportedAt });
    expect(model.storeName).toBe(report.store.name);
    expect(model.periodLabel).toBe(formatBorderoPeriod(report.period));
    expect(model.summary.payable).toBe(formatBorderoMoney(report.totalPayableCents));
    expect(model.summary.balance).toBe(formatBorderoMoney(report.totalAccountBalanceCents));
    expect(model.summary.final).toBe(formatBorderoMoney(report.projectedFinalBalanceCents));
    expect(model.totals).toEqual([
      { label: 'TOTAL A PAGAR', value: 'R$131.823,59' },
      { label: 'SALDO DAS CONTAS', value: 'R$188.609,27' },
      { label: 'SALDO FINAL PROVISIONADO', value: 'R$56.785,68' },
    ]);
    const rootRows = model.categoryRows.filter(row => row.depth === 0);
    expect(rootRows.map(row => [row.label, row.value])).toEqual(report.tree.map(node => [node.name, formatBorderoMoney(node.amountCents)]));
    expect(model.itemRows).toHaveLength(report.items.length);
  });

  it('mês usa o nome do mês no arquivo e sinaliza saldo negativo sem depender de cor', async () => {
    const report = buildBorderoReport(createBorderoPayload({
      period: { start: '2026-09-01', end: '2026-09-30' },
      items: [borderoItem('c-adm', 5_000_000)],
      accounts: [borderoAccount('Banco', 2_000_000)],
      overdueBeforePeriod: { count: 2, amountCents: 150_000 },
    }));
    const { blob, model } = createBorderoPdfBlob(report, { mode: 'month', exportedAt });
    const text = await readPdfText(blob);
    expect(model.fileName).toBe('bordero-barbados-villagio-setembro-2026.pdf');
    expect(model.periodCaption).toBe('Setembro/2026');
    expect(text).toContain('01/09/2026 a 30/09/2026');
    expect(text).toContain('-R$30.000,00');
    expect(text).toContain('NEGATIVO');
    expect(text).toContain('Saldo insuficiente para cobrir os vencimentos do');
    expect(model.overdueNote).toContain('R$1.500,00');
  });

  it('quebra em várias páginas numeradas, repetindo cabeçalho e período', async () => {
    const items = Array.from({ length: 140 }, (_, index) => borderoItem(index % 2 ? 'c-peixes' : 'c-func', 10_000 + index, {
      description: `Boleto ${index + 1}`,
    }));
    const report = buildBorderoReport(createBorderoPayload({ items }));
    const { blob } = createBorderoPdfBlob(report, { mode: 'custom', exportedAt });
    const text = await readPdfText(blob);
    const pages = Number(/P.gina 1 de (\d+)/.exec(text)?.[1]);
    expect(pages).toBeGreaterThan(1);
    expect(text).toContain(`de ${pages}`);
    expect(text.match(/Fornecedor \/ Descri/g)?.length).toBeGreaterThan(1);
    expect(text.match(/Per.odo: 31\/08\/2026 a 06\/09\/2026/g)?.length).toBe(pages - 1);
    expect(text).toContain('Boleto 140');
  });

  it('período vazio exporta zero a pagar e saldo final igual ao saldo', async () => {
    const report = buildBorderoReport(createBorderoPayload({ items: [], accounts: [borderoAccount('Banco', 2_000_000)] }));
    const text = await readPdfText(createBorderoPdfBlob(report, { mode: 'week', exportedAt }).blob);
    expect(text).toContain('R$0,00');
    expect(text).toContain('R$20.000,00');
    expect(text).toContain('para este per');
  });
});

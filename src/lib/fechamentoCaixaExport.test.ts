import { describe, expect, it } from 'vitest';
import type { FechamentoDia } from '@/domain/financeiro/fechamentoMarcas';
import {
  buildFechamentoExcelSheets,
  buildFechamentoPdf,
  formatTotaisQuantidade,
  marcaLinhaCells,
  summarizeFechamentoPeriodo,
} from './fechamentoCaixaExport';

const dias: FechamentoDia[] = [
  {
    id: 'f2',
    data: '2026-10-02',
    bruto: 45000,
    taxas: 0,
    descontos: 0,
    liquido: 45000,
    observacao: null,
    marcas: [
      { marcaId: 'd99', nome: 'VENDAS DELIVERY 99', valor: 5000, quantidade: 42, formaVenda: 'PEDIDOS' },
      { marcaId: 'ifood', nome: 'VENDAS DELIVERY IFOOD', valor: 10000, quantidade: 80, formaVenda: 'PEDIDOS' },
      { marcaId: 'salao', nome: 'VENDAS SALAO AOI', valor: 30000, quantidade: 210, formaVenda: 'PESSOAS' },
    ],
    totalPedidos: 122,
    totalPessoas: 210,
  },
  {
    id: 'f1',
    data: '2026-10-01',
    bruto: 1000,
    taxas: 50,
    descontos: 10,
    liquido: 940,
    observacao: 'Dia legado',
    marcas: [],
    totalPedidos: 0,
    totalPessoas: 0,
  },
];

const input = { companyName: 'Restaurante Aoi', startDate: '2026-10-01', endDate: '2026-10-31', dias };

describe('fechamentoCaixaExport', () => {
  it('coloca cada marca em uma linha com forma, quantidade, faturamento e ticket', () => {
    const cells = marcaLinhaCells(dias[0].marcas[0]);
    expect(cells.slice(0, 3)).toEqual(['VENDAS DELIVERY 99', 'Pedidos', '42']);
    expect(cells[3]).toContain('5.000,00');
    expect(cells[4]).toContain('119,05');
  });

  it('mostra traço quando a marca não tem quantidade informada', () => {
    const cells = marcaLinhaCells({ marcaId: 'x', nome: 'Legada', valor: 100, quantidade: null, formaVenda: null });
    expect(cells.slice(1, 3)).toEqual(['—', '—']);
    expect(cells[4]).toBe('—');
  });

  it('soma pedidos e pessoas do período separadamente', () => {
    const totais = summarizeFechamentoPeriodo(dias);
    expect(totais).toMatchObject({ dias: 2, bruto: 46000, liquido: 45940, pedidos: 122, pessoas: 210 });
    expect(formatTotaisQuantidade(122, 210)).toBe('122 pedidos · 210 pessoas');
    expect(formatTotaisQuantidade(0, 1)).toBe('1 pessoa');
    expect(formatTotaisQuantidade(0, 0)).toBe('—');
  });

  it('gera a planilha com uma linha por dia e outra aba com uma linha por dia e marca', () => {
    const { fechamento, porMarca } = buildFechamentoExcelSheets(input);

    expect(fechamento.map(row => row.Data)).toEqual(['01/10/2026', '02/10/2026', 'TOTAL']);
    expect(fechamento[2]).toMatchObject({ 'Faturamento Bruto': 46000, Pedidos: 122, Pessoas: 210 });
    expect(porMarca).toHaveLength(3);
    expect(porMarca[2]).toMatchObject({
      Data: '02/10/2026',
      Marca: 'VENDAS SALAO AOI',
      'Forma de venda': 'Pessoas',
      Quantidade: 210,
      Faturamento: 30000,
    });
  });

  it('monta o PDF sem erro, inclusive com dia legado e período sem marcas', () => {
    expect(buildFechamentoPdf(input).getNumberOfPages()).toBeGreaterThanOrEqual(1);
    expect(buildFechamentoPdf({ ...input, dias: [dias[1]] }).getNumberOfPages()).toBe(1);

    const muitosDias = Array.from({ length: 31 }, (_, index) => ({
      ...dias[0],
      id: `f-${index}`,
      data: `2026-10-${String(index + 1).padStart(2, '0')}`,
    }));
    expect(buildFechamentoPdf({ ...input, dias: muitosDias }).getNumberOfPages()).toBeGreaterThan(1);
  });
});

import { describe, expect, it } from 'vitest';
import {
  buildFechamentoDias,
  buildFechamentoMarcaPayload,
  buildResumoPorMarca,
  formatQuantidadeForma,
  parseQuantidadeInteira,
  resolveFormaVendaDoDia,
  ticketMedio,
} from './fechamentoMarcas';

describe('buildFechamentoMarcaPayload', () => {
  it('soma valores em formato brasileiro e preserva cada marca', () => {
    const result = buildFechamentoMarcaPayload(
      [{ id: 'salao' }, { id: 'ren' }, { id: 'royal' }],
      { salao: '1.200,50', ren: '300,25', royal: '499,25' }
    );

    expect(result.total).toBe(2000);
    expect(result.items).toEqual([
      { marca_id: 'salao', valor: 1200.5, quantidade: null },
      { marca_id: 'ren', valor: 300.25, quantidade: null },
      { marca_id: 'royal', valor: 499.25, quantidade: null },
    ]);
  });

  it('aceita quantidade dinâmica de marcas e assume zero nos campos vazios', () => {
    const brands = Array.from({ length: 25 }, (_, index) => ({ id: `marca-${index}` }));
    const result = buildFechamentoMarcaPayload(brands, { 'marca-24': '50,00' });

    expect(result.items).toHaveLength(25);
    expect(result.items[0].valor).toBe(0);
    expect(result.total).toBe(50);
  });

  it('separa o total de pedidos do total de pessoas', () => {
    const result = buildFechamentoMarcaPayload(
      [
        { id: 'ifood', forma_venda: 'PEDIDOS' },
        { id: 'd99', forma_venda: 'PEDIDOS' },
        { id: 'salao', forma_venda: 'PESSOAS' },
      ],
      { ifood: '10.000,00', d99: '5.000,00', salao: '30.000,00' },
      { ifood: '80', d99: '42', salao: '210' }
    );

    expect(result.items.map(item => item.quantidade)).toEqual([80, 42, 210]);
    expect(result.totalPedidos).toBe(122);
    expect(result.totalPessoas).toBe(210);
    expect(result.missingQuantidade).toEqual([]);
  });

  it('exige quantidade da marca que teve faturamento, mas não da que ficou zerada', () => {
    const result = buildFechamentoMarcaPayload(
      [
        { id: 'ifood', forma_venda: 'PEDIDOS' },
        { id: 'd99', forma_venda: 'PEDIDOS' },
        { id: 'salao', forma_venda: 'PESSOAS' },
      ],
      { ifood: '100,00', d99: '', salao: '50,00' },
      { ifood: '', salao: '0' }
    );

    expect(result.missingQuantidade).toEqual(['ifood', 'salao']);
  });

  it('ignora quantidade de marca legada sem forma de venda', () => {
    const result = buildFechamentoMarcaPayload(
      [{ id: 'legada', forma_venda: null }],
      { legada: '100,00' },
      { legada: '15' }
    );

    expect(result.items[0].quantidade).toBeNull();
    expect(result.missingQuantidade).toEqual([]);
    expect(result.totalPedidos).toBe(0);
  });
});

describe('edição de dia já lançado', () => {
  it('não exige quantidade de marca lançada antes de existir o campo, enquanto ficar vazio', () => {
    const brands = [{ id: 'salao', forma_venda: 'PESSOAS' as const }, { id: 'ifood', forma_venda: 'PEDIDOS' as const }];
    const values = { salao: '100,00', ifood: '50,00' };
    const legado = new Set(['salao', 'ifood']);

    expect(buildFechamentoMarcaPayload(brands, values, {}, legado).missingQuantidade).toEqual([]);
    // Zero digitado não é "não informado": continua inválido para marca com faturamento.
    expect(buildFechamentoMarcaPayload(brands, values, { salao: '0' }, legado).missingQuantidade).toEqual(['salao']);
    expect(buildFechamentoMarcaPayload(brands, values, {}, new Set(['salao'])).missingQuantidade).toEqual(['ifood']);
  });

  it('usa a forma de venda gravada no dia em vez da atual da marca', () => {
    const brands = [
      { id: 'salao', forma_venda: 'PESSOAS' as const },
      { id: 'ifood', forma_venda: 'PEDIDOS' as const },
      { id: 'legada', forma_venda: null },
    ];
    const resolved = resolveFormaVendaDoDia(brands, { salao: 'PEDIDOS', ifood: null });

    expect(resolved.map(brand => brand.forma_venda)).toEqual(['PEDIDOS', 'PEDIDOS', null]);
    const payload = buildFechamentoMarcaPayload(resolved, { salao: '10,00' }, { salao: '200' });
    expect(payload.totalPedidos).toBe(200);
    expect(payload.totalPessoas).toBe(0);
  });
});

describe('parseQuantidadeInteira', () => {
  it('trata vazio como não informado e descarta separadores', () => {
    expect(parseQuantidadeInteira('')).toBeNull();
    expect(parseQuantidadeInteira(undefined)).toBeNull();
    expect(parseQuantidadeInteira('0')).toBe(0);
    expect(parseQuantidadeInteira('1.250')).toBe(1250);
  });
});

describe('ticketMedio e formatQuantidadeForma', () => {
  it('só calcula ticket com quantidade positiva', () => {
    expect(ticketMedio(5000, 42)).toBeCloseTo(119.05, 2);
    expect(ticketMedio(5000, 0)).toBeNull();
    expect(ticketMedio(5000, null)).toBeNull();
  });

  it('usa a unidade da forma de venda, com singular', () => {
    expect(formatQuantidadeForma(42, 'PEDIDOS')).toBe('42 pedidos');
    expect(formatQuantidadeForma(1, 'PESSOAS')).toBe('1 pessoa');
    expect(formatQuantidadeForma(null, 'PEDIDOS')).toBe('—');
    expect(formatQuantidadeForma(10, null)).toBe('—');
  });
});

describe('buildFechamentoDias / buildResumoPorMarca', () => {
  const marcas = [
    { id: 'ifood', nome: 'Vendas iFood', ordem: 1 },
    { id: 'salao', nome: 'Vendas Salão', ordem: 2 },
  ];
  const rows = [
    { id: 'f1', data: '2026-10-01', faturamento_bruto: 300, taxas: 10, descontos: 0, faturamento_liquido: 290, observacao: null },
    { id: 'f2', data: '2026-10-02', faturamento_bruto: 500, taxas: 0, descontos: 0, faturamento_liquido: 500, observacao: 'ok' },
    { id: 'f3', data: '2026-10-03', faturamento_bruto: 900, taxas: 0, descontos: 0, faturamento_liquido: 900, observacao: null },
  ];
  const valores = [
    // f1 é legado: detalhado por marca, mas sem quantidade.
    { fechamento_id: 'f1', marca_id: 'salao', valor_bruto: 200, quantidade: null, forma_venda: null },
    { fechamento_id: 'f1', marca_id: 'ifood', valor_bruto: 100, quantidade: null, forma_venda: null },
    { fechamento_id: 'f2', marca_id: 'salao', valor_bruto: 300, quantidade: 10, forma_venda: 'PESSOAS' as const },
    { fechamento_id: 'f2', marca_id: 'ifood', valor_bruto: 200, quantidade: 4, forma_venda: 'PEDIDOS' as const },
  ];

  it('monta uma linha por marca na ordem do cadastro e soma pedidos/pessoas do dia', () => {
    const dias = buildFechamentoDias(rows, valores, marcas);

    expect(dias[1].marcas.map(linha => linha.nome)).toEqual(['Vendas iFood', 'Vendas Salão']);
    expect(dias[1].totalPedidos).toBe(4);
    expect(dias[1].totalPessoas).toBe(10);
    expect(dias[0].totalPedidos).toBe(0);
    // f3 não foi dividido por marca.
    expect(dias[2].marcas).toEqual([]);
  });

  it('consolida o período por marca e calcula ticket só sobre dias com quantidade', () => {
    const resumo = buildResumoPorMarca(buildFechamentoDias(rows, valores, marcas));

    expect(resumo).toEqual([
      { marcaId: 'salao', nome: 'Vendas Salão', formaVenda: 'PESSOAS', valor: 500, quantidade: 10, valorComQuantidade: 300 },
      { marcaId: 'ifood', nome: 'Vendas iFood', formaVenda: 'PEDIDOS', valor: 300, quantidade: 4, valorComQuantidade: 200 },
    ]);
  });

  it('mantém separadas as formas quando a marca trocou no meio do período', () => {
    const dias = buildFechamentoDias(
      rows,
      [
        { fechamento_id: 'f2', marca_id: 'salao', valor_bruto: 500, quantidade: 5, forma_venda: 'PEDIDOS' },
        { fechamento_id: 'f3', marca_id: 'salao', valor_bruto: 900, quantidade: 30, forma_venda: 'PESSOAS' },
      ],
      marcas
    );

    expect(buildResumoPorMarca(dias).map(item => [item.formaVenda, item.quantidade])).toEqual([
      ['PESSOAS', 30],
      ['PEDIDOS', 5],
    ]);
  });
});

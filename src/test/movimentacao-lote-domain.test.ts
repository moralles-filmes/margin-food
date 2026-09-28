import { describe, it, expect } from 'vitest';
import {
  calcularItemLote, itemLoteVazio, novoItemLote, validarLote,
  type MovLoteItem, type MovLoteProduto,
} from '@/domain/estoque/movimentacaoLote';

const salmao: MovLoteProduto = { id: 'p1', nomeProduto: 'Salmão', unidadeMedida: 'KG', fatorConversaoPadrao: 10 };
const arroz: MovLoteProduto = { id: 'p2', nomeProduto: 'Arroz', unidadeMedida: 'KG', fatorConversaoPadrao: 5 };
const produtos = new Map([[salmao.id, salmao], [arroz.id, arroz]]);

function item(key: string, patch: Partial<MovLoteItem>): MovLoteItem {
  return { ...novoItemLote(key), ...patch };
}

describe('calcularItemLote', () => {
  it('entrada em un. de compra: quantidade × fator e custo base = preço ÷ fator', () => {
    const calc = calcularItemLote(
      item('a', { produtoId: 'p1', quantidade: '3', usePurchaseUnit: true, fator: '10', precoCompra: '800' }),
      salmao, true,
    );
    expect(calc).toEqual({ quantidadeBase: 30, custoUnitario: 80, custoTotal: 2400 });
  });

  it('entrada na un. base não multiplica a quantidade', () => {
    const calc = calcularItemLote(
      item('a', { produtoId: 'p1', quantidade: '2,5', usePurchaseUnit: false, fator: '10', precoCompra: '800' }),
      salmao, true,
    );
    expect(calc.quantidadeBase).toBe(2.5);
    expect(calc.custoUnitario).toBe(80);
  });

  it('saída em un. de compra usa o fator padrão do produto e o custo informado', () => {
    const calc = calcularItemLote(
      item('a', { produtoId: 'p1', quantidade: '2', usePurchaseUnit: true, custoUnitario: '82' }),
      salmao, false,
    );
    expect(calc).toEqual({ quantidadeBase: 20, custoUnitario: 82, custoTotal: 1640 });
  });
});

describe('itemLoteVazio', () => {
  it('linha nova é vazia, mesmo com setor herdado; com produto ou quantidade deixa de ser', () => {
    expect(itemLoteVazio(novoItemLote('a'))).toBe(true);
    expect(itemLoteVazio(novoItemLote('a', 'Cozinha'))).toBe(true);
    expect(itemLoteVazio(item('a', { produtoId: 'p1' }))).toBe(false);
    expect(itemLoteVazio(item('a', { quantidade: '1' }))).toBe(false);
  });
});

describe('validarLote', () => {
  const saldos = { p1: { saldo: 10 }, p2: { saldo: 50 } };

  it('ignora linhas vazias e devolve só os itens preenchidos', () => {
    const r = validarLote({
      itens: [
        item('a', { produtoId: 'p1', quantidade: '2', precoCompra: '80' }),
        novoItemLote('b'),
        item('c', { produtoId: 'p2', quantidade: '5', precoCompra: '6' }),
      ],
      produtos, saldos, isEntrada: true,
    });
    expect(r.ok).toBe(true);
    expect(r.itens.map(i => i.key)).toEqual(['a', 'c']);
  });

  it('exige ao menos um item preenchido', () => {
    const r = validarLote({ itens: [novoItemLote('a')], produtos, saldos, isEntrada: true });
    expect(r).toEqual({ ok: false, itens: [], mensagem: 'Adicione ao menos um item.', erros: {} });
  });

  it('exige setor em cada linha de saída', () => {
    const r = validarLote({
      itens: [
        item('a', { produtoId: 'p1', quantidade: '1', custoUnitario: '80', setor: 'Cozinha' }),
        item('b', { produtoId: 'p2', quantidade: '1', custoUnitario: '6', setor: '' }),
      ],
      produtos, saldos, isEntrada: false,
    });
    expect(r.ok).toBe(false);
    expect(r.erros).toEqual({ b: 'Setor é obrigatório para saídas.' });
    expect(r.mensagem).toBe('Item 2: Setor é obrigatório para saídas.');
  });

  it('mantém o setor de cada linha — o mesmo lote pode ir para setores diferentes', () => {
    const r = validarLote({
      itens: [
        item('a', { produtoId: 'p1', quantidade: '2', custoUnitario: '80', setor: 'Cozinha' }),
        item('b', { produtoId: 'p1', quantidade: '3', custoUnitario: '80', setor: 'Sushi Bar' }),
        item('c', { produtoId: 'p2', quantidade: '1', custoUnitario: '6', setor: 'Salão' }),
      ],
      produtos, saldos, isEntrada: false,
    });
    expect(r.ok).toBe(true);
    expect(r.itens.map(i => [i.key, i.setor])).toEqual([['a', 'Cozinha'], ['b', 'Sushi Bar'], ['c', 'Salão']]);
  });

  it('entrada ignora o setor herdado na linha', () => {
    const r = validarLote({
      itens: [item('a', { produtoId: 'p1', quantidade: '1', precoCompra: '80', setor: 'Cozinha' })],
      produtos, saldos, isEntrada: true,
    });
    expect(r.itens[0].setor).toBe('');
  });

  it('aponta a linha sem produto ou sem quantidade', () => {
    const r = validarLote({
      itens: [
        item('a', { quantidade: '1' }),
        item('b', { produtoId: 'p1', quantidade: '0', precoCompra: '10' }),
      ],
      produtos, saldos, isEntrada: true,
    });
    expect(r.ok).toBe(false);
    expect(r.erros).toEqual({ a: 'Selecione o produto.', b: 'Informe a quantidade.' });
    expect(r.mensagem).toMatch(/2 itens com problema/);
  });

  it('bloqueia saída de item sem custo', () => {
    const r = validarLote({
      itens: [item('a', { produtoId: 'p1', quantidade: '1', custoUnitario: '', setor: 'Cozinha' })],
      produtos, saldos, isEntrada: false,
    });
    expect(r.ok).toBe(false);
    expect(r.mensagem).toMatch(/^Item 1: Item sem custo cadastrado/);
  });

  it('confere o saldo pela soma das linhas do mesmo produto, mesmo em setores diferentes', () => {
    // 6 + 6 = 12 kg com 10 kg em estoque: cada linha passaria sozinha.
    const r = validarLote({
      itens: [
        item('a', { produtoId: 'p1', quantidade: '6', custoUnitario: '80', setor: 'Cozinha' }),
        item('b', { produtoId: 'p2', quantidade: '5', custoUnitario: '6', setor: 'Cozinha' }),
        item('c', { produtoId: 'p1', quantidade: '6', custoUnitario: '80', setor: 'Sushi Bar' }),
      ],
      produtos, saldos, isEntrada: false,
    });
    expect(r.ok).toBe(false);
    expect(r.itens).toEqual([]);
    expect(Object.keys(r.erros).sort()).toEqual(['a', 'c']);
    expect(r.erros.a).toMatch(/Estoque insuficiente! Disponível: 10,00 KG \(soma de 2 linhas: 12,00 KG\)/);
  });

  it('aceita saída que consome exatamente o saldo, mesmo com soma em ponto flutuante', () => {
    const r = validarLote({
      itens: [
        item('a', { produtoId: 'p1', quantidade: '0,1', custoUnitario: '80', setor: 'Cozinha' }),
        item('b', { produtoId: 'p1', quantidade: '0,2', custoUnitario: '80', setor: 'Cozinha' }),
      ],
      produtos, saldos: { p1: { saldo: 0.3 } }, isEntrada: false,
    });
    expect(r.ok).toBe(true);
  });

  it('não confere saldo em entrada', () => {
    const r = validarLote({
      itens: [item('a', { produtoId: 'p1', quantidade: '500', precoCompra: '80' })],
      produtos, saldos, isEntrada: true,
    });
    expect(r.ok).toBe(true);
  });
});

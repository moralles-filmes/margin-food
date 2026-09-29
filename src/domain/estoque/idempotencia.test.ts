import { describe, expect, it } from 'vitest';
import { chaveIdempotente, novaSemente } from '@/lib/idempotencia';
import {
  chaveEntradaSalmao,
  chaveLoteMovimentacao,
  chaveManipulacaoSalmao,
  chaveRequisicaoEstoque,
} from './idempotencia';

describe('chaveIdempotente', () => {
  it('é determinística: o mesmo conteúdo com a mesma semente gera a mesma chave', () => {
    expect(chaveIdempotente('s1', { a: 1, b: [1, 2] })).toBe(chaveIdempotente('s1', { a: 1, b: [1, 2] }));
  });

  it('não depende da ordem das chaves do objeto', () => {
    expect(chaveIdempotente('s1', { a: 1, b: 'x' })).toBe(chaveIdempotente('s1', { b: 'x', a: 1 }));
  });

  it('muda com a semente e com o conteúdo', () => {
    const base = chaveIdempotente('s1', { a: 1 });
    expect(chaveIdempotente('s2', { a: 1 })).not.toBe(base);
    expect(chaveIdempotente('s1', { a: 2 })).not.toBe(base);
    expect(chaveIdempotente('s1', { a: '1' })).not.toBe(base);
  });

  it('cabe no limite de 200 caracteres dos índices', () => {
    const itens = Array.from({ length: 500 }, (_, i) => ({ produto: `p-${i}`, quantidade: i + 0.125 }));
    const chave = chaveIdempotente(novaSemente(), { itens });
    expect(chave.length).toBeLessThanOrEqual(60);
    expect(chave).toMatch(/^[\w-]+:[0-9a-z]+$/);
  });

  it('novaSemente não se repete', () => {
    expect(novaSemente()).not.toBe(novaSemente());
  });
});

describe('chaveRequisicaoEstoque', () => {
  const itens = [
    { produtoId: 'p-b', quantidade: 2, unidade: 'UN' },
    { produtoId: 'p-a', quantidade: 1.5, unidade: 'KG' },
  ];
  const dados = { setor: 'Cozinha', observacao: '', itens };

  it('retry da mesma requisição reaproveita a chave', () => {
    expect(chaveRequisicaoEstoque('s', dados)).toBe(chaveRequisicaoEstoque('s', { ...dados, itens: [...itens] }));
  });

  it('a ordem dos itens não muda a requisição (o servidor compara o conjunto)', () => {
    expect(chaveRequisicaoEstoque('s', { ...dados, itens: [itens[1], itens[0]] })).toBe(chaveRequisicaoEstoque('s', dados));
  });

  it('setor, observação, quantidade, unidade ou item diferente geram chave nova', () => {
    const base = chaveRequisicaoEstoque('s', dados);
    expect(chaveRequisicaoEstoque('s', { ...dados, setor: 'Bar' })).not.toBe(base);
    expect(chaveRequisicaoEstoque('s', { ...dados, observacao: 'urgente' })).not.toBe(base);
    expect(chaveRequisicaoEstoque('s', { ...dados, itens: [{ ...itens[0], quantidade: 3 }, itens[1]] })).not.toBe(base);
    expect(chaveRequisicaoEstoque('s', { ...dados, itens: [{ ...itens[0], unidade: 'CX' }, itens[1]] })).not.toBe(base);
    expect(chaveRequisicaoEstoque('s', { ...dados, itens: [itens[0]] })).not.toBe(base);
  });

  it('formulário novo (semente nova) é outra requisição, mesmo com o mesmo conteúdo', () => {
    expect(chaveRequisicaoEstoque('s2', dados)).not.toBe(chaveRequisicaoEstoque('s', dados));
  });
});

describe('chaveLoteMovimentacao', () => {
  const itens = [
    { produtoId: 'p-a', quantidade: 20, custoUnitario: 80 },
    { produtoId: 'p-b', quantidade: 5, custoUnitario: 3.2, setor: 'Bar' },
  ];
  const dados = { tipo: 'ENTRADA', observacao: 'NF 123', itens };

  it('retry do mesmo lote reaproveita a chave', () => {
    expect(chaveLoteMovimentacao('s', dados)).toBe(chaveLoteMovimentacao('s', { ...dados, itens: itens.map(i => ({ ...i })) }));
  });

  it('a ordem conta: o servidor grava e compara cada linha pela posição', () => {
    expect(chaveLoteMovimentacao('s', { ...dados, itens: [itens[1], itens[0]] })).not.toBe(chaveLoteMovimentacao('s', dados));
  });

  it('tipo, observação, quantidade, custo ou setor diferente geram chave nova', () => {
    const base = chaveLoteMovimentacao('s', dados);
    expect(chaveLoteMovimentacao('s', { ...dados, tipo: 'SAIDA' })).not.toBe(base);
    expect(chaveLoteMovimentacao('s', { ...dados, observacao: '' })).not.toBe(base);
    expect(chaveLoteMovimentacao('s', { ...dados, itens: [{ ...itens[0], quantidade: 21 }, itens[1]] })).not.toBe(base);
    expect(chaveLoteMovimentacao('s', { ...dados, itens: [{ ...itens[0], custoUnitario: 81 }, itens[1]] })).not.toBe(base);
    expect(chaveLoteMovimentacao('s', { ...dados, itens: [itens[0], { ...itens[1], setor: 'Cozinha' }] })).not.toBe(base);
  });
});

describe('chaveEntradaSalmao', () => {
  const entrada = {
    date: '2026-09-29', expirationDate: '2026-10-03', lot: 'L1', sif: '123', supplier: 'Fornecedor',
    totalValue: 420, grossKg: 10.5, boxes: 1, units: 2, notes: '',
  };

  it('retry da mesma entrada reaproveita a chave; campo vazio e ausente são o mesmo envio', () => {
    expect(chaveEntradaSalmao('s', entrada)).toBe(chaveEntradaSalmao('s', { ...entrada }));
    expect(chaveEntradaSalmao('s', { ...entrada, notes: undefined })).toBe(chaveEntradaSalmao('s', entrada));
  });

  it('qualquer campo gravado diferente gera chave nova', () => {
    const base = chaveEntradaSalmao('s', entrada);
    for (const mudanca of [
      { date: '2026-09-28' }, { expirationDate: '' }, { lot: 'L2' }, { sif: '9' }, { supplier: 'Outro' },
      { totalValue: 421 }, { grossKg: 10.6 }, { boxes: 2 }, { units: 3 }, { notes: 'x' },
    ]) {
      expect(chaveEntradaSalmao('s', { ...entrada, ...mudanca }), JSON.stringify(mudanca)).not.toBe(base);
    }
  });
});

describe('chaveManipulacaoSalmao', () => {
  const manipulacao = { entryId: 'e1', date: '2026-09-29', fishCount: 1, grossKg: 2.5, cleanKg: 1.8, leftoverKg: 0 };

  it('retry da mesma manipulação reaproveita a chave', () => {
    expect(chaveManipulacaoSalmao('s', manipulacao)).toBe(chaveManipulacaoSalmao('s', { ...manipulacao }));
  });

  it('lote, data, peixes, kg bruto ou limpo diferente geram chave nova', () => {
    const base = chaveManipulacaoSalmao('s', manipulacao);
    for (const mudanca of [{ entryId: 'e2' }, { date: '2026-09-30' }, { fishCount: 2 }, { grossKg: 2.6 }, { cleanKg: 1.9 }]) {
      expect(chaveManipulacaoSalmao('s', { ...manipulacao, ...mudanca }), JSON.stringify(mudanca)).not.toBe(base);
    }
  });
});

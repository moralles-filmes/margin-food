import { describe, expect, it } from 'vitest';
import { novaSemente } from '@/lib/chaveOperacao';
import {
  chaveEntradaSalmao,
  chaveLoteMovimentacao,
  chaveManipulacaoSalmao,
  chaveRequisicaoEstoque,
} from './idempotencia';

describe('chaveRequisicaoEstoque', () => {
  const itens = [
    { produtoId: 'p-b', quantidade: 2, unidade: 'UN' },
    { produtoId: 'p-a', quantidade: 1.5, unidade: 'KG' },
  ];
  const dados = { setor: 'Cozinha', observacao: '', itens };

  it('retry da mesma requisição reaproveita a chave', async () => {
    expect(await chaveRequisicaoEstoque('s', dados)).toBe(await chaveRequisicaoEstoque('s', { ...dados, itens: [...itens] }));
  });

  it('a ordem dos itens não muda a requisição (o servidor compara o conjunto)', async () => {
    expect(await chaveRequisicaoEstoque('s', { ...dados, itens: [itens[1], itens[0]] })).toBe(await chaveRequisicaoEstoque('s', dados));
  });

  it('setor, observação, quantidade, unidade ou item diferente geram chave nova', async () => {
    const base = await chaveRequisicaoEstoque('s', dados);
    expect(await chaveRequisicaoEstoque('s', { ...dados, setor: 'Bar' })).not.toBe(base);
    expect(await chaveRequisicaoEstoque('s', { ...dados, observacao: 'urgente' })).not.toBe(base);
    expect(await chaveRequisicaoEstoque('s', { ...dados, itens: [{ ...itens[0], quantidade: 3 }, itens[1]] })).not.toBe(base);
    expect(await chaveRequisicaoEstoque('s', { ...dados, itens: [{ ...itens[0], unidade: 'CX' }, itens[1]] })).not.toBe(base);
    expect(await chaveRequisicaoEstoque('s', { ...dados, itens: [itens[0]] })).not.toBe(base);
  });

  it('formulário novo (semente nova) é outra requisição, mesmo com o mesmo conteúdo', async () => {
    expect(await chaveRequisicaoEstoque('s2', dados)).not.toBe(await chaveRequisicaoEstoque('s', dados));
  });

  it('cabe no limite de 200 caracteres dos índices, mesmo com 500 itens', async () => {
    const muitos = Array.from({ length: 500 }, (_, i) => ({ produtoId: `p-${i}`, quantidade: i + 0.125, unidade: 'KG' }));
    const chave = await chaveRequisicaoEstoque(novaSemente(), { ...dados, itens: muitos });
    expect(chave).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('chaveLoteMovimentacao', () => {
  const itens = [
    { produtoId: 'p-a', quantidade: 20, custoUnitario: 80 },
    { produtoId: 'p-b', quantidade: 5, custoUnitario: 3.2, setor: 'Bar' },
  ];
  const dados = { tipo: 'ENTRADA', observacao: 'NF 123', itens };

  it('retry do mesmo lote reaproveita a chave', async () => {
    expect(await chaveLoteMovimentacao('s', dados)).toBe(await chaveLoteMovimentacao('s', { ...dados, itens: itens.map(i => ({ ...i })) }));
  });

  it('a ordem conta: o servidor grava e compara cada linha pela posição', async () => {
    expect(await chaveLoteMovimentacao('s', { ...dados, itens: [itens[1], itens[0]] })).not.toBe(await chaveLoteMovimentacao('s', dados));
  });

  it('tipo, observação, quantidade, custo ou setor diferente geram chave nova', async () => {
    const base = await chaveLoteMovimentacao('s', dados);
    expect(await chaveLoteMovimentacao('s', { ...dados, tipo: 'SAIDA' })).not.toBe(base);
    expect(await chaveLoteMovimentacao('s', { ...dados, observacao: '' })).not.toBe(base);
    expect(await chaveLoteMovimentacao('s', { ...dados, itens: [{ ...itens[0], quantidade: 21 }, itens[1]] })).not.toBe(base);
    expect(await chaveLoteMovimentacao('s', { ...dados, itens: [{ ...itens[0], custoUnitario: 81 }, itens[1]] })).not.toBe(base);
    expect(await chaveLoteMovimentacao('s', { ...dados, itens: [itens[0], { ...itens[1], setor: 'Cozinha' }] })).not.toBe(base);
  });
});

describe('chaveEntradaSalmao', () => {
  const entrada = {
    date: '2026-09-29', expirationDate: '2026-10-03', lot: 'L1', sif: '123', supplier: 'Fornecedor',
    totalValue: 420, grossKg: 10.5, boxes: 1, units: 2, notes: '',
  };

  it('retry da mesma entrada reaproveita a chave; campo vazio e ausente são o mesmo envio', async () => {
    expect(await chaveEntradaSalmao('s', entrada)).toBe(await chaveEntradaSalmao('s', { ...entrada }));
    expect(await chaveEntradaSalmao('s', { ...entrada, notes: undefined })).toBe(await chaveEntradaSalmao('s', entrada));
  });

  it('qualquer campo gravado diferente gera chave nova', async () => {
    const base = await chaveEntradaSalmao('s', entrada);
    for (const mudanca of [
      { date: '2026-09-28' }, { expirationDate: '' }, { lot: 'L2' }, { sif: '9' }, { supplier: 'Outro' },
      { totalValue: 421 }, { grossKg: 10.6 }, { boxes: 2 }, { units: 3 }, { notes: 'x' },
    ]) {
      expect(await chaveEntradaSalmao('s', { ...entrada, ...mudanca }), JSON.stringify(mudanca)).not.toBe(base);
    }
  });
});

describe('chaveManipulacaoSalmao', () => {
  const manipulacao = { entryId: 'e1', date: '2026-09-29', fishCount: 1, grossKg: 2.5, cleanKg: 1.8, leftoverKg: 0 };

  it('retry da mesma manipulação reaproveita a chave', async () => {
    expect(await chaveManipulacaoSalmao('s', manipulacao)).toBe(await chaveManipulacaoSalmao('s', { ...manipulacao }));
  });

  it('lote, data, peixes, kg bruto ou limpo diferente geram chave nova', async () => {
    const base = await chaveManipulacaoSalmao('s', manipulacao);
    for (const mudanca of [{ entryId: 'e2' }, { date: '2026-09-30' }, { fishCount: 2 }, { grossKg: 2.6 }, { cleanKg: 1.9 }]) {
      expect(await chaveManipulacaoSalmao('s', { ...manipulacao, ...mudanca }), JSON.stringify(mudanca)).not.toBe(base);
    }
  });
});

/**
 * Saída de vários itens na Movimentação Operacional — regras puras.
 *
 * O gate é o banco (op_registrar_saidas_lote → op_registrar_movimentacao por
 * item); aqui fica a resposta imediata da tela e as chaves de idempotência.
 */
import { describe, it, expect } from 'vitest';
import type { ProdutoOperacional, SetorOperacional } from '@/domain/estoque/operacional';
import {
  adicionarAoLote,
  alterarQuantidadeNoLote,
  chaveItemLote,
  quantidadeNoLote,
  removerDoLote,
  traduzirErroLote,
  validarQuantidadeNoLote,
  type ItemSaidaLote,
} from '@/domain/estoque/operacionalLote';

const COZINHA: SetorOperacional = { setorId: 'setor-cozinha', nome: 'Cozinha' };
const DELIVERY: SetorOperacional = { setorId: 'setor-delivery', nome: 'Delivery' };

const COCA: ProdutoOperacional = {
  produtoId: 'prod-coca', nome: 'Coca-Cola', sku: 'MP-1', unidadeMedida: 'UN', saldo: 10, vinculado: true,
};
const AGUA: ProdutoOperacional = {
  produtoId: 'prod-agua', nome: 'Água', sku: 'MP-2', unidadeMedida: 'UN', saldo: 20, vinculado: true,
};

const item = (id: string, produto: ProdutoOperacional, setor: SetorOperacional, quantidade: number): ItemSaidaLote =>
  ({ id, produto, setor, quantidade });

describe('quantidadeNoLote', () => {
  it('soma o produto em todos os setores — o saldo é um só', () => {
    const itens = [item('a', COCA, COZINHA, 2), item('b', AGUA, COZINHA, 5), item('c', COCA, DELIVERY, 1.5)];
    expect(quantidadeNoLote(itens, 'prod-coca')).toBe(3.5);
  });

  it('ignora a linha em edição', () => {
    const itens = [item('a', COCA, COZINHA, 2), item('c', COCA, DELIVERY, 1.5)];
    expect(quantidadeNoLote(itens, 'prod-coca', 'a')).toBe(1.5);
  });

  it('não acumula erro de ponto flutuante', () => {
    const itens = [item('a', COCA, COZINHA, 0.1), item('b', COCA, DELIVERY, 0.2)];
    expect(quantidadeNoLote(itens, 'prod-coca')).toBe(0.3);
  });
});

describe('validarQuantidadeNoLote', () => {
  it('sem o produto na lista, é a validação da saída unitária', () => {
    expect(validarQuantidadeNoLote(10, COCA, []).valida).toBe(true);
    expect(validarQuantidadeNoLote(11, COCA, []).erro).toMatch(/Existem apenas 10 UN/);
  });

  it('desconta o que a lista já retira do produto, mesmo em outro setor', () => {
    const itens = [item('a', COCA, DELIVERY, 6)];
    expect(validarQuantidadeNoLote(4, COCA, itens).valida).toBe(true);
    const r = validarQuantidadeNoLote(5, COCA, itens);
    expect(r.valida).toBe(false);
    expect(r.erro).toBe('Quantidade indisponível. A lista já tem 6 UN deste produto; restam 4 UN.');
  });

  it('ao alterar um item, não conta a quantidade antiga dele', () => {
    const itens = [item('a', COCA, COZINHA, 6)];
    expect(validarQuantidadeNoLote(10, COCA, itens, 'a').valida).toBe(true);
  });

  it('mantém as mensagens que não dependem da lista', () => {
    const itens = [item('a', COCA, COZINHA, 6)];
    expect(validarQuantidadeNoLote(null, COCA, itens).erro).toBe('Informe a quantidade.');
    expect(validarQuantidadeNoLote(0, COCA, itens).erro).toBe('A quantidade precisa ser maior que zero.');
  });
});

describe('adicionarAoLote', () => {
  it('produto novo entra como linha nova', () => {
    const { itens, somadoEm } = adicionarAoLote([item('a', COCA, COZINHA, 2)], item('b', AGUA, COZINHA, 1));
    expect(itens.map(i => i.id)).toEqual(['a', 'b']);
    expect(somadoEm).toBeNull();
  });

  it('mesmo produto no mesmo setor soma na linha existente, com o saldo mais novo', () => {
    const cocaAtualizada = { ...COCA, saldo: 9 };
    const { itens, somadoEm } = adicionarAoLote(
      [item('a', COCA, COZINHA, 2), item('b', AGUA, COZINHA, 1)],
      item('c', cocaAtualizada, COZINHA, 3),
    );
    expect(somadoEm).toBe('a');
    expect(itens).toHaveLength(2);
    expect(itens[0]).toMatchObject({ id: 'a', quantidade: 5, produto: { saldo: 9 } });
  });

  it('mesmo produto em outro setor é outra linha — o lançamento vai para outro setor', () => {
    const { itens, somadoEm } = adicionarAoLote([item('a', COCA, COZINHA, 2)], item('b', COCA, DELIVERY, 1));
    expect(itens).toHaveLength(2);
    expect(somadoEm).toBeNull();
  });
});

describe('alterar e remover', () => {
  it('altera só a quantidade do item indicado', () => {
    const itens = alterarQuantidadeNoLote([item('a', COCA, COZINHA, 2), item('b', AGUA, COZINHA, 1)], 'b', 7);
    expect(itens.map(i => i.quantidade)).toEqual([2, 7]);
  });

  it('remove só o item indicado', () => {
    const itens = removerDoLote([item('a', COCA, COZINHA, 2), item('b', AGUA, COZINHA, 1)], 'a');
    expect(itens.map(i => i.id)).toEqual(['b']);
  });
});

describe('chaveItemLote', () => {
  it('é determinística: reenviar a mesma lista reaproveita as chaves', () => {
    const a = item('a', COCA, COZINHA, 2);
    expect(chaveItemLote('s1', a)).toBe(chaveItemLote('s1', { ...a }));
  });

  it('duas linhas iguais em setores diferentes têm chaves diferentes', () => {
    expect(chaveItemLote('s1', item('a', COCA, COZINHA, 2)))
      .not.toBe(chaveItemLote('s1', item('b', COCA, DELIVERY, 2)));
  });

  it('muda quando a quantidade do item muda', () => {
    const a = item('a', COCA, COZINHA, 2);
    expect(chaveItemLote('s1', a)).not.toBe(chaveItemLote('s1', { ...a, quantidade: 3 }));
  });

  it('muda quando começa um lançamento novo', () => {
    const a = item('a', COCA, COZINHA, 2);
    expect(chaveItemLote('s1', a)).not.toBe(chaveItemLote('s2', a));
  });
});

describe('traduzirErroLote', () => {
  it('aponta o item recusado (base 0) e traduz o motivo', () => {
    expect(traduzirErroLote('LOTE_ITEM=2 SALDO_INSUFICIENTE: disponivel=3.000, solicitado=5')).toEqual({
      indice: 1,
      erro: 'Quantidade indisponível. Existem apenas 3 neste setor.',
    });
    expect(traduzirErroLote('LOTE_ITEM=1 PRODUTO_SEM_CUSTO').indice).toBe(0);
  });

  it('erro que não é de um item fica sem índice', () => {
    expect(traduzirErroLote('PERMISSION_DENIED: operacional:movimentacao:create')).toEqual({
      indice: null,
      erro: 'Você não tem permissão para registrar movimentações.',
    });
    expect(traduzirErroLote('LOTE_TAMANHO_INVALIDO: 51').erro).toMatch(/no máximo 50 itens/);
  });

  it('item malformado orienta a refazer o item', () => {
    expect(traduzirErroLote('LOTE_ITEM=3 LOTE_ITEM_INVALIDO')).toEqual({
      indice: 2,
      erro: 'Este item está incompleto. Remova-o e adicione de novo.',
    });
  });
});

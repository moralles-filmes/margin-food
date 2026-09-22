import { describe, it, expect } from 'vitest';
import {
  adicionarCodigo,
  diffCodigos,
  ROTULO_MAX,
  type CodigoBarrasProduto,
} from '@/domain/estoque/barcode';

describe('adicionarCodigo', () => {
  it('acrescenta um código válido à lista', () => {
    const r = adicionarCodigo([], '7891234567890', 'União');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lista).toEqual([{ codigo: '7891234567890', rotulo: 'União' }]);
  });

  it('normaliza o que o leitor injeta antes de guardar', () => {
    const r = adicionarCodigo([], '  789123 4567890\r\n', '');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lista[0].codigo).toBe('7891234567890');
  });

  it('preserva zero à esquerda — é outro produto sem ele', () => {
    const r = adicionarCodigo([], '0007894900011517', '');
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lista[0].codigo).toBe('0007894900011517');
  });

  it('aceita marcas diferentes do MESMO produto', () => {
    const um = adicionarCodigo([], '7891234567890', 'União');
    expect(um.ok).toBe(true);
    if (!um.ok) return;
    const dois = adicionarCodigo(um.lista, '7890000000017', 'Caravelas');
    expect(dois.ok).toBe(true);
    if (!dois.ok) return;
    expect(dois.lista.map(c => c.rotulo)).toEqual(['União', 'Caravelas']);
  });

  it('recusa o mesmo código duas vezes no próprio produto', () => {
    const um = adicionarCodigo([], '7891234567890', 'União');
    expect(um.ok).toBe(true);
    if (!um.ok) return;
    // Sem esta barreira o INSERT quebraria no índice único e a mensagem falaria
    // de "outro produto", quando o código já está ali na tela.
    const dois = adicionarCodigo(um.lista, '7891234567890', 'Caravelas');
    expect(dois.ok).toBe(false);
    if (dois.ok) return;
    expect(dois.erro).toContain('já está na lista');
  });

  it('recusa código inválido com a mensagem do domínio', () => {
    const curto = adicionarCodigo([], '12', '');
    expect(curto.ok).toBe(false);
    if (curto.ok) return;
    expect(curto.erro).toContain('curto');

    const vazio = adicionarCodigo([], '   ', '');
    expect(vazio.ok).toBe(false);
  });

  it('corta rótulo longo em vez de deixar o banco recusar', () => {
    const r = adicionarCodigo([], '7891234567890', 'x'.repeat(ROTULO_MAX + 20));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.lista[0].rotulo).toHaveLength(ROTULO_MAX);
  });

  it('não muta a lista recebida', () => {
    const original: CodigoBarrasProduto[] = [{ id: 'a', codigo: '7891234567890', rotulo: '' }];
    adicionarCodigo(original, '7890000000017', '');
    expect(original).toHaveLength(1);
  });
});

describe('diffCodigos', () => {
  const salvo = (id: string, codigo: string, rotulo = ''): CodigoBarrasProduto => ({ id, codigo, rotulo });
  const novo = (codigo: string, rotulo = ''): CodigoBarrasProduto => ({ codigo, rotulo });

  it('lista vazia de um lado e do outro não gera trabalho', () => {
    expect(diffCodigos([], [])).toEqual({ adicionar: [], remover: [] });
  });

  it('código novo entra em adicionar, sem id', () => {
    const d = diffCodigos([], [novo('7891234567890', 'União')]);
    expect(d.adicionar).toHaveLength(1);
    expect(d.adicionar[0].id).toBeUndefined();
    expect(d.remover).toEqual([]);
  });

  it('código retirado da lista entra em remover, pelo id', () => {
    const d = diffCodigos([salvo('row-1', '7891234567890')], []);
    expect(d.remover).toEqual(['row-1']);
    expect(d.adicionar).toEqual([]);
  });

  it('código intocado não é reescrito', () => {
    const atual = [salvo('row-1', '7891234567890', 'União')];
    const d = diffCodigos(atual, atual);
    expect(d).toEqual({ adicionar: [], remover: [] });
  });

  it('acrescentar uma marca preserva a que já existia', () => {
    const d = diffCodigos(
      [salvo('row-1', '7891234567890', 'União')],
      [salvo('row-1', '7891234567890', 'União'), novo('7890000000017', 'Caravelas')],
    );
    expect(d.remover).toEqual([]);
    expect(d.adicionar.map(c => c.codigo)).toEqual(['7890000000017']);
  });

  it('trocar o rótulo vira remover + adicionar — e o DELETE tem de vir antes', () => {
    // Quem aplica o diff roda DELETE antes de INSERT; na ordem inversa o INSERT
    // colidiria no índice único com a linha que ainda não foi apagada.
    const d = diffCodigos(
      [salvo('row-1', '7891234567890', 'Uniao')],
      [novo('7891234567890', 'União')],
    );
    expect(d.remover).toEqual(['row-1']);
    expect(d.adicionar.map(c => c.codigo)).toEqual(['7891234567890']);
  });

  it('troca completa de códigos remove os antigos e adiciona os novos', () => {
    const d = diffCodigos(
      [salvo('row-1', '7891234567890'), salvo('row-2', '7890000000017')],
      [novo('1234567890123')],
    );
    expect(d.remover.sort()).toEqual(['row-1', 'row-2']);
    expect(d.adicionar.map(c => c.codigo)).toEqual(['1234567890123']);
  });
});

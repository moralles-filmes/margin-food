import { describe, expect, it } from 'vitest';
import { chaveOperacao, chaveOperacaoUuid, jsonCanonico, novaSemente } from '@/lib/chaveOperacao';

describe('jsonCanonico', () => {
  it('não depende da ordem em que o objeto foi montado', () => {
    expect(jsonCanonico({ b: 1, a: { d: 2, c: 3 } })).toBe(jsonCanonico({ a: { c: 3, d: 2 }, b: 1 }));
  });

  it('mantém a ordem dos arrays — ela faz parte do conteúdo', () => {
    expect(jsonCanonico([1, 2])).not.toBe(jsonCanonico([2, 1]));
  });

  it('ignora undefined como o JSON.stringify, mas distingue null', () => {
    expect(jsonCanonico({ a: 1, b: undefined })).toBe(jsonCanonico({ a: 1 }));
    expect(jsonCanonico({ a: 1, b: null })).not.toBe(jsonCanonico({ a: 1 }));
  });
});

describe('chaveOperacao (chave derivada)', () => {
  const conteudo = { cotacao_id: 'c1', tipo: 'NEGOCIACAO', phone: '5511999999999', message: 'Olá' };

  it('repetir a mesma operação reaproveita a chave (retry não duplica)', async () => {
    expect(await chaveOperacao('s1', conteudo)).toBe(await chaveOperacao('s1', { ...conteudo }));
  });

  it('a ordem das chaves do objeto não muda a chave', async () => {
    const invertido = { message: 'Olá', phone: '5511999999999', tipo: 'NEGOCIACAO', cotacao_id: 'c1' };
    expect(await chaveOperacao('s1', invertido)).toBe(await chaveOperacao('s1', conteudo));
  });

  it('qualquer campo alterado gera chave nova sozinho', async () => {
    const base = await chaveOperacao('s1', conteudo);
    expect(await chaveOperacao('s1', { ...conteudo, message: 'Olá!' })).not.toBe(base);
    expect(await chaveOperacao('s1', { ...conteudo, phone: '5511888888888' })).not.toBe(base);
  });

  it('semente nova = operação nova, mesmo com o mesmo conteúdo', async () => {
    expect(await chaveOperacao('s2', conteudo)).not.toBe(await chaveOperacao('s1', conteudo));
  });

  it('cabe no índice: 64 caracteres hexadecimais', async () => {
    expect(await chaveOperacao('s1', conteudo)).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe('chaveOperacaoUuid', () => {
  it('é determinística e tem formato UUID (v8, variante RFC)', async () => {
    const a = await chaveOperacaoUuid('s1', { x: 1 });
    expect(a).toBe(await chaveOperacaoUuid('s1', { x: 1 }));
    expect(a).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-8[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(await chaveOperacaoUuid('s1', { x: 2 })).not.toBe(a);
  });
});

describe('novaSemente', () => {
  it('cada operação nova recebe uma semente diferente', () => {
    expect(novaSemente()).not.toBe(novaSemente());
  });
});

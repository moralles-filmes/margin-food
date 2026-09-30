import { describe, expect, it } from 'vitest';
import { chaveCriacaoEmpresa, digitosCnpj, mensagemErroCriacaoEmpresa } from './empresa';

describe('chaveCriacaoEmpresa', () => {
  it('o retry do mesmo cadastro reaproveita a chave', async () => {
    expect(await chaveCriacaoEmpresa('s1', { nome: 'Ren Sushi', cnpj: '12.345.678/0001-90' }))
      .toBe(await chaveCriacaoEmpresa('s1', { nome: 'Ren Sushi', cnpj: '12.345.678/0001-90' }));
  });

  it('CNPJ vale pelos dígitos e o nome sem espaços nas pontas — igual ao que o servidor compara', async () => {
    expect(await chaveCriacaoEmpresa('s1', { nome: '  Ren Sushi ', cnpj: '12345678000190' }))
      .toBe(await chaveCriacaoEmpresa('s1', { nome: 'Ren Sushi', cnpj: '12.345.678/0001-90' }));
  });

  it('outro nome ou outro CNPJ gera chave nova', async () => {
    const base = await chaveCriacaoEmpresa('s1', { nome: 'Ren Sushi', cnpj: null });
    expect(await chaveCriacaoEmpresa('s1', { nome: 'Ren Sushi 2', cnpj: null })).not.toBe(base);
    expect(await chaveCriacaoEmpresa('s1', { nome: 'Ren Sushi', cnpj: '1' })).not.toBe(base);
  });

  it('semente nova = cadastro novo', async () => {
    expect(await chaveCriacaoEmpresa('s2', { nome: 'X', cnpj: null }))
      .not.toBe(await chaveCriacaoEmpresa('s1', { nome: 'X', cnpj: null }));
  });
});

describe('digitosCnpj', () => {
  it('só dígitos; vazio vira null', () => {
    expect(digitosCnpj('12.345.678/0001-90')).toBe('12345678000190');
    expect(digitosCnpj(' - ')).toBeNull();
    expect(digitosCnpj(null)).toBeNull();
  });
});

describe('mensagemErroCriacaoEmpresa', () => {
  it('tira o prefixo HTTP do erro do banco', () => {
    expect(mensagemErroCriacaoEmpresa('409: CNPJ já cadastrado')).toBe('CNPJ já cadastrado');
  });

  it('chave reutilizada vira orientação, não código', () => {
    expect(mensagemErroCriacaoEmpresa('409: REQUEST_ID_REUTILIZADO')).toContain('confira a lista');
  });
});

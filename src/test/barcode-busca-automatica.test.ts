import { describe, expect, it } from 'vitest';
import { decidirBuscaAutomatica, gtinValido } from '@/domain/estoque/barcode';

describe('gtinValido', () => {
  it.each([
    ['7896116900029', true],   // EAN-13 real de produto cadastrado
    ['7891234567895', true],   // EAN-13
    ['78912342', true],        // EAN-8
    ['012345678905', true],    // UPC-A
    ['17891234567892', true],  // GTIN-14
    ['7891234567890', false],  // dígito verificador errado
    ['7891', false],           // curto
    ['INT-42', false],         // código interno
    ['789123456789', false],   // 12 dígitos com verificador errado
  ])('%s → %s', (codigo, esperado) => {
    expect(gtinValido(codigo)).toBe(esperado);
  });
});

describe('decidirBuscaAutomatica', () => {
  const codigos = new Set(['7891234567895', '78912342', '7891234200013', '0789000000011', 'INT-42', '7891']);

  it('código de barras padrão cadastrado busca na hora', () => {
    expect(decidirBuscaAutomatica('7891234567895', codigos)).toBe('agora');
  });

  it('código não cadastrado não busca sozinho', () => {
    expect(decidirBuscaAutomatica('7896116900029', codigos)).toBe('nao');
    expect(decidirBuscaAutomatica('789123', codigos)).toBe('nao');
  });

  it('código interno ou curto, mesmo cadastrado, não busca sozinho (pode ser começo de outro código sendo digitado)', () => {
    expect(decidirBuscaAutomatica('INT-42', codigos)).toBe('nao');
    expect(decidirBuscaAutomatica('7891', codigos)).toBe('nao');
  });

  it('campo vazio não busca', () => {
    expect(decidirBuscaAutomatica('', codigos)).toBe('nao');
    expect(decidirBuscaAutomatica('   ', codigos)).toBe('nao');
  });

  it('código cadastrado que é começo de outro cadastrado espera (a pessoa pode estar digitando)', () => {
    expect(decidirBuscaAutomatica('78912342', codigos)).toBe('aguardar');
  });

  it('normaliza espaço e sufixo de leitor antes de comparar', () => {
    expect(decidirBuscaAutomatica(' 7891234567895\r', codigos)).toBe('agora');
  });

  it('zero à esquerda é significativo', () => {
    expect(decidirBuscaAutomatica('789000000011', codigos)).toBe('nao');
    expect(decidirBuscaAutomatica('0789000000011', codigos)).toBe('agora');
  });
});

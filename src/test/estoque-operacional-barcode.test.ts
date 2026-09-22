import { describe, it, expect } from 'vitest';
import {
  ehLeituraDuplicada,
  JANELA_LEITURA_DUPLICADA_MS,
  mensagemBarcodeInvalido,
  normalizarBarcode,
  validarBarcode,
} from '@/domain/estoque/barcode';

describe('normalizarBarcode', () => {
  it('preserva zeros à esquerda', () => {
    expect(normalizarBarcode('0007894900011517')).toBe('0007894900011517');
  });

  it('remove espaços em volta e no meio (leitor HID injeta)', () => {
    expect(normalizarBarcode('  789123 4567890  ')).toBe('7891234567890');
  });

  it('remove sufixos de controle do leitor (tab, CR, LF)', () => {
    expect(normalizarBarcode('7891234567890\r\n')).toBe('7891234567890');
    expect(normalizarBarcode('7891234567890\t')).toBe('7891234567890');
  });

  it('não altera um código já limpo', () => {
    expect(normalizarBarcode('7891234567890')).toBe('7891234567890');
  });
});

describe('validarBarcode', () => {
  it('aceita EAN-13', () => {
    const r = validarBarcode('7891234567890');
    expect(r.valido).toBe(true);
    expect(r.codigo).toBe('7891234567890');
  });

  it('aceita GTIN-14 sem perder precisão — o código é string', () => {
    const r = validarBarcode('17891234567890');
    expect(r.valido).toBe(true);
    expect(r.codigo).toBe('17891234567890');
    // Number() destruiria a igualdade exata em códigos longos.
    expect(r.codigo).not.toBe(String(Number(r.codigo) - 1));
  });

  it('aceita código interno alfanumérico', () => {
    expect(validarBarcode('ABC-123_01.X').valido).toBe(true);
  });

  it('recusa vazio', () => {
    expect(validarBarcode('   ').motivo).toBe('vazio');
  });

  it('recusa código curto demais', () => {
    expect(validarBarcode('123').motivo).toBe('curto');
  });

  it('recusa código longo demais', () => {
    expect(validarBarcode('9'.repeat(65)).motivo).toBe('longo');
  });

  it('recusa caractere fora da faixa aceita pelo CHECK do banco', () => {
    expect(validarBarcode('789$%#123').motivo).toBe('caractere');
  });

  it('valida depois de normalizar, não antes', () => {
    // Com espaços, o texto cru tem 15 caracteres; o código real tem 13.
    expect(validarBarcode(' 789 123 456 7890 ').valido).toBe(true);
  });

  it('toda razão de recusa tem mensagem própria', () => {
    for (const motivo of ['vazio', 'curto', 'longo', 'caractere'] as const) {
      expect(mensagemBarcodeInvalido(motivo).length).toBeGreaterThan(10);
    }
  });
});

describe('ehLeituraDuplicada', () => {
  const agora = 1_000_000;

  it('detecta o repique do leitor dentro da janela', () => {
    expect(ehLeituraDuplicada('789', '789', agora - 200, agora)).toBe(true);
  });

  it('libera a mesma leitura depois da janela — repetir item é legítimo', () => {
    expect(
      ehLeituraDuplicada('789', '789', agora - JANELA_LEITURA_DUPLICADA_MS - 1, agora),
    ).toBe(false);
  });

  it('nunca bloqueia código diferente, por mais rápido que venha', () => {
    expect(ehLeituraDuplicada('789', '456', agora - 10, agora)).toBe(false);
  });

  it('a primeira leitura da sessão nunca é duplicada', () => {
    expect(ehLeituraDuplicada('789', null, null, agora)).toBe(false);
  });
});

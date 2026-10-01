import { describe, expect, it } from 'vitest';
import { validarCodigoPagamento, dadosPagamentoPayload, MAX_CODIGO_PAGAMENTO } from './codigoPagamento';

describe('dados opcionais de pagamento', () => {
  it('aceita registros antigos e remoção explícita', () => {
    expect(validarCodigoPagamento({})).toBeNull();
    expect(dadosPagamentoPayload({})).toEqual({ tipo: null, codigo: null });
    expect(validarCodigoPagamento({ tipo_codigo_pagamento: '', codigo_pagamento: '' })).toBeNull();
  });
  it.each([
    ['boleto', '34191.79001 01043.510047 91020.150008 5 99990000012500'],
    ['pix_chave', '+55 (14) 99999-1234'], ['pix_chave', 'financeiro+loja@example.com'],
    ['pix_chave', '123.456.789-09'], ['pix_chave', '12.345.678/0001-90'],
    ['pix_chave', 'f3b4d87f-f048-4e62-bc9a-fc6e31c46c5e'],
    ['pix_copia_cola', '000201' + 'BR.GOV.BCB.PIX'.repeat(200)],
    ['outro', '  Referência / 123-ABC\nsegunda linha  '],
  ])('preserva exatamente %s', (tipo, codigo) => {
    const dados = { tipo_codigo_pagamento: tipo, codigo_pagamento: codigo };
    expect(validarCodigoPagamento(dados)).toBeNull();
    expect(dadosPagamentoPayload(dados)).toEqual({ tipo, codigo });
  });
  it('recusa somente par incompleto, tipo desconhecido, vazio ou tamanho excessivo', () => {
    for (const dados of [
      { codigo_pagamento: '123' },
      { tipo_codigo_pagamento: 'inventado', codigo_pagamento: '123' },
      { tipo_codigo_pagamento: 'pix_chave', codigo_pagamento: ' \n\t' },
      { tipo_codigo_pagamento: 'pix_chave', codigo_pagamento: 'x'.repeat(MAX_CODIGO_PAGAMENTO + 1) },
    ]) expect(validarCodigoPagamento(dados)).toBeTruthy();
  });
});

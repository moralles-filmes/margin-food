export const TIPOS_CODIGO_PAGAMENTO = {
  boleto: 'Código de barras / boleto',
  pix_chave: 'Chave PIX',
  pix_copia_cola: 'PIX Copia e Cola',
  outro: 'Outro código de pagamento',
} as const;

export type TipoCodigoPagamento = keyof typeof TIPOS_CODIGO_PAGAMENTO;
export const MAX_CODIGO_PAGAMENTO = 8192;

export interface DadosCodigoPagamento {
  tipo_codigo_pagamento?: string | null;
  codigo_pagamento?: string | null;
}

/** Valida sem reformatar: o texto gravado é exatamente o texto copiado. */
export function validarCodigoPagamento(dados: DadosCodigoPagamento): string | null {
  const tipo = dados.tipo_codigo_pagamento;
  const codigo = dados.codigo_pagamento;
  if (!tipo && !codigo) return null;
  if (!tipo || !Object.prototype.hasOwnProperty.call(TIPOS_CODIGO_PAGAMENTO, tipo)) return 'Selecione o tipo do código de pagamento.';
  if (!codigo?.trim()) return 'Informe o código de pagamento ou escolha “Sem código”.';
  if (codigo.length > MAX_CODIGO_PAGAMENTO) return `O código deve ter até ${MAX_CODIGO_PAGAMENTO} caracteres.`;
  return null;
}

export function dadosPagamentoPayload(dados: DadosCodigoPagamento) {
  return { tipo: dados.tipo_codigo_pagamento || null, codigo: dados.codigo_pagamento || null };
}

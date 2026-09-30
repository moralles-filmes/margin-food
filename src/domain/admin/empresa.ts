/**
 * ─── Criação de empresa (`onboard_new_company`) ───
 *
 * A chave cobre o que o servidor compara no reenvio: nome sem espaços nas
 * pontas e os DÍGITOS do CNPJ (o índice único do banco também é pelos dígitos,
 * então "12.345.678/0001-90" e "12345678000190" são o mesmo cadastro). Semente,
 * derivação e o porquê: `@/lib/chaveOperacao`.
 */

import { chaveOperacao } from '@/lib/chaveOperacao';

export function digitosCnpj(cnpj: string | null | undefined): string | null {
  const digitos = (cnpj ?? '').replace(/\D/g, '');
  return digitos || null;
}

export function chaveCriacaoEmpresa(semente: string, dados: { nome: string; cnpj: string | null }): Promise<string> {
  return chaveOperacao(semente, {
    op: 'onboard_company',
    nome: dados.nome.trim(),
    cnpj: digitosCnpj(dados.cnpj),
  });
}

/** Mensagem para a tela a partir do erro de `onboard_new_company`. */
export function mensagemErroCriacaoEmpresa(mensagem: string | null | undefined): string {
  const texto = mensagem ?? '';
  if (texto.includes('REQUEST_ID_REUTILIZADO')) {
    return 'Este envio já criou outra empresa. Feche o formulário, confira a lista e cadastre de novo se precisar.';
  }
  return texto.replace(/^\d{3}:\s*/, '') || 'Erro ao criar empresa';
}

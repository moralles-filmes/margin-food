/**
 * Cadastros Base do Financeiro — recusas dos índices únicos (centro de custo
 * por nome, conta do plano por código, só entre ativos). Devolve `null` quando o
 * erro é outro, para a tela seguir com o tratamento dela.
 *
 * O reenvio de um cadastro que já foi gravado (resposta perdida, duas abas) cai
 * aqui também: a mensagem manda conferir a lista, que a tela recarrega.
 */
export function mensagemCadastroDuplicado(mensagem: string | undefined): string | null {
  const msg = mensagem ?? '';
  if (msg.includes('uq_fin_centros_custo_nome_ativo')) {
    return 'Já existe um centro de custo ativo com este nome. Confira a lista.';
  }
  if (msg.includes('uq_fin_plano_contas_codigo_ativo')) {
    return 'Já existe uma conta ativa com este código. Confira a lista.';
  }
  return null;
}

/**
 * ─── Prontuário: respostas do servidor ───
 *
 * A edição grava por `rh_atualizar_colaborador` (rh:prontuario:edit + view, ou
 * :manage; remuneração e usuário vinculado só :manage); desativar/reativar
 * segue pela tabela, só com :manage — a RLS de UPDATE devolve 0 linhas sem
 * erro para quem não pode, então a tela confere a linha devolvida.
 */

/** Mensagem para a tela a partir do erro de `rh_atualizar_colaborador`. */
export function mensagemErroEdicaoColaborador(mensagem: string | null | undefined): string {
  const texto = mensagem ?? '';
  if (texto.includes('PERMISSION_DENIED: rh:prontuario:manage')) {
    return 'Salário, valor/hora e usuário vinculado só podem ser alterados por quem gerencia o Prontuário.';
  }
  if (texto.includes('PERMISSION_DENIED')) return 'Você não tem permissão para editar colaboradores.';
  if (texto.includes('NOT_FOUND')) return 'Colaborador não encontrado nesta unidade.';
  if (texto.includes('NOME_OBRIGATORIO')) return 'Nome é obrigatório.';
  if (texto.includes('USUARIO_FORA_DA_UNIDADE')) return 'O usuário escolhido não tem acesso a esta unidade.';
  if (texto.includes('USUARIO_JA_VINCULADO') || texto.includes('uq_rh_colaboradores_company_user')) {
    return 'O usuário escolhido já está vinculado a outro colaborador.';
  }
  return 'Erro ao salvar: ' + (texto || 'falha desconhecida');
}

/**
 * ─── Prontuário: respostas do servidor ───
 *
 * A edição grava por `rh_atualizar_colaborador` (rh:prontuario:edit + view, ou
 * :manage; remuneração e usuário vinculado só :manage), com o updated_at lido
 * ao abrir como trava; desativar/reativar segue pela tabela, só com :manage —
 * a RLS de UPDATE devolve 0 linhas sem erro para quem não pode, então a tela
 * confere a linha devolvida (é a única coluna que a tabela deixa atualizar). Criar
 * com remuneração ou usuário vinculado também exige :manage, e ninguém vincula o
 * próprio usuário (outro gestor faz).
 */

const VINCULO_DUPLICADO = 'O usuário escolhido já está vinculado a outro colaborador.';
const VINCULO_PROPRIO = 'Vincular o próprio usuário a um colaborador precisa ser feito por outro gestor do Prontuário.';

/** Mensagem para a tela a partir do erro de `rh_atualizar_colaborador`. */
export function mensagemErroEdicaoColaborador(mensagem: string | null | undefined): string {
  const texto = mensagem ?? '';
  if (texto.includes('PERMISSION_DENIED: rh:prontuario:manage')) {
    return 'Salário, valor/hora e usuário vinculado só podem ser alterados por quem gerencia o Prontuário.';
  }
  if (texto.includes('VINCULO_PROPRIO')) return VINCULO_PROPRIO;
  if (texto.includes('PERMISSION_DENIED')) return 'Você não tem permissão para editar colaboradores.';
  if (texto.includes('OPTIMISTIC_LOCK_CONFLICT')) {
    return 'Outra pessoa alterou este colaborador enquanto você editava. Feche e abra de novo para ver os dados atuais.';
  }
  if (texto.includes('NOT_FOUND')) return 'Colaborador não encontrado nesta unidade.';
  if (texto.includes('NOME_OBRIGATORIO')) return 'Nome é obrigatório.';
  if (texto.includes('USUARIO_FORA_DA_UNIDADE')) return 'O usuário escolhido não tem acesso a esta unidade.';
  if (texto.includes('USUARIO_JA_VINCULADO') || texto.includes('uq_rh_colaboradores_company_user')) {
    return VINCULO_DUPLICADO;
  }
  return 'Erro ao salvar: ' + (texto || 'falha desconhecida');
}

/** Mensagem para a tela a partir do erro do INSERT em `rh_colaboradores`. */
export function mensagemErroCriacaoColaborador(mensagem: string | null | undefined): string {
  const texto = mensagem ?? '';
  if (texto.includes('uq_rh_colaboradores_company_user')) return VINCULO_DUPLICADO;
  if (texto.includes('row-level security')) {
    return 'Sem permissão para criar este colaborador. Salário, valor/hora e usuário vinculado exigem gerenciar o Prontuário; o usuário vinculado precisa ter acesso a esta unidade e não pode ser você.';
  }
  return 'Erro ao criar colaborador: ' + (texto || 'falha desconhecida');
}

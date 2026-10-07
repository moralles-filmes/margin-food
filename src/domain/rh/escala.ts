/**
 * ─── Escalas: respostas do servidor ───
 *
 * Toda escrita da escala passa pelas RPCs `rh_escala_*`: criar a semana exige
 * rh:escalas:create; turnos, publicação e trocas exigem rh:escalas:edit (sempre
 * com :view). A tabela não aceita escrita direta, e o custo projetado é
 * calculado na publicação, no servidor, conferindo os turnos que a tela mostrava.
 */

const MENSAGENS: Array<[string, string]> = [
  ['PERMISSION_DENIED: rh:escalas:create', 'Você não tem permissão para criar escalas.'],
  ['PERMISSION_DENIED', 'Você não tem permissão para alterar escalas.'],
  ['ESCALA_PUBLICADA', 'A escala já foi publicada e não pode mais ser alterada.'],
  ['ESCALA_ALTERADA', 'Outra pessoa alterou a escala enquanto você revisava. Confira os turnos recarregados e publique de novo.'],
  ['ESCALA_VAZIA', 'A escala não tem turnos para publicar.'],
  ['DIA_FORA_DA_SEMANA', 'O dia escolhido não pertence à semana da escala.'],
  ['COLABORADOR_INVALIDO', 'Colaborador não encontrado ou inativo nesta unidade.'],
  ['TURNO_DUPLICADO', 'Esse colaborador já tem um turno começando nesse horário no mesmo dia.'],
  ['TIPO_INVALIDO', 'Tipo de turno inválido.'],
  ['HORARIO_OBRIGATORIO', 'Informe o horário de início e de fim.'],
  ['HORARIO_INVALIDO', 'Turno de trabalho precisa ter início e fim diferentes.'],
  ['SEMANA_INVALIDA', 'A semana da escala precisa começar na segunda-feira.'],
  ['SETOR_OBRIGATORIO', 'Escolha o setor da escala.'],
  ['TROCA_JA_DECIDIDA', 'Essa troca de turno já foi decidida.'],
  ['NOT_FOUND', 'Registro não encontrado nesta unidade. A escala foi recarregada.'],
];

/** Mensagem para a tela a partir do erro de uma RPC `rh_escala_*`. */
export function mensagemErroEscala(mensagem: string | null | undefined): string {
  const texto = mensagem ?? '';
  const conhecida = MENSAGENS.find(([codigo]) => texto.includes(codigo));
  return conhecida ? conhecida[1] : 'Erro: ' + (texto || 'falha desconhecida');
}
